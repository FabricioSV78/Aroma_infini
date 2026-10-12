import { useLoaderData } from 'react-router'
import type { HomeData } from '../../services/home-service'
import { Hero } from './Hero'
import { BrandGallery } from './BrandGallery'
import { EditorialFilm } from './EditorialFilm'
import { ChoosingGuide } from './ChoosingGuide'
import { choosingGuideEnabled } from '../../content/choosing-guide'
import { Bestsellers, Categories, TrustInformation } from './HomeSections'

// Explorar → producto → aprender a elegir → firmas → ritual → confianza.
const sectionOrder = [
  'hero',
  'categories',
  'bestsellers',
  'choosing-guide',
  'brands',
  'editorial',
  'trust',
] as const

export function HomePage() {
  const data = useLoaderData<HomeData>()
  const sections = {
    hero: <Hero content={data.content.hero} />,
    brands: data.brands.length ? (
      <BrandGallery brands={data.brands} brandProfiles={data.brandProfiles} />
    ) : null,
    categories: <Categories media={data.media} />,
    bestsellers: data.bestsellers.length ? (
      <Bestsellers brands={data.brands} bestsellers={data.bestsellers} />
    ) : null,
    'choosing-guide': choosingGuideEnabled ? (
      <ChoosingGuide example={data.choosingGuideExample} />
    ) : null,
    editorial: <EditorialFilm content={data.content.film} />,
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
