import path from 'node:path'

/** Isolate only marked test servers; normal development and builds retain
 * Vite's existing cache. The marker's value is not the server's actual port.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 * @returns {import('vite').Plugin}
 */
export function viteTestCache(environment = process.env) {
  return {
    name: 'aroma-isolated-test-cache',
    apply: 'serve',
    config(config, { command }) {
      if (command !== 'serve' || environment.AROMA_TEST_PORT === undefined)
        return
      // Vite merges file configuration with CLI/API options before this hook.
      const port = Number(config.server?.port ?? 5173)
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error(
          'Isolated Vite tests require a fixed valid server port.',
        )
      return {
        cacheDir: path.resolve(
          config.root ?? process.cwd(),
          'node_modules/.cache/aroma-tests',
          `vite-${port}`,
        ),
      }
    },
  }
}
