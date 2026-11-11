import { useEffect, useRef, useState, type FormEvent } from 'react'
import { siteSettingsService } from '../../services/site-settings-service'
import {
  validateSiteSettings,
  type SiteSettings,
  type SiteSettingsDocument,
} from '../../domain/site-settings'
import { AdminPageHeader } from './AdminShared'
import { useAdminNotice } from './AdminNoticeProvider'
import { useUnsavedChanges } from './useUnsavedChanges'
import { AdminContactQr } from './AdminContactQr'
import { AdminTrustedDevices } from './AdminTrustedDevices'

type SettingsGroup = 'business' | 'contact' | 'social' | 'policies'

export function AdminSiteSettings() {
  const notice = useAdminNotice()
  const [document, setDocument] = useState<SiteSettingsDocument>(() =>
    structuredClone(siteSettingsService.getSnapshot()),
  )
  const [original, setOriginal] = useState(() => JSON.stringify(document.data))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const dirty = original !== JSON.stringify(document.data)
  useUnsavedChanges(dirty && !saving)
  useEffect(() => {
    let active = true
    siteSettingsService
      .load(true)
      .then((value) => {
        if (active) {
          setDocument(structuredClone(value))
          setOriginal(JSON.stringify(value.data))
        }
      })
      .catch(() => {
        if (active) {
          setLoadFailed(true)
          setError('No pudimos cargar la configuración. Vuelve a intentar.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadAttempt])
  function change<Group extends SettingsGroup>(
    group: Group,
    key: keyof SiteSettings[Group] & string,
    value: string,
  ) {
    setDocument((current) => ({
      ...current,
      data: {
        ...current.data,
        [group]: { ...current.data[group], [key]: value },
      },
    }))
    setErrors((current) => ({ ...current, [`${group}.${key}`]: '' }))
  }
  function field<Group extends SettingsGroup>(
    group: Group,
    key: keyof SiteSettings[Group] & string,
    label: string,
    maximum: number,
    multiline = false,
  ) {
    const id = `site-${group}-${key}`
    const value = String(document.data[group][key])
    const invalid = errors[`${group}.${key}`]
    const attributes = {
      id,
      value,
      maxLength: maximum,
      disabled: saving || loading || loadFailed,
      'aria-label': label,
      'aria-invalid': Boolean(invalid),
      'aria-describedby': invalid ? `${id}-error` : undefined,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => change(group, key, event.target.value),
    }
    return (
      <label
        key={id}
        className={multiline ? 'site-settings-wide' : undefined}
        htmlFor={id}
      >
        {label}
        {multiline ? (
          <textarea {...attributes} rows={10} />
        ) : (
          <input
            {...attributes}
            type={
              group === 'social'
                ? 'url'
                : key === 'email'
                  ? 'email'
                  : key === 'whatsapp'
                    ? 'tel'
                    : 'text'
            }
            inputMode={key === 'taxId' ? 'numeric' : undefined}
            autoCapitalize={group === 'social' ? 'none' : undefined}
            spellCheck={group === 'social' ? false : undefined}
          />
        )}
        {invalid && (
          <small role="alert" id={`${id}-error`}>
            {invalid}
          </small>
        )}
      </label>
    )
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (savingRef.current || loading || loadFailed) return
    const invalid = validateSiteSettings(document.data)
    setErrors(invalid)
    if (Object.keys(invalid).length) {
      const first = Object.keys(invalid)[0].replace('.', '-')
      window.document.getElementById(`site-${first}`)?.focus()
      return
    }
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const result = await siteSettingsService.save(
        document.data,
        document.version,
      )
      setDocument(structuredClone(result))
      setOriginal(JSON.stringify(result.data))
      notice.toast('Configuración guardada.')
    } catch (failure) {
      notice.show({
        kind: 'error',
        title: 'No se guardó la configuración',
        description:
          failure instanceof Error
            ? failure.message
            : 'No pudimos guardar los cambios.',
        primary: { label: 'Volver a editar' },
      })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  return (
    <section className="admin-page">
      <AdminPageHeader
        eyebrow="Configuración"
        title="Datos de la tienda"
        description="Contacto, redes y políticas que aparecen en la web."
      />
      <form
        className="site-settings-form"
        onSubmit={save}
        aria-busy={loading || saving}
      >
        <section className="admin-card">
          <h2>Identidad y contacto</h2>
          <label className="admin-inline-check">
            <input
              type="checkbox"
              checked={document.data.demonstration}
              disabled={loading || saving || loadFailed}
              onChange={(event) =>
                setDocument((current) => ({
                  ...current,
                  data: {
                    ...current.data,
                    demonstration: event.target.checked,
                  },
                }))
              }
            />
            Datos simulados para esta etapa
          </label>
          <div className="site-settings-grid">
            {field('business', 'name', 'Nombre comercial', 160)}
            {field('business', 'legalName', 'Titular o razón social', 240)}
            {field('business', 'taxId', 'RUC', 11)}
            {field('business', 'address', 'Dirección del negocio', 500)}
            {field('contact', 'whatsapp', 'WhatsApp con código de país', 15)}
            {field('contact', 'email', 'Correo de atención', 254)}
            {field('contact', 'hours', 'Horario de atención', 240)}
          </div>
        </section>
        <section className="admin-card">
          <h2>Redes sociales</h2>
          <p className="muted">
            Deja vacío un enlace para ocultarlo. Contacto y footer usan estos
            mismos perfiles.
          </p>
          <div className="site-settings-grid">
            {field('social', 'instagram', 'Instagram', 500)}
            {field('social', 'facebook', 'Facebook', 500)}
            {field('social', 'tiktok', 'TikTok', 500)}
          </div>
        </section>
        <AdminContactQr />
        <section className="admin-card">
          <h2>Políticas</h2>
          <p className="muted">
            Texto simple. Separa los apartados con una línea en blanco.
          </p>
          <div className="site-settings-grid">
            {field('policies', 'privacy', 'Privacidad', 12000, true)}
            {field('policies', 'terms', 'Términos y condiciones', 12000, true)}
            {field(
              'policies',
              'returns',
              'Cambios y devoluciones',
              12000,
              true,
            )}
          </div>
        </section>
        {error && (
          <div className="site-settings-error">
            <p role="alert">{error}</p>
            {loadFailed && (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setLoading(true)
                  setLoadFailed(false)
                  setError('')
                  setLoadAttempt((attempt) => attempt + 1)
                }}
              >
                Volver a intentar
              </button>
            )}
          </div>
        )}
        <div className="site-settings-actions">
          <button
            className="button button--primary"
            disabled={loading || saving || loadFailed || !dirty}
            type="submit"
          >
            {saving ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </form>
      <AdminTrustedDevices />
    </section>
  )
}
