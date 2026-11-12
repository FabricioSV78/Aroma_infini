# Consultas públicas: Home, catálogo y ficha — 12 de noviembre de 2026

Se optimizaron cinco RPC mediante la migración
[`20261112000400_public_catalog_query_work.sql`](../supabase/migrations/20261112000400_public_catalog_query_work.sql).
Aplicada exclusivamente al Supabase de desarrollo `aroma-infini-dev`
(`tkxvexfapszilzhogvgu`), utilizado por staging. No se desplegó frontend ni
Worker; no se modificó producción, diseño, caché, RLS, permisos, índices,
reglas comerciales ni datos de aplicación.

## Decisiones y cuellos de botella

| RPC | Problema | Cambio |
| --- | --- | --- |
| `catalog_home_context` | Repetir lectura de productos publicados para límite, selección y perfiles; subconsultas de familias y disponibilidad por perfil | Una proyección pequeña reutilizada dentro de la misma sentencia; agrupación de familias y candidatos del recomendador por conjuntos. Límite de 10.000 conservado |
| `catalog_browse` | Calcular precios/ofertas antes de descartar candidatos y repetir cálculo de precio por variante | Filtrar tipo, marca, género, familia y búsqueda antes de cotizar. Calcular una vez el precio de cada variante candidata, únicamente si hay filtro u orden de precio |
| `catalog_product_context` | Solapamiento de familias mediante subconsulta por candidato | Agrupar coincidencias por producto; no preparar candidatos automáticos si existe recomendación manual publicada |
| `catalog_products_by_ids` | Predicado OR/EXISTS podía recorrer productos ajenos a los IDs solicitados | Construir primero el conjunto único de IDs y propietarios de variantes; unión por PK antes de comprobar publicación |
| `catalog_products` | Repetir el conjunto publicado para página y total del snapshot del recomendador | Reutilizar una única selección ligera para ambos |

Se mantiene la materialización cuando evita repetir una comprobación RLS
costosa o un precio calculado. No se retiraron todos los CTE de forma
indiscriminada: se acotó su contenido y se adelantaron filtros. Los DTO
completos siguen construyéndose solo para los productos seleccionados.

El plan interno obtenido con `auto_explain` local confirma que el catálogo
normal con orden «Más vendidos» publica 10.000 filas **una vez**, selecciona
12 y deja `CTE quoted` con **cero filas**, mediante `One-Time Filter: false`.
No se calculan ofertas para todos los productos en esa ruta; los precios
visibles continúan calculándose en sus DTO mediante el helper original.

La comprobación de publicación, el cálculo de precios y el agregado privado
de ventas mantienen sus implementaciones originales. Se probaron dos
alternativas para el helper de publicación; no aportaban mejora demostrable
y se descartaron. No se añadieron índices ni extensiones.

## Línea base corregida

La investigación detectó un sesgo en el ensayo del informe de índices:
10.000 productos compartían una imagen cuyo contador de referencias se
actualizaba miles de veces dentro de una única transacción. El acceso por
PK debía atravesar muchas versiones de esa fila, inflando el coste de RLS.
El plan interno registró 436 accesos a buffers en esa imagen para una sola
comprobación. La pasada de publicación completa pasó de unos 2,14 s y
4.460.558 accesos a unos 158 ms y 120.558 accesos después de confirmar y
mantener **el fixture local**.

Esto no demuestra un problema de mantenimiento en Supabase alojado. No se
ejecutó VACUUM ni se cambiaron parámetros de autovacuum en staging. Tampoco
se atribuye esa diferencia a la nueva consulta. Las comparaciones siguientes
usan la misma base local confirmada y mantenida para **ambas versiones**.
Los anteriores 6,4 s de Home no se utilizan como línea base de esta mejora.

## Comparación SQL con volumen

PostgreSQL nativo 17.10 desechable, aislado en loopback, con las 38
migraciones anteriores. Dos conjuntos sintéticos: 1.000 productos/5.000
pedidos/15.000 líneas y 10.000 productos/50.000 pedidos/150.000 líneas.
Cada producto tiene una presentación; el último tiene dos. Incluye una
imagen R2 verificada compartida y ofertas activas, futuras, vencidas y
deshabilitadas. El conjunto volumétrico concentra marca y familia para
ejercitar candidatos poco selectivos; la matriz funcional añade marcas,
familias, géneros y tipos diversos.

Los pedidos son simulaciones pendientes admitidas por el esquema actual:
no se hacen pasar por ventas comerciales verificadas. El coste de agregar
un historial grande de ventas aprobadas queda fuera de esta medición.

Datos confirmados y `VACUUM (ANALYZE)` solamente dentro del clúster local
desechable, antes de medir. Tres muestras por consulta/fase, mediana de
`Execution Time` de `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` como `anon`.
La transacción final que instala el candidato para comparar se revierte;
el clúster sintético se detiene. Los datos volumétricos no se enviaron a
Supabase ni a producción. No son una prueba de capacidad Free/Pro.

| Lectura | 1.000 productos antes → después | 10.000 productos antes → después | Reducción a 10.000 |
| --- | ---: | ---: | ---: |
| Home | 62,335 → 31,925 ms | 557,506 → 233,863 ms | 58,1 % |
| Catálogo, más vendidos | 41,240 → 31,162 ms | 268,064 → 182,004 ms | 32,1 % |
| Catálogo, precio ascendente | 40,274 → 37,572 ms | 268,460 → 242,589 ms | 9,6 % |
| Marca + familia + búsqueda + precio + página | 49,455 → 30,875 ms | 467,714 → 259,863 ms | 44,4 % |
| Búsqueda sin resultados | 35,295 → 26,370 ms | 335,774 → 245,014 ms | 27,0 % |
| Ficha con recomendación automática | 27,384 → 26,195 ms | 188,048 → 177,259 ms | 5,7 % |
| Ficha inexistente | 1,312 → 1,407 ms | 1,363 → 1,434 ms | Sin mejora demostrable |
| Recuperación de un producto por ID | 17,943 → 2,866 ms | 154,289 → 2,860 ms | 98,1 % |
| Recuperación por ID de variante | 18,059 → 2,859 ms | 153,008 → 2,833 ms | 98,1 % |
| Snapshot de 100 productos | 130,765 → 106,389 ms | 403,646 → 247,209 ms | 38,8 % |

Las pequeñas diferencias de ficha inexistente no permiten concluir una
regresión relevante. No se cambió su comportamiento para mejorar un número.
Todas las respuestas comparadas tienen el mismo SHA-256 del JSON completo,
incluidos metadatos, orden, precios, disponibilidad y recomendaciones.

## SQL en staging real

PostgreSQL alojado 17.11, conexión TLS verificada, transacciones de solo
lectura y tres muestras como `anon` por fase. Staging contiene **un producto,
dos variantes y cero pedidos**. No se insertaron fixtures alojados.

| RPC/lectura | Antes → después |
| --- | ---: |
| Home | 9,471 → 7,223 ms |
| Catálogo | 11,311 → 7,912 ms |
| Orden de precio | 8,567 → 7,386 ms |
| Búsqueda y precio | 8,020 → 6,853 ms |
| Sin resultados | 3,889 → 2,173 ms |
| Contexto de ficha | 11,263 → 8,768 ms |
| Producto por ID | 6,124 → 5,463 ms |
| Variante por ID | 5,404 → 5,473 ms |
| Snapshot | 6,695 → 5,946 ms |

Igualdad de las nueve respuestas verificada por hash. La ficha alojada no
tiene candidatos de recomendación suficientes para representar el escenario
volumétrico. Las estadísticas `pg_stat_statements` se consultaron sin
reiniciarlas; su histórico mezcla versiones, por lo que no se presenta como
una comparación aislada antes/después. El plan alojado externo de una RPC
encapsulada no sustituye sus planes internos, obtenidos en el ensayo local.

## Transporte y navegación reales

Se realizaron **36 navegaciones reales** a Home, Tienda y la ficha existente:
18 antes y 18 después, tres contextos nuevos por ruta y dispositivo. Mismo
frontend ya desplegado en
`https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev`,
Supabase alojado real y medios servidos por el Worker/R2 real. Sin
interceptar respuestas ni sustituir catálogo, sin escrituras y sin carga
concurrente contra los servicios. Pausa de un segundo entre visitas.

Chrome de escritorio 1440 × 900 y móvil emulado 390 × 844, DPR 2 y CPU
ralentizada 4× en móvil. No se aplicó un perfil de red 4G ni se usaron
teléfonos físicos. La CPU y la red locales pueden variar entre muestras.

Medianas HTTP medidas desde la solicitud hasta terminar el cuerpo de la
respuesta en el navegador, **incluyendo transporte**, no solo SQL:

| Respuesta real | Muestras por fase | Antes → después |
| --- | ---: | ---: |
| `catalog_home_context` | 6 | 223,4 → 225,4 ms |
| `catalog_browse` | 6 | 212,9 → 205,3 ms |
| `catalog_product_context` | 6 | 209,3 → 247,1 ms |
| Medios gestionados entregados por Worker/R2 | 54 | 345,9 → 380,0 ms |

Todos devolvieron HTTP 200. Las tres RPC conservaron exactamente su tamaño
de respuesta (7.939, 7.812 y 7.736 bytes respectivamente). El último renglón
agrupa distintos tamaños de imagen: describe esa sesión, no la velocidad
de R2 aislada ni CPU interna del Worker. No se midió un TTFB de bucket
separado del Worker, TLS, cachés y red.

Tiempo desde navegar hasta encontrar el contenido principal renderizado:

| Página | Escritorio antes → después | Móvil emulado antes → después |
| --- | ---: | ---: |
| Home | 1.635 → 1.439 ms | 1.624 → 1.779 ms |
| Tienda | 1.461 → 1.488 ms | 1.501 → 1.711 ms |
| Ficha | 1.387 → 1.412 ms | 1.511 → 1.707 ms |

No hay una aceleración uniforme demostrada de navegación en este catálogo
de un producto: algunos tiempos aumentan. Tres muestras no aíslan una
diferencia SQL de 1–3 ms frente a centenares de milisegundos de transporte y
carga; no se atribuyen esas variaciones favorables o desfavorables a la
migración sin más evidencia. El mayor beneficio SQL demostrado corresponde
al crecimiento del catálogo, no a prometer una web alojada instantánea.

La cantidad de RPC por navegación permanece en 3/2/3 para Home/Tienda/ficha;
se conservó el mismo frontend para comparar exclusivamente el cambio de
SQL. Los cambios de frontend previos presentes en el workspace no se
desplegaron incidentalmente. No se eliminaron consultas de reseñas ni datos
para reducir artificialmente esa cuenta.

Hubo cero errores JavaScript y cero desbordamientos horizontales. Se
guardaron doce capturas antes/después; se inspeccionaron Home de escritorio
y catálogo móvil. CLS mediano de laboratorio: 0 en Tienda/ficha y menos de
0,00002 en Home en ambas fases. Los LCP observados y sus muestras están en
`hosted-web-summary.json`; no son Core Web Vitals de usuarios reales ni una
medición de INP. No se certifican dispositivos físicos o redes lentas que
no se hayan utilizado.

## Equivalencia y seguridad

La prueba versionada
[`030_public_catalog_query_work.sql`](../supabase/tests/030_public_catalog_query_work.sql)
conserva las cinco implementaciones anteriores en un esquema temporal de
prueba, con el mismo propietario restringido `aro_api_executor`. No se
instala ese esquema de referencia en el servidor alojado.

Compara **328 respuestas JSON completas**: 82 por identidad/configuración
(anónimo con complementos apagados y encendidos, cliente y administrador).
Incluye 66 combinaciones de filtro/orden por grupo, páginas límite/vacías,
búsqueda literal de `%` y `_`, acentos, varios filtros, precios decimales,
ofertas fijas/porcentaje, fechas, variantes agotadas/inactivas, marcas
inactivas, complementos sin marca, recomendaciones manuales parciales y
automáticas. Comprueba también errores y mensajes originales y rechazo
del Home cuando hay más de 10.000 productos públicos.

La regresión anterior `022_sales_bestsellers.sql` sigue pasando: preserva
el fallback inicial y las reglas del agregado de ventas verificadas. Sus
fixtures comerciales aislados no representan pagos reales.

Comparación del catálogo SQL remoto antes/después:

- Exactamente cinco cuerpos de función cambiados; firmas, argumentos por
  defecto, retornos, propietarios, grants, `STABLE`, `SECURITY DEFINER` y
  `search_path` vacío permanecen iguales.
- 48 tablas, 175 funciones de aplicación, **99 políticas y 120 índices**.
  Sin tablas, columnas, constraints, triggers, relaciones o políticas nuevos.
- Historial **39/39**, hashes de sentencias verificados, sin pendientes en
  desarrollo. Producción no se consultó ni modificó en esta entrega.
- Once comprobaciones de la frontera de seguridad y 55 pruebas HTTP de
  permisos/API pública aprobadas contra desarrollo real. Son comprobaciones
  anónimas y de esquema; no se presentan como login real de cliente o MFA.

No se introduce caché entre solicitudes, almacenamiento de precios ni
materialized views persistentes. Cada CTE existe exclusivamente en su
sentencia y snapshot: precios, horarios de ofertas y stock se siguen leyendo
con las reglas originales. Checkout revalida su precio en servidor y no
acepta totales calculados por el cliente.

## Validación y reproducción

| Validación | Resultado |
| --- | --- |
| PostgreSQL nativo, las 39 migraciones | 929 comprobaciones y escenarios de concurrencia aprobados; fixtures retirados/revertidos por el runner |
| Equivalencia volumétrica a 1.000/10.000 productos | Diez respuestas por volumen idénticas por hash; metadatos de seguridad iguales |
| Catálogo y carga administrativa, SDK real/transporte aislado | 57 pruebas aprobadas |
| Home remoto, transporte aislado | 8 pruebas aprobadas |
| Favoritos, transporte aislado | 15 pruebas aprobadas |
| Checkout, transporte aislado | 24 pruebas aprobadas |
| Pruebas Node aisladas | 182 aprobadas |
| API pública alojada de desarrollo | 55 comprobaciones aprobadas, sin escrituras |
| Frontera SQL alojada | 11 comprobaciones aprobadas |
| TypeScript, lint, build staging y build producción | Aprobados; builds locales con configuración aislada, no desplegados |

La primera pasada de catálogo tuvo un fallo de sincronización en la prueba
de actualización de Contacto: el evento se emitía sin esperar a que React
montara la página. La prueba aislada pasó cinco repeticiones y se añadió
una espera por su título renderizado antes de disparar el evento. La suite
completa posterior pasó 57/57, conservando la exigencia de **una** consulta
de metadatos y ninguna descarga de productos. No se cambiaron la aplicación
ni los permisos para resolver esa prueba.

Comandos de regresión:

```powershell
npm.cmd run test:supabase:sql
npm.cmd run test:catalog:supabase
npm.cmd run test:home:supabase
npm.cmd run test:favorites:supabase
npm.cmd run test:checkout:supabase
npm.cmd run test:node
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build:staging
npm.cmd run build
```

Las suites de navegador se ejecutaron con el entorno aislado del proyecto:
SDK y aplicación reales, pero transporte interceptado. No equivalen a
compras alojadas. El runner SQL ignora destinos remotos, crea PostgreSQL
local desechable y verifica el marcador de test. Para repetir una medición
alojada se debe fijar explícitamente el proyecto de desarrollo y una
transacción de solo lectura; no ejecutar fixtures SQL contra Supabase.

Evidencias locales en `artifacts/catalog-query-audit-2026-11-12/`:

- `benchmark-runs/run-4K6hkY/result.json` y `run-kUnQrC/result.json`: planes,
  tres muestras, hashes y metadatos a 1.000/10.000 productos.
- `nested-plan-summary.json`: resumen del plan interno; el original completo
  se conserva en `afterNestedPlans` del ensayo de 10.000 productos.
- `diagnostic-runs/`: diagnóstico de versiones de la fila compartida y
  experimentos descartados, separados de la comparación aprobada.
- `before-remote.json`, `after-remote.json`, `remote-verification.json`:
  inventario, planes SQL y diferencias estructurales verificadas.
- `migration-dry-run.json`, `migration-apply.json`, `final-boundary.json` y
  `hosted-security.json`: destino, SHA-256 de migración y comprobaciones.
- `before-hosted-browser.json`, `after-hosted-browser.json`, `screens/`:
  navegaciones y capturas reales con el mismo frontend desplegado.

Los artefactos están ignorados por Git. La migración, la regresión y este
informe deben incorporarse al repositorio para conservar el cambio. No se
hizo commit, push ni despliegue de código en esta tarea.

## Costes que permanecen

1. El total exacto y las familias disponibles del catálogo requieren evaluar
   la publicación del conjunto completo. Se redujeron pasadas, no se
   sustituyó RLS por un booleano cacheado. A 10.000 filas, esa comprobación
   sigue dominando el catálogo y las recomendaciones automáticas.
2. Home conserva todos los perfiles del recomendador y su límite de 10.000.
   Reducir ese payload o trasladar el recomendador al servidor exige otro
   contrato; no se recortaron opciones ni resultados silenciosamente.
3. Ordenar y filtrar por precio exige calcular el precio vigente de variantes
   candidatas. No se almacena un precio derivado que pueda vencer o quedar
   desactualizado. Búsqueda conserva la semántica de subcadena literal de
   nombre y marca, sin introducir un índice que no coincida con ella.
4. Las recomendaciones automáticas conservan su comparación global exacta;
   la mejora medida es menor. No se aproximó ranking ni se eliminaron
   candidatos para fabricar una aceleración.
5. La latencia de red/arranque del frontend, la distancia al servidor y la
   entrega de imágenes no desaparecen al reducir milisegundos SQL. No se
   demuestra con esta prueba que Supabase Pro sea necesario ni que elimine
   esas demoras. Falta medir tráfico real y un volumen comercial real.
6. Mercado Pago permanece simulado. Esta entrega no habilita cobros,
   reservas, liquidación de inventario o afirmaciones de compra comercial
   completa. Producción requiere su autorización y su propio despliegue.

Referencias técnicas: [materialización y plegado de CTE](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION),
[EXPLAIN y sus límites](https://www.postgresql.org/docs/17/using-explain.html),
[planes de sentencias anidadas](https://www.postgresql.org/docs/17/auto-explain.html),
[RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
