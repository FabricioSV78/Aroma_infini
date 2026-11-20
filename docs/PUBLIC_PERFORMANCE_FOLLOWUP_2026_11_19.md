# Seguimiento de rendimiento público — Aroma Infini

Intervención del 19 de noviembre de 2026, America/Lima. Referencias obligatorias:
[Rendimiento integral](INTEGRAL_PERFORMANCE_2026_11_19.md) y
[Auditoría de caché](CACHE_STRATEGY_2026_11_19.md).
Evidencias nuevas: `artifacts/public-followup-2026-11-19/`, excluidas de Git.

## Estado y resultado

**Corrección implementada, probada y activa exclusivamente en staging.** Se eliminó
una consulta redundante al regresar a una ficha que había sido la página inicial,
reutilizando solamente el remanente del TTL de cinco segundos ya existente.
No se amplió la frescura comercial ni se introdujo otra capa de caché.

Los dos picos históricos de Supabase quedaron correlacionados con el gateway
oficial: 920 y 831 ms dentro del tramo upstream. No se dispone de spans internos
que permitan atribuirlos a SQL, pool o PostgREST. **No se declaran solucionados.**
Las consultas SQL posteriores rápidas no demuestran cómo se ejecutaron aquellas
dos solicitudes lentas.

Se ensayaron tres variantes de arranque con Chrome real. No se conservaron:
bajar prioridades no produjo una mejora consistente y posponer JavaScript
perjudicó otros destinos o la disponibilidad de controles. No se presenta una
reducción del LCP por variación de red como una optimización implementada.

No se modificaron diseño, estilos, fuentes, calidad multimedia, animaciones,
reglas de precios/inventario/checkout, permisos, Auth/MFA ni RLS. No hubo compras,
pagos, cambios en pedidos comerciales, migraciones nuevas, índices, dependencias,
commit, push o despliegue productivo.

El catálogo alojado tenía un único producto publicado y activo durante estas
mediciones. Los resultados de navegador son reales, pero no demuestran tiempos
de carga con miles de productos en el servicio alojado.

## 1. Qué ocurrió en las dos solicitudes de Supabase

La consulta oficial de logs se acotó a 01:03:32.745–01:03:57.317 UTC del 20 de
noviembre, todavía 19 de noviembre en Lima. Se exportaron campos técnicos
seleccionados, sin cabeceras de autorización, cuerpos, SQL con datos de clientes
o credenciales. Se usó la CLI oficial para leer observabilidad, sin cambiar
dependencias de la aplicación o configuración del proyecto.

| Operación | HTTP navegador | Gateway origin_time | Upstream Envoy | Intentos |
| --- | ---: | ---: | ---: | ---: |
| catalog_home_context | 1075,6 ms | 1052 ms | 920 ms | 1 |
| catalog_browse | 1020,8 ms | 982 ms | 831 ms | 1 |

Home: Request ID `01a1f67b-111b-79ad-8539-9a07695b9860`, Trace ID
`01a1f67b111b79ad85399a07695b9860`, span `f6b0f4d5270d4d52`.
CF-Ray navegador `a5d38954ecca953c-LIM`; gateway de entrada
`a5d38954ecca953c`, respuesta interna `a5d389553dbd9542-LIM`.

Catálogo: Request ID `01a1f67b-1a48-7c4f-b5da-72e5cfa0af07`, Trace ID
`01a1f67b1a487c4fb5da72e5cfa0af07`, span `f503a52ce8a1e041`.
CF-Ray navegador `a5d389638f54953c-LIM`; gateway de entrada
`a5d389638f54953c`, respuesta interna `a5d389640998954c-LIM`.

Request ID y Ray de entrada coinciden exactamente. Son RPC directas del navegador
a Supabase: nuestro Worker no participa. El tramo Envoy abarca la mayor parte
del tiempo observado, pero incluye trabajo y comunicación del servicio upstream;
**no equivale al tiempo puro de PostgreSQL**. Estos intervalos se solapan y no
deben sumarse. Un Ray interno diferente no demuestra por sí solo un reintento;
la cabecera de intentos indica uno.

En el rango hay 49 eventos edge_logs y uno postgres_logs. Buscar los IDs/traces
en todas las fuentes devuelve solamente esos dos eventos del gateway; no hay
eventos no-edge correlacionables por identificador, trace o ruta. No se ocultó
telemetría inexistente con una estimación del pool o de SQL.

La Management API confirma desarrollo en `sa-east-1`, estado
`ACTIVE_HEALTHY`. LIM es el ingreso Cloudflare observado, no la región del
servidor PostgreSQL. No se cambiaron región, DNS, protocolos ni pool.

### PostgreSQL y capacidad: evidencia y límites

Seis EXPLAIN (ANALYZE, BUFFERS) posteriores bajo rol anon y transacciones de solo
lectura: Home 22,332 / 8,975 / 8,634 ms; catálogo 10,901 / 8,493 / 8,435 ms.
No hubo bloques físicos o temporales en esas ejecuciones, bloqueos ni transacciones
abandonadas. Son otras solicitudes, no un plan correlacionado con los dos picos.

Los agregados históricos de pg_stat_statements tienen medias aproximadas de
31–33 ms y máximos de 1407–2288 ms. No llevan el timestamp/request ID de cada
ejecución ni identifican la versión de la consulta: no descartan ni prueban SQL
como causa de esos dos eventos concretos. No se borraron estadísticas.

Instantánea Metrics API: pool PostgREST máximo 10, seis conexiones disponibles,
cero esperas y cero timeouts; load1 0,01 y cero OOM. RAM física 432 MiB,
disponibles unos 114 MiB y swap ocupado unos 329 MiB. El margen entre CommitLimit
y Committed_AS ronda 6,3 MiB: es una señal de capacidad ajustada, **no RAM física
usada ni prueba de una pausa histórica**. No hay una serie de CPU/memoria/pool
en el instante de esos dos IDs que permita culpar al plan Free.

No se añadieron índices: la ejecución medida no los justifica. No se incrementaron
timeouts, reintentos o TTL. No se recomienda pagar un compute superior como
solución demostrada de esta intervención. Falta una comparación de capacidad
controlada y la telemetría interna del proveedor.

Se preparó `upstream/support-packet.md`, sin enviar un ticket. Solicita llegada y
despacho gateway/PostgREST, adquisición de conexión, inicio/fin SQL, serialización,
envío y métricas históricas ligados a los IDs anteriores. La causa interna exacta
queda **pendiente de telemetría del proveedor**.

### El pico volvió a ocurrir en esta intervención

En los nuevos recorridos hubo 120 RPC medidas por versión: HTTP p50/p95
169/214 → 175/311 ms; Envoy 12/23 → 12/139 ms. La candidata registró una RPC
`catalog_browse` de 1087,6 ms al ordenar en móvil. ID
`01a1f714-e9a9-742c-a27d-60d717912a4a`, CF-Ray
`a5d47f7c182cc2a8-LIM`, Trace ID `01a1f714e9a9742ca27d60d717912a4a`.
El gateway oficial confirma origin_time 1031 ms, upstream 923 ms y un intento.
Chrome usó una conexión H3 reutilizada, sin DNS/TLS nuevos. **Esta reproducción
descarta una explicación exclusivamente DNS para ese pico y confirma que sigue
existiendo latencia upstream.** No pasó por nuestro Worker.

Se correlacionaron también cuatro peticiones rápidas de ambas versiones:
upstream 10–13 ms frente a origin_time 109–116 ms. Estos campos tienen ámbitos
distintos: la diferencia no se etiqueta como CPU del gateway sin más spans.

Para separar SQL y HTTP se hicieron otras 50 RPC secuenciales, cada una rodeada
por lecturas de pg_stat_statements. En las 50 el contador del SQL correspondiente
a anon aumentó exactamente uno y stats_reset no cambió: la diferencia de tiempo
SQL es atribuible a esa llamada dentro de la ventana observada. HTTP p50/p95:
144,5/252,1 ms; Envoy 12/39 ms; SQL 10,4/23,0 ms. Máximo SQL 69,9 ms. JIT está
desactivado; las diferencias observadas de JIT, bloques leídos y temporales fueron
cero. No se habilitó track_io_timing, que sigue desactivado. Esta cohorte no tuvo
otro pico de 750 ms, **por lo que no aporta un SQL emparejado a la llamada de
1087,6 ms** y no elimina su incertidumbre interna. No se reseteó ninguna estadística.
Evidencias: `upstream/new-requests.json` y `upstream/paired-sql-http.json`.

## 2. Corrección aplicada a la navegación

Home y Tienda ya incorporaban sus DTO iniciales validados a la caché de lectura;
Producto los consumía una sola vez y no los incorporaba. Abrir directamente una
ficha, visitar Contacto y volver dentro de cinco segundos repetía
`catalog_product_context`, aun cuando el DTO inicial seguía siendo válido.

Ahora `readRemoteProductContext` ejecuta los mismos validadores completos,
comprueba el slug y llama a `seedInitialPublicQuery` con `performance.now()`.
La entrada utiliza solo el tiempo restante desde la navegación original: no
reinicia el contador al volver. El dato no entra en localStorage ni en una
caché compartida de servidor. Invalidación, expiración, proyecto/path incorrecto
o documento malformado conservan la lectura normal de Supabase.

Archivos: `src/services/remote-catalog-queries.ts`, comentario actualizado en
`src/services/product-bootstrap.ts` y tres escenarios añadidos en
`tests/supabase-catalog.spec.ts`. Se comprobaron expresamente la expiración
original a 5000 ms, invalidación y slug de registro incorrecto. La reserva,
cotización y confirmación continúan validándose en el servidor.

### Regresar a una ficha que era la página inicial

Diez contextos reales por perfil y versión; Producto → Contacto → historial atrás.
No se excluyen muestras por superar el TTL. Disponibilidad incluye la interacción
y planificación de Playwright; no es INP de campo. Valores p50 / p95 en ms:

| Perfil | Interfaz antes → después | Foto decodificada antes → después | RPC Producto, diez recorridos | Documentos ya mayores de 5 s al volver, antes → después |
| --- | ---: | ---: | ---: | ---: |
| Escritorio | 577 / 1,368 → 10 / 12 | 581 / 1,372 → 17 / 19 | 10 → 0 | 0 → 0 |
| Móvil 4G | 285 / 1,994 → 71 / 141 | 304 / 2,002 → 96 / 149 | 10 → 0 | 0 → 0 |
| Móvil lento | 433 / 1,453 → 144 / 320 | 441 / 1,462 → 155 / 348 | 10 → 1 | 0 → 1 |

Si un documento inicial vence, el loader conserva su consulta fresca normal;
esa respuesta puede usar después su propia ventana habitual de lectura. No se
afirma que toda navegación de producto quede libre de consultas: la corrección
específica cubre la adopción inicial y el retorno todavía válido.

## 3. Primera carga y experimentos controlados

El contenido principal ya llega en HTML híbrido request-local antes de React.
La aplicación lo sustituye progresivamente con createRoot; no es hidratación de
un árbol React completo. Las imágenes críticas se descubren en ese HTML.

Una traza inicial de Tienda móvil muestra la imagen solicitada a ~457 ms y
decodificada a ~1573 ms, CSS principal terminado a ~1905 ms, primera pintura a
~2008 ms, relevo React a ~2544 ms y LCP final a ~2572 ms. Hay una sola descarga
de esa foto por red y dos eventos load de instancias DOM; no se presenta el
segundo load como otra descarga lenta de R2. CSS, secuencia de representación y
relevo visual siguen contribuyendo; quitar animaciones o recortar calidad para
mejorar la métrica violaría el alcance.

En la traza Home anterior, las tareas largas de arranque ocurrían después del
primer LCP. Reducir únicamente su bundle no demostraría que la fotografía
aparece antes. No se cambió de framework ni se separaron módulos por intuición.

Se compararon tres prototipos, cinco pares por ruta en Chrome CPU×4/4G lento.
Ambos brazos de cada ensayo reciben el mismo HTML mediante buffering CDP; solo
cambian prioridad o calendario de descarga de módulos. Esto modifica los tiempos
absolutos frente al streaming desplegado: **estos números son experimentales**,
no resultados de la candidata final. CSP, CSS, fuentes, datos e imágenes no se
sustituyeron. La tercera serie se completó desde un checkpoint de 28 muestras,
añadiendo el último par; los horarios originales permanecen en los registros.

| Prototipo | Ruta | LCP p50 / p95, control → variante | React disponible p50 / p95 | Decisión |
| --- | --- | ---: | ---: | --- |
| priority-experiment | Home | 2,368 / 2,456 → 2,380 / 2,444 | 2,838 / 2,931 → 2,861 / 2,928 | Descartado |
| priority-experiment | Tienda | 2,676 / 3,356 → 2,676 / 3,400 | 2,650 / 3,327 → 2,649 / 3,366 | Descartado |
| priority-experiment | Producto | 2,404 / 2,448 → 2,384 / 2,452 | 2,908 / 3,001 → 2,894 / 3,022 | Descartado |
| critical-gate-experiment | Home | 2,416 / 3,684 → 1,800 / 2,744 | 3,556 / 4,134 → 3,738 / 4,753 | Descartado |
| critical-gate-experiment | Tienda | 2,724 / 4,708 → 3,392 / 4,324 | 2,693 / 4,676 → 3,360 / 4,292 | Descartado |
| critical-gate-experiment | Producto | 2,452 / 3,388 → 3,516 / 3,716 | 2,952 / 3,856 → 3,546 / 3,658 | Descartado |
| gate-hints-experiment | Home | 2,412 / 3,316 → 1,756 / 2,676 | 2,987 / 3,848 → 3,235 / 4,125 | Descartado |
| gate-hints-experiment | Tienda | 2,644 / 2,780 → 2,872 / 3,992 | 2,613 / 2,748 → 2,834 / 3,958 | Descartado |
| gate-hints-experiment | Producto | 2,556 / 3,816 → 3,188 / 8,868 | 3,113 / 4,189 → 3,215 / 8,819 | Descartado |

El primer ensayo sí cambió la prioridad efectiva de los scripts de High a Low,
pero no dio una mejora consistente. Esperar CSS retirando las precargas adelantó
la imagen del Home y retrasó controles/otros destinos. Restaurar simultáneamente
las precargas después de CSS redujo parte de esa penalización, sin justificar
una mejora global. Los tres se descartaron. Sus módulos de prueba no están en
dist ni en el despliegue.

## 4. Comparativa del despliegue real

Base activa medida: `347898f7-72c5-4fcc-9493-0720e7dccf29`.
Candidata final activa: `a30320ac-9473-4a11-8055-a838a5b4f0bb`.

Por versión: 90 cargas, cinco procesos Chrome nuevos por ruta/perfil seguidos
de recarga caliente. Escritorio CPU1; móvil 4G CPU×4/9 Mbps/80 ms; móvil lento
CPU×4/1,6 Mbps/150 ms. Frío significa caché del navegador vacía, no un MISS físico
de CDN/R2. Las URLs de fotografía principal coinciden entre cohortes.

p50 es mediana convencional y p95 rango más cercano. Con cinco muestras p95 es
el máximo: se conservan tamaños y rangos en comparison.json. Las fases son
secuenciales, no un ensayo aleatorizado; una diferencia de red no prueba una
optimización del frontend. No se cambió CSS ni se aplicaron los prototipos.

Valores LCP y TTFB p50 / p95 en ms; bytes y solicitudes son medianas:

| Perfil | Ruta | Caché | LCP antes → después | TTFB antes → después | Bytes antes → después | Solicitudes antes → después |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Escritorio | Home | Fría | 1,000 / 1,556 → 1,036 / 1,356 | 398 / 908 → 416 / 649 | 1,459,403 → 1,459,361 | 30 → 30 |
| Escritorio | Home | Caliente | 268 / 280 → 268 / 332 | 191 / 203 → 202 / 231 | 15,765 → 15,906 | 30 → 30 |
| Escritorio | Tienda | Fría | 928 / 1,168 → 896 / 1,728 | 454 / 596 → 352 / 520 | 476,902 → 476,541 | 17 → 17 |
| Escritorio | Tienda | Caliente | 268 / 296 → 268 / 288 | 175 / 201 → 189 / 231 | 15,994 → 16,094 | 17 → 17 |
| Escritorio | Producto | Fría | 876 / 972 → 1,060 / 2,016 | 387 / 421 → 395 / 1,465 | 840,153 → 840,267 | 20 → 20 |
| Escritorio | Producto | Caliente | 284 / 312 → 280 / 432 | 211 / 241 → 218 / 351 | 15,854 → 15,623 | 20 → 20 |
| Móvil 4G | Home | Fría | 1,460 / 1,660 → 1,004 / 1,352 | 533 / 687 → 371 / 500 | 1,146,047 → 1,145,833 | 28 → 28 |
| Móvil 4G | Home | Caliente | 296 / 336 → 272 / 288 | 202 / 226 → 195 / 198 | 61,132 → 61,160 | 30 → 30 |
| Móvil 4G | Tienda | Fría | 1,244 / 1,544 → 1,232 / 2,296 | 350 / 490 → 388 / 1,361 | 452,686 → 452,649 | 16 → 16 |
| Móvil 4G | Tienda | Caliente | 408 / 480 → 472 / 668 | 178 / 232 → 179 / 183 | 16,145 → 15,998 | 16 → 16 |
| Móvil 4G | Producto | Fría | 1,276 / 1,308 → 1,496 / 2,396 | 410 / 415 → 396 / 1,486 | 587,335 → 587,457 | 17 → 17 |
| Móvil 4G | Producto | Caliente | 468 / 580 → 520 / 652 | 218 / 237 → 222 / 261 | 15,613 → 15,903 | 17 → 17 |
| Móvil lento | Home | Fría | 2,296 / 2,316 → 2,380 / 3,292 | 420 / 449 → 415 / 1,386 | 465,460 → 471,316 | 26 → 26 |
| Móvil lento | Home | Caliente | 356 / 380 → 400 / 432 | 201 / 210 → 198 / 217 | 15,759 → 15,926 | 26 → 26 |
| Móvil lento | Tienda | Fría | 2,828 / 6,588 → 3,600 / 4,336 | 363 / 1,353 → 1,331 / 1,346 | 452,850 → 452,726 | 16 → 16 |
| Móvil lento | Tienda | Caliente | 540 / 856 → 488 / 568 | 182 / 578 → 165 / 209 | 16,001 → 16,001 | 16 → 16 |
| Móvil lento | Producto | Fría | 2,504 / 2,672 → 2,428 / 3,388 | 603 / 750 → 495 / 1,451 | 587,410 → 587,430 | 17 → 17 |
| Móvil lento | Producto | Caliente | 508 / 788 → 564 / 660 | 231 / 503 → 222 / 342 | 15,710 → 15,688 | 17 → 17 |

CLS máximo observado de cargas iniciales: 0.0006. Las tareas largas
y heap se conservan en los datos crudos; no se declara una mejora estructural del
JavaScript, memoria o LCP frío por la modificación de caché de una ficha. Tampoco
hay INP de campo o comprobación física nueva de teléfonos.

### Regresión fría y tramo DNS

La tabla incluye una regresión real de LCP frío en varias celdas. En nueve de las
45 cargas frías posteriores Chrome registró 1009–1033 ms de DNS antes de conectar;
la cohorte anterior no tuvo DNS mayor de 750 ms y ninguna recarga caliente lo
tuvo. El retraso se conserva en los resultados, sin eliminar muestras ni restarlo
para anunciar un LCP optimizado. Por ejemplo, Producto escritorio tuvo DNS
1009,7 ms, TTFB 1465,4 ms, contexto de catálogo Worker 49 ms y metadatos 38 ms.
En Producto móvil lento hubo DNS 1033,4 ms, TTFB 1451,2 ms y contexto Worker 50 ms.

Estos eventos localizan aproximadamente un segundo antes de TLS/envío HTTP y
no en PostgreSQL o ejecución del Worker. No identifican por sí solos qué resolver,
ISP o mecanismo interno de Chrome lo originó. Se hizo una comprobación adicional
con NetLog, procesos nuevos y controles temporales de navegador, sin cambiar DNS
del sistema o red productiva. Fueron 15 procesos y 30 cargas: cinco procesos por
configuración, cada uno con una recarga caliente. Se verificaron los argumentos
efectivos de Chrome, incluido retirar el argumento de Playwright que desactiva
red en segundo plano en el brazo de control correspondiente.

| Configuración diagnóstica de Chrome | DNS frío p50 / p95 | DNS >750 ms | Protocolo observado |
| --- | ---: | ---: | --- |
| Argumentos de la auditoría | 9,3 / 42,9 ms | 0/5 | H3 |
| Sin desactivar red en segundo plano | 10,9 / 36,4 ms | 0/5 | H3 y H2 |
| HTTP/2 temporal, solo proceso de prueba | 0,05 / 18,4 ms | 0/5 | H2 |

Ninguna de esas 15 conexiones frías posteriores reprodujo el segundo de DNS.
Esto **no demuestra que desapareciera ni que un argumento fuera su causa**.
Forzar H2 no produjo una ventaja consistente y no se conservó. No se modificó
DNS, protocolos del servidor ni configuración global del navegador.

Se conserva además un nuevo caso atípico del control sin ese argumento:
Home LCP 7012 ms, TTFB 1338 ms y DNS 0,12 ms. El documento de 1715 bytes llegó
sin la proyección inicial ni las cabeceras de diagnóstico public_context; el
navegador recuperó datos después de arrancar React. La imagen principal comenzó
a ~4891 ms y terminó a ~6986 ms; su manifiesto tardó 313 ms y almacenamiento
5 ms. Por ello, ese LCP **no puede atribuirse a DNS ni únicamente a R2**. El
código conserva una salida al shell cuando falla la preparación pública; sin
el evento interno correlacionado no se identifica cuál de sus lecturas falló.
No se declara corregida esta degradación ocasional ni se aumenta su timeout.
Los datos permanecen separados de las cohortes comparativas principales en
`netlog-browser.json` y `netlog-analysis.json`; `dns-analysis.json` conserva
las 180 cargas originales.

### Recorridos SPA completos

Cinco ciclos por perfil, cada uno precedido por un recorrido completo de
calentamiento excluido: 150 pasos medidos por versión y 150 de calentamiento.
Home/Tienda, marca, filtros, ordenamiento, ficha, variante, carrito, Contacto y
entrada a checkout. No se envían pedidos. Valores p50 / p95 en ms; RPC es la
duración HTTP de las lecturas observadas, no tiempo puro SQL:

| Perfil | Paso | Datos/interfaz antes → después | RPC HTTP antes → después | Número mediano RPC antes → después |
| --- | --- | ---: | ---: | ---: |
| Escritorio | Home | 161 / 202 → 149 / 165 | 148 / 193 → 138 / 155 | 1 → 1 |
| Escritorio | Tienda | 156 / 169 → 146 / 186 | 142 / 156 → 137 / 177 | 1 → 1 |
| Escritorio | brand-lattafa | 149 / 151 → 149 / 165 | 143 / 143 → 141 / 157 | 1 → 1 |
| Escritorio | sort-price | 150 / 176 → 149 / 161 | 144 / 169 → 142 / 153 | 1 → 1 |
| Escritorio | remove-brand-filter | 155 / 230 → 162 / 231 | 149 / 223 → 155 / 223 | 1 → 1 |
| Escritorio | Producto | 149 / 163 → 153 / 195 | 140 / 152 → 142 / 185 | 1 → 1 |
| Escritorio | add-local-cart | 2 / 3 → 2 / 3 | 141 / 144 → 142 / 152 | 1 → 1 |
| Escritorio | Contacto | 7 / 8 → 7 / 7 | — / — → — / — | 0 → 0 |
| Escritorio | cart | 8 / 8 → 7 / 8 | — / — → — / — | 0 → 0 |
| Escritorio | Checkout | 162 / 187 → 165 / 213 | 147 / 177 → 154 / 202 | 1 → 1 |
| Móvil 4G | Home | 231 / 256 → 226 / 372 | 170 / 191 → 165 / 311 | 1 → 1 |
| Móvil 4G | Tienda | 217 / 247 → 238 / 545 | 159 / 183 → 179 / 486 | 1 → 1 |
| Móvil 4G | brand-lattafa | 213 / 223 → 211 / 451 | 166 / 173 → 165 / 405 | 1 → 1 |
| Móvil 4G | sort-price | 203 / 247 → 204 / 1,122 | 170 / 213 → 171 / 1,088 | 1 → 1 |
| Móvil 4G | remove-brand-filter | 201 / 288 → 203 / 753 | 165 / 246 → 172 / 720 | 1 → 1 |
| Móvil 4G | Producto | 233 / 288 → 226 / 450 | 192 / 237 → 181 / 405 | 1 → 1 |
| Móvil 4G | add-local-cart | 15 / 20 → 15 / 15 | 153 / 512 → 170 / 265 | 1 → 1 |
| Móvil 4G | Contacto | 50 / 54 → 47 / 49 | — / — → — / — | 0 → 0 |
| Móvil 4G | cart | 44 / 51 → 45 / 57 | — / — → — / — | 0 → 0 |
| Móvil 4G | Checkout | 226 / 272 → 222 / 363 | 161 / 208 → 164 / 306 | 1 → 1 |
| Móvil lento | Home | 255 / 374 → 254 / 307 | 193 / 321 → 193 / 247 | 1 → 1 |
| Móvil lento | Tienda | 262 / 269 → 266 / 339 | 205 / 209 → 207 / 279 | 1 → 1 |
| Móvil lento | brand-lattafa | 229 / 253 → 235 / 253 | 181 / 193 → 189 / 207 | 1 → 1 |
| Móvil lento | sort-price | 233 / 249 → 215 / 245 | 199 / 214 → 184 / 207 | 1 → 1 |
| Móvil lento | remove-brand-filter | 228 / 233 → 217 / 229 | 196 / 199 → 184 / 197 | 1 → 1 |
| Móvil lento | Producto | 248 / 257 → 239 / 250 | 196 / 204 → 186 / 203 | 1 → 1 |
| Móvil lento | add-local-cart | 16 / 16 → 15 / 21 | 191 / 206 → 188 / 200 | 1 → 1 |
| Móvil lento | Contacto | 46 / 52 → 46 / 46 | — / — → — / — | 0 → 0 |
| Móvil lento | cart | 45 / 58 → 45 / 57 | — / — → — / — | 0 → 0 |
| Móvil lento | Checkout | 250 / 285 → 254 / 255 | 191 / 198 → 193 / 196 | 1 → 1 |

El recorrido largo puede agotar los cinco segundos y requerir consultas nuevas;
no se prolonga la caché para obtener HIT artificial. Un cero de peticiones es
reutilización válida, no una autorización cacheada. Las filas sin RPC tienen
duración —, no una consulta SQL de cero milisegundos. CLS máximo SPA observado:
0.0528, distinto del CLS de la carga inicial. Los eventos y latencias
atípicas se conservan sin descartarlos.

### Worker, manifiesto y R2

50 solicitudes multimedia por fase más una de descubrimiento y nueve documentos,
seriales y acotadas. No hubo purga, apertura de bucket ni creación de objetos.
El código del Worker es idéntico al anterior (ETag comprobado); diferencias de
red de estas cohortes **no son una mejora de Worker implementada aquí**.
Tiempos p50 / p95 en ms:

| Tipo | n por fase | Cabeceras antes → después | Cuerpo antes → después | Manifiesto HTTP antes → después | Envoy antes → después | Caché/almacenamiento antes → después | HIT antes → después |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| webp | 20 | 215 / 254 → 205 / 218 | 46 / 71 → 45 / 66 | 21 / 63 → 23 / 32 | 3 / 4 → 3 / 10 | 4 / 6 → 4 / 6 | 20/20 → 20/20 |
| svg | 5 | 224 / 248 → 205 / 230 | 1 / 8 → 1 / 6 | 23 / 52 → 23 / 40 | 2 / 5 → 2 / 9 | 5 / 14 → 4 / 11 | 5/5 → 5/5 |
| conditional | 25 | 205 / 226 → 197 / 203 | 0 / 0 → 0 / 0 | 22 / 39 → 20 / 25 | 2 / 2 → 2 / 4 | 4 / 5 → 4 / 5 | 25/25 → 25/25 |
| document | 9 | 222 / 246 → 203 / 237 | 15 / 50 → 10 / 41 | — / — → — / — | — / — → — / — | — / — → — / — | 0/9 → 0/9 |

Se mantiene la comprobación fresca de publicación del manifiesto y la caché de
bytes inmutables, incluida su optimización 304 anterior. No se cachea autorización.
Los intervalos Server-Timing se solapan y no deben sumarse. La duración Tail
incluye esperas/waitUntil y no equivale al TTFB. Solo se presentan los IDs que
efectivamente pudieron correlacionarse, no todos los requests como si tuvieran Tail.

## 5. Pruebas y sincronización

| Suite afectada | Resultado |
| --- | --- |
| catalog | 109 aprobadas, 0 fallidas |
| seo | 80 aprobadas, 0 fallidas |
| media-worker | 169 aprobadas, 0 fallidas |
| home | 8 aprobadas, 0 fallidas |
| checkout | 30 aprobadas, 0 fallidas |
| account | 97 aprobadas, 0 fallidas |
| favorites | 19 aprobadas, 0 fallidas |
| navigation | 48 aprobadas, 0 fallidas |
| Node | 216 aprobadas |
| TypeScript, ESLint, build staging, sellado y Wrangler dry-run | Aprobados |

Son 560 ejecuciones de Playwright en ocho
suites, no la ejecución completa de todas las pruebas históricas del repositorio.
No se aumentaron timeouts/reintentos. Las pruebas funcionales aisladas se
distinguen de las comprobaciones de servicios alojados.

En la candidata desplegada se completaron además: 24 vistas públicas en 360,
390, 430, 768, 1024 y 1440 px; checkout Datos/Entrega/Revisión/volver en seis
anchuras sin enviar pedido; dos clientes y un administrador AAL2 temporales con
aislamiento real y retirada de fixtures; 56 comprobaciones HTTP de acceso público,
privacidad y CORS. Las fotografías decodifican y no hay desbordamientos o errores
de JS en las vistas comprobadas. Móvil conserva la prohibición de descargar vídeo
según el breakpoint existente. No se ensayaron pagos reales.

| Elemento | Verificación |
| --- | --- |
| Worker | aroma-infini-frontend-staging |
| Versión activa al 100 % | a30320ac-9473-4a11-8055-a838a5b4f0bb |
| Deployment | 4af6b5b5-04dd-4fcc-baf9-002e4367804e |
| Entrada JavaScript | /assets/index-DOahbtc2.js |
| SHA-256 entrada JS | 47cea1b10ee236aae906e8a1a661c66b4556897d01ff0086458fd8266f4a1530 |
| SHA-256 paquete | d6c2b915881e66158ed3e3b3a3655297d263be9955ba7003d3d557a7ed78c54b |
| Worker ETag | 1aa5749e843de16108ba05ce54d5f123d77fac957a285926386ef6475fa1877c |
| SHA-256 Wrangler | 3de706eeb412b5e34f4d513d8c7628182e55c8d914c87aa3711327666a846249 |
| Recursos JS/CSS/fuentes/PWA alojados | 140 hashes coincidentes con el paquete |
| Estilos/fuentes | 42 recursos idénticos a la base |
| Supabase desarrollo | 49 migraciones, 0 pendientes, historial coincidente |
| Tipos TypeScript remotos | 021857a7c45356d3764d86c8302cdaf5c7fd06d3e6952f6d180d85015ccae891 coincidente |
| RLS/roles/permisos | Fundamentos aprobados, sin cambios |
| R2 | aroma-infini-media-dev privado, acceso directo desactivado |
| Producción | Intacta: ec8554f6-d47a-4af0-ba60-4623c8125020, deployment 9baa7c50-262a-4f23-bf52-5742a52ffa0b |

No se aplicó SQL porque no había migraciones pendientes ni una corrección de
esquema justificada. El build conserva la poda existente de copias generadas en
dist; no elimina fuentes, imágenes comerciales o archivos de R2. Git conserva
develop y el HEAD inicial; no se hizo commit, push o reset.

## 6. Incidente de evidencias y límites finales

Un runner heredó una ruta sin barra final que la preparación no sustituyó:
la nueva base SPA de 347898 sobrescribió el JSON y las capturas de la base 73bf
de la auditoría de caché anterior. Se corrigió la ruta, se copió completa la
nueva medición a esta carpeta y se anotó el informe previo. Se conservan su
comparison.json con agregados originales, su candidata 347898 y las demás
cohortes; **los datos crudos anteriores sobrescritos no se reconstruyeron**.
No afectó a código, configuración, clientes, productos, pedidos ni R2.
Esta comparación utiliza la nueva base completa, correctamente identificada,
y no trata sus observaciones como si fueran las de 73bf. El incidente queda en
evidence-path-correction.json y previous-evidence-preserved/.

La mejora conservada elimina una espera HTTP innecesaria en el retorno válido a
una ficha inicial. No convierte en instantáneas las consultas necesarias tras
vencer el TTL. Los experimentos no justificaron otra modificación de arranque
segura que mejorase simultáneamente las tres páginas y sus controles.

Los dos picos históricos siguen abiertos en cuanto a su causa interna. Que una
cohorte posterior no los reproduzca no demuestra que hayan desaparecido. El
reporte y el paquete para soporte distinguen lo comprobado de las hipótesis.
No se vende un cambio de plan como solución de un problema que no fue atribuido
causalmente al compute. La primera carga fría sigue siendo una limitación real;
no se la oculta mediante imágenes inferiores, animaciones eliminadas o precios
antiguos.

## Evidencias y referencias

comparison.json; browser-before/after.json y traces/; navigation/product-return-
before/after.json; spa-baseline/candidate.json y spa-screens/; worker-before/after.json;
priority-experiment.json; critical-gate-experiment.json; gate-hints-experiment.json;
upstream/correlated.json, service-visibility.json, database.json, new-requests.json,
paired-sql-http.json y support-packet.md; dns-analysis.json; netlog-browser.json y
netlog-analysis.json;
tests.json; quality-final.json; runtime-verified.json; schema-final.json;
environments-final.json; style-proof.json; final-checks.json y preservation-final.json.

Capturas: [Home móvil](../artifacts/public-followup-2026-11-19/screens/after-slowMobile-home-hot.png),
[Tienda escritorio](../artifacts/public-followup-2026-11-19/screens/after-desktop-store-hot.png),
[Producto móvil](../artifacts/public-followup-2026-11-19/screens/after-slowMobile-product-hot.png),
[Checkout móvil](../artifacts/public-followup-2026-11-19/checkout-after/revision-390.png).

Referencias oficiales:
[correlación de logs](https://supabase.com/docs/guides/observability/advanced-log-filtering),
[campos y fuentes](https://supabase.com/docs/guides/observability/log-field-reference),
[Fetch Priority](https://web.dev/articles/fetch-priority),
[trazas de Workers](https://developers.cloudflare.com/workers/observability/traces/).
