# Referencias verificadas de autenticación — Aroma Infini

**Historial de la propuesta anterior.** Google OAuth y sus recursos se retiraron posteriormente por decisión del cliente. La investigación vigente está en [AUTH_REDESIGN_REFERENCES.md](AUTH_REDESIGN_REFERENCES.md); la implementación actual, en [AUTH_REDESIGN.md](AUTH_REDESIGN.md).

Fecha de consulta: 26 de octubre de 2026. Investigación de páginas de acceso, registro y recuperación, no de sus portadas. No se enviaron formularios, se crearon cuentas ni se intentó superar bloqueos antibot.

## Referencias de clientes

| Referencia y URL primaria | Comprobado | Qué aplicar a Aroma Infini |
| --- | --- | --- |
| [Glossier: acceso y recuperación](https://www.glossier.com/account/login), [registro](https://www.glossier.com/account/register) | Acceso observado en navegador y contenido primario: una columna de formulario compacta, correo y contraseña, recuperación cercana y entrada de registro diferenciada. Recuperación por correo en la misma zona; el registro es una vista propia. | **Referencia principal de cliente:** prioridad de la tarea, ancho legible, acciones próximas y transiciones claras. Reducir el registro a los datos necesarios; no copiar sus campos promocionales ni membresías. |
| [Aesop KSA: cuenta](https://sa.aesop.com/account/login), [registro](https://sa.aesop.com/account/register) | La web US bloqueó la lectura con una verificación de seguridad. Se verificó la versión regional oficial KSA: acceso/registro diferenciados y recuperación por correo, etiquetas y requisitos explícitos. | Alternancia visible y sobriedad. La observación es regional; no se atribuye este diseño a todos los mercados de Aesop. No trasladar teléfono obligatorio ni preferencias de marketing a Aroma Infini. |
| [Diptyque: acceso](https://www.diptyqueparis.com/en_us/login/) | En el navegador redirige actualmente a su dominio de cuentas y solicita únicamente correo para enviar un código. El diseño usa logo, título corto y tarea única. | Identidad de marca y concentración en una acción. **No copiar su mecanismo OTP**: el usuario pidió correo/contraseña y Google. Los resultados antiguos de Magento con contraseña no representan la pantalla actual observada. |
| [Sephora: registro, acceso y recuperación](https://www.sephora.com/beauty/registration-sign-in?country_switch=ca&lang=en), [cuenta](https://www.sephora.com/profile/MyAccount) | La cuenta bloqueó el navegador con Access Denied; no se presume una composición visual observada. Su ayuda oficial confirma datos de registro, recuperación por enlace y separación de datos de cuenta. | Acceso reconocible y recuperación explícita. No copiar programas de fidelidad ni solicitar fecha de nacimiento sin necesidad. |
| [Nordstrom: acceso](https://www.nordstrom.com/signin), [ayuda oficial de cuenta](https://www.nordstrom.com/browse/customer-service/frequently-asked-questions) | La página de acceso redirigió a un bloqueo de tráfico automatizado; no se afirma haber visto su formulario. La ayuda oficial distingue cuenta, direcciones e historial de compras. | Mantener la cuenta útil tras autenticar, sin presentar datos ajenos como ejemplo. No fundamentar dimensiones ni composición en una página bloqueada. |
| [Zara: acceso](https://www.zara.com/us/en/logon), [registro y acceso: ayuda oficial](https://www.zara.com/us/en/help-center/RegisterAndLogin) | El acceso no expuso su interfaz al lector. Su ayuda US especifica registro con información esencial, acceso con correo/contraseña, recuperación y compra como invitado. | Registro breve y mantener checkout invitado. No imponer cuenta para explorar o comprar. No extrapolar condiciones de otro mercado. |

## Referencias administrativas

| Referencia y URL primaria | Comprobado | Qué aplicar a Aroma Infini |
| --- | --- | --- |
| [Stripe: acceso](https://dashboard.stripe.com/login), [recuperación](https://dashboard.stripe.com/reset) | Se observó en Chrome el formulario de correo/contraseña, recuperación junto al campo de contraseña, una acción principal y proveedores alternativos separados. Recuperación como página propia con retorno explícito. | **Referencia principal administrativa:** identidad independiente, jerarquía precisa y formulario proporcionado. Adaptar al verde y superficies del panel. No copiar fondos multicolor, registro público, SSO, passkeys ni campos secundarios innecesarios. |
| [Shopify: acceso](https://accounts.shopify.com/login) | La ruta resuelve a su lookup de cuenta: tarea de acceso identificable, correo y otras formas separadas. La ruta alternativa store-login respondió 403; no se atribuye esa limitación a todas sus páginas. | Separar acceso administrativo de tienda y no confundir registro de clientes con autorización operativa. No reproducir la creación pública de administradores. |
| [Vercel: acceso](https://vercel.com/login) | Observado en navegador y web: título funcional, correo como acción, botones de proveedores diferenciados y opciones avanzadas secundarias. | Claridad de opciones y espacio controlado. En Aroma Infini Google corresponde al acceso de clientes; no añadir proveedores que el negocio no pidió. |

## Dirección visual propuesta

La adaptación no consiste en copiar el formulario centrado de otra marca. Para clientes, mantener la navegación comercial existente y un módulo de acceso con un ancho de lectura controlado, título de marca, campos alineados y alternancia evidente. El acento editorial puede apoyarse en los recursos y tipografía existentes, sin un bloque gigante de contenido vacío. Para administración, usar una página independiente sin el menú de la tienda: logo, contexto de acceso operativo, formulario compacto y retorno claro a la tienda.

En ambas: etiquetas persistentes, inputs de 44–48 px, contraste y foco visibles; contraseña con control accesible; `autocomplete="email"`, `current-password` o `new-password` según la tarea. Una columna en móvil, sin imágenes que empujen el formulario fuera de la primera vista. Las validaciones deben asociarse al campo y el error global anunciarse, sin revelar si existe una cuenta cuando el proveedor real no deba hacerlo. Estas decisiones son adaptaciones de diseño, no afirmaciones de seguridad de un frontend sin backend.

## Botón Google: marca oficial y recurso preparado

[Guía oficial de Google Identity](https://developers.google.com/identity/branding-guidelines), actualizada el 7 de julio de 2026. La guía exige el icono G estándar actual, prohíbe versiones monocromas o inventadas y permite localizar el texto de la acción. La tipografía indicada actualmente es **Google Sans Medium**, 14/20. No se encontró una excepción que autorice sustituirla por Lato por preferencia de marca. Tema claro: fondo blanco, borde `#747775`, texto `#1F1F1F`; conservar proporción, colores y espaciado del logo. El texto será «Continuar con Google».

Se descargaron el [paquete oficial de botones](https://developers.google.com/static/identity/images/signin-assets.zip) y el [icono enlazado por la guía](https://developers.google.com/static/identity/images/g-logo.png). Se eligió este último porque es un G independiente; los SVG del ZIP contienen ya un botón completo de 40 × 40, con borde/fondo, y eliminar esas partes habría modificado el recurso.

- Archivo utilizado: `public/brand/google-g.png`.
- Original idéntico: `artifacts/auth-interfaces-2026-10-26/google-g-official.png`.
- 200 × 204 px, PNG con transparencia, 33.661 bytes. Icono gradient super G inspeccionado visualmente. No se recortó, redibujó, recoloreó ni recomprimió.
- Uso previsto: únicamente dentro del botón de autenticación, fondo blanco y tamaño pequeño manteniendo su proporción. No representa una asociación comercial de Google con Aroma Infini.
- Procedencia y uso de marca: la guía oficial anterior. No se atribuye al icono una licencia genérica distinta de las condiciones de marca indicadas por Google.

Mientras OAuth esté pendiente, el botón no debe abrir una página de acceso casera ni indicar éxito. Su estado debe explicar que Google todavía no está activado. La futura conexión utilizará el proveedor de Supabase, sin pedir contraseñas de Google.

## Preparación de seguridad verificada en documentación primaria

- [Google con Supabase Auth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google): configurar proyecto/proveedor y scopes mínimos; utilizar el SDK para iniciar OAuth y manejar el callback según el flujo. No crear una identidad paralela ni mezclar usuarios por correo desde el frontend.
- [Correo y contraseña](https://supabase.com/docs/guides/auth/passwords): separar registro, acceso y recuperación; la recuperación no debe revelar si el correo existe. La pantalla de cambio de contraseña necesita una sesión válida de recuperación antes de actualizarla.
- [URLs de redirección](https://supabase.com/docs/guides/auth/redirect-urls): configurar dominio y callbacks permitidos. En el frontend, aceptar destinos internos seguros, sin protocolos externos, URLs `//` ni bucles hacia pantallas de autenticación.
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [claims de acceso](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook): las reglas de datos y autorización administrativa deberán verificarse en backend/base de datos. Una cuenta de cliente no equivale a un rol administrativo. No basar ese rol en `localStorage` ni en metadatos modificables por el cliente.

Esta investigación no conecta Supabase, no implementa cuentas reales y no permite afirmar que React por sí solo proteja datos administrativos. Las pruebas de estados autenticados podrán utilizar dobles de prueba aislados; la aplicación pública deberá permanecer sin sesión hasta disponer de un adaptador real.
