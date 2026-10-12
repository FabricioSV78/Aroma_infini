import { useRef, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import { familyVisuals } from '../../content/fragrance-finder'
import type { FinderOptions } from '../../types/fragrance-finder'
import { FragranceQuiz } from '../fragrance-finder/FragranceQuiz'

export function PerfumeFinder({ options }: { options: FinderOptions }) {
  const [open, setOpen] = useState(false)
  const [initialFamily, setInitialFamily] = useState<string | undefined>()
  const trigger = useRef<HTMLButtonElement>(null)
  const selectedOption = useRef<HTMLButtonElement | null>(null)

  function start(family?: string, source?: HTMLButtonElement) {
    selectedOption.current = source ?? null
    setInitialFamily(family)
    setOpen(true)
  }

  function close() {
    setOpen(false)
    requestAnimationFrame(() =>
      (selectedOption.current ?? trigger.current)?.focus({
        preventScroll: true,
      }),
    )
  }

  return (
    <section
      className="perfume-finder"
      aria-labelledby="finder-title"
      id="encuentra-tu-perfume"
    >
      <div className="finder-scene">
        <img
          className="finder-scene-image"
          src="/images/olfactory-cedre.webp"
          alt=""
          loading="lazy"
          decoding="async"
          width="960"
          height="1200"
        />
        <div className="finder-scene-content container">
          <p className="eyebrow">Tu aroma empieza aquí</p>
          <h2 id="finder-title">
            Encuentra tu
            <br />
            perfume ideal
          </h2>
          <p className="finder-scene-copy">
            Cuatro elecciones sencillas. Perfumes disponibles que encajan con
            tus preferencias.
          </p>
          <button
            ref={trigger}
            className="finder-scene-action"
            type="button"
            onClick={() => start()}
            aria-haspopup="dialog"
          >
            Encontrar mi perfume <Icon name="arrow" />
          </button>
        </div>
      </div>

      <div className="finder-entry container">
        <div className="finder-entry-question">
          <span>1/4 · Tu primera elección</span>
          <h3 id="finder-entry-title">¿Qué aroma te atrae?</h3>
        </div>
        {options.families.length > 0 ? (
          <div
            className="finder-entry-options"
            role="group"
            aria-labelledby="finder-entry-title"
          >
            {options.families.slice(0, 4).map((family) => (
              <button
                key={family.value}
                type="button"
                className="finder-entry-option"
                onClick={(event) => start(family.value, event.currentTarget)}
                aria-label={`Elegir ${family.label} y continuar al siguiente paso`}
                aria-haspopup="dialog"
              >
                {familyVisuals[family.value] ? (
                  <img
                    src={familyVisuals[family.value].image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width="64"
                    height="64"
                  />
                ) : (
                  <span className="finder-entry-initial" aria-hidden="true">
                    {family.label.charAt(0)}
                  </span>
                )}
                <span>{family.label}</span>
                <Icon name="arrow" />
              </button>
            ))}
            {options.families.length > 4 && (
              <button
                type="button"
                className="finder-entry-more"
                onClick={() => start()}
                aria-haspopup="dialog"
              >
                Ver todos los aromas <Icon name="arrow" />
              </button>
            )}
          </div>
        ) : (
          <p className="finder-entry-empty">
            Explora las opciones disponibles en la tienda.
          </p>
        )}
      </div>

      {open && <FragranceQuiz onClose={close} initialFamily={initialFamily} />}
    </section>
  )
}
