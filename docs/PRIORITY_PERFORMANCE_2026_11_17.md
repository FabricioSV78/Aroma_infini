# Rendimiento público — intervención del 17 de noviembre de 2026

## Resultado y alcance

Se parte de staging `84a8d1c5-ca9c-4d7f-9660-d7eeff1178a5`, posterior al
traslado de los 162 recursos predeterminados a R2. Compararla directamente con
las cifras anteriores a ese traslado no sería un ensayo equivalente.

La candidata es `da5735f3-23b6-45d6-af27-09459bd3c7fa`. Las correcciones son
acotadas: solapar la configuración pública y la lectura de ficha, y eliminar
una segunda revalidación remota del catálogo. No se declara alcanzado el
objetivo de LCP inferior a 2,5 segundos en las tres primeras visitas móviles.

No se modificaron producción, Auth/MFA, RLS, precios, reservas, inventario,
checkout, calidad multimedia, tipografías, animaciones ni composición. Los
21 archivos CSS mantienen exactamente sus hashes. No se añadieron índices,
dependencias, cachés, reintentos ni plazos de espera. No hubo commit, push,
reset ni retirada de archivos anteriores.

## Cambios conservados

### Ficha: una dependencia secuencial menos

Antes, `catalog_product_context` finalizaba antes de iniciar `site_settings`.
Ahora una preparación perteneciente a la petición inicia la configuración
junto a la ficha; la proyección HTML consume esa misma promesa, sin otra RPC.
Se conservan el presupuesto de 128 KiB, el plazo de 1000 ms, la validación
anónima y el fallback independiente. Ninguna promesa ni autorización se
comparte entre peticiones o usuarios.

La preparación solo admite GET de una ficha con slug sintácticamente válido
y máximo 512 caracteres. Un producto inexistente puede producir **una lectura
pública adicional de configuración**; se cancela al resolverse el 404, sin
consultar documentos o alias auxiliares ni publicar una proyección de éxito.
El ensayo detectó y permitió corregir un límite que aceptaba un slug de 513
caracteres. Las rutas privadas, métodos distintos y slugs inválidos no preparan
datos. No se adelanta el documento multimedia ni se cambia su caché existente.

`catalog_context` es el cronómetro HTTP del Worker, incluido el cuerpo y su
procesamiento JSON; **no es una medición de tiempo SQL**. La correlación de
staging ahora incluye el ID de esa lectura inicial en `X-Aroma-Public-Reads`,
junto a los de configuración. No expone cookies, credenciales ni payloads.

### Ofertas: una sola revalidación del catálogo

`StoreFrame` ya esperaba la revalidación remota antes de publicar el reloj de
ofertas. El efecto de `CatalogPage` volvía a ejecutar el loader. Aunque una RPC
podía reutilizar el DTO vigente, repetía validación y actualización de React.
Se elimina esa segunda ejecución exclusivamente en remoto. La rama local
conserva su revalidación para recalcular filtros de precio al vencer una oferta.

La prueba cuenta el loader real, no solo peticiones HTTP: tras dos avisos de
visibilidad simultáneos, hay una ejecución y una lectura `catalog_browse`,
con precio y descuento actualizados. La prueba local verifica que el producto
sale del filtro de precio al vencer su oferta.

## Comparación de la ficha sin descargas de archivos estáticos

Veinte pares AB/BA, misma URL de staging, versión seleccionada explícitamente
por CDP/HTTP, conexión inicial excluida y datos reales de solo lectura:

| Mediana | Base | Candidata |
| --- | ---: | ---: |
| Recorrido del Worker: `catalog_context` + tramo posterior `public_context` | 47 ms | 29 ms |
| Consulta HTTP de ficha, `catalog_context` | 29 ms | 29 ms |
| Tramo posterior de contexto público | 15 ms | 0 ms |
| HTTP hasta cabeceras desde este cliente | 180,4 ms | 166,5 ms |

La reducción demostrada es de 18 ms en ese recorrido del Worker y alrededor
de 14 ms hasta cabeceras. Los intervalos de configuración y ficha se solapan:
no se deben sumar todos los `Server-Timing`. Esta prueba no demuestra una
reducción equivalente del LCP ni elimina las colas internas del proveedor.

Evidencia: `artifacts/priority-performance-2026-11-17/product-document-paired.json`.

## Chrome: primera visita y recarga

Serie final: **180 visitas**, cinco muestras por versión, ruta, perfil y estado
de caché. Chrome real, procesos nuevos por par frío/caliente, AB/BA, sin builds
ni suites pesadas simultáneas. Escritorio 1440 × 900; móvil 390 × 844, DPR 2,
CPU ×4. Perfiles móviles de 9 Mbps/80 ms y 1,6 Mbps/150 ms. No se cambiaron DNS,
VPN, proxy o protocolos. Caché fría de navegador no implica MISS de Cloudflare.

LCP mediano en ms, **incluyendo las muestras lentas**, sin selección favorable:

| Perfil | Página | Frío base → candidata | Caliente base → candidata |
| --- | --- | ---: | ---: |
| Escritorio | Home | 852 → 956 | 280 → 324 |
| Escritorio | Tienda | 916 → 880 | 272 → 336 |
| Escritorio | Ficha | 1012 → 1460 | 308 → 344 |
| Móvil | Home | 1384 → 2400 | 452 → 428 |
| Móvil | Tienda | 1172 → 1408 | 432 → 420 |
| Móvil | Ficha | 1340 → 1384 | 464 → 456 |
| Móvil lento | Home | 3000 → 2968 | 536 → 604 |
| Móvil lento | Tienda | 2568 → 2696 | 492 → 496 |
| Móvil lento | Ficha | 3180 → 2864 | 500 → 556 |

**No hay una mejora general de LCP demostrada.** Tampoco se ocultan los valores
peores de la candidata. En móvil lento, las medianas del intervalo real entre
cabeceras y LCP fueron Home 2555 → 2526 ms, Tienda 2225 → 2226 ms y ficha
2443 → 2440 ms. La mayoría de las diferencias grandes preceden al renderizado.
Restar medianas independientes no reproduce la mediana de esos intervalos.

CLS fue cero en las 180 visitas. Las cantidades medianas de solicitudes en
móvil lento permanecieron en 26/16/17 para Home/Tienda/ficha. Los bytes
transferidos variaron menos de 1 KiB entre sus medianas; no se ha conseguido
otra reducción del bundle. El TBT de laboratorio tampoco mejora de forma
general: frío 52 → 53, 50 → 61 y 49 → 53 ms. No hay INP de campo disponible.
Los perfiles son emulación en Chrome, no certificación de teléfonos físicos.

En escritorio, los candidatos LCP de la ficha incluyen las miniaturas de otras
fotografías, no necesariamente la imagen principal visible. Se verificaron sus
URLs y se conserva aparte el momento de decodificación de la primera foto. No
se cambió la galería para alterar qué candidato elige Chrome. Las capturas y
trazas permiten distinguir ambos fenómenos.

La ficha de escritorio más lenta de la candidata se investigó: una muestra
descargó el mismo React de 92.471 bytes en 462 ms frente a 245 ms del control,
mientras su ejecución de script fue menor. Se conserva el control adicional
de conexión precalentada para separar esa transferencia del código y del TTFB.

El control adicional conserva todos sus valores: después de una visita de
calentamiento se vacía la caché HTTP, sin modificar DNS o protocolos. Hay tres
pares por ruta en móvil lento y cinco pares de ficha en escritorio. En móvil
lento, el intervalo cabeceras–LCP fue Home 2356 → 2358 ms, Tienda 2227 → 2056 ms
y ficha 2262 → 2253 ms. En escritorio, ficha dio LCP 580 → 632 ms e intervalo
407,5 → 461,1 ms; el script solo pasó de 18,4 → 19,5 ms. La diferencia residual
no se oculta ni se considera corregida: no demuestra un nuevo coste de ejecución
que explique los 448 ms de diferencia de la primera serie. No se añadió otra
refactorización para perseguirla sin atribución causal.

Una visita previa no garantiza reutilizar siempre la conexión: Chrome puede
cambiar de HTTP/2 a HTTP/3. Cada respuesta conserva `connectionReused`; en ese
control de escritorio se reutilizó en 5/5 documentos base y 4/5 candidatos.
Es un control de transporte calentado, **no una primera visita mejorada**.

Evidencias: `public-paired-final.json`, `public-summary.json`,
`network-traces/`, `network-netlog/` y `network-screens/` en el directorio de esta
intervención. Los nombres de cache fría/caliente pertenecen a cada visita.

## DNS y transporte

Se examinaron seis NetLogs de resoluciones superiores a un segundo, incluidos
ambos brazos. En un caso de la candidata de Tienda, una consulta AAAA (`28`)
inició un intento UDP sin respuesta recibida en el registro; se abrió otro
intento a los 1016 ms y recibió respuesta unos 3 ms después. Otras respuestas
del mismo trabajo llegaron a los 7 y 15 ms. El trabajo de resolución terminó
a los 1019 ms, antes de enviar la petición al Worker.

La selección de versión es una cabecera HTTP y se transmite después de DNS;
no puede provocar ese intervalo anterior. Esto demuestra el mecanismo de
espera del navegador, pero no qué operador o equipo perdió o retrasó la
respuesta. No se declara una avería del ISP, Cloudflare o Supabase. No hubo
transferencias críticas fallidas en las 180 visitas finales; el fallo QUIC
histórico no se reprodujo y no se considera resuelto por ello.

Evidencia seleccionada sin direcciones de red privadas: `dns-evidence.json`.

## R2 y manifiestos

Se hicieron 50 GET seriales de diez variantes WebP ya publicadas, sin cargas,
borrados, cache busting o publicación de buckets. Se conserva la consulta
fresca del manifiesto: HIT significa reutilización de **bytes**, no de permisos.

| Tiempo | P50 | P95 | Máximo |
| --- | ---: | ---: | ---: |
| Hasta cabeceras al cliente | 168,9 ms | 207,9 ms | 478,8 ms |
| Cuerpo HTTP | 24,4 ms | 57,5 ms | 124,4 ms |
| Descarga completa | 192,5 ms | 249,7 ms | 577,0 ms |
| Cabeceras del manifiesto vistas desde Worker | 24 ms | 38 ms | 68 ms |
| Envoy upstream | 2 ms | 16 ms | 16 ms |
| Tramo de recuperación de bytes, con HIT | 9 ms | 16 ms | 18 ms |

Las 50 respuestas fueron HIT de bytes. Cada respuesta conserva sus IDs Worker,
upstream y CF-Ray. El tail entregó 19 coincidencias exactas de esos 50 IDs;
no se inventaron las otras 31 trazas. No expuso fases PostgREST. El pico
histórico de 1000 ms no apareció en esta cohorte; **no se declara eliminado**.
La fila de bytes mide la caché en esta cohorte, no una lectura fría de R2.
No se vació una caché compartida ni se fabricó un MISS sobre recursos reales.
Su tramo interno sigue requiriendo telemetría del proveedor, descrita en
[la solicitud preparada para Supabase](SUPABASE_UPSTREAM_SUPPORT_2026_11_14.md).
No se envió ningún mensaje al proveedor.

## PostgreSQL y compute

Quince EXPLAIN (ANALYZE, BUFFERS), rol anónimo, solo lectura y ejecución
secuencial, dieron medianas SQL de Home 9,216 ms, catálogo 9,911 ms y ficha
10,5 ms. El primer plan de cada serie fue más lento y se conserva. No hay un
nuevo cuello de botella SQL demostrado que justifique otro índice o migración.
El catálogo alojado tiene actualmente un producto; no equivale a un ensayo de
carga con miles de filas ni invalida los ensayos aislados anteriores.

La API oficial de métricas expuso unos 431,9 MiB físicos y 143,8 MiB disponibles,
358,1 MiB de swap ocupada y un `Committed_AS` próximo a `CommitLimit` en ese
instante. Este último es un compromiso de memoria virtual, **no RSS, ni prueba
de OOM**. El pool PostgREST tenía máximo 10, disponibles 9, espera 0 y timeouts
acumulados 0. Tres observaciones SQL no encontraron transacciones largas,
bloqueos ni consultas ajenas activas. No se atribuye una cola histórica a estos
valores posteriores.

La comparación de capacidad es documental: Nano ofrece hasta 0,5 GB y Micro
1 GB, ambos con CPU compartida, según [Supabase Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk).
Micro puede dar más margen; no demuestra que cure DNS ni garantiza resolver
el pico upstream. No se contrató, cambió o midió una instancia de pago.
Las métricas se obtuvieron mediante la [API oficial de observabilidad](https://supabase.com/docs/guides/observability/metrics).

## Experimentos descartados y decisiones

- Retrasar el SDK por intervención de red en la misma base: tres pares por
  ruta en móvil lento. No mostró una ganancia consistente y no se cambió Auth.
- Nuevos cortes de CSS o bundles: las trazas no justifican otra fragmentación.
  Se mantienen los guardas de separación administrativa, la cascada, fuentes
  y precargas que ya habían demostrado utilidad.
- No se sustituyeron fotos, comprimieron originales, publicaron buckets,
  ampliaron cachés de precios o reutilizaron decisiones de autorización.
- Skeletons, fallback de error, reservas de espacio, revisión diferida,
  galería y exclusión completa de vídeos móviles se conservan y se prueban.

La evaluación de LCP se hizo por sus tramos reales, siguiendo la distinción
entre carga y retraso de representación de [web.dev](https://web.dev/articles/optimize-lcp).
Una descarga terminada antes no garantiza que React haya mostrado la imagen.

## Verificación y cierre

### Navegación e interacciones reales

Hubo 18 recorridos SPA medidos y 18 calentamientos excluidos, tres pares por
perfil. Las 180 acciones medidas recorrieron Home, Tienda, marca, ordenamiento,
retirada de filtro, ficha, favoritos de invitado, Contacto, carrito y checkout.
No hubo recargas completas, errores JavaScript ni peticiones fallidas no
canceladas. Las cancelaciones se conservan como tales en las trazas.

Contenido del destino disponible, mediana de laboratorio en ms, navegador ya
iniciado; **no es LCP de primera visita ni confirmación del pago**:

| Perfil | Tienda base → candidata | Ficha base → candidata | Contacto base → candidata |
| --- | ---: | ---: | ---: |
| Escritorio | 150 → 169 | 201 → 155 | 7 → 7 |
| Móvil | 206 → 205 | 201 → 204 | 37 → 37 |
| Móvil lento | 251 → 239 | 220 → 226 | 37 → 37 |

Catálogo y ficha hicieron una RPC por cambio de destino; Contacto no necesitó
otra. No se presenta la fluctuación de estas medianas como ganancia general.
Otros 24 primeros recorridos de carrito/checkout conservaron los preloads por
intención y se detuvieron antes de enviar pedidos. Sus dos muestras por caso
son una comprobación funcional/exploratoria, no una estimación estable de P95.
El archivo `cold-cart-intent.json` diferencia clic inmediato y 500 ms de lectura
previa, excluidos del tiempo medido. No se tocaron esos preloads anteriores.

Se verificaron 72 vistas administrativas —Productos, Pedidos, Clientes,
Resumen, Cupones, Ofertas, Envíos, Home y Configuración— en 390 y 1366 px, con
sesión y TOTP/AAL2 reales. Segunda ronda, mediana global por ancho: móvil
509,6 → 509,5 ms y laptop 234,0 → 237,6 ms. No son comparables a la medición
pública CPU ×4/4G; esta comprobación administrativa no emuló esa red.
La identidad de prueba fue retirada; AAL1 fue rechazado y la revocación de la
membresía también fue rechazada por el backend con AAL2 vigente.

El primer intento de ese instrumento tuvo una tilde alterada por PowerShell
en un selector, antes de recorrer los destinos. Se conservó el fallo, se
retiró aquella identidad y se repitió con un selector estable y otra identidad
marcada. No se cambió la interfaz para resolver el problema del instrumento.

### Pruebas aprobadas

| Comprobación de esta intervención | Resultado |
| --- | --- |
| TypeScript, lint, build de staging, sello y dry run Wrangler | APROBADO |
| Node | 215 aprobadas |
| Catálogo y administración remota aislados, SDK real | 92 aprobadas |
| SEO/HTMLRewriter/Workers, paralelismo y cancelación | 67 aprobadas |
| UI, filtros, ofertas locales, galería, teclado, imágenes y política móvil | 107 aprobadas |
| Auth, permisos, MFA, sesiones y carreras aisladas | 85 aprobadas |
| Checkout aislado | 24 aprobadas |
| Contratos multimedia/Worker, R2 y permisos aislados | 160 aprobadas |
| Total ejecutado de Node/Playwright en esta intervención | 750; cero fallos finales, cero flaky |
| Lectura SQL y migraciones de desarrollo | 44 aplicadas, cero pendientes, hashes coincidentes |
| Esquema e inventario comercial antes/después | Hashes idénticos; sin pedidos creados |
| Chrome público, comparación principal | 180 visitas, cero excepciones JavaScript/transferencias críticas fallidas, CLS 0 |
| Consola comprobada explícitamente en seis páginas y dos anchuras | 12 visitas, cero errores y cero advertencias |
| Responsive real en Chrome | 360, 390, 430, 768, 1024, 1440 y 1920 px, sin desbordamiento |
| Vídeo móvil, incluido desplazamiento hasta el editorial | Cero elementos/solicitudes bajo 1024 px |
| Comparativas de Home/Tienda/ficha | Seis pares, 1440 y 390 px; cajas reservadas equivalentes |
| Galería desplegada, cuatro fotos y vuelta a la primera | APROBADO por controles reales |

Las 535 ejecuciones Playwright de esta tabla usan servicios locales o
transporte aislado; **no equivalen a 535 operaciones contra Supabase/R2
alojados**. Se distinguen de los recorridos reales descritos arriba. No se
ejecutó toda la matriz histórica de más de 1300 pruebas. No hubo compras,
cobros, cargas de archivos comerciales ni operaciones masivas reales.

### Despliegue comprobado

| Elemento | Identificación final |
| --- | --- |
| Worker de staging | `aroma-infini-frontend-staging` |
| Versión activa, 100% | `da5735f3-23b6-45d6-af27-09459bd3c7fa` |
| Despliegue final | `c97b9ff9-6fd6-4762-8082-a07daab500c7` |
| SHA-256 del manifiesto del paquete | `d76a007da8fdb38b2c63807f6c6044369f461729ef920163e13ee9fee5a5b5cf` |
| Worker servido, módulo `seo-router.js`, SHA-256 | `005b9942aac5754e7cf1b3b8f1515fc836e95538d11fd4ef5b0d973f44d32cfc` |
| Archivos JS/CSS descargados y comparados con el paquete | 120, todos coincidentes |
| CSS conservados con hashes idénticos | 21 |
| Supabase de desarrollo | `tkxvexfapszilzhogvgu`; 44 migraciones verificadas |
| R2 | `aroma-infini-media-dev`, privado; URL pública de desarrollo devuelve 401 |
| Producción, sin modificación | `ec8554f6-d47a-4af0-ba60-4623c8125020` |
| Despliegue de producción, idéntico al inicial | `9baa7c50-262a-4f23-bf52-5742a52ffa0b` |

Se comprobaron bindings, entorno, base, bucket, robots y hashes realmente
servidos; no solo la salida de build. La base al 0% se conservó únicamente
durante la comparación explícita y después se retiró del reparto de tráfico.
Su versión histórica no fue borrada. Staging sigue sin indexación.

Git conserva `develop` y HEAD
`7d2f3648e3b149023910a385bf9510f0ebf60d10`. Se revisaron las 249 entradas de
trabajo iniciales: no se retiró ningún archivo previo y las modificaciones de
hash pertenecen a las fuentes/pruebas de esta intervención. Los tipos generados
siguen con SHA-256
`17ab35e9a281db9e65bc4e86911274528133ae02d0e167905456e933147d9a2f`.
No se regeneraron migraciones históricas ni se conectó la base productiva.

### Límites que permanecen

| Estado | Punto |
| --- | --- |
| APROBADO | Correcciones implementadas, pruebas, despliegue y preservación del diseño y reglas |
| PENDIENTE, objetivo no alcanzado | LCP <2,5 s en las tres primeras visitas de móvil lento |
| PENDIENTE, sin atribución interna | Picos upstream históricos; falta separar spans de PostgREST/pool/gateway por request |
| PENDIENTE, externo al código demostrado | Respuestas DNS que provocan un segundo intento alrededor de un segundo |
| PENDIENTE, no declarado corregido | Variabilidad de descarga/renderizado y pequeñas diferencias residuales entre cohortes; no hay ganancia general de frontend demostrada |
| NO CERTIFICADO | Capacidad del Nano bajo carga de producción; no hubo ensayo agresivo ni compute de pago |
| NO DISPONIBLE | INP de campo y pruebas en teléfonos físicos |

La conclusión es una mejora concreta del camino de ficha y de la actualización
del catálogo, con navegación funcional estable. Los datos no permiten afirmar
que la web entera haya acelerado ni que el problema upstream haya desaparecido.
No quedan modificaciones de esta intervención sin desplegar en staging.

Evidencias locales: `artifacts/priority-performance-2026-11-17/result.json`,
`verification.json`, `worker-content.json`, `schema-before.json`,
`schema-after.json`, `test-summary.json`, `spa-navigation.json`,
`admin-navigation.json`, `public-browser.json` y `staging-visual.json`.

Capturas finales:
[Home móvil](../artifacts/priority-performance-2026-11-17/screenshots/home-390.png),
[Home escritorio](../artifacts/priority-performance-2026-11-17/screenshots/home-1440.png).
Las doce capturas comparativas de Home, Tienda y ficha se enumeran en
`staging-visual.json`, dentro de `visual-screens/`.
