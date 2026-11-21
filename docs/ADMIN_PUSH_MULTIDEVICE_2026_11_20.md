# Notificaciones push en varios dispositivos

20 de noviembre de 2026, America/Lima. Auditoría y validación exclusiva de
staging. El sistema admite múltiples dispositivos por cuenta y múltiples
cuentas administrativas. El segundo dispositivo no reemplaza al primero.

Se corrigió una condición de carrera al cerrar sesión y se publicó el parche
en `aroma-infini-frontend-staging`, versión
`9a0bb45e-3d12-4151-a1d5-d60a2db4d5da`, activa al 100 %. Producción no se modificó.

## Registro y seguridad

La unicidad de suscripciones es por `(environment, user_id, device_id)` y por
endpoint dentro del entorno, nunca por usuario solamente. El registro actualiza
únicamente el dispositivo correspondiente. El límite es de 20 dispositivos
activos por cuenta y entorno. Las pestañas de un perfil comparten suscripción;
los perfiles independientes tienen sus propios identificadores y endpoints.

La cola genera una entrega por suscripción habilitada de cada administrador
activo. `unique(notification_id, subscription_id)` y las concesiones con
`SKIP LOCKED` evitan registros o reclamaciones duplicados. Antes de enviar se
comprueban nuevamente membresía, habilitación y versión del dispositivo.
Un HTTP 404/410 retira solamente la suscripción caducada. Revocar una membresía
retira todas sus suscripciones y entregas pendientes, conservando las otras
cuentas.

Las cuatro tablas de notificaciones y la política privada tienen RLS forzado.
El navegador carece de acceso directo y no puede reclamar ni finalizar envíos.
Las RPC y endpoints mantienen la comprobación del administrador y de MFA.
Las claves VAPID privadas permanecen en backend.

## Problema encontrado y corrección

Antes, el botón Salir iniciaba simultáneamente la baja push y el logout de
Supabase. Cuando Auth terminaba primero, la baja era rechazada y la fila del
dispositivo podía quedar habilitada, aunque el navegador hubiera retirado su
endpoint. Se reprodujo contra staging demorando la solicitud de baja hasta
recibir el logout real: `/api/admin/push/unsubscribe` devolvió **403**. La otra
sesión independiente conservó HTTP **200**.

Ahora el estado visual pasa a anónimo inmediatamente. El servicio de Auth
espera la operación de baja, con un límite total de 2,5 segundos, antes de
revocar la sesión del proveedor. El rechazo o la falta de respuesta no impiden
el logout. Los cierres concurrentes comparten la operación y un nuevo login o
registro espera su finalización para evitar que el logout anterior cierre la
sesión nueva. Se conserva `signOut({ scope: 'local' })`.

En staging final, con la baja demorada 500 ms, se verificó este orden real:

1. Retirada inmediata del acceso local.
2. Respuesta **200** de la baja push.
3. Solicitud de logout al proveedor.
4. El otro perfil permanece autorizado con HTTP **200** y recibe el siguiente evento.

Archivos corregidos: `src/services/auth-service.ts` y
`src/features/admin/AdminLayout.tsx`. Se ampliaron
`tests/admin-notifications.spec.ts` y `tests/admin-push-worker.spec.ts`.
`scripts/verify-admin-push-hosted.mjs` también se actualizó para distinguir los
avisos operativos de staging de las ventas verificadas, en lugar de rechazar
todos los eventos simulados permitidos por la migración posterior.

## Pruebas alojadas

Se utilizaron tres perfiles persistentes independientes de Chrome con ventana:
A y B con la misma cuenta temporal, C con otra cuenta temporal. Cada perfil
inició sesión mediante correo, contraseña y TOTP real; no se copió una misma
sesión entre dispositivos. Las suscripciones pertenecieron al proveedor FCM
real y se registraron mediante el panel y los endpoints desplegados.

| Escenario | Resultado verificado |
| --- | --- |
| Registrar A y después B con la misma cuenta | Dos suscripciones habilitadas; ninguna sustitución. |
| Registrar C con otra cuenta administrativa | Tercera suscripción independiente. |
| Repetir el registro de A | Continúan tres filas, sin duplicar ni retirar B. |
| Mismo evento para A, B y C | Tres entregas aceptadas con HTTP 201, un intento por destino; recepción exacta en los tres service workers. |
| Retransmitir realmente el mismo payload a B | Segundo mensaje procesado, sin cambiar el recibo original de deduplicación. |
| Caducar el endpoint de B | FCM responde 410; solo B queda inhabilitado. A y C reciben el evento. |
| Reactivar B y cerrar sesión en A | Baja de A confirmada; B conserva sesión; B y C reciben el siguiente evento, A no. |
| Revocar permiso de notificaciones de C | C no genera recibo ni presentación de ese nuevo evento; B sí lo recibe. |
| Revocar el rol de C | API devuelve 403; suscripciones de C desactivadas y excluidas del evento siguiente; los dos perfiles de la otra cuenta reciben el evento. |

Los eventos se originaron mediante pedidos sintéticos identificados y el
trigger real de staging. No se ejecutaron compras, pagos, modificaciones de
stock ni cambios de productos. Antes de confirmar cada transacción, se limitó
la entrega de ese evento a las cuentas temporales; ningún administrador real
fue alertado. Los cinco eventos finales y las cuentas correspondientes se
retiraron con comprobación de identidad, marca de prueba y ausencia de datos
comerciales asociados.

La retransmisión deliberada utilizó el mismo cifrado backend y FCM real; las
entregas ordinarias fueron procesadas por el cron del Worker desplegado.

## Alcance de la recepción

No se equipara HTTP 201 con recepción. Se comprobó el recibo del ID exacto en
IndexedDB del service worker, que solo se guarda después de resolver
`showNotification()`, y el mensaje posterior hacia su ventana. Para la
retransmisión se verificó que ese mensaje aumentara sin modificar el recibo
original. No se inyectó un `PushEvent` ni se sustituyó el proveedor en el ensayo
alojado.

Chrome sin ventana no acreditó recepción en el primer ensayo. La aceptación
final se realizó con Chrome con ventana. Windows no enumeró los avisos mediante
`getNotifications()`; por ello no se certifica la visibilidad del aviso nativo,
su sonido, ni recepción física en Android o iPhone. La observación CDP no expuso
registros y no se contó como prueba. La entrega al navegador y la finalización
de su API de notificación sí quedaron verificadas.

El ensayo principal aprobó siete controles y se detuvo después por un selector
del verificador que esperaba «Activar» donde la UI mostraba «Reactivar». Se
corrigió ese selector y se completó la revocación de rol en una ejecución
independiente de la misma versión publicada. No se etiquetó ese fallo del
verificador como un defecto de la aplicación ni se omitió el escenario restante.

El transporte sigue siendo de al menos una vez ante respuestas ambiguas. SQL
y el service worker aportan deduplicación; no se promete entrega matemática
exactamente una vez. Un equipo desconectado, un permiso bloqueado o restricciones
del sistema pueden impedir o demorar el aviso. Los dispositivos activados
después de un evento no reciben sus avisos históricos.

## Validación y despliegue

| Comprobación | Resultado |
| --- | --- |
| Worker, API, criptografía y PWA aislados | 66 pruebas aprobadas. |
| Panel de notificaciones, errores y logout | 22 pruebas aprobadas. |
| SDK de Auth, MFA, identidades y recuperación | 98 pruebas aprobadas. |
| PostgreSQL aislado | 1.128 comprobaciones; 49 migraciones; concurrencia aprobada. |
| TypeScript y ESLint | Aprobados. |
| Build de staging y paquete Wrangler | Aprobados, incluido dry-run. |
| Archivos publicados | 126 hashes coinciden con el paquete final. |
| Configuración del paquete | `8a6abbd76b16ecc042bfac4848ba88e9c2a5a3004546632397991c36f77fdc39`. |
| Bindings antes/después | Idénticos: Supabase, R2, push y configuración conservados. |
| Esquema remoto | Mismas 49 migraciones, funciones push y RLS; no se aplicó SQL de esquema. |
| Datos temporales de la auditoría | Cero cuentas, pedidos y eventos restantes. |
| Producción | Sin despliegues, migraciones ni cambios de datos. |

Evidencias locales, excluidas de Git:

- `artifacts/admin-push-multidevice-2026-11-20/result.json`: consolidado.
- `hosted-final-core-result.json` y `hosted-result.json`: escenarios reales.
- `logout-race-before-fix.json`: reproducción del 403 anterior.
- `staging-assets-verified.json`: hashes publicados.
- `binding-comparison.json` y `remote-schema-before.json`: configuración y esquema.
- Logs de pruebas, build y activación en el mismo directorio.

No se añadieron dependencias, migraciones, cachés, cambios de diseño ni nuevas
reglas comerciales. Los cambios permanecen sin commit ni push.

Referencias: [alcance local de logout en Supabase](https://supabase.com/docs/reference/javascript/auth-signout),
[Push y notificaciones en Chrome DevTools](https://developer.chrome.com/docs/devtools/javascript/background-services/),
[enumeración de notificaciones del navegador](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/getNotifications).
