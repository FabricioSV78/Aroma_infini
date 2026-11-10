import { authService } from './auth-service'
import { requireSupabaseClient } from './supabase-client'
import { UserFacingError } from './admin-messages'
import { isRemoteCatalog } from './catalog-source'

export interface CustomerFavoritesSnapshot {
  ownerId: string | null
  productIds: readonly string[]
  version: number
  status: 'idle' | 'loading' | 'ready' | 'error'
  pendingIds: ReadonlySet<string>
  error: string
  writeError: string
}
interface Intent {
  productId: string
  selected: boolean
}
interface Actor {
  id: string
  generation: number
  token: string
}
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const emptyPending: ReadonlySet<string> = new Set<string>()
const empty = (): CustomerFavoritesSnapshot => ({
  ownerId: null,
  productIds: [],
  version: 0,
  status: 'idle',
  pendingIds: emptyPending,
  error: '',
  writeError: '',
})
let snapshot = empty()
const listeners = new Set<() => void>()
let generation = 0
let previousOwner: string | null = null
let watching = false
let initialized: Promise<void> | undefined
let loadedAt = -Infinity
let loadRequest: Promise<void> | undefined
let processor: symbol | undefined
const queue = new Map<string, Intent>()
let activeIntent: Intent | undefined
let failedIntent: Intent | undefined

export function parseCustomerFavorites(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('productIds' in value) ||
    !Array.isArray(value.productIds) ||
    value.productIds.length > 500 ||
    value.productIds.some((id) => typeof id !== 'string' || !uuid.test(id)) ||
    new Set(value.productIds).size !== value.productIds.length ||
    !('version' in value) ||
    typeof value.version !== 'number' ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0
  )
    throw new UserFacingError(
      'favorites-response',
      'No pudimos verificar tus favoritos. Vuelve a intentarlo.',
    )
  return { productIds: value.productIds as string[], version: value.version }
}
function owner() {
  const state = authService.getSnapshot()
  return state.status === 'authenticated' && state.session?.intent === 'account'
    ? state.session.user.id
    : null
}
function publish(next: CustomerFavoritesSnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}
function reset(nextOwner: string | null) {
  generation++
  loadedAt = -Infinity
  loadRequest = undefined
  processor = undefined
  queue.clear()
  activeIntent = undefined
  failedIntent = undefined
  publish({ ...empty(), ownerId: nextOwner })
}
function watchOwner() {
  if (watching || !isRemoteCatalog) return
  watching = true
  previousOwner = owner()
  authService.subscribe(() => {
    const nextOwner = owner()
    if (previousOwner === nextOwner) return
    previousOwner = nextOwner
    reset(nextOwner)
    if (nextOwner) void load().catch(() => {})
  })
}
function checkActor(actor: Actor) {
  if (generation !== actor.generation || owner() !== actor.id)
    throw new UserFacingError(
      'favorites-session',
      'Tu sesión cambió. Vuelve a abrir tus favoritos.',
    )
}
async function actor(): Promise<Actor> {
  const started = generation
  const id = owner()
  if (!id)
    throw new UserFacingError(
      'favorites-session',
      'Inicia sesión para guardar favoritos en tu cuenta.',
    )
  const client = requireSupabaseClient()
  const { data, error } = await client.auth.getSession()
  if (error || data.session?.user.id !== id)
    throw new UserFacingError(
      'favorites-session',
      'Tu sesión terminó. Inicia sesión de nuevo.',
    )
  const result = { id, generation: started, token: data.session.access_token }
  checkActor(result)
  const verified = await client.auth.getUser(result.token)
  checkActor(result)
  if (verified.error || verified.data.user?.id !== id)
    throw new UserFacingError(
      'favorites-session',
      'No pudimos verificar tu sesión. Inicia sesión de nuevo.',
    )
  return result
}
async function stillOwned(expected: Actor) {
  checkActor(expected)
  const { data, error } = await requireSupabaseClient().auth.getSession()
  checkActor(expected)
  if (error || data.session?.user.id !== expected.id)
    throw new UserFacingError(
      'favorites-session',
      'Tu sesión cambió. Vuelve a abrir tus favoritos.',
    )
}
function errorMessage(error: unknown) {
  return error instanceof UserFacingError
    ? error.message
    : 'No pudimos actualizar tus favoritos. Revisa tu conexión y vuelve a intentarlo.'
}
function canonical(value: unknown, expected: Actor) {
  const result = parseCustomerFavorites(value)
  checkActor(expected)
  // A focus read can finish after a newer write. Never roll the list back.
  if (snapshot.ownerId === expected.id && result.version < snapshot.version)
    return
  loadedAt = Date.now()
  publish({
    ...snapshot,
    ...result,
    ownerId: expected.id,
    status: 'ready',
    error: '',
  })
}
async function load(force = false): Promise<void> {
  if (!isRemoteCatalog) return
  watchOwner()
  initialized ??= authService.initialize()
  await initialized
  const id = owner()
  if (!id) return
  if (loadRequest) return loadRequest
  if (
    !force &&
    snapshot.ownerId === id &&
    snapshot.status === 'ready' &&
    Date.now() - loadedAt < 30000
  )
    return
  const epoch = generation
  publish({ ...snapshot, ownerId: id, status: 'loading', error: '' })
  const request = (async () => {
    try {
      const expected = await actor()
      const response = await requireSupabaseClient()
        .rpc('customer_favorites')
        .setHeader('Authorization', `Bearer ${expected.token}`)
        .abortSignal(AbortSignal.timeout(20000))
      await stillOwned(expected)
      if (response.error)
        throw new UserFacingError(
          'favorites-read',
          'No pudimos cargar tus favoritos. Revisa tu conexión y vuelve a intentarlo.',
        )
      canonical(response.data, expected)
    } catch (error) {
      if (epoch === generation && owner() === id)
        publish({ ...snapshot, status: 'error', error: errorMessage(error) })
      throw error
    } finally {
      if (epoch === generation) loadRequest = undefined
    }
  })()
  loadRequest = request
  return request
}
function updatePending() {
  publish({
    ...snapshot,
    pendingIds: new Set([
      ...queue.keys(),
      ...(activeIntent ? [activeIntent.productId] : []),
    ]),
  })
}
async function processQueue() {
  if (processor) return
  const token = Symbol('favorites-operation')
  processor = token
  const epoch = generation
  try {
    while (queue.size && epoch === generation) {
      const intent = queue.values().next().value!
      queue.delete(intent.productId)
      activeIntent = intent
      updatePending()
      try {
        const expected = await actor()
        const response = await requireSupabaseClient()
          .rpc('set_customer_favorite', {
            p_product_id: intent.productId,
            p_selected: intent.selected,
            p_expected_version: snapshot.version,
          })
          .setHeader('Authorization', `Bearer ${expected.token}`)
          .abortSignal(AbortSignal.timeout(20000))
        await stillOwned(expected)
        if (response.error?.code === 'PT409') {
          await load(true)
          checkActor(expected)
          if (
            snapshot.productIds.includes(intent.productId) === intent.selected
          )
            continue
          throw new UserFacingError(
            'favorites-conflict',
            'Tu selección cambió en otro dispositivo. Revisa la lista y vuelve a intentar.',
          )
        }
        if (response.error) {
          const message =
            response.error.code === '22023'
              ? 'Este producto no está disponible para guardarlo. Actualiza la tienda y vuelve a intentar.'
              : response.error.code === '54000'
                ? 'Puedes guardar hasta 500 favoritos. Retira alguno antes de añadir otro.'
                : 'No pudimos guardar el cambio. Conservamos tus favoritos para volver a intentarlo.'
          throw new UserFacingError('favorites-write', message)
        }
        const confirmed = parseCustomerFavorites(response.data)
        if (confirmed.productIds.includes(intent.productId) !== intent.selected)
          throw new UserFacingError(
            'favorites-response',
            'No pudimos verificar el cambio. Vuelve a consultar el mismo intento.',
          )
        canonical(confirmed, expected)
      } catch (error) {
        if (epoch !== generation) return
        failedIntent = intent
        // Stop queued writes until the user reviews the error; no silent
        // partial batch of clicks is presented as fully saved.
        queue.clear()
        publish({ ...snapshot, writeError: errorMessage(error) })
      } finally {
        if (epoch === generation) {
          activeIntent = undefined
          updatePending()
        }
      }
    }
  } finally {
    if (processor === token) processor = undefined
  }
}
function setFavorite(productId: string, selected: boolean) {
  watchOwner()
  if (!uuid.test(productId) || !owner() || snapshot.status !== 'ready') return
  if (activeIntent?.productId === productId || queue.has(productId)) return
  if (snapshot.productIds.includes(productId) === selected) return
  failedIntent = undefined
  publish({ ...snapshot, writeError: '' })
  queue.set(productId, { productId, selected })
  updatePending()
  void processQueue()
}
export const customerFavoritesService = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    watchOwner()
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  load,
  setFavorite,
  retry() {
    const intent = failedIntent
    failedIntent = undefined
    publish({ ...snapshot, writeError: '' })
    if (intent) {
      // A lost response may already have committed. Send the same desired
      // state; never invert it or replace the complete collection.
      queue.set(intent.productId, intent)
      updatePending()
      void processQueue()
    } else void load(true).catch(() => {})
  },
  dismissError() {
    failedIntent = undefined
    publish({ ...snapshot, writeError: '' })
  },
}
