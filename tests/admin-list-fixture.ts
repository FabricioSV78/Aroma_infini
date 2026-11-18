import type { AdminBrand, AdminOrder, AdminProduct } from '../src/types/admin'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import { getProductInventory, getInventoryAlerts, getCommercialOrders } from '../src/features/admin/admin-utils'
import { hasProductMainImage } from '../src/domain/product-publication'
import { getProductPhotoStatus } from '../src/domain/product-photos'
import { getPeruDistrictLabel, getPeruProvinceLabel } from '../src/content/peru'
import { orderSearchText } from '../src/features/admin/OrderWorkspaceUtils'
import { paginate } from '../src/features/admin/admin-pagination-utils'
import type { OrderHistoryEntry } from '../src/types/order-workflow'
import { createHash } from 'node:crypto'

/** HTTP fixture only. SQL equivalence/authorization and scale are tested with
 * the native migrated RPCs in 032, independently of this client-side oracle. */
export function adminListFixture(
  name: string, body: Record<string, unknown>, source: {
    products?: AdminProduct[]; brands?: AdminBrand[]; orders?: AdminOrder[]
    productVersions?: ReadonlyMap<string, number>; brandVersions?: ReadonlyMap<string, number>
    features?: { complementsEnabled: boolean }; olfactoryFamilies?: unknown
    settingsVersion?: number
    featuredBrandId?: string | null
    history?: OrderHistoryEntry[]
  } = {},
): Record<string, unknown> | unknown[] | undefined {
  const query = (body.p_query ?? {}) as Record<string, unknown>, mode = body.p_mode ?? 'list'
  const records = source.products ?? [], brands = source.brands ?? [], allOrders = source.orders ?? []
  const productVersions = (selected: AdminProduct[]) => Object.fromEntries(selected.map(record =>
    [record.product.id, source.productVersions?.get(record.product.id) ?? record.version ?? 1]))
  if (name === 'admin_catalog_context') return {
    brands, brandVersions: Object.fromEntries(brands.map(brand => [brand.id, source.brandVersions?.get(brand.id) ?? brand.version ?? 1])),
    features: source.features ?? { complementsEnabled: false }, settingsVersion: source.settingsVersion ?? 1,
    featuredBrandId: source.featuredBrandId ?? null,
    olfactoryFamilies: (source.olfactoryFamilies as typeof DEFAULT_OLFACTORY_FAMILIES ?? DEFAULT_OLFACTORY_FAMILIES).map(family => ({...family,
      productCount: records.filter(record => record.product.olfactoryFamilies?.includes(family.value)).length})),
  }
  if (name === 'admin_products_by_ids') {
    const selected = records.filter(record => (body.p_ids as string[]).includes(record.product.id))
    return { products: selected, productVersions: productVersions(selected) }
  }
  if (name === 'admin_catalog_choices') {
    const selected = records.filter(record => record.product.id !== query.excludeId)
    const matched = selected.filter(record => (!query.activeOnly || record.active) &&
      (!query.withoutOffer || !record.product.discount) &&
      `${brands.find(brand => brand.id === record.product.brandId)?.name ?? ''} ${record.product.name}`.toLowerCase().includes(String(query.search ?? '').toLowerCase()))
      .sort((a,b) => `${brands.find(brand=>brand.id===a.product.brandId)?.name??''} ${a.product.name}`.localeCompare(`${brands.find(brand=>brand.id===b.product.brandId)?.name??''} ${b.product.name}`,'es'))
    const choice = (record: AdminProduct) => ({id:record.product.id,name:record.product.name,slug:record.product.slug,sku:record.product.sku??null,
      brandId:record.product.brandId,brandName:brands.find(brand=>brand.id===record.product.brandId)?.name??'',
      active:record.active,published:record.active&&hasProductMainImage(record),productType:record.product.productType??'perfume',hasDiscount:Boolean(record.product.discount),version:source.productVersions?.get(record.product.id)??record.version??1})
    return {total:matched.length,items:paginate(matched,Number(body.p_page??1),Number(body.p_limit??25)).items.map(choice),selected:selected.filter(record=>(query.includeIds as string[]??[]).includes(record.product.id)).map(choice)}
  }
  if (name === 'admin_offer_list') {
    const all = records.filter(record => record.product.discount).sort((a,b)=>`${brands.find(brand=>brand.id===a.product.brandId)?.name??''} ${a.product.name}`.localeCompare(`${brands.find(brand=>brand.id===b.product.brandId)?.name??''} ${b.product.name}`,'es'))
    const selected=paginate(all,Number(body.p_page??1),Number(body.p_limit??12)).items
    return {total:all.length,availableCount:records.length-all.length,products:selected,productVersions:productVersions(selected),brands,
      revision:createHash('md5').update(JSON.stringify(all.map(record=>[record.product.id,record.product.name,record.product.discount,source.productVersions?.get(record.product.id)??record.version??1]))).digest('hex'),
      brandVersions:Object.fromEntries(brands.map(brand=>[brand.id,source.brandVersions?.get(brand.id)??brand.version??1]))}
  }
  if (name === 'admin_import_conflicts') {
    const key=(value:string)=>value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    return (body.p_rows as {row:number;slug:string;name:string;brandId:string;sku:string}[]).flatMap(row=>{
      const reasons=[]
      if(row.slug&&records.some(record=>key(record.product.slug)===key(row.slug)))reasons.push('slug')
      if(row.name&&records.some(record=>record.product.brandId===row.brandId&&key(record.product.name)===key(row.name)))reasons.push('name')
      if(row.sku&&records.some(record=>record.product.variants.some(variant=>variant.sku?.toUpperCase()===row.sku.toUpperCase())))reasons.push('sku')
      return reasons.length?[{row:row.row,reasons}]:[]
    })
  }
  if (name === 'admin_product_list') {
    const inventory = records.map(record => ({ record, inventory: getProductInventory(record) }))
    const matched = inventory.filter(({record,inventory}) => {
      const search = `${record.product.name} ${record.product.sku ?? ''} ${brands.find(b=>b.id===record.product.brandId)?.name ?? ''} ${record.product.variants.map(v=>v.sku??'').join(' ')}`.toLocaleLowerCase('es')
      return search.includes(String(query.search ?? '').trim().toLocaleLowerCase('es')) &&
        (!query.stock || query.stock==='all' || (query.stock==='alert'&&inventory.alerts.length>0) || (query.stock==='out'&&inventory.fullyOutOfStock) || (query.stock==='healthy'&&!inventory.fullyOutOfStock&&!inventory.alerts.length)) &&
        (!query.visibility || query.visibility==='all' || (query.visibility==='active'&&record.active) || (query.visibility==='inactive'&&!record.active) || (query.visibility==='pending-images'&&!hasProductMainImage(record)))
    }).sort((a,b)=>Number(b.inventory.alerts.length>0)-Number(a.inventory.alerts.length>0)||a.record.product.name.localeCompare(b.record.product.name,'es'))
    const selected = mode==='editor' ? records.filter(r=>r.product.id===query.id) : mode==='list' ? paginate(matched,Number(body.p_page??1),Number(body.p_limit??12)).items.map(r=>r.record) : []
    const alerts = getInventoryAlerts(records)
    return {
      products:selected, total:matched.length, brands,
      productVersions:Object.fromEntries(selected.map(r=>[r.product.id,source.productVersions?.get(r.product.id)??r.version??1])),
      brandVersions:Object.fromEntries(brands.map(b=>[b.id,source.brandVersions?.get(b.id)??b.version??1])),
      features:source.features??{complementsEnabled:false},olfactoryFamilies:source.olfactoryFamilies??DEFAULT_OLFACTORY_FAMILIES,settingsVersion:source.settingsVersion??1,
      photoQueue:matched.filter(r=>getProductPhotoStatus(r.record).status!=='complete').map(r=>r.record.product.id),
      summary:{products:records.length,stock:inventory.filter(r=>r.record.active).reduce((n,r)=>n+r.inventory.totalStock,0),alerts:inventory.filter(r=>r.inventory.alerts.length>0).length,soldOut:inventory.filter(r=>r.inventory.fullyOutOfStock).length},
      dashboard:{stock:inventory.filter(r=>r.record.active&&brands.some(b=>b.id===r.record.product.brandId&&b.active)).reduce((n,r)=>n+r.inventory.totalStock,0),alerts:alerts.length,outAlerts:alerts.filter(r=>r.stock===0).length,items:alerts.slice(0,5).map(r=>({...r,variantLabel:r.variantLabel??null}))},
    }
  }
  if (name === 'admin_order_list') {
    const orders = mode==='dashboard' ? getCommercialOrders(allOrders) : allOrders
    const day=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
    const refs = Array.isArray(query.references) ? query.references : null
    const matched=orders.filter(o=>(!refs||refs.includes(o.reference))&&
      orderSearchText(`${o.reference} ${o.customerName} ${o.customerEmail} ${o.contactPhone??''} ${getPeruDistrictLabel(o.address.district)} ${getPeruProvinceLabel(o.address.province)}`).includes(orderSearchText(String(query.search??'')))&&
      (!query.status||query.status==='all'||query.status===o.status||(query.status==='atencion'&&['received','preparing'].includes(o.status)))&&
      (!query.customer||query.customer===o.customerId)&&(!query.from||day(o.placedAt)>=String(query.from))&&(!query.until||day(o.placedAt)<=String(query.until)))
      .sort((a,b)=>Date.parse(b.placedAt)-Date.parse(a.placedAt)||a.reference.localeCompare(b.reference))
    if(mode==='selection')return{total:matched.length,selection:matched.map(({reference,version,status,paymentStatus,simulation,customerId,customerName,customerEmail,contactPhone,address})=>({reference,version:version??1,status,paymentStatus,simulation:simulation??false,customerId,customerName,customerEmail,contactPhone:contactPhone??'',address}))}
    return{total:matched.length,orders:paginate(matched,Number(body.p_page??1),Number(body.p_limit??20)).items,orderHistory:mode==='details'?(source.history??[]).filter(h=>matched.some(o=>o.reference===h.reference)):[],customer:null,
      toPrepare:orders.filter(o=>o.paymentStatus==='approved'&&['received','preparing'].includes(o.status)).length,
      counts:Object.fromEntries(['received','preparing','shipped','delivered'].map(s=>[s,orders.filter(o=>o.status===s).length]))}
  }
  if(name==='admin_customer_list'){
    const sorted=[...allOrders].sort((a,b)=>Date.parse(b.placedAt)-Date.parse(a.placedAt)),all=new Map<string,AdminOrder>(),commercial=new Map<string,AdminOrder[]>();for(const order of sorted){if(!all.has(order.customerId))all.set(order.customerId,order);if(!order.simulation)commercial.set(order.customerId,[...(commercial.get(order.customerId)??[]),order])}
    const customers=[...commercial].map(([id,orders])=>{const identity=all.get(id)!;return{id,name:identity.customerName,email:identity.customerEmail,phone:identity.contactPhone??'',province:orders[0].address.province,district:orders[0].address.district,orderCount:orders.length}})
      .filter(c=>orderSearchText(`${c.name} ${c.email} ${c.phone} ${getPeruProvinceLabel(c.province)} ${getPeruDistrictLabel(c.district)}`).includes(orderSearchText(String(body.p_search??''))))
      .sort((a,b)=>a.name.localeCompare(b.name,'es'))
    return{total:customers.length,customers:paginate(customers,Number(body.p_page??1),25).items}
  }
  return undefined
}
