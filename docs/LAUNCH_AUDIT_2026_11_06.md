# Auditoría de lanzamiento — Aroma Infini

6 de noviembre de 2026, Lima.

Actualización posterior: [auditoría avanzada de seguridad y concurrencia del
7 de noviembre](SECURITY_ROBUSTNESS_AUDIT_2026_11_07.md). Incluye correcciones
publicadas solo en staging, 28 migraciones de desarrollo y tres pendientes en
producción. Las cifras siguientes conservan la evidencia de esta fecha.

**Dictamen: BLOQUEANTE para apertura comercial.** El proyecto compila, las
pruebas técnicas descritas pasan y los recorridos controlados de staging se
completaron con servicios reales. Eso no habilita cobros ni acredita una tienda
de producción operativa: faltan dominio, Mercado Pago, contenido comercial,
actualización autorizada de producción y preparación del titular/recuperación.

APROBADO significa que pasó el alcance concreto indicado; PENDIENTE requiere
trabajo o verificación adicional; BLOQUEANTE impide la apertura o la operación
que se especifica. Ninguna prueba aislada se presenta como una transacción real.

## Entornos y límites respetados

| Entorno            | Estado verificado                                                                                        | Acción en esta auditoría                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local              | Código actual, build por entorno y suites aisladas                                                       | Pruebas y dos correcciones de herramientas/configuración; sin rediseño ni dependencias nuevas.                                                                      |
| Staging            | Worker `aroma-infini-frontend-staging`; Supabase `tkxvexfapszilzhogvgu`; R2 `aroma-infini-media-dev`     | Publicación controlada y ensayos con identidades temporales. Versión final `4f8de15c-b72b-4a0b-b93d-ce26851a52c5`, 100 % del tráfico.                               |
| Producción cerrada | Worker `aroma-infini-frontend-production`; Supabase `ogpfhhucnaldgxyqajkc`; R2 `aroma-infini-media-prod` | **Solo lecturas**. Versión `ec8554f6-d47a-4af0-ba60-4623c8125020` conservada, 100 % del tráfico. Sin rutas/dominio público ni compras, push o indexación activados. |

No se aplicaron migraciones ni se desplegó código/configuración en producción.
No hubo cobros, compras comerciales, SMTP, Resend ni consumo de stock/cupones.
Las únicas filas eliminadas remotamente fueron las fixtures de desarrollo de
este ensayo, verificadas por UUID/operación/alias y guardas de pertenencia.

## Problemas encontrados y correcciones

| Hallazgo                                                                                                                                 | Resultado y comprobación                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrangler types` ejecutaba la guarda del paquete final antes del build; registraba un error que Wrangler capturaba y después continuaba. | **APROBADO, corregido.** El hook reconoce el contexto documentado `WRANGLER_COMMAND=types`. Generar tipos no necesita `dist`; `deploy`, `dev`, subida de versiones y comprobaciones normales conservan la guarda de entorno/integridad. El ensayo sin paquete demuestra que tipos funciona y despliegue/dev siguen rechazados. `npm run build` y `npm run typecheck` completos ya no necesitan omitir prehooks. |
| Logs y trazas tenían `redact_query_string=false`. Las URLs pueden contener búsquedas o referencias privadas.                             | **APROBADO en staging; PENDIENTE aplicar en producción.** Se preparó `observability.redact_query_string=true` y una validación negativa de preflight. La API real de Cloudflare confirma `true` en staging, con logs/trazas conservados. Producción sigue en `false` porque no se autorizó desplegar allí. No se afirma exposición efectiva de PII ni eliminación de logs históricos.                           |
| Los informes anteriores ya no describían el estado de todas las integraciones.                                                           | **APROBADO.** Se enlazó esta auditoría desde los informes históricos; se actualizó el estado de publicación de las proyecciones Home/Marcas. Se conserva la evidencia de cada fase.                                                                                                                                                                                                                             |

Cambios de producto/diseño: **ninguno**. No se cambió el color de “Ayuda” para
ocultar una alerta automática de contraste; se documenta su límite abajo.

## Pruebas realizadas

### Compilación, configuración y seguridad

| Prueba                                    | Estado                                                 | Evidencia y límite                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run build` de producción             | APROBADO                                               | Ejecución completa, tipos generados, TypeScript, Vite, postbuild y sello de 347 archivos. Mantiene `noindex`. Advertencias por chunks grandes, sin errores de compilación.                                                                                               |
| `npm run typecheck` y lint completo       | APROBADO                                               | Comandos normales, incluidos prehooks; sin necesidad de saltarse la generación de tipos.                                                                                                                                                                                 |
| Empaquetado de producción                 | APROBADO                                               | `wrangler deploy --env production --dry-run` y verificación del sello; **sin despliegue**. No acredita funcionamiento público de producción.                                                                                                                             |
| Build/publicación/verificación de staging | APROBADO                                               | Sello de 347 archivos, publicación final y consulta de versión, flags, bindings y secretos por nombre. No se cambiaron valores secretos.                                                                                                                                 |
| Guardas Node de producción/staging/build  | APROBADO                                               | 58 casos; incluye la separación de tipos y rechazo de paquete incorrecto, entorno cruzado, credenciales públicas y pérdida de redacción de queries.                                                                                                                      |
| Preflight comercial                       | BLOQUEANTE                                             | `configurationReady=false`, `commercialReady=false`. Faltan dominio, origen API/cargas, ruta custom y alineación SEO. El código 1 esperado se conserva: no se neutralizó la barrera para obtener verde.                                                                  |
| RLS/permisos alojados                     | APROBADO                                               | Once SELECT de auditoría por entorno; ejecutores restringidos, FORCE RLS en datos sensibles, RPC anónimas explícitas y esquemas/tablas privados cerrados.                                                                                                                |
| API pública alojada                       | APROBADO                                               | 55 lecturas y rechazos reales; incluyen propietarios, operaciones administrativas y CORS. Sin claves privilegiadas en navegador.                                                                                                                                         |
| Migraciones desarrollo                    | APROBADO                                               | 27 aplicadas. Hashes iguales a la ejecución SQL aislada previa de 684 aserciones; **no se ejecutaron otra vez esas 684 hoy**.                                                                                                                                            |
| Migraciones producción                    | BLOQUEANTE antes del cliente actual                    | 25 aplicadas. Faltan `20261105000100_query_media_lookup.sql` y `20261105000200_home_catalog_projection.sql`. El cliente nuevo necesita las RPC de la segunda: migraciones primero, frontend después, con autorización.                                                   |
| Dependencias                              | APROBADO para umbral alto/crítico; PENDIENTE moderados | Auditoría npm actual: cero altas/críticas y doce moderadas totales; dos de producción en ExcelJS/uuid según revisión vigente. No se usó `audit fix --force` ni se instalaron versiones incompatibles.                                                                    |
| Literales de credenciales en fuente       | APROBADO para el chequeo dirigido                      | 761 archivos inventariados; coincidencias revisadas eran fixtures de tests o su copia XML. `.env.local`, `.env.production.local` y `.dev.vars*` protegidos por Git ignore. No equivale a un escaneo completo de historial o pentest. No se imprimieron valores privados. |

### Compra, cuenta y administración

**APROBADO en staging real: 30 controles sobre servicios alojados**, más ocho
interacciones públicas de teclado/filtros/desconexión. Auth, PostgreSQL,
Workers y navegador fueron reales; **el pago continuó siendo simulado**.

- Registro ordinario por la UI, sesión inmediata sin correo, perfil cliente y
  separación de propietarios. No se usó el alta administrativa como sustituto
  de esta prueba de registro.
- Perfil/dirección privados y rechazo de coordenadas inválidas; GPS físico no
  ejercitado. Cliente B no obtiene los datos del cliente A.
- Generación y uso por UI del código de recuperación, rotación, rechazo de
  reutilización, contraseña/refresh anteriores invalidados y cambio de correo
  con contraseña actual. Código y contraseñas solo en memoria, sin capturas de
  recibos secretos; no se invocaron endpoints de correo.
- Administrador temporal con **TOTP real/AAL2**; anónimo, cliente y AAL1
  rechazados por SQL y Worker. La revocación del membership retiró permisos.
- Dos POST concurrentes con la misma operación generaron **un pedido simulado**
  pendiente con importes del servidor. Replay alterado, otro propietario y
  versión obsoleta rechazados; historial y reintento administrativo idempotentes.
- UI alojada del cliente en escritorio y móvil, y acceso administrativo con
  TOTP hasta el detalle del pedido temporal. Capturas de datos sintéticos revisadas.
- Catálogo público: salto al contenido con teclado, modal de búsqueda/Escape/
  retorno de foco, filtros móviles, cancelación del borrador, URL y retirada de
  chips. Desconexión **emulada en navegador contra staging real**: error seguro
  de consulta y recuperación al reconectar/reintentar sin recargar la página.

Los snapshots agregados del ensayo comercial verificaron:

| Dato en desarrollo    | Antes | Con pedido simulado | Tras limpieza |
| --------------------- | ----: | ------------------: | ------------: |
| Pedidos               |     0 |                   1 |             0 |
| Stock total           |    44 |                  44 |            44 |
| Productos / variantes | 1 / 2 |               1 / 2 |         1 / 2 |
| Cupones / usos        | 0 / 0 |               0 / 0 |         0 / 0 |

**Limpieza APROBADA:** cero usuarios, memberships, perfiles, direcciones, códigos
y pedidos de prueba restantes, tanto en el ensayo comercial como en el ensayo
adicional de Auth. Hubo un intento de harness con selector equivocado de una
dirección y una comprobación de limpieza que no interpretó un resultado SQL
intermedio: se conservaron los fallos, se verificaron los conteos finales por
SELECT y no se ocultaron como pasadas limpias.

**APROBADO en transporte aislado, no como pago real:** 161 casos distintos
de checkout (13), pedidos (17), Auth/cuenta/MFA (68), notificaciones (16) y
operación local (47). Cubren respuesta perdida, duplicados, stock/cupones,
descuentos, errores parciales, permisos, PDF, operaciones masivas de cien pedidos
y cinco tamaños. Un chequeo instantáneo tras resize falló inicialmente; el
mismo caso pasó tres repeticiones sin modificar el diseño. Se conservan la
primera traza y las repeticiones: 164 ejecuciones, 163 aprobadas y una fallida.

**BLOQUEANTE: Mercado Pago real.** No existen aquí transacciones reales,
webhooks de pago verificados, conciliación o consumo transaccional de
inventario/cupón por cobro. Las ramas “rechazado/aprobado” de fixtures no prueban
un banco o gateway. Un cambio de bandera no completa esa integración. No hay
cupones activos alojados en este ensayo: los casos de cupones del SDK/SQL son
aislados y debe verificarse la primera campaña real antes de usarla.

### Frontend, móvil, accesibilidad y rendimiento

| Área                           | Estado                                | Resultado                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive alojado             | APROBADO para la muestra              | 50 vistas reales en 1920 × 1080, 1366 × 768, 768 × 1024 y 390 × 844. Cero desbordamientos, imágenes rotas y excepciones JavaScript en esos recorridos. 50 capturas conservadas.                                                                                                                                                   |
| Teclado y errores de red       | APROBADO para los ocho controles      | Interacciones descritas arriba, sobre catálogo alojado; sin escrituras comerciales. El primer selector del harness confundía un eyebrow con un heading: se corrigió el ensayo, no la web.                                                                                                                                         |
| Lighthouse de catálogo móvil   | APROBADO automático                   | Accesibilidad 100 y buenas prácticas 100. SEO 69 por `noindex`, correcto para staging. No es certificación WCAG ni prueba de todas las pantallas.                                                                                                                                                                                 |
| Lighthouse de login escritorio | PENDIENTE contraste manual contextual | Accesibilidad 96, buenas prácticas 100; alerta sobre texto de “Ayuda”. CSS usa `mix-blend-mode:difference`: el cálculo automático del color base no evalúa por sí solo todos los fondos compuestos. No se afirma conformidad completa; comprobar fondos fotográficos, hover y foco antes de certificarla. No se alteró el diseño. |
| Móvil lento, arranque frío     | PENDIENTE optimización adicional      | Una traza de Home en staging, 390 × 844/DPR2, CPU ×4 y Slow 4G: LCP 6532 ms, TTFB 116 ms, CLS 0. El retraso principal fue descubrimiento/cadena de carga, 5820 ms. No es teléfono físico, p75, CrUX ni INP de campo. No se declara un rendimiento móvil óptimo.                                                                   |
| Escalabilidad administrativa   | PENDIENTE estructural                 | La UI pagina, pero catálogo/pedidos todavía hidratan páginas de cien al estado compartido hasta 10000. Las pruebas de cien pedidos no certifican tráfico concurrente de producción. Véase la auditoría de rendimiento.                                                                                                            |

### Workers, R2, PWA, SEO y privacidad

| Área                          | Estado                                         | Evidencia y límite                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separación staging/producción | APROBADO                                       | Proyectos, buckets, Worker, namespaces de límites y flags independientes; siete nombres secretos presentes por entorno. Producción permanece cerrada con 404 y la versión anterior.                                                                                                                                                    |
| R2                            | APROBADO técnico                               | Buckets privados, `r2.dev` y dominios directos desactivados. Cinco imágenes/quince variantes reales verificadas por el smoke de staging; 112 contratos aislados y runtime nativo de carga/entrega/Range/ETag/retirada. No se subieron fotos comerciales en esta ronda.                                                                 |
| Inventario R2                 | APROBADO para la muestra del proveedor         | Métrica agregada con retraso: desarrollo quince objetos/1.527.164 B; producción cero. No es historial, versionado ni copia independiente. El smoke no descubrió vídeos administrados: cero pruebas de vídeo alojado actual, aunque los contratos locales pasaron.                                                                      |
| Checkout Worker               | APROBADO aislado y simulación real descrita    | 35 contratos, además del ensayo real pendiente/idempotente; no cobros.                                                                                                                                                                                                                                                                 |
| PWA / Web Push                | APROBADO técnico; PENDIENTE físico             | 46 contratos/criptografía/runtime aislados y seis recursos alojados 200. Scope `/admin/`, sin caché privada o tokens en SW. No se envió una notificación real ni se instaló la PWA en Android/iPhone físicos.                                                                                                                          |
| SEO                           | APROBADO del mecanismo; BLOQUEANTE publicación | 26 casos Worker/SEO aislados; metadatos y páginas inexistentes controlados. Falta dominio/catálogo real. `noindex` no se retiró para mejorar una puntuación. Validar canonical, sitemap, robots, social cards y Search Console tras configurar el destino real.                                                                        |
| Analítica observada           | APROBADO para ausencia de carga en la muestra  | En Home/catálogo no se observaron scripts/peticiones GTM, GA4, Meta o beacon Cloudflare; `dataLayer`/`gtag` ausentes. No acredita inventario de todas las cuentas externas.                                                                                                                                                            |
| Analítica y consentimiento    | PENDIENTE                                      | Recursos Google no entregados; GTM/GA4 y gestor de preferencias aún no implementados. Sin rastreo opcional observado, no se inventó un banner ni IDs. Antes de activar medición, implementar consentimiento y validar rechazo/retirada, URLs saneadas y exclusión de áreas privadas. Nunca emitir `purchase` por el checkout simulado. |

## Respaldos: recuperación comprobada y límites

**APROBADO:** dos restauraciones nuevas, desde los archivos cifrados reales del
día, en PostgreSQL 17 local aislado. No se confundieron con fixtures SQL:

| Comprobación                                            |     Desarrollo |     Producción |
| ------------------------------------------------------- | -------------: | -------------: |
| Tablas / filas / claves foráneas                        | 68 / 2209 / 70 | 68 / 1990 / 70 |
| Hashes de datos, secuencias, RLS, RPC y rechazo anónimo |       APROBADO |       APROBADO |
| Archivos R2 recuperados con bytes íntegros              |             15 |              0 |
| Conexiones o escrituras remotas del restaurador         |              0 |              0 |

Clústeres detenidos, payload claro retirado y copias cifradas conservadas.
Guardas de respaldos: 41/41. La tarea Windows está habilitada y su último
resultado es 0. Está configurada a las 02:00 de Lima; hoy empezó a las 10:07
cuando el equipo/sesión estuvieron disponibles. No garantiza un RPO de 24 h
si el equipo no está disponible.

**PENDIENTE externo / condición para garantizar recuperación completa:**
el proveedor devolvió cero backups disponibles y PITR desactivado. La CLI no
acredita si el plan contratado es Free o Pro: confirmarlo en Billing y aplicar
el plan acordado. No se encontró otro bucket Aroma de archivo independiente.
La copia DPAPI depende del mismo perfil/PC; no demuestra supervivencia a su
pérdida. Faltan custodia externa de configuración/secretos, restauración alojada
de Auth/MFA y SQL, reposición de objetos en un bucket aislado y RPO/RTO acordados.
**No retirar las protecciones locales** hasta verificar esa transición.

## Bloqueos reales y acciones del titular

SELECT de producción del 6 de noviembre: **cero productos, variantes, pedidos
y cupones; `demonstration=true`**. Un administrador activo y **cero factores
TOTP verificados**. No se introdujeron datos sintéticos para llenar ese entorno.

| Acción                                                      | Estado                                                      | Responsable / requisito                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmar dominio HTTPS definitivo y acceso DNS de la marca | BLOQUEANTE                                                  | Titular. Después configurar ruta Cloudflare, orígenes de cargas/funciones, Auth URL/redirects y variables SEO concordantes.                                                                                                |
| Integrar Mercado Pago real y ensayar sandbox                | BLOQUEANTE                                                  | Titular crea/aprueba aplicación y acceso; desarrollo implementa backend, webhook validado, idempotencia, conciliación y stock/cupón transaccionales. Credenciales solo por canales protegidos, no en chat ni `VITE_`.      |
| Autorizar actualización de producción                       | BLOQUEANTE para el cliente nuevo                            | Aplicar las dos migraciones pendientes primero, comprobar RPC y permisos, después publicar el build correcto. Conservar rollback de código; no asumir que revierte SQL/R2. No ejecutado aquí.                              |
| Cargar catálogo, fotos y condiciones verdaderas             | BLOQUEANTE                                                  | Titular/admin. Precios, stock, presentaciones, autenticidad, tarifas/plazos, WhatsApp, datos legales, horarios y políticas definitivos; sustituir demostración y material provisional. No activar `CATALOG_IS_REAL` antes. |
| Completar MFA del administrador de producción               | BLOQUEANTE operativo                                        | Titular con su contraseña y app autenticadora, desde endpoint HTTPS de producción autorizado. No copiar contraseña/factor de desarrollo; sin SMTP.                                                                         |
| Verificar respaldo independiente acordado                   | PENDIENTE externo; no acreditar DR completo hasta aprobarlo | Titular activa/confirma servicios y custodia; realizar ensayo autorizado en destino aislado, documentar RPO/RTO y mantener copia local mientras tanto.                                                                     |
| Entregar recursos Google y decisión de medición             | PENDIENTE                                                   | Usar cuenta de la marca; confirmar inventario para evitar duplicados, entregar IDs públicos `G-…` / `GTM-…` y accesos por invitación. Después implementar y probar consentimiento. Meta continúa desactivado.              |
| Pruebas en dispositivos físicos                             | PENDIENTE                                                   | Instalación PWA, recepción push en segundo plano/cerrada, denegación/revocación y GPS real en Android/iPhone; completar antes de prometer esas funciones operativas.                                                       |
| Contraste contextual y arranque móvil                       | PENDIENTE técnico                                           | Revisión manual del control Ayuda y mejora medida de la cadena fría sin cambiar la composición aprobada; medición de campo tras publicación.                                                                               |

## Checklist de lanzamiento

En la actualización autorizada de producción debe comprobarse también que la
API de Cloudflare devuelva `redact_query_string=true`; preparar el archivo local
no cambia la configuración del Worker ya desplegado.

| Orden | Control                                                                                         | Estado                    |
| ----: | ----------------------------------------------------------------------------------------------- | ------------------------- |
|     1 | Código, tipos, lint, build de producción, sello y paquete verificables                          | APROBADO                  |
|     2 | Entornos separados y producción cerrada durante preparación                                     | APROBADO                  |
|     3 | RLS/roles/MFA, propiedad, errores e idempotencia dentro de los alcances probados                | APROBADO                  |
|     4 | Flujo real de staging y retirada verificada de todos sus datos temporales                       | APROBADO                  |
|     5 | Recuperación real local de copias cifradas y medios declarados                                  | APROBADO                  |
|     6 | Dominio, TLS, orígenes/redirects y metadatos definitivos                                        | BLOQUEANTE                |
|     7 | Mercado Pago sandbox, webhook, estados/stock/cupón; luego activación comercial autorizada       | BLOQUEANTE                |
|     8 | MFA del titular y catálogo/contenido comercial verdadero en producción                          | BLOQUEANTE                |
|     9 | Migraciones y despliegue de producción autorizados, en orden y con verificación                 | BLOQUEANTE                |
|    10 | Protección independiente y ensayo completo de recuperación/RPO/RTO                              | PENDIENTE                 |
|    11 | Dispositivos físicos, contraste y rendimiento móvil de campo                                    | PENDIENTE                 |
|    12 | GTM/GA4 y consentimiento si se activará medición                                                | PENDIENTE                 |
|    13 | Último recorrido de producción autorizado con servicios de prueba antes de abrir tráfico/cobros | PENDIENTE, depende de 6–9 |
|    14 | Activar indexación y verificar robots/canonical/sitemap solo con contenido aprobado             | PENDIENTE, después de 6–9 |

No se ofrece una certificación de cumplimiento legal, WCAG, pentest o capacidad
de carga. No hubo una prueba de pago real, notificación física ni restauración
sobre un proyecto/bucket alojado. Las casillas pendientes no deben convertirse
en aprobadas por cambiar banderas o copiar un resultado de un simulador.

## Evidencia y reproducción

Directorio: `artifacts/launch-audit-2026-11-06/`, fuera del bundle web y de Git.

- `production-build-final.log`, `production-package-final.log`, `typecheck.log`,
  `lint-final.log`, `node-guards-final.log`, `production-preflight.json`.
- `staging-deploy-final.log`, `infra-hosted-final-result.json`,
  `infra-production-commerce-result.json`, `staging-smoke-final.json`.
- `journeys-report.md`, `journeys-summary.json`, `journeys-hosted-result.json`,
  `journeys-hosted-auth-result.json`, `hosted-interactions-result.json`.
- `infra-report.md`, `infra-hosted-result.json`, `infra-storage-result.json`,
  `infra-admin-mfa-result.json`; evidencia histórica y final separadas.
- `backup-report.md`, `backup-task.json`, `backup-*-fresh-restore.json`.
- `hosted-public/result.json` y 50 capturas; Lighthouse JSON conservados y
  resumen de la traza móvil en `frontend-observations.json`.
- `source-secrets-result.json`, `dependency-audit-all.json`, `result.json`.

Las suites y subauditorías pueden compartir contratos: **no sumar sus cantidades
como un número global de casos únicos**. Se conservan fallos ambientales,
selectores corregidos y repeticiones. Los secretos, contraseñas y códigos reales
de recuperación/TOTP no forman parte de los informes.

Referencias oficiales de método:
[Wrangler y contexto de custom builds](https://developers.cloudflare.com/workers/wrangler/custom-builds/#wrangler_command-environment-variable),
[redacción de URLs en observabilidad](https://developers.cloudflare.com/api/typescript/resources/workers/subresources/beta/subresources/workers/methods/edit/),
[preparación de Supabase](https://supabase.com/docs/guides/deployment/going-into-prod).
Las recomendaciones generales de correo del proveedor no sustituyen la decisión
del proyecto: se conservó recuperación por código, sin SMTP ni Resend.
