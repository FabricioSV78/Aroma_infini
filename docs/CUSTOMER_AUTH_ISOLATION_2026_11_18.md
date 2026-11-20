# Aislamiento de cuentas de clientes y administración

Intervención del 18 de noviembre de 2026, exclusivamente en desarrollo/staging.
La ruta existente de «Mi cuenta» es `/cuenta` y sus subrutas; `/mi-cuenta` es
el nombre utilizado en la solicitud, no la ruta del router actual.

## Causa demostrada

El panel y la tienda utilizaban la misma instancia de Supabase Auth, clave
de almacenamiento y estado de sesión. El guard de clientes admitía una sesión
verificada sin exigir el rol de cliente. Por ello una sesión administrativa
legítima también abría el área de clientes. El correo procedía de ese usuario
real de Auth; no había un correo administrativo de fallback. Una cuenta
administradora creada directamente en Supabase podía tener el perfil comercial
vacío. Los ceros y campos vacíos no demostraban una identidad de cliente válida.

Se detectaron además un bloqueo permanente de eventos después de cerrar sesión
que impedía adoptar un nuevo login desde otra pestaña, y un resumen de favoritos
que no distinguía carga/error de una lista realmente vacía.

## Corrección

- Dos clientes SDK únicos, uno por audiencia, con inicialización compartida
  dentro de su audiencia y claves de sesión independientes. Ningún componente
  crea clientes adicionales al renderizarse.
- Cada audiencia tiene su propio adaptador, estado, eventos, comprobaciones en
  vuelo y cierre de sesión local. Auth verifica la identidad en el servidor;
  `current_actor` confirma el UUID, membresía y MFA con el mismo bearer capturado.
  No se almacena una autorización completada en caché.
- Guards, loaders y proveedores exigen el rol correspondiente y no presentan
  contenido privado mientras comprueban la sesión. Una sesión válida sin perfil
  puede completar sus datos; un error remoto conserva un estado de error/reintento.
- Los servicios, listados y escrituras administrativos utilizan exclusivamente
  el cliente administrativo, incluidos Contacto/redes y las imágenes del sitio.
- El cierre de una audiencia conserva la otra. Los eventos entre pestañas pueden
  adoptar un login posterior después de cerrar sesión; respuestas antiguas no
  restauran una identidad sustituida.
- La sesión antigua se clasifica una sola vez mediante Auth y `current_actor`
  remotos, se conserva y se importa únicamente a la audiencia autorizada. Un
  marcador de digest evita reimportarla después de salir. Una sesión antigua ya
  caducada requiere iniciar sesión; no se borra para ocultar el problema.
- La migración `20261118000400_customer_auth_audience.sql` añade la comprobación
  de cliente a diez RPC y a las políticas existentes de perfiles/direcciones.
  Una membresía administrativa activa se rechaza como cliente tanto en AAL1
  como en AAL2. No se confía en roles editables de `user_metadata`.
- El Worker valida también la audiencia del usuario autenticado antes de asociar
  un checkout a su UUID. No degrada un bearer administrativo a una compra de invitado.

La política aplicada requiere identidades separadas para administrar y comprar.
No se añadió un modo de doble rol ni se migraron perfiles, pedidos o favoritos
de una persona a otra. Se conserva el almacenamiento estándar del SDK, separado
por audiencia; su contenido sirve para aportar credenciales, nunca para autorizar
por sí solo el acceso. MFA, cookies de confianza y recuperación sin SMTP permanecen.

## Archivos principales

`src/services/supabase-client.ts`, `auth-adapter.ts`, `auth-service.ts`,
`verified-auth-user.ts`; guards, loaders y `useAuth` de `src/features/auth/`;
proveedores de cuenta/favoritos y resumen de `AccountPages.tsx`;
`useAdminListData.ts`, servicios administrativos, `site-settings-service.ts`,
`site-media-service.ts` y `worker/checkout-handler.ts`.

Tipos generados mediante el generador oficial del esquema remoto. La migración
no elimina datos, tablas o migraciones anteriores, no añade índices y no relaja
RLS ni las comprobaciones administrativas. Su aplicación verificó que los datos
existentes de `app` y `private` no cambiaron.

## Validación y despliegue

El resultado final, los escenarios reales, la versión activa y los hashes se
consignan al completar la validación en `artifacts/customer-auth-2026-11-18/`.
No se consideran pruebas alojadas las suites con transporte HTTP aislado.

Referencias oficiales:
[verificación remota de usuario](https://supabase.com/docs/reference/javascript/auth-getuser),
[eventos de sesión](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
[sesiones de Supabase](https://supabase.com/docs/guides/auth/sessions).


## Resultado final verificado

Staging activo al 100 %: `fd7a121a-0f0a-49d5-a83f-11934e251e81`. Worker: `aroma-infini-frontend-staging`.
Proyecto SQL/Auth: `tkxvexfapszilzhogvgu`.

TypeScript, ESLint, 215 comprobaciones Node, build de staging, sellado del paquete
y dry-run de Wrangler aprobados. SQL nativo: 1.118 comprobaciones con 48 migraciones
y datos aislados revertidos. Desarrollo remoto: cero migraciones pendientes; todos
los hashes y tipos coinciden y las comprobaciones de RLS/permisos siguen aprobadas.

| Suite aislada | Resultado |
| --- | --- |
| auth | 93 aprobadas |
| commerce | 38 aprobadas |
| push | 62 aprobadas |
| orders | 37 aprobadas |
| catalog | 92 aprobadas |
| checkout | 30 aprobadas |
| favorites | 16 aprobadas |
| media | 26 aprobadas |
| notifications | 18 aprobadas |
| settings | 53 aprobadas |
| home | 8 aprobadas |
| reviews | 15 aprobadas |
| commerce-settings | 18 aprobadas |
| local-auth-ui | 54 aprobadas |
| complaints | 25 aprobadas |

Total: 585 ejecuciones aprobadas. Son pruebas de aplicación/SDK/Worker con
transporte o almacenamiento aislado; no se presentan como pruebas del servicio alojado.
Los logs conservan también los fallos encontrados y corregidos durante la intervención.

### Chrome y servicios reales

- APROBADO: Hosted backend rejects admin as customer, including verified AAL2.
- APROBADO: Legacy administrative session classified remotely; no customer dashboard.
- APROBADO: Existing administrative MFA session still restores.
- APROBADO: Customer A sees their real UUID, profile and empty collections.
- APROBADO: Customer restoration on reload and new tab.
- APROBADO: Simultaneous admin and customer tabs remain independent.
- APROBADO: Public navigation and Mi cuenta icon use only customer session.
- APROBADO: Customer logout synchronizes tabs and preserves admin access.
- APROBADO: A tab that signed out adopts a later verified login from another tab.
- APROBADO: Authenticated customer B without a profile is not anonymous and never receives A data.
- APROBADO: Missing profile can be completed under its own UUID.
- APROBADO: Profile, addresses, orders, payments and favorites belong only to the current customer.
- APROBADO: Admin logout does not close the customer session or import its identity.
- APROBADO: Real administrative password and TOTP login preserves the simultaneous customer and uses the existing factor.
- APROBADO: Real Supabase refresh keeps the same customer UUID.
- APROBADO: Controlled slow/failing profile transport never renders successful zero counters.
- APROBADO: Empty authenticated account is usable and fully painted after its existing animations at five real Chrome viewport sizes.
- APROBADO: Server-revoked customer session cannot restore an account.
- APROBADO: Truly anonymous browser and direct API cannot access customer dashboard.

Las pruebas utilizaron dos clientes y un administrador temporales identificados.
Auth, TOTP, UUID y respuestas de cuenta provinieron de los servicios reales de staging.
Solo el escenario de error/demora interceptó intencionalmente el transporte de perfil;
su reintento volvió al Supabase real. Se verificaron 1920×1080, 1440×900, 1366×768,
768×1024 y 390×844. No se afirma una prueba física de teléfonos: son viewports
de Chrome, además de las pruebas de teclado y SDK.

Las identidades temporales fueron eliminadas mediante comprobación de sus marcadores.
Los fingerprints anteriores y posteriores de productos, variantes, ofertas, pedidos
y favoritos coinciden. No se crearon compras ni cobros para esta intervención.

### Despliegue y evidencias

- Worker ETag: `b453f32b148a9267016524aa54060c212e31ab3ec20c8df41159a10e8e52eb5f`.
- Manifiesto sellado: `3d54783c3b5835fe864489176674fdb66c4ad11f501b4c41629a1495a64fb6b5`.
- Configuración: `3de706eeb412b5e34f4d513d8c7628182e55c8d914c87aa3711327666a846249`.
- Tipos del esquema remoto: `7d37f05d1df8efe94bc17a2062986b5790acd916d70ef57df3cd97e1a538bbef`.
- 126 archivos JS/CSS/PWA verificados por SHA-256 entre paquete local y HTTPS ordinario.
- R2 conserva su bucket privado; acceso r2.dev y dominio directo desactivados.
- Producción permanece en `ec8554f6-d47a-4af0-ba60-4623c8125020`, despliegue
  `9baa7c50-262a-4f23-bf52-5742a52ffa0b`, idéntico a la línea base. No se aplicaron migraciones productivas.
- No hubo commit, push, reset ni limpieza del trabajo anterior.

Evidencias: `artifacts/customer-auth-2026-11-18/result.json`, `hosted.json`,
`runtime-verified.json`, `schema-final.json`, `migration.json`, `tests-final.json`,
`quality-final.json`, fingerprints y capturas `screens/*.png`. Estos artefactos
se mantienen ignorados por Git y no contienen contraseñas, códigos TOTP ni tokens.

### Alcance restante

La corrección está activada en staging. Su publicación en producción requiere
autorización y aplicar allí la migración correspondiente con el mismo proceso de
validación. No se ha cambiado la política comercial ni la recuperación administrativa
mediante Supabase. Las cuentas administrativas y de clientes son identidades separadas.

## Precisiones de validación

Se completaron dos recorridos alojados de 19 escenarios cada uno. Las capturas
finales esperan que terminen las animaciones existentes; no se desactivaron para
ocultar un problema visual. Se revisaron las capturas finales de escritorio y móvil.
Los fingerprints de perfiles y direcciones también coincidieron tras la limpieza
de las identidades temporales, además de los datos comerciales indicados arriba.

La caducidad y los errores de tokens se ejercitaron con el SDK y transporte
aislados. En staging se adelantó únicamente el metadato local de vencimiento para
forzar una renovación real: no se fabricó ni se modificó la firma de un JWT y no
se cambió el reloj del servidor. También se revocó realmente la sesión del cliente
temporal desde Auth y se comprobó que no pudiera restaurar el dashboard.

Durante la validación se corrigieron consumidores administrativos que todavía
utilizaban la audiencia de clientes y la pérdida del motivo de permiso al propagar
un error de login. Los fixtures históricos se adaptaron al cierre local del SDK y
al acceso anónimo real de reseñas/configuración públicas. Se mantuvieron las
aserciones de seguridad, sin aumentar timeouts ni añadir reintentos a las pruebas.

Una comprobación SQL final se detuvo antes de conectarse porque el plan de la CLI
no cumplía el parser estricto existente. No se ejecutó ese shell ni se relajó el
parser. La comprobación posterior, nuevamente de solo lectura, terminó aprobada
y quedó registrada con fecha en `schema-final.json`.
