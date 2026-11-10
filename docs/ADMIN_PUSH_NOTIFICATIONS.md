# Notificaciones del administrador

## Uso diario

Entra al panel con tu cuenta administradora y completa la verificación en dos
pasos. Abre **Configuración → Notificaciones**.

1. **Android:** en Chrome, abre el menú y elige «Instalar app» o «Añadir a
   pantalla de inicio». Abre Aroma Infini Admin desde su icono.
2. **iPhone/iPad:** abre el panel en Safari, pulsa Compartir → Añadir a pantalla
   de inicio y ábrelo desde el icono. Web Push requiere iOS/iPadOS 16.4 o posterior.
3. Pulsa **Activar notificaciones** y acepta el permiso del navegador. Nunca se
   solicita automáticamente al entrar.
4. Pulsa **Enviar prueba**. El aviso se identifica como «Aroma Infini — Prueba».
5. Para retirarlo, pulsa **Desactivar en este dispositivo**. Los otros
   dispositivos del mismo administrador conservan su configuración.

Si bloqueaste el permiso, cámbialo en los ajustes del navegador o del sistema y
pulsa «Actualizar estado». Las restricciones de batería, Concentración/No molestar,
conectividad y sistema operativo pueden demorar o impedir que se muestre un aviso.
Un dispositivo completamente apagado no puede recibirlo en ese momento.

La campana muestra los 20 eventos más recientes y el total real sin leer de la
cuenta actual. Permite abrir el pedido y marcar uno o todos como leídos. Se
actualiza al volver al panel, recibir un aviso o pulsar Actualizar; no mantiene
un temporizador de consultas constantes. Los datos permanecen en Supabase aunque
el sistema operativo no haya mostrado el aviso push.

## Qué genera un aviso comercial

La fuente es el pedido guardado en el servidor. El disparador requiere las tres
condiciones: `simulation = false`, `payment_status = 'approved'` y
`payment_verified_at` informado por un proceso de pago verificado.

**Actualmente Mercado Pago sigue simulado.** Las restricciones SQL existentes
todavía permiten únicamente pedidos simulados con pago pendiente. Se conservaron:
ningún pedido de pruebas genera un aviso comercial, una cifra inventada o un
evento de venta. Las pruebas de dispositivos son independientes del centro de
pedidos y no se presentan como ventas.

La futura integración real de Mercado Pago debe levantar explícitamente esas
restricciones y asignar el marcador solo después de comprobar el pago en el
servidor. No basta con un retorno del navegador, un clic o metadatos del cliente.
No se implementó ni se activó la pasarela real en esta entrega.

## Seguridad y funcionamiento

- PWA limitada a `/admin/`; abre `/admin/notificaciones` para evitar que la
  normalización de la barra final saque la aplicación del ámbito instalado.
  La tienda pública no incluye el manifiesto ni registra este service worker.
- Service worker pequeño, sin interceptar `fetch`, Cache Storage, tokens,
  pedidos guardados para uso sin conexión ni acceso alternativo al panel.
- Supabase Auth, rol administrativo activo y MFA AAL2 se verifican en cada
  operación. El enlace del aviso utiliza las mismas rutas protegidas de pedidos.
- Suscripciones privadas por usuario, dispositivo y entorno. El identificador
  local del dispositivo es aleatorio y no autentica ni concede permisos.
- Cifrado Web Push estándar mediante Web Crypto y VAPID. Sin proveedor adicional
  contratado ni SDK de notificaciones dentro del Home o checkout.
- Orígenes permitidos, JSON acotado, limitación HTTP, claves P-256 verificadas,
  destinos push permitidos y redirecciones rechazadas. Workers utiliza
  `redirect: 'manual'`; `error` no está soportado por ese runtime.
- Tablas con RLS forzado, privilegios revocados y RPC específicas. Los roles del
  navegador no pueden reclamar envíos, confirmarlos ni crear avisos comerciales.
- La pérdida del rol desactiva suscripciones y trabajos pendientes; el emisor
  comprueba nuevamente la membresía y la versión del dispositivo antes de enviar.
- El texto en pantalla bloqueada es fijo y genérico: no contiene nombre,
  teléfono, dirección, importe ni detalle de productos del cliente.
- El cierre explícito de sesión retira la suscripción del navegador sin retrasar
  la revocación del acceso local. Si la red falla, el endpoint deja de existir en
  el navegador y el servidor lo desactiva al recibir su expiración del proveedor.

El pedido y su evento único se guardan sin llamadas de red al servicio push.
Después, un cron por minuto expande la cola y reclama hasta diez envíos, con
dos solicitudes concurrentes, concesiones de dos minutos y cinco intentos como
máximo. Los reintentos usan espera creciente y `Retry-After` acotado; el trabajo
vence a las 24 horas (diez minutos en pruebas). No depende de una pestaña abierta.
El mantenimiento de R2 conserva su ejecución horaria en el minuto 23.

El estado **accepted** significa que el proveedor recibió la solicitud; nunca
significa «mostrada», «entregada al móvil» ni «leída». Una respuesta perdida puede
provocar un reintento: el identificador estable y `tag` del aviso evitan acumular
duplicados visibles. No se promete entrega exactamente una vez. HTTP 404/410
desactiva exclusivamente la suscripción vencida. Los fallos no eliminan pedidos.

## Configuración del operador

La migración versionada es `20261104000300_admin_push.sql`. No introduce usuarios
administradores ni datos de ventas. Se aplica mediante el procedimiento habitual
de migraciones del entorno, después de revisar el proyecto vinculado.

Por entorno, el Worker utiliza estos secretos:

| Nombre | Uso |
| --- | --- |
| `SUPABASE_PUBLISHABLE_KEY` | Identificar el proyecto junto a la sesión del administrador |
| `SUPABASE_PUSH_SECRET_KEY` | RPC de reclamación y finalización, exclusivamente en servidor |
| `VAPID_PUBLIC_KEY` | Clave pública P-256; solo esta puede recibirla el navegador |
| `VAPID_PRIVATE_KEY` | Firma VAPID; nunca en React ni en una variable `VITE_` |
| `VAPID_SUBJECT` | Contacto del operador: `mailto:aromainfiniweb@gmail.com` |

`npm run push:configure -- --env staging --confirm-staging` genera la pareja
VAPID, verifica cuenta y proyecto, conserva las claves existentes y envía los
secretos a Cloudflare por stdin. Guarda una copia operativa en
`.dev.vars.staging`, excluida de Git. Nunca imprime los valores. No compartas este
archivo; conserva su copia en el almacenamiento protegido del operador.

Para otro entorno utiliza credenciales independientes en `.dev.vars.production`
y los datos públicos del proyecto correcto en `.env.production.local`.
`npm run push:configure -- --env production --confirm-production` exige esa
selección explícita y nunca hereda credenciales de desarrollo. No es necesario
pegar claves privadas en el chat ni habilitar un bucket público.

Wrangler declara `PUSH_ENVIRONMENT` y `ADMIN_PUSH_ENABLED`. El servidor exige que
el primero coincida con `APP_ENVIRONMENT`. Staging está habilitado para pruebas;
la configuración desplegada de producción mantiene push desactivado mientras no
exista su acceso HTTPS definitivo. No cambies dominio, rutas públicas,
indexación o pagos para probar notificaciones en staging.

Una suscripción pertenece al origen donde se creó. Al cambiar del origen de
staging al dominio definitivo hay que instalar/activar la aplicación de ese
dominio; no se trasladan endpoints ni claves VAPID entre entornos.

## Validación y dispositivos físicos

Comandos reproducibles:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build:staging
npm.cmd run test:push:worker
npm.cmd run test:push:browser
npm.cmd run test:supabase:sql
node scripts/verify-admin-push-hosted.mjs --execute-dev-check
```

Las pruebas aisladas cubren permisos, errores, múltiples dispositivos, pérdida
de rol, MFA, idempotencia, concesiones, reintentos, endpoints vencidos y lectura
independiente. Incluyen el vector oficial RFC 8291, descifrado independiente y
ejecución real en workerd. Las de navegador emplean SDK real con transporte y
permisos controlados; no equivalen a probar físicamente Android o iPhone.

Las capturas del panel están en `artifacts/admin-notifications/screenshots/`
(1920×1080, 1440×900, 1366×768, 768×1024 y 390×844). La verificación de staging
registra su resultado sanitizado en `artifacts/admin-push/hosted-result.json`;
crea únicamente cuentas temporales identificadas y comprueba su retirada.

Resultado de esta entrega: 649 comprobaciones SQL en 25 migraciones, 40 pruebas
del protocolo/API/runtime y 14 pruebas del panel aprobadas. Typecheck, lint,
compilaciones de staging y producción y empaquetado de Wrangler correctos. También
pasaron las regresiones de SEO (26), checkout/contratos (28), pedidos (17) y los
53 controles públicos de Supabase; algunas suites comparten casos.

La prueba alojada aprobó diez controles con Auth y MFA reales, persistencia de
suscripción, retiro de permisos y un endpoint deliberadamente inválido. Todos los
usuarios y datos temporales de esas cuentas se eliminaron. Chrome automatizado
produjo `AbortError` al registrar su suscripción con el proveedor, antes de llamar
a nuestra API: **no se acreditó recepción en un dispositivo real**. No se
reemplazó esa comprobación con una venta simulada ni una confirmación ficticia.
El informe consolidado es `artifacts/admin-push/result.json`.

Producción cerrada fue actualizada el 4 de noviembre de 2026 con autorización
expresa del propietario. La migración `20261104000300_admin_push.sql` quedó
aplicada en el proyecto independiente y el Worker publicado tiene versión
`f25249dc-b393-4f5a-97fa-cbb72e9d4a2f`. La verificación remota confirmó:

- `workers.dev`, previews, dominio personalizado y rutas públicas desactivados.
- Indexación, pagos simulados y envío push de producción desactivados.
- Claves VAPID y clave de servidor independientes de staging, guardadas como secretos.
- Las cuatro tablas con RLS forzado y sin acceso directo del navegador.
- Cero suscripciones, eventos y entregas en producción; no se crearon ventas de prueba.

El comprobante de estas lecturas remotas está en
`artifacts/admin-push/production-result.json`. Esta actualización no acredita
recepción física de avisos ni abre la tienda al público.

Para la aceptación física, en **cada teléfono** instala la PWA y prueba:

1. Activación voluntaria y recepción de «Prueba» con la aplicación abierta.
2. Recepción con la aplicación cerrada y con pantalla bloqueada.
3. Apertura del aviso, incluida sesión vencida y verificación MFA.
4. Desactivación de ese dispositivo, manteniendo activo el otro.
5. Permiso bloqueado y posterior reactivación desde los ajustes.

Registra modelo, versión del sistema/navegador y lo observado. No se deben dar
por completadas estas pruebas físicas a partir de una respuesta HTTP 201/202.

Referencias oficiales: [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API),
[Web Push en iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
[RFC 8291](https://www.rfc-editor.org/rfc/rfc8291),
[RFC 8292](https://www.rfc-editor.org/rfc/rfc8292),
[Web Crypto de Workers](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/),
[redirecciones de Workers](https://developers.cloudflare.com/workers/runtime-apis/request/),
[Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
[RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
