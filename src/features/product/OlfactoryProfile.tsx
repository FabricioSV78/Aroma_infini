import type { ReactNode } from 'react'
import { Icon } from '../../components/ui/Icon'
import { NoteBottleIcon } from '../../components/ui/NoteBottleIcon'
import type { ProductDetail } from '../../types/catalog'

interface OlfactoryProfileProps {
  family: string
  detail: ProductDetail
  image?: string
  editor?: {
    family: ReactNode
    intensity: ReactNode
    season: ReactNode
    occasion: ReactNode
    notes: ReactNode
  }
}

const noteStages = [
  { key: 'top', label: 'Notas de salida', cue: 'Lo primero que percibes' },
  { key: 'heart', label: 'Notas de corazón', cue: 'El carácter del perfume' },
  { key: 'base', label: 'Notas de fondo', cue: 'Lo que permanece' },
] as const

export function OlfactoryProfile({
  family,
  detail,
  image,
  editor,
}: OlfactoryProfileProps) {
  const hasNotes = noteStages.some(({ key }) => detail.notes[key].length > 0)

  return (
    <div className={`olfactory-profile-card${image ? ' has-image' : ''}`}>
      {image ? (
        <figure className="olfactory-profile-visual">
          <img
            src={image}
            alt=""
            width={960}
            height={1200}
            loading="lazy"
            decoding="async"
          />
        </figure>
      ) : null}

      <div className="olfactory-profile-content">
        <header className="olfactory-profile-heading">
          <p className="olfactory-profile-kicker">
            Perfil olfativo <span aria-hidden="true">·</span> {detail.type}
          </p>
          <h2 className="olfactory-profile-family">
            {editor?.family ?? family}
          </h2>
          <p className="olfactory-profile-summary">{detail.shortDescription}</p>
        </header>

        <div className="olfactory-profile-evolution">
          <h3>
            <Icon name="scent" />
            Cómo evoluciona
          </h3>
          {editor?.notes ??
            (hasNotes ? (
              <dl className="olfactory-note-groups">
                {noteStages.map(({ key, label, cue }, index) => (
                  <div key={key}>
                    <dt>
                      <NoteBottleIcon
                        stage={key}
                        className="olfactory-note-icon"
                      />
                      <span>{label}</span>
                      <span className="olfactory-note-index" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </dt>
                    <dd>
                      <span className="olfactory-note-cue">{cue}</span>
                      <span className="olfactory-note-ingredients">
                        {detail.notes[key].join(', ') || '—'}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="olfactory-profile-pending">
                Las notas de este perfume se están preparando.
              </p>
            ))}
        </div>

        <div className="olfactory-profile-details">
          <div className="olfactory-profile-intensity">
            <div className="olfactory-profile-intensity-label">
              <p>Intensidad</p>
              <strong>{editor?.intensity ?? detail.intensity}</strong>
            </div>
            <div
              className="olfactory-meter"
              data-level={detail.intensityLevel}
              role="img"
              aria-label={`Intensidad ${detail.intensity}, nivel ${detail.intensityLevel} de 3`}
            >
              <span>
                <i />
              </span>
            </div>
          </div>
          <dl className="olfactory-profile-traits">
            <div>
              <Icon name="botanical" />
              <dt>Temporada</dt>
              <dd>{editor?.season ?? detail.season}</dd>
            </div>
            <div>
              <Icon name="dayNight" />
              <dt>Momento</dt>
              <dd>{editor?.occasion ?? detail.occasion}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
