import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  FavoritesContext,
  type FavoritesContextValue,
} from './favorites-context'
import {
  isFavoritesStorageEvent,
  parseStoredFavorites,
  readFavorites,
  writeFavorites,
} from './favorites-storage'
import { customerFavoritesService } from '../../services/customer-favorites-service'
import { isRemoteCatalog } from '../../services/catalog-source'
import { useAuth } from '../auth/useAuth'
import { loadSelectionProducts } from '../../services/selection-catalog-service'
import { Dialog } from '../../components/ui/Dialog'

const noIds: readonly string[] = []
const noPending: ReadonlySet<string> = new Set<string>()

interface FavoriteState {
  ids: string[]
  persistence: 'local' | 'session'
}

function readInitialState(): FavoriteState {
  try {
    return { ids: readFavorites(), persistence: 'local' }
  } catch {
    return { ids: [], persistence: 'session' }
  }
}

function nextFavoriteState(
  current: FavoriteState,
  ids: string[],
): FavoriteState {
  return { ...current, ids }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FavoriteState>(readInitialState)
  const auth = useAuth()
  const remote = useSyncExternalStore(
    customerFavoritesService.subscribe,
    customerFavoritesService.getSnapshot,
  )
  const signedOwner =
    isRemoteCatalog &&
    auth.status === 'authenticated' &&
    auth.session?.intent === 'account'
      ? auth.session.user.id
      : null
  const ownSnapshot = Boolean(signedOwner && remote.ownerId === signedOwner)
  const customerIds = ownSnapshot ? remote.productIds : noIds
  const hydrationKey = JSON.stringify([signedOwner, customerIds])
  const [hydration, setHydration] = useState({ key: '', error: '' })
  const [hydrationAttempt, retryHydration] = useState(0)
  useEffect(() => {
    if (
      signedOwner &&
      customerFavoritesService.getSnapshot().status !== 'error'
    )
      void customerFavoritesService.load().catch(() => {})
  }, [signedOwner])
  useEffect(() => {
    if (!signedOwner) return
    const refresh = () => {
      if (document.visibilityState === 'visible')
        void customerFavoritesService.load(true).catch(() => {})
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [signedOwner])
  useEffect(() => {
    if (!signedOwner || !customerIds.length) return
    let active = true
    void loadSelectionProducts('favorites', [...customerIds])
      .then(() => {
        if (active) setHydration({ key: hydrationKey, error: '' })
      })
      .catch(() => {
        if (active)
          setHydration({
            key: hydrationKey,
            error:
              'No pudimos cargar los productos de tus favoritos. Vuelve a intentarlo.',
          })
      })
    return () => {
      active = false
    }
  }, [signedOwner, customerIds, hydrationKey, hydrationAttempt])
  const refreshFavorites = useCallback(() => {
    retryHydration((value) => value + 1)
    void customerFavoritesService.load(true).catch(() => {})
  }, [])

  useEffect(function synchronizeFavorites() {
    function handleStorage(event: StorageEvent) {
      if (!isFavoritesStorageEvent(event)) return
      setState((current) => ({
        ...current,
        ids: parseStoredFavorites(event.newValue),
      }))
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  useEffect(
    function persistFavorites() {
      if (state.persistence === 'session') return
      let fallbackTimer: number | undefined
      try {
        writeFavorites(state.ids)
      } catch {
        fallbackTimer = window.setTimeout(() => {
          setState((current) => ({ ...current, persistence: 'session' }))
        }, 0)
      }
      return () => window.clearTimeout(fallbackTimer)
    },
    [state.ids, state.persistence],
  )

  const toggleFavorite = useCallback(
    (id: string) => {
      if (signedOwner) {
        customerFavoritesService.setFavorite(
          id,
          !customerFavoritesService.getSnapshot().productIds.includes(id),
        )
        return
      }
      if (isRemoteCatalog && auth.status === 'checking') return
      setState((current) => {
        const ids = current.ids.includes(id)
          ? current.ids.filter((favoriteId) => favoriteId !== id)
          : [...current.ids, id]
        return nextFavoriteState(current, ids)
      })
    },
    [signedOwner, auth.status],
  )

  const removeFavorite = useCallback(
    (id: string) => {
      if (signedOwner) {
        customerFavoritesService.setFavorite(id, false)
        return
      }
      if (isRemoteCatalog && auth.status === 'checking') return
      setState((current) =>
        nextFavoriteState(
          current,
          current.ids.filter((favoriteId) => favoriteId !== id),
        ),
      )
    },
    [signedOwner, auth.status],
  )

  const value = useMemo<FavoritesContextValue>(() => {
    const authChecking = isRemoteCatalog && auth.status === 'checking'
    const favoriteIds = new Set(
      signedOwner ? customerIds : authChecking ? noIds : state.ids,
    )
    const catalogError = hydration.key === hydrationKey ? hydration.error : ''
    return {
      favoriteIds,
      favoriteCount: favoriteIds.size,
      persistence: signedOwner ? ('account' as const) : state.persistence,
      loading:
        authChecking ||
        Boolean(
          signedOwner &&
          (!ownSnapshot ||
            remote.status === 'idle' ||
            remote.status === 'loading' ||
            (customerIds.length > 0 && hydration.key !== hydrationKey)),
        ),
      pendingIds: ownSnapshot ? remote.pendingIds : noPending,
      error: ownSnapshot ? remote.error || catalogError : '',
      refreshFavorites,
      toggleFavorite,
      removeFavorite,
    }
  }, [
    removeFavorite,
    state.ids,
    state.persistence,
    toggleFavorite,
    signedOwner,
    customerIds,
    remote,
    ownSnapshot,
    auth.status,
    hydration,
    hydrationKey,
    refreshFavorites,
  ])

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      <Dialog
        open={ownSnapshot && Boolean(remote.writeError)}
        onClose={customerFavoritesService.dismissError}
        title="No se pudieron actualizar tus favoritos"
        id="favorites-update-error"
        descriptionId="favorites-update-error-description"
      >
        <p id="favorites-update-error-description" role="alert">
          {remote.writeError}
        </p>
        <div className="account-form-actions">
          <button
            className="button button--primary"
            type="button"
            onClick={customerFavoritesService.retry}
          >
            Volver a intentar
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={customerFavoritesService.dismissError}
          >
            Cerrar
          </button>
        </div>
      </Dialog>
    </FavoritesContext.Provider>
  )
}
