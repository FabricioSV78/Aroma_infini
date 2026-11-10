/** Shared build/preflight boundary. Never include a rejected value in an error. */
export function privilegedPublicValue(name, value) {
  if (!value) return false
  if (
    /SERVICE_ROLE|SECRET|PASSWORD|ACCESS_TOKEN|ACCESS_KEY|SESSION_TOKEN|PRIVATE_KEY|DATABASE_URL/i.test(
      name,
    )
  )
    return true
  const normalized = value.trim()
  if (normalized.startsWith('sb_secret_')) return true
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(normalized))
    return true
  try {
    return (
      normalized.startsWith('eyJ') &&
      JSON.parse(Buffer.from(normalized.split('.')[1], 'base64url').toString())
        .role === 'service_role'
    )
  } catch {
    return false
  }
}
