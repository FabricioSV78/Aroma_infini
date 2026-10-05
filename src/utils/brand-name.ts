export function formatBrandName(value: string): string {
  const name = value.trim().toLocaleLowerCase('es-PE')
  return name.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('es-PE'))
}
