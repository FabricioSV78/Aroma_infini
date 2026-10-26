# Aroma Infini

Frontend de Aroma Infini con React, TypeScript, Vite y Tailwind CSS: tienda pública, catálogo, fichas, carrito, favoritos, checkout de demostración y panel administrativo. El catálogo y el contenido editado se comparten en este navegador mediante servicios e IndexedDB; todavía no hay autenticación administrativa, pasarela de pago, Supabase ni R2 conectados. El diseño aprobado se conserva. Las fixtures y los recursos provisionales no representan datos comerciales reales.

La referencia técnica vigente es [Auditoría técnica](docs/TECHNICAL_AUDIT.md), junto con [Preparación para Supabase](docs/SUPABASE_READINESS.md), [Preparación de medios y R2](docs/MEDIA_READINESS.md) y [Auditoría de imágenes](docs/ASSET_AUDIT.md). Los informes de fases anteriores se conservan como historial y pueden describir funciones o composiciones ya retiradas.

El sistema de mensajes del panel, sus criterios de modal/toast/validación, recuperación de guardados y capturas se documentan en [Mensajes administrativos](docs/ADMIN_MESSAGES.md).

La selección de pedidos, los cambios de estado y la exportación de documentos se explican en [Pedidos y PDF](docs/pedidos-pdf.md).

## Ejecutar en Windows / PowerShell

Requiere Node.js 22.13 o posterior compatible con Vite 8 y las herramientas de verificación de PDF. Se verificó con Node.js 24.18.1.

```powershell
npm.cmd ci
npm.cmd run dev
```

Abrir http://127.0.0.1:5173. En macOS/Linux se puede usar `npm` en lugar de `npm.cmd`.

## Comprobaciones

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

Las pruebas de navegador usan Google Chrome instalado y arrancan Vite si es necesario. Guardan capturas en `artifacts/`, directorio excluido del control de versiones. Si el entorno define simultáneamente `NO_COLOR` y `FORCE_COLOR`, se puede quitar `NO_COLOR` de la sesión antes de las pruebas para evitar el aviso del ejecutor sobre colores; no afecta a la aplicación.

`npm.cmd run preview` permite comprobar `dist/` en http://127.0.0.1:4173 después del build. `npm.cmd run format` formatea código y configuración.

## Dónde modificar la propuesta

La última iteración visual está en [HOME_GALLERY_REVIEW.md](docs/HOME_GALLERY_REVIEW.md): Más vendidos sobre blanco, galería de marcas con fotografía y transiciones entre superficies. Capturas actuales: `node scripts/capture-home-audit.mjs gallery` con Vite activo.

- Orden de Home: `sectionOrder` en `src/features/home/HomePage.tsx`.
- Secciones independientes: `src/features/home/HomeSections.tsx`; `BrandGallery.tsx` contiene la galería de firmas. Hero y tarjeta de producto tienen archivos propios.
- Hero y categorías: `src/content/home.ts`. El resto del copy editorial temporal está junto a su sección, sin crear un CMS anticipado.
- Navegación y footer: `src/content/navigation.ts`.
- Productos, variantes y marcas iniciales: `src/mocks/home.ts`; altas adicionales en `src/content/catalog-products.ts`. La Tienda normal comienza con 15 productos publicables (12 + 3), además de Ambre Lent agotado y desactivado. La actualización del catálogo retira las muestras de paginación anteriores y se registra una sola vez en IndexedDB; conserva las ediciones, desactivaciones y productos propios del panel.
- Lectura pública: `home-service.ts` y `catalog-service.ts` consumen `StorefrontRepository`; el adaptador local obtiene el mismo catálogo publicable que edita el panel.
- Catálogo, marcas y búsqueda: `src/features/catalog/`; estilos en `src/styles/catalog.css`.
- Ficha, galería y perfil olfativo: `src/features/product/`; contenido temporal en `src/mocks/product-details.ts` y estilos en `src/styles/product-detail.css`.
- Favoritos y carrito: `src/features/favorites/` y `src/features/cart/`; resolución de variantes y totales en `src/services/commerce-service.ts`, estilos en `src/styles/commerce.css`.
- Checkout y seguimiento de demostración: `src/features/checkout/`, escenarios y cálculos en `src/services/checkout-service.ts`, registro mínimo sin datos personales en `src/services/order-tracking-service.ts` y estilos en `src/styles/checkout.css`.
- Cuenta de demostración: `src/features/account/`, entidades y transformación de pedidos en `src/services/account-service.ts`, y estilos en `src/styles/account.css`. El estado es efímero y no almacena datos personales.
- Institucionales: `src/features/institutional/` y `src/styles/institutional.css`. El copy pendiente se identifica en cada vista y no inventa condiciones, datos legales ni canales.
- Panel administrativo: `src/features/admin/`, reglas y estado compartido en `src/services/admin-service.ts`; persistencia local transaccional en `admin-persistence.ts` (IndexedDB). Los cambios sobreviven a la recarga en ese navegador; no se comparten entre dispositivos y no existe autenticación todavía.
- SEO por ruta: `src/seo/`, generación de robots/sitemap en `scripts/generate-seo-files.mjs` y criterios de activación en [SEO_FOUNDATION.md](docs/SEO_FOUNDATION.md). El prototipo continúa con `noindex` hasta confirmar dominio y contenido comercial.
- Comparación completa entre el sistema y las respuestas del cliente: [CLIENT_REQUIREMENTS_COMPARISON.md](docs/CLIENT_REQUIREMENTS_COMPARISON.md). Distingue capacidades de demo, requisitos cumplidos, contenido pendiente y decisiones que no deben inventarse.
- Paleta, espaciado y tipografía: `src/styles/tokens.css`. La jerarquía se documenta en [TYPOGRAPHY_REVIEW.md](docs/TYPOGRAPHY_REVIEW.md) y se aplica desde `src/styles/typography.css`. `global.css` importa los estilos por responsabilidad.
- Imágenes locales y procedencia: [ASSETS.md](docs/ASSETS.md). `asset-source.ts` resuelve URLs públicas y `image-source.ts` las variantes; el origen de medios sigue siendo local. Las miniaturas del recomendador se generan con `node scripts/prepare-finder-thumbnails.mjs`.
- Revisión visual del header/hero: [PHASE_2_VISUAL_REVIEW.md](docs/PHASE_2_VISUAL_REVIEW.md). Nuevas fotografías y prompts: [HERO_V2_ASSETS.md](docs/HERO_V2_ASSETS.md).
- Segunda revisión del Home, capturas y fotografías de categorías: [HOME_EDITORIAL_REVIEW.md](docs/HOME_EDITORIAL_REVIEW.md). Con Vite activo, `node scripts/capture-home-review.mjs` genera las capturas a 390 y 1440 px.
- Navbar completo y accesos a los apartados públicos: [NAVIGATION_REVIEW.md](docs/NAVIGATION_REVIEW.md). Capturas: `node scripts/capture-navigation-review.mjs` con Vite activo.
- Revisión previa de precios, favoritos locales, CSS y carga del hero: [HOME_FRONTEND_AUDIT.md](docs/HOME_FRONTEND_AUDIT.md).
- Revisión histórica de Home: [HOME_REFINEMENT_REVIEW.md](docs/HOME_REFINEMENT_REVIEW.md). La implementación vigente tiene cinco campañas y un intervalo de 3800 ms en `useHeroRotation.ts`; los controles, las categorías y la marca destacada del menú se administran según las interfaces actuales. Los scripts de esa fase se conservan como evidencia histórica.

Con Vite activo, `node scripts/capture-hero-review.mjs` genera capturas de las tres campañas a 1440 y 390 px, revisa contraste sobre la fotografía y captura la transición hacia marcas. Añadir `--all` extiende la revisión a los ocho anchos. Los archivos se guardan en `artifacts/home-refinement/hero/`. `node scripts/capture-home-closing.mjs` captura el cierre hasta 1920 px.

La Fase 3 está disponible en `/catalogo`, `/marcas`, `/marcas/:slug` y `/buscar?q=petale`. La Fase 4 está en `/producto/:slug`. La Fase 5 añade `/favoritos` y `/carrito`. La Fase 6 incorpora `/checkout`, `/checkout/confirmacion` y `/seguir-pedido` como simulación preparada para Mercado Pago. La Fase 7 completa `/cuenta` y sus vistas privadas de demostración. La Fase 8 incorpora `/nosotros`, contacto, entregas, devoluciones, preguntas frecuentes y estructuras legales pendientes. La Fase 9 añade `/admin` y sus módulos de productos, marcas, categorías, pedidos, clientes, promociones, envíos y Home. Las reseñas permanecen ocultas hasta disponer de testimonios reales.

El resultado de Vite es estático y no depende de un servidor propio. El entorno de validación está preparado como Worker de activos estáticos con fallback SPA, cabeceras de seguridad y configuración independiente de `staging`; consulta [CLOUDFLARE_STAGING.md](docs/CLOUDFLARE_STAGING.md). R2, Supabase, pagos y cualquier backend continúan deliberadamente fuera de este despliegue frontend.

La entrega anterior está en [PHASE_1_2_DELIVERY.md](docs/PHASE_1_2_DELIVERY.md). El usuario autorizó continuar con la Fase 3 manteniendo la Home. Su entrega y límites están en [PHASE_3_DELIVERY.md](docs/PHASE_3_DELIVERY.md). Capturas: `node scripts/capture-phase-3.mjs` con Vite activo.

La ficha y el perfil olfativo de Fase 4 se documentan en [PHASE_4_DELIVERY.md](docs/PHASE_4_DELIVERY.md). Capturas: `node scripts/capture-phase-4.mjs` con Vite activo.

Favoritos y carrito de Fase 5 se documentan en [PHASE_5_DELIVERY.md](docs/PHASE_5_DELIVERY.md). Capturas y mediciones: `node scripts/capture-phase-5.mjs` con Vite activo.

El checkout simulado de Fase 6 se documenta en [PHASE_6_DELIVERY.md](docs/PHASE_6_DELIVERY.md). Capturas y mediciones: `node scripts/capture-phase-6.mjs` con Vite activo.

La cuenta de demostración de Fase 7 se documenta en [PHASE_7_DELIVERY.md](docs/PHASE_7_DELIVERY.md). Capturas y mediciones: `node scripts/capture-phase-7.mjs` con Vite activo.

Los institucionales de Fase 8 se documentan en [PHASE_8_DELIVERY.md](docs/PHASE_8_DELIVERY.md). Capturas y mediciones: `node scripts/capture-phase-8.mjs` con Vite activo.

El panel administrativo frontend de Fase 9 se documenta en [PHASE_9_DELIVERY.md](docs/PHASE_9_DELIVERY.md). Capturas y mediciones: `node scripts/capture-phase-9.mjs` con Vite activo.
