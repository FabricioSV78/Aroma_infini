/** Display-code syntax only. A matching code never authorizes order access. */
export function isOrderReference(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 40 &&
    /^AI-(?:[0-9]{6,19}|[A-F0-9]{16,32}|(?:DEMO|TEST|SIM)-[A-F0-9]{4,32}|[0-9]{6}-[0-9]{2,6})$/.test(
      value,
    )
  )
}
