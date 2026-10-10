import { useLoaderData } from 'react-router'
import type { HomeData } from '../../services/home-service'
import { Hero } from './Hero'
import { BrandGallery } from './BrandGallery'
import { EditorialFilm } from './EditorialFilm'
import {
  Bestsellers,
  Categories,
  FeaturedPerfumes,
  TrustInformation,
} from './HomeSections'

// Orientar → producto → descubrir firmas → ritual → selección → confianza.
const sectionOrder = [
  'hero',
  'categories',
  'bestsellers',
  'brands',
  'editorial',
  'featured',
  'trust',
] as const

export function HomePage() {
  const data = useLoaderData<HomeData>()
  const sections = {
    hero: <Hero content={data.content.hero} />,
    brands: data.brands.length ? (
      <BrandGallery brands={data.brands} bestsellers={data.bestsellers} />
    ) : null,
    categories: <Categories media={data.media} />,
    bestsellers: data.bestsellers.length ? (
      <Bestsellers brands={data.brands} bestsellers={data.bestsellers} />
    ) : null,
    editorial: <EditorialFilm content={data.content.film} />,
    featured: data.featured.length ? (
      <FeaturedPerfumes
        brands={data.brands}
        featured={data.featured}
        media={data.media}
      />
    ) : null,
    trust: <TrustInformation />,
  }
  return (
    <div className="home">
      {sectionOrder.map((id) =>
        sections[id] ? (
          <div key={id} data-home-section={id}>
            {sections[id]}
          </div>
        ) : null,
      )}
    </div>
  )
}
