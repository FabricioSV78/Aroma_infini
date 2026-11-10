import {
  parseComplaintReceipt,
  type ComplaintInput,
  type ComplaintReceipt,
  type ComplaintStatus,
} from '../domain/complaints'
import { mediaApiBaseUrl } from './asset-source'
import { requireSupabaseClient } from './supabase-client'
import { authService } from './auth-service'

export interface ComplaintOperation {
  operationId: string
  receiptSecret: string
}
export class ComplaintSubmissionError extends Error {
  constructor(
    message: string,
    readonly indeterminate: boolean,
  ) {
    super(message)
  }
}
export function createComplaintOperation(): ComplaintOperation {
  return {
    operationId: crypto.randomUUID(),
    receiptSecret: [...crypto.getRandomValues(new Uint8Array(32))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
  }
}
export async function submitComplaint(
  input: ComplaintInput,
  operation: ComplaintOperation,
  website = '',
): Promise<ComplaintReceipt> {
  const base = mediaApiBaseUrl()
  if (base === null)
    throw new Error('No pudimos conectar con el Libro de reclamaciones.')
  let response: Response
  try {
    response = await fetch(`${base}/api/complaints`, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...operation, input, website }),
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw new ComplaintSubmissionError(
      'No recibimos la confirmación. Conservamos los datos para reintentar el mismo registro sin duplicarlo.',
      true,
    )
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok)
    throw new ComplaintSubmissionError(
      response.status === 429
        ? 'Espera un momento antes de registrar otra solicitud.'
        : response.status === 409
          ? 'No pudimos confirmar este reintento. Conserva los datos y contacta con la tienda.'
          : 'No pudimos registrar tu solicitud. Tus datos siguen en el formulario; vuelve a intentar.',
      response.status >= 500 || response.status === 409,
    )
  try {
    return parseComplaintReceipt(body)
  } catch {
    throw new ComplaintSubmissionError(
      'No pudimos verificar la confirmación. Reintenta el mismo registro sin cambiar los datos.',
      true,
    )
  }
}
function currentAdminOwner() {
  const state = authService.getSnapshot()
  return state.status === 'authenticated' &&
    state.session?.user.role === 'admin' &&
    state.session.assurance === 'aal2' &&
    state.session.intent === 'account' &&
    !state.session.mfaRequired
    ? state.session.user.id
    : null
}
let owner = currentAdminOwner()
let sessionRevision = 0
let listRevision = 0
type ComplaintList = { items: ComplaintReceipt[]; total: number }
const pendingLists = new Map<string, Promise<ComplaintList>>()
function invalidateLists() {
  listRevision++
  pendingLists.clear()
}
authService.subscribe(() => {
  const next = currentAdminOwner()
  if (next !== owner) {
    owner = next
    sessionRevision++
    invalidateLists()
  }
})

async function verifiedAdmin() {
  const expectedOwner = currentAdminOwner()
  const expectedRevision = sessionRevision
  if (!expectedOwner)
    throw new Error(
      'Inicia sesión y completa la verificación de administración.',
    )
  const client = requireSupabaseClient()
  const { data, error } = await client.auth.getSession()
  if (
    error ||
    !data.session ||
    data.session.user.id !== expectedOwner ||
    currentAdminOwner() !== expectedOwner ||
    sessionRevision !== expectedRevision
  )
    throw new Error('Tu sesión cambió. Vuelve a iniciar sesión.')
  const token = data.session.access_token,
    userId = data.session.user.id
  return {
    client,
    token,
    revision: expectedRevision,
    async check() {
      const { data: latest, error } = await client.auth.getSession()
      if (
        error ||
        sessionRevision !== expectedRevision ||
        latest.session?.access_token !== token ||
        latest.session.user.id !== userId ||
        currentAdminOwner() !== userId
      )
        throw new Error('Tu sesión cambió. Vuelve a cargar.')
    },
  }
}
export const complaintsAdminService = {
  async list(page: number, status = '', search = '') {
    const actor = await verifiedAdmin()
    const revision = listRevision
    // Private data is shared only while the identical request is unfinished.
    const key = JSON.stringify([
      actor.token,
      actor.revision,
      revision,
      page,
      status,
      search,
    ])
    const pending = pendingLists.get(key)
    if (pending) {
      const value = await pending
      await actor.check()
      return value
    }
    const operation = (async (): Promise<ComplaintList> => {
      const response = await actor.client
        .rpc('admin_complaints', {
          p_page: page,
          p_limit: 20,
          p_status: status,
          p_search: search,
        })
        .setHeader('Authorization', `Bearer ${actor.token}`)
      await actor.check()
      if (revision !== listRevision)
        throw new Error(
          'El listado cambió. Vuelve a actualizar las solicitudes.',
        )
      if (response.error)
        throw new Error(
          'No pudimos cargar las solicitudes. Revisa tu sesión y vuelve a intentar.',
        )
      const source = response.data as {
        items?: unknown
        total?: unknown
        page?: unknown
      } | null
      if (
        !source ||
        !Array.isArray(source.items) ||
        source.items.length > 20 ||
        !Number.isSafeInteger(source.total) ||
        (source.total as number) < 0 ||
        source.page !== page
      )
        throw new Error('No pudimos verificar las solicitudes.')
      return {
        items: source.items.map(parseComplaintReceipt),
        total: source.total as number,
      }
    })().finally(() => {
      if (pendingLists.get(key) === operation) pendingLists.delete(key)
    })
    pendingLists.set(key, operation)
    return operation
  },
  async update(
    receipt: ComplaintReceipt,
    changes: {
      status: ComplaintStatus
      response: string
      responseChannel: ComplaintReceipt['responseChannel']
      responseDeliveredAt: string | null
      deliveryEvidence: string
    },
  ) {
    const actor = await verifiedAdmin()
    const response = await actor.client
      .rpc('admin_update_complaint', {
        p_id: receipt.id,
        p_expected_version: receipt.version,
        p_status: changes.status,
        p_response: changes.response,
        p_response_channel: changes.responseChannel,
        ...(changes.responseDeliveredAt
          ? { p_delivered_at: changes.responseDeliveredAt }
          : {}),
        p_delivery_evidence: changes.deliveryEvidence,
      })
      .setHeader('Authorization', `Bearer ${actor.token}`)
    await actor.check()
    if (response.error)
      throw new Error(
        response.error.code === 'PT409'
          ? 'Otra persona actualizó esta solicitud. Conserva tu respuesta y vuelve a cargar.'
          : 'Revisa la respuesta, el medio y la constancia de entrega.',
      )
    const confirmed = parseComplaintReceipt(response.data)
    invalidateLists()
    return confirmed
  },
}
