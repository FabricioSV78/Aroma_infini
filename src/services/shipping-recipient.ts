export interface AlternateRecipient {
  name: string
  dni: string
}

export function isValidAlternateRecipient(recipient: AlternateRecipient) {
  return (
    recipient.name.trim().length >= 2 &&
    recipient.name.trim().length <= 100 &&
    /^\d{8}$/.test(recipient.dni.trim())
  )
}
