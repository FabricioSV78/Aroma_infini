import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { InstitutionalBreadcrumb } from '../institutional/InstitutionalBreadcrumb'
import { isRemoteCatalog } from '../../services/catalog-source'
import {
  loadTrackingRecord,
  type TrackingRecord,
} from '../../services/order-tracking-service'
import {
  accountStatusLabels,
  accountStatusOrder,
} from '../../services/account-service'

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function OrderStatus({ record }: { record: TrackingRecord }) {
  const currentIndex = accountStatusOrder.indexOf(record.status)
  return (
    <section
      className="tracking-result"
      aria-labelledby="tracking-result-title"
      data-scroll-reveal="copy"
    >
      <div className="tracking-result-top">
        <div>
          <p className="eyebrow">{record.reference}</p>
          <h2 id="tracking-result-title">
            Estado: {accountStatusLabels[record.status].toLowerCase()}
          </h2>
        </div>
        <span>{dateFormatter.format(new Date(record.placedAt))}</span>
      </div>
      <ol className="tracking-steps" aria-label="Estado del pedido">
        {accountStatusOrder.map((status, index) => (
          <li
            key={status}
            aria-current={index === currentIndex ? 'step' : undefined}
            data-complete={index < currentIndex ? 'true' : undefined}
          >
            {accountStatusLabels[status]}
          </li>
        ))}
      </ol>
      <p className="tracking-note">
        {record.simulation
          ? 'Pedido de prueba: no representa un cobro ni una entrega real.'
          : 'El estado refleja la información guardada durante esta sesión.'}
      </p>
    </section>
  )
}

export function OrderTrackingPage() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const code = searchParams.get('codigo')?.trim() ?? ''
  const requestKey = JSON.stringify([location.key, code, location.hash])
  const [result, setResult] = useState<{
    key: string
    record: TrackingRecord | null
    error: string
  } | null>(null)
  const record = result?.key === requestKey ? result.record : null
  const error = result?.key === requestKey ? result.error : ''
  const loading = Boolean(code && result?.key !== requestKey)
  useEffect(() => {
    let live = true
    if (!code) return
    const token = new URLSearchParams(location.hash.replace(/^#/, '')).get(
      'acceso',
    )
    void loadTrackingRecord(code, token)
      .then((record) => {
        if (live) setResult({ key: requestKey, record, error: '' })
      })
      .catch(() => {
        if (live)
          setResult({
            key: requestKey,
            record: null,
            error:
              'No pudimos consultar el pedido. Revisa tu conexión y vuelve a intentar.',
          })
      })
    return () => {
      live = false
    }
  }, [code, location.hash, requestKey])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const value = String(data.get('codigo') ?? '')
      .trim()
      .toUpperCase()
    if (value)
      void navigate({
        pathname: location.pathname,
        search: new URLSearchParams({ codigo: value }).toString(),
        // Retrying a private receipt must retain its access token. A different
        // order must never inherit the previous receipt's token.
        hash: value === code.toUpperCase() ? location.hash : '',
      })
  }

  return (
    <article className="store-page tracking-page service-page container">
      <InstitutionalBreadcrumb current="Seguir pedido" />
      <div className="tracking-entry">
        <header
          className="tracking-heading service-intro"
          data-scroll-reveal="copy"
        >
          <p className="eyebrow">Consulta de pedido</p>
          <h1>Seguir pedido</h1>
          <p>
            Consulta el estado con el código que aparece en la confirmación.
          </p>
        </header>
        <form
          className="tracking-search"
          onSubmit={submit}
          data-scroll-reveal="copy"
        >
          <label htmlFor="tracking-code">Código de pedido</label>
          <div>
            <input
              key={code}
              id="tracking-code"
              name="codigo"
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              defaultValue={code}
              placeholder="AI-…"
              required
            />
            <button className="button button--primary" type="submit">
              Consultar <Icon name="arrow" />
            </button>
          </div>
        </form>
      </div>
      <p className="sr-only" role="status">
        {record
          ? `Pedido encontrado. Estado: ${accountStatusLabels[record.status]}.`
          : ''}
      </p>
      {loading ? (
        <p className="tracking-note" role="status">
          Consultando pedido…
        </p>
      ) : null}
      {error ? (
        <p className="tracking-not-found" role="alert">
          {error}
        </p>
      ) : null}
      {record ? <OrderStatus record={record} /> : null}
      {code && !record && !loading && !error ? (
        <p className="tracking-not-found" role="status">
          {isRemoteCatalog
            ? 'No encontramos un pedido accesible con ese código. Abre el enlace privado de la confirmación o inicia sesión con la cuenta de la compra.'
            : 'No encontramos ese pedido en este navegador. Revisa el código de la confirmación.'}
        </p>
      ) : null}
    </article>
  )
}
