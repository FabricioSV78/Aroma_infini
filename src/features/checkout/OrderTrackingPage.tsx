import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { InstitutionalBreadcrumb } from '../institutional/InstitutionalBreadcrumb'
import {
  getTrackingRecord,
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
        El estado refleja la información guardada durante esta sesión.
      </p>
    </section>
  )
}

export function OrderTrackingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const code = searchParams.get('codigo')?.trim() ?? ''
  const record = code ? getTrackingRecord(code) : null

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const value = String(data.get('codigo') ?? '')
      .trim()
      .toUpperCase()
    if (value) setSearchParams({ codigo: value })
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
              id="tracking-code"
              name="codigo"
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
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
      {record ? <OrderStatus record={record} /> : null}
      {code && !record ? (
        <p className="tracking-not-found" role="status">
          No encontramos ese pedido en este navegador. Revisa el código de la
          confirmación.
        </p>
      ) : null}
    </article>
  )
}
