import { brandStorePath } from '../utils/brand-store-path'

export const navigation = [
  { label: 'Tienda', to: '/tienda' },
  { label: 'Marcas', to: '/marcas' },
  { label: 'Más vendidos', to: '/#mas-vendidos' },
  { label: 'Para él', to: '/tienda?genero=hombre' },
  { label: 'Para ella', to: '/tienda?genero=mujer' },
  { label: 'Unisex', to: '/tienda?genero=unisex' },
]

export interface NavigationLink {
  label: string
  to: string
}
export interface NavigationGroup {
  id: string
  label: string
  title: string
  columns: { title: string; links: NavigationLink[] }[]
}
export const supportLinks: NavigationLink[] = [
  { label: 'Seguir pedido', to: '/seguir-pedido' },
  { label: 'Envíos y entregas', to: '/envios' },
  { label: 'Cambios y devoluciones', to: '/devoluciones' },
]
// Tres puertas de entrada breves: producto, marcas y relación con la tienda.
export const navigationGroups: NavigationGroup[] = [
  {
    id: 'perfumes',
    label: 'Perfumes',
    title: 'Encuentra tu aroma',
    columns: [
      { title: 'Explorar', links: [navigation[0], ...navigation.slice(3)] },
      {
        title: 'Nuestra selección',
        links: [
          navigation[2],
          { label: 'Destacados', to: '/tienda?seleccion=destacados' },
        ],
      },
    ],
  },
  {
    id: 'marcas',
    label: 'Marcas',
    title: 'Casas con carácter',
    columns: [
      {
        title: 'Nuestra selección',
        links: [
          { label: 'Atelier 01', to: brandStorePath('atelier-01') },
          { label: 'Forme', to: brandStorePath('forme') },
          { label: 'Studio sillage', to: brandStorePath('studio-sillage') },
          { label: 'Matière 04', to: brandStorePath('matiere-04') },
        ],
      },
      {
        title: 'Descubrir las casas',
        links: [
          { label: 'Marca destacada', to: brandStorePath('atelier-01') },
          { label: 'Todas las marcas', to: '/marcas' },
        ],
      },
    ],
  },
  {
    id: 'aroma-infini',
    label: 'Aroma Infini',
    title: 'Conoce nuestro universo',
    columns: [
      {
        title: 'Nuestra esencia',
        links: [{ label: 'Nosotros', to: '/nosotros' }],
      },
      {
        title: 'Accesos útiles',
        links: [
          { label: 'Contacto', to: '/contacto' },
          { label: 'Seguir pedido', to: '/seguir-pedido' },
          { label: 'Envíos y entregas', to: '/envios' },
        ],
      },
    ],
  },
]
export const footerGroups = [
  { title: 'Explorar', links: navigation.slice(0, 3) },
  {
    title: 'AROMA INFINI',
    links: [
      { label: 'Nosotros', to: '/nosotros' },
      { label: 'Contacto', to: '/contacto' },
    ],
  },
  { title: 'Te ayudamos', layout: 'wide', links: supportLinks },
]
