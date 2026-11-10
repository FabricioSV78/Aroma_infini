# Interfaces de autenticación de Aroma Infini

**Actualización del 29/10/2026:** [Supabase — Fase 3](SUPABASE_PHASE_3.md) conecta Auth, perfil/dirección, MFA y acceso administrativo real. Registro sin confirmar email; cambio de correo con contraseña actual; recuperación por un código de uso único guardado por el cliente. No usa SMTP, Resend, correos ni SMS. La implementación está desplegada y comprobada con una cuenta temporal. Véase [Recuperación sin mensajes](AUTH_OFFLINE_RECOVERY.md). Los estados de proveedor no configurado que siguen describen el punto de control visual anterior.

Estado vigente del 26 de octubre de 2026: el acceso de clientes utiliza únicamente correo y contraseña, con selector superior «Iniciar sesión / Crear cuenta» e imagen unida al formulario sobre una superficie cálida común. Los campos se centran dentro del panel; no se repite un encabezado visible debajo del selector. Se conserva un H1 semántico «Mi cuenta» para tecnologías de asistencia. El registro solicita nombres, apellidos, correo, celular y contraseña. Los dos enlaces conservan sus rutas y señalan la opción actual con `aria-current`; Google OAuth sigue retirado. Supabase y la base de datos permanecen sin configurar: se retira el aviso pasivo del cliente, pero enviar el formulario conserva el error real de indisponibilidad. No se crean sesiones ficticias, aceptan credenciales de demostración ni afirman enviar correos. La composición vigente y su validación están en [AUTH_ACCOUNT_LAYOUT.md](AUTH_ACCOUNT_LAYOUT.md).

## Experiencias y rutas

| Ruta | Función |
| --- | --- |
| `/admin/login` | Acceso administrativo exclusivo, correo/contraseña y mostrar/ocultar. Sin registro público. |
| `/admin/recuperar` | Explica la recuperación por el operador autorizado de Supabase, sin omitir MFA. |
| `/admin/restablecer` | Mismo límite administrativo; no acepta códigos de clientes. |
| `/admin` y descendientes | Verificación de sesión normal y rol administrativo antes de mostrar el panel; un cliente válido no obtiene ese permiso. |
| `/iniciar-sesion` | Acceso de clientes por correo y contraseña y enlace al registro. |
| `/crear-cuenta` | Registro: nombres, apellidos, correo, celular de nueve dígitos y contraseña de al menos doce caracteres. |
| `/recuperar-contrasena` | Correo, código guardado y contraseña nueva; no envía mensajes ni crea sesiones automáticamente. |
| `/restablecer-contrasena` | Acceso compatible al mismo formulario de recuperación por código. |
| `/auth/callback` | Limpia y rechaza enlaces antiguos; remite a recuperar acceso por código, sin intercambiar tokens. |
| `/cuenta` y descendientes | Perfil, direcciones, pedidos, pagos y favoritos existentes, disponibles únicamente tras verificar una identidad. |

«Mi cuenta» mantiene su destino `/cuenta`; el guard dirige a iniciar sesión conservando la ruta interna solicitada. El retorno descarta URLs externas, barras invertidas, controles, rutas administrativas cruzadas y bucles hacia pantallas de acceso.

## Decisión visual y referencias

Para las propuestas de clientes se revisaron acceso y registro de COS, Glossier, Byredo, Aesop y Diptyque, además de Rituals Singapore, Clarins USA y ayuda oficial cuando otras pantallas limitaron el acceso automatizado. No se atribuye una inspección visual a las páginas bloqueadas. [AUTH_REDESIGN_REFERENCES.md](AUTH_REDESIGN_REFERENCES.md) y [AUTH_REFINEMENT.md](AUTH_REFINEMENT.md) conservan las propuestas anteriores; [AUTH_EDITORIAL.md](AUTH_EDITORIAL.md) reúne la decisión vigente y los límites de las referencias.

- [COS Tailandia](https://th.cos.com/th_en/customer/account/login) es la referencia principal para la elección superior entre acceso y registro, seguida de campos alineados y una acción clara. La observación corresponde a ese mercado; no se copian sus campos comerciales ni sus espacios vacíos.
- Apoyo para clientes: [Glossier](https://www.glossier.com/account/login), por recuperación reconocible y transición explícita al registro. No se importan programas de fidelidad ni consentimientos comerciales de esa referencia; los datos del registro corresponden al modelo de perfil existente de Aroma Infini.
- [Rituals Singapore](https://www.rituals.com.sg/login) muestra una pequeña imagen de regalo junto a información de cuenta; apoya una imagen subordinada, pero no se presenta como ejemplo de gran fotografía editorial ni de nuestra proporción concreta.
- La adaptación vigente reúne la fotografía existente `olfactory-santal.webp` y el formulario en un módulo de hasta 976 px, con fondo cálido `#faf8f4` y sin hueco entre ambos. La imagen ocupa hasta 440 px de ancho y un mínimo de 560 px de alto en escritorio, adaptándose a la altura del formulario. En tablet se conservan proporciones flexibles; en móvil pasa a una franja de 96 px unida al formulario. Se mantienen el selector superior y las migajas en el contenedor habitual.
- El acceso administrativo utiliza una tarjeta única de hasta 448 px, sin panel decorativo. Comparte los tokens de color con el dashboard: fondo neutro, superficie clara, bordes suaves y botón principal gris oscuro. Acceso, recuperación y nueva contraseña reutilizan esta presentación; los roles, permisos y contratos de autenticación se conservan. La revisión está en `artifacts/admin-auth-simple-2026-10-26/`, con capturas antes/después en cinco tamaños y comparación independiente de la pantalla de clientes.

No se cambian Home, fichas, catálogo ni el diseño aprobado del panel. Se reutiliza una fotografía editorial existente; no se producen activos nuevos. El botón social, su separador, su código y sus recursos exclusivos continúan retirados.

## Qué funciona ahora

- Navegación entre acceso, registro y recuperación; destinos internos seguros y separación de roles.
- Validación asociada a los campos, foco en el primer error, mostrar/ocultar contraseña y autocompletado apropiado.
- El registro agrupa nombres/apellidos y correo/celular en filas en escritorio; correo y celular se apilan en tablet/móvil. Se conservan celular de nueve dígitos y contraseña de al menos doce caracteres. `AuthSignUpInput` reutiliza `AccountProfile`: el contrato prepara los datos del perfil para el adaptador real, sin duplicar modelos ni persistir información personal en almacenamiento local. Dirección y documento siguen perteneciendo al checkout; esta revisión no modifica su autocompletado ni crea un perfil real mientras falte Supabase.
- Protección contra envíos repetidos y estados de carga/error. Los errores no borran el formulario; las contraseñas permanecen solo en memoria mientras se completa la tarea y no se guardan en almacenamiento ni logs.
- Los avisos generales del cliente y del acceso administrativo se presentan en un diálogo compacto para no desplazar el formulario. En administración utiliza los colores del panel. Se puede cerrar por botón, X o Escape y el foco vuelve a la acción de envío. Las correcciones específicas de cada campo permanecen debajo de su input, asociadas mediante `aria-describedby`, y el primer campo incorrecto recibe el foco. Un aviso contextual cerrado no reaparece por editar; un nuevo resultado del envío siempre puede mostrarse.
- Se elimina el aviso pasivo de indisponibilidad del cliente para mantener la pantalla centrada en su tarea. Mientras el adaptador siga sin configurar, un envío muestra el error real de indisponibilidad; no se afirma iniciar sesión, registrar una cuenta ni enviar un correo a partir del stub. El aviso administrativo conserva su comportamiento. No existen botón, icono, separador ni método de Google OAuth.
- El registro no requiere confirmación de correo. Supabase debe devolver una sesión real, que se verifica contra Auth y el actor del servidor antes de abrir la cuenta. Una respuesta sin sesión muestra un error y conserva el borrador. Recuperación usa un código guardado, hash privado y consumo atómico; cambiar el correo exige contraseña actual y una acción de servidor limitada al propietario.
- El cierre de sesión retira inmediatamente el acceso local y solicita el cierre al proveedor. El adaptador futuro deberá cerrar la sesión remota y gestionar fallos/reintentos; React no puede revocar por sí solo sesiones en otros dispositivos.
- La caducidad y los cambios de identidad invalidan el estado de acceso. El componente protegido vuelve al login, y los datos de cuenta no se muestran durante la verificación.
- Carrito y favoritos de invitado se conservan al visitar el login; se mantiene la compra como invitado.

## Cuenta e identidad

`AccountProvider` dejó de activar Camila, direcciones y pedidos de ejemplo. Ya no lee la clave antigua de `sessionStorage`, no compara correos para asociar compras ni consulta todos los pedidos administrativos. No se borraron los datos locales del navegador: sencillamente dejaron de utilizarse como prueba de identidad.

`accountAdapter` recibe el ID verificado del usuario. El contrato de datos incluye `userId`, también en cada pedido; una respuesta de otro propietario se rechaza antes de renderizar. Las vistas existentes de cuenta se conservan con estados de carga, error y reintento, y con datos vacíos reales cuando corresponda. Añadir una dirección abre un formulario vacío; no restaura una dirección ficticia. Sus cambios esperan una respuesta del adaptador y conservan el borrador ante un error.

Un checkout invitado no se convierte en pedido de cuenta por coincidir su correo. La futura creación de pedidos deberá asociar `auth.uid` de forma transaccional en servidor. Esta etapa mantiene la simulación de pago existente; no representa una compra real ni enlaza sus pedidos arbitrariamente con una identidad.

## Fronteras técnicas

- `types/auth.ts`: sesión, usuario, rol, intención de recuperación y contrato del proveedor.
- `services/auth-adapter.ts`: implementación deliberadamente no configurada; sesión nula y operaciones no disponibles. Es el punto a reemplazar con Supabase Auth.
- `services/auth-service.ts`: estado de sesión, expiración, cierre y comunicación con el adaptador. No almacena contraseñas, no contiene un usuario administrativo fijo y no lee flags de autorización en localStorage.
- `auth-loaders.ts` y `RequireAuth.tsx`: guard de navegación y verificación reactiva. Esta protección de interfaz **no sustituye autorización del backend**.
- `types/account.ts` y `services/account-adapter.ts`: modelos y repositorio de datos de cuenta por propietario, separados de los registros administrativos locales.
- `tests/auth-fixtures.ts`: únicamente el ejecutor de Playwright sustituye módulos de adaptador antes de iniciar cada contexto aislado para probar estados autorizados. No se importa desde la aplicación ni se publica como mecanismo de acceso; no hay ruta, parámetro, variable de entorno o flag local que active ese doble en producción.
- `worker/route-policy.ts`: reconoce las ocho rutas de autenticación para que los accesos directos no devuelvan 404 en Cloudflare. El Worker mantiene `noindex, nofollow` en rutas de aplicación. Esta clasificación tampoco constituye autorización de backend.

## Historial de pruebas de la propuesta anterior

Los resultados y capturas siguientes pertenecen a la preparación anterior al rediseño y a la retirada de Google. Conservan la trazabilidad de esa entrega; no describen las pantallas ni constituyen la validación del diseño vigente. [AUTH_REDESIGN.md](AUTH_REDESIGN.md) conserva la segunda propuesta como historial; las pruebas y capturas actuales se reúnen en [AUTH_REFINEMENT.md](AUTH_REFINEMENT.md).

- Typecheck, lint sin advertencias y build: correctos. Vite mantiene el aviso previo de tamaño para los módulos de Excel/PDF, que siguen separados de las rutas de acceso; el módulo de autenticación no incorpora esas dependencias.
- Suite completa inicial: 816 casos; 805 aprobados, 3 capturas administrativas opcionales omitidas y 8 fallos revisados. Se corrigieron el encabezado a 360–375 px, la separación de las migajas, los selectores de la cuenta retirada y la espera de la imagen lazy en una prueba antigua. El fallo intermitente de foco de ofertas se reprodujo y se corrigió esperando que React retire `inert` después del guardado.
- Cierre tras las correcciones: **121/121 aprobados**, incluyendo las rutas y los permisos, cuenta, checkout, espaciados, consistencia, Worker, panel, editor multimedia y ofertas. Registro: `artifacts/auth-interfaces-2026-10-26/closing-tests.log`. No se presenta la ejecución inicial como una suite sin fallos; se repitieron los escenarios afectados y sus módulos completos.
- Estrés específico del foco corregido: **5/5 aprobados**, cada uno creando diez ofertas consecutivas (50 en total, en contextos aislados), sin duplicaciones ni diferencias de precio. Registro: `focus-stress.log` en la misma carpeta.
- Se probaron los campos vacíos, correo inválido, contraseña mínima/confirmación, carga, doble envío, conservación de borradores, Google pendiente/cancelado, destinos seguros, sesión caducada por temporizador y por evento, cambio de propietario, cierre con fallo del proveedor y cliente sin permiso administrativo. Los estados autorizados proceden exclusivamente del adaptador de pruebas; no son cuentas reales.
- Comprobación independiente del build en Vite preview y Cloudflare Worker **local**: rutas privadas redirigen sin aceptar flags de navegador, restablecimiento sin sesión no ofrece cambio de contraseña, Google no abre un acceso ficticio, cero errores de página y cero solicitudes externas de autenticación. No se desplegó nada. Evidencia: `production-check.json` y `worker-production-check.json` en la carpeta de artefactos.

Capturas reales en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844, para acceso/registro/recuperación de clientes y acceso/recuperación administrativos. Se verificaron imágenes, legibilidad, navegación con teclado y ausencia de desbordamiento horizontal. Están en `artifacts/auth-interfaces-2026-10-26/screens/`.

| Pantalla | Monitor | Desktop | Laptop | Tablet | Móvil |
| --- | --- | --- | --- | --- | --- |
| Cliente: acceso | [1920](../artifacts/auth-interfaces-2026-10-26/screens/cliente-login-monitor.png) | [1440](../artifacts/auth-interfaces-2026-10-26/screens/cliente-login-desktop.png) | [1366](../artifacts/auth-interfaces-2026-10-26/screens/cliente-login-laptop.png) | [768](../artifacts/auth-interfaces-2026-10-26/screens/cliente-login-tablet.png) | [390](../artifacts/auth-interfaces-2026-10-26/screens/cliente-login-mobile.png) |
| Cliente: registro | [1920](../artifacts/auth-interfaces-2026-10-26/screens/cliente-registro-monitor.png) | [1440](../artifacts/auth-interfaces-2026-10-26/screens/cliente-registro-desktop.png) | [1366](../artifacts/auth-interfaces-2026-10-26/screens/cliente-registro-laptop.png) | [768](../artifacts/auth-interfaces-2026-10-26/screens/cliente-registro-tablet.png) | [390](../artifacts/auth-interfaces-2026-10-26/screens/cliente-registro-mobile.png) |
| Cliente: recuperación | [1920](../artifacts/auth-interfaces-2026-10-26/screens/cliente-recuperar-monitor.png) | [1440](../artifacts/auth-interfaces-2026-10-26/screens/cliente-recuperar-desktop.png) | [1366](../artifacts/auth-interfaces-2026-10-26/screens/cliente-recuperar-laptop.png) | [768](../artifacts/auth-interfaces-2026-10-26/screens/cliente-recuperar-tablet.png) | [390](../artifacts/auth-interfaces-2026-10-26/screens/cliente-recuperar-mobile.png) |
| Administración: acceso | [1920](../artifacts/auth-interfaces-2026-10-26/screens/admin-login-monitor.png) | [1440](../artifacts/auth-interfaces-2026-10-26/screens/admin-login-desktop.png) | [1366](../artifacts/auth-interfaces-2026-10-26/screens/admin-login-laptop.png) | [768](../artifacts/auth-interfaces-2026-10-26/screens/admin-login-tablet.png) | [390](../artifacts/auth-interfaces-2026-10-26/screens/admin-login-mobile.png) |
| Administración: recuperación | [1920](../artifacts/auth-interfaces-2026-10-26/screens/admin-recuperar-monitor.png) | [1440](../artifacts/auth-interfaces-2026-10-26/screens/admin-recuperar-desktop.png) | [1366](../artifacts/auth-interfaces-2026-10-26/screens/admin-recuperar-laptop.png) | [768](../artifacts/auth-interfaces-2026-10-26/screens/admin-recuperar-tablet.png) | [390](../artifacts/auth-interfaces-2026-10-26/screens/admin-recuperar-mobile.png) |

Las capturas anteriores de nueva contraseña (`cliente-restablecer-*` y `admin-restablecer-*`) utilizan únicamente el adaptador de recuperación aislado del ejecutor; no representan una sesión real ni un enlace enviado. En esa propuesta también se capturó el botón Google, retirado en la revisión vigente. `node scripts/capture-phase-7.mjs` ejecuta los casos actuales de capturas de Playwright sin reactivar la cuenta ficticia.

## Pendientes concretos para activar autenticación real

1. Configurar el proyecto Supabase, dominio/Site URL y URLs autorizadas de callback y recuperación. Incorporar el SDK en el adaptador cuando empiece esa fase, sin secretos privados en el frontend.
2. Implementar verificación/renovación de sesiones y suscripciones de Supabase; no confiar en un rol editable en metadatos del usuario. Resolver roles administrativos con una fuente protegida y verificar permisos en servidor.
3. Aplicar RLS y políticas de propietario a perfiles, direcciones, pedidos y líneas; proteger escrituras del catálogo, inventario y operaciones administrativas. El snapshot local y el bundle frontend no son un perímetro de seguridad ni una base multiusuario.
4. El registro por correo y contraseña ya está conectado mediante Supabase, sin confirmación de email. Mantener la asociación de identidad a partir del usuario autenticado; no enlazar cuentas o pedidos manualmente por coincidencia de correo. Google OAuth queda fuera del alcance vigente.
5. Recuperación y cambio de correo funcionan sin mensajería. Para publicar, configurar los orígenes HTTPS exactos en el servidor y explicar al cliente que debe generar y guardar su código antes de perder el acceso. No existe dependencia de remitente ni proveedor. Véase [Recuperación sin mensajes](AUTH_OFFLINE_RECOVERY.md).
6. Sustituir `accountAdapter` por consultas autenticadas y autorizadas, y hacer transaccional la asociación del pedido con el usuario. Migrar datos reales con consentimiento; no importar fixtures ni perfiles de demostración.
7. Probar el backend con cuentas reales de cliente/admin, permisos cruzados, confirmación de correo, expiración, renovación, cierre remoto, reintentos y recuperación caducada. Las pruebas de frontend con adaptadores aislados no prueban Supabase Auth ni RLS reales.

Referencias de integración: [correo y contraseña](https://supabase.com/docs/guides/auth/passwords), [redirecciones](https://supabase.com/docs/guides/auth/redirect-urls) y [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
