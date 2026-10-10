// Extract the outlined, approved cover logo from the client's Illustrator PDF.
// Usage: node scripts/extract-brand-logo.mjs path/to/aroma-infini-manual.pdf
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const pdfPath = process.argv[2]
if (!pdfPath)
  throw new Error('Pass the client brand manual PDF as the first argument.')

const source = readFileSync(pdfPath)
const latin = source.toString('latin1')
const objectStart = latin.indexOf('25 0 obj')
if (objectStart < 0) throw new Error('Cover artwork object 25 was not found.')
const streamTag = latin.indexOf('stream', objectStart)
const streamLength = Number(
  latin.slice(objectStart, streamTag).match(/\/Length\s+(\d+)/)?.[1],
)
if (!streamLength) throw new Error('Could not read the cover artwork length.')
let streamStart = streamTag + 'stream'.length
if (source[streamStart] === 13) streamStart++
if (source[streamStart] === 10) streamStart++
const content = inflateSync(
  source.subarray(streamStart, streamStart + streamLength),
).toString('latin1')
if (
  !content.includes('0 0.224 0.208 rg') ||
  !content.includes('1 0.784 0.553 rg')
) {
  throw new Error(
    'The expected original green and peach cover colors were not found.',
  )
}

const artwork = content.slice(
  content.indexOf('1 0.784 0.553 rg') + '1 0.784 0.553 rg'.length,
)
const lines = artwork
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
const paths = []
let path = null
let offsetX = 0
let offsetY = 0
let point = null
let start = null
const bounds = {
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
}

function addPoint([x, y]) {
  bounds.minX = Math.min(bounds.minX, x)
  bounds.minY = Math.min(bounds.minY, y)
  bounds.maxX = Math.max(bounds.maxX, x)
  bounds.maxY = Math.max(bounds.maxY, y)
}

function cubicValue(p0, p1, p2, p3, t) {
  const u = 1 - t
  return u ** 3 * p0 + 3 * u ** 2 * t * p1 + 3 * u * t ** 2 * p2 + t ** 3 * p3
}

function cubicBounds(p0, p1, p2, p3) {
  addPoint(p0)
  addPoint(p3)
  for (let axis = 0; axis < 2; axis++) {
    const a = -p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]
    const b = 2 * (p0[axis] - 2 * p1[axis] + p2[axis])
    const c = p1[axis] - p0[axis]
    const discriminant = b * b - 4 * a * c
    const roots =
      Math.abs(a) < 1e-9
        ? Math.abs(b) < 1e-9
          ? []
          : [-c / b]
        : discriminant < 0
          ? []
          : [
              (-b + Math.sqrt(discriminant)) / (2 * a),
              (-b - Math.sqrt(discriminant)) / (2 * a),
            ]
    for (const t of roots) {
      if (t > 0 && t < 1 && Number.isFinite(t)) {
        const at = [0, 1].map((j) => cubicValue(p0[j], p1[j], p2[j], p3[j], t))
        addPoint(at)
      }
    }
  }
}

const number = (n) => Number(n.toFixed(3)).toString()
const coordinate = (x, y) => [x + offsetX, 1080 - y - offsetY]
const pair = (p) => `${number(p[0])} ${number(p[1])}`

for (const line of lines) {
  const transform = line.match(/^q 1 0 0 1 ([\d.-]+) ([\d.-]+) cm$/)
  if (transform) {
    offsetX = Number(transform[1])
    offsetY = Number(transform[2])
    path = []
    point = null
    start = null
    continue
  }
  if (!path) continue
  const tokens = line.split(/\s+/)
  const op = tokens.pop()
  const values = tokens.map(Number)
  if (op === 'm') {
    point = coordinate(values[0], values[1])
    start = point
    addPoint(point)
    path.push(`M${pair(point)}`)
  } else if (op === 'l') {
    const next = coordinate(values[0], values[1])
    addPoint(next)
    path.push(`L${pair(next)}`)
    point = next
  } else if (op === 'c' || op === 'v' || op === 'y') {
    if (!point) throw new Error('A Bézier curve has no starting point.')
    const p1 = op === 'v' ? point : coordinate(values[0], values[1])
    const p2 =
      op === 'c'
        ? coordinate(values[2], values[3])
        : op === 'v'
          ? coordinate(values[0], values[1])
          : coordinate(values[2], values[3])
    const end =
      op === 'c'
        ? coordinate(values[4], values[5])
        : coordinate(values[2], values[3])
    const c2 = op === 'y' ? end : p2
    cubicBounds(point, p1, c2, end)
    path.push(`C${pair(p1)} ${pair(c2)} ${pair(end)}`)
    point = end
  } else if (op === 'h') {
    path.push('Z')
    point = start
  } else if (op === 'f') {
    paths.push(path.join(' '))
  } else if (op === 'Q') {
    path = null
  } else {
    throw new Error(`Unexpected PDF artwork operator: ${line}`)
  }
}

if (paths.length !== 14)
  throw new Error(`Expected 14 outlined logo shapes, found ${paths.length}.`)
const left = Math.floor(bounds.minX - 1)
const top = Math.floor(bounds.minY - 1)
const width = Math.ceil(bounds.maxX + 1) - left
const height = Math.ceil(bounds.maxY + 1) - top
function makeSvg(fill, background) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}" role="img" aria-labelledby="title">
  <title id="title">Aroma Infini</title>
${background ? `  <rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${background}"/>\n` : ''}  <g fill="${fill}">
${paths.map((d) => `    <path d="${d}"/>`).join('\n')}
  </g>
</svg>
`
}
const outputDir = join(process.cwd(), 'public', 'brand')
mkdirSync(outputDir, { recursive: true })
writeFileSync(
  join(outputDir, 'logo-on-dark.svg'),
  makeSvg('#FFC88D', '#003935'),
)
writeFileSync(join(outputDir, 'logo-on-light.svg'), makeSvg('#003935', null))
console.log(
  `Extracted ${paths.length} paths, viewBox ${left} ${top} ${width} ${height}.`,
)
