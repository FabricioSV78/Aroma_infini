export interface ProductReview {
  id: string
  author: string
  date: string
  sizeMl: number
  title: string
  comment: string
  rating: 1 | 2 | 3 | 4 | 5
}

const reviewsByProduct: Record<string, ProductReview[]> = {
  cedre: [
    {
      id: 'cedre-1',
      author: 'Lucía M.',
      date: '2026-08-19',
      sizeMl: 50,
      title: 'Fresco y equilibrado',
      comment:
        'Las notas amaderadas se sienten limpias y suaves. Me gusta para todos los días.',
      rating: 5,
    },
    {
      id: 'cedre-2',
      author: 'Diego R.',
      date: '2026-07-11',
      sizeMl: 100,
      title: 'Muy fácil de llevar',
      comment:
        'Tiene una salida fresca y un fondo sereno que acompaña sin imponerse.',
      rating: 4,
    },
  ],
  petale: [
    {
      id: 'petale-1',
      author: 'Camila R.',
      date: '2026-09-12',
      sizeMl: 50,
      title: 'Un floral delicado',
      comment:
        'Me gustó el equilibrio entre las flores y el fondo suave. Se siente ligero.',
      rating: 5,
    },
    {
      id: 'petale-2',
      author: 'Valeria P.',
      date: '2026-08-28',
      sizeMl: 100,
      title: 'Sutil y elegante',
      comment:
        'El aroma floral está presente sin resultar intenso. Lo usaría durante el día.',
      rating: 4,
    },
    {
      id: 'petale-3',
      author: 'María F.',
      date: '2026-08-04',
      sizeMl: 50,
      title: 'Para todos los días',
      comment:
        'Lo llevo al trabajo porque es suave y no invade el espacio. Al final del día todavía percibo un fondo floral.',
      rating: 5,
    },
    {
      id: 'petale-4',
      author: 'Andrea C.',
      date: '2026-07-22',
      sizeMl: 50,
      title: 'Bonito en piel',
      comment:
        'En mi piel empieza bastante fresco y después se vuelve más cálido. Me gusta ese cambio.',
      rating: 4,
    },
    {
      id: 'petale-5',
      author: 'Paola S.',
      date: '2026-06-18',
      sizeMl: 100,
      title: 'Justo lo que buscaba',
      comment:
        'Quería un perfume floral discreto. Este tiene una salida agradable y un acabado muy limpio.',
      rating: 5,
    },
    {
      id: 'petale-6',
      author: 'Fernanda L.',
      date: '2026-05-30',
      sizeMl: 50,
      title: 'Ligero y suave',
      comment:
        'Es más sutil de lo que esperaba, así que prefiero reaplicarlo por la tarde. El aroma me parece muy bonito.',
      rating: 4,
    },
    {
      id: 'petale-7',
      author: 'Elena V.',
      date: '2026-04-09',
      sizeMl: 100,
      title: 'Un floral muy cómodo',
      comment:
        'No suelo usar flores muy intensas y esta fragancia me resultó fácil de llevar. La volvería a elegir.',
      rating: 5,
    },
  ],
  sillage: [
    {
      id: 'sillage-1',
      author: 'Sofía L.',
      date: '2026-08-16',
      sizeMl: 75,
      title: 'Verde y luminoso',
      comment:
        'La primera impresión es fresca y el carácter verde se mantiene muy agradable.',
      rating: 5,
    },
    {
      id: 'sillage-2',
      author: 'Gabriel T.',
      date: '2026-07-02',
      sizeMl: 75,
      title: 'Una propuesta diferente',
      comment: 'Me gustó cómo combina frescura con una base más tranquila.',
      rating: 4,
    },
  ],
  ambre: [
    {
      id: 'ambre-1',
      author: 'Ana M.',
      date: '2026-08-09',
      sizeMl: 50,
      title: 'Cálido sin exceso',
      comment:
        'El ámbar aporta una sensación envolvente que encuentro muy agradable.',
      rating: 5,
    },
    {
      id: 'ambre-2',
      author: 'Javier P.',
      date: '2026-06-25',
      sizeMl: 100,
      title: 'Para momentos tranquilos',
      comment:
        'Tiene un fondo cálido y suave. Me gusta especialmente por la tarde.',
      rating: 4,
    },
  ],
  neroli: [
    {
      id: 'neroli-1',
      author: 'Isabel R.',
      date: '2026-08-07',
      sizeMl: 75,
      title: 'Frescura luminosa',
      comment: 'El neroli se siente limpio y ligero desde el primer momento.',
      rating: 5,
    },
    {
      id: 'neroli-2',
      author: 'Martín G.',
      date: '2026-07-14',
      sizeMl: 75,
      title: 'Muy agradable de día',
      comment: 'Me gusta su lado cítrico y la suavidad que aparece después.',
      rating: 4,
    },
  ],
  iris: [
    {
      id: 'iris-1',
      author: 'Daniela T.',
      date: '2026-08-13',
      sizeMl: 75,
      title: 'Suave y envolvente',
      comment:
        'El iris tiene una textura delicada y el fondo se siente cómodo.',
      rating: 5,
    },
    {
      id: 'iris-2',
      author: 'Renata C.',
      date: '2026-06-21',
      sizeMl: 75,
      title: 'Elegancia discreta',
      comment:
        'Me gustó el contraste entre la salida fresca y las notas empolvadas.',
      rating: 4,
    },
  ],
  figue: [
    {
      id: 'figue-1',
      author: 'Claudia V.',
      date: '2026-08-23',
      sizeMl: 75,
      title: 'Una higuera muy natural',
      comment:
        'Tiene un lado verde suave que hace que el aroma se sienta relajado.',
      rating: 5,
    },
    {
      id: 'figue-2',
      author: 'Nicolás A.',
      date: '2026-07-05',
      sizeMl: 75,
      title: 'Dulzor en su punto',
      comment: 'La nota de higo es agradable y no resulta pesada.',
      rating: 4,
    },
  ],
  santal: [
    {
      id: 'santal-1',
      author: 'Teresa B.',
      date: '2026-08-10',
      sizeMl: 75,
      title: 'Maderas suaves',
      comment:
        'El sándalo se siente cálido y cremoso. Me gusta su carácter tranquilo.',
      rating: 5,
    },
    {
      id: 'santal-2',
      author: 'Rodrigo M.',
      date: '2026-06-16',
      sizeMl: 75,
      title: 'Una fragancia acogedora',
      comment: 'Tiene profundidad sin dejar de ser fácil de llevar.',
      rating: 4,
    },
  ],
}

// Fictional fixtures for presentation and pagination QA, never verified purchases.
const reviewProfiles: Record<string, { note: string; sizes: number[] }> = {
  cedre: { note: 'el fondo amaderado y fresco', sizes: [50, 100] },
  petale: { note: 'el carácter floral suave', sizes: [50, 100] },
  sillage: { note: 'el matiz verde y aromático', sizes: [75] },
  ambre: { note: 'el fondo cálido de ámbar', sizes: [50, 100] },
  neroli: { note: 'el carácter cítrico y luminoso', sizes: [75] },
  iris: { note: 'el acabado floral empolvado', sizes: [75] },
  figue: { note: 'el contraste verde y cremoso', sizes: [75] },
  santal: { note: 'el fondo amaderado y especiado', sizes: [75] },
}
const fictionalNames = [
  'Alex R.',
  'Marina C.',
  'Gabriela T.',
  'Daniel P.',
  'Carolina M.',
  'Luis V.',
  'Natalia S.',
  'Bruno A.',
  'Adriana L.',
  'Tomás F.',
  'Jimena D.',
  'Sergio B.',
  'Luciana G.',
  'Mateo N.',
  'Pilar E.',
  'Emilia J.',
  'Rafael H.',
  'Catalina O.',
  'Alonso I.',
  'Valentina U.',
  'Renzo Q.',
  'Silvana Z.',
]
const impressions: {
  rating: ProductReview['rating']
  title: string
  text: string
}[] = [
  {
    rating: 5,
    title: 'Una elección que disfruto',
    text: 'Me gustó especialmente {note}. Lo siento equilibrado y agradable en mi piel.',
  },
  {
    rating: 4,
    title: 'Se vuelve más suave',
    text: 'Al principio lo noto bastante presente; después aparece {note} y me resulta más cómodo.',
  },
  {
    rating: 5,
    title: 'Para usar con calma',
    text: 'Disfruto {note}. Es de esos aromas que prefiero aplicar en poca cantidad y dejar evolucionar.',
  },
  {
    rating: 3,
    title: 'Más discreto de lo esperado',
    text: 'Me parece bonito {note}, aunque en mi piel termina siendo más sutil de lo que buscaba.',
  },
  {
    rating: 5,
    title: 'Me gustó su evolución',
    text: 'Con el paso de las horas percibo mejor {note}. Esa parte es mi favorita.',
  },
  {
    rating: 4,
    title: 'Necesité darle tiempo',
    text: 'La primera impresión no fue mi favorita, pero después disfruté mucho {note}.',
  },
  {
    rating: 5,
    title: 'Un aroma con personalidad',
    text: 'Destacaría {note}. Me gusta que tenga carácter sin resultarme difícil de llevar.',
  },
  {
    rating: 2,
    title: 'No terminó de encajar conmigo',
    text: 'Reconozco {note}, pero en mi piel se siente distinto de lo que imaginaba. Prefiero otro tipo de fragancias.',
  },
  {
    rating: 4,
    title: 'Agradable en pequeñas cantidades',
    text: 'Con una aplicación ligera disfruto más {note}. Para mi gusto, menos es suficiente.',
  },
  {
    rating: 5,
    title: 'Lo volvería a elegir',
    text: 'Me convenció {note}. Ha sido fácil encontrar momentos para usarlo.',
  },
  {
    rating: 3,
    title: 'Lo reservaría para ocasiones concretas',
    text: 'Me interesa {note}, aunque no es el aroma que elegiría a diario.',
  },
  {
    rating: 5,
    title: 'Se siente muy personal',
    text: 'Me gusta cómo aparece {note} cuando se asienta. Lo disfruto más en piel que al olerlo al principio.',
  },
  {
    rating: 4,
    title: 'Una buena primera impresión',
    text: 'Lo que más recuerdo es {note}. Voy descubriendo matices cada vez que lo uso.',
  },
  {
    rating: 1,
    title: 'No es mi estilo',
    text: 'Buscaba una sensación diferente. Aunque percibo {note}, no me siento cómodo llevándolo.',
  },
  {
    rating: 5,
    title: 'Un buen compañero',
    text: 'Encuentro agradable {note}. Lo he incorporado a mi rutina porque me siento a gusto con él.',
  },
]
const occasions = [
  'Lo probé durante una mañana tranquila.',
  'Lo he usado varias veces para salir a caminar.',
  'Mi impresión cambió después de llevarlo una tarde completa.',
  'Lo alterno con otras fragancias según el día.',
]

const presentationReviews = Object.fromEntries(
  Object.entries(reviewsByProduct).map(([id, originals], productIndex) => {
    const profile = reviewProfiles[id]
    const additional = Array.from(
      { length: 50 - originals.length },
      (_, index): ProductReview => {
        const impression =
          impressions[(index + productIndex) % impressions.length]
        return {
          id: `${id}-sample-${index + 1}`,
          author:
            fictionalNames[(index + productIndex * 3) % fictionalNames.length],
          date: new Date(Date.UTC(2026, 2, 28 - index * 2))
            .toISOString()
            .slice(0, 10),
          sizeMl: profile.sizes[index % profile.sizes.length],
          title: impression.title,
          comment: `${impression.text.replace('{note}', profile.note)} ${occasions[Math.floor(index / impressions.length) % occasions.length]}`,
          rating: impression.rating,
        }
      },
    )
    return [id, [...originals, ...additional]]
  }),
)

export function getProductReviews(productId: string): ProductReview[] {
  return presentationReviews[productId] ?? []
}
