import type { Plugin } from 'vite'

export function viteTestCache(
  environment?: Readonly<Record<string, string | undefined>>,
): Plugin
