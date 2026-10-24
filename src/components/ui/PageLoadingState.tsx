import { Skeleton } from './Skeleton'
import { InlineStatus } from './InlineStatus'

export function PageLoadingState({ pathname }: { pathname: string }) {
  const admin = pathname.startsWith('/admin')
  const product = pathname.startsWith('/producto/')
  const catalog = ['/tienda', '/catalogo', '/buscar'].includes(pathname)
  const label = admin
    ? 'Cargando el panel…'
    : product
      ? 'Cargando el producto…'
      : catalog
        ? 'Cargando productos…'
        : 'Preparando la tienda…'

  return (
    <div
      className={`ui-loading-shell${admin ? ' ui-loading-shell--admin' : ''}`}
    >
      {admin && (
        <div className="ui-loading-sidebar" aria-hidden="true">
          <Skeleton width="70%" height={28} />
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} width="80%" height={18} />
          ))}
        </div>
      )}
      <div>
        <div className="ui-loading-header" aria-hidden="true">
          <Skeleton width={114} height={38} />
          <Skeleton width="26%" height={18} />
        </div>
        <main className="ui-loading-page container" aria-busy="true">
          <h1 className="sr-only">{label}</h1>
          <InlineStatus busy>{label}</InlineStatus>
          <div className="ui-loading-heading" aria-hidden="true">
            <Skeleton width="24%" height={14} />
            <Skeleton width="min(75%, 440px)" height={44} />
          </div>
          {product ? (
            <div className="ui-loading-product" aria-hidden="true">
              <Skeleton className="ui-loading-photo" />
              <div className="ui-loading-copy">
                <Skeleton width="32%" height={14} />
                <Skeleton width="75%" height={48} />
                <Skeleton width="40%" height={32} />
                <Skeleton width="100%" height={18} />
                <Skeleton width="88%" height={18} />
                <Skeleton width="100%" height={70} />
                <Skeleton width="100%" height={48} />
              </div>
            </div>
          ) : admin ? (
            <div aria-hidden="true">
              <div className="ui-loading-metrics">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} height={96} />
                ))}
              </div>
              <Skeleton height={44} />
              <div className="ui-loading-rows">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} height={42} />
                ))}
              </div>
            </div>
          ) : catalog ? (
            <div
              className="ui-loading-catalog catalog-layout"
              aria-hidden="true"
            >
              <div className="ui-loading-filter">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} height={28} />
                ))}
              </div>
              <div className="catalog-listing">
                <div className="product-grid ui-loading-cards">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="ui-loading-card">
                      <Skeleton className="ui-loading-photo" />
                      <Skeleton width="38%" height={12} />
                      <Skeleton width="72%" height={24} />
                      <Skeleton width="32%" height={16} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Skeleton className="ui-loading-editorial" />
          )}
        </main>
      </div>
    </div>
  )
}
