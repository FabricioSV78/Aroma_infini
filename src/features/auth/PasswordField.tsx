import { useState } from 'react'

export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  fresh = false,
  disabled = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  fresh?: boolean
  disabled?: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          disabled={disabled}
          autoComplete={fresh ? 'new-password' : 'current-password'}
          aria-invalid={Boolean(error)}
          aria-describedby={
            [error ? `${id}-error` : null, fresh ? 'auth-password-hint' : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLocaleLowerCase('es')}`}
          aria-pressed={visible}
          disabled={disabled}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="auth-field-error">
          {error}
        </p>
      )}
    </div>
  )
}
