import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import {
  familyVisuals,
  resultCopy,
  finderSteps,
  optionsForStep,
} from '../../content/fragrance-finder'
import {
  fragranceFinderService,
  type FragranceFinderService,
} from '../../services/fragrance-finder-service'
import type {
  FinderAnswers,
  FinderOptions,
  FinderResult,
} from '../../types/fragrance-finder'
import { FragranceResults } from './FragranceResults'

export function FragranceQuiz({
  onClose,
  service = fragranceFinderService,
  initialFamily,
}: {
  onClose: () => void
  service?: FragranceFinderService
  initialFamily?: string
}) {
  const [options, setOptions] = useState<FinderOptions | null>(null)
  const [answers, setAnswers] = useState<FinderAnswers>(
    initialFamily === undefined ? {} : { family: initialFamily },
  )
  const [step, setStep] = useState(initialFamily === undefined ? 0 : 1)
  const [result, setResult] = useState<FinderResult | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const request = useRef(0)
  const mounted = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const current = finderSteps[step]

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const id = ++request.current
    service
      .getOptions()
      .then((data) => {
        if (cancelled || request.current !== id) return
        setOptions(data)
        if (
          initialFamily &&
          !data.families.some((family) => family.value === initialFamily)
        ) {
          setAnswers({})
          setStep(0)
        }
        if (!data.availableCount)
          setResult({ kind: 'unavailable', matches: [] })
        setBusy(false)
      })
      .catch(() => {
        if (!cancelled && request.current === id) {
          setError(true)
          setBusy(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [service, attempt, initialFamily])

  useEffect(() => {
    if (!busy) {
      heading.current?.focus({ preventScroll: true })
      body.current?.closest('dialog')?.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [step, result, busy, error])

  function restart() {
    request.current++
    setOptions(null)
    setAnswers({})
    setStep(0)
    setResult(null)
    setError(false)
    setBusy(true)
    setAttempt((value) => value + 1)
  }
  async function submit() {
    const id = ++request.current
    setBusy(true)
    setError(false)
    try {
      const data = await service.recommend(answers)
      if (mounted.current && request.current === id) {
        setResult(data)
        setBusy(false)
      }
    } catch {
      if (mounted.current && request.current === id) {
        setError(true)
        setBusy(false)
      }
    }
  }
  function retry() {
    if (options) {
      void submit()
      return
    }
    setError(false)
    setBusy(true)
    setAttempt((value) => value + 1)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Encuentra tu perfume ideal"
      id="fragrance-quiz"
      className={`finder-dialog${result?.matches.length === 1 ? ' finder-dialog--single-result' : ''}`}
    >
      <div ref={body} className="finder-workspace" aria-busy={busy}>
        {busy ? (
          <div className="finder-status" role="status">
            <Icon name="botanical" />
            <p>
              {options
                ? 'Buscando coincidencias en el catálogo…'
                : 'Preparando tu recorrido…'}
            </p>
          </div>
        ) : error ? (
          <div className="finder-status">
            <h3 ref={heading} tabIndex={-1}>
              No pudimos consultar el catálogo
            </h3>
            <p role="alert">Tus respuestas se conservan. Inténtalo otra vez.</p>
            <button className="button button--primary" onClick={retry}>
              Reintentar
            </button>
          </div>
        ) : result ? (
          <div className="finder-result-view">
            <p className="eyebrow">Tu selección</p>
            <h3 ref={heading} tabIndex={-1}>
              {result.kind === 'matches' && result.matches.length === 1
                ? 'Tu perfume recomendado'
                : resultCopy[result.kind].title}
            </h3>
            <FragranceResults result={result} onClose={onClose} />
            <div className="finder-result-actions">
              <div className="finder-result-restart">
                {result.kind !== 'unavailable' && (
                  <button
                    className="button"
                    onClick={() => {
                      setResult(null)
                      setStep(0)
                    }}
                  >
                    Cambiar respuestas
                  </button>
                )}
                <button className="finder-text-button" onClick={restart}>
                  Empezar de nuevo
                </button>
              </div>
              <Link className="finder-shop-link" to="/tienda" onClick={onClose}>
                Explorar todos los perfumes <Icon name="arrow" />
              </Link>
            </div>
          </div>
        ) : (
          options && (
            <>
              <div className="finder-progress">
                <span>
                  Paso {step + 1} de {finderSteps.length}
                </span>
                <ol aria-label="Etapas del cuestionario">
                  {finderSteps.map((item, index) => (
                    <li
                      key={item.id}
                      aria-current={index === step ? 'step' : undefined}
                      className={index < step ? 'is-complete' : ''}
                    >
                      {item.label}
                    </li>
                  ))}
                </ol>
                <progress
                  max={finderSteps.length}
                  value={step + 1}
                  aria-label={`Paso ${step + 1} de ${finderSteps.length}`}
                />
              </div>
              <div className="finder-question" key={current.id}>
                <h3 ref={heading} tabIndex={-1} id="finder-question-title">
                  {current.question}
                </h3>
                <p id="finder-question-help" className="finder-explanation">
                  {current.description}
                </p>
                <fieldset
                  className={`finder-options finder-options--${current.id}`}
                  aria-labelledby="finder-question-title"
                  aria-describedby="finder-question-help"
                >
                  {optionsForStep(current.id, options).map((option) => {
                    const visual =
                      current.id === 'family'
                        ? familyVisuals[option.value]
                        : undefined
                    return (
                      <label
                        className={`finder-option ${visual ? 'finder-option--photo' : ''} ${option.value === '' ? 'finder-option--any' : ''}`}
                        key={option.value}
                      >
                        <input
                          type="radio"
                          name={`finder-${current.id}`}
                          value={option.value}
                          checked={answers[current.id] === option.value}
                          onChange={() =>
                            setAnswers((previous) => ({
                              ...previous,
                              [current.id]: option.value,
                            }))
                          }
                        />
                        {visual && (
                          <img
                            src={visual.image}
                            width="240"
                            height="220"
                            alt=""
                            decoding="async"
                          />
                        )}
                        <span className="finder-option-content">
                          {!visual && option.value !== '' && (
                            <Icon name={current.icon} />
                          )}
                          <span>
                            <strong>{option.label}</strong>
                            {visual && <small>{visual.description}</small>}
                          </span>
                          <span
                            className="finder-option-check"
                            aria-hidden="true"
                          >
                            <Icon name="check" />
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </fieldset>
              </div>
              <div className="finder-navigation">
                <button
                  className="finder-text-button"
                  onClick={() => setStep((value) => value - 1)}
                  disabled={step === 0}
                >
                  Anterior
                </button>
                <button
                  className="finder-text-button finder-reset"
                  onClick={restart}
                >
                  Reiniciar
                </button>
                <button
                  className="button button--primary"
                  disabled={answers[current.id] === undefined}
                  onClick={() =>
                    step === finderSteps.length - 1
                      ? void submit()
                      : setStep((value) => value + 1)
                  }
                >
                  {step === finderSteps.length - 1
                    ? 'Ver mis perfumes'
                    : 'Continuar'}
                  <Icon name="arrow" />
                </button>
              </div>
            </>
          )
        )}
        {error && (
          <Link className="finder-shop-link" to="/tienda" onClick={onClose}>
            Ir a la tienda
          </Link>
        )}
      </div>
    </Dialog>
  )
}
