import type {
  AccountAddress,
  AccountProfile,
  AccountRepository,
} from '../types/account'
import type { Json } from '../types/database.generated'
import type { DeliveryLocation } from '../types/commerce'
import { isDeliveryLocation } from '../domain/delivery-location'
import { AuthError } from './auth-errors'
import { mapSupabaseAuthError } from './supabase-auth-errors'
import { getSupabaseClient, requireSupabaseClient } from './supabase-client'
import { parseAccountOrder } from './order-response'
import { isRemoteCatalog } from './catalog-source'

type AccountClient = ReturnType<typeof requireSupabaseClient>
type JsonObject = { [key: string]: Json | undefined }

interface VerifiedOwner {
  client: AccountClient
  userId: string
  email: string
  token: string
}

function asObject(value: Json): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AuthError('service')
  return value
}

function stringField(value: JsonObject, field: string): string {
  const result = value[field]
  if (typeof result !== 'string') throw new AuthError('service')
  return result
}

function deliveryLocation(
  value: unknown,
  error: 'service' | 'validation',
): DeliveryLocation | null {
  if (value == null) return null
  if (!isDeliveryLocation(value)) throw new AuthError(error)
  return { latitude: value.latitude, longitude: value.longitude }
}

/** Keep provider/SQL details out of account screens. */
function checkRpcError(error: { code?: string } | null, status: number) {
  if (!error) return
  if (status === 429) throw new AuthError('rate-limit')
  if (
    status === 401 ||
    status === 403 ||
    ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error.code ?? '')
  )
    throw new AuthError('session')
  if (['22023', '22001', '22P02', '23502', '23514'].includes(error.code ?? ''))
    throw new AuthError('validation')
  throw new AuthError('network')
}

async function verifiedOwner(userId: string): Promise<VerifiedOwner> {
  const client = requireSupabaseClient()
  const { data: local, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw mapSupabaseAuthError(sessionError, 'session')
  if (!local.session || local.session.user.id !== userId)
    throw new AuthError('session')

  // getSession supplies the SDK's request token, not an authorization decision.
  // Supabase Auth verifies it before we trust the identity or canonical email.
  const token = local.session.access_token
  const { data: verified, error } = await client.auth.getUser(token)
  if (error) throw mapSupabaseAuthError(error, 'session')
  if (!verified.user || verified.user.id !== userId || !verified.user.email)
    throw new AuthError('session')
  await stillOwned(client, userId)
  return {
    client,
    token,
    userId,
    email: verified.user.email,
  }
}

async function stillOwned(client: AccountClient, userId: string) {
  const { data, error } = await client.auth.getSession()
  if (error) throw mapSupabaseAuthError(error, 'session')
  if (!data.session || data.session.user.id !== userId)
    throw new AuthError('session')
}

function profileFromDto(value: Json, owner: VerifiedOwner): AccountProfile {
  // Older Auth users may not yet have a profile. Empty fields invite completion;
  // they do not import metadata, match a local customer, or fabricate saved data.
  if (value === null)
    return {
      firstName: '',
      lastName: '',
      phone: '',
      email: owner.email,
    }
  const dto = asObject(value)
  if (dto.user_id !== owner.userId) throw new AuthError('session')
  return {
    firstName: stringField(dto, 'first_name'),
    lastName: stringField(dto, 'last_name'),
    phone: stringField(dto, 'phone'),
    email: owner.email,
  }
}

function addressFromDto(value: Json, userId: string): AccountAddress | null {
  if (value === null) return null
  const dto = asObject(value)
  if (dto.user_id !== userId) throw new AuthError('session')
  return {
    id: stringField(dto, 'id'),
    label: stringField(dto, 'label'),
    recipient: stringField(dto, 'recipient'),
    department: stringField(dto, 'department'),
    province: stringField(dto, 'province'),
    district: stringField(dto, 'district'),
    street: stringField(dto, 'street'),
    reference: stringField(dto, 'reference'),
    location: deliveryLocation(dto.location, 'service'),
  }
}

/** Real owner-scoped RPCs only; no fallback to the browser's commercial snapshot. */
export const accountAdapter: AccountRepository = {
  get configured() {
    return Boolean(getSupabaseClient())
  },
  async load(userId) {
    const owner = await verifiedOwner(userId)
    const [profileResult, addressResult, ordersResult] = await Promise.all([
      owner.client
        .rpc('get_profile')
        .setHeader('Authorization', `Bearer ${owner.token}`),
      owner.client
        .rpc('get_address')
        .setHeader('Authorization', `Bearer ${owner.token}`),
      isRemoteCatalog
        ? owner.client
            .rpc('customer_orders')
            .setHeader('Authorization', `Bearer ${owner.token}`)
        : Promise.resolve(null),
    ])
    const current = await verifiedOwner(userId)
    checkRpcError(profileResult.error, profileResult.status)
    checkRpcError(addressResult.error, addressResult.status)
    if (ordersResult) checkRpcError(ordersResult.error, ordersResult.status)
    if (
      ordersResult &&
      (!Array.isArray(ordersResult.data) || ordersResult.data.length > 10000)
    )
      throw new AuthError('service')
    return {
      userId,
      profile: profileFromDto(profileResult.data, current),
      address: addressFromDto(addressResult.data, userId),
      orders: ordersResult
        ? (ordersResult.data as Json[]).map((order) =>
            parseAccountOrder(order, owner.userId),
          )
        : [],
      ordersAvailable: Boolean(ordersResult),
    }
  },
  async updateProfile(userId, profile) {
    const owner = await verifiedOwner(userId)
    const email = profile.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('email')
    // Changing the login email is a separate, password-verified server action.
    // A profile form must never trigger Supabase's email-confirmation flow.
    if (email.toLowerCase() !== owner.email.toLowerCase())
      throw new AuthError('email-change')
    const result = await owner.client
      .rpc('update_profile', {
        p_first_name: profile.firstName.trim(),
        p_last_name: profile.lastName.trim(),
        p_phone: profile.phone.trim(),
      })
      // Pin this request to its verified actor. A sign-out/account switch while
      // the request is pending cannot redirect an old form's write to user B.
      .setHeader('Authorization', `Bearer ${owner.token}`)
    const current = await verifiedOwner(userId)
    checkRpcError(result.error, result.status)
    if (result.data === null) throw new AuthError('service')
    return profileFromDto(result.data, current)
  },
  async saveAddress(userId, address) {
    const location = deliveryLocation(address.location, 'validation')
    const owner = await verifiedOwner(userId)
    const result = await owner.client
      .rpc('save_address', {
        p_label: address.label.trim(),
        p_recipient: address.recipient.trim(),
        p_department: address.department.trim(),
        p_province: address.province.trim(),
        p_district: address.district.trim(),
        p_street: address.street.trim(),
        p_reference: address.reference.trim(),
        // Missing optional RPC arguments default to SQL NULL, including when
        // removing an existing pin; the generated SDK models these as optional.
        p_latitude: location?.latitude,
        p_longitude: location?.longitude,
      })
      .setHeader('Authorization', `Bearer ${owner.token}`)
    await verifiedOwner(userId)
    checkRpcError(result.error, result.status)
    const saved = addressFromDto(result.data, userId)
    if (!saved) throw new AuthError('service')
    return saved
  },
  async removeAddress(userId) {
    const owner = await verifiedOwner(userId)
    const result = await owner.client
      .rpc('remove_address')
      .setHeader('Authorization', `Bearer ${owner.token}`)
    await verifiedOwner(userId)
    checkRpcError(result.error, result.status)
  },
}
