import { useId } from 'react'

interface OrderOperatorControlProps {
  name: string
  onChange: (name: string) => void
  disabled?: boolean
  required?: boolean
}

export function OrderOperatorControl({
  name,
  onChange,
  disabled,
  required,
}: OrderOperatorControlProps) {
  const helpId = useId()
  return (
    <div className="admin-order-operator">
      <label>
        Responsable de los cambios
        <input
          name="orderOperator"
          value={name}
          maxLength={80}
          minLength={required ? 2 : undefined}
          required={required}
          placeholder="Nombre del administrador"
          autoComplete="name"
          aria-describedby={helpId}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <small id={helpId}>Registro local · identidad no verificada</small>
    </div>
  )
}
