# Revisión de navegación pública

Fecha: 21 de septiembre de 2026

## Decisión vigente

La navegación principal conserva tres grupos breves:

- **Perfumes**: catálogo, género, más vendidos y destacados.
- **Marcas**: firmas disponibles, marca destacada y directorio completo.
- **Aroma Infini**: Nosotros, Contacto, Seguir pedido y Envíos y entregas.

El tercer grupo recupera la orientación institucional solicitada sin convertirse
en un índice del footer. Cambios y devoluciones, preguntas frecuentes,
privacidad, términos y Libro de reclamaciones siguen en el pie de página porque
son destinos de soporte o legales y no decisiones primarias de compra.

## Marcas

Todas las entradas de marca llevan a la tienda mediante
`/catalogo?marca=<slug>`. El usuario mantiene el mismo catálogo, ve el filtro
activo y puede combinarlo con género, precio u orden. Las URL anteriores
`/marcas/<slug>` redirigen al filtro equivalente para no romper enlaces
guardados. Cada vista de una sola marca conserva metadatos y canonical propios.

## Interacción y accesibilidad

- Los paneles de escritorio funcionan con puntero y teclado; Escape los cierra y
  devuelve el foco al disparador.
- Los tres grupos usan la misma fuente de datos en escritorio y móvil.
- Los accesos de búsqueda, favoritos, cuenta y carrito mantienen objetivos de
  44 px, foco visible y un hover sin cajas de fondo.
- Las anclas cierran el diálogo móvil, liberan el scroll y llevan el foco al
  bloque correspondiente.

## Validación

La navegación se comprueba en `tests/navigation.spec.ts`, el recorrido de marcas
en `tests/catalog.spec.ts` y `tests/home-customer.spec.ts`, y la coherencia de
entrada en `tests/store-consistency.spec.ts`.
