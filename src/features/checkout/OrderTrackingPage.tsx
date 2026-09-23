import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
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
            Pedido de prueba: {accountStatusLabels[record.status].toLowerCase()}
            .
          </h2>
        </div>
        <span>{dateFormatter.format(new Date(record.placedAt))}</span>
      </div>
      <ol className="tracking-steps" aria-label="Estado del pedido de prueba">
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
        Este seguimiento pertenece a la demostración y refleja los cambios
        realizados en el panel durante esta sesión.
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
    <article className="store-page tracking-page container">
      <nav
        className="checkout-breadcrumb"
        aria-label="Ruta de navegación"
        data-scroll-reveal="fade"
      >
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Seguir pedido</span>
      </nav>
      <header className="tracking-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Seguimiento de demostración</p>
        <h1>Tu pedido, a la vista.</h1>
        <p>Consulta el estado con el código que aparece en la confirmación.</p>
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
            placeholder="AI-DEMO-…"
            required
          />
          <button className="button button--primary" type="submit">
            Consultar <Icon name="arrow" />
          </button>
        </div>
      </form>
      <p className="sr-only" role="status">
        {record
          ? `Pedido de prueba encontrado. Estado: ${accountStatusLabels[record.status]}.`
          : ''}
      </p>
      {record ? <OrderStatus record={record} /> : null}
      {code && !record ? (
        <p className="tracking-not-found" role="status">
          No encontramos ese pedido de prueba en este navegador. Revisa el
          código de la confirmación.
        </p>
      ) : null}
    </article>
  )
}
