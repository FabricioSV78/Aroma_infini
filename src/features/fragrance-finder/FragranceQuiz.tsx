import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import { InlineStatus } from '../../components/ui/InlineStatus'
import {
  familyVisualFor,
  finderSteps,
  optionsForStep,
  visibleCatalogOptions,
} from '../../content/fragrance-finder'
import type { HomeFinderContent } from '../../types/home'
import {
  fragranceFinderService,
  type FragranceFinderService,
} from '../../services/fragrance-finder-service'
import type {
  FinderAnswers,
  FinderOptions,
  FinderResult,
  FinderStep,
} from '../../types/fragrance-finder'
import { FragranceResults } from './FragranceResults'
import { imageSourceSet } from '../../services/image-source'
import { assetSource } from '../../services/asset-source'

function stepIsAnswered(answers: FinderAnswers, step: FinderStep) {
  return step === 'budget'
    ? answers.budget !== undefined
    : answers[step] !== undefined
}

export function FragranceQuiz({
  onClose,
  service = fragranceFinderService,
  initialFamily,
  content,
}: {
  onClose: () => void
  service?: FragranceFinderService
  initialFamily?: string
  content: HomeFinderContent
}) {
  const [options, setOptions] = useState<FinderOptions | null>(null)
  const [answers, setAnswers] = useState<FinderAnswers>(
    initialFamily === undefined ? {} : { family: [initialFamily] },
  )
  const [step, setStep] = useState(0)
  const [result, setResult] = useState<FinderResult | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const request = useRef(0)
  const mounted = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const current = finderSteps[step]
  const currentContent = content.steps[current.id]
  const selectedCount =
    current.id === 'budget' ? 0 : (answers[current.id]?.length ?? 0)
  const visibleOptionCount =
    options && current.id !== 'budget'
      ? visibleCatalogOptions(current.id, options, content).length
      : 0

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
          !visibleCatalogOptions('family', data, content).some(
            (family) => family.value === initialFamily,
          )
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
  }, [service, attempt, initialFamily, content])

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
  function toggleOption(step: Exclude<FinderStep, 'budget'>, value: string) {
    setAnswers((previous) => {
      const selected = previous[step]
      if (value === '') {
        if (selected?.length === 0) {
          const updated = { ...previous }
          delete updated[step]
          return updated
        }
        return { ...previous, [step]: [] }
      }
      const next = selected?.includes(value)
        ? selected.filter((item) => item !== value)
        : [...(selected ?? []), value]
      const updated = { ...previous }
      if (next.length) updated[step] = next
      else delete updated[step]
      return updated
    })
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={content.modalTitle}
      id="fragrance-quiz"
      className={`finder-dialog${result?.matches.length === 1 ? ' finder-dialog--single-result' : ''}`}
    >
      <div ref={body} className="finder-workspace" aria-busy={busy}>
        {busy ? (
          <div className="finder-status">
            <InlineStatus busy>
              {options
                ? 'Buscando coincidencias en el catálogo…'
                : 'Preparando tu recorrido…'}
            </InlineStatus>
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
                ? content.singleResultTitle
                : content.resultCopy[result.kind].title}
            </h3>
            <FragranceResults
              result={result}
              onClose={onClose}
              content={content}
            />
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
                      {content.steps[item.id].label}
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
                  {currentContent.question}
                </h3>
                <p id="finder-question-help" className="finder-explanation">
                  {currentContent.description}
                </p>
                {current.id !== 'budget' && (
                  <p
                    id="finder-multiple-help"
                    className="finder-multiple-help"
                    aria-live="polite"
                  >
                    Puedes elegir varias opciones
                    {selectedCount
                      ? ` · ${selectedCount} ${selectedCount === 1 ? 'seleccionada' : 'seleccionadas'}`
                      : ''}
                  </p>
                )}
                {current.id !== 'budget' && visibleOptionCount === 0 && (
                  <p className="finder-explanation" role="status">
                    Por ahora no hay opciones disponibles para este paso. Puedes
                    continuar sin preferencia.
                  </p>
                )}
                <fieldset
                  className={`finder-options finder-options--${current.id}`}
                  aria-labelledby="finder-question-title"
                  aria-describedby={
                    current.id === 'budget'
                      ? 'finder-question-help'
                      : 'finder-question-help finder-multiple-help'
                  }
                >
                  {optionsForStep(current.id, options, content).map(
                    (option) => {
                      const visual =
                        current.id === 'family'
                          ? familyVisualFor(option.value, content)
                          : undefined
                      const selected =
                        current.id === 'budget'
                          ? answers.budget === option.value
                          : option.value === ''
                            ? answers[current.id]?.length === 0
                            : (answers[current.id]?.includes(option.value) ??
                              false)
                      return (
                        <label
                          className={`finder-option ${current.id === 'budget' ? '' : 'finder-option--multiple'} ${visual?.image ? 'finder-option--photo' : ''} ${option.value === '' ? 'finder-option--any' : ''}`}
                          key={option.value}
                        >
                          <input
                            type={
                              current.id === 'budget' ? 'radio' : 'checkbox'
                            }
                            name={`finder-${current.id}`}
                            value={option.value}
                            checked={selected}
                            onChange={() => {
                              if (current.id === 'budget')
                                setAnswers((previous) => ({
                                  ...previous,
                                  budget: option.value,
                                }))
                              else toggleOption(current.id, option.value)
                            }}
                          />
                          {visual?.image && (
                            <img
                              src={assetSource(visual.image)}
                              srcSet={imageSourceSet(
                                visual.image,
                                [160, 320, 960],
                              )}
                              sizes="(max-width: 600px) calc(50vw - 27px), (max-width: 900px) calc(50vw - 57px), (max-width: 1108px) calc(25vw - 44.5px), 233px"
                              width="240"
                              height="220"
                              alt=""
                              decoding="async"
                            />
                          )}
                          <span className="finder-option-content">
                            {!visual?.image && option.value !== '' && (
                              <Icon name={current.icon} />
                            )}
                            <span>
                              <strong>{option.label}</strong>
                              {visual?.description && (
                                <small>{visual.description}</small>
                              )}
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
                    },
                  )}
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
                  disabled={!stepIsAnswered(answers, current.id)}
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
