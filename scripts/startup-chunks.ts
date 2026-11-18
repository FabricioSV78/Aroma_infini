import type { OutputBundle, OutputChunk } from 'rolldown'

/** Capture only the bundler's $initial graph, leaving entry/CSS and lazy routes
 * in their existing lifecycle. Never match a whole source directory. */
export function initialSharedModule(id: string) {
  return (
    !/[\\/]src[\\/]main\.tsx$/.test(id) &&
    !/\.(?:html|css|woff2?|webp|svg)(?:\?|$)/.test(id)
  )
}

const privateModule =
  /\/src\/(?:features\/admin\/(?!admin-route-modules\.ts$)|services\/(?:admin-service|admin-messages|catalog-admin-service|order-admin-service|media-upload|site-image-upload|media-admin-service|native-video-preparation)\.ts$)|\/node_modules\/mediabunny\//

/** Build-time guard against accidentally merging an administrative dependency
 * into a public startup chunk. Importing a lazy route is deliberately excluded. */
export function verifyPublicStartup(bundle: OutputBundle) {
  const chunks = Object.values(bundle).filter(
    (item): item is OutputChunk => item.type === 'chunk',
  )
  const entry = chunks.find(
    (chunk) =>
      chunk.isEntry &&
      chunk.facadeModuleId?.replaceAll('\\', '/').endsWith('/index.html'),
  )
  if (!entry) throw new Error('Missing public startup entry.')
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const visited = new Set<string>()
  function visit(file: string) {
    if (visited.has(file)) return
    const chunk = byFile.get(file)
    if (!chunk) throw new Error('Missing public startup dependency.')
    visited.add(file)
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (
        module.renderedLength > 0 &&
        /\/node_modules\/@supabase\//.test(id.replaceAll('\\', '/'))
      )
        throw new Error('Supabase SDK entered the blocking public startup graph.')
      if (
        module.renderedLength > 0 &&
        /\/src\/data\/peru-ubigeo\.json$/.test(id.replaceAll('\\', '/'))
      )
        throw new Error(
          'Deferred location labels entered the public startup graph.',
        )
      if (
        module.renderedLength > 0 &&
        privateModule.test(id.replaceAll('\\', '/'))
      )
        throw new Error('Administrative code entered the public startup graph.')
    }
    chunk.imports.forEach(visit)
  }
  visit(entry.fileName)
  return visited.size
}
