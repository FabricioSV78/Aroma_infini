import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router'
import { accountAdapter } from '../../services/account-adapter'
import {
  emptyAccountProfile,
  type AccountData,
  type AccountAddress,
  type AccountProfile,
} from '../../services/account-service'
import { AuthError, authErrorMessage } from '../../services/auth-errors'
import { AccountContext, type AccountContextValue } from './account-context'
import { useAuth } from '../auth/useAuth'

export function AccountProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { pathname } = useLocation()
  const dataRequired =
    pathname === '/cuenta' || pathname.startsWith('/cuenta/') ||
    pathname === '/checkout' || pathname.startsWith('/checkout/')
  const userId =
    auth.status === 'authenticated' && auth.session?.intent === 'account' && auth.session.user.role === 'customer'
      ? auth.session.user.id
      : null
  const currentUser = useRef(userId)
  // Public navigation needs only the verified identity for its account link.
  // Each new visit to account/checkout gets its own fresh owner-scoped read;
  // returning later cannot display an earlier visit as already verified.
  const requestScope = useMemo(() => ({ userId, dataRequired }), [userId, dataRequired])
  const [resolvedScope, setResolvedScope] = useState<object | null>(null)
  const [data, setData] = useState<AccountData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [errorOwner, setErrorOwner] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const owned = data?.userId === userId && resolvedScope === requestScope ? data : null
  useEffect(() => {
    currentUser.current = userId
    let live = true
    if (!userId || !dataRequired) return
    void accountAdapter
      .load(userId)
      .then((result) => {
        if (!live || currentUser.current !== userId) return
        if (
          result.userId !== userId ||
          result.orders.some((order) => order.userId !== userId)
        )
          throw new AuthError('permission')
        setData(structuredClone(result))
        setResolvedScope(requestScope)
        setStatus('ready')
        setError('')
      })
      .catch((reason) => {
        if (live && currentUser.current === userId) {
          setData(null)
          setResolvedScope(requestScope)
          setStatus('error')
          setError(authErrorMessage(reason))
          setErrorOwner(userId)
        }
      })
    return () => {
      live = false
    }
  }, [userId, revision, dataRequired, requestScope])
  const reload = useCallback(() => {
    setStatus('loading')
    setError('')
    setRevision((current) => current + 1)
  }, [])
  const updateProfile = useCallback(
    async (profile: AccountProfile) => {
      if (!userId) throw new AuthError('permission')
      const result = await accountAdapter.updateProfile(userId, profile)
      if (currentUser.current !== userId) return
      setData((current) =>
        current?.userId === userId ? { ...current, profile: result } : current,
      )
    },
    [userId],
  )
  const saveAddress = useCallback(
    async (address: AccountAddress) => {
      if (!userId) throw new AuthError('permission')
      const result = await accountAdapter.saveAddress(userId, address)
      if (currentUser.current !== userId) return
      setData((current) =>
        current?.userId === userId ? { ...current, address: result } : current,
      )
    },
    [userId],
  )
  const removeAddress = useCallback(async () => {
    if (!userId) throw new AuthError('permission')
    await accountAdapter.removeAddress(userId)
    if (currentUser.current !== userId) return
    setData((current) =>
      current?.userId === userId ? { ...current, address: null } : current,
    )
  }, [userId])
  const value = useMemo<AccountContextValue>(
    () => ({
      active: Boolean(userId),
      profile: owned?.profile ?? emptyAccountProfile(),
      address: owned?.address ?? null,
      orders: owned?.orders ?? [],
      ordersAvailable: owned?.ordersAvailable !== false,
      status: !userId || resolvedScope !== requestScope || (!owned && (status !== 'error' || errorOwner !== userId)) ? 'loading' : status,
      error: errorOwner === userId ? error : '',
      reload,
      updateProfile,
      saveAddress,
      removeAddress,
      // Guest checkout never fabricates ownership. A future order API associates
      // an authenticated user atomically; this only re-queries that user's data.
      addCheckoutOrder: () => {
        if (userId) reload()
      },
    }),
    [
      userId,
      owned,
      status,
      error,
      errorOwner,
      requestScope,
      resolvedScope,
      reload,
      updateProfile,
      saveAddress,
      removeAddress,
    ],
  )
  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  )
}
