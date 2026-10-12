import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { choosingGuideSteps } from '../../content/choosing-guide'
import type { ChoosingGuideExample } from '../../types/home'

interface ChoosingGuideProps {
  example: ChoosingGuideExample | null
}

export function ChoosingGuide({ example }: ChoosingGuideProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const tabs = useRef<Array<HTMLButtonElement | null>>([])

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % choosingGuideSteps.length
        break
      case 'ArrowLeft':
        next = (index + choosingGuideSteps.length - 1) % choosingGuideSteps.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = choosingGuideSteps.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    setActiveIndex(next)
    tabs.current[next]?.focus()
  }

  return (
    <section
      id="claves-para-elegir"
      className="choosing-guide container"
      aria-labelledby="choosing-guide-title"
    >
      <header className="choosing-guide-heading">
        <p className="eyebrow">Antes de decidir</p>
        <h2 id="choosing-guide-title">Claves para elegir</h2>
        <p className="choosing-guide-intro">
          Lee una ficha con estos tres criterios.
        </p>
      </header>

      <div className="choosing-guide-workspace">
        <div
          className="choosing-guide-tabs"
          role="tablist"
          aria-label="Claves para elegir un perfume"
        >
          {choosingGuideSteps.map((step, index) => (
            <button
              key={step.id}
              ref={(element) => {
                tabs.current[index] = element
              }}
              id={`choosing-guide-tab-${step.id}`}
              className="choosing-guide-tab"
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-controls={`choosing-guide-panel-${step.id}`}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => handleTabKey(event, index)}
            >
              <span aria-hidden="true">0{index + 1}</span>
              {step.label}
            </button>
          ))}
        </div>

        {choosingGuideSteps.map((step, index) => (
          <div
            key={step.id}
            id={`choosing-guide-panel-${step.id}`}
            className="choosing-guide-panel"
            role="tabpanel"
            aria-labelledby={`choosing-guide-tab-${step.id}`}
            hidden={activeIndex !== index}
            tabIndex={0}
          >
            <h3>{step.title}</h3>
            <p className="choosing-guide-description">{step.description}</p>
            <div className="choosing-guide-reading">
              <p className="choosing-guide-location">
                En la ficha, abre <strong>Familia olfativa</strong>
              </p>
              {example ? (
                <Link
                  className="choosing-guide-example"
                  to={`/producto/${example.slug}`}
                >
                  <dl>
                    <dt>Ejemplo · {step.field}</dt>
                    <dd>{example[step.id]}</dd>
                  </dl>
                  <span className="choosing-guide-example-action">
                    Ver ficha de {example.name} <Icon name="arrow" />
                  </span>
                </Link>
              ) : (
                <p className="choosing-guide-field">Busca «{step.field}»</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="choosing-guide-action">
        <Link className="button button--primary" to="/tienda">
          Explorar perfumes <Icon name="arrow" />
        </Link>
      </div>
    </section>
  )
}
