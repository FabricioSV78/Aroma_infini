interface DemoReview {
  id: string
  rating: number
  title: string
  copy: string
  profile: string
  presentation: string
}

const demoReviews: DemoReview[] = [
  {
    id: 'demo-review-01',
    rating: 5,
    title: 'Ligero y fácil de llevar',
    copy: 'La apertura se siente limpia y la evolución conserva un carácter suave. Texto ilustrativo para validar la lectura del módulo.',
    profile: 'Perfil de demostración 01',
    presentation: '50 ml · compra simulada',
  },
  {
    id: 'demo-review-02',
    rating: 4,
    title: 'Una presencia sutil',
    copy: 'El ejemplo muestra cómo se leería una opinión breve sobre intensidad, uso cotidiano y presentación del perfume.',
    profile: 'Perfil de demostración 02',
    presentation: '100 ml · compra simulada',
  },
  {
    id: 'demo-review-03',
    rating: 5,
    title: 'Buena primera impresión',
    copy: 'La composición resulta clara y equilibrada. Esta reseña es ficticia y será reemplazada únicamente por una experiencia real.',
    profile: 'Perfil de demostración 03',
    presentation: '50 ml · compra simulada',
  },
]

export function ProductReviewsPreview() {
  const average =
    demoReviews.reduce((total, review) => total + review.rating, 0) /
    demoReviews.length

  return (
    <section
      className="product-reviews-preview"
      aria-labelledby="product-reviews-title"
      data-scroll-reveal="copy"
    >
      <div className="product-reviews-inner container">
        <header className="product-reviews-heading">
          <div className="product-reviews-score">
            <strong>{average.toFixed(1)}</strong>
            <span aria-label={`${average.toFixed(1)} de 5 estrellas`}>
              ★★★★<i aria-hidden="true">★</i>
            </span>
            <small>{demoReviews.length} opiniones ficticias</small>
          </div>
          <div>
            <p className="eyebrow">Vista previa · contenido simulado</p>
            <h2 id="product-reviews-title">Así se leerían las reseñas.</h2>
            <p>
              Este módulo valida la experiencia visual. En producción mostrará
              únicamente opiniones reales asociadas a compras verificadas.
            </p>
          </div>
        </header>
        <ol className="product-review-list" data-scroll-reveal="stagger">
          {demoReviews.map((review) => (
            <li key={review.id}>
              <div className="product-review-rating">
                <span aria-label={`${review.rating} de 5 estrellas`}>
                  {'★'.repeat(review.rating)}
                  <i aria-hidden="true">{'★'.repeat(5 - review.rating)}</i>
                </span>
                <small>Ejemplo</small>
              </div>
              <h3>{review.title}</h3>
              <p>{review.copy}</p>
              <div className="product-review-author">
                <strong>{review.profile}</strong>
                <span>{review.presentation}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
