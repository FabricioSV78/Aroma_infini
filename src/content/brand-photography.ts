// Editorial counterparts of the existing catalog photographs. Matching the
// image key keeps a replacement/uploaded product photo from inheriting a scene
// belonging to a different bottle.
export const brandPhotography: Record<
  string,
  { image: string; widths: readonly number[] }
> = {
  cedre: { image: 'discovery-bois', widths: [480, 960] },
  petale: { image: 'discovery-petale', widths: [480, 960] },
  sillage: { image: 'hero-v2-silence-mobile', widths: [480, 780, 1024] },
  ambre: { image: 'brand-ambre-editorial', widths: [480, 960] },
}
