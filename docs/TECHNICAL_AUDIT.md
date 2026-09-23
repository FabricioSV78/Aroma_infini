# Auditoría técnica del frontend — 16 de septiembre de 2026

Alcance: React, TypeScript, Vite, Tailwind CSS 4, rutas, servicios con datos ilustrativos, estado local, CSS, imágenes y pruebas. Se conservaron el diseño y las funcionalidades actuales. No se evaluó una infraestructura de producción porque todavía no hay backend ni configuración de despliegue.

## Hallazgos y resolución

| Prioridad | Hallazgo | Estado |
| --- | --- | --- |
| Crítica | Ninguna vulnerabilidad explotable identificada en el prototipo actual; la compra está deshabilitada. | Sin corrección necesaria ahora. |
| Alta | El carrito comprobaba el stock con un cierre de React potencialmente desactualizado. Varias adiciones en un mismo ciclo podían anunciar una adición incorrecta. | Corregido: el límite y el aviso se calculan con el estado funcional más reciente. Prueba de siete clics rápidos con stock de cinco. |
| Alta | El servicio de catálogo importaba lógica desde una carpeta de UI de la Home. | Corregido: la presentación comercial del producto reside en `services`, sin dependencia inversa. |
| Alta | Un error inesperado de ruta no tenía una recuperación controlada. | Corregido: página de error con reintento e inicio; solo aparece ante fallos no previstos. |
| Media | La lectura de `localStorage` aceptaba listas e identificadores sin límite y no atendía al evento de borrado global. | Corregido: validación de longitud, límite de 500 entradas, cantidades de 1 a 99 y sincronización de `clear()` entre pestañas. |
| Media | Las escrituras de favoritos y carrito estaban dentro de actualizaciones de estado de React. | Corregido: actualizaciones puras; escritura sincronizada con un efecto y aviso de conservación durante la sesión si falla el almacenamiento. |
| Media | El formato de precios PEN estaba duplicado en seis componentes, incluso con una instancia nueva por sugerencia de búsqueda. | Corregido: formateador único basado en céntimos. |
| Media | Una herramienta de reportes (`repomix`) figuraba como dependencia de producción. | Corregido: pasa a desarrollo; la instalación de producción contiene únicamente React y fuentes. |
| Media | Los contadores visibles de carrito y favoritos estaban ocultos al lector de pantalla; algunos disparadores de diálogo carecían de estado y relación con su panel. | Corregido: nombres accesibles con cantidad, `aria-expanded`, `aria-controls` e identificadores de diálogo. |
| Baja | La ficha de un producto inexistente rompía el espaciado inicial común. | Corregido solo en ese estado de error. |
| Baja | Una imagen de sugerencia carecía de carga diferida; había un componente `Button` sin uso y un artefacto generado no ignorado. | Corregido; `repomix-output.*` se ignora sin borrar el archivo existente. |
| Baja | La SPA respondía HTML a `/robots.txt`, que Lighthouse señalaba como inválido. | Corregido: archivo válido que mantiene el bloqueo deliberado de indexación del prototipo. |

También se tiparon los valores válidos de género y orden del catálogo, se eliminó una aserción no nula en la lectura de la URL y el loader de marca dejó de mutar su consulta original. No se detectaron usos de `any`, `eval` ni HTML inyectado, ni secretos de servidor en el cliente. Las imágenes principales tienen dimensiones explícitas y variantes WebP; las rutas, los diálogos, el teclado y los estados de movimiento reducido están cubiertos por pruebas.

## Archivos modificados

- Configuración y contenido estático: `.gitignore`, `package.json`, `package-lock.json`, `public/robots.txt`.
- Servicios: `src/services/catalog-service.ts`, `currency.ts`, `product-presentation.ts`. Se retiró `src/features/home/product-presentation.ts` al trasladar su contenido.
- Carrito y favoritos: `src/features/cart/CartProvider.tsx`, `cart-storage.ts`, `CartLine.tsx`, `CartSummary.tsx`, `CartDrawer.tsx`, `src/features/favorites/FavoritesProvider.tsx` y `favorites-storage.ts`.
- Interfaz y rutas: `src/app/router.tsx`, `src/pages/RouteErrorPage.tsx`, `src/components/layout/Header.tsx`, `StoreLayout.tsx`, `src/components/ui/Dialog.tsx`, `src/features/home/ProductCard.tsx`, `src/features/catalog/SearchPanel.tsx`, `catalog-loaders.ts`, `src/features/product/ProductPage.tsx` y `src/styles/product-detail.css`. Se eliminó `src/components/ui/Button.tsx` porque no se utilizaba.
- Pruebas: `tests/commerce.spec.ts`, `product-card.spec.ts` y `page-spacing.spec.ts`.
- Informe: `docs/TECHNICAL_AUDIT.md`.

## Pendiente antes de producción o de fases futuras

- **Crítica antes de habilitar compras:** precios, stock, importes y disponibilidad nunca deben aceptarse del navegador. Supabase debe aplicar RLS; pedidos y pagos necesitan validación de servidor y confirmación por webhook. Las claves de servicio y secretos de pago no deben entrar en Vite. No se implementa ahora porque la compra sigue deshabilitada.
- **Alta antes de publicar:** configurar en el proveedor de hosting HTTPS/HSTS, CSP con dominios reales de Supabase, R2 y pagos, `frame-ancestors`, `nosniff`, política de referencia y caché adecuada. No se fijaron cabeceras especulativas sin conocer esos dominios ni la plataforma de despliegue.
- **Media al integrar backend y R2:** sustituir los datos de muestra por servicios con contratos y validación de respuestas, tratamiento de errores de red y URLs de imágenes controladas. Mantener la identidad visual actual. No se añadió una abstracción de backend vacía.
- **Media si crece el catálogo o se despliegan más fases:** dividir rutas en chunks. Hoy el JS compilado es ~111 kB gzip; hacerlo ya añadiría complejidad sin beneficio medido. El LCP de la SPA descubre la imagen después del JS; una precarga global cargaría el hero incluso en rutas interiores. Revisar precarga por ruta o prerender cuando se decida el hosting.
- **Baja:** añadir CI y un navegador Chrome instalado en el entorno de pruebas. Mantener `noindex` y `robots.txt` bloqueante hasta que existan catálogo, políticas y contenido reales; el SEO de Lighthouse resulta deliberadamente bajo por este motivo. No se creó `llms.txt`, que no aporta al prototipo.

## Validación

- `npm run typecheck`: aprobado.
- `npm run lint`: aprobado, cero advertencias.
- `npm run build`: aprobado. JS 360.53 kB / 110.98 kB gzip; CSS 73.76 kB / 15.33 kB gzip.
- `npm run test:e2e -- --workers=2`: **83/83** aprobadas. Incluye 360–1440 px, imágenes, desbordamiento, consola, navegación por teclado, foco, movimiento reducido, carrito y favoritos.
- `npm audit`: **0 vulnerabilidades**.
- Lighthouse sobre build de producción: **100/100 en accesibilidad y buenas prácticas** en Home móvil, catálogo desktop y ficha móvil. Tras añadir `robots.txt` válido, Home obtuvo SEO 66; la puntuación restante responde al bloqueo intencional de indexación.
- Trazas locales sin limitación de CPU o red: Home LCP 153 ms y CLS 0; ficha LCP 128 ms y CLS 0. Son datos de laboratorio local, no predicciones de usuarios reales. La batería de scroll móvil observó CLS inferior a 0.1 en todos los anchos.
