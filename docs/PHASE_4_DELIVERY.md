# Fase 4 — Ficha de producto y perfil olfativo

Fecha: 14 de septiembre de 2026. Alcance: Fase 4 de [FRONTEND_DESIGN_PLAN.md](FRONTEND_DESIGN_PLAN.md), autorizada por la solicitud de continuar con la siguiente fase. Se tomaron como requisitos referenciales las respuestas de `Cuestionario_Diseno_Ecommerce_Perfumeria (1).docx`.

## Refinamiento de amplitud y presencia

La ficha se amplió después de la primera revisión visual. A 1440 px, el margen lateral del bloque principal y las recomendaciones se redujo de 80 a 28 px. Galería y compra forman una composición editorial continua con fotografía de escala controlada, título expresivo y un panel de compra deliberadamente mínimo. Se retiraron divisores decorativos, el resumen repetido de notas y la información de entrega duplicada. El lienzo de la galería toma el tono de las fotografías y en escritorio respeta su proporción vertical, eliminando las franjas que hacían percibir dos fondos. Las miniaturas conservan estados activos claros y la imagen entra mediante un asentamiento muy leve, desactivado con movimiento reducido. Móvil mantiene 16 px de margen, producto completo y precio dentro del primer recorrido.

## Optimización de la primera impresión

La cabecera de la ficha y el breadcrumb se compactaron para adelantar el contenido principal. En escritorio, la galería vertical contenida permite ver el frasco completo junto con marca, nombre, precio, presentaciones y acción principal dentro de 1440 × 900 px. En tableta se usa un encuadre panorámico que conserva protagonismo fotográfico y muestra nombre y precio en el primer viewport; en móvil se mantienen visibles la imagen, la identidad y el precio sin reducir los controles táctiles.

## Navegación de la ficha

La primera vista incorpora dos accesos internos discretos: “Familia olfativa” y “Descripción”. Ambos llevan a un único módulo de información y dejan seleccionada la pestaña correspondiente. La barra permanece bajo el header mientras se consulta el módulo y muestra con una línea cuál es la opción activa. Se eliminó el divisor situado encima de las pestañas. Solo se presenta un panel a la vez: familia utiliza una ficha enmarcada con familia, medidor de intensidad, temporada, momento y evolución principal; descripción presenta únicamente el relato de la fragancia, centrado y sin subtítulos.

Las pestañas siguen el patrón accesible `tablist`/`tab`/`tabpanel`, admiten flechas izquierda y derecha, Inicio y Fin, conservan foco visible y reducen la transición cuando el sistema lo solicita.

## Decisiones del cliente aplicadas

- Marca, nombre, tipo, descripción, presentación y precio permanecen próximos a la galería. “Disponible” se anuncia de forma accesible sin ocupar espacio visual; “Agotado” sí permanece visible por ser una excepción relevante.
- Cada presentación tiene precio y estado propios. Una opción agotada puede inspeccionarse, pero no se anuncia como comprable.
- El perfil resume la evolución mediante la primera nota de salida, corazón y fondo; añade familia, medidor de intensidad, ocasión y temporada sin convertir la sección en una ficha técnica extensa.
- La galería admite cuatro vistas. Los fixtures actuales derivan cuatro encuadres de las dos fotografías temporales disponibles por producto; los cuatro assets definitivos continúan pendientes.
- Se incluyen recomendaciones editoriales y un favorito local accesible. Su persistencia compartida corresponde a Fase 5.
- La transparencia de prototipo permanece centralizada en el aviso global; la ficha no incorpora textos de procedencia, certificados, proveedores ni sellos todavía no confirmados.
- No existe FAQ en la ficha. Las reseñas permanecen ausentes hasta contar con experiencias reales.

## Criterios tomados de las referencias

La solución combina la información olfativa legible de [Jovoy](https://www.jovoyparis.com/en/spicy-perfumes/9267-talisman-welton-x-chris-collins.html), la galería compacta observada en [Aedes](https://www.aedes.com/), la claridad de intensidad y tamaños de [D.S. & Durga](https://www.dsanddurga.com/products/i-dont-know-what), la escala fotográfica de [Vilhelm](https://vilhelmparfumerie.com/products/dear-polly), la señal de autenticidad presente en [Twisted Lily](https://twistedlily.com/collections/new-arrivals/products/ambre-latte) y la continuidad mediante recomendaciones de [Phlur](https://phlur.com/products/missing-person-100ml). No se copiaron layouts, textos, identidades ni condiciones comerciales.

## Entrega

- `/producto/:slug` resuelve las cuatro fragancias de muestra y presenta un estado específico para URL inexistente o fallo de servicio.
- Desktop: miniaturas, imagen principal con fundido y resumen de compra fijo mientras se recorre la galería.
- Móvil/tablet: carrusel táctil nativo con snap, contador, cuatro controles de 44 px y una imagen que no recorta el producto.
- Selector radio de ml con precio por opción, cambio anunciado, disponibilidad accesible y estado agotado visible.
- CTA de carrito deliberadamente inactivo y explicado: el carrito funcional pertenece a Fase 5.
- Perfil olfativo editorial enmarcado, con escala de intensidad y tres atributos escaneables.
- El anuncio global conserva la información breve confirmada de envíos a Perú y gratuidad desde S/450, evitando repetirla dentro del panel de compra.
- Recomendaciones con las tarjetas existentes, foto alternativa y favoritos locales.
- Título de documento por producto, breadcrumbs y retorno al catálogo.

## Responsive, accesibilidad y rendimiento

La primera fotografía usa carga prioritaria; las restantes y las recomendaciones mantienen carga diferida. La galería usa controles nativos, botones con nombre, `aria-current` y anuncio del contador. Las variantes son radios reales y el favorito usa `aria-pressed`. Se heredan foco visible y `prefers-reduced-motion`.

La ficha se comprobó en 360, 375, 390, 430, 768, 1024, 1280 y 1440 px. Capturas completas y del primer viewport:

- [390 px](../artifacts/phase-4/product-390.png)
- [768 px](../artifacts/phase-4/product-768.png)
- [1440 px](../artifacts/phase-4/product-1440.png)
- [Familia olfativa activa, 1440 px](../artifacts/phase-4/product-family-tab-1440.png)
- [Descripción activa, 1440 px](../artifacts/phase-4/product-description-tab-1440.png)
- [Producto agotado](../artifacts/phase-4/sold-out-1440.png)
- [Mediciones](../artifacts/phase-4/measurements.json)

En las capturas: cero overflow horizontal, cero imágenes rotas y cero errores o avisos de consola. Alturas documentales con “Familia olfativa” activa: 3,545 px a 390; 3,271 px a 768; 2,937 px a 1440. El script reproducible es `node scripts/capture-phase-4.mjs` con Vite activo.

## Validación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd run lint`: correcto, cero warnings.
- `npm.cmd run build`: correcto, cero warnings.
- `npm.cmd run test:e2e -- --workers=1`: 65 pruebas correctas; 16 corresponden directamente a la Fase 4.

Las pruebas cubren loader listo/inexistente/error, precio por variante, agotados, favorito, galería por teclado y táctil, cambio de pestañas en escritorio y móvil, navegación de pestañas por teclado, recomendaciones, ocho anchos, imágenes, consola y overflow. La suite también conserva las regresiones de Home, hero, navegación, ProductCard, catálogo, filtros, marcas y búsqueda.

## Archivos

Nuevos: `src/features/product/{ProductPage,ProductGallery,product-loader}.tsx`, `src/mocks/product-details.ts`, `src/styles/product-detail.css`, `tests/product-detail.spec.ts`, `scripts/capture-phase-4.mjs` y este documento.

Actualizados: `src/app/router.tsx`, `src/types/catalog.ts`, `src/services/catalog-service.ts`, `src/styles/global.css` y `README.md`.

## Pendiente deliberadamente

Fotografías, marcas, productos, notas, ocasiones, temporadas, precios y stock continúan como fixtures identificados globalmente en el footer. Quedan pendientes los cuatro assets reales por perfume, textos comerciales, documentación de autenticidad y catálogo definitivo. Favoritos persistentes, carrito, cantidades y confirmación de agregado pertenecen a Fase 5. No se implementaron backend, Supabase, cuenta, checkout, pagos, administración ni publicación.
