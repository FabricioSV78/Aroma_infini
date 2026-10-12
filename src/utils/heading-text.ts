/** Keep headings consistent even for Home copy already saved in the panel. */
export function headingText(value: string): string {
  return value.replace(/\.+(?=\s*(?:\n|$))/g, '')
}
