// Temporarily hidden on the Home at the owner's request; preserve the guide.
export const choosingGuideEnabled = false

// Reading guidance, not product recommendations or catalog filters.
export const choosingGuideSteps = [
  {
    id: 'family',
    label: 'Carácter',
    field: 'Perfil olfativo',
    title: 'Empieza por lo que ya te gusta',
    description:
      'Piensa qué te gusta de un perfume que ya conoces. Busca esos rasgos en el perfil olfativo y la descripción de tus opciones.',
  },
  {
    id: 'intensity',
    label: 'Intensidad',
    field: 'Intensidad',
    title: 'Decide qué presencia buscas',
    description:
      'Compara la intensidad indicada: Suave, Moderada o Intensa. Decide qué presencia buscas; este nivel no expresa una duración en horas.',
  },
  {
    id: 'occasion',
    label: 'Momento',
    field: 'Momento',
    title: 'Piensa cuándo lo vas a llevar',
    description:
      'Piensa cuándo lo usarías: en tu rutina, un encuentro o una salida. Consulta «Momento» en la ficha y compáralo con ese uso.',
  },
] as const
