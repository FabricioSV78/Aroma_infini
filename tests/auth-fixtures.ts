import type { BrowserContext, Page } from '@playwright/test'
import type { AuthSession } from '../src/types/auth'
import type { AccountData, AccountProfile } from '../src/types/account'

/** Network/module substitutions installed by Playwright only, never imported by src. */
export type AuthFixtureMode =
  | 'legacy-admin'
  | 'unconfigured'
  | 'anonymous'
  | 'customer'
  | 'admin'
  | 'expired'
  | 'recovery'

export type AccountFixtureMode =
  'populated' | 'empty' | 'foreign' | 'unavailable'

export const fixtureCustomerId = 'test-customer-a'
export const fixtureOrderReference = 'AI-A1B2C3D4E5F60708'

export function customerAccountFixture(): AccountData {
  const address = {
    id: 'test-address-a',
    label: 'Principal',
    recipient: 'Camila Torres',
    department: 'lima',
    province: '1501',
    district: '150122',
    street: 'Calle de prueba 123',
    reference: '',
  }
  return {
    userId: fixtureCustomerId,
    profile: {
      firstName: 'Camila',
      lastName: 'Torres',
      email: 'camila@example.invalid',
      phone: '912345678',
    },
    address,
    orders: [
      {
        userId: fixtureCustomerId,
        reference: fixtureOrderReference,
        placedAt: '2026-09-09T15:30:00.000Z',
        status: 'shipped',
        lines: [
          {
            variantId: 'petale-50',
            productSlug: 'petale-nu',
            image: 'petale',
            brand: 'Forme',
            name: 'Pétale Nu',
            ml: 50,
            quantity: 1,
            unitPriceCents: 42000,
          },
        ],
        subtotalCents: 42000,
        discountCents: 0,
        shippingCents: 1500,
        totalCents: 43500,
        deliveryMethod: 'motorizado',
        address,
        payment: { provider: 'mercado-pago', status: 'approved' },
      },
    ],
  }
}

export interface AuthFixtureControl {
  setMode(mode: AuthFixtureMode): void
  setAccountData(data: AccountData): void
  setAccountMode(mode: AccountFixtureMode): void
  getAccountData(): AccountData
  publish(page: Page): Promise<void>
}

const fixtureEvent = '__aroma_playwright_session_change__'

// The application now has a real provider. Explicitly substitute its absent
// state as well, rather than depending on missing environment variables.
const unconfiguredAuthModule = `
import { AuthError } from '/src/services/auth-errors.ts';
async function unavailable() { throw new AuthError('unavailable'); }
export const authAdapter = {
  configured: false,
  getVerifiedSession: async () => null,
  signInWithPassword: unavailable,
  signUp: unavailable,
  signOut: async () => undefined,
  onSessionChange: () => () => undefined,
};
`

// These modules are fulfilled by the runner. No fixture is reachable from the
// production module graph, query string, browser storage or global role flag.
const authModule = `
const listeners = new Set();
async function request(action, input) {
  const response = await fetch('/__aroma_playwright__/auth/' + action + '?path=' + encodeURIComponent(location.pathname), {
    method: input === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message), { code: result.code });
  return result;
}
function emit() { for (const listener of listeners) listener(); }
addEventListener('${fixtureEvent}', emit);
export const authAdapter = {
  configured: true,
  getVerifiedSession: () => request('session'),
  signInWithPassword: () => request('sign-in', {}),
  signUp: (input) => request('sign-up', input),
  async signOut() { await request('sign-out', {}); emit(); },
  onSessionChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
};
export function expireForTest() { return request('expire', {}).then(emit); }
export function publishForTest() { emit(); }
`

const accountModule = `
async function request(action, userId, input) {
  const response = await fetch('/__aroma_playwright__/account/' + action + '?userId=' + encodeURIComponent(userId), {
    method: input === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message), { code: result.code });
  return result;
}
export const accountAdapter = {
  configured: true,
  load: (userId) => request('load', userId),
  updateProfile: (userId, profile) => request('profile', userId, profile),
  saveAddress: (userId, address) => request('address', userId, address),
  removeAddress: (userId) => request('remove-address', userId, {}),
};
`

/** Substitute adapter dependencies before any app document is loaded. */
export async function installAuthFixture(
  context: BrowserContext,
  initialMode: AuthFixtureMode = 'legacy-admin',
  initialAccountMode: AccountFixtureMode = 'populated',
): Promise<AuthFixtureControl> {
  let mode = initialMode
  let accountMode = initialAccountMode
  let accountData = customerAccountFixture()

  // Local UI fixtures must never send credentials to a hosted Auth project.
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, (route) =>
    route.abort('blockedbyclient'),
  )
  if (initialMode === 'unconfigured') {
    await context.route(
      /\/src\/services\/auth-adapter\.ts(?:\?.*)?$/,
      async (route) => {
        // Vite may version a dependency after HMR. Use the application's exact
        // AuthError module URL so this isolated adapter shares its constructor.
        const original = await route.fetch()
        const source = await original.text()
        const errorModule = source.match(
          /from\s+["']([^"']*\/services\/auth-errors\.ts(?:\?[^"']*)?)["']/,
        )?.[1]
        await route.fulfill({
          contentType: 'text/javascript',
          body: errorModule
            ? unconfiguredAuthModule.replace(
                "'/src/services/auth-errors.ts'",
                JSON.stringify(errorModule),
              )
            : unconfiguredAuthModule,
        })
      },
    )
  }

  if (initialMode !== 'unconfigured') {
    await context.route(
      /\/src\/services\/auth-adapter\.ts(?:\?.*)?$/,
      (route) =>
        route.fulfill({ contentType: 'text/javascript', body: authModule }),
    )
    await context.route(
      /\/src\/services\/account-adapter\.ts(?:\?.*)?$/,
      (route) =>
        route.fulfill({ contentType: 'text/javascript', body: accountModule }),
    )
    await context.route('**/__aroma_playwright__/**', async (route) => {
      const url = new URL(route.request().url())
      const action = url.pathname.split('/').at(-1)
      const fail = (message: string, code = 'fixture-error', status = 400) =>
        route.fulfill({ status, json: { message, code } })

      if (url.pathname.includes('/auth/')) {
        if (action === 'session') {
          const path = url.searchParams.get('path') ?? ''
          const admin =
            mode === 'admin' ||
            (mode === 'legacy-admin' && path.startsWith('/admin'))
          const customer =
            mode === 'customer' || mode === 'expired' || mode === 'recovery'
          const session: AuthSession | null =
            admin || customer
              ? {
                  user: {
                    id: admin ? 'test-administrator' : fixtureCustomerId,
                    email: admin
                      ? 'admin@example.invalid'
                      : 'camila@example.invalid',
                    displayName: admin ? 'Administración de prueba' : 'Camila',
                    role: admin ? 'admin' : 'customer',
                  },
                  expiresAt:
                    mode === 'expired' ? 1 : Date.parse('2100-01-01T00:00:00Z'),
                  intent: mode === 'recovery' ? 'recovery' : 'account',
                }
              : null
          await route.fulfill({ json: session })
          return
        }
        if (action === 'sign-out') {
          mode = 'anonymous'
          await route.fulfill({ json: null })
          return
        }
        if (action === 'expire') {
          mode = 'expired'
          await route.fulfill({ json: null })
          return
        }
        // A test session is supplied explicitly by a fixture, never by a fake
        // password or account-creation success in the app.
        await fail(
          'El proveedor de autenticación de prueba no acepta credenciales.',
          'invalid-credentials',
          401,
        )
        return
      }

      if (accountMode === 'unavailable') {
        await fail(
          'Los datos de cuenta todavía no están conectados.',
          'not-configured',
          503,
        )
        return
      }
      const userId = url.searchParams.get('userId')
      if (userId !== fixtureCustomerId) {
        await fail(
          'La información no pertenece al usuario de esta prueba.',
          'owner-mismatch',
          403,
        )
        return
      }
      if (action === 'load') {
        const result = structuredClone(accountData)
        if (accountMode === 'empty') result.orders = []
        if (accountMode === 'foreign')
          result.orders[0].userId = 'test-customer-b'
        await route.fulfill({ json: result })
        return
      }
      if (action === 'profile') {
        accountData.profile = route.request().postDataJSON() as AccountProfile
        await route.fulfill({ json: accountData.profile })
        return
      }
      if (action === 'address') {
        accountData.address = route.request().postDataJSON() as NonNullable<
          AccountData['address']
        >
        await route.fulfill({ json: accountData.address })
        return
      }
      if (action === 'remove-address') {
        accountData.address = null
        await route.fulfill({ json: null })
        return
      }
      await fail('Acción de fixture no reconocida.')
    })
  }

  return {
    setMode(value) {
      mode = value
    },
    setAccountData(value) {
      accountData = structuredClone(value)
    },
    setAccountMode(value) {
      accountMode = value
    },
    getAccountData() {
      return structuredClone(accountData)
    },
    async publish(page) {
      await page.evaluate(
        (name) => window.dispatchEvent(new Event(name)),
        fixtureEvent,
      )
    },
  }
}
