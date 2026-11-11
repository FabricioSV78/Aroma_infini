import type { AccountProfile } from './account'

export type AuthRole = 'customer' | 'admin'

/** The provider must create this profile for the verified account owner. */
export interface AuthSignUpInput extends Pick<
  AccountProfile,
  'firstName' | 'lastName' | 'email' | 'phone'
> {
  password: string
}

export interface AuthUser {
  id: string
  email: string
  displayName?: string
  role: AuthRole
}

/** Verified by Auth and the owner-scoped actor RPC, never browser role flags. */
export interface AuthSession {
  user: AuthUser
  expiresAt: number
  intent: 'account' | 'recovery'
  assurance?: 'aal1' | 'aal2'
  mfaRequired?: boolean
  trustedDevice?: boolean
  trustedUntil?: string
}

export interface AuthMfaFactor {
  id: string
  status: 'verified' | 'unverified'
  friendlyName?: string
}

/** A provider event may clear stale UI; only getVerifiedSession grants access. */
export interface AuthSessionChange {
  userId: string | null
}

export interface AuthState {
  status: 'checking' | 'anonymous' | 'authenticated' | 'expired' | 'error'
  session: AuthSession | null
  message: string
}

export interface AuthAdapter {
  readonly configured: boolean
  getVerifiedSession(): Promise<AuthSession | null>
  signInWithPassword(input: { email: string; password: string }): Promise<void>
  signUp(input: AuthSignUpInput): Promise<void>
  signOut(): Promise<void>
  onSessionChange(listener: (hint?: AuthSessionChange) => void): () => void
  listMfaFactors?(): Promise<AuthMfaFactor[]>
  enrollMfa?(): Promise<{ id: string; qrCode: string; secret: string }>
  verifyMfa?(input: { factorId: string; code: string }): Promise<void>
}
