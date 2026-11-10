# Estado real de integración y límites de rendimiento

**Inventario histórico del 29 de octubre.** Varias integraciones descritas
abajo se completaron después: Home/R2, pedidos, favoritos, cupones y tarifas.
Para la auditoría actual, sus optimizaciones comprobadas y las descargas
completas que todavía requieren trabajo, consultar
[PERFORMANCE_AUDIT_2026_11_05.md](PERFORMANCE_AUDIT_2026_11_05.md).
Este documento conserva el corte histórico; no describe el despliegue actual.

Revisión del código del 29 de octubre de 2026. Este inventario distingue las
fronteras remotas implementadas de los adaptadores locales. La presencia de
una pantalla, una tabla o una función SQL no acredita por sí sola que todas
las acciones de ese módulo utilicen persistencia remota.

## Módulos y persistencia

| Módulo                                               | Estado comprobado en el código                                                     | Evidencia y límite                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inicio de sesión y registro                          | Supabase Auth                                                                      | `auth-adapter.ts`: SDK, verificación con `getUser`, RPC `current_actor` y control de MFA administrativo. No se reemplaza la verificación por un rol del navegador.                                                                                                                   |
| Recuperación y cambio de correo                      | Adaptadores para funciones remotas                                                 | `account-recovery.ts` llama `functions/v1/account-recovery`; `account-email-change.ts` llama `functions/v1/change-email`. El código de recuperación y la contraseña actual verifican al propietario sin SMTP. Disponibilidad operativa depende de esas funciones y su configuración. |
| Mis datos y dirección                                | RPC de propietario en Supabase                                                     | `account-adapter.ts`: `get_profile` y `get_address` en paralelo; `update_profile`, `save_address`, `remove_address` para escribir. Los resultados se comprueban contra el usuario actual.                                                                                            |
| Pedidos de la cuenta                                 | No existe todavía lectura alojada de pedidos del cliente                           | El mismo adaptador devuelve `orders: []` y `ordersAvailable: false`; no busca por correo ni presenta pedidos locales como propiedad verificada.                                                                                                                                      |
| Productos, variantes y stock editado con el producto | Remoto cuando `VITE_CATALOG_SOURCE=supabase`                                       | `catalog-admin-service.ts`: `saveProduct` sube las nuevas fotos y llama `admin_save_product` con versión esperada. Los precios, stock y referencias se guardan juntos en el comando SQL. No es una reserva de inventario durante la compra.                                          |
| Fotografías de producto                              | Worker/R2 y metadatos SQL                                                          | `media-upload.ts`: transferencia al guardar, variantes WebP y respuesta verificada. Asociación posterior con el producto. Un fallo no convierte bytes temporales del borrador en contenido publicado.                                                                                |
| Marcas y familias olfativas                          | Registro/edición/activación remotos; familias también tienen eliminación explícita | Overrides en `catalog-admin-service.ts`: comandos SQL con control de actor y versión, importación de marcas y taxonomía compartida. No confundir esto con afirmar que todo método heredado es remoto.                                                                                |
| Ofertas de producto                                  | Supabase                                                                           | `saveProductDiscount` usa `admin_save_offer`; cálculo público mediante SQL. Las presentaciones conservan precio habitual y precio final.                                                                                                                                             |
| Cupones                                              | Local                                                                              | `admin-service.ts`: `savePromotion`, `deletePromotion` y `setPromotionActive` modifican el snapshot del navegador. No existe en ese flujo un comando alojado de cupones.                                                                                                             |
| Pedidos, cambios de estado, lotes y documentos       | Local                                                                              | `AdminOrdersPage.tsx` utiliza `admin-service.ts`; `order-status-service.ts` consulta `getSnapshot().orders`. El PDF se genera desde esos datos, no desde una cola logística alojada.                                                                                                 |
| Clientes del panel                                   | Adaptador administrativo local                                                     | El snapshot de clientes del panel no equivale a una consulta global autorizada de usuarios de Supabase Auth.                                                                                                                                                                         |
| Tarifas y cobertura                                  | Local                                                                              | `saveShipping` escribe el snapshot; `shipping-service.ts` expone esa configuración editorial. No se han creado tarifas comerciales nuevas ni sincronización alojada de envíos.                                                                                                       |
| Contenido del Home                                   | Mixto                                                                              | `saveHome` guarda remotamente `complementsEnabled` y `featuredBrandId`; luego llama a `local.saveHome` para textos y medios editoriales. Esos textos, imágenes y vídeo todavía no están publicados mediante un CMS alojado.                                                          |
| Carrito y favoritos                                  | Selección local, datos comerciales públicos remotos                                | `cart-storage.ts`/`favorites-storage.ts` conservan IDs en el navegador; `selection-catalog-service.ts` obtiene DTO vigentes por IDs en lotes de hasta 100, sin descargar todo el catálogo. No hay sincronización de favoritos entre dispositivos.                                    |
| Checkout y pago                                      | Simulación explícita                                                               | `checkout-service.ts`: `simulatePayment` y `persistDemoCheckout`; el pedido se registra en `adminService` y se persiste localmente. No hay cobro de Mercado Pago, webhook verificado, reserva ni decremento de stock transaccional por compra.                                       |

La persistencia local utiliza `admin-persistence.ts`, IndexedDB
`aroma-infini-admin` / `snapshot`. Puede no estar disponible en navegación
privada y no comparte los cambios entre navegadores, dispositivos o
administradores. No debe presentarse como una base comercial centralizada.

El modo local del catálogo es una elección explícita para desarrollo y
pruebas. `catalog-source.ts` no vuelve a fixtures locales cuando falla
Supabase; la lectura remota presenta su error.

## Métodos administrativos heredados

`catalogAdminService` comienza con `...local` y sustituye comandos concretos.
Una función SQL instalada pero no invocada por la fachada no convierte un
flujo en remoto. En este corte no se encontraron métodos frontend
`deleteProduct` o `deleteBrand`: no se deduce una acción disponible sólo por
existir una RPC con ese nombre. Tampoco hay un comando independiente de stock
en esa fachada. La edición de stock mediante el formulario de producto sí pasa
por `saveProduct` remoto.

Al conectar nuevas acciones se debe revisar el import que usa cada pantalla,
el comando efectivamente llamado, su control de versión/actor y el resultado
confirmado. Este documento no habilita acciones nuevas ni cambia su
comportamiento.

## Consultas completas que todavía existen

- **Home:** `home-service.ts` deriva perfiles de marca y opciones del
  recomendador del snapshot completo, aunque muestre sólo cuatro más vendidos.
  Cambiarlo por cuatro candidatos alteraría las opciones reales del finder.
- **Recomendador:** `fragrance-finder-service.ts` vuelve a leer el conjunto de
  candidatos al recomendar para respetar disponibilidad, presupuesto y todas
  las preferencias. Un reemplazo servidor debe reproducir la puntuación y
  reglas completas; no basta aplicar `LIMIT 12` antes de recomendar.
- **Previsualizaciones de marcas:** el flujo que obtiene una fotografía y
  perfiles a partir de productos de cada marca todavía puede requerir el
  snapshot. Es candidato a un agregado específico, no a una petición de
  detalle por marca.
- **Administración del catálogo:** `loadAdminCatalog` lee páginas de 100 hasta
  un máximo de 10000 productos, autorizado por propietario. Formularios,
  inventario, colas de fotos e importación comparten ese estado. Una futura
  paginación administrativa debe mantener las ediciones pendientes y sus
  versiones. No corresponde reutilizar la caché anónima para este contenido.
- **Confirmación de checkout simulado:** `persistDemoCheckout` invalida y
  relee el snapshot publicado antes de registrar el pedido local. Evita tomar
  precios de un borrador administrativo, pero no aporta atomicidad ni valida
  una transacción de pago. La futura confirmación real debe recibir sólo las
  presentaciones necesarias y calcular importes en el servidor.

Tienda y detalle ya tienen fronteras acotadas:
`remote-catalog-queries.ts` utiliza `catalog_browse`,
`catalog_product_context` y `catalog_products_by_ids`. El layout y tarifas
leen metadatos sin iniciar por sí solos una descarga completa de productos.
Confirmar algunas cards en el snapshot no significa que el universo completo
del catálogo esté cargado.

## Caché pública y seguridad

`public-query-cache.ts` se reserva para proyecciones públicas. No almacena
Auth, perfiles, direcciones, pedidos, permisos, datos administrativos ni una
cotización transaccional. Deduplica peticiones simultáneas por clave, reutiliza
la respuesta cinco segundos por defecto y limita las respuestas guardadas a
40 entradas. Una invalidación debe impedir que un resultado pendiente de una
generación anterior sea confirmado.

`tests/public-query-cache.spec.ts` comprueba sin esperas artificiales: diez
lecturas concurrentes con una petición, vencimiento del TTL, invalidación en
vuelo, unión con una lectura nueva, doble invalidación, reintento tras error y
expulsión al alcanzar el límite. Los relojes y promesas se controlan en la
prueba; no se contacta Supabase.

Las peticiones de autorización y las comprobaciones de sesión no deben
eliminarse como si fueran un N+1 decorativo. Una respuesta tardía de otra
cuenta tiene consecuencias diferentes de repetir una lectura pública.

## Límites de la evidencia

Las cifras antes/después y el método están en
`PERFORMANCE_QUERY_AUDIT.md`. Las pruebas locales con 1000 productos no son
carga sobre el entorno alojado. La cuenta, el checkout y los módulos locales
no recibieron mediciones sintéticas presentadas como tráfico real. Esta
revisión no certifica pagos, logística centralizada ni pedidos en producción.
