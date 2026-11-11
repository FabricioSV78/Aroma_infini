export const STATIC_SVG_MAX_BYTES = 512 * 1024

/** A bounded static SVG dialect shared by upload admission and backup checks.
 * Parses text only: no XML expansion, browser rendering, links or execution. */
export function inspectStaticSvg(buffer) {
  if (!buffer.byteLength || buffer.byteLength > STATIC_SVG_MAX_BYTES)
    throw new Error('SVG size')
  const text = new globalThis.TextDecoder('utf-8', {
    fatal: true,
    ignoreBOM: false,
  })
    .decode(buffer)
    .trim()
  if (
    !text.startsWith('<svg ') ||
    /&|<!|<\?/.test(text) ||
    [...text].some(
      (char) => char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char),
    )
  )
    throw new Error('SVG markup')
  const elements = new Set([
    'svg',
    'g',
    'path',
    'title',
    'desc',
    'defs',
    'linearGradient',
    'radialGradient',
    'stop',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'clipPath',
    'mask',
  ])
  const attributes = new Set([
    'xmlns',
    'viewBox',
    'width',
    'height',
    'id',
    'role',
    'aria-labelledby',
    'aria-label',
    'fill',
    'fill-rule',
    'clip-rule',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'opacity',
    'fill-opacity',
    'stroke-opacity',
    'transform',
    'd',
    'points',
    'x',
    'y',
    'x1',
    'y1',
    'x2',
    'y2',
    'cx',
    'cy',
    'r',
    'rx',
    'ry',
    'offset',
    'stop-color',
    'stop-opacity',
    'gradientUnits',
    'gradientTransform',
    'clipPathUnits',
    'clip-path',
    'mask',
  ])
  const stack = []
  let cursor = 0,
    count = 0,
    dimensions = null,
    closed = false
  const tokens = /<[^<>]*>/g
  for (const match of text.matchAll(tokens)) {
    const at = match.index,
      between = text.slice(cursor, at)
    if (between.trim() && !['title', 'desc'].includes(stack.at(-1) ?? ''))
      throw new Error('SVG text')
    if (between.length > 2048 || /[<>]/.test(between) || closed)
      throw new Error('SVG syntax')
    const tag = /^<(\/)?([A-Za-z][A-Za-z0-9]*)([\s\S]*?)(\/?)>$/.exec(match[0])
    if (!tag || !elements.has(tag[2]) || ++count > 4096)
      throw new Error('SVG element')
    const [, closing, name, raw, selfClosing] = tag
    if (closing) {
      if (raw.trim() || selfClosing || stack.pop() !== name)
        throw new Error('SVG nesting')
      if (!stack.length) closed = true
    } else {
      if (
        (!stack.length && (name !== 'svg' || dimensions)) ||
        (stack.length && name === 'svg')
      )
        throw new Error('SVG root')
      const values = {}
      let position = 0
      const pairs =
        /\s+([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/y
      while (position < raw.length) {
        if (!raw.slice(position).trim()) break
        pairs.lastIndex = position
        const pair = pairs.exec(raw)
        if (!pair) throw new Error('SVG attribute syntax')
        const key = pair[1],
          value = pair[2] ?? pair[3]
        if (
          !attributes.has(key) ||
          Object.hasOwn(values, key) ||
          value.length > 131072
        )
          throw new Error('SVG attribute')
        if (
          /(?:https?:|data:|javascript:|@import|expression\s*\()/i.test(
            value,
          ) &&
          !(key === 'xmlns' && value === 'http://www.w3.org/2000/svg')
        )
          throw new Error('SVG URL attribute')
        if (
          key === 'xmlns' &&
          (stack.length || value !== 'http://www.w3.org/2000/svg')
        )
          throw new Error('SVG namespace')
        if (
          /url\s*\(/i.test(value) &&
          !/^url\(#[A-Za-z][\w:-]{0,79}\)$/.test(value)
        )
          throw new Error('SVG URL')
        values[key] = value
        position = pairs.lastIndex
      }
      if (raw.slice(position).trim()) throw new Error('SVG malformed attribute')
      if (!stack.length) {
        if (values.xmlns !== 'http://www.w3.org/2000/svg')
          throw new Error('SVG namespace missing')
        const box = values.viewBox
          ?.trim()
          .split(/[\s,]+/)
          .map(Number)
        if (
          !box ||
          box.length !== 4 ||
          box.some((n) => !Number.isFinite(n)) ||
          box[2] <= 0 ||
          box[3] <= 0
        )
          throw new Error('SVG viewbox')
        const width = values.width ? Number(values.width) : box[2],
          height = values.height ? Number(values.height) : box[3]
        if (
          !Number.isSafeInteger(width) ||
          !Number.isSafeInteger(height) ||
          width < 1 ||
          height < 1 ||
          width > 4096 ||
          height > 4096
        )
          throw new Error('SVG dimensions')
        dimensions = { width, height }
      }
      if (!selfClosing) {
        stack.push(name)
        if (stack.length > 24) throw new Error('SVG depth')
      } else if (!stack.length) closed = true
    }
    cursor = at + match[0].length
  }
  if (!closed || stack.length || text.slice(cursor).trim() || !dimensions)
    throw new Error('SVG incomplete')
  return dimensions
}
