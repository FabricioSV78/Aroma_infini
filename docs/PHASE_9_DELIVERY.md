# Aroma Infini — Entrega de Fase 9

Fecha: 20 de septiembre de 2026.

Esta fase incorpora un **panel administrativo frontend de demostración**. El panel no autentica, no persiste cambios después de recargar y no representa seguridad ni actividad comercial real. Su objetivo es validar arquitectura, flujos y densidad de información antes de conectar un backend.

## Recorrido administrativo

- `/admin` resume pedidos abiertos, stock bajo y destacados usando únicamente los fixtures actuales; no inventa ventas ni KPIs.
- `/admin/productos`, `/admin/productos/nuevo` y `/admin/productos/:id` permiten buscar, crear y editar identidad, familia, contenido olfativo, presentaciones, precio, stock, activación y umbral de stock bajo. Slugs, valores negativos y presentaciones duplicadas se validan. El editor avisa antes de descartar cambios.
- `/admin/marcas` crea y edita identidades temporales. Una marca con productos visibles no se puede desactivar.
- `/admin/pedidos` y `/admin/pedidos/:reference` presentan pedidos ficticios y permiten recorrer estados simulados.
- `/admin/clientes` muestra identidades `.invalid` sin acciones comerciales ni mensajería.
- `/admin/promociones` gestiona reglas deterministas de prueba con tipo, valor, mínimo, fechas, límite y estado.
- `/admin/envios` gestiona el umbral de envío gratis y tres zonas ilustrativas. Los cambios alimentan carrito y checkout durante la sesión.
- `/admin/home` selecciona exactamente dos destacados y permite ordenar la composición pública.

## Base técnica y relación con la tienda

- `admin-service.ts` es una fuente externa tipada compatible con `useSyncExternalStore`. Expone lecturas para tienda y mutaciones del panel sin acoplar vistas ni simular llamadas de red.
- Productos, marcas, Home, catálogo, ficha, carrito, checkout, promociones, envío y metadatos de producto leen el mismo estado en memoria. Desactivar un producto, agotar variantes, reordenar destacados o modificar reglas se refleja al navegar a la tienda en esa sesión.
- El panel usa un layout separado: blanco, denso, recto, sin sombras ni tarjetas decorativas. Conserva las tipografías y controles de Aroma Infini, con sidebar en escritorio y navegación de dos columnas en anchos menores.
- Las tablas semánticas se convierten en registros verticales en móvil. No existe scroll horizontal en las vistas revisadas.
- Todas las rutas administrativas permanecen `noindex,nofollow`. El banner persistente comunica que no hay autenticación ni persistencia.
- «Restablecer demostración» reconstruye fixtures y regresa al inicio del panel. Una recarga también elimina cambios.

## Límites deliberados

No se implementaron autenticación, roles, permisos, RLS, Supabase, Mercado Pago real, carga de archivos, R2, auditoría, concurrencia, notificaciones ni persistencia. Esas garantías solo pueden existir con backend y configuración de producción.

## Revisión

`node scripts/capture-phase-9.mjs`, con Vite activo en el puerto 5173, genera dashboard, productos, editor y configuración del Home en 390, 768 y 1440 px. Las mediciones quedan en `artifacts/phase-9/measurements.json`.

Las pruebas cubren módulos, reglas compartidas, edición de stock, visibilidad, destacados, pedidos, dependencia de marcas, advertencia de cambios y responsive del panel. La validación final se ejecuta con `typecheck`, `lint`, `build` y la suite completa de Playwright.

- `npm.cmd run typecheck`: aprobado.
- `npm.cmd run lint`: aprobado, sin advertencias del código.
- `npm.cmd run build`: aprobado; institucionales y módulos administrativos generan chunks diferidos.
- `npm.cmd run test:e2e`: 139 pruebas aprobadas.
- Capturas a 390, 768 y 1440 px: sin overflow horizontal, imágenes rotas ni mensajes de consola.
