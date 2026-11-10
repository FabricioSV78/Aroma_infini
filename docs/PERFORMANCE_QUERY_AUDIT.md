# Auditoría de consultas y carga — 29 de octubre de 2026

La revisión integral posterior del 5–6 de noviembre, con nuevas proyecciones
de Home/Marcas, checkout acotado, planes SQL y límites pendientes, está en
[PERFORMANCE_AUDIT_2026_11_05.md](PERFORMANCE_AUDIT_2026_11_05.md).
Las secciones siguientes conservan las mediciones de cada etapa y su fecha;
no deben interpretarse como un inventario único del estado actual.

## Revisión completa del menú administrativo — 5 de noviembre de 2026

Se recorrieron las **12 opciones**: Resumen, Pedidos, Clientes, Reclamaciones,
Productos, Marcas, Familias olfativas, Promociones, Contenido del Home,
Notificaciones, Tarifas de envío y Datos de la tienda. La medición se hizo
antes y después con la misma aplicación, SDK y transporte HTTP aislado,
200 ms de latencia añadida por solicitud y tres rondas por opción. No se
utilizaron sesiones personales, consultas administrativas alojadas ni escrituras
remotas.

### Cambios adicionales aplicados

- **Home:** la preparación del catálogo autorizado y del actor se ejecuta en
  paralelo y comparte su verificación de identidad pendiente. Se espera el
  catálogo antes de interpretar y aplicar el documento Home. El catálogo
  público del recomendador se solicita al abrir ese apartado, en vez de
  descargarlo al editar Hero, categorías o vídeo.
- **Reclamaciones:** las lecturas simultáneas de la misma página/filtro/búsqueda
  y credencial comparten únicamente la petición pendiente. Al guardar se
  invalidan las lecturas anteriores. No se cachea una lista privada finalizada;
  volver a consultar sigue obteniendo datos actuales. Se comprueban usuario,
  token y generación antes de devolver respuestas.
- **Notificaciones:** la lectura del estado del mismo dispositivo y credencial
  comparte únicamente su petición en vuelo. Se invalida al cambiar suscripción
  o cerrar sesión. Los errores no impiden reintentar. En el Worker, identidad
  y permisos se comprueban en paralelo; ambas respuestas deben aprobarse antes
  de consultar el dispositivo o ejecutar una operación protegida. Se conserva
  la prioridad del rechazo de Auth y se espera la finalización de ambos trabajos
  acotados.
- **Carga de código:** registro único de imports administrativos utilizado por
  router y menú. Cursor, foco y toque preparan solo el módulo de la opción
  elegida, sin ejecutar loaders ni consultar registros privados. Se evita esa
  precarga si el navegador declara ahorro de datos o conexión 2G. Un fallo de
  precarga no bloquea el enlace y permite volver a intentarlo.
- **Pedidos:** su listado se importa directamente; entrar en Pedidos ya no
  requiere descargar también Marcas, Clientes y Promociones. PDF y Excel
  continúan cargándose solo al ejecutar esas funciones.
- **Respuesta visual:** la opción seleccionada muestra un indicador discreto
  mientras la navegación está pendiente. Conserva nombre, foco y tamaño; con
  movimiento reducido el indicador permanece estático. No se cambió la
  composición de las pantallas.

### Resultados por opción

Solicitudes observadas durante una navegación interna de prueba, con catálogo
y pedidos vacíos válidos. Incluyen verificaciones de acceso, no solo consultas
de datos. No son estimaciones para cualquier volumen comercial.

| Opción             | Antes | Después | Decisión                                                             |
| ------------------ | ----: | ------: | -------------------------------------------------------------------- |
| Resumen            |   2–3 |     2–3 | Se conserva la actualización de pedidos y sus permisos               |
| Pedidos            |     2 |       2 | Se conserva la caché breve existente; código de listado separado     |
| Clientes           |     2 |       2 | Se reutilizan los pedidos autorizados sin otra consulta de clientes  |
| Reclamaciones      |     2 |       1 | Eliminada lectura idéntica concurrente                               |
| Productos          |     0 |       0 | Mantener catálogo común ya cargado                                   |
| Marcas             |     0 |       0 | Mantener catálogo común ya cargado                                   |
| Familias olfativas |     0 |       0 | Mantener catálogo común ya cargado                                   |
| Promociones        |     3 |       3 | Mantener paralelismo seguro de la corrección anterior                |
| Contenido del Home |     7 |       3 | Una verificación duplicada menos y tres lecturas públicas diferidas  |
| Notificaciones     |     2 |       1 | Un estado de dispositivo pendiente compartido                        |
| Tarifas de envío   |     3 |       3 | Mantener paralelismo seguro de la corrección anterior                |
| Datos de la tienda |     1 |       1 | Ya compartía lecturas pendientes; conservar lectura fresca al editar |

Los duplicados al montar Reclamaciones y Notificaciones eran reproducibles en
**React StrictMode de desarrollo**. La solución también evita otras llamadas
simultáneas equivalentes; no se atribuye ese doble montaje a producción.

En Home, la respuesta privada final pasó de aproximadamente 646 a 434 ms
(medianas de tres muestras con esa latencia añadida). El tiempo completo de
los localizadores incluye sus intervalos de espera y ruido del entorno; no
permite afirmar una mejora porcentual uniforme de todas las pantallas.
En esta muestra no se observaron tareas del hilo principal superiores a 50 ms
durante las transiciones registradas; eso no certifica el comportamiento con
un catálogo grande o en todos los dispositivos.

### Validación y límites

- Comparación: `artifacts/admin-all-navigation-2026-11-05/before.json`,
  `after.json` y `comparison.json`, con las solicitudes y su cronología.
- Navegación móvil: otras tres rondas completas, 36 transiciones, sin errores
  JavaScript ni desbordamiento horizontal.
- Capturas: las 12 opciones en **1920 × 1080, 1440 × 900, 1366 × 768,
  768 × 1024 y 390 × 844**, conservadas en `screenshots/` del mismo directorio.
  Se comprobó contenido listo/habilitado, no solo que apareciese un título.
  Estas capturas usan datos vacíos aislados; las suites de módulos comprueban
  también pedidos, productos, reclamaciones y estados poblados.
- Pruebas nuevas: precarga por intención sin lecturas privadas, navegación con
  ahorro de datos, feedback pendiente, catálogo del recomendador diferido,
  deduplicación y separación de filtros, invalidación tras mutaciones,
  rechazo/reintento, cierre de sesión con respuesta pendiente y concurrencia de
  identidad/permisos en el Worker.
- Regresiones verificadas: **196 casos únicos**, repartidos entre panel y
  estados de carga (53), catálogo remoto (25), pedidos (17), configuración
  comercial (15), reclamaciones (24), interfaz de notificaciones (16) y
  contratos/criptografía/runtime nativo de push (46). Los casos nuevos de Home
  y precarga se repitieron después de corregir selectores de prueba; no se
  presenta como una única ejecución monolítica. También pasaron `tsc -b`,
  ESLint, compilación de staging, comprobación del manifiesto de 346 archivos y
  empaquetado Wrangler con `--env staging --dry-run`.
- Se conservan los controles de sesión, rol, MFA, RLS y versiones de edición.
  El menú no precarga datos privados y no se añadió caché prolongada de acceso.
- Se aplicó en el proyecto local; esta revisión no desplegó cambios, modificó
  tablas, activó pagos, notificaciones push o indexación.

Algunas pantallas seguirán esperando la respuesta real del servidor para
mostrar datos autorizados. El objetivo es eliminar repeticiones, dependencias
innecesarias y falta de respuesta visual, sin presentar datos como actuales
antes de comprobarlos. No se promete una navegación instantánea con cualquier
conexión.

## Actualización: navegación administrativa — 5 de noviembre de 2026

Se reprodujo la diferencia entre Productos y Tarifas de envío con el SDK real
y un servidor HTTP aislado. Envíos esperaba cuatro peticiones en serie antes
de cambiar de pantalla: `getUser`, `current_actor`, otro `getUser` y
`admin_commerce_settings`. La navegación a Productos no tiene ese loader hijo.
No se encontró un bloqueo de render que justificase cambiar el formulario.

`adminDataLoader` conserva el guard de acceso fresco y, únicamente cuando ya
hay una sesión administrativa verificada y vigente, comienza la lectura
protegida en paralelo. La ruta no se confirma hasta completar ambas operaciones.
Las cargas frías o vencidas mantienen la verificación antes de la lectura.
El loader raíz del panel conserva su secuencia original de autorización y
carga inicial del catálogo; el solapamiento se aplica a sus rutas hijas.

`verifySupabaseUser` comparte solo una petición pendiente del mismo token;
el resultado y los errores dejan de compartirse al finalizar. No hay caché de
autorización, tokens nuevos persistidos ni supresión de validaciones. Catálogo,
pedidos y configuración comercial mantienen sus comprobaciones de identidad,
rol, MFA, propietario y continuidad. Las lecturas comerciales concurrentes
comparten además una RPC en vuelo, aislada por sesión. Volver después sigue
consultando los datos actuales y conserva el control de versiones al guardar.

Comparación con **300 ms de latencia artificial por petición**, tres muestras
por versión, mismos módulos calientes y navegador Chrome:

| Medición                                    |   Antes | Después |
| ------------------------------------------- | ------: | ------: |
| Mediana desde clic hasta formulario visible | 1374 ms |  866 ms |
| Peticiones de la navegación medida          |       4 |       3 |
| Verificaciones `getUser` duplicadas         |       2 |       1 |
| Etapas remotas secuenciales                 |       4 |       2 |

La reducción observada del tiempo completo es aproximadamente 37 %. Estas son
pruebas controladas de la aplicación/SDK, **no mediciones del usuario ni de
Supabase alojado**, y no equivalen a un percentil de producción.
Los datos reproducibles están en
`artifacts/admin-navigation-2026-11-05/before.json` y `after.json`.
No se alteraron tablas, RLS, secretos, despliegues ni el diseño del panel.

## Alcance y método

Se revisaron las lecturas públicas, autenticación, cuenta, carrito/checkout y
catálogo administrativo. Se aplicaron las guías instaladas `web-perf` y
`frontend-react-best-practices`. La medición alojada utiliza únicamente la clave
publicable y RPC de lectura anónima; no crea usuarios, modifica productos ni
registra respuestas, credenciales o información personal.

Los resultados no son una certificación de rendimiento en producción: el
entorno alojado contiene **un producto publicado**. No permite medir una
paginación representativa ni extrapolar el percentil 95 de usuarios reales.
Los grupos de 100 y 1000 productos son fixtures de PostgreSQL local aislado,
se revierten al terminar y nunca se envían a Supabase alojado.

## Problema principal comprobado antes del cambio

`createSupabaseStorefrontRepository.load()` obtenía primero 100 DTO completos,
marcas y ajustes. Después descargaba **todas** las páginas restantes de 100
productos, secuencialmente. Sólo entonces resolvía el snapshot compartido. La
caché duraba cinco segundos.

`catalogService.getCatalog()`, `getBrands()`, `getBrandPreviews()`,
`getProduct()` y `suggest()` consumían ese snapshot. `StoreLayout` también lo
solicitaba al navegar, al volver a una pestaña y en la revisión de ofertas de
hasta una vez por minuto. Por ello una página de ayuda podía iniciar la lectura
completa del catálogo.

Esto **no era N+1 HTTP por producto**: eran `ceil(N / 100) + 2` RPC para una
carga fría. El coste innecesario era descargar y construir galerías, notas,
descripciones y metadatos de cada producto antes de mostrar doce cards. Las
subconsultas del DTO estaban relacionadas por producto, pero su número de
ejecuciones crecía con todos los productos descargados.

## Línea base medida

Dos lecturas HTTP secuenciales por RPC, sin concurrencia ni carga artificial.
Los bytes son JSON decodificado; no representan los bytes comprimidos de red.
Los percentiles usan rango más próximo. **Con n=2, p50/p95 son descripciones de
estas dos muestras, no estimaciones fiables de producción.**

| RPC alojada                |   n |       p50 |       p95 | JSON decodificado | Datos            |
| -------------------------- | --: | --------: | --------: | ----------------: | ---------------- |
| `catalog_products(100, 0)` |   2 | 162,26 ms | 254,62 ms |            6038 B | 1 producto       |
| `catalog_brands()`         |   2 | 131,79 ms | 143,07 ms |              86 B | 1 marca          |
| `catalog_settings()`       |   2 | 136,07 ms | 141,91 ms |              68 B | ajustes públicos |
| `catalog_product(slug)`    |   2 | 146,23 ms | 163,34 ms |            6013 B | 1 producto       |

La captura de Chrome DevTools del staging `/tienda` registró una navegación,
sin limitación de CPU o red y con caché estática caliente: LCP 2015 ms, CLS 0,
TTFB 132 ms y tres RPC públicas. La espera del recurso LCP fue 304 ms, la carga
1572 ms y el retraso de renderizado 8 ms. La descarga de la imagen en sí duró
4 ms. La estimación de ahorro LCP por CSS bloqueante fue **0 ms**; no se
justificó modificar el diseño o el CSS por ese diagnóstico. Una navegación no
permite publicar un p50/p95 de navegador ni datos de campo.

Los informes numéricos y el script reproducible están en
`artifacts/performance-2026-10-29/`, excluido de Git. El script de RPC se detiene
ante errores y acepta únicamente una clave publicable/anónima.

## Cambio SQL acotado

La migración `20261029000700_catalog_browse.sql` añade tres RPC de lectura:

- `catalog_browse(p_query, p_page_size)`: filtra y cuenta candidatos ligeros,
  ordena y selecciona la página, y construye el DTO completo únicamente para
  los **1–12 productos solicitados**. Incluye las facetas y ajustes públicos en
  la misma respuesta. El Home puede solicitar cuatro productos.
- `catalog_products_by_ids(p_product_ids, p_variant_ids)`: hidrata únicamente
  productos concretos o los productos de las presentaciones del carrito. Tiene
  un máximo combinado de 100 IDs; una selección vacía devuelve cero productos.
- `catalog_product_context(p_slug)`: entrega la ficha y hasta cuatro relacionadas
  en una sola lectura. Conserva las recomendaciones manuales publicadas sin
  rellenarlas automáticamente; el fallback usa tipo, coincidencia de familias,
  marca y orden público. Un producto privado o inexistente devuelve ficha nula
  y ninguna recomendación.

Estas funciones pertenecen a `aro_api_executor`, que no puede iniciar sesión
ni omitir RLS. No añaden acceso directo a tablas para el navegador, no exponen
campos administrativos y no convierten marcas inactivas, borradores, productos
agotados ni complementos deshabilitados en productos públicos.

Se conservan los filtros existentes: OR dentro de una familia de filtros y
AND entre grupos; marcas por slug, géneros, familias múltiples, tipo, búsqueda
literal sin distinguir acentos/mayúsculas y precios en soles. Los precios se
calculan con `private.catalog_price_cents`, incluyendo vigencia y redondeo de
ofertas. El filtro de precio acepta cualquier presentación activa disponible
que cumpla ambos límites; el orden usa el menor precio final disponible. Los
desempates usan el ID para que las páginas sean deterministas.

Los parámetros, tamaños de página, arrays y longitud de búsqueda están
acotados. No se crean índices por intuición: ya existen índices para producto
de variante, familia/producto, marca, orden público y precios activos. Un
índice nuevo debe justificarse con el plan y carga reales; una búsqueda
substring normalizada no se acelera automáticamente con un B-tree del nombre.

## Comparación SQL local reproducible

Prueba con PostgreSQL 17.10, tres muestras por escenario y por estrategia.
Incluye dos presentaciones por producto, una agotada, notas, descripción,
imagen, familias y ofertas; no son productos comerciales. Compara construir
el snapshot completo contra la primera página. No incluye latencia de red,
compresión o renderizado. Los bytes anteriores excluyen los envoltorios de
página y las consultas de marcas/ajustes; el ahorro indicado es conservador.

| Catálogo local | Estrategia        | DTO construidos |      JSON | Tiempo SQL, 3 muestras            |
| -------------- | ----------------- | --------------: | --------: | --------------------------------- |
| 100 productos  | snapshot completo |             100 |  165222 B | 310,713 / 369,996 / 301,992 ms    |
| 100 productos  | browse de 12      |              12 |   21113 B | 21,456 / 15,700 / 14,429 ms       |
| 1000 productos | snapshot completo |            1000 | 1656080 B | 3817,058 / 3354,963 / 3271,319 ms |
| 1000 productos | browse de 12      |              12 |   21116 B | 41,924 / 40,757 / 41,205 ms       |

Con 1000 productos el JSON medido de la primera página se reduce **98,72 %**,
y la lectura del catálogo pasa de diez páginas RPC a una. Esto no significa
que toda consulta SQL sea O(12): los filtros y el recuento exacto todavía
evalúan los candidatos publicados. La mejora limita la construcción y el
transporte del DTO, que eran el coste principal observado.

Las mediciones se conservan en `sql-browse-benchmark.json`. El test
`supabase/tests/008_catalog_browse.sql` ejecuta los escenarios y valida filtros,
conteos, orden, precios de ofertas, búsqueda literal, límites, DTO por IDs y
ocultación por RLS. También comprueba recomendaciones automáticas, manuales y
productos inexistentes. La validación final de la suite completa ejecutó 14
migraciones, 317 registros de comprobación y las pruebas de concurrencia de catálogo, familias,
SKUs y medios; terminó correctamente y todas sus filas se revirtieron.

La selección representativa de marca/familia/stock también se inspeccionó con
`EXPLAIN (ANALYZE, BUFFERS)`, bajo `aro_api_executor` y RLS. Con 1000 fixtures
y caché de PostgreSQL caliente, obtuvo doce filas en 1 ms, 497 bloques hit y
cero lecturas físicas. Usó `products_public_order_idx`,
`product_olfactory_families_position_unique` y `product_variants_product_idx`.
Es el plan de candidatos, no el coste total de contar y serializar la RPC.
Se conserva en `artifacts/performance-2026-10-29/sql-plan.json`.

## Revisión por flujo

| Flujo             | Comportamiento revisado                                                          | Criterio de optimización                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tienda            | snapshot completo antes de paginar                                               | RPC paginada con facetas; evitar que el layout vuelva a descargar todo                                                       |
| Home              | cuatro más vendidos y perfiles de marca derivados del snapshot                   | cuatro DTO y contexto específico; no reemplazar el universo del recomendador por esos cuatro                                 |
| Marca/buscador    | filtros y sugerencias sobre snapshot completo                                    | browse acotado; no una petición de detalle por card                                                                          |
| Detalle           | búsqueda por slug dentro del snapshot completo                                   | `catalog_product_context(slug)` con relacionadas exactas en la misma respuesta                                               |
| Favoritos/carrito | IDs locales resueltos contra snapshot                                            | lote acotado por IDs o presentaciones, con respuesta publicada actual                                                        |
| Recomendador      | opciones y puntuación dependen de todos los candidatos                           | conservar la exactitud; un futuro RPC debe aplicar todas las reglas, no puntuar sólo la primera página                       |
| Cuenta            | perfil y dirección se consultan en paralelo                                      | no hay N+1 por fila; mantener verificación de propietario y cancelar respuestas de otra sesión                               |
| Auth              | SDK `getUser`, `current_actor`, MFA y comprobaciones de sesión                   | conservar la frontera de seguridad; no sustituir verificación remota por confiar en metadatos locales                        |
| Checkout          | simulación relee catálogo publicado y guarda pedido local                        | hidratar sólo presentaciones necesarias; no afirmar reserva, cobro ni transacción de stock real                              |
| Admin catálogo    | descarga páginas de 100 y conserva estado autorizado para formularios/inventario | sigue acotado a 10000 y ligado al propietario; futura paginación administrativa necesita conservar edición/colas/importación |
| Fotos             | varias rendiciones por foto y lectura de manifiesto verificado                   | no confundir lecturas de autorización con N+1 evitable; conservar claves inmutables/caché y validación                       |

Pedidos, pagos y tarifas conservan adaptadores locales donde su persistencia
remota aún no está implementada. No se han inventado consultas, métricas o
servicios alojados para esos módulos.

## Referencias oficiales

- [Supabase: Database functions](https://supabase.com/docs/guides/database/functions):
  limitar `SECURITY DEFINER`, fijar `search_path` y conceder ejecución explícita.
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security):
  mantener autorización en la base y evaluar el coste de las políticas.
- [Supabase: Query optimization](https://supabase.com/docs/guides/database/query-optimization):
  medir consultas y revisar planes antes de añadir índices.

No se modifica infraestructura, precio, cobertura, lógica del recomendador ni
estilo visual como parte de esta auditoría.
