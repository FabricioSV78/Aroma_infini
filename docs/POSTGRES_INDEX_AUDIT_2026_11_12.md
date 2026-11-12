# Auditoría especializada de índices — 12 de noviembre de 2026

**Aclaración posterior sobre el ensayo volumétrico de lectura:** la
[auditoría de consultas públicas](PUBLIC_CATALOG_QUERY_AUDIT_2026_11_12.md)
detectó que el fixture de este informe asociaba miles de productos a una
misma imagen R2 dentro de una transacción sin confirmar. Las actualizaciones
del contador de referencias acumulaban versiones de esa fila e inflaban el
coste de publicación de Home y catálogo. Se conservan aquí las mediciones
históricas como escenario transaccional, pero no representan una línea base
de lectura estable. El nuevo informe repite ambas versiones con datos
confirmados y mantenidos en PostgreSQL local desechable. Esta corrección no
invalida los planes de ordenación, FK y escrituras que justifican los tres
índices de esta entrega.

Se añadieron **tres índices B-tree justificados** mediante planes y mediciones.
La migración se aplicó únicamente en `aroma-infini-dev`, base utilizada por
staging. No se eliminaron índices ni datos; no se modificaron funciones, RLS,
permisos, relaciones, interfaces o reglas comerciales. Producción no se tocó.

## Entrega y alcance

| Elemento | Estado |
| --- | --- |
| Inventario real de desarrollo/staging | APROBADO: 48 tablas, 117 índices antes y 120 después |
| Duplicados estructurales exactos | Ninguno antes o después; no se retiró ningún índice |
| Migración `20261112000300_targeted_workload_indexes.sql` | APLICADA solo en desarrollo/staging |
| Historial de desarrollo/staging | 38/38 migraciones, hashes históricos comprobados, sin pendientes |
| Frontera de seguridad e interfaces SQL | Sin cambios: 175 funciones propias de `api/app/private`, 99 políticas y todos los contratos anteriores preservados |
| Producción | SIN CAMBIOS; aplicar el historial pendiente requiere autorización separada |
| Git/Cloudflare | Sin commit, push ni despliegue de frontend o Worker en esta auditoría |

Archivos entregados:

- [Migración](../supabase/migrations/20261112000300_targeted_workload_indexes.sql).
- [Regresión SQL](../supabase/tests/029_targeted_workload_indexes.sql).
- [Inventario de índices reutilizable](../supabase/audit/index_inventory.sql).
- Evidencias locales: `artifacts/index-audit-2026-11-12/`.

Se conservaron los cambios anteriores de rendimiento y CI que ya estaban sin
confirmar en Git. La nueva migración debe incorporarse al repositorio para que
otros entornos puedan reproducir el historial aplicado; no editarla después
de haberla aplicado.

## Qué se inspeccionó y cómo se midió

Se revisaron el catálogo SQL alojado, las definiciones de funciones y políticas,
los índices físicos y sus dependencias, los usos literales del SDK en 293
archivos de `src/worker` y el despacho dinámico de los servicios y Workers.
El inventario automatizado encuentra 35 nombres de RPC literales; no confunde
esa lista con todos los accesos dinámicos. Se contrastaron también los helpers
SQL y las relaciones utilizadas por las RPC.

### Staging real

Conexión obtenida mediante el CLI oficial, destino fijado a
`tkxvexfapszilzhogvgu`, TLS con certificado verificado y transacciones de
**solo lectura** para el inventario y las mediciones. PostgreSQL alojado 17.11.

Se ejecutó `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` tres veces por lectura,
antes y después. Las RPC públicas se midieron como `anon`; los fragmentos
administrativos se midieron como operador SQL, sin devolver datos de clientes.
Esto último **no equivale a un inicio de sesión administrativo ni a una prueba
de MFA**. No se hicieron `EXPLAIN ANALYZE` de escrituras alojadas.

El volumen observado de staging es pequeño: un producto, dos variantes y
ningún pedido. No se importó volumen artificial para producir mejoras
aparentes. En tablas tan pequeñas, un scan secuencial puede ser la mejor
decisión del planificador; no se deshabilitó `enable_seqscan` para forzar índices.

### Escenario de crecimiento aislado

PostgreSQL nativo 17.10 desechable en loopback, con las 37 migraciones anteriores
y los tres candidatos añadidos dentro de la transacción de prueba:

- 10.000 productos y 10.001 presentaciones, con SKU y relaciones válidos.
- 50.000 pedidos simulados y 150.000 líneas históricas.
- Cinco muestras por consulta y fase, mediana de ejecución SQL.
- `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)` para lecturas y DML local.
- DELETE e INSERT locales revertidos mediante savepoints en cada muestra.
  Quitar una presentación deja otra válida; no se desactivan sus constraints.
- Igualdad por hash de todas las respuestas de lectura antes/después; recuentos
  finales conservados y rollback del conjunto de prueba.

Los tiempos locales no son latencias HTTP, tiempos de interfaz o capacidad de
Supabase Free/Pro. Las pruebas SQL de identidad usan fixtures de claims,
no el servicio Auth real. No se realizó una carga alojada masiva o concurrente.

## Índices creados y motivo

| Índice | Definición | Consulta o proceso beneficiado |
| --- | --- | --- |
| `products_admin_created_idx` | `app.products(created_at, id)` | Las páginas cronológicas y versiones de `admin_catalog_page`, incluyendo borradores/inactivos |
| `order_items_product_idx` | `app.order_items(product_id)` | Comprobar referencias históricas antes de eliminar un producto sin pedidos |
| `order_items_variant_idx` | `app.order_items(variant_id)` | Comprobar referencias históricas al retirar una presentación no utilizada |

El índice público de productos por `display_rank` y `active` no cubre el orden
administrativo por fecha ni todos sus registros. El índice nuevo evita leer y
clasificar el catálogo completo para obtener la primera página.

Las claves existentes de líneas son `(order_id, position)` y
`UNIQUE(order_id, variant_id)`. Sirven para leer un pedido, pero no son una
búsqueda eficiente por `product_id` o por `variant_id` sin conocer el pedido.
PostgreSQL no añade automáticamente índices en el lado que referencia una FK.
Los índices nuevos reducen ese recorrido histórico y el tiempo dedicado a
comprobar integridad; **no permiten borrar productos o variantes con pedidos**.

Se eligieron índices completos y no únicos: los identificadores están presentes
en las líneas normales y no hay un subconjunto pequeño que justifique un índice
parcial nuevo. No se cambiaron restricciones de unicidad, estados ni disponibilidad.

### Planes y tiempos del escenario de crecimiento

| Operación | Antes | Después | Interpretación |
| --- | ---: | ---: | --- |
| Seleccionar primeros 100 productos por fecha/ID | 2,674 ms | 0,029 ms | Scan de 10.000 filas + sort → índice con 100 filas; bloques hit de muestra 556 → 8 |
| Página profunda, OFFSET 9.000 | 3,022 ms | 2,949 ms | Mejora pequeña; el planificador conserva scan/sort |
| RPC completa `admin_catalog_page(100,0)` | 95,836 ms | 88,180 ms | Aproximadamente 8 % en este fixture; no confundir con la mejora del fragmento anterior |
| Buscar referencias de una variante sin pedidos | 9,662 ms | 0,012 ms | Evita scan de 150.000 líneas |
| Buscar referencias de un producto sin pedidos | 8,578 ms | 0,013 ms | Evita scan de 150.000 líneas |
| Retirar una presentación sin pedidos, con triggers/FK | 10,048 ms | 0,545 ms | DML exclusivamente local, revertido |
| Eliminar un producto sin pedidos, con triggers/FK | 29,498 ms | 1,694 ms | DML exclusivamente local, revertido |

Los planes de referencias emplean los nuevos índices. Las pruebas de eliminación
incluyen los controles existentes y su trabajo de triggers, no una versión con
integridad deshabilitada. Los tiempos submilisegundo dependen de caché y hardware;
los cambios de plan y de filas recorridas son más importantes que sus decimales.

### Consultas sin mejora demostrada

No se atribuye un beneficio universal a los tres índices:

| RPC o consulta, fixture local | Antes → después |
| --- | ---: |
| Pedidos, página de 100 | 18,220 → 18,952 ms |
| Tienda, más vendidos | 2.254,504 → 2.237,090 ms |
| Tienda con marca/familia/búsqueda/precio | 2.415,367 → 2.432,613 ms |
| Ficha y recomendaciones | 2.167,884 → 2.179,330 ms |
| Home completo | 6.421,617 → 6.438,190 ms |
| SKU existente | 0,015 → 0,017 ms |

Las diferencias pequeñas no justifican nuevas afirmaciones de aceleración.
El SKU ya utiliza su índice único. Los costes altos del catálogo a 10.000
productos necesitan revisar el trabajo por candidato y las proyecciones; no
se resuelven creando un índice arbitrario sobre cada campo.

Los planes externos de funciones encapsuladas muestran `Result`; no se presentan
como evidencia de todos sus scans internos. Los planes de selección, referencias
y DML anteriores sí contienen los scans, índices y triggers correspondientes.

### Antes y después en staging real

Medianas de tres ejecuciones, sin transporte HTTP:

| Lectura | Antes → después |
| --- | ---: |
| Tienda pública | 9,643 → 9,786 ms |
| Búsqueda y precio | 5,680 → 5,646 ms |
| Home público | 8,361 → 8,422 ms |
| Marcas | 1,833 → 1,928 ms |
| Fragmento de orden administrativo de productos | 0,040 → 0,041 ms |
| Referencia histórica por producto, tabla vacía | 0,032 → 0,027 ms |
| Referencia histórica por variante, tabla vacía | 0,029 → 0,026 ms |

Son tiempos prácticamente equivalentes con el volumen actual. No se anuncia
que la tienda alojada se haya acelerado un porcentaje grande por esta migración.

## Cobertura del resto del sistema y decisiones de no añadir índices

| Área | Índices o comportamiento existente | Decisión |
| --- | --- | --- |
| Producto por URL | Único de `products.slug` | Conservar; no duplicar |
| Código interno y SKU | Únicos de `product_code` y `merchant_sku` | Conservar las garantías y la búsqueda exacta |
| Presentaciones y stock | PK de variante, índice por `product_id`, único de presentación | No indexar `stock` aisladamente: las operaciones actuales localizan la variante por ID/producto |
| Marca y tipo de producto | `products_brand_idx`, índice parcial de tipo activo | Conservar; Complementos es tipo, género es atributo, no una tabla ficticia de categorías |
| Familias olfativas | PK `(product_id,family_code)`, índice `(family_code,product_id)` y posición única | Ambas direcciones cubiertas; no duplicar ni eliminar la unicidad de posición |
| Galería/notas/recomendaciones | Claves por producto/posición/fase y referencias inversas necesarias | Conservar orden e integridad existentes |
| Ofertas y cupones | PK de oferta por producto, código único de cupón | Las ofertas se validan contra la presentación; indexar fechas por separado no acelera ese acceso puntual |
| Pedidos por dueño, estado y fecha | `orders_owner_placed_idx`, `orders_status_placed_idx`, `orders_placed_idx` | Conservar; ya hay prefijos apropiados para esas consultas |
| Más vendidos | Índice parcial `orders_verified_sales_idx`, líneas por pedido | Conservar; no contar simulaciones como ventas para justificar otro índice |
| Historial de estado | Índice único con `order_id` inicial | Adecuado para el historial de pedidos seleccionados |
| Favoritos | PK `(user_id,product_id)` e índice inverso por producto | No duplicar; el conjunto por usuario está acotado |
| Reseñas | Índice parcial publicado por producto/fecha, único usuario/producto y actor/fecha | Conservar; la lista pública y la reseña propia tienen accesos distintos |
| Cuenta/dirección/RLS de propietario | PK/único por `user_id` | No añadir índices repetidos por usuario |
| RLS administrativa y dispositivos | PK de membresía/sesión, hash único de token, índices dueño/dispositivo | Conservar; no cachear ni sustituir MFA/autorización |
| Biblioteca multimedia | GIN sobre `search_document`, sección/activo, orden de recursos R2 | GIN ya coincide con `@@`; no añadir otro GIN de etiqueta o JSON |
| Uso/retirada de medios | Índices por media ID, rendiciones y limpieza parcial | Conservar controles de referencias y reclamaciones |
| Envíos/configuración/Home | Singleton, ubicaciones/códigos únicos, documentos por clave | Pocas filas y lectura por clave; más índices no añaden selectividad |
| Avisos/push | Índices de recientes, pendientes, destinatario/lectura y entregas por vencimiento | Conservar; no añadir un índice a cada FK sin medir un uso costoso |

La búsqueda de perfumes usa `strpos(catalog_name_key(nombre || marca), texto)`
y el catálogo utiliza CTE materializados y precios finales calculados. Un GIN
trigram sobre `products.name` no coincide con ese predicado ni cubre el nombre
de marca de otra tabla. No se instaló `pg_trgm` ni se añadió un índice que la
consulta actual no utilizaría. Cambiarlo requiere una propuesta de consulta
con equivalencia de búsqueda, caracteres, filtros y orden, seguida de medición.

No se detectaron duplicados estructurales exactos. Los prefijos solapados de
índices compuestos no se consideran automáticamente redundantes. Los índices
de constraints, como unicidad de SKU o IDs heredados, conservan su finalidad
aunque su contador de lecturas sea cero.

El informe de FK distingue cobertura B-tree incondicional y los índices
parciales de referencias no nulas. La ausencia de un índice incondicional no
significa que el acceso esté sin cubrir. Relaciones de singleton y algunos
historiales/atribuciones sin lectura interactiva actual quedan documentados
para seguimiento; no se indexaron automáticamente.

## Estadísticas reales y sus límites

`pg_stat_statements` está disponible en `extensions`, versión 1.11. Se leyeron
120 filas de estadísticas relevantes por tiempo acumulado. Su último reset es
del **26 de octubre de 2026**, y `track=top`: las métricas mezclan versiones
anteriores, pruebas y tráfico de desarrollo; no detallan cada sentencia anidada.
No se resetearon ni se cambió esa configuración.

Ejemplos históricos útiles para priorizar, no como medición posterior:

| Grupo histórico | Llamadas | Media |
| --- | ---: | ---: |
| `admin_catalog_page` | 319 | 107,93 ms |
| `admin_import_products` | 14 | 1.262,98 ms |
| `catalog_browse` | 265 | 24,99 ms |
| `catalog_home_context` | 101 | 39,30 ms |
| `admin_orders` | 76 | 5,51 ms |

Los textos de consultas y parámetros no se guardan en el informe de estadísticas:
se conservan IDs, hashes, nombres de funciones y contadores. No se borraron los
26 índices con cero scans observados: no hay una ventana de tráfico comercial
representativa que demuestre su desuso.

## Coste de escrituras, almacenamiento y mantenimiento

En el escenario aislado:

| Índice | Tamaño tras construirlo |
| --- | ---: |
| `products_admin_created_idx`, 10.000 productos | 425.984 B |
| `order_items_product_idx`, 150.000 líneas | 1.310.720 B |
| `order_items_variant_idx`, 150.000 líneas | 1.310.720 B |
| Total | 3.047.424 B ≈ 2,91 MiB |

Construcción local observada: aproximadamente 5,6 / 67,2 / 68,1 ms.
Estos tiempos no garantizan el coste de construirlos en un servidor ocupado.
En staging actual los tres ocupan juntos **32 KiB**.

Insertar 1.000 líneas históricas, con FK y triggers reales, pasó de
**25,740 a 27,593 ms**, aproximadamente **7,2 % más**. El WAL mediano de esa
inserción pasó de **389.494 a 535.488 B**, aproximadamente **37,5 % más**.
El ensayo se revierte por muestra: los bytes de WAL no equivalen a tamaño
permanente ni a tráfico facturado. No se dividió ese tiempo de lote para
prometer una latencia de checkout real.

Cada alta de producto añade una entrada al índice cronológico; cada línea de
pedido añade dos entradas nuevas. No se añadió un índice sobre stock, estado
de pago o datos de perfil que aumente el mantenimiento de esas actualizaciones.
Los índices nuevos también requieren WAL, autovacuum y espacio durante su vida;
no son una optimización gratuita de todas las operaciones.

La migración tiene `lock_timeout` de tres segundos y `statement_timeout` de
30 segundos y se ejecutó transaccionalmente sobre tablas pequeñas verificadas.
**CREATE INDEX normal bloquea escrituras mientras construye**. Para una base
de producción poblada debe revisarse el volumen, la ventana y un procedimiento
concurrente compatible con el gestor de migraciones; no se debe ejecutar
`CREATE INDEX CONCURRENTLY` dentro de la transacción actual ni ampliar límites
silenciosamente. Si falla el presupuesto, investigar y planificar otro despliegue.

## Pruebas e integridad

| Validación | Resultado |
| --- | --- |
| SQL nativo completo | APROBADO: 38 migraciones, 916 comprobaciones y escenarios concurrentes |
| Comparación de respuestas del benchmark | APROBADO: mismos hashes antes/después para todas las lecturas |
| DML del benchmark | APROBADO: 10.000 productos, 10.001 variantes, 50.000 pedidos y 150.000 líneas conservados tras savepoints; rollback final |
| Huella del esquema alojado | APROBADO: únicamente tres registros de índice adicionales; ningún objeto anterior ausente/modificado |
| Índices reales | APROBADO: 120 válidos/listos; sin duplicados estructurales exactos |
| Historial alojado | APROBADO: única migración prevista, 38 hashes contrastados, sin semillas ni archivos de roles |
| RLS/permisos/funciones/relaciones | APROBADO: sin cambios, incluidos los límites de FK diferida de presentaciones |
| API anónima de desarrollo posterior | APROBADO: 55 comprobaciones, sin escrituras autorizadas |
| Verificación final de fundación y recuentos | APROBADO: once controles de seguridad; un producto, dos variantes y cero pedidos/líneas |
| Node | APROBADO: 182 pruebas |
| TypeScript y lint | APROBADO |
| Build staging y producción con configuración pública aislada | APROBADO; no desplegados |

Las pruebas concurrentes conservan aislamiento de propietarios, conflictos de
versión, precios verificados en servidor, SKU únicos y pedidos simulados
idempotentes. No certifican cobros comerciales o reserva/liquidación de stock
que no formen parte de la pasarela actual simulada.

Evidencias principales en `artifacts/index-audit-2026-11-12/`:

- `before-remote.json` / `after-remote.json`: inventario, estadísticas y planes reales.
- `before-catalog.json` / `after-catalog.json`: huellas estructurales sin filas de negocio.
- `comparison.json`: resultados consolidados y comprobación de los únicos cambios permitidos.
- `final-boundary.json`: once controles de seguridad y recuentos reales posteriores.
- `sql-runs/run-wNKs0m/result.json`: benchmark aislado completo con planes/buffers/WAL.
- `migration-dry-run.json` / `migration-apply.json`: destino, único archivo y SHA-256 aplicados.
- `rpc-consumers.json`: enlaces entre llamadas literales y sus fuentes.
- `artifacts/supabase-sql-tests/run-911e2x/result.json`: regresión de 916 comprobaciones.

El inventario reutilizable puede ejecutarse desde una sesión SQL administrativa
en una transacción de solo lectura. La regresión completa se reproduce con
`npm.cmd run test:supabase:sql` en el runner aislado del proyecto. Los scripts
de volumen bajo `artifacts/` rechazan utilizar una base comercial y conservan
su línea base anterior a la nueva migración.

## Recomendaciones pendientes

1. **Catálogo a gran escala:** en el escenario de 10.000 productos, Home y las
   consultas de catálogo aún procesan demasiados candidatos y trabajo de
   proyección/publicación. El nuevo índice no resuelve ese coste. Revisar las
   consultas/CTE y el cálculo de candidatos mediante una auditoría separada,
   conservando RLS y equivalencia de resultados.
2. **Paginación profunda y filtros administrativos:** un índice no elimina el
   coste de OFFSET alto ni convierte en SQL un filtro que se realiza en React.
   No se añadió otro índice de estado/fecha que las consultas actuales no usen.
3. **Estadísticas representativas:** comparar deltas por `queryid` en ventanas
   equivalentes después de tener tráfico real. No interpretar medias históricas
   o contadores cero de desarrollo como evidencia de rendimiento de producción.
4. **Mantenimiento:** supervisar tamaños, uso, escrituras, WAL y autovacuum al
   crecer. No ejecutar REINDEX, retirar constraints o borrar índices por sus
   tamaños actuales sin un diagnóstico de mantenimiento separado.
5. **Producción:** revisar y autorizar su historial pendiente completo antes de
   aplicar esta migración; esta entrega solo sincroniza desarrollo/staging.

Referencias primarias:
[EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html),
[índices compuestos](https://www.postgresql.org/docs/17/indexes-multicolumn.html),
[índices parciales](https://www.postgresql.org/docs/17/indexes-partial.html),
[CREATE INDEX y concurrencia](https://www.postgresql.org/docs/17/sql-createindex.html),
[pg_stat_statements](https://www.postgresql.org/docs/17/pgstatstatements.html),
[trigramas](https://www.postgresql.org/docs/17/pgtrgm.html),
[optimización de consultas en Supabase](https://supabase.com/docs/guides/database/query-optimization).
