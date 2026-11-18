# Solicitud preparada para soporte de Supabase — upstream multimedia

Documento preparado el 14 de noviembre de 2026. **No enviado.** No contiene claves, tokens, contraseñas, cookies, correos de clientes ni SQL con datos de usuarios. Adjuntar únicamente la evidencia seleccionada, nunca `.env*`, `.dev.vars*` ni el directorio completo de trabajo.

## Asunto

Investigar 1.000 ms de Envoy upstream en una RPC anónima de lectura; faltan spans correlacionados de PostgREST y adquisición del pool.

## Entorno y evento exacto

- Proyecto de desarrollo/staging: `aroma-infini-dev`, ref `tkxvexfapszilzhogvgu`, región `sa-east-1`.
- Endpoint: `POST /rest/v1/rpc/media_public_asset`, esquema API `api`, rol anónimo, respuesta 200.
- Momento UTC: **`2026-11-14T01:12:24.523Z`**.
- Ventana sugerida: `2026-11-14T01:12:09.523Z`–`2026-11-14T01:12:39.523Z`.
- `sb-request-id` / request ID del gateway: **`01a1d79c-decb-725c-b25c-da99c0267437`**.
- W3C trace ID: **`fc64114c29f04cf28d76a4c181cbf2c7`**.
- Span ID enviado: **`fc64114c29f04cf2`**.
- Identificador cliente/Worker: `fc64114c-29f0-4cf2-8d76-a4c181cbf2c7`.
- Gateway versión `1`, ingreso `GRU`, un intento upstream.
- `x-envoy-upstream-service-time`: **1.000 ms**; `response.origin_time`: **1.009 ms**.
- El Worker midió **1.021 ms** hasta las cabeceras de esa lectura del manifiesto. La imagen se sirvió desde su caché de bytes; R2 no explica el cronómetro upstream de este evento.

## Investigación ya realizada

La búsqueda oficial por el request ID o trace ID recuperó el mismo evento de gateway; no recuperó spans internos correlacionados. No se pretende convertir Envoy upstream en tiempo SQL.

Se capturaron otras **84 lecturas** con coincidencia exacta de request/trace/span entre Worker y gateway. En las **60 finales** se habilitó temporalmente el `Server-Timing` documentado de PostgREST. Se observó PostgREST **14.18** mediante `pg_stat_activity.application_name`. El ajuste temporal ya fue restaurado.

| Serie final, 60 lecturas | P50 | P95 | Máximo |
| --- | ---: | ---: | ---: |
| Envoy upstream | 3 ms | 18 ms | 19 ms |
| PostgREST `transaction` | 2,7 ms | 17,8 ms | 18,8 ms |
| HTTP de manifiesto desde Worker hasta cabeceras | 24 ms | 54 ms | 66 ms |

El pico histórico no tenía `Server-Timing` de PostgREST habilitado. En la versión 14.18, el tiempo `transaction` incluye `usePool`; no separa adquisición de conexión y transacción. Las otras fases son inferiores a la precisión mostrada en muchas respuestas.

También hubo otra lectura lenta, con correlación exacta:

- UTC `2026-11-14T14:32:38.649Z`.
- Request ID `01a1da79-81f9-7a01-9112-3ae090e37710`.
- Trace ID `c226b583722c4f26a86ca4eab3ca8112`, span `c226b583722c4f26`.
- HTTP manifiesto desde Worker: 520 ms; gateway `origin_time`: 505 ms; Envoy upstream: 184 ms; un intento.

En la ventana `14:32:33.649Z`–`14:39:58.089Z`, Logs expuso 188 eventos edge y cinco PostgreSQL sin request/trace IDs; no hubo fuente PostgREST o pooler en esa ventana. Las búsquedas de servicios internos por nuestros IDs devolvieron cero coincidencias. No interpretamos esa ausencia como ausencia de espera.

El endpoint oficial de métricas, a las `14:40:44.259Z`, mostró `pgrst_db_pool_max=10`, `available=8`, `waiting=0`, `timeouts_total=0`. Son valores posteriores, no el estado del pool durante el evento de la `01:12Z`. No tenemos duración de adquisición individual ni una serie histórica propia de ese instante.

Los EXPLAIN independientes de la RPC con rol anónimo fueron de aproximadamente 0,6–1,3 ms. No representan la ejecución SQL del request histórico. No modificamos RLS, tamaño de pool, timeouts, reintentos ni logging general de consultas.

## Información solicitada

1. Resolver esos request/trace IDs a los spans de gateway, servicio PostgREST y conexión a PostgreSQL; confirmar si el trace recibido se propaga internamente o qué identificador alternativo permite unirlos.
2. Separar cola/admisión, selección y conexión al upstream, conexión reutilizada o nueva, DNS/TCP/TLS internos cuando apliquen, envío y tiempo de respuesta del servicio.
3. Indicar llegada y despacho del request en PostgREST, duración de adquisición del pool y duración de la transacción, con un identificador de backend PostgreSQL correlacionable y sin devolver datos de clientes.
4. Comprobar límites, colas, CPU/throttling, memoria/GC, reinicios, recargas y eventos de infraestructura alrededor de ambos casos.
5. Aclarar la semántica y punto de medición de `response.origin_time` frente a `x-envoy-upstream-service-time`, incluidos los intervalos que no mide el segundo.
6. Confirmar si esas RPC usan el pool propio de PostgREST directamente hacia PostgreSQL o atraviesan otro pooler, y aportar evidencia del recorrido, sin inferirlo del nombre del producto.
7. Si ya no se conservan los spans: indicar retención, fuentes accesibles y procedimiento soportado para capturar otro pico con adquisición de pool y gateway por request. Preferimos una ventana acotada sin registrar payloads o consultas con datos privados.

## Evidencia adjuntable

El paquete local `artifacts/upstream-manifest-2026-11-14/supabase-support-evidence.zip` contiene una selección explícita de este documento y JSON de tiempos/IDs: evento histórico, cohorte, correlaciones, disponibilidad de fuentes, pool y resumen. No se comprimieron variables de entorno, credenciales, logs brutos de autenticación ni el árbol completo de artifacts.

Conclusión actual: **el pico de 1.000 ms dentro del recorrido upstream está demostrado, pero su causa interna no está identificada**. Solicitamos investigación del proveedor, no una ampliación de timeout ni la atribución automática a PostgreSQL o a su plan Free.
