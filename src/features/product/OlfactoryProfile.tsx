import type { ReactNode } from 'react'
import { Icon } from '../../components/ui/Icon'
import type { ProductDetail } from '../../types/catalog'

interface OlfactoryProfileProps {
  family: string
  detail: ProductDetail
  editor?: {
    family: ReactNode
    intensity: ReactNode
    season: ReactNode
    occasion: ReactNode
    notes: ReactNode
  }
}

export function OlfactoryProfile({
  family,
  detail,
  editor,
}: OlfactoryProfileProps) {
  return (
    <div className="olfactory-profile-card">
      <div className="olfactory-profile-family">{editor?.family ?? family}</div>
      <div className="olfactory-profile-intensity">
        <p>Intensidad</p>
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
        <strong>{editor?.intensity ?? detail.intensity}</strong>
      </div>
      <dl className="olfactory-profile-traits">
        <div>
          <span
            className="olfactory-profile-glyph olfactory-profile-glyph--botanical"
            aria-hidden="true"
          >
            <Icon name="botanical" />
          </span>
          <dt>Temporada</dt>
          <dd>{editor?.season ?? detail.season}</dd>
        </div>
        <div className="olfactory-profile-evolution">
          <span className="olfactory-profile-glyph" aria-hidden="true">
            <Icon name="scent" />
          </span>
          <dt>Evolución</dt>
          <dd className="olfactory-profile-notes">
            {editor?.notes ?? (
              <dl className="olfactory-note-groups">
                {(
                  [
                    ['top', 'Notas de salida'],
                    ['heart', 'Notas de corazón'],
                    ['base', 'Notas de fondo'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{detail.notes[key].join(', ') || 'Por definir'}</dd>
                  </div>
                ))}
              </dl>
            )}
          </dd>
        </div>
        <div>
          <span className="olfactory-profile-glyph" aria-hidden="true">
            <Icon name="dayNight" />
          </span>
          <dt>Momento</dt>
          <dd>{editor?.occasion ?? detail.occasion}</dd>
        </div>
      </dl>
    </div>
  )
}
