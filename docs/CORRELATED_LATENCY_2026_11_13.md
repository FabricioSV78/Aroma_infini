# Rendimiento pendiente: diagnóstico correlacionado — 13 de noviembre de 2026

Continuación de [la intervención del 13 de noviembre](ROOT_PERFORMANCE_INTERVENTION_2026_11_13.md). Alcance: las colas HTTP de medios/backend y el bloqueo inicial del navegador. No se hizo otra reorganización general del frontend.

## Estado de la intervención

- **IMPLEMENTADO EN STAGING:** caché de bytes WebP inmutables, siempre después de una consulta nueva al manifiesto de Supabase. No se cachean decisiones de autorización, precios, existencias ni pedidos.
- **IMPLEMENTADO EN STAGING:** identificadores correlacionables entre respuesta multimedia, log del Worker y solicitud HTTP a Supabase, con tiempos separados y datos acotados.
- **DESCARTADO TRAS MEDIR:** ejecutar todo el Worker cerca de `aws:sa-east-1`. No mejoró consistentemente la entrega multimedia frente a la ubicación actual.
- **PENDIENTE:** asignar una causa interna exacta al antiguo pico de 1.732 ms. No se ha demostrado que fuera PostgreSQL, DNS, TLS o espera del pool. Las nuevas mediciones no convierten ese pico histórico en resuelto.
- **SIN MODIFICAR:** producción, migraciones, RLS, Auth/MFA, reglas comerciales, diseño, fuentes, animaciones y archivos audiovisuales originales.

La serie definitiva y las pruebas terminaron. Se aprueba la mejora específica de bytes multimedia; no se da por resuelta toda la variabilidad del backend ni el coste de arranque del frontend.

## 1. Qué se puede atribuir y qué no

La lectura multimedia existente hacía dos operaciones secuenciales: consultar `api.media_public_asset` por HTTP y obtener el objeto de R2. Una cabecera `media_manifest;dur=1732` medía el recorrido HTTP completo del primer paso. No medía exclusivamente el tiempo SQL.

La nueva instrumentación registra:

| Tramo | Evidencia |
| --- | --- |
| Navegador → Cloudflare | Timing de Chrome: DNS, conexión, TLS, espera de respuesta y recepción; CF-Ray de la respuesta |
| Worker → Supabase hasta las cabeceras | `manifest_headers` y log `headersMs` |
| Lectura del cuerpo del proveedor | `bodyMs` del mismo log; el reloj del Worker tiene las limitaciones de precisión del runtime |
| Correlación | `X-Aroma-Request-Id`, `X-Aroma-Upstream-Id` y `sb-request-id` del proveedor; se envía contexto W3C de trazado |
| Ejecución del Worker | `cpuTime` y `wallTime` del evento de tail asociado a esa lectura |
| Lectura de bytes | `media_storage`, junto con `X-Aroma-Byte-Cache: HIT/MISS` cuando corresponde |
| PostgreSQL | EXPLAIN acotados con rol anónimo, estadísticas acumuladas y estado agregado de conexiones |

Los logs no incluyen claves, sesiones, cookies, cuerpos, consultas de usuarios ni identificadores de productos. Los diagnósticos se habilitan únicamente en staging. No se devuelven estos identificadores ni tiempos nuevos en producción.

En la consulta SQL real de desarrollo, cinco EXPLAIN de lectura del manifiesto dieron **1,337; 0,656; 0,665; 0,672 y 0,671 ms**. La estadística acumulada correspondiente tenía aproximadamente **1,49 ms de media** y **138,38 ms de máximo**. Son observaciones SQL independientes; no se presentan como el tiempo del evento HTTP histórico de 1.732 ms.

La instantánea de conexiones mostró diez conexiones cliente inactivas y un máximo configurado de 60. No mostró saturación en ese instante; **no permite descartar retrospectivamente una espera de PostgREST o del pool**. No se reiniciaron estadísticas ni se cambió el tamaño de los pools.

### Límites de observabilidad

Las respuestas reales no incluyeron `x-kong-proxy-latency` ni `x-kong-upstream-latency`. La instrumentación admite estos campos si están presentes, pero su ausencia se conserva como desconocida, nunca como cero. `sb-request-id` sí permite localizar el evento correspondiente en los logs del proveedor.

El CLI del proyecto es v2.122.0 y no proporciona consulta de logs. El acceso manual al almacén de Windows fue rechazado por la revisión automática y no se eludió. Se encontró una alternativa normal del servicio: **Supabase CLI oficial 3.1.0 ejecutado temporalmente mediante npm exec**, con su sesión autorizada. Se verificaron versión e integridad del paquete; no se actualizaron package.json ni package-lock.json ni se extrajeron tokens. Así sí se pudieron consultar los logs, con ventanas y campos acotados.

El CLI identifica la rama principal del proyecto de desarrollo como `production`; todas las consultas fijaron explícitamente **tkxvexfapszilzhogvgu / aroma-infini-dev**. Esa etiqueta de rama no es el proyecto de producción de Aroma Infini, que no se consultó ni modificó.

**No se midieron separadamente DNS, TLS o espera de conexión dentro de `fetch` del Worker**. El API estándar de esa llamada no los expone. Los tiempos de curl/Chrome corresponden a la conexión del ordenador/navegador con el edge y no se trasladan al tramo interno. Los logs del gateway sí permiten separar su tiempo upstream del resto de la lectura HTTP, como se detalla a continuación.

### Correlación efectiva: hay más de un patrón de demora

Se enlazaron **las 48 lecturas del experimento multimedia con sus 48 eventos del gateway, por sb-request-id exacto**, no por proximidad temporal:

| Grupo | Lectura HTTP del manifiesto, mediana | Upstream de Envoy, mediana | Resto de la lectura, mediana |
| --- | --- | --- | --- |
| Control, 24 peticiones | 22 ms | 2 ms | 20 ms |
| Caché de bytes, 24 peticiones | 14 ms | 2 ms | 11,5 ms |

El mayor manifiesto de ese grupo tardó **473 ms**. Su evento exacto de gateway solo registró **17 ms upstream**: aproximadamente **456 ms quedaron fuera de ese tiempo upstream**. Esto localiza ese retraso en el recorrido restante —conexión/transporte hasta gateway, procesamiento de edge y recepción—, sin convertirlo en un tiempo SQL ni distinguir DNS/TLS sin datos adicionales. No se atribuye la diferencia de medianas del manifiesto a la caché de imágenes: esta solo conserva bytes.

En cambio, el pico preservado durante la prueba final de Tienda tiene otra causa por capas: **1.021 ms hasta las cabeceras del manifiesto**, con **1.000 ms upstream registrados por Envoy** para exactamente el mismo request ID y trace ID. Solo unos 21 ms quedan fuera de ese tramo. Hubo **un intento**, respuesta 200, ingreso GRU y caché DYNAMIC del proveedor. Por tanto, en ese caso la mayor espera está **entre el gateway y su servicio upstream**, no en R2, en el trabajo del frontend ni en abrir una nueva conexión del navegador. No se detectó un reintento de Envoy en ese evento; tampoco en la cohorte de 48.

El significado de upstream service time incluye procesamiento del servicio y red entre Envoy y ese servicio. **No equivale a ejecución PostgreSQL ni demuestra por sí solo espera del pool.** La consulta de disponibilidad no devolvió eventos de PostgREST, PostgreSQL o poolers en la ventana de 30 segundos del pico. Esos tramos internos quedan sin desglose y requieren telemetría adicional del proveedor. No se alteró el logging de PostgreSQL ni se habilitó registro de consultas con datos de clientes. [Semántica oficial de Envoy](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/router_filter).

También se recuperaron **12 eventos de manifiesto en la ventana del experimento histórico**, todos con upstream de **2–18 ms** y un intento. Coinciden en número y secuencia con las doce lecturas seriales originales; esto respalda la hipótesis de espera fuera de ese upstream para el pico antiguo. **La asociación con la fila original de 1.732 ms se infiere por ventana/orden, no por un identificador común que aquel informe no guardó.** No se presenta esa inferencia como una correlación exacta ni se afirma haber identificado su DNS/TLS o conexión concreta.

Las doce lecturas de curl, con procesos y conexiones nuevos, mostraron costes reales de apertura y variación en el primer acceso. En el primer acceso directo a Supabase: DNS 41 ms, TCP 13 ms, TLS 127 ms y espera HTTP 627 ms; siguientes esperas HTTP aproximadamente 140–170 ms. Esto demuestra variación del recorrido HTTP, **no identifica el componente interno responsable de aquellos 627 ms ni de los 1.732 ms históricos**.

Referencia para la correlación del proveedor: [Supabase, consulta de logs y request IDs](https://supabase.com/docs/guides/observability/advanced-log-filtering).

## 2. Experimentos de backend

### Ubicación de ejecución

Se subieron dos versiones con el mismo paquete frontend y el mismo código diagnóstico: ubicación normal y hint `aws:sa-east-1`. Se alternaron 24 GET bajo el mismo hostname, sin purgar cachés ni cambiar datos. La alternativa confirmó `cf-placement: remote-GRU`.

La alternativa no produjo una mejora repetida de respuesta completa; muchos pares empeoraron. No se conservó el hint. Una primera lectura favorable no bastó para justificar un cambio global que también afecta HTML y demás API. [Comportamiento de placement y assets](https://developers.cloudflare.com/workers/configuration/placement/).

### Bytes de imágenes después de autorización fresca

Se midieron otras **48 lecturas seriales**, alternando control y caché de bytes, sobre tres representaciones reales existentes. Las primeras lecturas de cada representación fueron MISS; las siguientes demostraron HIT mediante una cabecera explícita y una reducción repetida del tramo de almacenamiento a 3–8 ms, frente a aproximadamente 150–180 ms habituales del control. Se verificó igualdad SHA-256 de las imágenes recibidas.

Funcionamiento conservado:

1. Validar ruta, UUID y representación solicitada.
2. Consultar de nuevo el manifiesto en Supabase.
3. Si está ausente o la consulta falla, devolver el error existente, sin consultar la caché de bytes.
4. Solo para un WebP GET permitido, consultar el objeto inmutable en Cache API.
5. En MISS, leer R2 y enviar su misma representación; registrar la copia en segundo plano con `waitUntil`.

El key interno está bajo `/media/`, que ejecuta siempre el Worker, y no cumple la gramática de una URL pública válida. Solicitarlo directamente debe producir 404. La clave no contiene credenciales ni depende de cookies o cabeceras del solicitante. Las copias no incluyen los identificadores de diagnóstico de una petición anterior.

No se cachean vídeos, respuestas 206, SVG, errores, HEAD ni GET condicionales. Se conservan sus caminos anteriores y la comprobación del manifiesto. Una caída de Cache API vuelve al flujo normal de R2; una caída de Supabase sigue fallando de forma cerrada. La optimización está limitada a staging y no cambia las asociaciones ni el cron de limpieza.

Esto es **Cache API dentro del Worker**, después de autorizar. No se activó una caché delante del Worker que evite ejecutar sus validaciones. La caché es local a cada centro de datos, puede expulsar objetos y no garantiza que una primera visita desde otro lugar sea HIT. Tampoco elimina la lectura HTTP del manifiesto. [Semántica oficial de Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).

## 3. Por qué no bajó proporcionalmente el bloqueo de JavaScript

Las trazas de Chrome con CPU ×4 identificaron tareas iniciales de **101–109 ms** compartidas por las tres páginas. Dentro de ellas, la evaluación del módulo de entrada y sus dependencias rondó **42–44 ms**. Las muestras de CPU localizaron también el primer uso de `Intl.NumberFormat` para precios y el trabajo de React. No apareció una llamada a Supabase que bloqueara sincrónicamente ese hilo.

La traza detallada de Home seleccionado registró unos **4 ms de compileModule** en el hilo principal y **19,9 ms de parsing efectivo en hilos de fondo**. Los más de tres segundos acumulados de `parseOnBackgroundWaiting` son esperas de esos hilos durante la carga, no tres segundos de CPU bloqueando React. No se atribuye sin evidencia el resto de la tarea inicial a compilación, ni se suman tiempos de hilos solapados como si fueran un único bloqueo principal.

Hubo trabajo de representación separado: en las capturas diagnósticas, tareas de layout/estilos/pintura de aproximadamente **63 ms en Tienda, 73 ms en ficha y 116 ms en Home**. No todo ese trabajo es ejecución JavaScript y no debe atribuirse a React únicamente. No se cuenta el código de automatización como código del producto.

Reducir bytes HTTP reduce transferencia; no suprime automáticamente la evaluación de las funciones conservadas, el primer montaje ni la primera disposición de texto. La métrica de bloqueo depende además de cómo se agrupa el trabajo por encima de 50 ms. En las recargas con código y recursos calientes, el bloqueo observado cayó a cero en la serie base; esto no equivale a asegurar cero bloqueo en dispositivos reales.

No se añadieron nuevos splits, dependencias, proveedores, precargas o cambios de CSS. El paquete frontend de esta intervención conserva exactamente el mismo SHA-256 que la versión de control. Por tanto, una variación pequeña de bloqueo entre ambas versiones no se presenta como una optimización nueva de JavaScript.

No hay INP de campo/CrUX de este staging. Se conservan las trazas, perfiles de CPU y las duraciones de tareas; la suma del exceso sobre 50 ms no se presenta como INP ni como una puntuación Lighthouse.

### Corrección del método de caché caliente

La primera serie exploratoria empleó routing de Playwright, que deshabilita la caché HTTP. Sus recargas solo demostraban calentamiento del código/conexiones. Se conservan como exploratorias y se excluyen de la comparación definitiva fría/caliente.

La serie definitiva utiliza interceptación CDP limitada al hostname staging, mantiene la caché HTTP habilitada y exige eventos reales de caché antes de clasificar una recarga como caliente. No envía el override de versión a Supabase. Se alternan versiones AB/BA bajo el mismo hostname y se comprueba la versión efectiva del Worker mediante sus respuestas, ya que el frontend de ambas es idéntico.

## 4. Entrega directa con dominio multimedia: análisis previo

**No se abrió ni se cambió ningún permiso del bucket actual.** El dominio de desarrollo R2 continúa deshabilitado. No se creó otro bucket ni se inventó un dominio de producción para presentar un benchmark que no existe.

| Alternativa | Ventaja | Límite / condición |
| --- | --- | --- |
| Navegador → Worker → R2 privado | Conserva validación fresca y una sola autoridad; cambios pequeños | Cada lectura que llega al servidor depende del HTTP del manifiesto; R2 añade latencia en MISS |
| Navegador → dominio de un bucket publicado independiente | Un HIT puede evitar cómputo y consulta del manifiesto por archivo | Requiere publicación segura previa, dominio real y aceptación explícita de la semántica de caché/revocación |
| Híbrida | Publicar solo derivados comerciales aprobados; mantener borradores, administración y contenido privado en su circuito protegido | Exige sincronización, auditoría, reconciliación y limpieza de ambas copias |

La segunda alternativa no debe apuntar al bucket actual. El inventario incluye originales, archivos en preparación y recursos de biblioteca sin asignación. Además, la RPC pública actual comprueba estado `ready`, almacenamiento R2 y propósito; **no equivale a certificar que exista una referencia publicada en una página activa**. Un publicador futuro necesita esa condición explícita, no solamente copiar todos los activos `ready`.

### Contrato mínimo de una futura arquitectura híbrida

- Bucket privado actual: originales, preparación, borradores y archivos no publicables. Sin dominio público directo.
- Bucket independiente de publicados: únicamente derivados comerciales verificados y explícitamente publicables. Nunca documentos de clientes, recibos, sesiones o archivos administrativos.
- Publicación: registrar una intención versionada/idempotente en la misma transacción que el contenido; copiar bytes por UUID/hash; comprobar integridad y todas las variantes; confirmar la copia antes de entregar su URL pública. El lector conserva la URL anterior hasta esa confirmación.
- Sustitución: otra URL de contenido inmutable, nunca sobrescribir una URL cacheada. Las indicaciones responsive y del Hero deben usar exactamente el mismo origen y manifiesto que React para evitar dobles descargas.
- Referencias: reutilización entre productos, Home, banners, ubicaciones y documentos históricos con la misma autoridad de Supabase. No crear un contador independiente que pueda divergir.
- Limpieza: conservar el período vigente de 24 horas y la reclamación con bloqueo y nueva comprobación. Una reutilización antes de reclamar cancela el retiro. Después de reclamar no se permite reasociar mientras se elimina. Una extensión futura debe registrar/reintentar la retirada de la copia publicada y la privada antes de finalizar, sin borrar recursos aún referenciados ni modificar el cron actual por intuición.
- Invalidación: borrar R2 y purgar CDN son operaciones diferentes. Las copias de navegador ya descargadas no pueden revocarse inmediatamente. Un recurso que requiera confidencialidad o revocación estricta debe permanecer en el circuito privado; una política de fotos comerciales públicas necesita documentar esa diferencia.
- Seguridad del dominio: GET/HEAD públicos exclusivamente para publicados; administración y escrituras protegidas. Nada de claves S3 en el frontend. CORS no sustituye autorización ni convierte un archivo público en privado.
- Costes: la lectura directa caliente puede evitar invocaciones del Worker y operaciones R2; la copia publicada añade almacenamiento, escrituras, reconciliación y purgas. Esta intervención demuestra ahorro de lecturas R2 en HIT, pero no presenta una estimación de facturación sin volumen real.

Las subidas prefirmadas no resuelven la cola de latencia de lectura pública investigada aquí. Si se evalúan posteriormente: autenticación/MFA y reserva en backend, operación/clave/expiración acotadas, subida a preparación privada, validación real de bytes y dimensiones en servidor, y finalización idempotente. No registrar como definitivo un objeto que una URL aún vigente pueda sobrescribir; la copia verificada debe quedar inmutable. No se reemplazó el flujo de subida actual.

**Decisión actual:** mantener el circuito privado con la mejora medida de bytes; preparar una prueba híbrida únicamente cuando exista un dominio de pruebas y un contrato de publicación/revocación aprobado. Sin ese dominio no se declara que R2 directo tenga mejor latencia real ni que se haya probado su HIT de CDN.

Fuentes: [buckets públicos y dominio personalizado](https://developers.cloudflare.com/r2/buckets/public-buckets/), [consistencia de R2 y cachés](https://developers.cloudflare.com/r2/reference/consistency/) y [URLs prefirmadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

## Evidencias

Directorio local: `artifacts/correlated-latency-2026-11-13/`.

- `http-paired.json`, `correlated-tail.json`: experimento de placement, conservado aunque se descartó.
- `http-cache.json`, `correlated-tail-cache.json`: experimento de bytes, hashes y correlación.
- `client-network.json`: DNS/TCP/TLS/espera desde el ordenador de auditoría, sin extrapolar al interior del Worker.
- `provider-cohort.json`, `provider-summary.json`: 48 eventos de gateway unidos por ID exacto con las 48 lecturas.
- `provider-trace.json`, `provider-gateway.json`: pico final exacto, upstream 1.000 ms, un intento.
- `provider-availability.json`: ausencia de eventos de servicios/poolers en la ventana acotada; no demuestra ausencia de espera.
- `provider-historical-window.json`: doce eventos históricos; la vinculación con la fila original es inferida por ventana/secuencia.
- `before-remote.json`, `before-catalog.json`: esquema, historial, conexiones agregadas y SQL de lectura.
- `deployed-verification.json`: comprobación real anterior a la serie definitiva de navegador.
- `paired-browser.json`, `traces/`, `screens/`: comparación definitiva, perfiles y capturas.
- `baseline-complete-browser.json`: serie exploratoria; no demuestra caché HTTP caliente.
- `code-gates.json`, `media-tests.json`, `seo-tests.json`: controles locales/aislados. No equivalen a compras o sesiones administrativas reales.

No se hizo commit ni push. Los artefactos de investigación permanecen ignorados por Git.

## 5. Resultado definitivo y despliegue verificado

| Componente | Comprobación |
| --- | --- |
| Worker staging | aroma-infini-frontend-staging |
| Versión final | 5d4c1855-67ad-44f5-b690-fc78deee87f4 |
| Deployment final, una sola versión al 100 % | f813e12f-95ef-400e-9ce8-9ca680a38605 |
| Frontend sellado | c58b9d00e758ba9a7c702110ed6dc05d9b4b96ce5290df4f5a18e24e5a651c8e |
| Comparación del frontend | Paquete idéntico al control: JavaScript, CSS, tipografía y recursos sin cambios |
| Archivos servidos comparados con dist | 12, igualdad SHA-256 |
| Supabase | tkxvexfapszilzhogvgu, 40 migraciones coincidentes; ninguna nueva ni pendiente |
| Esquema antes/después | b1de20d24232497bd99d0e1b35852089be5a63151d4e3311e0f6fb8e50edddad, sin cambios de tablas, funciones, índices, ACL o RLS |
| Datos finales | 1 producto, 2 variantes, 0 pedidos; ningún fixture creado |
| R2 | Bucket privado aroma-infini-media-dev; r2.dev deshabilitado; ninguna escritura/eliminación de objetos |
| Producción | No modificada; no se consultó ni aplicó su historial de migraciones |

La comprobación de versión, bindings, frontend servido, privacidad del bucket e historial SQL se guardó **antes** de las pruebas finales en deployed-verification.json. Se habilitó temporalmente el control al 0 % únicamente para overrides de prueba; al terminar se retiró del deployment activo. No se presenta un dry-run como prueba de publicación.

### Entrega multimedia: 48 GET reales, mismo hostname y mismos archivos

| Medición | Control, n=24 | Caché tras manifiesto, n=24 |
| --- | --- | --- |
| Mediana hasta cabeceras | 307.2 ms | 138.8 ms |
| Mediana completa, incluido cuerpo | 326.3 ms | 156.8 ms |
| Mediana del tramo de almacenamiento | 158.5 ms | 4.0 ms |
| Máximo completo observado | 1093.5 ms | 393.8 ms |
| HIT/MISS demostrados en la alternativa | — | 21 HIT, 3 MISS |

La reducción de la mediana completa fue aproximadamente **52 % en esta serie**. Incluye los tres MISS iniciales. Es una mejora de estas representaciones y condiciones, no una garantía de latencia global. En MISS de otro centro de datos seguirá habiendo lectura de R2 y, en todos los casos que lleguen al Worker, consulta fresca a Supabase.

El experimento de placement empeoró la mediana completa **320,9 → 360,4 ms**; no se conservó. Las diferencias de muestras aisladas favorables no se usaron para aprobarlo.

### Navegador: 120 cargas reales en Chrome

Cinco sesiones independientes por versión, ruta y perfil; cada sesión incluye carga fría y recarga caliente. AB/BA, mismo hostname y versión efectiva comprobada. Escritorio 1440 × 900; móvil 390 × 844, DPR 2, CPU ×4, 1,6 Mbps/150 ms. No se purgó globalmente Cloudflare. Las primeras capturas de cada grupo incluyen muestreo de CPU y se identifican en los artefactos; las demás no. No se ejecutaron builds ni pruebas pesadas en paralelo.

Las pruebas alojadas utilizan el catálogo real actual —un producto— y sus fotografías disponibles. No representan una página con doce fotografías comerciales diferentes ni una prueba de carga con miles de usuarios. Se conservan por separado las pruebas SQL de volumen del informe anterior.

LCP y primera imagen decodificada, milisegundos; control → seleccionada:

| Perfil | Página | LCP frío, mediana | LCP frío, rango | LCP caliente, mediana | Primera imagen decodificada, frío |
| --- | --- | --- | --- | --- | --- |
| Escritorio | Home | 772 → 772 | 652–1004 → 688–800 | 284 → 296 | 761 → 765 |
| Escritorio | Tienda | 1000 → 980 | 996–1076 → 852–1080 | 272 → 276 | 989 → 970 |
| Escritorio | Ficha | 1004 → 1036 | 968–1076 → 856–1236 | 296 → 296 | 713 → 853 |
| Móvil lento, CPU ×4 | Home | 3224 → 3144 | 3120–3260 → 3100–3232 | 444 → 428 | 3233 → 3143 |
| Móvil lento, CPU ×4 | Tienda | 3396 → 3260 | 3324–3560 → 3168–5268 | 424 → 492 | 3389 → 3251 |
| Móvil lento, CPU ×4 | Ficha | 3216 → 3204 | 3164–3256 → 3164–3264 | 528 → 496 | 3220 → 3206 |

- CLS: 0 en todos los grupos. Sin errores JavaScript ni desbordamientos. Todas las imágenes principales se decodificaron. Cero solicitudes de vídeo en las cargas móviles.
- El LCP de algunas fichas corresponde al logo de cabecera; la columna de imagen decodificada es una comprobación separada y tampoco significa que toda la galería esté descargada.
- **No hay mejora global demostrada de LCP en todas las páginas.** Home de escritorio quedó igual; ficha de escritorio y Tienda caliente tuvieron medianas peores. Estas regresiones/variaciones se conservan, no se ocultan detrás del ahorro del endpoint de imágenes.
- El frontend es idéntico: no se atribuye una diferencia de pocos bytes HTTP —incluyen cabeceras— a reducción de código. Las medianas de heap observado permanecieron aproximadamente en 5,4–6,3 MiB según ruta/perfil; esto no constituye una prueba de ausencia de fugas a largo plazo.
- Bloqueo móvil frío: Home 57 → 56 ms, Tienda 55 → 57 ms, ficha 57 → 58 ms. La mediana caliente fue 0, pero **hubo tareas calientes aisladas de 48–60 ms**. El bloqueo no se declara resuelto.

### Caso adverso que impide cerrar la cola HTTP

Tienda móvil seleccionada, muestra 1, caché fría: **LCP 5.268 ms**. La cascada registrada incluye:

1. Documento recibido en aproximadamente 1.282 ms; su contexto editorial de cabecera ya estaba caliente.
2. Lectura alternativa de catalog_browse desde el navegador: aproximadamente 1.402 ms.
3. La imagen del producto: aproximadamente 1.298 ms, aunque sus bytes fueron **HIT** y su tramo de almacenamiento solo **9 ms**.
4. Esa imagen esperó **1.021 ms hasta recibir las cabeceras del manifiesto**. Su conexión navegador → Worker ya estaba reutilizada: no hubo DNS, conexión ni TLS nuevos en ese recurso según Chrome. Por tanto, ese pico concreto está en la espera HTTP del manifiesto, no en R2 ni en abrir la conexión del navegador. No se identifica por ello cuál fue el tramo interno de esa espera.

Correlación real preservada:

- Worker request: fc64114c-29f0-4cf2-8d76-a4c181cbf2c7.
- Supabase request: 01a1d79c-decb-725c-b25c-da99c0267437.
- Trace ID enviado al proveedor: fc64114c29f04cf28d76a4c181cbf2c7.
- Hora aproximada del gateway, decodificada de UUIDv7: 2026-11-14T01:12:24.523Z; no se presenta como un reloj de navegador medido independientemente.
- CF-Ray del navegador: a5a225d118c71aa9-GRU.

Se preparó y **se ejecutó mediante el CLI oficial** [la consulta de Logs/Explorer](../artifacts/correlated-latency-2026-11-13/provider-log-query.sql), de solo lectura y sin cuerpos, claves ni cookies. El gateway confirmó **1.000 ms upstream, un intento y el mismo trace ID**; la consulta adicional no encontró eventos de servicios/poolers en esa ventana. No debe ejecutarse en el editor SQL de PostgreSQL. La ausencia de esos eventos o campos no demostraría ausencia de espera.

**La caché no resolvió este pico**, y no se afirmó lo contrario. Tampoco se ampliaron tiempos de vida de precios/stock, se aumentaron timeouts por intuición ni se añadieron reintentos duplicados para esconderlo. La capa predominante sí está localizada y correlacionada; falta desglose del servicio upstream para distinguir red interna, cola o pool. Esto ya no se debe a falta de autenticación para consultar Logs.

## 6. Pruebas y límites finales

| Grupo | Resultado |
| --- | --- |
| Typecheck, lint, build staging y Wrangler dry-run | Aprobados |
| Node | 198 aprobadas |
| Medios, revocación, fallos de caché, rangos, limpieza y runtime | 145 aprobadas, ninguna omitida |
| SEO/HTML inicial del Worker | 53 aprobadas, ninguna omitida |
| Catálogo SDK/navegador aislado | 87 aprobadas, ninguna omitida |
| Checkout SDK aislado | 24 aprobadas, ninguna omitida |
| Supabase público alojado | 55 comprobaciones anónimas aprobadas |
| Seguridad multimedia alojada | 9 comprobaciones: GET, repetición, HEAD, ETag, ruta interna/privada, variante inventada y carga anónima |
| Funcional alojado | Tienda, ordenar, buscar, vacío, ficha/foto, carrito y checkout en 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844 |
| Vídeo alojado | Escritorio reproduce/pausa fuera de pantalla; tablet/móvil con recorrido completo: cero elementos y descargas de vídeo |
| Esquema y migraciones reales | Iguales antes/después, 40 sincronizadas, cero cambios SQL |

Las pruebas nativas de esbuild/workerd necesitaron repetirse fuera del sandbox por un rechazo de lectura de carpetas; los resultados finales anteriores corresponden a las repeticiones completas aprobadas. Las pruebas de transporte aislado no se presentan como operaciones comerciales reales. Los recorridos alojados se detuvieron antes de enviar pedido o pago. No se crearon usuarios, productos, pedidos ni objetos R2 de prueba.

Se revisó la disponibilidad de una sesión normal de Supabase mediante Computer Use. La herramienta terminó esa comprobación porque no pudo identificar con confianza la URL del navegador; no se siguió interactuando con Edge. No se eludió ese bloqueo ni el rechazo previo al almacén de credenciales.

Después se pudo completar el acceso de lectura a Logs con el CLI oficial temporal 3.1.0, usando la sesión normal del servicio. **No queda pendiente que el usuario entregue tokens, contraseñas o acceso al almacén de Windows.** El límite restante es la telemetría que esos eventos no contienen.

| Estado | Punto |
| --- | --- |
| APROBADO | Mejora repetida de bytes WebP en staging, con manifiesto fresco, hashes iguales y controles conservados |
| APROBADO | Despliegue y esquema comprobados, pruebas funcionales y de seguridad aprobadas |
| APROBADO | Análisis de R2 directo y contrato seguro de separación preparados; ningún bucket abierto |
| PENDIENTE | Desglose interno del servicio upstream: el pico final está correlacionado hasta Envoy (1.000 de 1.021 ms), pero no hay evidencia para atribuirlo a SQL, DNS/TLS interno, cola o pool |
| PENDIENTE | Reducir estructuralmente el trabajo inicial de JS/renderizado con un experimento que acredite beneficio; no se aplicó otra fragmentación especulativa |
| PENDIENTE DEL DOMINIO | Comparación real de un dominio R2 separado, caché MISS/HIT y revocación; no se sustituye por r2.dev |
| NO EJECUTADO | Producción, migraciones productivas, compras/cobros, cargas agresivas o cambios de permisos |

La intervención termina con esas limitaciones explícitas. Se ha corregido una causa medida de demora recurrente; no se certifica que hayan desaparecido todas las colas de latencia ni que el staging tenga INP de campo validado.
