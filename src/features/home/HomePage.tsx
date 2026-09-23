import { useLoaderData } from 'react-router'
import type { HomeData } from '../../services/home-service'
import { Hero } from './Hero'
import { BrandGallery } from './BrandGallery'
import {
  Bestsellers,
  BrandEditorial,
  Categories,
  FeaturedPerfumes,
  TrustInformation,
} from './HomeSections'

// Orientar → producto → descubrir firmas → conocer una firma → selección → confianza.
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
    categories: <Categories />,
    bestsellers: (
      <Bestsellers brands={data.brands} bestsellers={data.bestsellers} />
    ),
    editorial: <BrandEditorial />,
    featured: (
      <FeaturedPerfumes brands={data.brands} featured={data.featured} />
    ),
    trust: <TrustInformation shipping={data.shipping} />,
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
