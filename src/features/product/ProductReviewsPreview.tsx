import { lazy, Suspense } from 'react'
import { canUseLocalFixtures } from '../../services/runtime-environment'
import { ProductReviews } from './ProductReviews'

const DemoReviews = lazy(() =>
  import('./ProductReviewsDemo').then((module) => ({
    default: module.ProductReviewsDemo,
  })),
)
export function ProductReviewsPreview(props: {
  productId: string
  sizes: number[]
  readOnly?: boolean
  productType?: 'perfume' | 'complemento'
}) {
  if (canUseLocalFixtures)
    return (
      <Suspense fallback={null}>
        <DemoReviews {...props} />
      </Suspense>
    )
  return <ProductReviews key={props.productId} {...props} />
}
