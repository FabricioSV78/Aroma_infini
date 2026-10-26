import type {
  AdminBrand,
  AdminCustomer,
  AdminOrder,
  AdminProduct,
  AdminShippingSettings,
} from '../services/admin-service'
import { getAreaBaseShipping } from '../services/shipping-rates'

export const DEMO_ORDERS_VERSION = 1
export const DEMO_ORDERS_TARGET = 50

/** Local demonstration records only; never creates purchases or changes stock. */
export function createAdditionalDemoOrders(
  orders: readonly AdminOrder[],
  customers: readonly AdminCustomer[],
  products: readonly AdminProduct[],
  brands: readonly AdminBrand[],
  shipping: AdminShippingSettings,
) {
  const additions: AdminOrder[] = []
  const addedCustomers: AdminCustomer[] = []
  const references = new Set(orders.map((order) => order.reference))
  const customerIds = new Set(customers.map((customer) => customer.id))
  const presentations = products.flatMap(({ product }) =>
    product.variants
      .filter((variant) => variant.active !== false && variant.priceCents > 0)
      .map((variant) => ({ product, variant })),
  )
  if (!presentations.length)
    return { orders: additions, customers: addedCustomers }
  const missing = Math.max(0, DEMO_ORDERS_TARGET - orders.length)
  for (let index = 1; additions.length < missing; index += 1) {
    const code = String(index).padStart(4, '0')
    const reference = `AI-DEMO-${code}`
    const customerId = `order-demo-customer-${code}`
    if (references.has(reference) || customerIds.has(customerId)) continue
    const source = presentations[(index - 1) % presentations.length]
    const quantity = index % 7 === 0 ? 2 : 1
    const callao = index % 4 === 0
    const rate = getAreaBaseShipping(shipping, callao ? 'callao' : 'lima')
    const deliveryMethod =
      index % 2 === 0 && rate.motorizadoFeeCents !== null
        ? 'motorizado'
        : 'courier'
    const subtotalCents = source.variant.priceCents * quantity
    const shippingCents =
      shipping.freeThresholdCents > 0 &&
      subtotalCents >= shipping.freeThresholdCents
        ? 0
        : deliveryMethod === 'courier'
          ? rate.courierFeeCents
          : (rate.motorizadoFeeCents ?? rate.courierFeeCents)
    const customer = {
      id: customerId,
      name: `Cliente de demostración ${code}`,
      email: `pedido-demo-${code}@example.invalid`,
      phone: '000000000',
    }
    additions.push({
      reference,
      customerId,
      customerName: customer.name,
      customerEmail: customer.email,
      contactPhone: customer.phone,
      placedAt: new Date(
        Date.UTC(2026, 9, 26, 15, 0) - (index - 1) * 3_600_000,
      ).toISOString(),
      status: (['received', 'preparing', 'shipped', 'delivered'] as const)[
        (index - 1) % 4
      ],
      paymentStatus: 'approved',
      lines: [
        {
          variantId: source.variant.id,
          brand:
            brands.find((brand) => brand.id === source.product.brandId)?.name ??
            '',
          name: source.product.name,
          ml: source.variant.ml,
          ...(source.variant.label
            ? { variantLabel: source.variant.label }
            : {}),
          quantity,
          unitPriceCents: source.variant.priceCents,
        },
      ],
      subtotalCents,
      discountCents: 0,
      shippingCents,
      totalCents: subtotalCents + shippingCents,
      promotionCode: null,
      paymentProvider: 'mercado-pago',
      deliveryMethod,
      address: {
        department: callao ? 'Callao' : 'Lima',
        province: callao ? 'Callao' : 'Lima',
        district: callao
          ? 'Bellavista'
          : index % 3 === 0
            ? 'San Isidro'
            : 'Miraflores',
        street: `Dirección de demostración ${100 + index}`,
        reference:
          'Datos ficticios para revisar el panel. No realizar entregas.',
      },
    })
    addedCustomers.push(customer)
    references.add(reference)
    customerIds.add(customerId)
  }
  return { orders: additions, customers: addedCustomers }
}
