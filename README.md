# Aroma Infini

Despliegues desde GitHub: [configuración de ramas, staging y aprobación de producción](docs/GITHUB_DEPLOYMENT.md). El flujo está preparado en `.github/workflows/`; requiere configurar los entornos y secretos de GitHub antes de su primera ejecución. Producción permanece cerrada y deshabilitada por defecto.

Estado y mantenimiento: [consolidación técnica del 8 y 9 de noviembre de 2026](docs/PROJECT_HEALTH_IMPROVEMENTS_2026_11_08.md). Para seguridad y condiciones de apertura, consultar la [auditoría del 7 de noviembre](docs/SECURITY_ROBUSTNESS_AUDIT_2026_11_07.md) y el [checklist de lanzamiento](docs/LAUNCH_AUDIT_2026_11_06.md). Cada informe conserva su fecha y el alcance real de sus pruebas; los anteriores son historial.

Frontend de Aroma Infini con React, TypeScript, Vite y Tailwind CSS: tienda pública, catálogo, fichas, carrito, favoritos, checkout de demostración y panel administrativo. Supabase Auth, perfil, dirección y catálogo están conectados en desarrollo; el acceso administrativo requiere membresía por UUID y MFA. Productos, marcas, variantes, stock, ofertas, Complementos y marca destacada utilizan comandos remotos. Las fotografías de productos están conectadas en desarrollo a un bucket R2 privado mediante el Worker: la subida verifica permisos y MFA, Supabase conserva referencias y se entregan variantes WebP verificadas. El editor del Home también guarda contenido versionado en Supabase y medios en R2, incluido vídeo principal y móvil; véase [Home remoto](docs/R2_HOME_IMPLEMENTATION.md). La [Fase 5](docs/SUPABASE_PHASE_5.md) conecta envíos, cupones, cotización y pedidos de prueba en Supabase. Estos pedidos no cobran, reservan stock ni gastan usos de cupón; el carrito conserva su almacenamiento de navegador. La [Fase 6](docs/SUPABASE_PHASE_6.md) conecta favoritos por cuenta; los favoritos de invitado siguen separados en este navegador. Mercado Pago permanece simulado y los pagos reales no están conectados. Las fixtures y recursos provisionales no se importan automáticamente a Supabase ni a R2.

La [auditoría técnica de octubre](docs/TECHNICAL_AUDIT.md), la [preparación inicial de Supabase](docs/SUPABASE_READINESS.md), la [preparación de medios](docs/MEDIA_READINESS.md) y la [auditoría de imágenes](docs/ASSET_AUDIT.md) documentan decisiones de fases anteriores; no sustituyen los informes actuales de integración y seguridad. La integración de fotografías se documenta en [Plan de R2](docs/R2_INTEGRATION_PLAN.md), [Operación de medios](docs/R2_MEDIA_OPERATIONS.md) y [Implementación de R2](docs/R2_IMPLEMENTATION.md). Los informes de fases anteriores se conservan como historial y pueden describir funciones o composiciones ya retiradas.

El sistema de mensajes del panel, sus criterios de modal/toast/validación, recuperación de guardados y capturas se documentan en [Mensajes administrativos](docs/ADMIN_MESSAGES.md).

El [carrusel multimedia del Home](docs/HERO_CAMPAIGNS.md) admite hasta diez campañas administrables con imagen o vídeo, portadas, versión móvil opcional, textos/botón configurables y destinos internos por producto o sección. Reutiliza Supabase/R2, MFA, versiones y limpieza segura.

En **Mi cuenta → Direcciones**, el cliente puede [guardar una ubicación precisa por GPS o mapa](docs/ACCOUNT_DELIVERY_LOCATION.md), ajustar el pin y conservarlo de forma privada junto a su dirección escrita.

La [limpieza de interfaces y barreras de producción](docs/INTERFACE_PRODUCTION_CLEANUP.md) retira residuos comerciales de demostración y separa los entornos. `npm run build` bloquea el checkout mientras no exista pago real; `npm run build:staging` conserva las pruebas sólo en el origen de staging autorizado. Catálogo local y reseñas de laboratorio están limitados a desarrollo. Esta preparación no habilita producción ni altera registros alojados.

El estado vigente del cierre del 2 de noviembre está en [Preparación de producción](docs/PRODUCTION_PREPARATION.md). Existe un proyecto Supabase y bucket independientes, con Worker cerrado, configuración, funciones y administrador propios. `npm run production:check` sigue devolviendo código 1 porque falta el dominio definitivo y la integración de Mercado Pago real. No activa ventas ni sustituye las verificaciones alojadas.

**Estrategia de producción acordada:** Aroma Infini utilizará **Supabase Pro para los respaldos automáticos de PostgreSQL**, con una estrategia independiente para **Cloudflare R2**, sin depender del PC para las copias habituales. Pro y el archivo R2 de nube todavía no están activados. El [plan de transición](docs/BACKUP_PRO_TRANSITION.md) documenta cobertura, pasos personales, recuperación y las cinco condiciones para retirar el automatismo local.

Hasta verificar esa transición y recibir autorización expresa, los respaldos locales de ambos entornos siguen activos a las 02:00 de Lima. Incluyen SQL/objetos R2 cifrados y restauración de prueba. No borrar copias, DPAPI o herramientas ni deshabilitar la tarea por haber contratado Pro. [Operación actual y límites](supabase/README.md#respaldos-protegidos-operativos--2-de-noviembre-de-2026).

Después de desplegar en desarrollo, `npm run staging:check` comprueba por HTTP las páginas y una muestra de medios publicados, sin crear datos. `npm run test:staging` verifica el propio comprobador con transporte aislado. [Alcance y límites](docs/CLOUDFLARE_STAGING.md#comprobación-operativa-de-solo-lectura).

Los comandos `cloudflare:check` y `cloudflare:deploy` reconstruyen staging y comprueban la huella de configuración y los hashes de sus archivos antes de utilizar Wrangler. Sus hooks también protegen los despliegues directos de Wrangler y exigen un entorno explícito. `cloudflare:check:production` comprueba el paquete independiente en seco. `test:worker-build` valida estas guardas; `security:audit` informa los avisos de dependencias y falla ante riesgos altos/críticos. [Revisión del 4 de noviembre](docs/PRODUCTION_PREPARATION.md#revisión-previa-a-la-activación--4-de-noviembre).

La selección de pedidos, los cambios de estado y la exportación de documentos se explican en [Pedidos y PDF](docs/pedidos-pdf.md).

Las pantallas de clientes y administración conservan la [composición aprobada](docs/AUTH_ACCOUNT_LAYOUT.md): selector superior estable, fotografía editorial y campos centrados. El registro agrupa nombres/apellidos y correo/celular; dirección y documento se solicitan donde corresponde. La [Fase 3 de Supabase](docs/SUPABASE_PHASE_3.md) conecta email/contraseña, perfil/dirección propios y MFA administrativo, sin Google OAuth. El registro no pide confirmar correo; la recuperación usa un código guardado de uso único, sin SMTP, email ni SMS. Los clientes se registran en la web; los administradores se crean directamente en Supabase y se autorizan internamente por UUID. No hay credenciales de demostración ni bypass de permisos desde almacenamiento local.

La integración sigue etapas verificables: [Fase 1](docs/SUPABASE_PHASE_1.md), auditoría y [esquema propuesto](docs/SUPABASE_SCHEMA_PLAN.md); [Fase 2](docs/SUPABASE_PHASE_2.md), base de identidad/catálogo con GRANT/RLS; [Fase 3](docs/SUPABASE_PHASE_3.md), autenticación y cuenta reales; [Fase 4](docs/SUPABASE_PHASE_4.md), catálogo y comandos administrativos. La configuración pública local va en `.env.local`; `.env.example` contiene únicamente la plantilla. Ejecutar `npm run test:auth:supabase` o `npm run test:catalog:supabase` para sus suites aisladas del SDK; no apuntan a usuarios del proyecto alojado.

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

El mantenimiento técnico del 26 de octubre está documentado en [FINAL_TECHNICAL_MAINTENANCE.md](docs/FINAL_TECHNICAL_MAINTENANCE.md), con respaldo, limpieza, métricas, comparaciones visuales y preparación de Supabase/R2. Evita editar archivos, incluidos los Markdown, mientras ejecutas la suite: Tailwind puede recargar las páginas al detectar cambios en sus fuentes.

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
- Autenticación por correo/contraseña: `src/features/auth/`, contratos en `src/types/auth.ts`, estado en `auth-service.ts`, SDK tipado en `supabase-client.ts` y adaptador real en `auth-adapter.ts`. El acceso administrativo es independiente, con MFA; no hay login social.
- Cuenta: `src/features/account/`, modelos en `src/types/account.ts`, perfil/dirección remotos por propietario en `account-adapter.ts` y estilos en `src/styles/account.css`. No utiliza perfiles/pedidos demostrativos ni `sessionStorage` como identidad. Los pedidos se consultan por propietario y los favoritos de cuenta utilizan sus operaciones remotas propias.
- Contacto, redes y políticas: **Configuración → Datos de la tienda**, documento versionado en Supabase. Los datos simulados autorizados permanecen identificados y editables. El Libro de reclamaciones tiene registro privado, constancia PDF y atención en el panel; no envía correos.
- Panel administrativo: `src/features/admin/`, contratos compartidos en `src/types/admin.ts`, datos iniciales de demostración en `src/mocks/admin-state.ts` y reglas/operaciones en `src/services/admin-service.ts`. El catálogo remoto utiliza comandos de Supabase y referencias de fotografías verificadas en R2; los módulos todavía locales conservan `admin-persistence.ts` (IndexedDB) y no se comparten entre dispositivos. Las rutas exigen una sesión administrativa verificada y MFA de Supabase.
- SEO por ruta: `src/seo/`, generación de robots/sitemap en `scripts/generate-seo-files.mjs` y criterios de activación en [SEO_FOUNDATION.md](docs/SEO_FOUNDATION.md). El prototipo continúa con `noindex` hasta confirmar dominio y contenido comercial.
- Comparación completa entre el sistema y las respuestas del cliente: [CLIENT_REQUIREMENTS_COMPARISON.md](docs/CLIENT_REQUIREMENTS_COMPARISON.md). Distingue capacidades de demo, requisitos cumplidos, contenido pendiente y decisiones que no deben inventarse.
- Paleta, espaciado y tipografía: `src/styles/tokens.css`. La jerarquía se documenta en [TYPOGRAPHY_REVIEW.md](docs/TYPOGRAPHY_REVIEW.md) y se aplica desde `src/styles/typography.css`. `global.css` importa los estilos por responsabilidad.
- Imágenes y procedencia: [ASSETS.md](docs/ASSETS.md). `asset-source.ts` resuelve recursos locales y `image-source.ts` conserva las variantes estáticas y los manifiestos de fotografías de producto verificadas en R2. Los recursos del editor del Home usan manifiestos R2 confirmados; los recursos predeterminados se conservan en el proyecto. Las miniaturas del recomendador se generan con `node scripts/prepare-finder-thumbnails.mjs`.
- Revisión visual del header/hero: [PHASE_2_VISUAL_REVIEW.md](docs/PHASE_2_VISUAL_REVIEW.md). Nuevas fotografías y prompts: [HERO_V2_ASSETS.md](docs/HERO_V2_ASSETS.md).
- Segunda revisión del Home, capturas y fotografías de categorías: [HOME_EDITORIAL_REVIEW.md](docs/HOME_EDITORIAL_REVIEW.md). Con Vite activo, `node scripts/capture-home-review.mjs` genera las capturas a 390 y 1440 px.
- Navbar completo y accesos a los apartados públicos: [NAVIGATION_REVIEW.md](docs/NAVIGATION_REVIEW.md). Capturas: `node scripts/capture-navigation-review.mjs` con Vite activo.
- Revisión previa de precios, favoritos locales, CSS y carga del hero: [HOME_FRONTEND_AUDIT.md](docs/HOME_FRONTEND_AUDIT.md).
- Revisión histórica de Home: [HOME_REFINEMENT_REVIEW.md](docs/HOME_REFINEMENT_REVIEW.md). La implementación vigente tiene cinco campañas y un intervalo de 3800 ms en `useHeroRotation.ts`; los controles, las categorías y la marca destacada del menú se administran según las interfaces actuales. Los scripts de esa fase se conservan como evidencia histórica.

Con Vite activo, `node scripts/capture-hero-review.mjs` genera capturas de las tres campañas a 1440 y 390 px, revisa contraste sobre la fotografía y captura la transición hacia marcas. Añadir `--all` extiende la revisión a los ocho anchos. Los archivos se guardan en `artifacts/home-refinement/hero/`. `node scripts/capture-home-closing.mjs` captura el cierre hasta 1920 px.

Las fases históricas documentan el origen de las pantallas. Actualmente cuenta, catálogo, Home, medios, favoritos, promociones, envíos y pedidos de prueba usan sus adaptadores remotos. Las reseñas están habilitadas para usuarios autenticados: se publican opiniones respetuosas, incluidas negativas, sin valoraciones ficticias ni edición desde Productos. El filtro léxico se aplica también en SQL; no garantiza detectar toda ofensa semántica.

El resultado de Vite se sirve como activos estáticos mediante el Worker existente, con fallback SPA, cabeceras de seguridad y entorno `staging`; consulta [CLOUDFLARE_STAGING.md](docs/CLOUDFLARE_STAGING.md). Auth y la cuenta usan HTTPS contra Supabase al configurar sus variables públicas. El Worker también gestiona la subida autenticada y la entrega de fotografías de producto desde R2 en desarrollo. También conecta los medios del editor del Home; esto no habilita producción ni modifica el pago simulado.

La entrega anterior está en [PHASE_1_2_DELIVERY.md](docs/PHASE_1_2_DELIVERY.md). El usuario autorizó continuar con la Fase 3 manteniendo la Home. Su entrega y límites están en [PHASE_3_DELIVERY.md](docs/PHASE_3_DELIVERY.md). Capturas: `node scripts/capture-phase-3.mjs` con Vite activo.

La ficha y el perfil olfativo de Fase 4 se documentan en [PHASE_4_DELIVERY.md](docs/PHASE_4_DELIVERY.md). Capturas: `node scripts/capture-phase-4.mjs` con Vite activo.

Favoritos y carrito de Fase 5 se documentan en [PHASE_5_DELIVERY.md](docs/PHASE_5_DELIVERY.md). Capturas y mediciones: `node scripts/capture-phase-5.mjs` con Vite activo.

El checkout simulado de Fase 6 se documenta en [PHASE_6_DELIVERY.md](docs/PHASE_6_DELIVERY.md). Capturas y mediciones: `node scripts/capture-phase-6.mjs` con Vite activo.

La cuenta de demostración de Fase 7 se documenta como historial en [PHASE_7_DELIVERY.md](docs/PHASE_7_DELIVERY.md). Su activación ficticia fue retirada; las capturas vigentes se generan con `npx playwright test tests/auth-interfaces.spec.ts`. Los escenarios autorizados de prueba utilizan adaptadores aislados de Playwright, nunca una entrada de demostración en la aplicación.

Los institucionales de Fase 8 se documentan en [PHASE_8_DELIVERY.md](docs/PHASE_8_DELIVERY.md). Capturas y mediciones: `node scripts/capture-phase-8.mjs` con Vite activo.

El panel administrativo frontend de Fase 9 se documenta en [PHASE_9_DELIVERY.md](docs/PHASE_9_DELIVERY.md). Capturas y mediciones: `node scripts/capture-phase-9.mjs` con Vite activo.
