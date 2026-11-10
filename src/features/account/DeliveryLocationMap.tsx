import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { DeliveryLocation } from '../../types/commerce'
import {
  locationToMapPixel,
  mapPixelToLocation,
} from '../../domain/delivery-location'
import { Icon } from '../../components/ui/Icon'

interface DeliveryLocationMapProps {
  center: DeliveryLocation
  selected: boolean
  onSelect: (point: DeliveryLocation) => void
}

const tileSize = 256
const minimumZoom = 3
const maximumZoom = 19
const defaultTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
// Public raster URL only. Server credentials must never appear in VITE_.
const configuredTiles = import.meta.env.VITE_ADDRESS_MAP_TILE_URL?.trim()
const tileTemplate =
  configuredTiles?.startsWith('https://') &&
  ['{z}', '{x}', '{y}'].every((part) => configuredTiles.includes(part))
    ? configuredTiles
    : defaultTiles

/** On-demand raster viewport, without tracking, geocoding or prefetching. */
export default function DeliveryLocationMap({
  center,
  selected,
  onSelect,
}: DeliveryLocationMapProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const gesture = useRef<{
    id: number
    clientX: number
    clientY: number
    worldX: number
    worldY: number
    moved: boolean
  } | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(selected ? 17 : 12)
  const [tileError, setTileError] = useState(false)
  const [retry, setRetry] = useState(0)
  const pixel = locationToMapPixel(center, zoom)

  useEffect(function observeMapSize() {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function changeZoom(delta: number) {
    setZoom((current) =>
      Math.max(minimumZoom, Math.min(maximumZoom, current + delta)),
    )
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const direction = directions[event.key]
    if (direction) {
      event.preventDefault()
      const step = event.shiftKey ? 120 : 24
      onSelect(
        mapPixelToLocation(
          pixel.x + direction[0] * step,
          pixel.y + direction[1] * step,
          zoom,
        ),
      )
    } else if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault()
      changeZoom(event.key === '-' ? -1 : 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(center)
    }
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      id: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      worldX: pixel.x,
      worldY: pixel.y,
      moved: false,
    }
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current
    if (!start || start.id !== event.pointerId) return
    const dx = event.clientX - start.clientX
    const dy = event.clientY - start.clientY
    if (!start.moved && Math.hypot(dx, dy) < 5) return
    start.moved = true
    onSelect(mapPixelToLocation(start.worldX - dx, start.worldY - dy, zoom))
  }
  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current
    if (!start || start.id !== event.pointerId) return
    if (!start.moved) {
      const bounds = event.currentTarget.getBoundingClientRect()
      onSelect(
        mapPixelToLocation(
          pixel.x + event.clientX - bounds.left - bounds.width / 2,
          pixel.y + event.clientY - bounds.top - bounds.height / 2,
          zoom,
        ),
      )
    }
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const tiles = []
  const columns = 2 ** zoom
  const left = pixel.x - size.width / 2
  const top = pixel.y - size.height / 2
  // Only fetch tiles intersecting the current viewport, never other zooms.
  if (size.width && size.height) {
    for (
      let x = Math.floor(left / tileSize);
      x <= Math.floor((left + size.width) / tileSize);
      x++
    ) {
      for (
        let y = Math.floor(top / tileSize);
        y <= Math.floor((top + size.height) / tileSize);
        y++
      ) {
        if (y < 0 || y >= columns) continue
        const wrappedX = ((x % columns) + columns) % columns
        const src = tileTemplate
          .replace('{z}', String(zoom))
          .replace('{x}', String(wrappedX))
          .replace('{y}', String(y))
        tiles.push(
          <img
            key={`${zoom}/${x}/${y}/${retry}`}
            src={src}
            alt=""
            draggable={false}
            width={tileSize}
            height={tileSize}
            decoding="async"
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ left: x * tileSize - left, top: y * tileSize - top }}
            onError={() => setTileError(true)}
          />,
        )
      }
    }
  }

  return (
    <div className="delivery-map">
      <div
        ref={viewport}
        className="delivery-map-viewport"
        role="group"
        aria-label="Mapa para elegir la ubicación"
        aria-describedby="delivery-map-instructions"
        tabIndex={0}
        onKeyDown={keyboard}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          gesture.current = null
        }}
        onLostPointerCapture={() => {
          gesture.current = null
        }}
      >
        {tiles}
        <span
          className={`delivery-map-pin${selected ? ' is-selected' : ''}`}
          aria-hidden="true"
        >
          <Icon name="mapPin" />
        </span>
      </div>
      <div className="delivery-map-zoom" aria-label="Zoom del mapa">
        <button
          type="button"
          aria-label="Acercar mapa"
          disabled={zoom >= maximumZoom}
          onClick={() => changeZoom(1)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Alejar mapa"
          disabled={zoom <= minimumZoom}
          onClick={() => changeZoom(-1)}
        >
          −
        </button>
      </div>
      <div className="delivery-map-credit">
        {import.meta.env.VITE_ADDRESS_MAP_ATTRIBUTION ? (
          <span>{import.meta.env.VITE_ADDRESS_MAP_ATTRIBUTION} · </span>
        ) : null}
        ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>
      </div>
      {tileError ? (
        <div className="delivery-map-error" role="status">
          <span>
            No se pudo cargar el mapa. Conservamos tu dirección y el punto
            seleccionado.
          </span>
          <button
            type="button"
            onClick={() => {
              setTileError(false)
              setRetry((current) => current + 1)
            }}
          >
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  )
}
