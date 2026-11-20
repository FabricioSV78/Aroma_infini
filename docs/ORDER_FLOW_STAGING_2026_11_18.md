# Pedidos, reservas, dashboard y push — staging

18 de noviembre de 2026, America/Lima. Pruebas alojadas y cambios exclusivamente en desarrollo/staging. Sin cobros, compras comerciales, cambios en producción, commit ni push. Se conservaron los cambios de trabajo previos.

## Resultado

**APROBADO para el flujo de pedidos simulados de staging.** Se verificaron creación, reserva atómica de 15 minutos, reintento idempotente, preparación, dashboard, cancelación, vencimiento real por cron y recepción Web Push en un Android físico.

Reservar reduce la **disponibilidad vendible**, sin restar además el inventario físico. Al cancelar o vencer se cierra la reserva; no se suma inventario físico que nunca se descontó. Así se evita una doble devolución. Los pagos permanecieron pendientes y sin fecha de aprobación. Mercado Pago sigue desactivado/simulado.

## Causas y correcciones

| Proceso | Causa comprobada | Corrección |
| --- | --- | --- |
| Stock | Ya existían reservas atómicas e idempotentes, pero no había comando de cancelación y el vencimiento cerraba el hold sin conciliar el pedido. | Estados terminales cancelado/vencido, bloqueo pedido → reservas, cierre único y auditoría. Vencimiento mediante la RPC del cron; cancelación individual o masiva con permisos, versión y confirmación. |
| Push | El trigger solo generaba eventos para pedidos comerciales con pago verificado; todos los pedidos actuales de prueba quedaban fuera. | Evento explícito simulated_order, activado solo en desarrollo y dirigido a suscripciones de staging. Evento en la misma transacción, envío posterior al commit y cron como respaldo. |
| Dashboard | SQL y el adaptador local excluían las simulaciones; algunos contadores ignoraban filtros y no había revalidación por notificación/foco. | Alcance operacional explícito en staging, contadores sobre los mismos candidatos filtrados, invalidación tras escritura confirmada y revalidación por foco/visibilidad/push. El alcance comercial predeterminado conserva la exclusión de simulaciones. |

No se reabren pedidos cancelados/vencidos, no se permite fabricar un vencimiento desde el navegador y no se marca una entrega automáticamente. Las transiciones de preparación/envío/entrega conservan sus validaciones. Los cuatro pasos visuales se mantienen; cancelar es una acción secundaria con confirmación.

El envío push usa las claves VAPID existentes del backend. Se mantienen suscripciones separadas por usuario/dispositivo/entorno, permisos voluntarios, leases, errores 404/410, revocación y reintentos acotados. La deduplicación persistente del service worker guarda únicamente IDs y fechas, con máximo 512 y retención de 24 horas; no guarda pedidos ni credenciales. El icono, título y número de pedido se validan y el destino siempre es una ruta administrativa protegida. Sonido/vibración dependen del sistema operativo y de su configuración.

## Migraciones y archivos principales

Aplicadas y verificadas únicamente en aroma-infini-dev: **47 migraciones sincronizadas**. Las tres nuevas son:

- 20261118000100_order_reservation_lifecycle.sql — SHA-256 5bf98010d8eddef003332dca1b0b29494c9bc36a1a24f59694ec906c4fd309d3
- 20261118000200_staging_order_notifications.sql — SHA-256 753522d3fac14179436ad869122b6beaaa2cef6d821934482acef5c3efc4de23
- 20261118000300_order_dashboard_scope.sql — SHA-256 26da7179342c514ed9c70e6f54db02089cda37d4854bdbde4cc64c75dfa5c200

La comprobación de datos antes/después de migrar fue idéntica. No se modificaron pedidos históricos, no se rellenaron reservas antiguas y no se debilitaron RLS/MFA. Los tipos de TypeScript se regeneraron con el generador oficial contra el esquema remoto real.

- Worker: checkout-handler.ts, seo-router.ts y admin-push-handler.ts: despacho posterior al commit con waitUntil, respuesta de pedido independiente de la entrega push y respaldo persistente.
- PWA: public/admin/sw.js y servicios/componentes de notificaciones: evento de prueba identificado, destino seguro, deduplicación e invalidación de pedidos.
- Pedidos: dominio, parsers, seguimiento, cuenta, PDF, picker, detalle y listado: cancelación y estados terminales coherentes.
- Dashboard: AdminDashboardPage.tsx, order-admin-service.ts, order-events.ts y tipos de listas: alcance, contadores y refresco protegido.
- Mensajes: AdminLayout.tsx, AdminOrderDetailPage.tsx y AccountPages.tsx: retiradas las afirmaciones antiguas ambiguas sobre el stock. Una regla nowrap evita que un importe se parta en móvil; conserva la tipografía y composición existentes.
- Pruebas SQL 036/037/038 y auditor de concurrencia ampliados. La prueba histórica 032 ahora excluye la nueva tabla de configuración al contar índices de tablas anteriores; no se añadió un índice de rendimiento.

## Pruebas automatizadas

| Validación | Resultado |
| --- | --- |
| PostgreSQL 17 aislado, 47 migraciones, RLS/permisos y concurrencia | 1.100 comprobaciones aprobadas |
| Node | 215 pruebas aprobadas |
| commerce | 37 ejecuciones aprobadas |
| push-worker | 62 ejecuciones aprobadas |
| push-browser | 18 ejecuciones aprobadas |
| orders | 37 ejecuciones aprobadas |
| checkout | 30 ejecuciones aprobadas |
| workflow | 49 ejecuciones aprobadas |
| TypeScript, ESLint, build staging, sellado y Wrangler dry-run | Aprobados |

Total funcional: 233 ejecuciones en seis suites; hay contratos compartidos que se ejercitan en más de una suite, por lo que no se presenta este número como casos únicos. Las seis suites se ejecutaron dos veces. Después del último ajuste de texto y presentación del importe se repitieron las suites afectadas de checkout y workflow. No se aumentaron timeouts ni reintentos para ocultar fallos.

La suite SQL probó dos solicitudes por la última unidad, diez reintentos del mismo checkout, diez cancelaciones concurrentes, dos jobs de vencimiento, carrera cancelación/vencimiento con bloqueo observado, precios/cupones, cambios concurrentes y rollback. Sus escenarios de reloj acelerado están identificados como pruebas aisladas; la comprobación alojada siguiente sí esperó el plazo real.

## Pruebas alojadas reales

| Prueba | Evidencia y resultado |
| --- | --- |
| Crear y reintentar el mismo pedido | AI-64AEE3B18AD044BA: un pedido, un hold y un evento. Disponibilidad 3 → 2; stock físico 3. Pago pendiente. |
| Preparar desde Chrome con Auth/TOTP reales | Contador en preparación 2 → 3; navegación SPA a Resumen mostró el pedido sin recarga manual. |
| Cancelar desde el detalle con confirmación | Disponibilidad 2 → 3; stock físico 3; historial preparación/cancelación; repetir cancelar fue no-op. Contador preparación volvió a 2. |
| Dos solicitudes simultáneas de la última unidad | AI-498AC7AFCDE14E54: HTTP 200 y 400, un único pedido/hold, disponibilidad 1 → 0, físico 1. |
| Checkout móvil completo | AI-1305206C3A3A453D: producto → carrito → datos → entrega → revisión → volver → revisión → guardar → confirmación, sin errores JS ni vídeo móvil. Descuento de fixture 10 %: 120,00 → 108,00 soles una sola vez. |
| Vencimiento real por cron | Dos reservas con expires_at-created_at = 15 minutos. Sin modificar fechas ni invocar manualmente la RPC; ambos pedidos terminaron vencidos con un historial de sistema, una sola liberación y disponibilidad restaurada. |
| Push real | Tres entregas HTTP 201 aceptadas, una por evento/dispositivo y un intento por entrega. Confirmación directa del usuario: Android recibió AI-64AEE3B18AD044BA en segundo plano y al tocar abrió ese pedido. |
| Permisos alojados | Siete denegaciones anónimas correctas; Auth AAL1 rechazado y TOTP real aceptado; revocar la membresía temporal volvió a denegar la RPC con JWT AAL2 todavía válido. |
| R2 | Dos descargas WebP de un activo existente, con SHA-256 idéntico al manifiesto SQL; bucket privado y sin acceso directo público. |
| Responsive alojado final | Dashboard y pedido revisados en 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844; sin desbordamientos ni errores JS. |

La conciliación del estado por cron ocurrió 28.328 s y 56.597 s después del vencimiento. La disponibilidad usa expires_at al consultar, por lo que no necesita esperar al cron para dejar de descontar un hold vencido.

No se afirma haber probado varios teléfonos físicos: los escenarios de dos administradores y tres suscripciones se verificaron con SQL y navegador aislados; la recepción física confirmada corresponde a un Android. Tampoco se promete sonido cuando el sistema lo silencia, funcionamiento con cierre forzado del sistema ni entrega independiente de los permisos/servicio push.

## Despliegue y limpieza

- Versión final activa de staging al 100 %: **a6b9fae8-bfe5-440a-a503-e80340acdeec**.
- Worker ETag/SHA-256: 5b1b1d8f8bdb077f6a3b36ff63531b74a632593b37afa4b2df089d36d90faffd.
- Paquete sellado SHA-256: f4d55e01dee0567974947af6388792861839ba1197e3554dfd80c8eb9610aae9.
- 125 recursos JS/CSS/PWA/iconos comprobados contra el paquete local por SHA-256.
- Las pruebas funcionales alojadas y el Android se realizaron con la primera activación. Las activaciones posteriores corrigieron mensajes y la ruptura de un importe en móvil; el Worker y el service worker tienen exactamente los mismos hashes y se revalidaron las interfaces finales en las cinco resoluciones, incluido el importe en una línea.
- Supabase de desarrollo: esquema sincronizado; secretos de comercio/push/VAPID presentes por nombre, sin exponer valores.
- R2 aroma-infini-media-dev: privado, misma imagen original preservada; sin subir, sustituir ni eliminar recursos comerciales.
- Retirados únicamente los fixtures identificados: 3 pedidos, 1 producto y su marca/variantes/oferta/asociaciones. Administradores temporales retirados y suscripciones existentes preservadas.
- Producción conserva deployment 9baa7c50-262a-4f23-bf52-5742a52ffa0b, versión **ec8554f6-d47a-4af0-ba60-4623c8125020**. No se desplegó ni migró producción.
- Git: develop, HEAD 7b76fedf125b9d61e17ee26958e0c7646544e821. Sin commit, push, reset ni limpieza destructiva.

## Evidencias y límites

Evidencias locales ignoradas: artifacts/order-flow-2026-11-18/. Archivos principales: migrations.json, quality-final.json, tests-final.json, hosted-flow.json, hosted-checkout-browser.json, android-receipt.json, real-expiry.json, hosted-security.json, visual-final.json, runtime-verified.json, cleanup.json y result.json. Capturas definitivas en screens-final/; checkout móvil en screens/guest-*.png.

Queda fuera de esta entrega la liquidación real de Mercado Pago y la activación productiva. La investigación independiente de separación entre sesiones administrativas y de clientes es otra intervención; no se declara corregida por las pruebas de pedidos/MFA de este documento.
