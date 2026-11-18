# Paginación administrativa y latencia de navegación — 15 de noviembre de 2026

La paginación remota de Productos, Pedidos y Clientes está implementada y
desplegada en **staging**. Se corrigió además una carrera de inicialización de
Auth que podía provocar tres lecturas del listado al entrar al panel.

La ganancia demostrada es de escalabilidad: ya no se reconstruyen miles de
documentos para mostrar una página. **No se demuestra una mejora general de
LCP público ni la eliminación del incidente histórico de 15,9 segundos.**
Las comparativas siguientes incluyen las regresiones observadas.

## Entorno y comprobación del despliegue

| Elemento | Estado final comprobado |
| --- | --- |
| Entorno | Staging; producción sin cambios |
| Worker | `aroma-infini-frontend-staging` |
| Versión activa, 100 % del tráfico | `27a0a2ff-019b-48bf-9c5a-599eb8fd4db5` |
| Despliegue | `9036d55b-06cc-4dec-8231-674191a6cb15` |
| Referencia anterior | `700c39a5-be65-446c-bb2a-c975e67a185c` |
| Supabase | `aroma-infini-dev`, proyecto `tkxvexfapszilzhogvgu` |
| Migraciones remotas | 41 aplicadas; ninguna pendiente en desarrollo |
| Migración de esta entrega | `20261114000100_admin_workspace_pagination.sql` |
| R2 | `aroma-infini-media-dev`, privado; URL `r2.dev` devuelve 401 |
| Paquete validado, SHA-256 | `db738355446869ba08d91c594d03e76aef523cdea46f4627249ec800cbfe4660` |

Se verificaron los hashes de doce archivos JS/CSS servidos realmente, el
entorno, la configuración del Worker y el esquema antes de cerrar las
mediciones. No basta con haber ejecutado un build local.

Los cuarenta registros históricos de migraciones conservan sus hashes.
La nueva migración añade funciones y permisos de ejecución explícitos;
no añade índices ni tablas, ni cambia RLS, precios, stock o datos comerciales.
Las comparaciones remotas de datos conservaron un producto, dos variantes,
cero pedidos y cero cupones. Las identidades QA creadas para Auth/TOTP se
retiraron al terminar; no se registraron compras ni pagos.

Evidencias locales: `verified-final.json`, `versions-finish.json`,
`after-remote.json`, `candidate-upload.json`, `hosted-reads.json` y
`admin-browser.json`, dentro de
`artifacts/scaling-latency-2026-11-14/`.

## Qué se corrigió

### Lecturas administrativas acotadas

Antes, los adaptadores recorrían páginas de cien registros y reconstruían
colecciones completas, hasta diez mil registros. La paginación visual se
aplicaba después en el navegador.

Ahora:

- **Productos:** `admin_product_list` filtra, ordena y pagina en SQL. Devuelve
  doce productos en escritorio o cuatro en móvil, el total filtrado y los
  contadores globales. El editor obtiene un producto; la cola de fotografías
  solicita los identificadores que necesita y carga una ficha cada vez.
- **Pedidos:** `admin_order_list` devuelve veinte encabezados y los totales.
  Los artículos, imágenes e historial se recuperan al abrir el detalle o
  preparar documentos. «Seleccionar todos los filtrados» recupera únicamente
  los encabezados de selección necesarios, con el límite existente de diez
  mil, sin descargar todas las fichas completas.
- **Clientes:** `admin_customer_list` devuelve veinticinco filas y conserva la
  búsqueda y los enlaces a pedidos. Los agregados siguen respetando la
  exclusión existente de pedidos exclusivamente simulados.
- **Resumen:** obtiene agregados globales, cinco alertas y cuatro pedidos
  recientes; no necesita todas las fichas del catálogo y los pedidos.

Los candidatos se filtran antes de construir los documentos completos.
Inventario y documentos se resuelven por conjuntos; los documentos de
productos se construyen únicamente para los IDs de la página solicitada.
Se mantiene la representación canónica de variantes, medios y promociones.

### Escrituras, selección y coherencia

`admin_save_product_page` y `admin_set_order_statuses_page` envuelven los
comandos existentes y devuelven la página actualizada en la misma
transacción. Así se evita anunciar un error de guardado porque falle una
segunda consulta independiente después de una escritura ya confirmada.

La selección de pedidos se conserva entre páginas del mismo usuario y
filtro. Continúan la comprobación de versiones, la idempotencia, los errores
por pedido y las transiciones válidas. El límite SQL existente de **cien
pedidos por cambio de estado** se respeta también en el cliente: una
selección de 101 no genera una escritura ni pierde la selección. No se
fragmenta silenciosamente una acción en múltiples escrituras.

Se descartan respuestas anteriores a una escritura, a otra recarga o a un
cambio de usuario/permisos. Se agrupan las recargas coincidentes por foco.
Una página parcial no se introduce en el almacén compartido como si fuese
el catálogo completo. No se ha añadido una caché privada global con TTL.

### Carrera de Auth demostrada

Un evento de almacenamiento o `INITIAL_SESSION` podía sustituir una
verificación mientras `initialize()` esperaba la anterior. La ruta observaba
un estado transitorio, pasaba por login y volvía al panel; en StrictMode esto
podía producir **tres consultas iniciales**.

La inicialización espera ahora la verificación vigente, incluidas las
sustituciones pendientes. Una prueba determinista controla dos respuestas
de identidad y el evento de almacenamiento. El caso de tres mil productos
confirma **una sola consulta de listado**, sin retirar comprobaciones de
identidad, MFA o membresía.

### Seguridad y tipos

Las RPC nuevas conservan ejecutores sin login, `search_path` vacío,
comprobación administrativa y MFA. Se deniega ejecución anónima y al rol
`service_role` de estas RPC de navegador. Se verificaron revocación, AAL1,
aislamiento entre usuarios y ausencia de acceso directo a tablas privadas.

Los tipos TypeScript se regeneraron mediante la CLI oficial desde el esquema
alojado: el archivo coincide byte a byte con esa salida. La comprobación
semántica cubre 175 funciones, 48 tablas y 398 columnas, con seis controles
negativos del comparador. Las diferencias de formato del generador SQL local
se documentaron por separado; no se confundieron con deriva del esquema.

## Comparativa con volumen representativo

PostgreSQL nativo aislado, tres ejecuciones por alternativa y medianas.
Fixtures de tres mil productos, seis mil variantes, seis mil pedidos
simulados y dos mil usuarios de prueba; no se introdujeron en Supabase
alojado. La prueba revierte o retira sus datos al finalizar.

| Trabajo | Antes | Después |
| --- | ---: | ---: |
| Productos: llamadas / documentos recibidos | 30 / 3.000 | 1 / 12 |
| Productos: tiempo SQL total | 735,0 ms | 33,6 ms |
| Productos: tamaño JSON de resultados | 3.572.019 B | 14.630 B |
| Pedidos: llamadas / documentos recibidos | 60 / 6.000 | 1 / 20 |
| Pedidos: tiempo SQL total | 1.255,6 ms | 39,3 ms |
| Pedidos: tamaño JSON de resultados | 6.783.000 B | 22.799 B |

Reducción observada de trabajo SQL: **95,4 % en productos y 96,9 % en
pedidos**. Los tamaños son JSONB convertido a texto, no bytes comprimidos
transferidos por HTTP. El bucle SQL de referencia es secuencial; no se
presenta como el tiempo que tardaría el navegador con sus solicitudes
concurrentes. Se comprobaron equivalencia de documentos, conteos, filtros,
búsqueda por SKU, fechas de Lima, permisos y operaciones concurrentes.

Evidencias: `workspace-performance.json`, `comparison.json` y
`artifacts/supabase-sql-tests/run-0viASq/result.json`.

## Mediciones con los servicios reales

### HTTP y carga del administrador

Se realizaron 32 lecturas alojadas con Auth/TOTP real, incluyendo denegaciones
de AAL1 y membresía revocada. Con el catálogo actual de un producto, cinco
lecturas por alternativa dieron:

| RPC | Mediana total HTTP |
| --- | ---: |
| Catálogo completo anterior | 133,7 ms |
| Página nueva de productos | 147,7 ms |
| Pedidos anteriores, vacíos | 135,9 ms |
| Página nueva de pedidos, vacía y con contadores | 133,0 ms |
| Página de clientes | 129,9 ms |

**No se afirma que el SQL nuevo acelere el catálogo alojado pequeño.** Aquí
domina la comunicación HTTP. La ventaja con miles de registros se demostró
en PostgreSQL aislado; no se generó carga masiva contra el proveedor.

También se midieron 120 cargas completas: cinco destinos, tres perfiles,
dos muestras, dos condiciones de caché y ambas versiones. Los brazos usan
la misma interceptación de selección de versión; son una comparación de
laboratorio con los servicios reales, separada de las cohortes públicas
sin interceptación.

| Destino, carga fría | Escritorio antes → después | Móvil lento antes → después |
| --- | ---: | ---: |
| Productos | 1.300 → 1.248 ms | 4.194 → 3.792 ms |
| Pedidos | 1.255 → 1.203 ms | 4.197 → 3.705 ms |
| Clientes | 1.296 → 1.188 ms | 4.184 → 3.708 ms |
| Editar producto | 1.239 → 1.265 ms | 3.821 → 3.855 ms |
| Resumen | 1.301 → 1.219 ms | 3.687 → 3.703 ms |

Son dos muestras por celda; estas diferencias pequeñas no permiten atribuir
causalmente cada mejora al código. Las cargas calientes completas de
escritorio permanecieron alrededor de 960–995 ms.

### Regresión que no debe ocultarse: navegación SPA caliente

Se probaron trece destinos por versión y perfil, 78 cambios de sección:
Productos, Pedidos, Clientes, Promociones, Marcas, Familias, Envíos, Home,
Biblioteca, Configuración, Notificaciones, Reclamaciones y Resumen.

| Perfil | Mediana anterior | Mediana nueva |
| --- | ---: | ---: |
| Escritorio | 138 ms | 345 ms |
| Móvil | 504 ms | 551 ms |
| Móvil lento | 591 ms | 736 ms |

En el catálogo pequeño, reutilizar una instantánea completa previamente
cargada era más rápido que realizar una lectura remota actual. La nueva
paginación conserva frescura y escala, pero **no hace instantáneas todas
las navegaciones calientes**. El máximo nuevo fue 1.805 ms en móvil lento.
Los trece destinos son heterogéneos y cada uno tiene una muestra por brazo;
estas medianas no son percentiles de producción de una misma ruta.

No se oculta la regresión con datos privados caducados, timeouts mayores o
reintentos. Una política adicional de reutilización necesitaría un contrato
explícito de vigencia e invalidación y una nueva comparación controlada.

## Investigación del incidente de 15,9 segundos

El valor histórico medía desde el inicio de navegación hasta confirmar la
imagen lista. **No eran 15,9 segundos de CPU decodificando WebP.** La imagen
se detectaba en el DOM a los 15.808 ms y se confirmaba lista 97 ms después.
El documento tenía aproximadamente ocho segundos de TTFB y siete segundos
anteriores a `sslStart`; faltan NetLog y protocolo de aquella navegación.

Se recogieron 36 visitas de ficha por versión, con doce procesos nuevos de
Chrome por versión, conexiones nuevas/reutilizadas y caché fría/caliente.
Además se hicieron 24 visitas alternando HTTP/3 y HTTP/2. El pico de 15,9
segundos no reapareció, pero eso **no demuestra su eliminación ni su causa**.
Forzar HTTP/2 no aportó una ventaja estable y se descartó.

Sí se capturó otro retraso concreto: CF-Ray `a5af27e3d9890310-GRU`.
NetLog sitúa **1.026 ms en resolución DNS antes de iniciar QUIC**. HTTPS y
AAAA respondieron pronto; la consulta A tardó y un segundo intento obtuvo
respuesta válida. El TTFB fue 1.445 ms; el Worker registró contexto de
catálogo de 71 ms y contexto público de 27 ms. Esto identifica el tramo
DNS de esa muestra, sin demostrar qué resolver, ISP o servicio lo causó.
No se alteró DNS del equipo, IPv6, protocolos o configuración de producción.

La nueva cabecera de diagnóstico `X-Aroma-Public-Reads`, **solo en staging**,
permite correlacionar lecturas públicas hijas sin esperarlas ni consumir sus
cuerpos. No incluye claves, cookies, datos privados, SQL ni URLs y se limita
a ocho entradas. Las lecturas del contexto SEO de producto fuera de este
transporte todavía no tienen todas esa correlación; no se declara cobertura
completa de cada operación del documento.

En la cohorte final se correlacionaron exactamente **64 solicitudes distintas
de manifiesto** y 118 lecturas hijas del documento con registros del proveedor:

| Tramo multimedia | Mediana | Máximo |
| --- | ---: | ---: |
| Navegador hasta cabeceras | 144,8 ms | 267,4 ms |
| HTTP Worker → manifiesto | 19 ms | 98 ms |
| Lectura de bytes / almacenamiento | 5 ms | 26 ms |
| Upstream Envoy | 2 ms | 18 ms |
| Origen registrado por el proveedor | 9 ms | 87 ms |

Hubo 96 observaciones de recursos, incluidas cabeceras reutilizadas por el
navegador; no son 96 consultas distintas. Las 64 verificadas fueron HIT de
caché de bytes. **Caché fría del navegador no significa MISS en el edge.**
Una comprobación HEAD adicional conservó un valor `media_storage` de 473 ms;
no se concluye que todo acceso a almacenamiento tarde cinco milisegundos.

El antiguo segundo de upstream tampoco queda explicado por estas respuestas
rápidas. Una consulta oficial de observabilidad del Worker devolvió 403 por
falta de permisos. Continúan pendientes la traza distribuida interna y los
tiempos de cola/conexión/ejecución de PostgREST del incidente. No se atribuyen
a PostgreSQL o al pool sin esa evidencia. El paquete para soporte anterior
se conserva en [SUPABASE_UPSTREAM_SUPPORT_2026_11_14.md](SUPABASE_UPSTREAM_SUPPORT_2026_11_14.md).

Análisis detallado, protocolos y experimentos:
[CONNECTION_LATENCY_EVIDENCE_2026_11_15.md](CONNECTION_LATENCY_EVIDENCE_2026_11_15.md).

## Frontend público y móviles: resultados y alternativas rechazadas

Home y Tienda tuvieron 36 visitas por versión; la ficha, otras 36 por
versión. Sin interceptación Fetch ni cabeceras de selección de versión.
Perfiles: escritorio, móvil con CPU ×4 y 9 Mbps/80 ms, móvil con CPU ×4 y
1,6 Mbps/150 ms. Se conservaron muestras lentas, NetLogs, trazas y capturas.

| LCP, móvil lento | Frío antes → después | Caliente antes → después |
| --- | ---: | ---: |
| Home | 3.140 → 3.360 ms | 548 → 524 ms |
| Tienda | 3.184 → 3.416 ms | 432 → 496 ms |
| Ficha | 3.192 → 3.284 ms | 448 → 480 ms |

La fotografía de la ficha estuvo lista a los 3.242 → 3.365 ms en frío.
En móvil el logo podía ser el último candidato LCP; se conservan ambas
métricas para no confundir LCP con disponibilidad de la fotografía.

**No hay mejora pública demostrada en esta entrega.** La cohorte candidata
incluye demoras DNS de alrededor de un segundo, variaciones de contexto
upstream y diferencias de POP SCL/GRU. No es válido adjudicar toda diferencia
al código administrativo ni filtrar esas muestras para presentar una mejora.

La traza lenta de referencia muestra CSS terminado a 2.123 ms, WebP a
2.312 ms y el último módulo necesario a 3.135 ms. La imagen aparece en DOM a
3.335 ms. Existe una cascada de módulos, pero dos experimentos controlados
de `modulepreload` no justificaron modificarla:

- Un solo hint de ProductPage: fotografía móvil 3.216 → 3.197 ms; escritorio
  545 → 559 ms. No disminuyó el bloqueo.
- Grafo exacto de tres módulos: móvil 3.217 → 3.123 ms, ganancia aproximada
  del 3 %; escritorio 537 → 543 ms, con pares que empeoraron.

Cada experimento comparó dieciocho navegaciones ABBA. Se descartaron ambos;
no se incorporaron nuevas precargas, fragmentaciones, cambios CSS, reducción
de calidad o eliminación de animaciones. La suma observada de bloqueo por
encima de 50 ms tampoco mejoró de forma estable. No hay INP de campo; los
long tasks de laboratorio no se presentan como INP real.

Home y Tienda mantuvieron CLS 0 en las cohortes medidas. Las comprobaciones
funcionales en cinco tamaños no detectaron desbordamientos ni solicitudes
de vídeo en móvil. No se cambió el diseño aprobado.

## Pruebas ejecutadas

| Grupo | Resultado final |
| --- | --- |
| TypeScript, ESLint, build de staging, empaquetado Wrangler | Aprobados |
| Pruebas Node aisladas | 198 aprobadas |
| PostgreSQL nativo: 41 migraciones, concurrencia y seguridad | 965 comprobaciones aprobadas |
| Catálogo con SDK / transporte aislado | 88 aprobadas |
| Pedidos y clientes con SDK / transporte aislado | 27 aprobadas |
| Auth, MFA y carreras de sesión | 82 aprobadas |
| Fotos, galería y vistas previas | 62 aprobadas |
| Checkout / configuración comercial | 24 / 18 aprobadas |
| SEO, documento y Worker | 58 aprobadas |
| Medios y Worker aislados | 147 aprobadas |
| UI administrativa y estados | 88 aprobadas |
| Reseñas / regla de vídeo móvil | 15 / 15 aprobadas |
| Servicios alojados | 32 lecturas reales; datos comerciales conservados |
| Navegador administrativo alojado | 120 cargas y 78 cambios de sección con Auth/TOTP reales |
| Recorrido público alojado | Catálogo, filtros, búsqueda, favoritos, variantes, carrito y cotización; sin crear pedido |
| Seguridad HTTP alojada | 9 comprobaciones: privados/variantes inválidas, anónimo, R2, ETag/HEAD/304 |

Las suites pueden compartir casos; no se suman como una cantidad de pruebas
únicas. Los resultados finales no tienen fallos, omisiones o reintentos en
esas suites. Se preservaron intentos anteriores fallidos y sus artefactos;
no se presentan como aprobados ni se afirma haber repetido toda la matriz
histórica de más de mil pruebas.

Las pruebas masivas, escrituras, errores parciales, conflictos e idempotencia
se ejercitaron en PostgreSQL nativo y transportes aislados. Las pruebas
alojadas fueron lecturas y actividad de la identidad QA propia. No se afirma
haber actualizado cien pedidos comerciales reales ni probado cobros.
El entorno mantiene las restricciones actuales de checkout simulado; tampoco
se certifica aquí un proceso de pago comercial o reserva real de inventario.

Resoluciones reales de navegador: 1920 × 1080, 1440 × 900, 1366 × 768,
768 × 1024 y 390 × 844. Son emulaciones de Chrome, no cinco dispositivos
físicos. Las dos capturas de Productos de escritorio comparadas tienen el
mismo SHA-256: `261b9844453a7ae6fb6cc4d63cd8faa64cd27ede4f3010e8f80fd38351415dd8`.

Capturas:

- [Productos antes](../artifacts/scaling-latency-2026-11-14/screens/admin-baseline-desktop-products.png)
  y [después](../artifacts/scaling-latency-2026-11-14/screens/admin-candidate-desktop-products.png).
- [Productos móvil](../artifacts/scaling-latency-2026-11-14/screens/admin-candidate-mobile-products.png).
- [Ficha móvil](../artifacts/scaling-latency-2026-11-14/screens/final-product-390.png)
  y [ficha laptop](../artifacts/scaling-latency-2026-11-14/screens/final-product-1366.png).
- [Checkout tablet](../artifacts/scaling-latency-2026-11-14/screens/final-checkout-768.png).

## Límites y trabajo posterior identificado

| Estado | Punto |
| --- | --- |
| APROBADO | Páginas remotas de Productos, Pedidos y Clientes; conteos, filtros, selección y escrituras coherentes |
| APROBADO | Migración y frontend realmente sincronizados en desarrollo/staging; tipos oficiales y datos conservados |
| APROBADO | R2 privado, validación de manifiestos, caché segura de bytes y controles de Auth/MFA preservados |
| PENDIENTE | Causa interna del incidente histórico de conexión y del antiguo pico Envoy; requiere telemetría del mismo incidente |
| PENDIENTE | LCP público frío móvil de unos 3,3–3,4 s; experimentos actuales insuficientes para adoptar otra arquitectura |
| PENDIENTE | Reutilización segura de páginas administrativas que mejore navegación caliente sin perder vigencia o aislamiento |
| PENDIENTE | Algunos consumidores de Marcas/Familias/Ofertas/Home y selectores mantienen el contrato previo de colección completa |
| PENDIENTE | Validación Excel y selector avanzado de recomendaciones todavía requieren explícitamente la colección completa para sus reglas actuales |

No se certifica que todos los módulos administrativos estén ya paginados.
Los contratos completos conservados se solicitan por su función concreta;
no se han eliminado validaciones para reducir artificialmente trabajo.
El listado de Clientes real está vacío bajo las reglas comerciales actuales;
su paginación se validó con fixtures, no con una cartera alojada real.

No se modificaron producción, dominio, pagos, SMTP ni credenciales. No se
hizo commit, push, cambio de rama ni limpieza destructiva. Se conservaron
los 139 archivos de trabajo iniciales auditados; 119 mantuvieron sus bytes
y veinte recibieron cambios de esta fase. Los estilos, `index.html`,
`package.json` y configuración Vite presentes en esa instantánea conservaron
sus bytes. También existen archivos nuevos y archivos antes limpios
modificados; esos recuentos no equivalen al total del diff contra Git.

El manifiesto final reproducible es
`artifacts/scaling-latency-2026-11-14/result.json`. Los artefactos de navegador
y NetLog se mantienen localmente y deben revisarse antes de compartirlos con
un proveedor; no se publicaron en el repositorio.
