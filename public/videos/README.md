# Editorial film

Desktop and tablet: `perfume-editorial-wide.mp4`, Woman Spraying Perfume on Herself,
Roman Odintsov / Pexels.
Source: https://www.pexels.com/video/woman-spraying-perfume-on-herself-6810589/
Original: https://videos.pexels.com/video-files/6810589/6810589-uhd_4096_1974_30fps.mp4
Local derivative: 1920 × 926, silent H.264, about 12 seconds, 6.38 MB.
The 5–17 second excerpt preserves the original panoramic framing.
`perfume-editorial-wide.webp` is its opening frame.
To regenerate, download the original to `artifacts/perfume-wide-source.mp4`,
start Vite, then run `node scripts/prepare-editorial-film.mjs --encode`.

Mobile: `perfume-editorial-mobile.mp4`, **the same Roman Odintsov film and
5–17 second excerpt as desktop**, exported from the original 4096 × 1974 source.
Local derivative: 720 × 900 (4:5), silent H.264, approximately 12 seconds,
3.24 MB. The focal point at 58.5% of the original width keeps the face and
bottle together; a narrower 9:16 crop cuts one of them. No stretching or
upscaling. `perfume-editorial-mobile.webp` is its matching opening frame.
The mobile section follows this framing while retaining room for its text.

To regenerate the mobile derivative, download the same original to
`artifacts/perfume-wide-source.mp4`, start Vite, and run:

```sh
node scripts/prepare-editorial-mobile.mjs
```

The optional first argument overrides the source path; `VIDEO_PREPARE_ORIGIN`
overrides the local Vite origin. Chrome performs the local H.264 export; no
third-party encoder or dependency is added to the storefront.

The earlier `perfume-ritual.mp4` / `.webp` pair belongs to Yaroslav Shuraev,
Pexels 6793134 (https://www.pexels.com/video/woman-spraying-perfume-6793134/).
It is no longer used by the Home. It remains for the historical
`scripts/capture-editorial-review.mjs` capture workflow; it must not be selected
as the mobile source again.
License: https://www.pexels.com/license/ (reviewed 2026-09-29).

Used as a general perfume ritual, without suggesting that the model endorses
Aroma Infini or a particular fragrance. No third-party player or tracking.

To replace: update desktop/mobile sources and posters in `src/content/editorial-film.ts`.
Prefer a silent H.264 MP4, 10–16 seconds, with a matching WebP poster;
derive both resolutions from the same footage and excerpt. Desktop uses a
1920px panoramic export; mobile uses a 720px-wide portrait export.
Keep the subject visible throughout each composition. The component defers
video loading until visible; reduced motion and data saving display the poster.
An accessible play/pause button is available. Playback pauses outside the
viewport or in a hidden tab. An administrator's uploaded video and its matching
poster continue to override both defaults, keeping the same clip on all devices.
