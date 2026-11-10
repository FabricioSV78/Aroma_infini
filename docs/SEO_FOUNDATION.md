# Base técnica SEO — Aroma Infini

Base inicial: 19 de septiembre de 2026. Actualización de metadatos dinámicos: 1 de noviembre de 2026.

Esta entrega prepara el frontend actual para indexación futura sin publicar como reales las marcas, fotografías, productos, precios o disponibilidades ilustrativas. El proyecto permanece con `noindex,nofollow` por defecto.

## Implementación

- `src/seo/seo-config.ts` concentra títulos, descripciones, canonical, política de indexación, imágenes sociales y breadcrumbs por ruta.
- `src/seo/SeoManager.tsx` sincroniza el `<head>` al navegar en la SPA: description, robots, canonical, `hreflang`, Open Graph, Twitter Cards y JSON-LD.
- Home incluye datos estructurados seguros `Organization` y `WebSite`. Catálogo, marcas y fichas incluyen `BreadcrumbList`.
- No se publica todavía schema `Product`, `Offer`, reseñas, política de devoluciones ni información comercial. Esos datos deben coincidir con el catálogo real y con la posibilidad real de compra antes de habilitarlos.
- El catálogo principal tiene canonical limpio. Facetas, orden, paginación y búsquedas internas no se indexan para evitar combinaciones duplicadas.
- Favoritos, carrito, checkout, confirmación, seguimiento, cuenta, páginas pendientes y rutas inexistentes permanecen fuera del índice.
- `scripts/generate-seo-files.mjs` prepara `robots.txt` para el build y retira el sitemap estático antiguo. El Worker sirve robots y el índice dinámico desde el catálogo publicado, sujeto a la misma política de publicación.
- El HTML inicial contiene título, descripción y etiquetas sociales base. Vite inserta la política de robots correcta durante el build.

## Metadatos iniciales del catálogo remoto

El Worker entrega ahora el título, la descripción y las etiquetas sociales del producto o marca al abrir directamente su URL, sin esperar JavaScript. La corrección también cubre `/tienda?marca=<slug>` cuando contiene únicamente una marca: conserva el filtro y utiliza el canonical de `/marcas/<slug>`, igual que la navegación de la aplicación. Las demás combinaciones de filtros mantienen su comportamiento anterior.

`src/seo/catalog-metadata.ts` comparte la composición de estos textos con `seo-config.ts`. `worker/catalog-seo.ts` consulta las RPC públicas existentes: `catalog_product_context` para el producto y su marca en una sola lectura, y `catalog_brands` para las páginas de marca. No importa los adaptadores del navegador ni añade tablas, permisos, claves privilegiadas o consultas administrativas.

La respuesta se limita a 2 MiB y diez segundos, sin seguir redirecciones. Un producto inexistente conserva HTTP 404; una respuesta inválida o un fallo de consulta devuelve HTTP 503 con metadatos neutrales. Los textos comerciales se escapan como contenido, nunca como HTML ejecutable. La imagen social de un producto R2 necesita su manifiesto público verificado; las páginas de marca ofrecen inicialmente una vista previa de texto, y la aplicación puede incorporar después la fotografía del primer producto.

HTMLRewriter cambia únicamente el `head`: conserva el cuerpo y los recursos de la aplicación. Retira las cabeceras del shell que dejan de corresponder al HTML transformado, usa `Cache-Control: no-store` y responde a HEAD sin cuerpo. Las imágenes, URL y enlaces opcionales llevan `data-seo-managed="true"` para que `SeoManager` los retire al navegar a cuenta, carrito u otra página. No se insertan precios, reseñas ni schema comercial.

**En desarrollo y staging se mantiene `noindex,nofollow` tanto en HTML como en la cabecera.** El motor de sitemap ya está implementado, pero cerrado hasta la activación expresa del entorno y dominio de producción. Esto no convierte la SPA en SSR completo ni habilita pagos.

## Sitemap dinámico y activación de publicación

`src/domain/seo-publication.ts` comparte la política entre navegador, build y Worker: exige `production`, catálogo confirmado, permiso explícito de indexación, un dominio HTTPS comercial que coincida exactamente con el origen visitado y un proyecto Supabase independiente del de desarrollo. Una configuración ausente, staging, un host alternativo o un proyecto de desarrollo conserva noindex. No se habilita por parámetros de URL.

El Worker genera `/sitemap.xml` como índice y lo divide en `/sitemap-pages.xml`, `/sitemap-brands.xml` y `/sitemap-products-N.xml`. Las páginas estáticas utilizan la lista autorizada; las marcas y perfumes proceden exclusivamente de las RPC públicas existentes. Cada fragmento de productos consulta una sola página de cien productos, sin enumerar todos los datos por petición. Los productos desactivados o agotados conservan las mismas reglas de publicación del catálogo y no aparecen por un listado paralelo. No se inventan fechas de modificación ni prioridades.

El límite de paginación de la RPC existente permite hasta 100100 productos. Una respuesta que supere ese límite devuelve 503; no se emite un sitemap truncado. Se validan tipos, cantidades, duplicados y slugs, con límite de ocho MiB y diez segundos por consulta. Los fallos, redirecciones, respuestas incoherentes y fragmentos inexistentes no publican información parcial. HEAD devuelve las mismas condiciones sin cuerpo. El contenido XML se escapa y no incluye descripciones, precios, usuarios ni claves.

La activación futura requiere que las variables del frontend y Worker coincidan:

| Frontend | Worker | Durante preparación |
| --- | --- | --- |
| `VITE_ALLOW_INDEXING` | `SEO_ALLOW_INDEXING` | `false` |
| `VITE_CATALOG_IS_REAL` | `SEO_CATALOG_IS_REAL` | `false`, hasta validar contenido |
| `VITE_SITE_URL` | `SEO_SITE_URL` | Dominio definitivo al configurarlo |

Una vez aprobados dominio, entorno y pagos reales, ambos permisos podrán pasar a `true` mediante configuración. Las rutas directas válidas de producto y marca serán indexables; filtros, búsquedas, privados, 404 y 503 seguirán fuera del índice. Robots anuncia el índice sólo en el origen comercial autorizado. Antes de esa activación todos los endpoints de sitemap responden 404 sin consultar Supabase. El verificador `production:check` detecta diferencias entre las declaraciones de frontend y Worker y mantiene el bloqueo de lanzamiento actual.

Las pruebas nativas cubren 26 contratos de metadatos y sitemap, incluidos catálogos de 2350 y 100100 productos, la última página, respuestas vacías, límites, duplicados, errores y aislamiento de staging. No hubo consultas ni modificaciones alojadas en estas pruebas.

```powershell
npm.cmd run test:seo:worker
npx.cmd playwright test --config playwright.cleanup-local.config.ts tests/seo.spec.ts tests/seo-routing.spec.ts
npm.cmd run staging:check
```

Doce pruebas utilizan HTMLRewriter real en workerd con transporte aislado, incluidos escape de caracteres, fuentes de imagen, 404/503, límites, HEAD y conservación del cuerpo. Diez regresiones de SEO y navegación aprobaron con Chrome local; el caso nuevo comprueba que no permanezcan imágenes sociales del producto al entrar a la cuenta. La verificación alojada comparó el HTML inicial antes/después de tres URLs reales y un producto inexistente; el verificador operativo posterior aprobó sus 25 contratos y quince tamaños de fotografías. [Resultados](../artifacts/catalog-seo-2026-11-01/result.json).

## Activación futura

El entorno independiente ya tiene `.env.production.local` con la configuración pública de su propio proyecto, sin indexación. Cuando se confirmen el dominio y el contenido comercial, actualizar ese archivo y las variables SEO del Worker según [Preparación de producción](PRODUCTION_PREPARATION.md):

```env
VITE_ALLOW_INDEXING=true
VITE_CATALOG_IS_REAL=true
VITE_APP_ENV=production
VITE_SITE_URL=https://www.dominio-real.pe
```

El build falla de forma intencional si se intenta habilitar indexación con un dominio vacío o local. Al activarla, revisar antes:

1. marcas, productos, precios, stock, fotografías y textos definitivos;
2. políticas de envío y devolución publicadas;
3. enlaces institucionales terminados y códigos HTTP correctos;
4. fallback de React Router configurado en el hosting;
5. canonical HTTPS único entre `www` y sin `www`;
6. sitemap enviado a Google Search Console;
7. páginas principales probadas con URL Inspection y Rich Results Test;
8. schema `Product` y Merchant Center añadidos únicamente con datos comerciales reales.

## Alcance de la SPA y publicación posterior

La respuesta inicial del catálogo remoto ya proporciona metadatos propios por URL; el contenido visual sigue renderizándose con React. Las páginas estáticas conservan el prerender condicional existente. El sitemap dinámico queda listo para activación y validación con el dominio definitivo; producción, catálogo y pagos reales deben estar confirmados antes de cambiar las banderas. No se debe habilitar indexación únicamente porque las vistas previas ya tengan un título correcto.

## Fuentes técnicas

- [Google: JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: guía SEO para desarrolladores](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [Google: canonicalización](https://developers.google.com/search/docs/crawling-indexing/canonicalization)
- [Google: sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: datos estructurados de producto](https://developers.google.com/search/docs/appearance/structured-data/product)
- [Cloudflare: HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)
