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
    hero: <Hero />,
    brands: (
      <BrandGallery brands={data.brands} bestsellers={data.bestsellers} />
    ),
    categories: <Categories media={data.media} />,
    bestsellers: (
      <Bestsellers brands={data.brands} bestsellers={data.bestsellers} />
    ),
    editorial: <EditorialFilm />,
    featured: (
      <FeaturedPerfumes
        brands={data.brands}
        featured={data.featured}
        media={data.media}
      />
    ),
    trust: <TrustInformation />,
  }
  return (
    <div className="home">
      {sectionOrder.map((id) => (
        <div key={id} data-home-section={id}>
          {sections[id]}
        </div>
      ))}
    </div>
  )
}
