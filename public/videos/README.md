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

Mobile uses a separate portrait composition so the subject remains visible:

`perfume-ritual.mp4`: Woman Spraying Perfume, Yaroslav Shuraev / Pexels.
Source: https://www.pexels.com/video/woman-spraying-perfume-6793134/
License: https://www.pexels.com/license/ (reviewed 2026-09-29).
Local HD file: 720 × 1280, 24 fps, approximately 16 seconds, 3.46 MB.
`perfume-ritual.webp` is a frame from the same clip.

Used as a general perfume ritual, without suggesting that the model endorses
Aroma Infini or a particular fragrance. No third-party player or tracking.

To replace: update desktop/mobile sources and posters in `src/content/editorial-film.ts`.
Prefer a silent H.264 MP4, 10–16 seconds, with a matching WebP poster;
use 1920px panoramic footage for desktop and 720px portrait footage for mobile.
Keep the subject visible throughout each composition. The component defers
video loading until visible; reduced motion and data saving display the poster.
Playback has no visible controls; it pauses outside the viewport or in a hidden tab.
