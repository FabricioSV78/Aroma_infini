// Un mensaje solo se prepara cuando hay un destinatario válido y texto real.
export function buildWhatsAppUrl(
  phone: string | null,
  message?: string,
): string | null {
  if (!phone) return null
  const number = phone.replace(/[+\s().-]/g, '')
  if (!/^[1-9]\d{7,14}$/.test(number)) return null

  const base = `https://wa.me/${number}`
  if (message === undefined) return base
  const draft = message.trim()
  return draft ? `${base}?text=${encodeURIComponent(draft)}` : null
}
