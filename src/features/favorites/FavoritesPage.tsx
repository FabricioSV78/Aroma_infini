import { Navigate } from 'react-router'
import { useAccount } from '../account/account-context'
import { FavoritesCollection } from './FavoritesCollection'

export function FavoritesPage() {
  const { active } = useAccount()
  if (active) return <Navigate to="/cuenta/favoritos" replace />

  return (
    <section
      className="store-page commerce-page favorites-page container"
      aria-labelledby="favorites-page-title"
    >
      <header className="commerce-heading" data-scroll-reveal="fade">
        <p className="eyebrow">Tu selección personal</p>
        <h1 id="favorites-page-title">Tus favoritos.</h1>
        <p>Guarda los aromas que quieras volver a encontrar.</p>
      </header>
      <FavoritesCollection />
    </section>
  )
}
