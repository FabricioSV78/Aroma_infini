const blockedWords = [
  'puta',
  'puto',
  'putas',
  'putos',
  'mierda',
  'mierdas',
  'carajo',
  'carajos',
  'cabron',
  'cabrona',
  'cabrones',
  'pendejo',
  'pendeja',
  'pendejos',
  'pendejas',
  'imbecil',
  'imbeciles',
  'idiota',
  'idiotas',
  'estupido',
  'estupida',
  'estupidos',
  'estupidas',
  'huevon',
  'huevona',
  'huevones',
  'webon',
  'weon',
  'maricon',
  'maricones',
  'cojudo',
  'cojuda',
  'cojudos',
  'cojudas',
  'gilipollas',
  'joder',
  'conchatumadre',
  'conchesumadre',
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
]
const substitutions: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
}
const patterns = blockedWords.map(
  (word) =>
    new RegExp(
      `(^|[^a-z0-9])${[...word].map((letter) => `${letter}+`).join('[^a-z0-9]*')}([^a-z0-9]|$)`,
    ),
)

/** Fast inline guidance; the authoritative check also runs inside PostgreSQL. */
export function respectfulReviewContent(value: string): boolean {
  const normalized = value
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[013457@$!|]/g, (letter) => substitutions[letter])
  return !patterns.some((pattern) => pattern.test(normalized))
}
