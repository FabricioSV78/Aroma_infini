# Manifiestos multimedia y upstream de Supabase — 14 de noviembre de 2026

Continuación del [informe correlacionado del 13 de noviembre](CORRELATED_LATENCY_2026_11_13.md). Alcance: observabilidad del upstream, número de verificaciones y alternativas de publicación multimedia. No se cambió el frontend.

## Resultado

**La investigación está terminada con una limitación explícita del proveedor; el pico interno de 1.000 ms sigue sin causa demostrada y no se declara corregido.** Se recuperó de nuevo su evento exacto, se incorporaron mediciones oficiales de PostgREST, se correlacionaron 84 lecturas y se comprobó la amplificación de consultas por imagen. No apareció otro pico de un segundo en las 60 lecturas finales; eso no demuestra su desaparición.

| Punto | Estado |
| --- | --- |
| Correlación exacta Worker → gateway para 84 lecturas | Comprobado |
| Fases PostgREST y Envoy en 60 lecturas finales | Comprobado |
| Causa interna del pico histórico | Pendiente de telemetría de Supabase |
| Una consulta de manifiesto por descarga dinámica | Comprobado, incluso con HIT de bytes |
| Reducción nueva de latencia o de consultas | No se afirma; esta entrega mejora el diagnóstico |
| Bucket privado, referencias, RLS, MFA y reglas comerciales | Conservados |
| Producción | Sin operaciones ni despliegues |

Se preparó una [solicitud técnica para soporte](SUPABASE_UPSTREAM_SUPPORT_2026_11_14.md). No se envió ningún mensaje externo.

## 1. El pico histórico: qué se sabe exactamente

| Campo | Valor confirmado |
| --- | --- |
| Momento UTC | `2026-11-14T01:12:24.523Z` |
| Hora de Lima | 13 de noviembre, 20:12:24.523 |
| Operación | `POST /rest/v1/rpc/media_public_asset` |
| Request ID de Supabase | `01a1d79c-decb-725c-b25c-da99c0267437` |
| Request ID del Worker | `fc64114c-29f0-4cf2-8d76-a4c181cbf2c7` |
| Trace ID | `fc64114c29f04cf28d76a4c181cbf2c7` |
| Span ID | `fc64114c29f04cf2` |
| Gateway / entrada | versión `1` / `GRU` |
| Resultado / intentos upstream | HTTP 200 / 1 |
| Manifiesto HTTP medido por el Worker | 1.021 ms |
| Envoy upstream service time | 1.000 ms |
| `origin_time` registrado por el gateway | 1.009 ms |

La consulta histórica por ID **o** trace devolvió un evento del gateway. No devolvió un span interno que divida esos 1.000 ms. Envoy incluye el procesamiento upstream y la comunicación con ese servicio; no es un cronómetro exclusivo de SQL. [Definición oficial de Envoy](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/router_filter).

No hay evidencia suficiente para atribuirlo a PostgreSQL, adquisición de conexión, Supavisor, DNS, TLS, CPU o una cola. Tampoco demuestra que Supabase Free sea la causa. Cambiar de plan o aumentar el pool sin esos datos sería una hipótesis, no una solución demostrada.

## 2. Observabilidad añadida y límites

En staging, `worker/public-read-timing.ts` añade a los identificadores existentes:

- `manifest_body`: lectura/decodificación del cuerpo, separada de la espera de cabeceras.
- `envoy_upstream` y número de intentos upstream en el log estructurado.
- Las fases numéricas documentadas `jwt`, `parse`, `plan`, `transaction` y `response` de PostgREST, cuando el proveedor las devuelve.

Se aceptan únicamente nombres conocidos, duraciones acotadas y cabeceras de tamaño limitado. No se reenvían descripciones arbitrarias, SQL, claves, sesiones ni cuerpos. En producción esta instrumentación permanece desactivada. [Observabilidad oficial de PostgREST](https://docs.postgrest.org/en/v14/references/observability.html).

Se comprobó `application_name = PostgREST 14.18`. En el código de esa versión, el cronómetro de `transaction` rodea `AppState.usePool`: **incluye la adquisición/uso del pool y la transacción**. `plan` es la construcción del plan de la petición en PostgREST, no un EXPLAIN del planificador PostgreSQL. Las fases no permiten separar por sí solas espera de pool y ejecución SQL. [Código exacto de PostgREST 14.18](https://github.com/PostgREST/postgrest/blob/v14.18/src/PostgREST/App.hs#L159-L186).

Para esta medición se habilitó temporalmente `pgrst.server_timing_enabled` en `authenticator`, con recarga de configuración. **Se restauró al estado anterior, sin esa propiedad**, y tres respuestas reales confirmaron la retirada de `Server-Timing` de PostgREST. No se habilitaron logs de consultas, EXPLAIN HTTP ni logging general de datos. El Worker queda preparado para capturar esas fases en una próxima ventana controlada. [Configuración y recarga oficiales](https://docs.postgrest.org/en/v14/references/configuration.html#server-timing-enabled).

### Pool y registros disponibles

El endpoint oficial de métricas respondió correctamente usando la credencial de servidor ya existente, sin exponerla en archivos de evidencia. Instantánea a las `2026-11-14T14:40:44.259Z`:

| Métrica PostgREST | Valor |
| --- | ---: |
| `pgrst_db_pool_max` | 10 |
| `pgrst_db_pool_available` | 8 |
| `pgrst_db_pool_waiting` | 0 |
| `pgrst_db_pool_timeouts_total` | 0 |

Esto demuestra disponibilidad **en esa instantánea**, no ausencia de esperas durante el pico histórico. El scrape no ofreció tiempo individual de adquisición por request. Doce instantáneas SQL de un segundo observaron conexiones PostgREST inactivas; tampoco pueden detectar todas las esperas breves de una cola HTTP. No se modificó ningún tamaño de pool. [Métricas oficiales de Supabase](https://supabase.com/docs/guides/observability/metrics).

En la ventana exacta de las 84 lecturas, el proveedor expuso 188 eventos `edge_logs`, 5 `postgres_logs`, 20 `auth_logs` y 4 `auth_audit_logs`. Los cinco de PostgreSQL no tenían request ID ni trace ID; no aparecieron fuentes PostgREST o pooler en esa ventana. La búsqueda de los IDs en los servicios internos devolvió cero coincidencias. **Cero registros correlacionables no significa cero esperas.** [Consulta oficial de logs y correlación](https://supabase.com/docs/guides/observability/advanced-log-filtering).

Faltan, para resolver el pico: spans gateway→PostgREST; reutilización/apertura y cola de conexión upstream; llegada y despacho en PostgREST; adquisición del pool por request; identificador de backend/consulta enlazado al trace; eventos de CPU, pausas, reinicios y saturación en ese instante. La petición de soporte enumera estos datos y los IDs exactos.

## 3. Mediciones reales y comparación

Primero se midieron 24 GET del control anterior. Después se verificaron despliegue, recursos frontend, bindings y esquema, y se ejecutaron **60 GET multimedia reales**: 42 seriales y 18 en grupos de tres, con dos pausas de 35 segundos. Se usaron archivos existentes: tres activos y nueve variantes reales de 480/960/1003 px. No se generaron objetos, productos, usuarios ni pedidos.

Corrección documental del 14 de noviembre: `sample-paths.json` registra 1003 px para estas fuentes; 1600 px es el máximo del perfil, no su dimensión real. Esta corrección no cambia las solicitudes ni los tiempos medidos.

Los 84 request IDs y traces coinciden exactamente con el gateway. Las 60 respuestas finales incluyen las fases PostgREST. El tail del Worker conservó CPU/wall y mensajes estructurados para 48 de esas 60; los otros doce conservan sus IDs, timings de respuesta y evento de gateway, pero **no se inventa su evento de tail**.

Percentiles por rango más próximo; milisegundos:

| Tramo | Control P50 / P95 / máximo (24) | Final P50 / P95 / máximo (60) |
| --- | --- | --- |
| Cliente HTTP: hasta cabeceras | 144,3 / 192,3 / 987,0 | 151,9 / 391,7 / 444,6 |
| Cliente HTTP: cuerpo | 21,3 / 30,3 / 30,3 | 22,6 / 97,9 / 112,4 |
| Cliente HTTP: respuesta completa | 164,2 / 218,9 / 994,3 | 181,8 / 402,6 / 515,9 |
| Worker: cabeceras del manifiesto | 13 / 35 / 520 | 24 / 54 / 66 |
| Envoy upstream | 3 / 23 / 184 | 3 / 18 / 19 |
| PostgREST `transaction` | No capturado por el control | 2,7 / 17,8 / 18,8 |
| Acceso a bytes/cache/R2 | 3 / 5 / 13 | 4 / 14 / 152 |

**Esta tabla no prueba una nueva mejora de rendimiento.** El control usa tres rutas y la serie final nueve tamaños/rutas, con diferentes bytes transferidos y conexiones frías. El código añadido es diagnóstico. Se conservan también los resultados desfavorables; no se atribuye al cambio de código que el máximo final sea menor. La mejora de aproximadamente 52 % de la entrega por caché de bytes pertenece al experimento anterior.

En la serie final hubo **59 HIT y 1 MISS**. Los HIT tuvieron acceso a bytes P50 de 4 ms y máximo de 18 ms. El único MISS necesitó 152 ms para obtener los bytes. Son lecturas hasta obtener la respuesta/stream de almacenamiento, no el tiempo de transferir todo el archivo al cliente. No hubo purga de caché: esto no es una distribución representativa de MISS mundiales o de un catálogo nuevo.

`manifest_body` marcó 0 ms con la resolución del reloj del Worker. No significa que leer o procesar JSON sea gratuito. CPU de los 48 eventos disponibles: P50 1 ms, máximo 6 ms. Las métricas están anidadas; no deben sumarse `transaction`, Envoy y manifiesto como si fueran tramos independientes.

### Solicitudes rápidas y lentas

- Pico histórico: manifiesto 1.021 ms, Envoy 1.000 ms, un intento. El interior de ese upstream sigue sin desglose.
- Primera lectura del control actual: cliente 987 ms, manifiesto 520 ms, `origin_time` 505 y Envoy 184 ms, con IDs exactos. Existe variación fuera del cronómetro Envoy; no permite nombrar su cola o conexión específica.
- Lectura final 32: cliente 418 ms hasta cabeceras, manifiesto 66 ms, Envoy 5 ms, PostgREST 4,1 ms, bytes HIT 18 ms; CPU 6 ms/wall 90 ms. Ese retraso completo no se explica por una consulta SQL de 418 ms.
- Tras las pausas, algunas transacciones subieron a unos 16–18 ms. No se presenta esa asociación temporal como prueba de reconexión del pool.

Cinco EXPLAIN anónimos antes dieron `1,335; 0,609; 0,601; 0,610; 0,667 ms`; después, `1,306; 0,718; 0,621; 0,634; 0,661 ms`. Son muestras SQL separadas de los requests HTTP; no sustituyen el span ausente del pico ni justifican nuevos índices.

## 4. ¿Necesitamos una solicitud de manifiesto por imagen?

**Actualmente sí: por cada descarga dinámica que llega al Worker**, incluso en HIT de bytes. También se comprueba en HEAD y solicitudes condicionales. Si el navegador satisface una URL desde su propia caché, no hay esa nueva descarga al Worker.

Se midieron Home, Tienda y ficha con Chrome real, contextos nuevos de 1440 × 900 y 390 × 844, scroll completo y selección de las cuatro fotos de la galería. Control y versión final dieron los mismos conteos:

| Página | Escritorio: inicial / recorrido | Móvil: inicial / recorrido |
| --- | ---: | ---: |
| Home | 2 / 2 | 2 / 2 |
| Tienda | 2 / 2 | 2 / 2 |
| Ficha | 8 / 8 | 2 / 5 |

Son únicamente solicitudes **dinámicas de R2**, no todos los recursos estáticos de cada página. El catálogo real tiene un producto. En la ficha de escritorio, ocho rutas corresponden a cuatro activos en dos tamaños: miniaturas y galería, no ocho descargas idénticas. Los conteos no deben extrapolarse como un benchmark de miles de productos.

Los DTO del catálogo/Home ya incluyen `mediaAssets`, y el navegador los registra para resolver variantes; no se descubrió una consulta frontend de metadatos por cada card. La repetición restante es la verificación backend de cada GET. Si se descargan más rutas únicas, habrá más verificaciones: la caché de bytes resuelve el coste de R2, **no elimina la exposición a un upstream ocasionalmente lento**.

### Alternativas evaluadas

| Alternativa | Resultado y decisión |
| --- | --- |
| Agrupar metadatos al recuperar una página | Ya existe en sus DTO; conservar. No autoriza los GET futuros. |
| Nueva RPC batch sin cambiar el transporte de imágenes | No reúne GET independientes del navegador; añadirla sola no reduce llamadas. No implementada. |
| Memorizar `ready` o el resultado del manifiesto entre requests | Ocultaría desactivaciones/reclamaciones durante su TTL. Descartado. |
| Manifiesto firmado/versionado entregado con la página | Prueba integridad del contenido firmado, pero no que siga vigente. Sin consulta actual o invalidación coordinada no conserva revocación. No implementado. |
| Agrupador de promesas/consultas entre requests de un isolate | No aporta coordinación global; introduce propiedad de I/O y consistencia entre requests. No implementado. |
| Registro autoritativo de publicación fuera del camino SQL por imagen | Posible cambio estructural, condicionado a migrar todos los escritores, revocación y GC de forma consistente. Requiere otra implementación y pruebas; no es una caché de metadatos. |

No se introdujo una RPC sin consumidor ni una caché de autorización para aparentar una reducción de consultas.

## 5. Arquitectura híbrida: diseño y recomendación

**Mantener por ahora Worker → validación fresca → caché de bytes/R2 privado.** La alternativa directa puede eliminar el recorrido de manifiesto por descarga, pero aún no se ha demostrado que preserve todas las garantías actuales.

Separación propuesta, todavía no activada:

| Recursos | Almacenamiento y acceso |
| --- | --- |
| Originales, borradores, biblioteca no asignada, archivos privados | Bucket privado actual; administración autorizada por Worker |
| Derivados comerciales con referencias activas y publicación confirmada | Bucket publicado independiente, únicamente si se implementa el protocolo de publicación/revocación |
| Comandos, validación de archivos, referencias, autorización y limpieza | Backend con Supabase y Workers, nunca el navegador |

`api.media_public_asset` comprueba estado `ready`, almacenamiento y propósito; **no equivale a «tiene una referencia comercial activa»**. Permite también el flujo existente de biblioteca/vista previa. Copiar al bucket público todo activo `ready` publicaría material no asignado. No se hizo.

El protocolo futuro necesita estos requisitos, antes de habilitar entrega directa:

1. Registro de publicación separado de la preparación del archivo: UUID, hash, variantes verificadas, generación y referencias comerciales vigentes.
2. Todos los escritores —producto, Home, categorías, editorial, biblioteca y GC— coordinados con esa generación. Una copia idempotente u outbox por sí sola no resuelve la carrera «copiar mientras se retira la última referencia».
3. Borrado/reemplazo con barrera de publicación, protección frente a trabajos atrasados y prohibición de que una generación retirada reaparezca. SQL y R2 no comparten una transacción; hay que probar explícitamente esas intercalaciones y fallos.
4. URL inmutable nueva por sustitución, publicación de todas las variantes antes de entregar su referencia y limpieza sin afectar un recurso reutilizado.
5. Retirada de originales con la espera vigente de 24 horas y nueva comprobación de referencias; cancelación por reutilización antes de la reclamación terminal. El proceso existente no se modificó.
6. Para copias públicas: bloqueo de nuevas descargas y retirada/purga coordinadas con la política de caché. Una purga asíncrona o un TTL no equivale al 404 fresco que hoy puede producir el Worker tras revocar. Ningún sistema revoca una copia ya descargada por el cliente.

Un dominio R2 directo no ejecuta por sí solo la política SQL de la aplicación. Para conservar una decisión autoritativa en cada GET sin consultar Supabase, haría falta trasladar esa autoridad a un registro de publicación coherente y cubrir todas las escrituras. No se declara segura una entrega directa basada únicamente en «el nombre del archivo es difícil de adivinar». [Buckets públicos y dominios personalizados R2](https://developers.cloudflare.com/r2/buckets/public-buckets/).

No se abrió ni creó un bucket público, ni se copió material comercial. No hay un dominio multimedia de pruebas configurado: no se presenta una estimación como benchmark de CDN directo. Las subidas prefirmadas seguirían necesitando autorización inicial y validación/finalización de bytes en privado; no resuelven este cuello de botella de lectura. [URLs prefirmadas R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

## 6. Despliegue y validaciones

Antes de las 60 lecturas se verificaron versión real, configuración PostgREST efectiva, bindings, historia de migraciones y los bytes de doce recursos JS/CSS. Después de las pruebas se retiró la comparación temporal de versiones y se restauró la configuración diagnóstica SQL.

| Comprobación final | Resultado |
| --- | --- |
| Worker staging | `f8161bae-0669-43f0-a4e5-6dbb31100fa5`, 100 % |
| Despliegue final | `d2a3aebe-da4c-407c-aa09-c73ed40e7951` |
| Supabase / R2 | `aroma-infini-dev` / `aroma-infini-media-dev` |
| Paquete frontend | SHA-256 `c58b9d00e758ba9a7c702110ed6dc05d9b4b96ce5290df4f5a18e24e5a651c8e`, idéntico al control |
| Migraciones | 40, sin pendientes y con hashes coincidentes; ninguna nueva |
| Esquema antes/después | Mismo hash de catálogo `b1de20d24232497bd99d0e1b35852089be5a63151d4e3311e0f6fb8e50edddad` |
| Datos antes/después | 1 producto, 2 variantes, 0 pedidos; iguales |
| R2 público de desarrollo | HTTP 401, acceso directo desactivado |
| Diagnóstico temporal PostgREST | Restaurado; seis GET adicionales comprobaron la operación normal |
| TypeScript, lint, build y empaquetado Wrangler | Correctos |
| Pruebas Node aisladas | 198 aprobadas |
| Suite medios/Worker | 147 aprobadas, incluidas las cinco de diagnóstico |
| Suite SEO/Worker | 53 aprobadas |
| Catálogo con transporte aislado | 87 aprobadas |
| Checkout con transporte aislado | 24 aprobadas |
| Seguridad desplegada | 9 comprobaciones: HIT con nueva verificación, HEAD/304, namespace interno y tamaño inválido cerrados, ruta privada cerrada, carga anónima denegada y R2 privado |
| Navegación real en staging | 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844; catálogo, orden, búsqueda, vacío, imagen, carrito y entrada a checkout |

Las pruebas aisladas no se presentan como pruebas de carga alojadas. El recorrido real se detuvo antes de enviar pedidos o pagos. No hubo errores JavaScript ni desbordamiento horizontal en las comprobaciones. Los contextos móviles no solicitaron vídeos. Se conservaron capturas antes/después; no se modificaron estilos, fuentes, animaciones ni componentes del frontend. No se volvió a medir INP de campo o arranque JS: esta intervención no los optimizó ni afirma haberlos mejorado.

## 7. Evidencia y pendientes

Directorio local: `artifacts/upstream-manifest-2026-11-14/`, excluido de Git. Archivos principales:

- `correlated-requests.json`: las 84 filas con IDs y gateway exacto; fases y tail cuando están disponibles.
- `summary.json`: percentiles, HIT/MISS, patrones y solicitudes más lentas.
- `provider-historical.json`, `provider-cohort.json`, `provider-services.json`, `provider-sources.json`: resultados oficiales del proveedor.
- `provider-metrics.json`, `pool-observation.json`: pool e instantáneas agregadas.
- `before-pages.json`, `after-pages.json`, `screens/`: conteos y capturas de navegador.
- `verified-before-final-tests.json`, `verified-final.json`, `final-evidence.json`: despliegue, igualdad del frontend/esquema y regresiones.
- `timing-config-original.json`, `diagnostic-restore.json`: restauración del cambio temporal.

**Pendientes concretos:** obtener de Supabase el desglose interno del request histórico y su vínculo con una conexión/transacción; si el proveedor no lo conserva, acordar una ventana con spans de adquisición y gateway para capturar otro pico. Un nuevo pico debe enlazar esos spans, no solo una estadística acumulada de SQL. La reducción estructural de consultas exige decidir y probar un protocolo de publicación autoritativo; no está resuelta por la caché de bytes ni por este despliegue diagnóstico.
