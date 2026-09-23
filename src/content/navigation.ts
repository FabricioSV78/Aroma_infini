export const navigation = [
  { label: 'Catálogo', to: '/catalogo' },
  { label: 'Marcas', to: '/marcas' },
  { label: 'Más vendidos', to: '/#mas-vendidos' },
  { label: 'Para él', to: '/catalogo?genero=hombre' },
  { label: 'Para ella', to: '/catalogo?genero=mujer' },
  { label: 'Unisex', to: '/catalogo?genero=unisex' },
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
  { label: 'Preguntas frecuentes', to: '/preguntas-frecuentes' },
]
// Tres puertas de entrada breves: producto, marcas y relación con la tienda.
export const navigationGroups: NavigationGroup[] = [
  {
    id: 'perfumes',
    label: 'Perfumes',
    title: 'Encuentra tu aroma.',
    columns: [
      { title: 'Explorar', links: [navigation[0], ...navigation.slice(3)] },
      {
        title: 'Nuestra selección',
        links: [navigation[2], { label: 'Destacados', to: '/#destacados' }],
      },
    ],
  },
  {
    id: 'marcas',
    label: 'Marcas',
    title: 'Casas con carácter.',
    columns: [
      {
        title: 'Nuestra selección',
        links: [
          { label: 'ATELIER 01', to: '/catalogo?marca=atelier-01' },
          { label: 'FORME', to: '/catalogo?marca=forme' },
          { label: 'STUDIO SILLAGE', to: '/catalogo?marca=studio-sillage' },
          { label: 'MATIÈRE 04', to: '/catalogo?marca=matiere-04' },
        ],
      },
      {
        title: 'Descubrir las casas',
        links: [
          { label: 'Marca destacada', to: '/#marca-destacada' },
          { label: 'Todas las marcas', to: '/marcas' },
        ],
      },
    ],
  },
  {
    id: 'aroma-infini',
    label: 'Aroma Infini',
    title: 'Conoce nuestro universo.',
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
    title: 'Aroma Infini',
    links: [
      { label: 'Nosotros', to: '/nosotros' },
      { label: 'Contacto', to: '/contacto' },
    ],
  },
  { title: 'Te ayudamos', layout: 'wide', links: supportLinks },
]
