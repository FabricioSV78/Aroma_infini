import { useSyncExternalStore } from 'react'
import { DESKTOP_VIDEO_QUERY } from '../../domain/media-playback'

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_VIDEO_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const snapshot = () => window.matchMedia(DESKTOP_VIDEO_QUERY).matches
const serverSnapshot = () => false

/** Resolve before mounting a player or assigning a video URL, never via CSS. */
export function useDesktopVideo() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
