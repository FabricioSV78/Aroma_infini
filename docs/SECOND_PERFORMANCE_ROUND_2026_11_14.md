# Segunda ronda de rendimiento — Aroma Infini

14 de noviembre de 2026. Desarrollo y staging únicamente.

## Resultado y límites

Se implementaron cuatro mejoras verificables: estado inmediato de carga/error en la galería, reutilización de imágenes entre miniaturas y vistas grandes, consulta de reseñas solo al abrirlas y carga diferida de la ficha completa utilizada como vista previa administrativa.

La ficha de escritorio pasó de **ocho a cuatro solicitudes multimedia iniciales** en la prueba alternada; su transferencia multimedia P50 pasó de **601.065 a 437.316 bytes**, incluidos encabezados. Se elimina una consulta de reseñas al entrar y una descarga adicional de la foto original cuando aparece el aviso inferior. El formulario de edición transfiere aproximadamente **88 KB de JavaScript**, frente a 99–106 KB del control según el perfil.

**No se demostró una mejora uniforme del tiempo de aparición de la fotografía ni del arranque público.** Las medianas de decodificación mejoraron en la prueba alternada, pero el filmstrip mostró resultados mixtos. Se conserva expresamente una carga atípica de 15,9 segundos. Las mejoras retenidas tienen beneficios estructurales de solicitudes, transferencia y manejo de espera; no se presentan como solución de todos los picos de conexión.

Producción no se modificó. No hubo commit, push, cambio de rama, dependencias nuevas, migraciones remotas nuevas ni cambios en RLS, Auth/MFA, precios, descuentos, stock o checkout.

## 1. Entorno comprobado y preservación del trabajo

| Elemento | Verificación |
|---|---|
| Rama / HEAD | `develop` / `7d2f3648e3b149023910a385bf9510f0ebf60d10`, conservados |
| Worker | `aroma-infini-frontend-staging` |
| Supabase | `tkxvexfapszilzhogvgu`, desarrollo |
| R2 | `aroma-infini-media-dev`, privado |
| Migraciones | 40 aplicadas, cero pendientes; historial igual antes y después |
| Índices | 120: 92 en `app`, 28 en `private`; ninguno añadido o eliminado |
| Catálogo utilizado | Un producto existente, dos presentaciones, cero pedidos |
| Estado comercial | Mercado Pago simulado; ninguna compra ni cobro realizado |

El repositorio tenía numerosos cambios previos. Se guardaron el estado inicial y copias de los archivos intervenidos en `artifacts/second-round-2026-11-14/original/`; no se restauró el árbol contra Git ni se eliminaron archivos preexistentes. Se comprobaron hashes sin cambios de los servicios administrativos de catálogo y pedidos, los loaders administrativos y `vite.config.ts`. La corrección previa de la extensión `.ts` en Vite permanece intacta.

## 2. Problemas, causas y cambios implementados

| Problema comprobado | Causa | Solución retenida / evidencia |
|---|---|---|
| Espacio visual vacío mientras llega la foto | El marco reservaba tamaño, pero no indicaba carga o fallo | Placeholder en el mismo marco desde el primer montaje; se retira tras `decode()`. Estado de error accesible sin icono de imagen rota |
| Dos variantes de cada foto en escritorio | Miniatura de 480 px y vista de 960 px pedían bytes y validaciones independientes | Ambas utilizan el candidato responsive que ya necesita la galería; ocho GET iniciales pasan a cuatro |
| Consulta de reseñas aunque estén cerradas | Componente montado dentro de un panel oculto | Montaje al primer acceso desde enlace o botón; permanece montado al cerrar, conservando contenido y formulario |
| Otra descarga al mostrar el aviso del producto | El aviso utilizaba la referencia original sin `srcset` de galería | Usa el candidato ya descargado por la galería; se verificó igualdad de `currentSrc` en los tres perfiles |
| Código público de ficha dentro del formulario administrativo inicial | Import estático de la vista previa completa | `React.lazy` y `Suspense` dentro del modal existente; precarga de código por intención en el formulario, sin consultar datos por esa precarga |

No se han agregado `React.memo`, cachés ni nuevas divisiones públicas por intuición. Se conservaron las precargas verificadas del Hero/ficha, la fragmentación pública existente, las prioridades de la foto principal y los controles de la galería.

### Galería y estados de carga

El marco conserva sus dimensiones, proporciones, encuadre y transiciones. La foto principal sigue con `loading="eager"`, `fetchPriority="high"` y `decoding="async"`; las secundarias conservan carga nativa diferida y prioridad baja hasta seleccionarlas. Se mantienen los cuatro espacios, el desplazamiento móvil, el cambio por teclado y las transiciones existentes de 900/560 ms.

El placeholder se crea en la misma actualización DOM que la foto: diferencia observada de **0 ms** en las quince entradas frías del candidato de la prueba alternada. Esto es presencia DOM, **no una afirmación de pintura instantánea desde el inicio de la navegación**. Una conexión que aún no entrega HTML/JavaScript puede retrasar ambos. CLS observado en estas muestras: **0**.

Se comprueban carga, error, imágenes completadas desde caché y finalización de `decode()`. Los callbacks se retiran al desmontar y las decodificaciones anteriores no pueden reemplazar el estado de un candidato responsive más reciente. Si el archivo falla, permanece el marco con «Imagen no disponible»; el carrito y los controles siguen utilizables.

No se añadió una preview remota de baja resolución: habría supuesto otra descarga de 480 px y otra validación del manifiesto. Se eligió una indicación local discreta y la reutilización de la variante correcta ya existente.

### Dimensiones, formato y calidad reales

Las cinco imágenes del producto, incluida la olfativa, son WebP con fuente **1003 × 1254 px** y variantes reales **480 × 600**, **960 × 1200** y **1003 × 1254**. No son fuentes de 1600 px. Se corrigió esa dimensión documental en el informe anterior a partir de sus propias rutas registradas, sin cambiar sus resultados.

| Imagen existente | 480 px | 960 px | Original 1003 px |
|---|---:|---:|---:|
| Galería 1 | 27.666 B | 63.730 B | 74.840 B |
| Galería 2 | 52.006 B | 142.944 B | 173.268 B |
| Galería 3 | 41.870 B | 123.648 B | 163.730 B |
| Galería 4 | 39.094 B | 103.826 B | 131.426 B |
| Perfil olfativo | 54.408 B | 150.636 B | 184.072 B |

Se respetan `srcset`, `sizes`, DPR y los derivados disponibles. No se recomprimió, sustituyó ni eliminó ningún original; las miniaturas ahora reutilizan una foto más nítida que ya se necesitaba. La foto del aviso pasa de la referencia de 1003 px al candidato de galería, sin cambiar su tamaño visual.

## 3. Auditoría de tienda, administración, SQL y caché

Se revisaron Home, catálogo, búsquedas, filtros, ordenamiento, marcas, ficha, recomendaciones, favoritos, carrito y checkout. Se recorrieron trece destinos administrativos por perfil: productos, pedidos, clientes, promociones, marcas, familias olfativas, envíos, Home, biblioteca, configuración, notificaciones, reclamaciones y dashboard. También se midieron entradas completas a dashboard, productos y edición, con recarga caliente.

Los servicios ya coordinan consultas en curso, separan el contenido editorial del catálogo, verifican propietario y versión de sesión, invalidan lecturas tras escrituras y conservan la revalidación comercial. Se mantuvieron esas garantías. No se agregó caché privada entre usuarios ni se aumentó la vigencia de datos comerciales o de autorización.

**Límite de escala identificado:** catálogo y pedidos administrativos aún reconstruyen una instantánea completa a partir de páginas de 100 registros, con concurrencia acotada y máximo de 10.000. Esto no equivale a paginación remota bajo demanda de la tabla visible. Cambiarlo requiere adaptar selectores, acciones sobre todos los filtrados y módulos que consumen la instantánea. No se declaró resuelto ni se cambió sin una medición representativa y una implementación integral de esos contratos. Las pruebas alojadas con un producto y cero pedidos no certifican rendimiento administrativo con miles de registros.

### Consultas SQL e índices

Se inventariaron **44 llamadas estáticas con nombre literal** a `rpc`/`from` en `src` y `worker`; no se presenta este análisis estático como enumeración de todas las llamadas construidas dinámicamente. Se cotejaron firmas y hashes de once RPC relevantes, entre ellas `catalog_home_context`, `catalog_browse`, `catalog_product_context`, `catalog_products_by_ids`, `admin_catalog_page`, `admin_orders`, `admin_media_library` y `media_public_asset`. Se inspeccionaron las estadísticas acumuladas disponibles sin guardar datos de clientes ni texto SQL sensible.

Se ejecutó `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` de `api.media_public_asset` bajo el rol anónimo y una transacción de solo lectura, cinco veces antes y después, con el mismo activo:

| Serie | Ejecuciones SQL en ms | Interpretación |
|---|---|---|
| Antes | 7,948 · 0,605 · 0,602 · 0,590 · 0,644 | Primera ejecución distinta de las posteriores |
| Después | 1,419 · 0,680 · 0,652 · 0,644 · 0,645 | No se modificó SQL; no se atribuye mejora al código |

**Consultas SQL reescritas: ninguna. Índices nuevos: ninguno.** Esta ronda elimina trabajo iniciándolo solo cuando se necesita y compartiendo recursos, sin justificar otra modificación de las RPC ya optimizadas. No existe evidencia nueva para añadir un índice a los 120 actuales con este volumen. No se ejecutaron pruebas de carga remotas ni se poblaron tablas comerciales para obtener resultados artificiales.

El hash del catálogo de tablas, funciones, relaciones, índices, triggers, políticas y permisos permanece igual: `b1de20d24232497bd99d0e1b35852089be5a63151d4e3311e0f6fb8e50edddad`. Historial de migraciones idéntico, con las 40 versiones coincidentes.

### Worker y R2

Se conserva Navegador → Worker → R2 privado. Cada GET que llega al Worker sigue comprobando el manifiesto en Supabase; únicamente se reutilizan los bytes inmutables verificados. No se añadieron cachés de autorización, TTL, intermediarios, reintentos ni timeouts. No se cambió el sistema de referencias o limpieza.

En las cohortes iniciales se observaron 90 respuestas multimedia de red del control y 78 del candidato, todas HIT de la caché de bytes. Se reducen solicitudes por compartir candidatos; **no se ha medido en esta ronda un MISS frío de R2/CDN**. «Caché fría» en las pruebas de navegador significa vaciar la caché HTTP del navegador, no purgar Cloudflare.

| Tramo instrumentado | Control P50 / P95 / máximo | Candidato P50 / P95 / máximo |
|---|---:|---:|
| Lectura HTTP del manifiesto hasta cabeceras | 20 / 63 / 77 ms | 19 / 44 / 49 ms |
| Upstream informado por Envoy | 2 / 7 / 19 ms | 2 / 5 / 9 ms |
| Acceso a bytes, HIT | 5 / 19 / 24 ms | 5 / 15 / 25 ms |

El cuerpo del manifiesto redondea habitualmente a 0 ms en la instrumentación del Worker; eso no es tiempo cero de red. Los IDs de petición, upstream, CF-Ray y `Server-Timing` permanecen en las muestras individuales. La diferencia de latencia entre cohortes es variación observada, **no una optimización nueva de la infraestructura**.

La comprobación final verificó GET, repetición con nuevos request IDs de manifiesto, HEAD sin cuerpo, ETag/304, rechazo de variante inexistente, prefijo privado y claves internas de caché, carga anónima rechazada y URL directa de R2 con HTTP 401. Los contratos Range y de vídeos también se ejercitaron en las regresiones aisladas del Worker; no se afirma una subida o reproducción real nueva en el bucket para esta ronda.

## 4. Método y evidencia antes/después

Las versiones se compararon en el mismo origen de staging utilizando el mecanismo oficial de selección de versiones de Workers, únicamente sobre ese host. El candidato estuvo al 100% para el tráfico normal; la versión control al 0% quedó accesible solo a las solicitudes de la prueba. Al terminar se retiró la comparación y quedó únicamente el candidato al 100%.

| Perfil | Pantalla | CPU | Red |
|---|---|---|---|
| desktop | 1440 × 900, DPR 1 | Sin limitación | Conexión disponible |
| mobile | 390 × 844, DPR 2 | 4× | 9 Mbps, 80 ms |
| slowMobile | 390 × 844, DPR 2 | 4× | 1,6 Mbps, 150 ms |

Las mediciones son de Chrome real sobre servicios alojados; son laboratorio con emulación, no teléfonos físicos ni métricas de usuarios reales. No se ejecutaron tareas pesadas de tests/build al mismo tiempo que los benchmarks de navegador.

| Evidencia | Muestras / alcance |
|---|---|
| Entradas públicas y recargas | 90 control + 90 candidato: cinco páginas, tres perfiles, tres muestras y dos estados de caché |
| Repetición alternada AB/BA | 132 entradas: cinco muestras de ficha y tres de Home/Tienda por perfil/versión, frío y caliente |
| Dashboard/productos/edición | 54 control + 54 candidato con Auth/TOTP y AAL2 reales |
| Navegación administrativa | 39 pasos por versión; trece destinos por tres perfiles |
| Navegación SPA pública | 72 pasos con enlaces reales y vuelta atrás, sin recargar documento |
| Exploración de galería | 12 recorridos para separar primera foto de cuatro fotos decodificadas |
| Aviso y reseñas | 12 recorridos; comparación de `currentSrc` y conteo de RPC |
| Aparición visual | 18 filmstrips con animaciones activas |
| Perfiles y trazas | 72 archivos de CPU/traza: cohortes iniciales y muestras alternadas iniciales |

Las tablas completas están al final. P50/P95 usan rango más cercano. Con tres o cinco muestras, P95 coincide con el máximo; no representa un percentil de producción estable. Los dos recorridos SPA y de galería permiten comprobar comportamiento y variaciones, no demostrar significancia estadística.

### Interpretación correcta de las imágenes y del arranque

Chrome reportó miniaturas como candidatos LCP en la ficha de escritorio. **Ese LCP no representa necesariamente la pintura de la foto grande.** Se registraron separadamente creación DOM, decodificación y filmstrip. Element Timing tampoco devolvió de forma fiable la foto grande en esta composición; no se cambió el diseño para favorecer la métrica.

El filmstrip compara el área interior de la fotografía con su estado final, mediante un criterio fijo de diferencia RGB y con animaciones activas. Incluye el coste del screencast. Su mediana pasó de 1193 a 1346 ms en escritorio, de 1854 a 1784 ms en móvil y de 3748 a 3774 ms en móvil lento. **No demuestra una aceleración visual universal.** El placeholder mejora cómo se representa la espera, no convierte su aparición en una fotografía cargada.

El JavaScript público de ficha aumenta unos 700–750 bytes transferidos por el estado de carga/error. No se declara reducción del bundle público. En las cohortes de ficha, el heap P50 pasó aproximadamente de 6,55 a 6,61 MB en escritorio y de 6,10 a 6,14 MB en móvil; son snapshots, no evidencia de fuga ni reducción de memoria. `Performance.getMetrics` se capturó después de recorrer las cuatro fotos, por lo que sus acumulados de CPU **no son exclusivamente de arranque**.

Las muestras de CPU muestran ejecución en los módulos comunes y React, sin demostrar una nueva tarea atribuible que justifique otra fragmentación. Los nombres minificados no se atribuyeron a componentes sin evidencia de mapas de fuentes. El TBT observado de laboratorio cambia poco. No hay INP de campo disponible, ni se equiparan los clics automatizados a INP de producción.

### Separar primera fotografía y galería completa

En doce recorridos adicionales se decodifica primero la foto principal y se accionan inmediatamente los controles para recorrer las otras tres. Valores P50 en ms desde navegación, dos muestras por versión/perfil:

| Perfil | Primera foto antes → después | Cuatro fotos tras interacción antes → después |
|---|---:|---:|
| desktop | 855 → 877 | 1721 → 1735 |
| mobile | 1447 → 1328 | 2933 → 2771 |
| slowMobile | 3226 → 3231 | 5472 → 5528 |

La carga nativa diferida depende de visibilidad, desplazamiento y momento del clic. Este recorrido rápido no equivale a esperar 1,5 s sobre la primera foto para contar sus solicitudes iniciales. Se conservan ambos experimentos; no se mezcla su conteo ni se afirma que cargar toda la galería sea requisito para mostrar la primera foto.

## 5. Picos de latencia que permanecen pendientes

La muestra `paired-product-browser.json`, candidato/slowMobile/muestra 3/fría, decodificó la foto a **15.905,6 ms** y recibió la primera respuesta del documento a aproximadamente **8006 ms**. Se mantiene incluida en el P95; no se descartó como ruido.

| Observación de Chrome | Evidencia |
|---|---|
| DNS del documento | Aproximadamente 12,5 ms |
| `connectStart` → `sslStart` | 7156,4 ms, antes de enviar la solicitud |
| Contexto del documento informado por Worker | `catalog_context` 184 ms; no explica los 7,16 s previos al envío |
| Otros recursos estáticos | Esperas hasta cabeceras de aproximadamente 4,67 y 5,07 s en dos chunks |
| Imágenes en esa navegación | Manifiesto aproximadamente 14–17 ms; bytes HIT aproximadamente 3–4 ms |

CF-Ray del documento: `a5a75f9c3b711a9a-GRU`. Chunks: `a5a75fadbc091a8e-GRU` y `a5a75fadbc0a1a8e-GRU`. La traza de red conserva estos tiempos en `slow-product-sample.json`; la muestra 3 no tiene perfil CPU propio, porque solo se perfiló la primera muestra de cada grupo.

Esto demuestra un tramo importante previo al envío y esperas en recursos estáticos, pero **no identifica por sí solo la causa interna de conexión, ISP, Cloudflare o servidor**. Tampoco permite atribuirlo a PostgreSQL. El contexto inicial supera su presupuesto de frescura y la aplicación pide una lectura nueva: se conserva esa garantía, sin extender TTL ni ocultarlo con reintentos.

El pico previo de Envoy de 1000 ms sigue sin causa interna demostrada. La ausencia de otro pico idéntico en estas 168 respuestas no lo da por resuelto. Continúa vigente el expediente [SUPABASE_UPSTREAM_SUPPORT_2026_11_14.md](SUPABASE_UPSTREAM_SUPPORT_2026_11_14.md), con sus IDs correlacionados y la telemetría interna solicitada a Supabase. No se necesita abrir R2 para investigarlo.

## 6. Pruebas y regresiones

### Calidad y suites aisladas

TypeScript, ESLint, build de staging, prerender, comprobación de identidad del paquete y empaquetado Wrangler: **aprobados**. Node: **198 pruebas aprobadas**.

| Suite | Casos aprobados | Fallos / flaky / omitidos |
|---|---:|---|
| Galería, edición, preview, carga de fotos, responsive y ALT | 62 | 0 / 0 / 0 |
| Reseñas | 15 | 0 / 0 / 0 |
| Auth, sesiones, MFA, recuperación y carreras de cuenta | 81 | 0 / 0 / 0 |
| Catálogo | 87 | 0 / 0 / 0 |
| Checkout | 24 | 0 / 0 / 0 |
| Contratos multimedia/Worker | 147 | 0 / 0 / 0 |
| Administración, promociones, visibilidad y estados de carga | 88 | 0 / 0 / 0 |
| Ausencia de vídeo en móviles | 15 | 0 / 0 / 0 |
| Configuración comercial | 18 | 0 / 0 / 0 |
| Pedidos remotos con transporte aislado | 23 | 0 / 0 / 0 |
| SEO y Worker | 53 | 0 / 0 / 0 |
| PostgreSQL temporal local | 929 comprobaciones, 40 migraciones | Aprobado |

Los conteos de suites se muestran por separado; no se suman como casos únicos sin deduplicar. No se ejecutó toda la matriz histórica de más de 1300 tests, sino las suites relacionadas enumeradas. Los tests de SDK con transporte aislado no se presentan como compras reales ni como certificación de un servicio alojado.

El runner SQL usa PostgreSQL temporal en loopback y no admite conexión remota. También comprueba concurrencia de SKU, catálogo, familias, referencias multimedia, limpieza, favoritos, estados masivos, idempotencia y revalidación de importes. **Las simulaciones de checkout no prueban cobros, reservas de stock o liquidación comercial**, que siguen fuera de esta intervención.

### Comprobaciones reales alojadas

Se verificó el recorrido catálogo → ordenamiento → búsqueda → sin resultados → ficha → favorito de invitado → filtro por marca y retirada → directorio de marcas → presentación de 100 ml → carrito → checkout, deteniéndose antes de enviar el pedido.

Pantallas: **1920×1080, 1440×900, 1366×768, 768×1024 y 390×844**. Las fotos decodificaron, no hubo errores JavaScript ni desbordamiento horizontal en las comprobaciones, y no se solicitaron vídeos en los perfiles móviles. En móvil se usaron sus botones de acordeón reales.

La medición administrativa utilizó dos identidades temporales marcadas, una por versión, con TOTP/AAL2 real. Se trasladó su sesión emitida por el SDK a contextos aislados en memoria; no se simuló un rol ni se guardaron contraseñas, sesiones o semillas en los artefactos. No equivale a una prueba manual del formulario de login. Ambas identidades y membresías se retiraron; productos, variantes, pedidos y cupones conservaron los mismos fingerprints.

Las mediciones SPA administrativas incluyen una espera fija de 400 ms para inspección. Sus tiempos completos se conservan, pero **no se presentan como latencia pura hasta interfaz disponible**. Las respuestas asíncronas que terminan durante otro paso tampoco se atribuyen automáticamente como consultas duplicadas de esa segunda ruta.

### Regresiones detectadas durante el trabajo

1. La primera implementación difería el montaje de reseñas desde el acordeón, pero no desde el enlace interno: se corrigieron ambas entradas antes de publicar el candidato.
2. Un test nuevo suponía una sola ejecución en desarrollo con StrictMode: se corrigió para verificar cero lecturas mientras está cerrado y ninguna lectura adicional al reabrir. La prueba alojada independiente sí comprobó exactamente una al abrir.
3. Los primeros intentos de medición del aviso suponían controles de escritorio en móvil y una página suficientemente larga: se corrigió el procedimiento para abrir contenido real y usar los controles de cada breakpoint. No se rellenó ni modificó la página para el benchmark.
4. Se retiró la suposición errónea de fuente de 1600 px; SQL y las URLs reales demuestran 1003 px.

Los fallos iniciales se conservan en artefactos separados. Las suites finales señaladas están aprobadas; no se aumentaron timeouts para ocultar una regresión del producto.

## 7. Archivos de esta intervención

| Archivo | Cambio propio de esta ronda |
|---|---|
| `src/features/product/ProductGallery.tsx` | Placeholder, decode/error y candidato compartido |
| `src/styles/product-detail.css` | Solo estilos de placeholder/error y exclusión de este span del número de miniatura |
| `src/features/product/ProductPage.tsx` | Montaje de reseñas al abrir desde las dos entradas |
| `src/features/product/ProductPopularityPreview.tsx` | `srcset` y `sizes` de galería para reutilizar bytes |
| `src/features/admin/AdminProductFormPage.tsx` | Preview completo diferido dentro del modal existente |
| `src/features/admin/AdminProductPhotoPage.tsx` | Misma carga diferida de preview |
| `tests/product-gallery-loading.spec.ts` | Cinco casos nuevos de espera, fallo, estabilidad y reutilización |
| `tests/product-reviews-remote.spec.ts` | Regresión de apertura/cierre sin consultas innecesarias |
| `docs/UPSTREAM_MANIFEST_AUDIT_2026_11_14.md` | Corrección explícita de dimensiones, sin alterar medidas previas |
| Este informe | Resultado, límites y tablas de comparación |

Los scripts, paquetes comparados, capturas, perfiles CPU, trazas, metadatos y resultados reproducibles están en `artifacts/second-round-2026-11-14/`, excluido de Git. No son dependencias del funcionamiento de la tienda.

## 8. Comparación visual

Antes a la izquierda, después a la derecha:

- [Ficha de escritorio](../artifacts/second-round-2026-11-14/comparisons/product-desktop.png).
- [Ficha móvil](../artifacts/second-round-2026-11-14/comparisons/product-mobile.png).
- [Edición administrativa en escritorio](../artifacts/second-round-2026-11-14/comparisons/admin-edit-desktop.png).
- [Edición administrativa móvil](../artifacts/second-round-2026-11-14/comparisons/admin-edit-mobile.png).
- [Espera de imagen móvil, prueba local con descarga retenida](../artifacts/gallery-loading-390.png).

La comparación de ficha de escritorio tiene **cero píxeles diferentes fuera de la franja de miniaturas**, que ahora usa una imagen más nítida. Las capturas administrativas de escritorio y móvil son idénticas píxel a píxel en estas vistas. La diferencia móvil de ficha es mínima y se conserva para inspección; no se generaliza igualdad absoluta a todas las fases de animación o estados posibles.

Las capturas alojadas usan exclusivamente el contenido ya existente del producto de desarrollo. No se cambió material del cliente para mejorar el resultado visual.

## 9. Despliegue final verificado

| Elemento | Resultado |
|---|---|
| Control medido | `f8161bae-0669-43f0-a4e5-6dbb31100fa5` |
| Candidato final | `700c39a5-be65-446c-bb2a-c975e67a185c` |
| Despliegue activo | `9b20888d-bf17-437e-9937-56b4efcada00`, candidato al 100% |
| Paquete frontend | SHA-256 `1430ff602573e229a6d171899095b070120c7512d78a2f802105619429fac97a` |
| Verificación posterior | Doce recursos servidos cotejados por hash con el paquete; HTML Home/Tienda/ficha y bindings correctos |
| Supabase / R2 | Desarrollo confirmado; R2 privado; esquema e historial iguales antes y después |
| Producción / Git | Sin cambios en producción; sin commit ni push |

URL: https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev

La comprobación final del despliegue, código y servicios afectados se conserva en `verified-final.json`, `versions-finish.json`, `after-remote.json` y `final-evidence.json`.

## 10. Decisiones descartadas y pendientes

| Estado | Punto |
|---|---|
| Implementado y verificado | Galería con espera/error, candidatos compartidos, aviso sin otra descarga y reseñas por intención |
| Implementado y medido | Preview administrativo diferido; menor transferencia antes de abrirlo |
| Verificado sin nueva intervención | Auth/MFA, aislamiento, RLS, frescura comercial, contratos multimedia, navegación y apariencia |
| Investigado; no justificado | Otra división pública de bundles, nuevas memoizaciones, cambios de CSS/fuentes o más precargas |
| Descartado | R2 público, caché de manifiestos/autorizaciones, TTL mayor o reintentos para esconder demoras |
| Descartado | Recompresión de fotografías y LQIP remoto que añada descargas sin beneficio probado |
| Pendiente de investigación externa | Picos de conexión/estáticos y recorrido upstream interno de Supabase; evidencia e IDs conservados |
| Pendiente de medición representativa | Carga administrativa de miles de registros y posible paginación realmente bajo demanda |
| Pendiente de campo | INP y percentiles de usuarios reales tras lanzamiento y consentimiento; no inferibles de laboratorio |

Las mejoras de esta entrega reducen trabajo innecesario y resuelven la representación vacía de una fotografía pendiente o fallida. **No se considera terminada la investigación de latencia externa ni se promete navegación instantánea bajo cualquier conexión.**

Referencias técnicas: [optimización de LCP](https://web.dev/articles/optimize-lcp), [decodificación de imágenes](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode), [lazy loading nativo](https://web.dev/articles/browser-level-image-lazy-loading). Las decisiones se contrastaron con los resultados del proyecto y no se adoptaron solo por recomendaciones generales.

<!-- MEASURED_TABLES -->

## Mediciones de entrada completa

Tres muestras por versión, página, perfil y estado de caché. Valores P50 en ms. Son cohortes consecutivas; la variación de red impide atribuir todos los cambios al código.

| Perfil | Página | LCP antes → después | TTFB antes → después | Foto decodificada antes → después | TBT laboratorio antes → después |
|---|---|---:|---:|---:|---:|
| desktop | home | 696 → 896 | 340 → 358 | 682 → 889 | 0 → 0 |
| desktop | store | 1176 → 992 | 391 → 290 | 1159 → 980 | 0 → 0 |
| desktop | product | 972 → 1316 | 347 → 405 | 811 → 1007 | 0 → 0 |
| desktop | cart | 680 → 668 | 111 → 116 | 669 → 653 | 0 → 0 |
| desktop | checkout | 620 → 668 | 117 → 114 | — → — | 0 → 0 |
| mobile | home | 1304 → 1320 | 280 → 289 | 1299 → 1320 | 57 → 63 |
| mobile | store | 1396 → 1456 | 286 → 312 | 1389 → 1449 | 61 → 64 |
| mobile | product | 1296 → 1304 | 327 → 319 | 1302 → 1305 | 63 → 61 |
| mobile | cart | 1164 → 1196 | 110 → 107 | 1138 → 1188 | 0 → 0 |
| mobile | checkout | 1028 → 1032 | 110 → 124 | — → — | 0 → 0 |
| slowMobile | home | 3220 → 3196 | 279 → 257 | 3223 → 3197 | 61 → 59 |
| slowMobile | store | 3220 → 3264 | 273 → 275 | 3216 → 3252 | 62 → 69 |
| slowMobile | product | 3236 → 3244 | 309 → 293 | 3240 → 3246 | 63 → 62 |
| slowMobile | cart | 3128 → 3124 | 153 → 153 | 3106 → 3102 | 0 → 0 |
| slowMobile | checkout | 2792 → 2796 | 153 → 153 | — → — | 0 → 0 |

## Ficha: prueba alternada AB/BA

Cinco muestras por versión/perfil, caché fría del navegador. Foto decodificada, no LCP ni tiempo exacto de aparición visual.

| Perfil | P50 antes → después | P95 antes → después | GET multimedia antes → después | Transferencia multimedia antes → después |
|---|---:|---:|---:|---:|
| desktop | 868 → 830 | 1190 → 1734 | 8 → 4 | 601065 → 437316 B |
| mobile | 1378 → 1286 | 1422 → 1346 | 2 → 2 | 208249 → 208245 B |
| slowMobile | 3420 → 3286 | 3683 → 15906 | 2 → 2 | 208251 → 208247 B |

## Aparición visual observada

Tres muestras AB/BA con filmstrip de Chrome y animaciones activas. Primera coincidencia con la foto final (ROI interior, MAE RGB <4/255 tras reducir a 32×40). Incluye sobrecarga de screencast.

| Perfil | P50 antes → después | Máximo antes → después |
|---|---:|---:|
| desktop | 1193 → 1346 | 1787 → 1515 |
| mobile | 1854 → 1784 | 1864 → 1871 |
| slowMobile | 3748 → 3774 | 3855 → 3787 |

## Administración: formulario disponible

Tres entradas frías por versión/perfil. Sesión real AAL2, identidad temporal retirada; no se escribieron datos comerciales.

| Perfil | Pantalla | Disponible antes → después | JavaScript transferido antes → después |
|---|---|---:|---:|
| desktop | dashboard | 1500 → 1509 | 75809 → 69190 B |
| desktop | products | 1274 → 1309 | 83984 → 84003 B |
| desktop | edit | 2219 → 1831 | 105887 → 87817 B |
| mobile | dashboard | 2191 → 2144 | 75850 → 75937 B |
| mobile | products | 1695 → 2140 | 84020 → 90781 B |
| mobile | edit | 2148 → 1667 | 99181 → 87821 B |
| slowMobile | dashboard | 4765 → 3811 | 69221 → 69117 B |
| slowMobile | products | 5280 → 3796 | 83984 → 84084 B |
| slowMobile | edit | 5431 → 4281 | 106046 → 88050 B |

## Navegación SPA pública

Dos recorridos AB/BA por perfil/versión. P50 hasta selector visible, incluye clic real y espera de ruta, sin espera fija añadida; el navegador no recargó el documento. No representa el final de las animaciones.

| Perfil | Recorrido | Antes → después |
|---|---|---:|
| desktop | home-store | 28 → 28 |
| desktop | store-product | 208 → 232 |
| desktop | product-store-back | 209 → 194 |
| desktop | store-product-return | 32 → 32 |
| desktop | product-cart | 249 → 247 |
| desktop | cart-checkout | 1006 → 1004 |
| mobile | home-store | 72 → 66 |
| mobile | store-product | 1100 → 405 |
| mobile | product-store-back | 69 → 277 |
| mobile | store-product-return | 875 → 107 |
| mobile | product-cart | 336 → 321 |
| mobile | cart-checkout | 1374 → 1126 |
| slowMobile | home-store | 67 → 69 |
| slowMobile | store-product | 443 → 855 |
| slowMobile | product-store-back | 74 → 67 |
| slowMobile | store-product-return | 929 → 910 |
| slowMobile | product-cart | 339 → 334 |
| slowMobile | cart-checkout | 1928 → 1887 |
