export interface ProductReview {
  id: string
  author: string
  date: string
  sizeMl: number
  title: string
  comment: string
  rating: 1 | 2 | 3 | 4 | 5
}
