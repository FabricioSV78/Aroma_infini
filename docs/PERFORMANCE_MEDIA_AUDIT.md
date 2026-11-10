# Rendimiento de imágenes administradas en R2

Fecha: 29 de octubre de 2026. Alcance: lectura pública del Worker; sin cambios de diseño, catálogo, permisos, SQL o configuración remota.

## Hallazgo y corrección

Cada GET público comprobaba el manifiesto autorizado en Supabase, consultaba R2 con `head()` y después repetía la lectura con `get()`. `get()` ya devuelve los metadatos y el cuerpo como stream; ese HEAD adicional alargaba la cadena de dependencias.

La nueva secuencia es:

| Solicitud                | Antes                                | Después                                                 |
| ------------------------ | ------------------------------------ | ------------------------------------------------------- |
| GET de imagen            | RPC de manifiesto → R2 HEAD → R2 GET | RPC de manifiesto → R2 GET con metadatos y stream       |
| HEAD                     | RPC de manifiesto → R2 HEAD          | Sin cambios                                             |
| GET con ETag coincidente | RPC de manifiesto → R2 HEAD → 304    | RPC de manifiesto → R2 GET condicional sin cuerpo → 304 |

Se utiliza `onlyIf: Headers` para que R2 omita el cuerpo cuando coincide `If-None-Match`. No se descarga una imagen completa para responder 304. La respuesta GET continúa transmitiendo el stream de R2, sin convertir la imagen a un buffer en el Worker.

## Seguridad y caché

- Cada GET, HEAD y petición condicional vuelve a consultar `media_public_asset` antes de acceder al bucket. El objeto debe estar listo y la ruta debe coincidir exactamente con su manifiesto.
- Un ETag anterior no permite leer un objeto cuyo manifiesto ya no es público. Las rutas privadas, los tamaños inventados y las imágenes pendientes siguen bloqueados.
- Las respuestas fallidas conservan `Cache-Control: no-store`. No se ha añadido Cache API, caché de sesiones, permisos ni respuestas administrativas.
- Se conservan las cabeceras de imagen inmutable, ETag, tamaño, MIME WebP, CORS público y `nosniff`. La cabecera de caché pública permite reutilización del navegador; por sí sola no demuestra un HIT de caché de Cloudflare.
- La carga mantiene las comprobaciones de JWT real, MFA, pertenencia administrativa, límites, decodificación completa WebP, hashes, manifiesto inmutable y verificación de R2 antes de publicar la referencia.
- El decodificador WASM sigue importándose únicamente al decodificar una carga. Las páginas, las lecturas públicas y la limpieza no lo cargan.

## Mediciones comparables locales

Harness de Node, bucket en memoria y RPC simulado. Se ejecutan 20 y 100 solicitudes consecutivas de cada modalidad, consumiendo el cuerpo cuando corresponde. Cada dependencia RPC/R2 introduce un retraso solicitado de 4 ms. La planificación de temporizadores de Windows añade variabilidad: estos tiempos **no son latencias de Cloudflare, capacidad de producción, CrUX ni una prueba de carga alojada**.

| Modalidad       | Solicitudes | p50 antes / después | p95 antes / después | R2 HEAD antes / después | R2 GET antes / después |
| --------------- | ----------: | ------------------: | ------------------: | ----------------------: | ---------------------: |
| GET             |          20 |  29,895 / 24,268 ms |  30,856 / 30,562 ms |                  20 / 0 |                20 / 20 |
| GET             |         100 |  30,073 / 16,559 ms |  45,908 / 30,322 ms |                 100 / 0 |              100 / 100 |
| HEAD            |          20 |  14,997 / 21,725 ms |  24,288 / 30,409 ms |                 20 / 20 |                  0 / 0 |
| HEAD            |         100 |  12,222 / 21,876 ms |  30,024 / 30,451 ms |               100 / 100 |                  0 / 0 |
| GET condicional |          20 |  12,095 / 14,827 ms |  18,229 / 30,224 ms |                  20 / 0 |                 0 / 20 |
| GET condicional |         100 |  21,546 / 14,629 ms |  30,674 / 30,381 ms |                 100 / 0 |                0 / 100 |

El resultado estructural es reproducible: 100 GET completos pasan de 200 operaciones de lectura R2 a 100, conservando las 100 comprobaciones de manifiesto. Se elimina la mitad de las operaciones R2 y una de tres dependencias secuenciales de cada GET completo. HEAD y GET condicional mantienen una operación R2. Sus variaciones de tiempo en esta muestra no indican una mejora o regresión de producción: su trabajo lógico no aumenta y la muestra tiene ruido de temporizadores.

Registros sin credenciales:

- `artifacts/performance-media-audit-2026-10-29/baseline.json`
- `artifacts/performance-media-audit-2026-10-29/optimized.json`

El benchmark se conserva en `tests/r2-media-worker-performance.spec.ts`; puede repetirse con `MEDIA_BENCHMARK_PHASE=baseline` u `optimized` para guardar un informe, una vez seleccionado el código correspondiente. Esa variable no cambia la implementación ni simula el código anterior.

## Pruebas y límites

Las regresiones comprueban GET con una sola lectura R2, HEAD sin cuerpo, ETag exacto/débil/lista/comodín, cambios de ETag, retirada del manifiesto, objetos ausentes, MIME incorrecto, errores de R2 y de metadatos, rutas privadas y cargas pendientes. Continúan pasando las comprobaciones existentes de cargas, reintentos, errores parciales, concurrencia de identidad, limpieza acotada y fotografías independientes para 10/50 productos.

Una prueba adicional ejecuta el handler en **Miniflare/workerd con su binding R2 local real**, usando las versiones ya instaladas por Wrangler. Verifica GET, HEAD, condicionales y objeto eliminado; confirma que el comportamiento no depende exclusivamente del bucket simulado. No utiliza cuentas, secretos ni buckets remotos y destruye el runtime al finalizar.

Se ejecutaron el typecheck específico del Worker y ESLint de los archivos afectados. No se desplegó, modificó ni sometió a carga infraestructura remota durante esta auditoría. Una comparación de navegación alojada después de un despliegue es una verificación distinta; los tiempos de este documento no deben presentarse como esa comparación.

## Decisiones conservadas

No se activa una caché de manifiestos o de imágenes en el edge: necesita una política explícita de revocación e invalidación. Tampoco se cambia la colocación regional del Worker sin verificar primero la región real de Supabase y medir el recorrido completo. Reducir el HEAD redundante es una mejora acotada que no necesita esas decisiones operativas.

Referencias oficiales consultadas:

- [R2 Workers API: GET, HEAD y operaciones condicionales](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
- [Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
- [R2 local con Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/storage/r2/).
- [Buenas prácticas de Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
