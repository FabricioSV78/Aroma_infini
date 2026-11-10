# Auditoría de rendimiento — entrega de desarrollo

29 de octubre de 2026. Auditoría de React, adaptadores, Auth/cuenta, catálogo
SQL, administración, Worker e imágenes R2. Se mantuvieron el diseño público,
las reglas comerciales, RLS, MFA y los controles de subida.

Los detalles y fuentes de cada revisión están en
[consultas y SQL](PERFORMANCE_QUERY_AUDIT.md),
[Worker y R2](PERFORMANCE_MEDIA_AUDIT.md) y
[estado real de cada módulo](PERFORMANCE_INTEGRATION_LIMITS.md).
La funcionalidad adicional de familias se documenta en
[Gestión de familias olfativas](OLFACTORY_FAMILY_MANAGEMENT.md).

## Problema medido y cambios aplicados

La Tienda descargaba todas las páginas de cien productos, con galerías,
descripciones y notas, antes de mostrar doce cards. La ficha, el buscador y
el layout también dependían de ese snapshot. No era un N+1 HTTP por producto:
era un coste creciente de construcción SQL y transferencia innecesaria.

La migración `20261029000700_catalog_browse.sql` incorpora tres lecturas
públicas sin ampliar permisos de tablas al navegador:

- `catalog_browse`: filtros, orden, conteo exacto y página de hasta doce
  productos, con marcas, familias y ajustes públicos en la misma respuesta.
- `catalog_product_context`: ficha por slug y hasta cuatro recomendaciones,
  respetando la selección manual y las reglas del fallback existentes.
- `catalog_products_by_ids`: solo productos seleccionados o propietarios de
  las variantes del carrito, con un máximo combinado de cien IDs por petición.

El frontend utiliza esas consultas en Tienda, detalle, sugerencias, favoritos
y carrito. Las páginas sin catálogo obtienen solo marcas y ajustes. Los
filtros múltiples mantienen OR dentro del grupo y AND entre grupos. Precio,
orden y disponibilidad usan las presentaciones reales y las ofertas vigentes.

## Consultas antes y después

Lectura inicial sin caché de consultas en el navegador; N es el catálogo
publicado. No incluye solicitudes de archivos estáticos ni Auth.

| Recorrido                      | Antes                                      | Después                                          |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------ |
| Tienda                         | `ceil(N / 100) + 2` RPC y todo el catálogo | 1 RPC, máximo 12 DTO                             |
| Detalle                        | mismo snapshot completo                    | 1 RPC, ficha y hasta 4 relacionadas              |
| Sugerencias                    | snapshot completo                          | 1 RPC, máximo 5 resultados                       |
| Navegación en páginas de ayuda | podía descargar el snapshot                | 2 RPC de metadatos, reutilizadas 30 s            |
| Favoritos / carrito            | snapshot completo                          | metadatos y lotes de hasta 100 IDs seleccionados |

Las capturas alojadas con un producto publicado verificaron **3 → 1 RPC**
tanto en Tienda como en detalle, en los cinco tamaños de pantalla. Con mil
productos, la ruta anterior necesitaba diez páginas de catálogo y dos
consultas de metadatos; la nueva página de Tienda utiliza una.

Los conteos de esa tabla corresponden al navegador. En una visita HTTP directa
a un detalle, `seo-router.ts` conserva además una RPC pública del Worker para
comprobar que el slug existe y responder 200/404/503 correctamente. La ficha
pasa por tanto de cuatro a dos lecturas de datos contando esa comprobación
con un catálogo de hasta cien productos. Cada imagen servida sin reutilización
HTTP añade su comprobación de manifiesto y lectura R2, descritas más abajo.
No se ocultan estas dependencias bajo el conteo de una RPC del navegador.

## Mediciones SQL locales comparables

PostgreSQL 17.10 desechable, tres observaciones por estrategia. Datos
sintéticos de 100 y 1000 productos, dos presentaciones, stock mixto,
familias, notas, descripción, fotografía y ofertas. Se revierten al terminar;
no se insertaron productos ficticios en el proyecto alojado. La prueba de
cinco fotos por perfume se cubre aparte en el Worker para grupos de 10 y 50.

| Productos | JSON anterior / posterior | DTO anterior / posterior | SQL anterior / posterior |
| --------- | ------------------------- | ------------------------ | ------------------------ |
| 100       | 165222 / 21113 B          | 100 / 12                 | 302–370 / 14–22 ms       |
| 1000      | 1656080 / 21116 B         | 1000 / 12                | 3271–3817 / 41–42 ms     |

Con mil productos la transferencia JSON medida se reduce **98,72 %**. Son
bytes decodificados, sin compresión ni red. La comparación responde a la
tarea de mostrar la primera página; no implica que el conteo SQL evalúe
únicamente doce filas. Los rangos son observaciones del benchmark conservado,
no percentiles de producción. Repetirlo produce variación normal de tiempo.

Se ejecutó también `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` sobre la selección
de candidatos con marca, familia, stock y orden, usando `aro_api_executor`
sin bypass de RLS. El plan queda en el informe SQL como `LOCAL_BROWSE_EXPLAIN`.
No se añadieron índices por intuición: se conservan los índices existentes de
relaciones, códigos únicos y orden; el mayor beneficio medido vino de limitar
los DTO. Una búsqueda substring no obtiene automáticamente un índice útil
con un B-tree del nombre.

## Observaciones alojadas

Proyecto de desarrollo con **un producto publicado**. Lecturas anónimas
secuenciales, dos muestras por RPC; no son pruebas de carga ni un p95 fiable.

| Lectura posterior               | Observaciones HTTP | JSON decodificado |
| ------------------------------- | ------------------ | ----------------- |
| `catalog_browse`                | 199 / 169 ms       | 7100 B            |
| `catalog_product_context`       | 155 / 130 ms       | 7024 B            |
| Un producto por ID, una muestra | 144 ms             | 6038 B            |

La línea base de `catalog_products` fue 162 / 255 ms y 6038 B, más las
consultas separadas de marcas y ajustes. Con un solo producto, la nueva
respuesta incluye más metadatos: el beneficio no consiste en afirmar que
cualquier RPC individual tiene menos bytes. Se comprobó igualdad exacta de
los productos públicos de las respuestas nuevas y anteriores.

Chrome DevTools, una traza por versión, sin limitar CPU/red y con caché
estática caliente: antes LCP 2015 ms, TTFB 132 ms, CLS 0; después LCP 506 ms,
TTFB 110 ms, CLS 0. **El candidato LCP cambió de la foto al logo**, por lo que
esas dos cifras no prueban una aceleración equivalente de la misma imagen.
No se extrapolan a usuarios reales ni a producción. La estimación de ahorro
por CSS bloqueante fue cero; no se alteró el CSS aprobado por esa sugerencia.

## Worker, R2 y resolución de imágenes

Cada GET conserva la consulta de manifiesto autorizado en Supabase y pasa de
`R2 HEAD + GET` a **un GET con metadatos y stream**. HEAD continúa usando HEAD;
los condicionales de ETag se resuelven sin cuerpo cuando corresponda. La
prueba nativa con Miniflare/workerd valida ese contrato de R2.

El benchmark local de cien GET pasa de 200 a 100 lecturas R2. En el harness
con dependencias simuladas y retrasos controlados, p50 fue 30,073 → 16,559 ms
y p95 45,908 → 30,322 ms. **No son tiempos de Cloudflare alojado**; el resultado
estable es eliminar una dependencia y la mitad de las lecturas R2 completas.

Se corrigió `sizes` de la galería para respetar sus columnas y su límite de
altura. Capturas reales con DPR 1, misma fotografía, fuente y composición:

| Pantalla    | Variante anterior → posterior | Bytes de la foto principal |
| ----------- | ----------------------------- | -------------------------- |
| 1920 × 1080 | 1003 → 960 px                 | 74840 → 63730              |
| 1440 × 900  | 960 → 960 px                  | 63730 → 63730              |
| 1366 × 768  | 960 → 480 px                  | 63730 → 27666              |
| 768 × 1024  | 960 → 480 px                  | 63730 → 27666              |
| 390 × 844   | 480 → 480 px                  | 27666 → 27666              |

El navegador conserva candidatos mayores para pantallas de mayor densidad.
No se amplían fuentes pequeñas, inventan rendiciones ni cambian los originales.
La primera foto mantiene prioridad alta y las siguientes carga diferida.
Se conserva el bucket privado, sus rutas verificadas, URLs inmutables y el
decodificador WASM diferido únicamente para subidas.

## Caché, revalidación y datos críticos

- Consultas públicas: memoria del navegador, cinco segundos, máximo cuarenta
  respuestas; peticiones concurrentes equivalentes comparten la promesa.
- Marcas y ajustes públicos: treinta segundos. Las respuestas de browse/ficha
  también suministran estos metadatos, evitando una segunda lectura.
- Escrituras confirmadas del panel invalidan ambas capas. Una respuesta de
  una generación anterior no se publica; se repite o comparte la lectura
  vigente, incluso ante dos invalidaciones seguidas. Los errores no se cachean.
- Revalidación de ofertas en páginas visibles: conserva el límite de un minuto
  y revalida la ruta actual; no descarga todo el catálogo desde el layout.
- Auth, autorización, perfiles, direcciones, pedidos y respuestas del panel no
  utilizan esta caché pública. Los cambios de sesión conservan sus protecciones.
- La confirmación del checkout simulado invalida y relee la fuente remota;
  rechaza diferencias de precio, oferta, stock o publicación. Sigue siendo
  una simulación local, sin cobro, reserva ni transacción de stock real.

Las imágenes conservan caché HTTP inmutable del navegador. No se activó
Cache API ni se afirma un HIT de borde por observar `Cache-Control`.
`workers.dev`, el dominio futuro y la revocación de recursos requieren una
política explícita antes de cachear manifiestos o autorizaciones.

## Validaciones y evidencia

| Comprobación                                     | Resultado                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| Typecheck, lint, build, paquete Wrangler         | Correctos                                                                        |
| SQL local                                        | 14 migraciones, 317 registros de comprobación, concurrencia y limpieza correctas |
| Catálogo con SDK y navegador aislados            | 24 pruebas                                                                       |
| Worker, contratos de medios y caché pública      | 60 pruebas, incluido R2 nativo local                                             |
| Fotografías con SDK/navegador aislados           | 12 pruebas                                                                       |
| Auth, cuentas, MFA y carreras de sesión aislados | 65 pruebas                                                                       |
| Regresiones de dominio relacionadas              | 50 pruebas, algunas también pertenecen a otras suites                            |
| Familias: interfaz y dominio                     | 7 pruebas                                                                        |
| SKU: presentaciones y registro                   | 14 pruebas                                                                       |
| API pública de Supabase alojada                  | 19 comprobaciones de lectura/permisos                                            |
| Worker alojado: HEAD, ETag y rechazos de acceso  | 5 comprobaciones sin cambios de datos                                            |
| Familias con Auth/TOTP/Supabase reales           | 17 comprobaciones; limpieza confirmada                                           |
| Comparación pública                              | 10 capturas antes y 10 después, cinco resoluciones                               |

Las pruebas SQL incluyen marcas por lotes, importación, versiones, descuentos,
stock, SKU, familias, medios y aislamiento de propietarios. No se suman todas
las filas de esta tabla como si fueran casos únicos: algunas suites se solapan.

La comparación pública cubre 1920 × 1080, 1440 × 900, 1366 × 768,
768 × 1024 y 390 × 844. Cero errores JS, fallos de petición, imágenes rotas
o desbordamientos horizontales en las veinte capturas. La galería móvil se
inspeccionó después de repintar para evitar una captura falsa de su capa.

Evidencia local en `artifacts/performance-2026-10-29/`:
`visual-comparison.html`, `visual-{before,after}/*.png`, `visual-summary.json`,
`rpc-{baseline,optimized}.json`, `chrome-{baseline,optimized}.json` y logs.
Planes y concurrencia: `artifacts/supabase-sql-tests/run-J80mKr/result.json`.
Los artefactos generados están excluidos de Git; este informe y los tests son
código/documentación del proyecto. Ningún informe contiene credenciales.

## Estado de entrega y límites

Migraciones 006 y 007 aplicadas al proyecto **aroma-infini-dev**. Worker de
desarrollo desplegado: `aroma-infini-frontend-staging`, versión
`eb732238-e979-4b30-8370-425df136f8c7`. No se creó infraestructura de producción
ni se cambiaron planes de pago. El producto real conserva su fingerprint,
SKU e imágenes; las identidades y familias de prueba alojadas se retiraron.

Persisten lecturas completas justificadas en Home/recomendador, perfiles de
marcas y el catálogo administrativo compartido (páginas de cien, límite de
diez mil). Reemplazarlas por doce registros rompería opciones del finder,
validaciones de Excel, inventario o referencias de edición. Son candidatos
a contratos específicos en una fase posterior, no optimizaciones finalizadas
por esta entrega. Las operaciones de cupones, pedidos/lotes, tarifas y PDF
siguen su adaptador local; no se presenta su paginación como SQL remoto.

La observabilidad de Workers ya está activada con muestreo de logs/trazas
del 10 %. Supabase ofrece inspección de consultas y sus registros. Se conservan
errores públicos genéricos y no se registran tokens, contraseñas ni perfiles.
No se habilitó monitorización de pago. En producción corresponde medir tráfico
real, planes SQL con el volumen definitivo, CPU del Worker, operaciones R2 y
percentiles antes de decidir colocación regional, índices adicionales o CDN.

Los chunks de Excel/PDF siguen siendo grandes pero se cargan por importación
dinámica; no se incorporan al camino de la Tienda. No se añadieron dependencias
ni se cambiaron umbrales de aviso para ocultarlo.

## Referencias oficiales

- [Supabase: optimización de consultas](https://supabase.com/docs/guides/database/query-optimization).
- [Supabase: RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Cloudflare: API R2 de Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
- [Cloudflare: Cache API y sus límites](https://developers.cloudflare.com/workers/runtime-apis/cache/).

Se utilizaron las skills instaladas web-perf, React, TypeScript,
accesibilidad, Workers y Wrangler durante la revisión e implementación.
