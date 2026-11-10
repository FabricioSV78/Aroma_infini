import {
  MEDIA_VIDEO_MAX_BYTES,
  MEDIA_VIDEO_MAX_DURATION_MS,
} from '../src/domain/media'

interface Box {
  type: string
  start: number
  data: number
  end: number
  depth: number
}
interface Sample {
  start: number
  size: number
  track: Track
}
interface Track {
  id: number
  kind: string
  timescale: number
  width: number
  height: number
  lengthBytes: number
  samples: number
  duration: number
  lastEnd: number
  table: Box
}
interface Defaults {
  description: number
  duration: number
  size: number
}

/** Read bounded AVC sequence parameters so a forged sample-entry size cannot
 * conceal a much larger encoded canvas. This still does not decode frames. */
function avcSequenceDimensions(nal: Uint8Array) {
  const rbsp: number[] = []
  for (let i = 1; i < nal.length; i++) {
    if (i >= 3 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue
    rbsp.push(nal[i])
  }
  let position = 0
  function bits(count: number) {
    if (count < 0 || count > 32 || position + count > rbsp.length * 8)
      throw new Error('Truncated AVC sequence')
    let value = 0
    for (let i = 0; i < count; i++, position++)
      value = value * 2 + ((rbsp[position >> 3] >> (7 - (position & 7))) & 1)
    return value
  }
  function unsigned() {
    let zeros = 0
    while (!bits(1)) if (++zeros > 24) throw new Error('Invalid AVC integer')
    return 2 ** zeros - 1 + bits(zeros)
  }
  function signed() {
    const n = unsigned()
    return n & 1 ? (n + 1) / 2 : -n / 2
  }
  const profile = bits(8)
  bits(16)
  if (unsigned() > 31) throw new Error('Invalid AVC sequence ID')
  let chroma = 1,
    separate = 0
  if (
    [100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(
      profile,
    )
  ) {
    chroma = unsigned()
    if (chroma > 3) throw new Error('Invalid AVC chroma format')
    if (chroma === 3) separate = bits(1)
    if (unsigned() !== 0 || unsigned() !== 0)
      throw new Error('Only 8-bit AVC is supported')
    bits(1)
    if (bits(1))
      for (let index = 0; index < (chroma === 3 ? 12 : 8); index++) {
        if (!bits(1)) continue
        let last = 8,
          next = 8
        for (let entry = 0; entry < (index < 6 ? 16 : 64); entry++) {
          if (next) next = (last + signed() + 256) % 256
          last = next || last
        }
      }
  }
  if (unsigned() > 12) throw new Error('Invalid AVC frame number')
  const order = unsigned()
  if (order === 0) {
    if (unsigned() > 12) throw new Error('Invalid AVC ordering')
  } else if (order === 1) {
    bits(1)
    signed()
    signed()
    const cycle = unsigned()
    if (cycle > 255) throw new Error('Invalid AVC ordering cycle')
    for (let index = 0; index < cycle; index++) signed()
  } else if (order !== 2) throw new Error('Invalid AVC ordering type')
  if (unsigned() > 16) throw new Error('Invalid AVC reference count')
  bits(1)
  const columns = unsigned() + 1,
    rows = unsigned() + 1
  if (columns > 256 || rows > 256) throw new Error('AVC canvas exceeds limits')
  const frames = bits(1)
  if (!frames) bits(1)
  bits(1)
  let left = 0,
    right = 0,
    top = 0,
    bottom = 0
  if (bits(1)) {
    left = unsigned()
    right = unsigned()
    top = unsigned()
    bottom = unsigned()
  }
  const array = separate ? 0 : chroma
  const cropX = array === 1 || array === 2 ? 2 : 1
  const cropY = (array === 1 ? 2 : 1) * (2 - frames)
  return {
    width: columns * 16 - (left + right) * cropX,
    height: rows * 16 * (2 - frames) - (top + bottom) * cropY,
  }
}

/** Structural ISO-BMFF/AVC validation, not a promise of decoding every H.264 frame.
 * Deliberately accepts self-contained MP4 only: one AVC video and optional AAC.
 */
export function inspectMp4(buffer: ArrayBuffer): {
  width: number
  height: number
  durationMs: number
} {
  const bytes = new Uint8Array(buffer),
    view = new DataView(buffer)
  if (bytes.length < 64 || bytes.length > MEDIA_VIDEO_MAX_BYTES)
    throw new Error('MP4 size limit')
  let boxesRead = 0,
    totalSamples = 0
  function fail(): never {
    throw new Error('Invalid or unsupported MP4 structure')
  }
  function need(at: number, length: number, end = bytes.length) {
    if (
      !Number.isSafeInteger(at) ||
      !Number.isSafeInteger(length) ||
      at < 0 ||
      length < 0 ||
      at + length > end ||
      end > bytes.length
    )
      fail()
  }
  function u32(at: number, end = bytes.length) {
    need(at, 4, end)
    return view.getUint32(at)
  }
  function u16(at: number, end = bytes.length) {
    need(at, 2, end)
    return view.getUint16(at)
  }
  function u64(at: number, end = bytes.length) {
    need(at, 8, end)
    const value = view.getBigUint64(at)
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail()
    return Number(value)
  }
  function tag(at: number) {
    need(at, 4)
    return String.fromCharCode(
      bytes[at],
      bytes[at + 1],
      bytes[at + 2],
      bytes[at + 3],
    )
  }
  function children(start: number, end: number, depth = 0): Box[] {
    if (depth > 16) fail()
    const list: Box[] = []
    for (let offset = start; offset < end;) {
      need(offset, 8, end)
      if (++boxesRead > 10000) fail()
      let size = u32(offset, end),
        header = 8
      const type = tag(offset + 4)
      if (size === 1) {
        size = u64(offset + 8, end)
        header = 16
      }
      if (size === 0) size = end - offset
      if (size < header || offset + size > end) fail()
      list.push({
        type,
        start: offset,
        data: offset + header,
        end: offset + size,
        depth,
      })
      offset += size
    }
    return list
  }
  function inside(box: Box, skip = 0) {
    need(box.data, skip, box.end)
    return children(box.data + skip, box.end, box.depth + 1)
  }
  function one(list: Box[], type: string) {
    const matches = list.filter((b) => b.type === type)
    if (matches.length !== 1) fail()
    return matches[0]
  }
  function full(box: Box, version = 0) {
    need(box.data, 4, box.end)
    if (bytes[box.data] !== version) fail()
    return u32(box.data, box.end) & 0xffffff
  }
  function entries(box: Box, stride: number, offset = 8) {
    full(box)
    const count = u32(box.data + 4, box.end)
    if (count > 65536 || box.data + offset + count * stride !== box.end) fail()
    return count
  }
  function duration(box: Box) {
    need(box.data, 4, box.end)
    const version = bytes[box.data]
    if (version !== 0 && version !== 1) fail()
    const at = box.data + (version ? 20 : 12)
    const scale = u32(at, box.end),
      units = version ? u64(at + 4, box.end) : u32(at + 4, box.end)
    if (!scale || units / scale > 60.1) fail()
    return { scale, units }
  }
  const top = children(0, bytes.length)
  const ftyp = one(top, 'ftyp')
  if (
    ftyp.start !== 0 ||
    ftyp.end - ftyp.data < 8 ||
    (ftyp.end - ftyp.data) % 4 !== 0
  )
    fail()
  const brands = [tag(ftyp.data)]
  for (let at = ftyp.data + 8; at < ftyp.end; at += 4) brands.push(tag(at))
  if (
    !brands.some((value) =>
      ['isom', 'iso2', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1'].includes(value),
    )
  )
    fail()
  // Reject encryption, playlists, external references and unknown top-level payloads.
  if (
    top.some(
      (b) =>
        ![
          'ftyp',
          'moov',
          'mdat',
          'moof',
          'mfra',
          'free',
          'skip',
          'wide',
          'sidx',
        ].includes(b.type),
    )
  )
    fail()
  const mdats = top.filter((b) => b.type === 'mdat')
  if (!mdats.length || mdats.some((b) => b.data === b.end)) fail()
  const moov = inside(one(top, 'moov'))
  const movie = duration(one(moov, 'mvhd'))
  const trackBoxes = moov.filter((b) => b.type === 'trak')
  if (!trackBoxes.length || trackBoxes.length > 4) fail()
  const tracks = new Map<number, Track>(),
    samples: Sample[] = []
  function addSample(track: Track, start: number, size: number, units: number) {
    if (
      ++totalSamples > 65536 ||
      size < 1 ||
      units < 1 ||
      !Number.isSafeInteger(start) ||
      !mdats.some((m) => start >= m.data && start + size <= m.end)
    )
      fail()
    samples.push({ start, size, track })
    track.samples++
    track.duration += units
  }
  for (const box of trackBoxes) {
    const contents = inside(box),
      tkhd = one(contents, 'tkhd'),
      media = inside(one(contents, 'mdia'))
    const version = bytes[tkhd.data]
    if (version > 1) fail()
    const id = u32(tkhd.data + (version ? 20 : 12), tkhd.end)
    if (!id || tracks.has(id)) fail()
    const hdlr = one(media, 'hdlr')
    full(hdlr)
    const kind = tag(hdlr.data + 8)
    if (kind !== 'vide' && kind !== 'soun') fail()
    const timing = duration(one(media, 'mdhd')),
      minf = inside(one(media, 'minf'))
    const dref = one(inside(one(minf, 'dinf')), 'dref')
    full(dref)
    const refs = inside(dref, 8)
    if (
      u32(dref.data + 4, dref.end) !== 1 ||
      refs.length !== 1 ||
      refs[0].type !== 'url ' ||
      full(refs[0]) !== 1 ||
      refs[0].end - refs[0].data > 5
    )
      fail()
    const table = one(minf, 'stbl'),
      stbl = inside(table),
      stsd = one(stbl, 'stsd')
    full(stsd)
    const descriptions = inside(stsd, 8)
    if (u32(stsd.data + 4, stsd.end) !== 1 || descriptions.length !== 1) fail()
    const entry = descriptions[0]
    if (u16(entry.data + 6, entry.end) !== 1) fail()
    let width = 0,
      height = 0,
      lengthBytes = 0
    if (kind === 'vide') {
      if (entry.type !== 'avc1') fail()
      need(entry.data, 78, entry.end)
      width = u16(entry.data + 24, entry.end)
      height = u16(entry.data + 26, entry.end)
      if (width < 480 || height < 480 || width > 4096 || height > 4096) fail()
      const extensions = inside(entry, 78)
      if (extensions.some((e) => ['sinf', 'encv'].includes(e.type))) fail()
      const avc = one(extensions, 'avcC')
      need(avc.data, 7, avc.end)
      if (bytes[avc.data] !== 1) fail()
      lengthBytes = (bytes[avc.data + 4] & 3) + 1
      if (lengthBytes !== 4 && lengthBytes !== 2 && lengthBytes !== 1) fail()
      let at = avc.data + 6
      const sps = bytes[avc.data + 5] & 31
      if (!sps || sps > 16) fail()
      for (let n = 0; n < sps; n++) {
        const length = u16(at, avc.end)
        at += 2
        need(at, length, avc.end)
        if (!length || (bytes[at] & 31) !== 7) fail()
        const encoded = avcSequenceDimensions(bytes.subarray(at, at + length))
        if (encoded.width !== width || encoded.height !== height) fail()
        at += length
      }
      need(at, 1, avc.end)
      const pps = bytes[at++]
      if (!pps || pps > 16) fail()
      for (let n = 0; n < pps; n++) {
        const length = u16(at, avc.end)
        at += 2
        need(at, length, avc.end)
        if (!length || (bytes[at] & 31) !== 8) fail()
        at += length
      }
    } else if (entry.type !== 'mp4a') fail()
    tracks.set(id, {
      id,
      kind,
      timescale: timing.scale,
      width,
      height,
      lengthBytes,
      samples: 0,
      duration: 0,
      lastEnd: 0,
      table,
    })
  }
  if ([...tracks.values()].filter((t) => t.kind === 'vide').length !== 1) fail()
  const defaults = new Map<number, Defaults>()
  const mvex = moov.find((b) => b.type === 'mvex')
  if (mvex)
    for (const trex of inside(mvex)) {
      if (
        trex.type !== 'trex' ||
        full(trex) !== 0 ||
        trex.end - trex.data !== 24
      )
        fail()
      const id = u32(trex.data + 4),
        description = u32(trex.data + 8)
      if (!tracks.has(id) || defaults.has(id) || description !== 1) fail()
      defaults.set(id, {
        description,
        duration: u32(trex.data + 12),
        size: u32(trex.data + 16),
      })
    }
  // Classic non-fragmented MP4 sample tables.
  for (const track of tracks.values()) {
    const table = inside(track.table),
      stsz = one(table, 'stsz')
    full(stsz)
    const fixedSize = u32(stsz.data + 4, stsz.end),
      count = u32(stsz.data + 8, stsz.end)
    if (
      count > 65536 ||
      stsz.data + 12 + (fixedSize ? 0 : count * 4) !== stsz.end
    )
      fail()
    const time = one(table, 'stts'),
      times = entries(time, 8)
    let expectedCount = 0,
      timeUnits = 0
    for (let i = 0; i < times; i++) {
      const n = u32(time.data + 8 + i * 8),
        d = u32(time.data + 12 + i * 8)
      if (!n || !d) fail()
      expectedCount += n
      timeUnits += n * d
    }
    if (expectedCount !== count || !Number.isSafeInteger(timeUnits)) fail()
    const chunkTable = one(table, 'stsc'),
      mappingCount = entries(chunkTable, 12)
    const offsetBoxes = table.filter(
      (b) => b.type === 'stco' || b.type === 'co64',
    )
    if (offsetBoxes.length !== 1) fail()
    const offsets = offsetBoxes[0],
      stride = offsets.type === 'co64' ? 8 : 4,
      chunks = entries(offsets, stride)
    if (!count) {
      if (chunks || mappingCount || times) fail()
      continue
    }
    if (!chunks || !mappingCount) fail()
    const mapping: Array<{ first: number; count: number }> = []
    for (let i = 0; i < mappingCount; i++) {
      const at = chunkTable.data + 8 + i * 12,
        first = u32(at),
        perChunk = u32(at + 4),
        description = u32(at + 8)
      if (
        !first ||
        first > chunks ||
        !perChunk ||
        description !== 1 ||
        (i ? first <= mapping[i - 1].first : first !== 1)
      )
        fail()
      mapping.push({ first, count: perChunk })
    }
    let sample = 0,
      mappingIndex = 0
    for (let i = 0; i < chunks; i++) {
      while (
        mappingIndex + 1 < mapping.length &&
        mapping[mappingIndex + 1].first <= i + 1
      )
        mappingIndex++
      let offset =
        stride === 8
          ? u64(offsets.data + 8 + i * 8)
          : u32(offsets.data + 8 + i * 4)
      for (let j = 0; j < mapping[mappingIndex].count; j++) {
        if (sample >= count) fail()
        const size = fixedSize || u32(stsz.data + 12 + sample * 4)
        addSample(track, offset, size, 1)
        offset += size
        sample++
      }
    }
    if (sample !== count) fail()
    track.duration = timeUnits
    track.lastEnd = timeUnits
  }
  // Fragmented MP4 used by the site's real, locally supplied editorial films.
  for (const moof of top.filter((b) => b.type === 'moof')) {
    const fragments = inside(moof)
    one(fragments, 'mfhd')
    const trafs = fragments.filter((b) => b.type === 'traf')
    if (!trafs.length || trafs.length > 4) fail()
    for (const traf of trafs) {
      const contents = inside(traf),
        tfhd = one(contents, 'tfhd'),
        flags = full(tfhd)
      if (flags & ~0x02003b) fail()
      let at = tfhd.data + 8
      const track = tracks.get(u32(tfhd.data + 4)),
        baseDefaults = defaults.get(u32(tfhd.data + 4))
      if (!track || !baseDefaults) fail()
      let base: number
      if (flags & 1) {
        base = u64(at, tfhd.end)
        at += 8
      } else if (flags & 0x020000) base = moof.start
      else fail()
      if (flags & 2) {
        if (u32(at, tfhd.end) !== 1) fail()
        at += 4
      }
      let defaultDuration = baseDefaults.duration,
        defaultSize = baseDefaults.size
      if (flags & 8) {
        defaultDuration = u32(at, tfhd.end)
        at += 4
      }
      if (flags & 16) {
        defaultSize = u32(at, tfhd.end)
        at += 4
      }
      if (flags & 32) at += 4
      if (at !== tfhd.end) fail()
      const tfdt = one(contents, 'tfdt'),
        v = bytes[tfdt.data]
      if (v > 1) fail()
      const decodeTime = v
        ? u64(tfdt.data + 4, tfdt.end)
        : u32(tfdt.data + 4, tfdt.end)
      // Remuxed editorial clips can round adjacent fragment timestamps by 1–2
      // ms; reject real backwards timelines while allowing that quantization.
      if (decodeTime + Math.ceil(track.timescale * 0.002) < track.lastEnd)
        fail()
      const runs = contents.filter((b) => b.type === 'trun')
      if (!runs.length) fail()
      let nextOffset: number | undefined,
        elapsed = 0
      for (const run of runs) {
        const version = bytes[run.data]
        if (version > 1) fail()
        const flags = u32(run.data, run.end) & 0xffffff
        if (flags & ~0xf05) fail()
        const count = u32(run.data + 4, run.end)
        if (!count || count > 65536) fail()
        let cursor = run.data + 8
        if (flags & 1) {
          need(cursor, 4, run.end)
          nextOffset = base + view.getInt32(cursor)
          cursor += 4
        }
        if (nextOffset === undefined) fail()
        if (flags & 4) cursor += 4
        const stride =
          ((flags & 0x100 ? 1 : 0) +
            (flags & 0x200 ? 1 : 0) +
            (flags & 0x400 ? 1 : 0) +
            (flags & 0x800 ? 1 : 0)) *
          4
        if (cursor + count * stride !== run.end) fail()
        for (let i = 0; i < count; i++) {
          let d = defaultDuration,
            size = defaultSize
          if (flags & 0x100) {
            d = u32(cursor, run.end)
            cursor += 4
          }
          if (flags & 0x200) {
            size = u32(cursor, run.end)
            cursor += 4
          }
          if (flags & 0x400) cursor += 4
          if (flags & 0x800) cursor += 4
          addSample(track, nextOffset, size, d)
          nextOffset += size
          elapsed += d
        }
      }
      track.lastEnd = decodeTime + elapsed
      if (track.lastEnd / track.timescale > 60.1) fail()
    }
  }
  // Optional seeking indexes must reference this file's actual fragments, not
  // arbitrary offsets. They are not trusted merely because samples are valid.
  for (const mfra of top.filter((box) => box.type === 'mfra')) {
    const index = inside(mfra),
      footer = one(index, 'mfro')
    if (
      full(footer) !== 0 ||
      footer.end - footer.data !== 8 ||
      u32(footer.data + 4) !== mfra.end - mfra.start
    )
      fail()
    for (const tfra of index.filter((box) => box.type === 'tfra')) {
      const version = bytes[tfra.data]
      if (version > 1) fail()
      const track = tracks.get(u32(tfra.data + 4, tfra.end))
      if (!track) fail()
      const lengths = u32(tfra.data + 8, tfra.end)
      if (lengths & ~63) fail()
      const count = u32(tfra.data + 12, tfra.end)
      if (count > 65536) fail()
      let at = tfra.data + 16
      for (let item = 0; item < count; item++) {
        const time = version ? u64(at, tfra.end) : u32(at, tfra.end)
        at += version ? 8 : 4
        const offset = version ? u64(at, tfra.end) : u32(at, tfra.end)
        at += version ? 8 : 4
        if (
          time / track.timescale > 60.1 ||
          !top.some((box) => box.type === 'moof' && box.start === offset)
        )
          fail()
        for (const shift of [4, 2, 0]) {
          const length = ((lengths >> shift) & 3) + 1
          need(at, length, tfra.end)
          let value = 0
          for (let byte = 0; byte < length; byte++)
            value = value * 256 + bytes[at++]
          if (!value) fail()
        }
      }
      if (at !== tfra.end) fail()
    }
  }
  for (const sidx of top.filter((box) => box.type === 'sidx')) {
    const version = bytes[sidx.data]
    if (version > 1) fail()
    const scale = u32(sidx.data + 8, sidx.end)
    if (!scale) fail()
    let at = sidx.data + 12
    const earliest = version ? u64(at, sidx.end) : u32(at, sidx.end)
    at += version ? 8 : 4
    const first = version ? u64(at, sidx.end) : u32(at, sidx.end)
    at += version ? 8 : 4
    const count = u16(at + 2, sidx.end)
    at += 4
    if (
      count > 65536 ||
      at + count * 12 !== sidx.end ||
      earliest / scale > 60.1
    )
      fail()
    let offset = sidx.end + first
    for (let item = 0; item < count; item++, at += 12) {
      const size = u32(at, sidx.end),
        duration = u32(at + 4, sidx.end)
      if (
        size & 0x80000000 ||
        !size ||
        offset + size > bytes.length ||
        duration / scale > 60.1 ||
        !top.some(
          (box) => ['moof', 'mdat'].includes(box.type) && box.start === offset,
        )
      )
        fail()
      offset += size
    }
  }
  samples.sort((a, b) => a.start - b.start)
  let previousEnd = 0
  for (const sample of samples) {
    if (sample.start < previousEnd) fail()
    previousEnd = sample.start + sample.size
    if (sample.track.kind !== 'vide') continue
    let at = sample.start,
      hasNal = false
    while (at < previousEnd) {
      const n = sample.track.lengthBytes
      need(at, n, previousEnd)
      let length = 0
      for (let index = 0; index < n; index++)
        length = length * 256 + bytes[at + index]
      at += n
      need(at, length, previousEnd)
      if (
        !length ||
        bytes[at] & 0x80 ||
        !(bytes[at] & 31) ||
        (bytes[at] & 31) > 23
      )
        fail()
      at += length
      hasNal = true
    }
    if (!hasNal) fail()
  }
  const video = [...tracks.values()].find((t) => t.kind === 'vide')!
  const durationMs = Math.round(
    (Math.max(video.duration, video.lastEnd) * 1000) / video.timescale,
  )
  const movieMs = Math.round((movie.units * 1000) / movie.scale)
  if (
    !video.samples ||
    durationMs < 2000 ||
    durationMs > MEDIA_VIDEO_MAX_DURATION_MS ||
    (movieMs && Math.abs(movieMs - durationMs) > 1000)
  )
    fail()
  return { width: video.width, height: video.height, durationMs }
}
