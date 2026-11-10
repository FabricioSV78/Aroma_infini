# Fase 5 — Envíos, cupones y pedidos de prueba

30 de octubre de 2026. Continúa [catálogo](SUPABASE_PHASE_4.md) y [Home remoto](R2_HOME_IMPLEMENTATION.md). El alcance es desarrollo; Mercado Pago permanece simulado.

## Funcionamiento

**Envíos.** El panel guarda tarifas, zonas, plazos, umbral gratuito y activación de provincias con control de versión. Tienda, ficha, Home, página de entregas y checkout leen la misma proyección confirmada. Una configuración inexistente se muestra como pendiente: no se importan tarifas del navegador ni se presenta una tarifa de muestra como condición comercial. El administrador debe completar y guardar Envíos para habilitar la cotización.

**Cupones.** El panel permite guardar, guardar y crear otro, editar, desactivar y eliminar con confirmación. Porcentajes decimales e importes fijos mantienen sus unidades existentes. El cálculo del checkout se hace en SQL, con vigencia, mínimo, límite y compatibilidad con ofertas. No hay listado público de códigos. Los pedidos simulados no incrementan los usos ni crean redenciones reales.

**Cotización.** El navegador envía exclusivamente ID de presentación, cantidad, ubicación, modalidad y código. SQL consulta productos publicados, precios y ofertas vigentes, stock disponible, tarifas y cupón. La respuesta incluye un hash de los importes y versiones. Al confirmar se recalcula; si cambió, devuelve conflicto y obliga a revisar el resumen. El envío gratuito conserva el umbral antes del cupón y después de las ofertas de producto.

**Registro.** `POST /api/checkout/simulate` verifica formato, tamaño, origen, frecuencia y, cuando corresponde, la identidad mediante Supabase Auth. Una credencial exclusivamente del Worker ejecuta el comando SQL; visitantes y clientes no tienen permiso para crear pedidos directamente por RPC. El servidor genera referencia, fecha, importes y líneas históricas. Los reintentos de una misma operación con el mismo contenido recuperan el mismo pedido.

Una respuesta perdida mantiene la operación pendiente y sus datos hasta comprobarla. No se cambia de UUID simplemente por reintentar. La confirmación se presenta únicamente después de verificar la respuesta del servidor.

Si la sesión renueva su token después del envío, se conserva ese mismo intento para consultar el resultado. Un cambio de propietario invalida la operación de la interfaz; una respuesta antigua no repone información privada después de cerrar sesión.

## Qué significa «pedido de prueba»

- Se guarda realmente en Supabase, con `simulation = true` y pago `pending`.
- No realiza cobros, reservas ni decrementos de stock.
- No consume límites de cupones ni representa una venta cobrada.
- El administrador puede ensayar estados de preparación en orden, individualmente o mediante selección múltiple. Marcar entregado requiere confirmación explícita.
- La excepción de progreso con pago pendiente se limita a pedidos marcados como simulados; no habilita la misma regla para compras reales.

Los precios, nombres, SKU y dirección del pedido son históricos. Editar el producto conserva el pedido anterior. Las imágenes históricas tienen una asociación protegida en el registro de medios de R2; sustituir una galería no deja esas imágenes expuestas a la limpieza automática. Los productos comprados no se eliminan mediante un borrado que rompa esas relaciones; se utiliza su desactivación.

## Administración y cuenta

Pedidos conserva filtros, selección, paginación, edición de entrega, acciones individuales/masivas y PDF. Las operaciones masivas devuelven éxitos y errores por pedido, con versiones capturadas al abrir la acción. El historial registra fecha y administrador derivados de la sesión, no de un nombre enviado por el formulario. Las respuestas canónicas actualizan el panel sin una segunda lectura obligatoria que pudiera convertir un guardado exitoso en un falso error.

La lista remota se consulta en páginas de hasta 100 registros; la interfaz conserva sus tamaños de página y filtros. El snapshot administrativo se limita a 10000 pedidos y se refresca al navegar o volver a la pestaña. Las acciones SQL admiten hasta 100 pedidos por operación.

Mis pedidos utiliza el UUID autenticado. Una compra como invitado no se asocia a una cuenta por coincidencia de correo. Clientes muestra compradores derivados de pedidos, no constituye un directorio de todas las cuentas Auth.

Para invitados, el enlace de seguimiento lleva un secreto aleatorio en el fragmento `#acceso=…`; no viaja como parte de la URL HTTP ni se utiliza una referencia sola para revelar el pedido. La base conserva su hash. El seguimiento sólo devuelve referencia, fecha y estado, sin dirección, correo, DNI o teléfono. El comprador autenticado también puede consultar sus propios pedidos. Conservar el enlace privado permite consultarlo desde otro navegador.

Al cierre de esta fase, carrito y favoritos continuaban con su almacenamiento de navegador. La [Fase 6](SUPABASE_PHASE_6.md) conecta los favoritos de cuentas y mantiene separada la lista del invitado. Las opiniones y pagos reales no forman parte de esta fase. No se migran pedidos de demostración, clientes o datos personales desde IndexedDB.

## Seguridad y operación

- Tablas en `app`, operaciones internas en `private` y RPC acotadas en `api`.
- Ejecutor comercial `NOLOGIN`, sin `BYPASSRLS` y sin CRUD del navegador sobre las tablas.
- Administración con membresía vigente y MFA AAL2. Historial preservado aunque se retire una identidad administrativa.
- Creación accesible sólo al servidor. `SUPABASE_COMMERCE_SECRET_KEY` es secreto del Worker y de `.dev.vars` ignorado; nunca una variable `VITE_`.
- `CHECKOUT_SIMULATION_ENABLED=true` se habilita sólo en staging. Si falta, el endpoint no crea pedidos.
- Límite técnico del endpoint de diez solicitudes por minuto por IP mediante binding de Workers; no sustituye la idempotencia transaccional.
- Los errores y respuestas administrativas/checkout usan `no-store`; no se cachean datos privados ni se imprimen JWT, contraseñas o direcciones en los registros de aplicación.

El proyecto usa la frontera de identidad `private.request_user_id()` ya instalada, sin depender de conceder acceso al esquema administrado `auth` a un ejecutor nuevo. Las llamadas de clientes utilizan claims verificados por la Data API; el Worker verifica Auth antes de aportar el propietario a su comando exclusivo de servidor.

## Código y migraciones

- `20261029001000_commerce_simulation.sql`: configuración, cupones, cotización, pedidos, líneas históricas, eventos, proyecciones y permisos. La referencia geográfica procede del catálogo ya utilizado por la aplicación; no contiene tarifas.
- `20261030000000_commerce_hosted_auth_boundary.sql`: adaptación a la frontera de identidad disponible en Supabase alojado, conservando firmas y permisos.
- `worker/checkout-handler.ts`: admisión, Auth y operación de creación.
- `src/services/{commerce-settings-service,checkout-server,order-admin-service,order-tracking-service}.ts`: adaptadores y validación de respuestas.
- `src/features/checkout/`: cotización y registro remotos, preservando el diseño.
- `src/services/account-adapter.ts`: pedidos del propietario.

Comprobaciones reproducibles:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run cloudflare:check
npm.cmd run test:supabase:sql
npm.cmd run test:commerce:worker
npm.cmd run test:commerce:settings
npm.cmd run test:orders:supabase
npm.cmd run test:checkout:supabase
npm.cmd run test:auth:supabase
npm.cmd run test:supabase:public
```

Las suites con transporte aislado no acreditan por sí solas una escritura alojada. Evidencias, capturas, comprobación de producto intacto y resultado de la prueba operativa temporal: `artifacts/supabase-phase-5-2026-10-29/`. La prueba operativa crea registros claramente temporales y restaura la configuración bajo guardas de versión y huella; no deja esos pedidos como ventas comerciales.

Pruebas aisladas aprobadas: 426 comprobaciones SQL y 18 migraciones, creación de 100 pedidos, diez reintentos de una operación que generan un solo registro, acciones sobre grupos de 10/50/100 y conflictos concurrentes. Los contratos comerciales/Worker tienen 23 pruebas; las suites de interfaz comprueban pedidos, tarifas, cupones, checkout y autenticación en los tamaños solicitados. Los informes distinguen cada suite y no suman pruebas coincidentes como casos únicos.

## Entrega verificada en desarrollo

Las dos migraciones de esta fase están aplicadas a `aroma-infini-dev`; el proyecto contiene 18 migraciones. El Worker de staging tiene su secreto comercial y el endpoint simulado habilitados. No se creó un entorno de producción.

Versión comprobada del Worker: `d0d031e6-676e-4402-a847-33bc9224aac1`. Resultado consolidado y comprobación de ausencia de credenciales de servidor en los archivos públicos: [result.json](../artifacts/supabase-phase-5-2026-10-29/result.json).

| Comprobación | Resultado |
| --- | --- |
| SQL aislado | 426 comprobaciones, con concurrencia y grupos de hasta 100 pedidos |
| Contratos comerciales y Worker | 23 pruebas |
| Envíos y cupones en navegador | 8 pruebas |
| Pedidos en navegador | 17 pruebas |
| Checkout en navegador | 10 pruebas, incluida renovación de sesión y respuesta perdida |
| Autenticación | 65 pruebas |
| Regresión de catálogo | 24 pruebas |
| Regresión de Home/R2 | 6 pruebas |
| API pública alojada | 28 comprobaciones de acceso, sin escrituras autorizadas |
| Recorrido alojado con Auth, Worker y SQL reales | 13 comprobaciones, cinco tamaños y limpieza confirmada |
| Calidad | Typecheck, lint, build y empaquetado Wrangler aprobados |

Las capturas cubren 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844. Los resultados de navegador alojado registran cero errores de página y cero desbordamientos horizontales. Las suites aisladas comprueban grupos de 100 sin llenar la base alojada de ventas ficticias.

La prueba alojada creó dos pedidos, un cupón y dos cuentas temporales; se retiraron al finalizar y se restauró la configuración original. El catálogo, sus fotografías y el stock conservaron la misma huella. Las capturas alojadas muestran exclusivamente los datos temporales identificados de esa prueba.

**Actualización del 31 de octubre:** durante la aceptación el propietario confirmó envío gratuito desde **S/330** y autorizó tarifas/plazos provisionales. Desarrollo tiene courier S/10, motorizado S/15 y plazo de 1 a 2 días hábiles para Lima y Callao. Se guardaron mediante el comando administrativo, quedan editables en **Tarifas de envío** y deben confirmarse antes del lanzamiento. La configuración inicial de esta fase era vacía y no se importaron valores de IndexedDB. El recorrido y sus límites están en la [validación de aceptación](INTERFACE_PRODUCTION_CLEANUP.md#8-aceptación-en-staging--31-de-octubre).

Capturas y resultados: [directorio de evidencias](../artifacts/supabase-phase-5-2026-10-29/), [checkout desktop](../artifacts/supabase-phase-5-2026-10-29/checkout-1440.png), [checkout móvil](../artifacts/supabase-phase-5-2026-10-29/checkout-390.png) y [resultado alojado](../artifacts/supabase-phase-5-2026-10-29/hosted-latest-result.json).

Pedidos con servicios reales y datos temporales: [desktop](../artifacts/supabase-phase-5-2026-10-29/hosted-0ba6b99c-8cf6-4d3e-a997-ce8be38a5a97/orders-desktop.png) y [móvil](../artifacts/supabase-phase-5-2026-10-29/hosted-0ba6b99c-8cf6-4d3e-a997-ce8be38a5a97/orders-mobile.png). La consulta final confirmó cero pedidos/cupones de prueba y cero cuentas temporales; el producto existente conserva sus dos presentaciones.

## Antes de habilitar ventas reales

Hace falta conectar la pasarela, validar sus notificaciones en servidor y definir la reserva/liberación de inventario y la redención de cupones mediante transacciones. No debe utilizarse un resultado «aprobado» del navegador como evidencia de cobro. También quedan pendientes el entorno independiente de producción, dominio, condiciones comerciales definitivas y contenido aprobado para indexación.
