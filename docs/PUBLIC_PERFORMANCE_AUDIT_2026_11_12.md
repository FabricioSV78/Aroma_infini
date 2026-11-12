# Rendimiento de la tienda pública — 12 de noviembre de 2026

Se corrigieron esperas de arranque y consultas encadenadas, una actualización
periódica redundante y recorridos repetidos de datos. El resultado conserva
el diseño, los recursos, las animaciones y las reglas comerciales existentes.
No se añadieron dependencias ni migraciones. No se desplegó ni se modificó
producción; los cambios de frontend están en el proyecto local para el flujo
habitual de GitHub y staging.

## Método y alcance de la evidencia

Se separaron las mediciones de navegador, transporte y SQL:

1. **Staging alojado, lectura únicamente:** trazas de Chrome DevTools en
   390 × 844, DPR 2, CPU ×4 y Slow 4G; Home y Tienda. También se hicieron
   18 lecturas anónimas secuenciales del Supabase de desarrollo y tres
   solicitudes de un recurso real del Worker/R2. No se introdujeron datos.
2. **Comparación controlada antes/después:** compilaciones optimizadas en
   modo staging, React y SDK reales, transporte remoto interceptado y
   catálogo sintético de 1.000 perfumes. Siete rutas, tres contextos fríos por
   ruta y dispositivo: **84 navegaciones** en Chrome, 1440 × 900 y 390 × 844.
   Servidor local gzip; móvil con CPU ×4, 150 ms de latencia, 1,6 Mbps para
   archivos y RPC a 150 ms más el tamaño de su JSON a 200 kB/s.
3. **Navegación con interacción:** cuatro recorridos de ocho acciones
   reales de interfaz, escritorio y móvil, antes y después: abrir buscador,
   buscar, abrir ficha, añadir al carrito, carrito, checkout, marcas y tienda.
   No se confirmó un pedido ni se realizó un cobro alojado.
4. **Volumen aislado:** tres muestras por versión para abrir el recomendador
   con 1.000 perfumes y favoritos con 500 productos, con RPC de 150 ms.
   Se midieron los lotes y su concurrencia, sin enviar ese volumen a Supabase.
5. **PostgreSQL 17.10 nativo desechable:** las 37 migraciones del repositorio,
   1.000 productos, 3.000 medios y `EXPLAIN (ANALYZE, BUFFERS)` de las RPC
   públicas ejecutadas como `anon`. Los datos de prueba se retiraron mediante
   rollback. Además se ejecutó la regresión SQL completa de 911 comprobaciones.

Tres muestras no constituyen un percentil de producción. La limitación de CPU
no equivale a un teléfono físico. El servidor local usa HTTP/1.1 y no reproduce
exactamente el HTTP/2 de Cloudflare. La versión alojada es anterior a estos
cambios: **no se presenta una medición local posterior como resultado ya
desplegado**. Tampoco se atribuyen los tiempos de red al motor SQL.

Artefactos: `artifacts/public-performance-2026-11-12/`. Los JSON y las capturas
no contienen credenciales; están ignorados por Git. Los manifiestos
`before-build-assets.json` y `after-build-assets.json` registran hashes y tamaños
de las compilaciones usadas. Se conservaron los arreglos anteriores de CI que
ya estaban en el árbol de trabajo.

## Resultados comparativos

### Primera carga de cada ruta

Mediana en milisegundos hasta que está visible el contenido esperado de la
ruta, no solamente el skeleton o un título. Se conserva el tiempo de las
animaciones aprobadas. Este indicador **no es el LCP**.

| Ruta | Escritorio antes → después | Reducción | Móvil limitado antes → después | Reducción |
| --- | ---: | ---: | ---: | ---: |
| Home | 892 → 365 | 59,1 % | 5.179 → 4.881 | 5,8 % |
| Tienda | 901 → 337 | 62,6 % | 4.450 → 3.879 | 12,8 % |
| Ficha | 896 → 323 | 64,0 % | 4.472 → 3.895 | 12,9 % |
| Marcas | 887 → 320 | 63,9 % | 4.005 → 3.756 | 6,2 % |
| Favoritos | 872 → 328 | 62,4 % | 3.971 → 3.717 | 6,4 % |
| Carrito | 888 → 324 | 63,5 % | 3.965 → 3.803 | 4,1 % |
| Checkout, estado cerrado | 876 → 322 | 63,2 % | 3.984 → 3.810 | 4,4 % |

La política de entorno mantiene el checkout cerrado al servir la compilación
staging desde este origen local. Su fila mide ese estado, **no un checkout
comercial completo**. El flujo con cotización, errores y confirmación simulada
se verificó por separado en sus 24 pruebas de navegador/SDK.

Las RPC de primera carga no se eliminaron artificialmente: Home y Tienda
mantienen seis en este escenario, incluida la selección local del carrito y
las configuraciones; Marcas y Favoritos, siete. En la primera muestra móvil
las solicitudes de recursos bajaron en tres por ruta, por la nueva agrupación
del arranque: Home 77 → 74, Tienda 75 → 72 y ficha 76 → 73. El JavaScript de
Home transferido pasó de 287.768 a 286.348 bytes gzip. El beneficio principal
es adelantar descubrimiento y consultas, no una gran reducción del bundle.

### Core Web Vitals de laboratorio

| Ruta | LCP escritorio antes → después | LCP móvil antes → después | CLS móvil posterior, mediana |
| --- | ---: | ---: | ---: |
| Home | 664 → 364 ms | 6.256 → 5.928 ms | 0,000019 |
| Tienda | 504 → 340 ms | 4.524 → 4.268 ms | 0 |
| Ficha | 492 → 328 ms | 4.312 → 4.128 ms | 0 |
| Marcas | 472 → 324 ms | 4.108 → 3.872 ms | 0 |
| Favoritos | 476 → 312 ms | 4.396 → 4.144 ms | 0 |
| Carrito | 468 → 320 ms | 4.360 → 4.204 ms | 0 |
| Checkout, estado cerrado | 480 → 312 ms | 3.960 → 3.760 ms | 0 |

El CLS se mantiene estable. El LCP móvil todavía necesita trabajo: Home sigue
por encima de 4 s en esta conexión limitada. No se declara aprobada la meta de
LCP de 2,5 s. No hay datos de campo suficientes para certificar el percentil 75
de LCP, INP o CLS de clientes reales.

En los recorridos con clics y escritura, la máxima duración de interacción
observada mediante Event Timing fue **24 → 24 ms en escritorio y 64 → 64 ms
en móvil**. Es una observación de laboratorio, no INP de campo. La navegación
caliente no mejoró de manera uniforme: abrir la ficha tardó 230 → 236 ms en
escritorio y 405 → 412 ms en móvil; abrir Marcas en móvil, 1.764 → 1.969 ms.
Estas muestras únicas no justifican afirmar mejoras en esas interacciones.

Las tareas largas acumuladas de la primera carga móvil de Home fueron
122 → 120 ms; en Tienda, 129 → 129 ms. La memoria no bajó en todas las rutas:
Tienda pasó de 10,40 a 9,76 MB de heap JS en escritorio, mientras ficha pasó
de 6,73 a 7,39 MB. Son instantáneas sin forzar GC, **no una prueba de ausencia
de fugas ni una mejora universal de renderizado**.

### Consultas redundantes y selecciones grandes

| Operación aislada | Antes | Después | Comprobación |
| --- | ---: | ---: | --- |
| Refrescar ficha al volver a la pestaña | 328 ms, 3 RPC | 175 ms, 1 RPC | Mismos datos actualizados; mediana de tres |
| Abrir recomendador, 1.000 perfumes | 1.838 ms | 843 ms | Diez lecturas; concurrencia 1 → 4 |
| Tramo de lecturas del recomendador | 1.591 ms | 641 ms | Mismos candidatos y orden |
| Abrir favoritos, 500 productos | 1.650 ms | 1.050 ms | Cinco lecturas; concurrencia 1 → 4 |
| Tramo de lecturas de favoritos | 811 ms | 327 ms | Sin modificar IDs ni propietarios |

Los lotes no reducen el número total de lecturas ni sus bytes. Evitan esperar
una respuesta para iniciar cada siguiente página. El máximo de cuatro se
aplica a esas lecturas paginadas; las configuraciones independientes tienen
su propia deduplicación. No es una prueba de capacidad alojada.

## Cuellos de botella corregidos

### Arranque de React y navegación

`main.tsx` esperaba la hidratación y los alias multimedia antes de importar
dinámicamente todo el router. Eso retrasaba el descubrimiento de módulos y el
inicio de las consultas de ruta.

Ahora el módulo de rutas puede descubrirse mediante los `modulepreload` del
HTML compilado. `getRouter()` crea una única instancia **después** de hidratar
el adaptador local. Las consultas y el código de ruta avanzan mientras se
resuelven los alias, pero se sigue esperando a los alias antes de renderizar
las imágenes. Auth conserva su inicialización y los loaders protegidos siguen
verificándola. Las páginas y herramientas pesadas mantienen sus imports lazy.

### Home: dos proyecciones independientes en paralelo

`catalog_home_context` y `home_document` se ejecutaban uno después del otro.
Ahora se solicitan juntos. La marca destacada, la versión del documento y los
manifiestos continúan siendo barreras de validación antes de publicar el Home.
Se conserva el rechazo de respuestas anteriores a una actualización y su
reintento fresco. No se muestra contenido parcialmente validado.

### Actualizaciones de catálogo y ofertas

Al refrescar la ficha se pedían marcas y configuración antes del contexto de
producto, aunque este contexto ya incluye esos datos. Ahora el loader confirma
su respuesta y se reutilizan sus metadatos. Las páginas informativas siguen
pidiendo marcas/configuración cuando su loader no las proporciona.

Los eventos de visibilidad simultáneos se agrupan en una sola operación. No se
alargaron los intervalos: se mantiene la actualización remota visible de hasta
un minuto y el reloj de inicio/finalización de las ofertas. Se conservan los
estados de error y reintento existentes.

### Páginas del recomendador y favoritos

`readPublicBatches` procesa hasta cuatro lecturas públicas simultáneas y
conserva su orden. Si una falla, espera a que termine esa tanda y no inicia
la siguiente. El catálogo completo se confirma una sola vez, después de
verificar cantidad, IDs únicos, páginas completas y generación vigente.
Si se invalida durante la lectura, se une a la generación nueva; no publica
una mezcla del catálogo anterior y el actual.

Favoritos conserva su límite existente de 500 IDs y su deduplicación. Las
consultas privadas del propietario, las escrituras, el carrito y las
cotizaciones no se paralelizan ni se incorporan a una caché pública por esto.

### Cálculo de perfiles de marcas

El Home filtraba todos los perfiles una vez por marca. Se sustituyó por un
índice temporal `Map`/`Set` en una única pasada, conservando el orden, las
exclusiones y los tres primeros aromas. La prueba con 1.000 marcas y 10.000
perfiles verifica 10.000 visitas en lugar de las 10 millones del filtro
repetido. No cambia los criterios del recomendador ni los productos mostrados.

## Auditoría de consultas, SQL y cachés

| Apartado | Contrato revisado | Resultado |
| --- | --- | --- |
| Home, categorías, ofertas, más vendidos y marca destacada | `catalog_home_context` + `home_document` | Proyecciones existentes; ahora concurrentes |
| Tienda, búsqueda, filtros, orden y paginación | `catalog_browse` | Filtrado y paginación en servidor; 12 resultados, sugerencias de cinco; sin descargar todo el catálogo |
| Marcas y navegación | `catalog_brand_previews`, metadatos públicos | Proyección de vistas previas; sin consulta de productos por cada marca |
| Ficha, galería y sugerencias relacionadas | `catalog_product_context` | Un contexto para ficha y hasta cuatro recomendaciones; sin N+1 de fichas |
| Reseñas | `product_reviews` y lectura propia autorizada | Páginas de tres; escritura y propiedad independientes del catálogo |
| Recomendador | `catalog_products`, marcas y configuración | Páginas de 100 con cuatro lecturas por tanda; reglas de coincidencia intactas |
| Favoritos | IDs públicos + servicio privado del cliente | Lotes acotados; generación y propietario comprobados antes de confirmar |
| Carrito y checkout | IDs, `checkout_quote`, Worker comercial | Cotización fresca del servidor; no se cachean precios transaccionales o pedidos |
| Cuenta y seguimiento | RPC autorizadas o endpoint de seguimiento | Fuera de la caché pública; no se sustituyen comprobaciones de identidad por datos locales |
| Contacto, envíos y páginas informativas | `site_settings`, metadatos/versiones de envío | Configuración compartida deduplicada; sin carga masiva de productos |
| Medios | Alias, manifiestos verificados, Worker/R2 | Validación de publicación y referencias preservada; formatos y derivados existentes |

La búsqueda mantiene su debounce de 200 ms y descarta resultados de consultas
anteriores. Se conservaron las consultas compactas y los índices introducidos
en auditorías previas; no se añadieron índices sin evidencia.

### Tiempos SQL y transporte real

| RPC | SQL local, mediana / JSON del fixture | HTTP desarrollo real, mediana / JSON real |
| --- | ---: | ---: |
| Catálogo | 46,36 ms / 41.420 B | 183,98 ms / 7.812 B |
| Filtros + búsqueda + precio + página 2 | 65,70 ms / 41.474 B | No se hizo una prueba alojada de volumen |
| Ficha | 38,37 ms / 17.821 B | 150,45 ms / 7.736 B |
| Contexto de Home | 68,75 ms / 162.455 B | 187,70 ms / 7.939 B |
| Vistas previas de marcas | 18,77 ms / 685 B | 151,21 ms / 1.031 B |
| Selección por IDs | 19,85 ms / 3.381 B | 157,61 ms / 25 B, selección vacía |
| Documento editorial de Home | No medido en este fixture SQL | 147,23 ms / 65 B |

Las dos columnas usan conjuntos de datos distintos y **no son un antes y un
después**. No se modificó SQL: no se atribuye una reducción de tiempo del motor
a cambios que se hicieron en React. El plan externo de las funciones encapsula
su ejecución; no se presenta como un detalle de todos sus scans internos.

Se inventariaron índices de slug, marca, orden público, tipo, precio de variantes
activas, familias/productos, posiciones de galería y ofertas. Los planes
observados no mostraron derrames temporales que justificaran ampliar memoria o
añadir índices en esta entrega. No se cambió ninguna RLS, función SECURITY
DEFINER, permiso, trigger ni migración remota.

Las mediciones no demuestran que Supabase Free sea la causa principal ni que
un cambio de plan resuelva las cascadas de frontend. Tampoco permiten garantizar
capacidad o tiempos de un plan concreto bajo concurrencia real.

### Política de caché preservada

- Proyecciones públicas: memoria acotada a 40 entradas, deduplicación en vuelo,
  TTL existente de cinco segundos para lecturas de productos y 30 segundos
  para Home/metadatos. Se conservan invalidación por generación y confirmación
  por versiones. **No se amplió el tiempo de vigencia** para mejorar cifras.
- Ofertas: reloj de sus límites e invalidación/actualización visibles existentes.
- Datos de usuario: comprobación de actor y generación; no se comparten con
  otras cuentas mediante la caché de catálogo.
- Checkout: importa nuevamente cotizaciones verificadas por el servidor.
  Los valores de una card no autorizan un precio, descuento, stock o pedido.
- No se introdujo stale-while-revalidate para precios o stock ni una caché
  compartida de respuestas privadas. Las ventanas públicas de frescura ya
  existentes no se presentan como sincronización instantánea entre sesiones.

## Imágenes, vídeo, Worker y R2

Se conservaron los WebP adaptativos, `srcset`/`sizes`, prioridad de la primera
imagen del Hero y la ficha, dimensiones y carga diferida de imágenes secundarias.
El vídeo editorial usa `preload="none"` y visibilidad para iniciar/detener su
reproducción; se mantienen el póster, la variante móvil y reduced motion. No
se bajó calidad ni se retiraron transiciones, crossfades o carruseles.

La traza alojada anterior midió LCP de 6.407 ms en Home y 5.810 ms en Tienda,
CLS 0 y TTFB 563 ms. El retraso de descubrimiento del LCP fue 5.248 y 4.642 ms,
respectivamente: la espera de código/datos era mayor que la descarga de imagen
de unos 585–590 ms. El ahorro estimado de CSS bloqueante fue 0 ms; no se
reescribieron estilos por esa observación.

El recurso R2 real de 27.666 bytes respondió HEAD 200, GET 200 y GET condicional
304. Tiempos observados de 926, 578 y 481 ms; son solicitudes individuales,
no percentiles ni mediciones de CPU del Worker. Se verificaron WebP, ETag,
`nosniff` y caché pública inmutable de un año. El Worker sigue comprobando el
manifiesto publicado antes de entregar el objeto y conserva streaming/Range.
No se cacheó una autorización o un estado `ready` de forma que eludiera la
retirada segura. No se cambió la configuración de R2 o producción.

## Validación y estado de entrega

| Validación | Resultado |
| --- | --- |
| TypeScript | APROBADO |
| ESLint, cero advertencias | APROBADO |
| Build staging y build producción con configuración pública aislada | APROBADO; sin despliegue |
| Node | 182 pruebas, cero fallos/omitidas |
| Dominio, caché, Home, catálogo, Hero, foco y estados de carga | 86 pruebas, cero fallos/omitidas |
| Catálogo con navegador/SDK Supabase | 57 pruebas, cero fallos/omitidas |
| Favoritos con navegador/SDK | 15 pruebas, cero fallos/omitidas |
| Checkout con navegador/SDK | 24 pruebas, cero fallos/omitidas |
| Autenticación, cuentas y límites de identidad | 81 pruebas, cero fallos/omitidas |
| Worker y contratos multimedia | 139 pruebas, cero fallos/omitidas |
| Home remoto y medios reutilizados | 8 pruebas, cero fallos/omitidas |
| Reseñas remotas y validación del contenido | 14 pruebas, cero fallos/omitidas |
| Configuración pública, Contacto y QR | 53 pruebas, cero fallos/omitidas |
| SQL nativo completo | 37 migraciones, 911 comprobaciones y escenarios concurrentes aprobados |
| API anónima alojada de desarrollo | 55 comprobaciones aprobadas, sin escrituras autorizadas |
| Comparación visual | 14 pares, dimensiones iguales; 13 idénticos píxel a píxel |
| Desbordamientos y errores de página en las 84 navegaciones medidas | Ninguno |

En el par restante, Tienda móvil, difieren 14 píxeles de 6.912.360
(0,000203 %); no cambian disposición o dimensiones. Se inspeccionó la lámina
comparativa de Home, Tienda, ficha y checkout. Hay 28 capturas completas bajo
`screens/`, además de `visual-review-mobile.png`.

Los escenarios nuevos comprueban respuestas fuera de orden, fallos parciales,
invalidación durante cuatro lecturas pendientes, generación nueva, catálogo
incompleto, 500 favoritos y confirmación única. No se debilitó una aserción de
seguridad o un estado de carga para conseguir que pasaran.

Artefactos principales:

- `comparison.json`: 84 observaciones agregadas, LCP/CLS, heap y diferencias visuales.
- `journey.json`: navegación e interacción antes/después, incluido Event Timing.
- `batch-benchmark.json` y `poll-benchmark.json`: lotes y refrescos.
- `hosted-browser-baseline.json`, `hosted-probe.json`, `hosted-security.json`:
  lecturas reales y su alcance.
- `sql-runs/run-F7lKwn/result.json`: tiempos SQL y definición de índices.
- `artifacts/supabase-sql-tests/run-xgeBkS/result.json`: regresión SQL completa.
- `*-tests.json`, `node-tests.log`, `*-result.json`: resultados de las suites y builds.

Comandos de regresión disponibles en el repositorio:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build:staging
npm.cmd run build
npm.cmd run test:node
npm.cmd run test:catalog:supabase
npm.cmd run test:favorites:supabase
npm.cmd run test:checkout:supabase
npm.cmd run test:auth:supabase
npm.cmd run test:media:worker
npm.cmd run test:home:supabase
npm.cmd run test:reviews
npm.cmd run test:site-settings
npm.cmd run test:supabase:sql
```

Los builds de esta auditoría usaron valores públicos sintéticos y las pruebas
HTTP aislaron todas las solicitudes de escritura. No deben ejecutarse suites
de fixtures apuntando a datos comerciales. Los tiempos guardados se generaron
con `build.mjs`, `benchmark.mjs`, `batch-benchmark.mjs`, `poll-benchmark.mjs` y
`journey.mjs` dentro de la carpeta de artefactos; la compilación anterior se
conserva allí para no reconstruir una línea base con código ya modificado.

## Pendientes y recomendaciones basadas en lo medido

1. **PENDIENTE:** publicar mediante `develop`/GitHub a staging y repetir las
   trazas HTTP/2 con el frontend nuevo. Este informe no autoriza ni realiza
   un despliegue de producción.
2. **PENDIENTE:** medición de campo y teléfonos físicos. No hay un INP real
   certificado ni una prueba de autonomía/memoria prolongada en gama media.
3. **PENDIENTE:** reducir más el camino crítico móvil. En el laboratorio aún
   se transfieren unos 286 kB gzip de JavaScript de Home; los módulos
   compartidos y la lectura de perfiles preceden la imagen principal. Antes
   de reagrupar chunks o incorporar hidratación en HTML hay que medir de nuevo
   sobre HTTP/2. No se inventa un beneficio a partir de la cola HTTP/1.1 local.
4. **PENDIENTE de escala:** el recomendador conserva el conjunto completo de
   candidatos y su límite de 10.000. La concurrencia reduce esperas, no volumen.
   Para superar ese tamaño o reducir su transferencia haría falta trasladar
   la coincidencia al servidor, con equivalencia exhaustiva de resultados.
5. **SIN CAMBIOS:** no se certifican capacidad comercial, cobros o liquidación
   de Mercado Pago a partir de pruebas simuladas. No se realizó una carga
   agresiva contra Supabase ni una prueba de compras en producción.

Referencias primarias:
[Core Web Vitals](https://web.dev/articles/vitals),
[optimización de consultas en Supabase](https://supabase.com/docs/guides/database/query-optimization),
[árbol de dependencias de red de Chrome](https://developer.chrome.com/docs/performance/insights/network-dependency-tree),
[R2 desde Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
