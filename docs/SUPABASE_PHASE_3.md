# Supabase — Fase 3: autenticación y cuenta

28 de octubre de 2026. Proyecto de desarrollo: **aroma-infini-dev**.

Esta fase conecta Supabase Auth con las pantallas aprobadas: registro de
clientes, correo/contraseña, cierre de sesión y
acceso administrativo con TOTP. Perfil y dirección se guardan mediante las
RPC del propietario. El catálogo, Home, promociones, favoritos y pedidos
todavía conservan sus adaptadores locales y corresponden a otras etapas.
Mercado Pago continúa simulado y R2 permanece pendiente.

## Política vigente: registro sin confirmación por email

Por acuerdo con el cliente, el registro no envía correos ni pide confirmar la
dirección. `auth.email.enable_confirmations=false` está aplicado en el proyecto
alojado y en la configuración local. Se retiraron el contrato y los mensajes de
confirmación del alta. El registro requiere una sesión real de Supabase y vuelve
a verificar el usuario y su actor antes de permitir el acceso.

La recuperación utiliza un código de uso único guardado por el cliente. Se
genera desde «Mis datos» con la contraseña actual y permite establecer una
contraseña nueva sin correos, SMTP, SMS ni proveedores externos. Tras usarlo
queda invalidado y se entrega un reemplazo. Los clientes sin código deben
solicitar revisión de su caso. La función de Resend fue retirada.

«Cambiar correo» abre un modal en «Mis datos», solicita la contraseña actual y
usa una Edge Function que verifica sesión, propietario y permisos. El correo se
actualiza directamente en Auth sin confirmación por email. No se puede cambiar
mediante el guardado general del perfil. La migración adicional limita a cinco
intentos por usuario en quince minutos. Admin conserva la exigencia de AAL2.
Detalles operativos: [Recuperación sin mensajes](AUTH_OFFLINE_RECOVERY.md).

Actualización del 29/10/2026: la recuperación por código quedó desplegada y
probada contra Supabase real. Se comprobó contraseña actual al emitir, código
usado rechazado, reemplazo válido y revocación del refresh anterior. La cuenta
temporal fue eliminada. Se retiró el hook de correo. Las RPC de recuperación
son exclusivas del servidor; no se amplió el acceso a las tablas privadas.
La suite local aprobó 107 comprobaciones SQL y 100 asignaciones concurrentes.
Las capturas cubren cinco tamaños; lint, typecheck y build aprobaron.
Evidencias: `artifacts/offline-recovery-2026-10-28/` (inicio del trabajo el día 28).

No se modifican cuentas existentes durante la instalación ni membresías o MFA.
Los apartados siguientes conservan el contexto técnico de la integración; las
referencias a recuperación y cambio de correo describen sus flujos reservados.

Validación del ajuste: el diff remoto mostró un único cambio aplicado y cero
actualizaciones pendientes. Una cuenta temporal creada mediante el registro
público obtuvo sesión inmediata y su perfil de cliente; se eliminó al terminar.
La comprobación posterior encontró cero cuentas pendientes de confirmación y
cero cuentas temporales de esta prueba. Pasaron 63 pruebas de interfaz y 39 del
SDK/política de email, además de lint, typecheck y build. La suite del SDK prueba
por separado la política vigente y la recuperación conservada con HTTP aislado.
Evidencias: `artifacts/email-confirmation-removal-2026-10-28/`.

## Clientes y administradores

- El registro de la tienda crea exclusivamente una cuenta de cliente. Envía
  nombres, apellidos y celular para el trigger de perfil; nunca un rol.
- El administrador **se crea directamente en Supabase Authentication → Users**,
  con la contraseña elegida por el operador, sin utilizar el registro público.
- El operador verifica su UUID y asigna la membresía protegida con
  [first-admin.sql](../supabase/admin/first-admin.sql). Es una operación SQL
  controlada, no una RPC pública ni una comparación permanente de correos.
- La cuenta solicitada fue creada por el usuario en Supabase, comprobada como
  confirmada y con contraseña, y autorizada por su UUID. El usuario confirmó
  posteriormente que pudo entrar al panel. No se leyó ni guardó su contraseña.
- `/admin/login` exige completar TOTP para llegar al panel; una membresía
  activa sin AAL2 muestra la configuración o comprobación del segundo factor.
  QR y clave de configuración permanecen únicamente en memoria de esa pantalla.
- Las cuentas de clientes no pueden entrar al panel aunque su metadata declare
  `role=admin`. Revocar una membresía se observa al verificar el actor contra
  la base; no se confía en un rol guardado por el navegador.

La fila de primera autorización conserva `granted_by = NULL`: procede de un
operador SQL externo, no de un administrador ficticio de la aplicación. El
bootstrap no cambia credenciales ni permite activar otros administradores
silenciosamente. Las siguientes altas requieren un cambio privilegiado revisado.

## Arquitectura aplicada

- `@supabase/supabase-js` **2.118.0**, versión exacta en el lockfile.
- Un cliente tipado con `Database`, esquema `api`, PKCE y persistencia/
  renovación del SDK. Los tokens no se copian a un sistema de sesiones propio.
- `getUser()` verifica la identidad con Auth; `current_actor()` comprueba
  UUID, membresía vigente y nivel de autenticación en PostgreSQL. El resultado
  se descarta si cambia el token o el propietario durante la petición.
- Los eventos del SDK se difieren fuera del callback para evitar bloqueos.
  Logout/cambio de propietario retira datos privados; una renovación de la
  misma identidad no debe desmontar formularios ni perder borradores.
- Los guards React protegen navegación. GRANT/RLS/RPC siguen siendo la
  autoridad de las operaciones remotas; los guards no convierten el catálogo
  administrativo local pendiente en una persistencia comercial remota.
- `main.tsx` inicia la comprobación Auth sin bloquear la carga pública. Los
  loaders de rutas protegidas sí esperan esa verificación.

### PKCE, correo y recuperación

El callback consume una sola vez el código con el SDK, admite su identificador
`sb_flow_id` y elimina credenciales de la URL. No adopta tokens implícitos
recibidos por query/hash ni acepta destinos externos. El retorno a checkout
se conserva con `safeAuthReturn`.

Los enlaces PKCE deben abrirse en el mismo navegador donde se inició la
solicitud, que conserva el verificador del SDK. Abrirlos en otro navegador
requiere volver a solicitar el flujo desde allí; no se relaja esa comprobación.

La recuperación mantiene una intención de trabajo vinculada al usuario y
su vencimiento, sin usarla como permiso de base de datos. Una sesión de
recuperación no abre cuenta/panel; después del cambio de contraseña se cierra
su sesión. Esa marca solo aporta continuidad de pantalla: una sesión válida
de Auth y la autorización del servidor siguen siendo necesarias.

Los fallos de campo aparecen debajo del campo; los generales usan el modal
existente. No se imprimen respuestas técnicas del SDK, claves o tokens. La
solicitud de recuperación conserva una respuesta indistinguible para correos
desconocidos, sin ocultar fallos reales de red o del proveedor.

### Perfil y dirección

El adaptador usa `get_profile`, `update_profile`, `get_address`, `save_address`
y `remove_address`. Fija el JWT verificado por solicitud y comprueba la
identidad antes/después, para no guardar un formulario de A usando el token
posterior de B. No busca usuarios por correos de pedidos ni importa IndexedDB.

El correo canónico siempre procede de Auth. El guardado del perfil no cambia
el correo. Una acción separada exige contraseña actual y usa `change-email`
con JWT fijo; la función comprueba permisos y actualiza el UUID autenticado
mediante Auth Admin API, sin confirmación por email ni escritura SQL de Auth.
La web vuelve a consultar Auth antes de confirmar el resultado. No existe
un estado comercial duplicado de correo pendiente.

No se fabricó un historial de pedidos remoto: `ordersAvailable=false` muestra
su indisponibilidad hasta integrar pedidos. Tampoco se vinculan compras locales
o invitadas a una cuenta por coincidencia de email.

## Compatibilidad con el Auth alojado

Las pruebas reales detectaron que el grant de USAGE sobre `auth` a roles
propios **no tiene efecto en Supabase alojado**: `postgres` carece de la opción
de concederlo. La suite PostgreSQL aislada no reproducía esa limitación del
servicio administrado. La causa está documentada en la [guía oficial](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema).

Se añadió [20261028000000_hosted_auth_boundary.sql](../supabase/migrations/20261028000000_hosted_auth_boundary.sql),
siguiendo su opción de leer los claims de solicitud verificados por la Data
API en helpers privados `SECURITY INVOKER`. Solo el ejecutor puede usarlos.
La migración conserva propietarios, firmas, restricciones, RLS y permisos
públicos, sin heredar `authenticated`, conceder bypass ni exponer tablas.

Las migraciones anteriores aplicadas se conservaron sin editar. La prueba
aislada ahora revoca USAGE de `auth` a los roles internos y vuelve a comprobar
toda la suite de propietario/MFA, para reproducir el caso del alojamiento.

## Configuración

Los valores públicos facilitados por el usuario se trasladaron a `.env.local`,
ignorado por Git. `.env.example` conserva únicamente nombres y comentarios.
No contiene contraseñas ni claves privadas. Vite rechaza claves `sb_secret_`
y JWT `service_role` en variables `VITE_` antes de compilarlas.

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Se revisó un diff completo de los ajustes discrepantes antes del envío.
Los únicos tres cambios efectivos fueron:

- `site_url`: `http://127.0.0.1:5173`.
- Redirecciones: conservar `http://localhost:5173/**` y añadir callbacks para
  `127.0.0.1:5173` y el servidor de revisión `127.0.0.1:5174`.
- Contraseña mínima de **12** caracteres, conservando los requisitos ya
  configurados de mayúscula, minúscula, número y símbolo.

En la conexión inicial se conservaron confirmación de correo, MFA TOTP, seguridad del cambio de
contraseña, frecuencia/códigos de email, esquemas expuestos (`api`), pooler y
Storage. La comparación posterior no encontró diferencias con ese conjunto
verificado. No se envió el `supabase/config.toml` local completo a ciegas.

No se configuró SMTP ni se certificó entrega de correo a clientes reales.
Tras el ajuste acordado, el registro no utiliza envío de correo. La recuperación
y el cambio de dirección usan las acciones descritas en la política vigente.
El administrador creado directamente desde Supabase no valida por sí mismo
ese envío. Los callbacks PKCE se probaron con el SDK real y HTTP aislado, sin
afirmar que se haya leído un buzón externo durante la prueba.

## Pruebas y límites

Las evidencias se conservan en `artifacts/supabase-phase-3-2026-10-28/`, ignorado
por Git. Typecheck, lint y build aprobados; **29/29 pruebas del SDK** y
**111/111 pruebas de regresión** aprobadas. La comprobación remota de metadatos
aprobó diez condiciones de permisos/RLS y confirmó un administrador, TOTP
verificado y cero cuentas temporales o cuentas de los ejemplos de interfaz.

Las 29 pruebas incluyen conservación de borradores durante la renovación de
sesión. Las 111 de regresión cubren acceso/cuenta, checkout, límites de datos,
SEO, SKU, descuentos, estados/pedidos, envíos y registro de marcas. Mantienen
fixtures locales explícitas y bloquean la red hacia proyectos alojados.

Se comprobaron capturas y teclado en 1920×1080, 1440×900, 1366×768, 768×1024 y
390×844. Otras dos comprobaciones rechazaron claves Secret y JWT `service_role`
antes de que Vite pudiera incluirlos en el bundle.

| Nivel                          | Alcance ejecutado                                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL local 17.10         | **73 comprobaciones SQL**, cuatro migraciones, 100 SKU concurrentes / 10 conexiones, rollback de fixtures. Incluye ausencia de acceso al esquema administrado `auth`.                                                                                        |
| Auth alojado real              | **12 comprobaciones**: login de tres cuentas temporales, trigger de perfiles, metadata sin elevación, aislamiento A/B, dirección de propietario, rechazo de tablas/anónimo, contraseña errónea, AAL1/TOTP/AAL2, revocación y refresh invalidado tras logout. |
| Limpieza remota                | Tres cuentas temporales por ejecución, identificadas con un UUID de prueba, eliminadas junto a sus datos al terminar. No se enviaron correos ni alteraron cuentas preexistentes.                                                                             |
| Data API anónima alojada       | **12 comprobaciones HTTP** aprobadas: catálogo disponible y perfiles/esquemas internos denegados.                                                                                                                                                            |
| SDK y adaptadores en navegador | Suite con SDK real y respuestas HTTP aisladas; no sustituye módulos `auth-adapter`/`account-adapter`. Prueba PKCE, errores, perfil/dirección, correo, MFA y concurrencia entre pestañas.                                                                     |
| Acceso del propietario         | El usuario confirmó entrada al panel con la cuenta creada directamente en Supabase.                                                                                                                                                                          |

Las pruebas alojadas se ejecutaron desde un proceso de operador con clave
obtenida mediante la CLI oficial y conservada solo en memoria. No se guardó
en `.env`, informes, JavaScript público ni chat. Ese privilegio se utilizó
únicamente para crear/eliminar fixtures y preparar su membresía de prueba;
las comprobaciones de acceso utilizaron JWT de clientes o visitante anónimo.

El guard del almacenamiento de MFA usa el mismo `SupportedStorage` del SDK
para descartar un commit tardío tras logout, cambio de cuenta o token. No se
presenta como una transacción distribuida entre pestañas: PostgreSQL/Auth
siguen autorizando cada solicitud y la aplicación falla de forma cerrada
ante inconsistencias.

### Repetir

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:auth:supabase
npm.cmd run test:supabase:public
# Requiere la preparación del motor aislado descrita en Fase 2:
npm.cmd run test:supabase:sql
```

`playwright.supabase.config.ts` usa un proyecto ficticio y servidor aislado
en 5175; las fixtures bloquean peticiones a otro proyecto de Supabase. La
configuración E2E habitual excluye esa suite para no dirigirla al entorno
real por accidente. Las pruebas privilegiadas alojadas no se ejecutan en CI
automáticamente ni quedan habilitadas desde la tienda.

Los avisos de chunks grandes de Excel/PDF permanecen en build. `npm audit`
informa los mismos diez avisos observados antes de instalar el SDK (dos
moderados y ocho altos), en dependencias existentes de Excel, imágenes y
herramientas de desarrollo; ninguno está en `@supabase/*`. No se aplicó un
`audit fix --force` ni una actualización ajena a esta fase. Su resolución y
evaluación de alcance quedan para la validación integral previa a producción.

Logs principales: `sdk-tests-final.log`, `baseline-tests.log`, `sql-final.log`,
`hosted-auth-result.json`, `public-api-checks.log`, `remote-verification.json`,
`admin-ready.json`, `typecheck.log`, `lint.log`, `build.log` y
`build-key-boundary.json`. Las capturas de MFA están en `screens/`; las capturas
completas de acceso se conservan en el directorio histórico
`artifacts/auth-centered-2026-10-26/screens/`, regeneradas por la regresión.

## Siguiente etapa

La [Fase 4](SUPABASE_PHASE_4.md), completada posteriormente el 29 de octubre,
conecta catálogo, marcas, presentaciones, inventario, ofertas de producto e
importación mediante comandos autorizados. También conecta Complementos y
marca destacada, sin fallback a fixtures ni migración automática de IndexedDB.

Quedan pendientes los textos y medios editoriales del Home y su flujo
permanente de archivos; R2 todavía no está conectado. Después corresponden
pedidos y checkout de servidor. Mercado Pago sigue simulado: no se habilitaron
cobros, reservas, consumo remoto de stock ni despliegue a producción.
