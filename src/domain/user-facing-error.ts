/** Only authored, actionable validation messages may cross the UI boundary. */
export class UserFacingError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'UserFacingError'
    this.code = code
  }
}
