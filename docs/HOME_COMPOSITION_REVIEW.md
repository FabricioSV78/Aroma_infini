# Home — composición y presencia editorial

Iteración implementada para revisión visual. Actualiza [HOME_REFINEMENT_REVIEW.md](HOME_REFINEMENT_REVIEW.md), sin ampliar la fase comercial.

## Criterio

El problema principal era la repetición de imágenes junto a textos pequeños con una jerarquía similar. La intervención se concentra en escala, proporción y diferencias entre secciones; conserva blanco, tipografía, fotografía existente y márgenes comunes.

Se volvieron a consultar las portadas de [Jovoy](https://www.jovoyparis.com/en/), [Aedes](https://www.aedes.com/), [D.S. & Durga](https://www.dsanddurga.com/), [Vilhelm](https://vilhelmparfumerie.com/), [Twisted Lily](https://twistedlily.com/) y [Phlur](https://phlur.com/), junto con la auditoría local. Se interpretan descubrimiento multimarca, jerarquía comercial, escala de campaña y continuidad editorial; no se reproducen layouts ni se descargan imágenes de esas tiendas.

## Cambios

- **Marcas:** titular «Un universo. Distintas firmas.» con escala de 44 a 72 px. Directorio de nombres con una misma tipografía, ahora de mayor tamaño. En escritorio la fotografía pasa a la derecha y ocupa más superficie; en móvil conserva un encuadre horizontal, con nombres en dos columnas. El conjunto utiliza espacio para la fotografía y los nombres, sin descripciones adicionales por marca.
- **Destacados:** el titular se independiza de las fichas y encabeza toda la composición. El texto se distribuye de forma equilibrada entre líneas. Fotografía y productos quedan debajo; el tamaño de la fotografía se ajusta para compensar el nuevo encabezado. Las miniaturas editoriales crecen de 92 a 120 px desde 1024 px y sus metadatos se centran verticalmente.
- **Marca destacada:** una frase más breve identifica directamente Bois Clair y ATELIER 01. Se conserva el contenedor alineado con el resto del recorrido.
- **Cierre:** el titular escala hasta 86 px en escritorio para dar presencia al tramo final sin añadir más contenido.

Se mantienen hero de tres campañas cada tres segundos, indicador, pausa accesible, navegación de tres grupos, categorías y Más vendidos aprobados, favoritos locales, precios según disponibilidad y advertencia global de prototipo. La variante estándar de ProductCard conserva sus fotografías alineadas y su fundido entre imágenes.

El mayor espacio de marcas y el encabezado de destacados aumentan la altura de Home aproximadamente 145 px a 390 px y 317 px a 1440 px frente a la iteración anterior. Es un intercambio deliberado por mayor escala; no se añadieron secciones. [Medidas actuales](../artifacts/home-audit/composition/measurements.json).

## Validación

Typecheck, lint y build correctos; **30 pruebas aprobadas**, sin errores ni warnings. Ocho anchos: 360, 375, 390, 430, 768, 1024, 1280 y 1440 px. Cero overflow horizontal, imágenes rotas o errores/advertencias de consola en los recorridos automatizados. CLS observado menor de 0.002 en Chrome local.

Capturas completas y revisión visual: [390 px](../artifacts/home-audit/composition/home-390.png), [768 px](../artifacts/home-audit/composition/home-768.png), [1440 px](../artifacts/home-audit/composition/home-1440.png). Detalles: [marcas](../artifacts/home-audit/composition/brands-1440.png) y [destacados](../artifacts/home-audit/composition/featured-1440.png).

Con Vite activo, `node scripts/capture-home-audit.mjs composition` reproduce las capturas y las medidas. Son comprobaciones locales, no pruebas con clientes ni métricas de conversión.

Archivos modificados: `src/features/home/HomeSections.tsx`, `src/features/home/ProductCard.tsx`, `src/styles/home.css`, `src/styles/product-card.css`, `scripts/capture-home-audit.mjs`, documentación y README. No se añaden dependencias ni assets.

Pendiente: aprobación visual de esta composición. Catálogo completo, backend, autenticación, pagos y administración siguen fuera del alcance.
