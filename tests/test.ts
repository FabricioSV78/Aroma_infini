import { test as base, type BrowserContext } from '@playwright/test'
import {
  installAuthFixture,
  type AccountFixtureMode,
  type AuthFixtureControl,
  type AuthFixtureMode,
} from './auth-fixtures'

export * from '@playwright/test'

interface AuthTestOptions {
  authMode: AuthFixtureMode
  accountFixtureMode: AccountFixtureMode
}
interface AuthTestFixtures {
  authFixture: AuthFixtureControl
}

const controls = new WeakMap<BrowserContext, AuthFixtureControl>()

/** Legacy panel tests get an authorized adapter only on admin documents. */
export const test = base.extend<AuthTestOptions & AuthTestFixtures>({
  authMode: ['legacy-admin', { option: true }],
  accountFixtureMode: ['populated', { option: true }],
  context: async ({ context, authMode, accountFixtureMode }, runFixture) => {
    const control = await installAuthFixture(
      context,
      authMode,
      accountFixtureMode,
    )
    controls.set(context, control)
    await runFixture(context)
    controls.delete(context)
  },
  authFixture: async ({ context }, runFixture) => {
    const control = controls.get(context)
    if (!control) throw new Error('The context auth fixture was not installed.')
    await runFixture(control)
  },
})
