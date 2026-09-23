import { createContext, useContext } from 'react'

export interface FavoritesContextValue {
  favoriteIds: ReadonlySet<string>
  favoriteCount: number
  persistence: 'local' | 'session'
  toggleFavorite: (id: string) => void
  removeFavorite: (id: string) => void
}

export const FavoritesContext = createContext<FavoritesContextValue | null>(
  null,
)

export function useFavorites() {
  const value = useContext(FavoritesContext)
  if (!value)
    throw new Error('useFavorites debe utilizarse dentro de FavoritesProvider')
  return value
}
