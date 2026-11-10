# Limpieza de interfaces y barreras de producción

**Estado vigente, 2 de noviembre:** [Preparación de producción](PRODUCTION_PREPARATION.md)
documenta las reseñas, configuración, reclamaciones, respaldos reales y el entorno
independiente ya preparados. Las secciones fechadas de este informe conservan
el alcance histórico de cada entrega; sus pendientes anteriores se sustituyen
por ese cierre. Dominio y Mercado Pago real continúan sin activar.

30 de octubre de 2026. Auditoría del código, pruebas con SDK y transporte aislado, y capturas de las interfaces públicas y administrativas. Esta entrega prepara las interfaces; no declara habilitadas las ventas reales ni crea infraestructura de producción.

## 1. Hallazgos y correcciones

| Elemento encontrado | Corrección |
| --- | --- |
| Reseñas publicadas procedentes de fixtures y formulario que guardaba sólo en el navegador | La experiencia comercial muestra un estado vacío de reseñas, sin valoraciones ni publicación local. El componente completo y sus fixtures se conservaron como herramienta aislada de desarrollo. |
| «Entre los más vendidos» y etiquetas de ventas apoyadas en un ranking manual | Se utiliza «Nuestra selección». No se alteraron el orden del catálogo, sus filtros ni los identificadores de navegación existentes. No se deducen ventas de pedidos simulados. |
| Historia de origen simulada en Nosotros | Se sustituyó por una explicación de la propuesta multimarca y de las funciones reales de comparación. Se mantienen fotografías, composición y tono editorial aprobados. |
| Campaña predeterminada de una marca de ejemplo y búsqueda con nombre de ejemplo | La campaña enlaza a la tienda y utiliza texto editorial genérico; la búsqueda invita a introducir el producto o marca. No se alteró contenido guardado en Supabase. |
| Iconos sociales sin URL y «Perfiles en preparación» | El footer muestra únicamente perfiles con URL configurada. La configuración se conserva para añadir los enlaces definitivos. |
| Texto de favoritos de cuenta «en este navegador» y descripciones antiguas de privacidad | Se distingue entre favoritos de cuenta en Supabase y favoritos de invitado/carrito del navegador. |
| Acceso administrativo presentado como «pendiente de activar» | Los errores de configuración/conexión usan mensajes de indisponibilidad temporal, sin afirmar que falta implementar Auth ni prometer compras operativas. |
| Saludo sin nombre y pagos marcados genéricamente como «Registrado» | El saludo tolera un perfil incompleto y los pagos reflejan su estado real: pendiente, confirmado, rechazado o reembolsado. Un pedido simulado conserva «Prueba · sin cobro». |
| Pedidos simulados dentro de indicadores comerciales y clientes derivados de pruebas | El Dashboard y el historial comercial de Clientes excluyen simulaciones. Los pedidos de prueba continúan disponibles y rotulados en Pedidos. |
| Fichas/PDF de pruebas sin distinción suficiente | Las fichas de prueba indican «NO DESPACHAR»; los resúmenes advierten que no son comprobantes de pago. Una simulación nunca se etiqueta como pagada, aunque una fixture antigua contenga ese estado. |
| Hidratación administrativa remota que podía recuperar pedidos, clientes, promociones y tarifas antiguos de IndexedDB | Los módulos remotos comienzan vacíos y leen sus proyecciones confirmadas. No se usan snapshots locales como alternativa ante un fallo remoto. Los datos locales antiguos se conservan sin importarlos. |
| Catálogo local disponible por configuración accidental en una compilación pública | Las compilaciones usan Supabase; los ejemplos locales están limitados a desarrollo/pruebas. Un fallo de conexión muestra el error o estado vacío correspondiente, sin sustituir el catálogo. |
| Lista estática de sitemap con perfumes y marcas de ejemplo | Se retiraron esas rutas de la lista publicable. Se mantienen las rutas generales; las fichas dinámicas se verifican contra la fuente autorizada. |
| Metadatos de nicho presentados como definición de la tienda | Se utiliza la identidad confirmada de perfumería multimarca. Los productos toman sus datos del loader y sus precios/stock de la misma fuente de la ficha. No se emiten reseñas o valoraciones de ejemplo en JSON-LD. |

No se añadieron secciones decorativas ni se sustituyeron layouts. Se conservaron tipografías, paleta, fotografías y vídeos editoriales, responsive, estados de carga, errores, controles y navegación. Las secciones de selección/marcas del Home sin datos no dejan rejillas vacías ni se rellenan con ejemplos.

## 2. Clasificación funcional actual

| Módulo | Clasificación | Comportamiento |
| --- | --- | --- |
| Catálogo, marcas, familias, variantes, precios, ofertas y stock | **Conectado y funcional** en desarrollo | Supabase es la fuente autorizada; las fotos se resuelven desde manifiestos R2 verificados. |
| Home, categorías, recomendador y medios editoriales | **Conectado y funcional** en desarrollo | Editor versionado y referencias R2; imágenes predeterminadas aprobadas cuando no existe personalización. El recomendador utiliza perfumes realmente disponibles. |
| Registro, inicio de sesión, perfil, dirección y favoritos de cuenta | **Conectado y funcional** | Supabase Auth y operaciones por propietario; admin con membresía y MFA. Registro sin confirmación de correo, recuperación por código guardado y cambio de correo con contraseña, según la política vigente sin SMTP. |
| Envíos y cupones | **Conectado y funcional** | Lectura y guardado remotos. Sin tarifas configuradas se solicita completarlas; no se publican importes de ejemplo. Provincias conserva su activación explícita. |
| Productos, importación Excel y marcas múltiples | **Conectado y funcional** | Validaciones y comandos remotos. Los ejemplos de la guía de Excel no se registran automáticamente. |
| Carrito y favoritos de invitado | **Conectado y funcional como almacenamiento de navegador** | No se presentan como sincronización entre dispositivos ni se mezclan automáticamente con favoritos de cuenta. El total del checkout remoto se recalcula en servidor. |
| Pedidos, historial, seguimiento privado y Mis pedidos | **Conectado y funcional** para los registros disponibles | Datos persistentes, propiedad por UUID, enlace privado de invitado, cambios individuales/masivos y PDF. Los pedidos generados por el checkout actual son de prueba. |
| Dashboard y Clientes | **Conectado y funcional**, con alcance acotado | Indicadores derivados de datos confirmados. Clientes es una proyección de compradores con pedidos comerciales, no un listado de todas las cuentas de Auth. No se cuentan pruebas como ventas o compradores reales. |
| Pago/creación de pedidos de prueba | **Sólo disponible en desarrollo o staging** | Advertencias de prueba, pago pendiente y sin consumo/reserva de stock ni uso de cupón. |
| Reseñas de clientes y moderación | **Pendiente de integración** | Estado vacío comercial; no hay valoraciones inventadas ni botón que simule publicar. |
| Mercado Pago real, notificaciones y conciliación | **Pendiente de integración** | No hay cobro real ni confirmación de pago del navegador. Producción bloquea el checkout. |
| Producción, dominio, contenido comercial final y publicación SEO | **Pendiente de habilitación** | No se creó un proyecto/bucket/Worker de producción ni se activó indexación. |

## 3. Separación de entornos y seguridad

`runtime-environment.ts` centraliza la política de la interfaz. `npm run build` genera una aplicación considerada de producción y muestra un estado de checkout no disponible, conservando el carrito. No renderiza el botón de simulación ni sus controles, tampoco con `?demo=1`. El proveedor de checkout y el servicio de envío del comando rechazan esa operación igualmente; no se depende de CSS.

`npm run build:staging` genera el frontend para el staging conocido. La simulación sólo se ofrece desde el origen exacto autorizado. Los comandos Cloudflare de validación/despliegue usan este build explícito. Una compilación de staging copiada a otro dominio no habilita la simulación.

El Worker exige conjuntamente:

- Entorno declarado de staging o desarrollo local.
- Bandera explícita de simulación.
- Origen de staging exacto o loopback de desarrollo, según corresponda.
- Proyecto Supabase de desarrollo esperado, secreto del servidor y límite de frecuencia.
- Las validaciones existentes de origen, tamaño, identidad e idempotencia.

El entorno predeterminado del Worker se declara de producción y rechaza el endpoint. Copiar únicamente la bandera de simulación, o incluso las variables de staging a otro host, no basta para crear pedidos. La implementación no valida ni aprueba pagos reales.

El checkout local aislado también marca sus registros como simulaciones, deja el pago pendiente y no reduce inventario ni usos de cupones. El adaptador local rechaza registrar pedidos cuando la fuente es remota. Las operaciones comerciales remotas permanecen en el Worker/SQL.

Se preservan RLS, permisos, Auth, MFA, propietarios y rechazo de respuestas tardías. No se añadieron cuentas, migraciones, permisos ni servicios externos. No se modificaron productos, clientes, pedidos o archivos alojados. Las credenciales de servidor permanecen fuera de `VITE_` y se revisó su ausencia en el build público.

## 4. Herramientas y contenido conservados

Se conservan `src/mocks`, fixtures de Auth/catálogo/pedidos/reseñas, simuladores locales, migraciones, scripts de verificación, PDF, recursos editoriales, imágenes, vídeos y datos locales persistentes. Son útiles para pruebas de errores, concurrencia, paginación y responsive. `ProductReviewsDemo.tsx` mantiene el editor de opiniones de laboratorio; su uso comercial queda cerrado por la política de entorno.

Las ayudas breves de formulario («por ejemplo, Casa u Oficina»), plantillas Excel y marcadores de datos no completados no se eliminaron indiscriminadamente. Ayudan a registrar datos y no constituyen información comercial ficticia. Las advertencias por pedido simulado se mantienen incluso en una interfaz sin banner general de desarrollo.

## 5. Validación y evidencias

Se probaron catálogo vacío y con productos, producto sin imágenes/agotado en las suites de catálogo y medios, promociones vacías y vigentes, errores de conexión, propietarios distintos, invitados, administradores, sesiones expiradas, recuperación sin correo, selección múltiple de pedidos y pagos sin pasarela real.

| Suite | Resultado final |
| --- | --- |
| Interfaces en modo producción | 15 aprobadas |
| Entornos, Worker y contratos comerciales | 28 aprobadas |
| Catálogo remoto | 24 aprobadas |
| Pedidos remotos | 17 aprobadas |
| Tarifas y cupones | 8 aprobadas |
| Checkout | 10 aprobadas |
| Favoritos | 15 aprobadas |
| Autenticación y cuenta | 65 aprobadas |
| Home remoto | 6 aprobadas |
| Fotografías R2 con transporte aislado | 12 aprobadas |
| Herramientas locales, vídeo, reseñas de laboratorio, PDF y SEO | 41 aprobadas |

Los grupos se solapan en algunos contratos: no se presentan sus sumas como casos únicos. Las expectativas antiguas de login, URLs SEO de puerto fijo, rutas de ejemplo estáticas y reproducción con movimiento reducido se actualizaron al comportamiento real aprobado. Las pruebas conservan validaciones funcionales, no sólo comprobaciones de texto.

Las capturas finales esperan la retirada del skeleton, las fuentes y las imágenes. Se inspeccionaron pantallas públicas, cuenta y Dashboard, Productos, Promociones, Pedidos, Envíos y Home administrativo en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844. No se detectaron desbordamientos horizontales. Los datos de esas capturas son fixtures HTTP identificadas, no nuevas ventas o productos alojados.

Evidencias reproducibles y resultado consolidado: [artifacts/interface-cleanup-2026-10-30](../artifacts/interface-cleanup-2026-10-30/). Comandos:

```powershell
npm.cmd run test:interfaces:cleanup
npm.cmd run test:commerce:worker
npm.cmd run test:catalog:supabase
npm.cmd run test:orders:supabase
npm.cmd run test:commerce:settings
npm.cmd run test:checkout:supabase
npm.cmd run test:favorites:supabase
npm.cmd run test:auth:supabase
npm.cmd run test:home:supabase
npm.cmd run test:media:browser
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run cloudflare:check
```

También se comprueba el checkout sobre la compilación normal de producción, no sólo sobre Vite de desarrollo. Las comprobaciones HTTP de staging utilizan solicitudes inválidas/rechazadas que no crean pedidos ni cuentas.

Capturas: [checkout de producción compilado](../artifacts/interface-cleanup-2026-10-30/screenshots/compiled-production-checkout.png), [Dashboard desktop](../artifacts/interface-cleanup-2026-10-30/screenshots/admin-resumen-1440.png), [Dashboard móvil](../artifacts/interface-cleanup-2026-10-30/screenshots/admin-resumen-390.png), [Home](../artifacts/interface-cleanup-2026-10-30/screenshots/home-1440.png) y [cuenta](../artifacts/interface-cleanup-2026-10-30/screenshots/cuenta-390.png). El [resultado consolidado](../artifacts/interface-cleanup-2026-10-30/result.json) enlaza las suites finales y los builds verificados.

## 6. Pendientes antes del lanzamiento

1. Integrar y verificar Mercado Pago real, notificaciones del proveedor, conciliación y transacciones de inventario/cupones. La simulación no autoriza habilitar ventas reales.
2. Crear/configurar un entorno independiente de producción, su dominio y sus propios datos/secretos/bucket. El Worker actual de staging continúa apuntando al desarrollo; no reutilizarlo como producción.
3. Guardar y validar las tarifas/plazos comerciales definitivos. No se configuraron importes por cuenta del negocio durante esta limpieza.
4. Confirmar con el propietario el número de contacto actualmente proporcionado, perfiles sociales y textos/políticas legales. No se inventaron datos de la empresa ni se declaró implementado un proceso formal de reclamaciones que todavía no existe.
5. Revisar el material comercial cargado por el propietario y los medios editoriales aprobados antes de activar indexación. Los registros existentes se conservaron sin decidir por su nombre o fotografía si son «reales» o «de prueba».
6. Definir e integrar opiniones/moderación cuando corresponda. No hay un sistema comercial de reseñas activado por esta entrega.
7. Preparar publicación SEO y generación de URLs dinámicas a partir del catálogo confirmado. La retirada de rutas de ejemplo y el `noindex` no equivalen a completar esa publicación.

Referencias técnicas: [entornos de Cloudflare Workers](https://developers.cloudflare.com/workers/wrangler/environments/) y [entornos y modos de Vite](https://vite.dev/guide/env-and-mode).

## 7. Comprobación previa a producción — 31 de octubre

El propietario confirmó que todavía no dispone de dominio definitivo ni de un proyecto Supabase independiente. No se crearon recursos, configuraciones con identificadores ficticios ni un comando de despliegue a producción. Desarrollo y staging conservan su configuración actual.

```powershell
npm.cmd run production:check
npm.cmd run test:production
```

`production:check` inspecciona localmente las variables públicas efectivas del modo production y `env.production` de `wrangler.jsonc`. No inicia sesiones, carga secretos de servidor, conecta bases, ejecuta migraciones ni publica. Su salida JSON opcional (`npm.cmd run production:check -- --json`) contiene códigos y mensajes, sin valores de claves.

Comprueba identidad del Worker, dominio HTTPS y ruta, coincidencia e independencia de Supabase, bucket propio, ausencia de secretos en configuración pública/vars, origen de API y cargas, observabilidad, simulación desactivada e indexación cerrada. No hereda `vars` o buckets de la configuración raíz para fingir un entorno completo. El bloque raíz actual no es una configuración de producción: conserva recursos de desarrollo y no se debe desplegar como tal.

**El resultado actual debe ser bloqueado y el comando devuelve código 1.** Esto identifica requisitos pendientes; no es un fallo de instalación. Aunque una futura configuración supere esas comprobaciones, la salida seguirá diferenciando preparación técnica de lanzamiento comercial: todavía faltan validación alojada, backups, contenido/condiciones definitivos y pago real. No hay una variable que permita declarar Mercado Pago integrado.

El generador SEO ahora utiliza el cargador oficial de Vite, con la misma precedencia, expansión y archivos del modo elegido. Los hooks de `build:staging` leen `.env.staging`, no `.env.production`; staging mantiene noindex. No se alteraron las pantallas, la autenticación, los datos de la tienda ni sus archivos de medios.

Se conserva el inventario y la política de archivos de [PROJECT_FILES_AUDIT.md](PROJECT_FILES_AUDIT.md). No se eliminaron migraciones, herramientas, fixtures, imágenes editoriales ni datos persistentes por el hecho de ser históricos o de desarrollo. No se añadieron plantillas de producción vacías ni dependencias.

Validación de esta preparación: 24 pruebas nuevas aprobadas, 28 regresiones de checkout/contratos aprobadas, typecheck, lint y builds production/staging correctos. El empaquetado local del Worker pasó con `--env staging --dry-run`; fue necesario repetir sólo ese empaquetado fuera de la restricción de lectura del sandbox. No se desplegó. Los temporales de prueba se retiraron tras verificar sus rutas; `.env.production`, `.env.production.local`, `.dev.vars` y los resultados generados continúan ignorados por Git. [Resultado de esta etapa](../artifacts/production-readiness/result.json).

## 8. Aceptación en staging — 31 de octubre

Se verificó el sitio alojado con el catálogo existente: un producto y dos presentaciones, sin crear perfumes ni alterar sus fotografías. El propietario confirmó envío gratuito desde **S/330** y autorizó importes/plazos provisionales: courier S/10, motorizado S/15, 1 a 2 días hábiles, Lima y Callao. La configuración se guardó en Supabase mediante el comando administrativo y permanece editable en **Tarifas de envío**. No se habilitaron provincias. Estas condiciones de desarrollo deben confirmarse antes de producción.

Se comprobaron cotizaciones públicas en ambas zonas y modalidades. Con el producto de S/167 el envío se cobra según modalidad; con dos unidades, subtotal S/334, ambas modalidades devuelven envío gratuito. Se usa el precio y stock existentes, sin cambiar el catálogo para fabricar casos límite.

**Incidencia corregida:** la recuperación por código admitía localhost, pero el origen del Worker recibía HTTP 403 en el preflight. Se añadió exclusivamente el origen de staging a `ACCOUNT_ACTION_ALLOWED_ORIGINS` en el proyecto de desarrollo, manteniendo 127.0.0.1 y localhost. Recuperación y cambio de correo devuelven ahora HTTP 204 para esos orígenes y HTTP 403 para uno ajeno. No se activó SMTP ni se cambiaron contraseñas de usuarios existentes. La comprobación pública permanente incorpora este caso para detectar regresiones.

El recorrido alojado utilizó un cliente y un administrador temporales identificados:

1. Registro web sin confirmación por correo, dirección guardada y comprobada tras recargar, favoritos confirmados desde un segundo cliente SDK.
2. Código de recuperación creado desde la web, cambio real de contraseña con ese código y comprobación de un código de reemplazo y nuevo acceso. Los códigos y contraseñas permanecieron en memoria y no se incorporan a capturas o informes.
3. Pedido simulado creado mediante el Worker para el cliente correcto, presentación de 100 ml, subtotal S/167 y envío S/10: total S/177, pago pendiente.
4. Administración con membresía y MFA reales, cambio a En preparación, historial del responsable y descarga del PDF marcado como prueba.
5. El cliente consulta el mismo cambio desde Mis pedidos; el seguimiento mediante enlace privado lo refleja y la referencia sin token no expone el pedido.
6. Retirada del pedido, sus operaciones temporales y ambas identidades bajo comprobaciones de UUID, email, marca de prueba y pertenencia. Las huellas del catálogo, stock, medios referenciados, pedidos y usuarios administrativos existentes se conservaron. El cambio comercial persistente es la configuración de envíos autorizada; también permanece la corrección de CORS.

La prueba alojada final tiene doce comprobaciones, cero errores de JavaScript y cero desbordamientos horizontales en los cinco tamaños. No hubo cargas de medios ni cobros reales. Se comprobaron también las pantallas de Dashboard, productos, formulario nuevo, pedidos, promociones y envíos sin guardar productos u ofertas de ejemplo.

Las regresiones con SDK y transporte HTTP aislado aprobaron: Auth/cuenta 65, catálogo 24, pedidos 17, fotografías 12, tarifas/cupones 8, favoritos 15 y checkout 11. El caso nuevo de checkout utiliza un mismo pedido en cliente, administrador con MFA, PDF y seguimiento; sustituye la insuficiente validación de módulos con registros independientes. Son pruebas aisladas y no equivalen por sí solas a escrituras alojadas. El verificador anónimo alojado tiene ahora 39 comprobaciones y lint/TypeScript terminaron correctamente.

Las capturas públicas y administrativas cubren 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844. Para la revisión final de Direcciones se utiliza transporte aislado, esperando el formulario y sus valores guardados: una revisión automática rechazó crear otra cuenta alojada para repetir esas capturas, al interpretar que excedía la autorización de cambios alojados. Esa operación adicional no se ejecutó ni se reintentó. Se conserva la distinción entre la evidencia funcional alojada y la evidencia visual aislada.

Evidencias: [resultado consolidado](../artifacts/acceptance-2026-10-31/result.json), [recorrido alojado](../artifacts/acceptance-2026-10-31/hosted-latest-result.json), [cotizaciones](../artifacts/acceptance-2026-10-31/postflight.json), [capturas y PDF](../artifacts/acceptance-2026-10-31/hosted-603b8d4f-52d3-498d-9dad-4a3178b15b3d/) y [Direcciones con transporte aislado](../artifacts/acceptance-2026-10-31/account-isolated-final/).

Pendientes de lanzamiento: confirmar tarifas/plazos y contenido legal/comercial, disponer de dominio e infraestructura independiente, integrar y verificar Mercado Pago real. La aceptación de desarrollo no habilita producción ni confirma ventas cobradas.

Referencias del ajuste: [CORS en funciones Supabase](https://supabase.com/docs/guides/functions/cors) y [variables del entorno de funciones](https://supabase.com/docs/guides/functions/secrets).

## 9. Recuperación local — 31 de octubre

Después de la aceptación se verificó una copia física en frío de un clúster PostgreSQL desechable, usando las herramientas ya instaladas. `npm run test:recovery:local` rechaza destinos remotos y carpetas ajenas a su ejecución, comprueba la identidad del motor y detiene el origen antes de copiarlo completo. Arranca la restauración en otro directorio y puerto loopback; conserva hashes, recuentos y resultados sin guardar contraseñas en informes.

Aprobaron doce guardas, las diecinueve migraciones, 470 comprobaciones SQL y nueve comprobaciones de restauración: archivos SHA-256, datos, secuencias, propietarios, roles, permisos, políticas RLS y aislamiento de dos usuarios del fixture SQL. Los datos de origen, respaldo y restauración se retiraron tras confirmar la parada de ambos motores; no se podaron bases anteriores ni recursos del proyecto.

Esta etapa no configura backups alojados ni restaura Supabase/R2: demuestra la recuperación local con la misma versión de PostgreSQL y un fixture SQL de Auth. El alcance, los resultados y los elementos que deberán respaldarse por separado se mantienen en [Supabase: desarrollo y recuperación](../supabase/README.md#ensayo-de-recuperación-local). No hubo nuevas dependencias, migraciones remotas, cuentas alojadas, cambios de interfaz o pagos. [Resultado consolidado](../artifacts/recovery-2026-10-31/result.json).

## 10. Comprobación operativa reutilizable — 1 de noviembre

Se añadió `npm run staging:check` para detectar fallos de entrega después de desplegar sin repetir operaciones comerciales. Revisa páginas, archivos de entrada, indexación cerrada, errores HTTP y una muestra acotada de los medios públicos confirmados por Supabase. No usa credenciales administrativas ni modifica Supabase, R2 o el Worker. Conserva el entorno de producción y Mercado Pago real sin habilitar.

La ejecución alojada aprobó 25 contratos, incluidas las cinco imágenes R2 publicadas y sus quince tamaños. No había vídeos R2 publicados; el contrato de lectura por rangos está probado de forma aislada. Las dieciséis pruebas locales verifican tanto respuestas válidas como corrupción, referencias sin manifiesto, límites, claves no permitidas y errores sin filtración de datos. TypeScript, lint y build terminaron correctamente. La metodología y los comandos se mantienen en [Cloudflare staging](CLOUDFLARE_STAGING.md#comprobación-operativa-de-solo-lectura); el [informe alojado](../artifacts/staging-check-2026-11-01/hosted.json) contiene sólo resultados y recuentos. No se añadieron dependencias ni pantallas y no se guardaron copias de fotografías.

## 11. Metadatos iniciales de productos y marcas — 1 de noviembre

La revisión encontró que el Worker confirmaba la existencia de las fichas, pero devolvía el título y la descripción del Home. El HTML inicial ahora contiene los datos propios del producto o la marca, incluidos los enlaces habituales `/tienda?marca=…`. El formato se comparte con la aplicación y la transformación se limita al `head`, conservando los controles, fotografías y composición aprobados.

El ajuste se verificó con doce pruebas nativas de workerd, diez regresiones locales de SEO/navegación y una comparación anónima del HTML alojado antes/después. El verificador operativo posterior aprobó 25 contratos y las cinco imágenes R2 con sus quince tamaños. TypeScript, lint, build de staging y empaquetado local aprobaron; el empaquetado requirió salir de la restricción de lectura de esbuild, sin modificar dependencias.

Se actualizó únicamente el Worker existente `aroma-infini-frontend-staging`, versión `c3f7c9f7-64fd-400a-b55e-697e582215b1`. No se aplicaron migraciones, cambios de contenido, nuevas cuentas, pedidos ni escrituras de medios. Continúan `noindex`, la simulación de Mercado Pago y los recursos de desarrollo; el entorno de producción no está habilitado. El sitemap dinámico y la publicación comercial siguen pendientes. [Funcionamiento](SEO_FOUNDATION.md#metadatos-iniciales-del-catálogo-remoto) y [evidencias](../artifacts/catalog-seo-2026-11-01/result.json).
