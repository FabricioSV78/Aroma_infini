# Base técnica SEO — Aroma Infini

Fecha: 19 de septiembre de 2026.

Esta entrega prepara el frontend actual para indexación futura sin publicar como reales las marcas, fotografías, productos, precios o disponibilidades ilustrativas. El proyecto permanece con `noindex,nofollow` por defecto.

## Implementación

- `src/seo/seo-config.ts` concentra títulos, descripciones, canonical, política de indexación, imágenes sociales y breadcrumbs por ruta.
- `src/seo/SeoManager.tsx` sincroniza el `<head>` al navegar en la SPA: description, robots, canonical, `hreflang`, Open Graph, Twitter Cards y JSON-LD.
- Home incluye datos estructurados seguros `Organization` y `WebSite`. Catálogo, marcas y fichas incluyen `BreadcrumbList`.
- No se publica todavía schema `Product`, `Offer`, reseñas, política de devoluciones ni información comercial. Esos datos deben coincidir con el catálogo real y con la posibilidad real de compra antes de habilitarlos.
- El catálogo principal tiene canonical limpio. Facetas, orden, paginación y búsquedas internas no se indexan para evitar combinaciones duplicadas.
- Favoritos, carrito, checkout, confirmación, seguimiento, cuenta, páginas pendientes y rutas inexistentes permanecen fuera del índice.
- `scripts/generate-seo-files.mjs` genera `robots.txt` y, solo al activar producción correctamente, `sitemap.xml`. La lista autorizada está en `src/seo/indexable-paths.json`.
- El HTML inicial contiene título, descripción y etiquetas sociales base. Vite inserta la política de robots correcta durante el build.

## Activación futura

Crear `.env.production.local` a partir de `.env.example` cuando estén confirmados el dominio y el contenido comercial:

```env
VITE_ALLOW_INDEXING=true
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

## Límite de la SPA

Google puede renderizar JavaScript y leer metadatos o JSON-LD inyectados, pero otros crawlers sociales pueden leer solo el HTML inicial. Antes del lanzamiento público conviene prerenderizar las rutas indexables o servir metadatos por URL desde el hosting. Esta entrega no cambia React + Vite ni introduce SSR porque supondría una decisión de arquitectura y despliegue fuera de esta fase.

## Fuentes técnicas

- [Google: JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: guía SEO para desarrolladores](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [Google: canonicalización](https://developers.google.com/search/docs/crawling-indexing/canonicalization)
- [Google: sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google: datos estructurados de producto](https://developers.google.com/search/docs/appearance/structured-data/product)
