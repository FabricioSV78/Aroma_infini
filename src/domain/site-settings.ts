export interface SiteSettings {
  demonstration: boolean
  business: { name: string; legalName: string; taxId: string; address: string }
  contact: { whatsapp: string; email: string; hours: string }
  social: { instagram: string; facebook: string; tiktok: string }
  policies: { privacy: string; terms: string; returns: string }
}
export interface SiteSettingsDocument {
  version: number
  data: SiteSettings
}

/** Exact platform hosts prevent deceptive domains and unsafe link protocols. */
export function socialProfileUrl(
  network: keyof SiteSettings['social'],
  value: string,
): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const hosts = {
      instagram: ['instagram.com', 'www.instagram.com'],
      facebook: ['facebook.com', 'www.facebook.com', 'fb.com', 'www.fb.com'],
      tiktok: ['tiktok.com', 'www.tiktok.com'],
    }[network]
    if (
      url.protocol !== 'https:' ||
      !hosts.includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !value.startsWith(`https://${url.hostname}/`)
    )
      return null
    return value
  } catch {
    return null
  }
}

/** Explicit staging examples; production content remains an administrator decision. */
export function defaultSiteSettings(): SiteSettings {
  return {
    demonstration: true,
    business: {
      name: 'Aroma Infini',
      legalName: 'Aroma Infini — datos de demostración',
      taxId: '',
      address: 'Dirección de demostración, Lima, Perú',
    },
    contact: {
      whatsapp: '51955565209',
      email: 'contacto@aromainfini.example',
      hours: 'Lunes a sábado, de 9:00 a 18:00 · horario de ejemplo',
    },
    social: { instagram: '', facebook: '', tiktok: '' },
    policies: {
      privacy:
        'Información de demostración, editable por el titular.\n\nDatos que proporcionas\nLa tienda utiliza tus datos de contacto y entrega para gestionar tu cuenta, atender pedidos y responder consultas. El perfil, las direcciones, los favoritos de cuenta y el historial se asocian a tu usuario.\n\nTus preferencias\nEl carrito y los favoritos de invitado se conservan en tu navegador. Los favoritos de cuenta se guardan asociados a tu usuario. Las reseñas que publiques muestran tu nombre abreviado y el contenido que escribas.\n\nAtención y derechos\nPuedes solicitar información, corrección o eliminación de tus datos a través del contacto de la tienda. Los registros que deban conservarse por obligaciones aplicables se revisan separadamente. El titular deberá completar sus datos y aprobar esta política antes de una publicación comercial.',
      terms:
        'Condiciones de demostración, editables por el titular.\n\nProductos y precios\nCada ficha muestra las presentaciones, el precio y la disponibilidad. Los descuentos se calculan por presentación y sólo se aplican mientras estén vigentes.\n\nPedido y entrega\nAntes de confirmar puedes revisar tus artículos, el destino, la modalidad, el costo de envío y el total. Las tarifas y los plazos disponibles se consultan en Envíos y entregas.\n\nPagos\nDurante las pruebas no se realizan cobros. La habilitación comercial depende de la integración y verificación de Mercado Pago.\n\nAtención\nPuedes consultar sobre tu pedido mediante el canal de contacto y presentar una queja o reclamo en el Libro de reclamaciones. El titular deberá aprobar estas condiciones antes de habilitar compras reales.',
      returns:
        'Política de demostración, editable por el titular.\n\nSolicitar atención\nComunícate con la tienda e indica tu pedido, el producto y el motivo de la consulta. Conserva el producto y su presentación para facilitar la revisión.\n\nRevisión del caso\nEl equipo revisará la información y comunicará las opciones aplicables. Esta información de prueba no limita derechos del consumidor ni fija condiciones comerciales definitivas. El titular debe completar los supuestos, plazos y procedimiento antes del lanzamiento.',
    },
  }
}

const keys = (value: Record<string, unknown>, expected: string[]) => {
  if (Object.keys(value).sort().join(',') !== expected.sort().join(','))
    throw new Error('site-settings')
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('site-settings')
  return value as Record<string, unknown>
}
function text(value: unknown, limit: number) {
  if (
    typeof value !== 'string' ||
    value.length > limit ||
    [...value].some((character) => {
      const code = character.charCodeAt(0)
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127
    })
  )
    throw new Error('site-settings')
  return value
}
export function parseSiteSettingsDocument(
  value: unknown,
): SiteSettingsDocument {
  const envelope = object(value)
  if (
    !Number.isSafeInteger(envelope.version) ||
    (envelope.version as number) < 0
  )
    throw new Error('site-settings')
  const source = object(envelope.data)
  keys(source, ['demonstration', 'business', 'contact', 'social', 'policies'])
  if (typeof source.demonstration !== 'boolean')
    throw new Error('site-settings')
  const business = object(source.business),
    contact = object(source.contact),
    social = object(source.social),
    policies = object(source.policies)
  keys(business, ['name', 'legalName', 'taxId', 'address'])
  keys(contact, ['whatsapp', 'email', 'hours'])
  keys(social, ['instagram', 'facebook', 'tiktok'])
  keys(policies, ['privacy', 'terms', 'returns'])
  const data: SiteSettings = {
    demonstration: source.demonstration,
    business: {
      name: text(business.name, 160),
      legalName: text(business.legalName, 240),
      taxId: text(business.taxId, 11),
      address: text(business.address, 500),
    },
    contact: {
      whatsapp: text(contact.whatsapp, 15),
      email: text(contact.email, 254),
      hours: text(contact.hours, 240),
    },
    social: {
      instagram: text(social.instagram, 500),
      facebook: text(social.facebook, 500),
      tiktok: text(social.tiktok, 500),
    },
    policies: {
      privacy: text(policies.privacy, 12000),
      terms: text(policies.terms, 12000),
      returns: text(policies.returns, 12000),
    },
  }
  if (Object.keys(validateSiteSettings(data)).length)
    throw new Error('site-settings')
  return { version: envelope.version as number, data }
}

export function validateSiteSettings(
  data: SiteSettings,
): Record<string, string> {
  const errors: Record<string, string> = {}
  const required: Array<[string, string]> = [
    ['business.name', data.business.name],
    ['business.legalName', data.business.legalName],
    ['business.address', data.business.address],
    ['policies.privacy', data.policies.privacy],
    ['policies.terms', data.policies.terms],
    ['policies.returns', data.policies.returns],
  ]
  for (const [field, value] of required)
    if (!value.trim()) errors[field] = 'Completa este campo.'
  if (data.business.taxId && !/^\d{11}$/.test(data.business.taxId))
    errors['business.taxId'] = 'Escribe los 11 dígitos del RUC.'
  if (!data.demonstration && !data.business.taxId)
    errors['business.taxId'] = 'Completa el RUC del titular.'
  if (data.contact.whatsapp && !/^[1-9]\d{7,14}$/.test(data.contact.whatsapp))
    errors['contact.whatsapp'] =
      'Usa el código de país y el número, sin espacios.'
  if (
    data.contact.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact.email)
  )
    errors['contact.email'] = 'Escribe un correo válido.'
  if (
    !data.demonstration &&
    (!data.contact.email || /\.example$/i.test(data.contact.email))
  )
    errors['contact.email'] = 'Indica el correo real de atención.'
  for (const network of ['instagram', 'facebook', 'tiktok'] as const) {
    const value = data.social[network]
    if (value && !socialProfileUrl(network, value))
      errors[`social.${network}`] = 'Usa la URL HTTPS del perfil oficial.'
  }
  return errors
}
