# Assets temporales — fases 1 y 2

**Calidad de las cuatro categorías (24/10/2026):** el Home con Complementos activado utiliza variantes WebP `*-category-{ancho}.webp`, preparadas directamente desde los PNG originales en proporción 4:5. `scripts/prepare-category-images.mjs` genera únicamente tamaños reales, sin ampliación ni recompresión de las versiones anteriores. `src/content/category-images.ts` registra las dimensiones y candidatos disponibles. La presentación de tres categorías conserva sus fotografías y composición anteriores.

`srcset` y `sizes` reflejan el ancho de las cuatro columnas de escritorio, las dos columnas de tablet y móvil, los márgenes y el pequeño zoom existente. La selección se comprobó con pantallas 2× y 3× usando el archivo descargado y sus píxeles reales. Se mantiene carga diferida, decodificación asíncrona y dimensiones explícitas. Criterios: [imágenes responsive de MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images) y [redimensionado sin ampliación de Sharp](https://sharp.pixelplumbing.com/api-resize/).

Las nuevas imágenes de categorías del panel conservan hasta **1600 × 2000 px**, con WebP de calidad 0,90 y reducción de alta calidad. Siguen aceptando el mínimo de 800 × 1000 px y no amplían archivos pequeños. Las fotografías ya guardadas no pueden recuperar detalle que hubiese sido descartado: se reemplazan desde el mismo editor si se dispone de un original mayor. Los requisitos y tamaños de producto, hero y recomendador permanecen independientes.

La sección muestra las cuatro categorías en una sola fila desde 1024 px, usando el contenedor general del sitio, las fotografías verticales y los textos debajo. En tablet y móvil mantiene dos columnas. Los límites nativos son: Para él 1024 × 1280 px útiles; Para ella y Unisex 816 × 1020; Complementos 1120 × 1400. En pantallas densas se usa el máximo nativo cuando el original no alcanza todos los píxeles requeridos. No se presentan imágenes ampliadas artificialmente como si tuvieran mayor resolución.

Validación: pruebas de proporciones, alineaciones, teclado, filtros, resolución, subidas y activación de Complementos. Capturas en `artifacts/categories-redesign/` y medidas en `artifacts/category-image-quality/`, incluyendo desktop/laptop/tablet a 2× y móvil a 3×. Log de la restauración: `artifacts/category-row-restored/test.log`.

**Categoría Complementos:** fotografía conceptual provisional de atomizadores, creada con la herramienta integrada `image_gen` para sustituir la ilustración del Home. Archivos WebP: `public/images/discovery-complements-v1-{480,960,1122}.webp`. El original mide 1122 × 1402 px; no se amplía artificialmente. Prompt exacto, origen y condición provisional: [category-complements-v1.json](../scripts/category-complements-v1.json). Preparación: `node scripts/prepare-category-complements.mjs <original>`. Es editable desde Contenido del Home → Categorías y no representa un producto comercial disponible.

**Tercera campaña del hero:** [hero-v3-assets.json](../scripts/hero-v3-assets.json) registra los dos encuadres del frasco rosado, prompts y referencias. Preparación: [prepare-hero-v3.mjs](../scripts/prepare-hero-v3.mjs). Entrega: [HOME_REFINEMENT_REVIEW.md](HOME_REFINEMENT_REVIEW.md).

**Fotografía de la revisión premium:** [HOME_PREMIUM_REVIEW.md](HOME_PREMIUM_REVIEW.md#fotografías-y-procedencia) documenta las composiciones `editorial-essential-v3` y `featured-duo-v3`, creadas a partir de los frascos conceptuales existentes. Prompts exactos, referencias y originales: [home-premium-assets.json](../scripts/home-premium-assets.json). El inventario siguiente corresponde a los primeros assets.

Generados con la herramienta integrada `image_gen` (modo generación). Imágenes originales para esta propuesta, sin material descargado de las referencias. No representan productos reales. No deben utilizarse como fichas comerciales definitivas.

Los originales se conservan en `C:/Users/USUARIO/.codex/generated_images/01a097a9-5d43-72c3-9e56-29e1fb6b1905`. `scripts/prepare-images.mjs` crea copias WebP dimensionadas; no altera los originales. Las copias están en `public/images/` y se sirven localmente. Sustituir también nombres, precios y descripciones mock al incorporar el catálogo real.

## hero

Original: `exec-3edd4e14-942f-4805-a0db-10b5dfeeaa02.png`.

Uso: Hero y recorte editorial.

Entregables: `public/images/hero-480.webp`, `public/images/hero-960.webp`, `public/images/hero-1536.webp`.

Prompt exacto:

> Use case: product-mockup. Create one original editorial perfume still life photograph for a white premium multi-brand fragrance shop website, horizontal 3:2 composition. A large clear rectangular unbranded perfume bottle with pale straw liquid and matte black architectural rectangular cap rests on a light limestone slab, another smaller clear cylindrical perfume bottle farther back, muted olive branches softly entering from top left, a cut bergamot near the base. Bright natural side window light, refined glass refractions, pale ivory plaster background, realistic tactile stone, soft long shadows, elegant restraint. Bottle grouping in the right half, generous breathing room, no humans. Sophisticated actual commercial studio photograph, not illustration, no gradients or CGI look. No lettering, logos, recognizable branded packaging or watermarks. This is a temporary concept image, not a real product. 1536x1024.

## cedre

Original: `exec-b066f681-bd42-4c7a-b959-c11d3efadde0.png`.

Uso: Producto conceptual y composición de categoría; sillage también aparece en el segundo slide.

Entregables: `public/images/cedre-480.webp`, `public/images/cedre-960.webp`.

Prompt exacto:

> Use case: product-mockup. One single original high-end studio packshot of an unbranded clear rectangular perfume bottle with very pale amber liquid, thick glass base, small blank white label and a tall matte charcoal rectangular cap. Straight-on centered composition, complete bottle uncropped occupies 65 percent height. Seamless very light off-white background, subtle natural contact shadow, beautiful glass reflections, no props, no lettering or logos or watermarks, no recognizable brand design. Photorealistic, refined and minimal, mock perfume for a visual proposal. Portrait 1024x1280.

## petale

Original: `exec-4bbdfe84-57b2-4b0b-8845-db8d810088b5.png`.

Uso: Producto conceptual y composición de categoría; sillage también aparece en el segundo slide.

Entregables: `public/images/petale-480.webp`, `public/images/petale-960.webp`.

Prompt exacto:

> Use case: product-mockup. One single original high-end studio packshot of an unbranded short wide cylindrical glass perfume bottle with very pale rose tinted liquid, thick clear base, blank cream label and broad brushed silver cylindrical cap. Straight-on centered composition, complete bottle uncropped occupies 65 percent height. Seamless very light off-white background, subtle natural contact shadow, beautiful glass reflections, no props, no lettering or logos or watermarks, no recognizable brand design. Photorealistic, refined and minimal, mock perfume for a visual proposal. Portrait 1024x1280.

## sillage

Original: `exec-b0ab8358-ac36-4243-998d-5db8be240833.png`.

Uso: Producto conceptual y composición de categoría; sillage también aparece en el segundo slide.

Entregables: `public/images/sillage-480.webp`, `public/images/sillage-960.webp`, `public/images/sillage-1536.webp`.

Prompt exacto:

> Use case: product-mockup. One single original high-end studio packshot of an unbranded tall rectangular smoky olive green translucent glass perfume bottle with blank small ivory label and rounded matte black cap. Straight-on centered composition, complete bottle uncropped occupies 65 percent height. Seamless very light off-white background, subtle natural contact shadow, beautiful glass reflections, no props, no lettering or logos or watermarks, no recognizable brand design. Photorealistic, refined and minimal, mock perfume for a visual proposal. Portrait 1024x1280.

## ambre

Original: `exec-042236bc-7017-40e1-a1a3-e16bb16a7305.png`.

Uso: Producto conceptual y composición de categoría; sillage también aparece en el segundo slide.

Entregables: `public/images/ambre-480.webp`, `public/images/ambre-960.webp`.

Prompt exacto:

> Use case: product-mockup. One single original high-end studio packshot of an unbranded compact square thick transparent glass perfume bottle with dark amber liquid, blank pale ivory label and flat black rectangular cap. Straight-on centered composition, complete bottle uncropped occupies 65 percent height. Seamless very light off-white background, subtle natural contact shadow, beautiful glass reflections, no props, no lettering or logos or watermarks, no recognizable brand design. Photorealistic, refined and minimal, mock perfume for a visual proposal. Portrait 1024x1280.
