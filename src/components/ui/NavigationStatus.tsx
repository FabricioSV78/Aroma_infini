import { useNavigation } from 'react-router'

/** Keeps the current screen usable while the router fetches the next one. */
export function NavigationStatus() {
  const navigation = useNavigation()
  const busy = navigation.state !== 'idle'
  return (
    <div
      className="ui-navigation-status"
      role={busy ? 'status' : undefined}
      aria-live="polite"
    >
      {busy ? (
        <>
          <span className="ui-navigation-progress" aria-hidden="true" />
          <span className="sr-only">Cargando la página…</span>
        </>
      ) : null}
    </div>
  )
}
