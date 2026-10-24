import { useRef, useState } from 'react'
import { Icon } from '../../components/ui/Icon'
import {
  familyVisualFor,
  visibleCatalogOptions,
} from '../../content/fragrance-finder'
import type { FinderOptions } from '../../types/fragrance-finder'
import type { HomeFinderContent } from '../../types/home'
import { FragranceQuiz } from '../fragrance-finder/FragranceQuiz'
import { imageSourceSet } from '../../services/image-source'
import { assetSource } from '../../services/asset-source'

export function PerfumeFinder({
  options,
  content,
}: {
  options: FinderOptions
  content: HomeFinderContent
}) {
  const [open, setOpen] = useState(false)
  const [initialFamily, setInitialFamily] = useState<string | undefined>()
  const trigger = useRef<HTMLButtonElement>(null)
  const selectedOption = useRef<HTMLButtonElement | null>(null)
  const visibleFamilies = visibleCatalogOptions('family', options, content)

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
        <picture>
          {content.mobileImage && (
            <source
              media="(max-width: 767px)"
              srcSet={assetSource(content.mobileImage)}
            />
          )}
          <img
            className="finder-scene-image"
            src={assetSource(
              content.desktopImage ?? '/images/olfactory-cedre.webp',
            )}
            alt=""
            loading="lazy"
            decoding="async"
            width="960"
            height="1200"
          />
        </picture>
        <div className="finder-scene-content container">
          <p className="eyebrow">{content.eyebrow}</p>
          <h2 id="finder-title">{content.title}</h2>
          <p className="finder-scene-copy">{content.description}</p>
          <button
            ref={trigger}
            className="finder-scene-action"
            type="button"
            onClick={() => start()}
            aria-haspopup="dialog"
          >
            {content.cta} <Icon name="arrow" />
          </button>
        </div>
      </div>

      <div className="finder-entry container">
        <div className="finder-entry-question">
          <span>1/4 · {content.entryLabel}</span>
          <h3 id="finder-entry-title">{content.entryQuestion}</h3>
        </div>
        {visibleFamilies.length > 0 ? (
          <div
            className="finder-entry-options"
            role="group"
            aria-labelledby="finder-entry-title"
          >
            {visibleFamilies.slice(0, 4).map((family) => {
              const label =
                content.optionLabels.family[family.value] ?? family.label
              const visual = familyVisualFor(family.value, content)
              return (
                <button
                  key={family.value}
                  type="button"
                  className="finder-entry-option"
                  onClick={(event) => start(family.value, event.currentTarget)}
                  aria-label={`Elegir ${label} y añadir otros aromas`}
                  aria-haspopup="dialog"
                >
                  {visual?.image ? (
                    <img
                      src={assetSource(visual.image)}
                      srcSet={imageSourceSet(visual.image, [160, 320])}
                      sizes="(max-width: 600px) 36px, (max-width: 900px) 40px, 48px"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      width="64"
                      height="64"
                    />
                  ) : (
                    <span className="finder-entry-initial" aria-hidden="true">
                      {label.charAt(0)}
                    </span>
                  )}
                  <span>{label}</span>
                  <Icon name="arrow" />
                </button>
              )
            })}
            {visibleFamilies.length > 4 && (
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

      {open && (
        <FragranceQuiz
          onClose={close}
          initialFamily={initialFamily}
          content={content}
        />
      )}
    </section>
  )
}
