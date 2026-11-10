// Compatibility entry point; persistence is shared with route data loaders.
export {
  parseStoredFavorites,
  readFavorites,
  writeFavorites,
  isFavoritesStorageEvent,
} from '../../services/favorites-storage'
