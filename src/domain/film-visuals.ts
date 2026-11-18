import { editorialFilm } from '../content/editorial-film'
import type { HomeFilmContent } from '../types/home'

export function filmVisualSources(content: HomeFilmContent) {
  return {
    video: content.video ?? editorialFilm.src,
    desktop: content.video ? content.poster : editorialFilm.poster,
    mobile:
      content.mobilePoster ??
      content.poster ??
      (content.video ? editorialFilm.poster : editorialFilm.mobilePoster),
  }
}
