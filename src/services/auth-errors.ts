export type AuthErrorCode =
  | 'unavailable'
  | 'credentials'
  | 'network'
  | 'rate-limit'
  | 'cancelled'
  | 'recovery'
  | 'permission'
  | 'session'
  | 'service'
  | 'password'
  | 'email'
  | 'mfa'
  | 'email-change'
  | 'validation'

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code)
    this.name = 'AuthError'
  }
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    switch (error.code) {
      case 'unavailable':
        return 'No pudimos conectar con el acceso a tu cuenta. Vuelve a intentarlo más tarde.'
      case 'credentials':
        return 'No pudimos iniciar sesión. Revisa tu correo y contraseña.'
      case 'network':
        return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'
      case 'rate-limit':
        return 'Has realizado varios intentos. Espera un momento antes de volver a intentar.'
      case 'cancelled':
        return 'No se completó el acceso. Puedes intentarlo de nuevo.'
      case 'recovery':
        return 'No pudimos recuperar el acceso. Revisa tu código de recuperación.'
      case 'permission':
        return 'Esta cuenta no tiene acceso al panel administrativo.'
      case 'session':
        return 'Tu sesión terminó. Inicia sesión de nuevo para continuar.'
      case 'service':
        return 'No pudimos verificar tus datos. Inténtalo de nuevo.'
      case 'password':
        return 'Usa al menos 12 caracteres, con mayúscula, minúscula, número y símbolo.'
      case 'email':
        return 'Escribe un correo electrónico válido.'
      case 'mfa':
        return 'El código no es válido o ha caducado. Escribe el código actual de tu aplicación.'
      case 'email-change':
        return 'Para cambiar tu correo utiliza la opción «Cambiar correo».'
      case 'validation':
        return 'Revisa los datos del formulario e inténtalo de nuevo.'
    }
  }
  // Never surface SDK responses, tokens, credentials or account-existence details.
  return 'No pudimos completar la solicitud. Inténtalo de nuevo.'
}
