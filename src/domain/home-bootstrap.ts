import { inertJson } from './inert-json'
export const HOME_BOOTSTRAP_ID = 'aroma-public-home'
export const HOME_BOOTSTRAP_MAX_BYTES = 1024 * 1024 + 1024
export function homeBootstrapJson(project: string, value: unknown) {
  return inertJson({ version: 1, project, value }, HOME_BOOTSTRAP_MAX_BYTES)
}
