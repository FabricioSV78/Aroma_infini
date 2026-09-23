import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  FavoritesContext,
  type FavoritesContextValue,
} from './favorites-context'
import {
  isFavoritesStorageEvent,
  parseStoredFavorites,
  readFavorites,
  writeFavorites,
} from './favorites-storage'

interface FavoriteState {
  ids: string[]
  persistence: 'local' | 'session'
}

function readInitialState(): FavoriteState {
  try {
    return { ids: readFavorites(), persistence: 'local' }
  } catch {
    return { ids: [], persistence: 'session' }
  }
}

function nextFavoriteState(
  current: FavoriteState,
  ids: string[],
): FavoriteState {
  return { ...current, ids }
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FavoriteState>(readInitialState)

  useEffect(function synchronizeFavorites() {
    function handleStorage(event: StorageEvent) {
      if (!isFavoritesStorageEvent(event)) return
      setState((current) => ({
        ...current,
        ids: parseStoredFavorites(event.newValue),
      }))
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  useEffect(
    function persistFavorites() {
      if (state.persistence === 'session') return
      let fallbackTimer: number | undefined
      try {
        writeFavorites(state.ids)
      } catch {
        fallbackTimer = window.setTimeout(() => {
          setState((current) => ({ ...current, persistence: 'session' }))
        }, 0)
      }
      return () => window.clearTimeout(fallbackTimer)
    },
    [state.ids, state.persistence],
  )

  const toggleFavorite = useCallback((id: string) => {
    setState((current) => {
      const ids = current.ids.includes(id)
        ? current.ids.filter((favoriteId) => favoriteId !== id)
        : [...current.ids, id]
      return nextFavoriteState(current, ids)
    })
  }, [])

  const removeFavorite = useCallback((id: string) => {
    setState((current) =>
      nextFavoriteState(
        current,
        current.ids.filter((favoriteId) => favoriteId !== id),
      ),
    )
  }, [])

  const value = useMemo<FavoritesContextValue>(() => {
    const favoriteIds = new Set(state.ids)
    return {
      favoriteIds,
      favoriteCount: favoriteIds.size,
      persistence: state.persistence,
      toggleFavorite,
      removeFavorite,
    }
  }, [removeFavorite, state.ids, state.persistence, toggleFavorite])

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  )
}
