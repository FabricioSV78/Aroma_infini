import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import {
  deliveryMapLink,
  initialDeliveryMapCenter,
  isDeliveryLocation,
} from '../../domain/delivery-location'
import type { DeliveryLocation } from '../../types/commerce'

const DeliveryLocationMap = lazy(() => import('./DeliveryLocationMap'))

interface AddressLocationPickerProps {
  value?: DeliveryLocation | null
  disabled: boolean
  onChange: (point: DeliveryLocation | null) => void
}

export function AddressLocationPicker({
  value,
  disabled,
  onChange,
}: AddressLocationPickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DeliveryLocation | null>(null)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [mapRevision, setMapRevision] = useState(0)
  const request = useRef(0)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const savedPoint = isDeliveryLocation(value) ? value : null

  useEffect(function cancelLocationOnUnmount() {
    return () => {
      request.current += 1
    }
  }, [])

  function close() {
    request.current += 1
    setLocating(false)
    setOpen(false)
  }
  function locate() {
    const id = ++request.current
    setError('')
    if (!window.isSecureContext || !navigator.geolocation) {
      setError(
        'Este navegador no permite obtener tu ubicación. Puedes elegirla en el mapa.',
      )
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (id !== request.current) return
        setLocating(false)
        const point = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }
        if (!isDeliveryLocation(point)) {
          setError('No pudimos obtener un punto válido. Elígelo en el mapa.')
          return
        }
        setDraft(point)
        setMapRevision((current) => current + 1)
        setAccuracy(
          Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
        )
      },
      (failure) => {
        if (id !== request.current) return
        setLocating(false)
        setError(
          failure.code === 1
            ? 'No se permitió acceder a tu ubicación. Puedes habilitar el permiso en tu navegador o elegir el punto en el mapa.'
            : failure.code === 3
              ? 'La ubicación tardó demasiado. Inténtalo de nuevo o elige el punto en el mapa.'
              : 'No pudimos obtener tu ubicación. Comprueba el GPS o elige el punto en el mapa.',
        )
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }
  function begin(button: HTMLButtonElement, useGps: boolean) {
    returnFocus.current = button
    setDraft(savedPoint)
    setError('')
    setAccuracy(null)
    setOpen(true)
    if (useGps) locate()
  }
  function select(point: DeliveryLocation) {
    request.current += 1
    setLocating(false)
    setError('')
    setAccuracy(null)
    setDraft(point)
  }

  return (
    <section
      className="address-location"
      aria-labelledby="address-location-title"
    >
      <div className="address-location-heading">
        <h2 id="address-location-title">
          <Icon name="mapPin" />
          Ubicación precisa <span>Opcional</span>
        </h2>
        <p>
          Marca el punto de entrega. Mantén también tu calle, número y distrito.
        </p>
      </div>
      <div className="address-location-actions">
        <button
          type="button"
          className="button button--secondary"
          disabled={disabled}
          onClick={(event) => begin(event.currentTarget, true)}
        >
          <Icon name="locate" />
          Usar mi ubicación
        </button>
        <button
          type="button"
          className="text-link"
          disabled={disabled}
          onClick={(event) => begin(event.currentTarget, false)}
        >
          {savedPoint ? 'Ajustar ubicación' : 'Elegir en el mapa'}
          <Icon name="arrow" />
        </button>
      </div>
      {savedPoint ? (
        <div className="address-location-selected" role="status">
          <div>
            <strong>
              <Icon name="check" />
              Ubicación seleccionada
            </strong>
            <a
              href={deliveryMapLink(savedPoint)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver en Google Maps
              <span className="sr-only"> (abre otra pestaña)</span>
            </a>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            Quitar ubicación
          </button>
        </div>
      ) : null}
      {open ? (
        <Dialog
          open={open}
          onClose={close}
          title="Elegir ubicación de entrega"
          id="address-location-dialog"
          className="address-location-dialog"
          returnFocusRef={returnFocus}
          descriptionId="delivery-map-instructions"
        >
          <p
            id="delivery-map-instructions"
            className="address-location-instructions"
          >
            Toca el lugar o mueve el mapa hasta colocar el pin en la entrada.
            Con teclado, usa las flechas para ajustar el punto.
          </p>
          <button
            type="button"
            className="address-location-gps"
            onClick={locate}
            disabled={locating}
          >
            <Icon name="locate" />
            {locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
          </button>
          <p
            className="address-location-feedback"
            role={error ? 'alert' : 'status'}
          >
            {error ||
              (locating
                ? 'Acepta el permiso de ubicación si tu navegador lo solicita.'
                : accuracy !== null
                  ? `Precisión aproximada: ${accuracy} m. ${accuracy > 100 ? 'Revisa y ajusta el punto antes de confirmarlo.' : 'Confirma que el pin esté en la entrada.'}`
                  : draft
                    ? 'Confirma que el pin esté en el lugar de entrega.'
                    : 'Selecciona un punto para continuar.')}
          </p>
          <Suspense
            fallback={
              <div className="delivery-map-loading" role="status">
                Cargando mapa…
              </div>
            }
          >
            <DeliveryLocationMap
              key={mapRevision}
              center={draft ?? initialDeliveryMapCenter}
              selected={Boolean(draft)}
              onSelect={select}
            />
          </Suspense>
          <p className="address-location-privacy">
            Mapa de OpenStreetMap. Tu ubicación se obtiene solo al pulsar el
            botón y se guarda al guardar la dirección.
          </p>
          <div className="address-location-dialog-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={close}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={!draft || locating}
              onClick={() => {
                if (!draft) return
                onChange(draft)
                close()
              }}
            >
              Usar este punto
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  )
}
