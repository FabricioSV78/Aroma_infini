export type ComplaintStatus = 'received' | 'reviewing' | 'responded'
export interface ComplaintInput {
  kind: 'claim' | 'complaint'
  consumer: {
    name: string
    documentType: 'DNI' | 'CE' | 'PASSPORT'
    documentNumber: string
    email: string
    phone: string
    address: string
    minor: boolean
    guardianName: string
    guardianDocument: string
  }
  purchase: {
    kind: 'product' | 'service'
    description: string
    amountCents: number
    orderReference: string
  }
  detail: string
  request: string
}
export interface ComplaintReceipt {
  id: string
  reference: string
  submittedAt: string
  input: ComplaintInput
  provider: { name: string; legalName: string; taxId: string; address: string }
  demonstration: boolean
  status: ComplaintStatus
  response: string
  responseChannel: '' | 'letter' | 'email-manual'
  responseDeliveredAt: string | null
  deliveryEvidence: string
  version: number
  history: Array<{
    at: string
    previous: ComplaintStatus | null
    next: ComplaintStatus
    actorId: string | null
  }>
}
export const complaintStatusLabels: Record<ComplaintStatus, string> = {
  received: 'Recibido',
  reviewing: 'En atención',
  responded: 'Respondido',
}
export function emptyComplaint(): ComplaintInput {
  return {
    kind: 'claim',
    consumer: {
      name: '',
      documentType: 'DNI',
      documentNumber: '',
      email: '',
      phone: '',
      address: '',
      minor: false,
      guardianName: '',
      guardianDocument: '',
    },
    purchase: {
      kind: 'product',
      description: '',
      amountCents: 0,
      orderReference: '',
    },
    detail: '',
    request: '',
  }
}
export function validateComplaint(
  input: ComplaintInput,
): Record<string, string> {
  const errors: Record<string, string> = {}
  const texts: Array<[string, string, number]> = [
    ['consumer.name', input.consumer.name, 240],
    ['consumer.documentNumber', input.consumer.documentNumber, 30],
    ['consumer.email', input.consumer.email, 254],
    ['consumer.phone', input.consumer.phone, 30],
    ['consumer.address', input.consumer.address, 500],
    ['purchase.description', input.purchase.description, 2000],
    ['detail', input.detail, 6000],
    ['request', input.request, 4000],
  ]
  if (input.consumer.minor)
    texts.push(
      ['consumer.guardianName', input.consumer.guardianName, 240],
      ['consumer.guardianDocument', input.consumer.guardianDocument, 60],
    )
  for (const [key, value, maximum] of texts) {
    if (!value.trim()) errors[key] = 'Completa este campo.'
    else if (value.length > maximum)
      errors[key] = `Usa hasta ${maximum} caracteres.`
    else if (
      [...value].some(
        (character) =>
          character.charCodeAt(0) < 32 &&
          ![9, 10, 13].includes(character.charCodeAt(0)),
      )
    )
      errors[key] = 'Revisa los caracteres ingresados.'
  }
  if (
    input.consumer.documentType === 'DNI' &&
    !/^\d{8}$/.test(input.consumer.documentNumber)
  )
    errors['consumer.documentNumber'] = 'Escribe los 8 dígitos del DNI.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.consumer.email))
    errors['consumer.email'] = 'Escribe un correo válido.'
  if (!/^[+()\d\s-]{7,30}$/.test(input.consumer.phone))
    errors['consumer.phone'] = 'Escribe un teléfono válido.'
  if (
    !Number.isSafeInteger(input.purchase.amountCents) ||
    input.purchase.amountCents < 0 ||
    input.purchase.amountCents > 100000000
  )
    errors['purchase.amountCents'] = 'Revisa el monto en soles.'
  if (input.purchase.orderReference.length > 80)
    errors['purchase.orderReference'] = 'Usa hasta 80 caracteres.'
  return errors
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('complaint-response')
  return value as Record<string, unknown>
}
function string(value: unknown, maximum = 10000) {
  if (typeof value !== 'string' || value.length > maximum)
    throw new Error('complaint-response')
  return value
}
export function parseComplaintInput(value: unknown): ComplaintInput {
  const source = record(value),
    consumer = record(source.consumer),
    purchase = record(source.purchase)
  if (
    !['claim', 'complaint'].includes(String(source.kind)) ||
    !['DNI', 'CE', 'PASSPORT'].includes(String(consumer.documentType)) ||
    !['product', 'service'].includes(String(purchase.kind)) ||
    typeof consumer.minor !== 'boolean' ||
    typeof purchase.amountCents !== 'number'
  )
    throw new Error('complaint-response')
  const result: ComplaintInput = {
    kind: source.kind === 'claim' ? 'claim' : 'complaint',
    consumer: {
      name: string(consumer.name, 240),
      documentType:
        consumer.documentType as ComplaintInput['consumer']['documentType'],
      documentNumber: string(consumer.documentNumber, 30),
      email: string(consumer.email, 254),
      phone: string(consumer.phone, 30),
      address: string(consumer.address, 500),
      minor: consumer.minor,
      guardianName: string(consumer.guardianName, 240),
      guardianDocument: string(consumer.guardianDocument, 60),
    },
    purchase: {
      kind: purchase.kind === 'product' ? 'product' : 'service',
      description: string(purchase.description, 2000),
      amountCents: purchase.amountCents,
      orderReference: string(purchase.orderReference, 80),
    },
    detail: string(source.detail, 6000),
    request: string(source.request, 4000),
  }
  if (Object.keys(validateComplaint(result)).length)
    throw new Error('complaint-response')
  return result
}
export function parseComplaintReceipt(value: unknown): ComplaintReceipt {
  const source = record(value),
    provider = record(source.provider)
  if (
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(String(source.id)) ||
    !/^LR-\d{4}-\d{6,12}$/.test(String(source.reference)) ||
    !Number.isFinite(Date.parse(String(source.submittedAt))) ||
    !['received', 'reviewing', 'responded'].includes(String(source.status)) ||
    typeof source.demonstration !== 'boolean' ||
    !Number.isSafeInteger(source.version) ||
    (source.version as number) < 1 ||
    !Array.isArray(source.history) ||
    source.history.length > 1000 ||
    !['', 'letter', 'email-manual'].includes(String(source.responseChannel))
  )
    throw new Error('complaint-response')
  if (
    source.responseDeliveredAt !== null &&
    !Number.isFinite(Date.parse(String(source.responseDeliveredAt)))
  )
    throw new Error('complaint-response')
  if (
    source.status === 'responded' &&
    (typeof source.response !== 'string' ||
      !source.response.trim() ||
      !['letter', 'email-manual'].includes(String(source.responseChannel)) ||
      source.responseDeliveredAt === null ||
      Date.parse(String(source.responseDeliveredAt)) <
        Date.parse(String(source.submittedAt)) ||
      typeof source.deliveryEvidence !== 'string' ||
      !source.deliveryEvidence.trim())
  )
    throw new Error('complaint-response')
  return {
    id: string(source.id, 36),
    reference: string(source.reference, 40),
    submittedAt: string(source.submittedAt, 64),
    input: parseComplaintInput(source.input),
    provider: {
      name: string(provider.name, 160),
      legalName: string(provider.legalName, 240),
      taxId: string(provider.taxId, 11),
      address: string(provider.address, 500),
    },
    demonstration: source.demonstration,
    status: source.status as ComplaintStatus,
    response: string(source.response),
    responseChannel:
      source.responseChannel as ComplaintReceipt['responseChannel'],
    responseDeliveredAt:
      source.responseDeliveredAt === null
        ? null
        : string(source.responseDeliveredAt, 64),
    deliveryEvidence: string(source.deliveryEvidence, 1000),
    version: source.version as number,
    history: source.history.map((item) => {
      const history = record(item)
      if (
        !Number.isFinite(Date.parse(String(history.at))) ||
        !['received', 'reviewing', 'responded'].includes(
          String(history.next),
        ) ||
        (history.previous !== null &&
          !['received', 'reviewing', 'responded'].includes(
            String(history.previous),
          ))
      )
        throw new Error('complaint-history')
      return {
        at: string(history.at, 64),
        previous: history.previous as ComplaintStatus | null,
        next: history.next as ComplaintStatus,
        actorId: history.actorId === null ? null : string(history.actorId, 36),
      }
    }),
  }
}
