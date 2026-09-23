import type {
  AdminOrderPaymentStatus,
  AdminOrderStatus,
  AdminProduct,
  AdminPromotion,
} from '../../services/admin-service'

export type AdminTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export const adminOrderStatusMeta: Record<
  AdminOrderStatus,
  { label: string; tone: AdminTone }
> = {
  received: { label: 'Nuevo', tone: 'info' },
  preparing: { label: 'En preparación', tone: 'warning' },
  shipped: { label: 'Enviado', tone: 'info' },
  delivered: { label: 'Entregado', tone: 'success' },
}

export const adminPaymentStatusMeta: Record<
  AdminOrderPaymentStatus,
  { label: string; tone: AdminTone }
> = {
  pending: { label: 'Pago pendiente', tone: 'warning' },
  approved: { label: 'Pagado', tone: 'success' },
  rejected: { label: 'Pago rechazado', tone: 'danger' },
  refunded: { label: 'Reembolsado', tone: 'neutral' },
}

export interface AdminInventoryVariant {
  productId: string
  productName: string
  variantId: string
  ml: number
  stock: number
  threshold: number
  tone: Extract<AdminTone, 'success' | 'warning' | 'danger'>
  label: 'Disponible' | 'Stock bajo' | 'Agotado'
}

export function getVariantInventory(
  record: AdminProduct,
  variant: AdminProduct['product']['variants'][number],
): AdminInventoryVariant {
  const outOfStock = variant.stock <= 0
  const lowStock = !outOfStock && variant.stock <= record.lowStockThreshold
  return {
    productId: record.product.id,
    productName: record.product.name,
    variantId: variant.id,
    ml: variant.ml,
    stock: variant.stock,
    threshold: record.lowStockThreshold,
    tone: outOfStock ? 'danger' : lowStock ? 'warning' : 'success',
    label: outOfStock ? 'Agotado' : lowStock ? 'Stock bajo' : 'Disponible',
  }
}

export function getProductInventory(record: AdminProduct) {
  const variants = record.product.variants
    .filter((variant) => variant.active !== false)
    .map((variant) => getVariantInventory(record, variant))
  const alerts = variants.filter((variant) => variant.tone !== 'success')
  return {
    variants,
    alerts,
    totalStock: variants.reduce((total, variant) => total + variant.stock, 0),
    fullyOutOfStock:
      variants.length === 0 || variants.every((variant) => variant.stock <= 0),
  }
}

export function getInventoryAlerts(records: readonly AdminProduct[]) {
  return records
    .filter((record) => record.active)
    .flatMap((record) => getProductInventory(record).alerts)
    .sort(
      (first, second) =>
        first.stock - second.stock ||
        first.productName.localeCompare(second.productName, 'es') ||
        first.ml - second.ml,
    )
}

export interface AdminPromotionStatus {
  active: boolean
  label: 'Aplicable' | 'Pausada' | 'Programada' | 'Vencida' | 'Límite alcanzado'
}

export function getPromotionStatus(
  promotion: AdminPromotion,
  now = Date.now(),
): AdminPromotionStatus {
  if (!promotion.active) return { active: false, label: 'Pausada' }
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > now)
    return { active: false, label: 'Programada' }
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() < now)
    return { active: false, label: 'Vencida' }
  if (promotion.usageLimit !== null && promotion.used >= promotion.usageLimit)
    return { active: false, label: 'Límite alcanzado' }
  return { active: true, label: 'Aplicable' }
}
