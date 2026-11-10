# Fase 6 — Favoritos por cuenta

30 de octubre de 2026. Completa el pendiente de clientes señalado en [Fase 5](SUPABASE_PHASE_5.md). El entorno sigue siendo desarrollo y Mercado Pago permanece simulado.

## Arquitectura e impacto

La migración aditiva `20261030000100_customer_favorites.sql` crea `app.favorite_lists` y `app.customer_favorites`. La primera mantiene una versión por propietario para serializar cambios; la segunda relaciona UUID de cuenta y producto sin duplicados. Borrar una cuenta retira sus favoritos. Borrar un producto retira sus asociaciones y avanza las versiones correspondientes. Ocultar o agotar un producto conserva su identidad para poder quitarlo de la lista.

No se modifica el contenido de productos, fotografías, Home, inventario, tarifas, cupones ni pedidos. No se importan listas locales ni fixtures a cuentas comerciales.

El navegador usa únicamente `api.customer_favorites()` y `api.set_customer_favorite(product_id, selected, expected_version)`. No aporta el propietario. La identidad procede de los claims verificados por Supabase y de `private.request_user_id()`. El ejecutor dedicado no admite login ni bypass de RLS; las tablas no permiten CRUD de los roles de navegador. El alta reutiliza el predicado de publicación real del catálogo, incluido el flag de Complementos.

Cada cuenta admite hasta 500 productos. Guardar o quitar expresa el estado deseado, en lugar de invertirlo: repetir una petición tras perder una respuesta no duplica ni revierte el cambio. La versión detecta modificaciones desde otro dispositivo. Si hay conflicto, la interfaz recupera la selección confirmada y solicita revisar/reintentar el producto concreto, sin sobrescribir toda la lista.

## Comportamiento de la interfaz

- Los invitados conservan su lista actual en este navegador.
- Una cuenta autenticada utiliza su propia lista remota y puede consultarla desde otro dispositivo.
- Las listas de invitado y cuenta permanecen separadas; no se mezclan automáticamente. Al cerrar sesión reaparece la lista del invitado.
- Los datos de una cuenta no se escriben en localStorage ni en IndexedDB. Una respuesta atrasada de otra sesión se descarta.
- Los corazones y el contador cambian después de la confirmación del servidor. Las acciones pendientes tienen estado ocupado y no admiten clics duplicados.
- Los clics sobre productos distintos se procesan en orden para conservar versiones coherentes.
- Un error de lectura mantiene la página con una acción Reintentar. Los errores de guardado utilizan el diálogo accesible existente y conservan el estado deseado para consultar/reintentar.
- Volver a una pestaña actualiza la lista; los productos se resuelven a través del mismo catálogo público. El contenido ya no anuncia falsamente que los favoritos de cuenta se guardan sólo en el navegador.

El carrito continúa con su almacenamiento actual. Las reseñas, pagos reales y producción no forman parte de esta entrega.

## Código

- `src/services/customer-favorites-service.ts`: DTO, sesión, caché por propietario, versiones, cola, reintentos y descarte de respuestas anteriores.
- `src/services/selection-catalog-service.ts`: consulta de los IDs correctos antes de resolver fotografías y productos.
- `src/features/favorites/`: selección de invitado/cuenta, estados accesibles y colección.
- `ProductCard.tsx`, `ProductPage.tsx` y `AccountPages.tsx`: controles y textos coherentes con la persistencia real, manteniendo el diseño.

## Validación reproducible

```powershell
npm.cmd run test:favorites:supabase
npm.cmd run test:supabase:sql
npm.cmd run test:auth:supabase
npm.cmd run test:catalog:supabase
npm.cmd run test:checkout:supabase
npm.cmd run test:supabase:public
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run cloudflare:check
```

Las pruebas aisladas no sustituyen la comprobación alojada. La suite nueva tiene 15 casos y capturas en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844. El conjunto SQL tiene 470 comprobaciones y 19 migraciones, con pruebas de propietario A/B, acceso denegado, producto oculto/agotado, Complementos, cascadas, reintentos concurrentes, conflictos y límite de 500.

## Entrega verificada en desarrollo

La migración está aplicada a `aroma-infini-dev`. Los tipos se generaron con la CLI oficial desde el proyecto alojado. El frontend está publicado en staging, versión `7744cfc8-961c-4d95-b090-6115324ba30d`; no se habilitó producción ni se cambió la simulación de Mercado Pago.

| Validación | Resultado |
| --- | --- |
| SQL aislado completo | 470 comprobaciones, 19 migraciones y concurrencia aprobadas |
| Favoritos, navegador con SDK real y transporte aislado | 15/15, cinco resoluciones |
| Regresión de autenticación | 65/65 |
| Regresión de catálogo | 24/24 |
| Regresión de checkout | 10/10 |
| Diálogos y errores después del pulido final | 4/4, capturas desktop y móvil |
| API pública alojada | 31 comprobaciones de acceso aprobadas |
| Auth, SQL y navegador alojados | 9 comprobaciones, cinco resoluciones y aislamiento de dos cuentas |
| Calidad | Typecheck, lint, build y empaquetado Wrangler aprobados |

Las carreras aisladas comprobaron dos altas distintas sobre la misma versión, diez reintentos de añadir y diez de quitar, y dos escrituras al llegar al límite de 500. No se crearon 500 productos ni favoritos comerciales en el proyecto alojado para esa prueba.

La prueba alojada utilizó el producto público existente, sin crear ni editar productos o medios. Se crearon dos cuentas temporales independientes; sus favoritos y versiones se retiraron mediante la eliminación controlada de esas identidades. La comprobación final encontró cero cuentas y favoritos temporales, conservó todas las huellas comerciales originales y confirmó que los ejecutores no permiten login, bypass de RLS ni creación permanente de objetos en los esquemas.

No se encontraron errores de JavaScript ni desbordamientos horizontales en las capturas alojadas. El build público se revisó para comprobar que no contiene valores de las credenciales de servidor.

Resultados: [informe consolidado](../artifacts/supabase-favorites-2026-10-30/result.json), [regresiones](../artifacts/supabase-favorites-2026-10-30/regressions.json) y [prueba alojada](../artifacts/supabase-favorites-2026-10-30/hosted-latest-result.json).

Capturas con datos reales de desarrollo: [desktop](../artifacts/supabase-favorites-2026-10-30/hosted-5f603c3e-539d-47f7-a1ae-da460d23d25a/favorites-desktop.png), [móvil](../artifacts/supabase-favorites-2026-10-30/hosted-5f603c3e-539d-47f7-a1ae-da460d23d25a/favorites-mobile.png) y [otra cuenta independiente, vacía](../artifacts/supabase-favorites-2026-10-30/hosted-5f603c3e-539d-47f7-a1ae-da460d23d25a/favorites-other-account-empty.png). Las imágenes de las suites aisladas son fixtures; no se importan al catálogo.

Referencias: [funciones de PostgreSQL en Supabase](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [verificación de usuario](https://supabase.com/docs/reference/javascript/auth-getuser).
