# Navegación pública: descubrimiento, estilos y arranque

12 de noviembre de 2026 (Lima). Continuación de
[la auditoría del recorrido HTTP](PUBLIC_REQUEST_PATH_AUDIT_2026_11_12.md).
Los resultados siguientes corresponden a esta entrega, sin atribuirle las
mejoras SQL ni de navegación ya presentes en la versión anterior.

## Entrega y alcance

Implementado y publicado **solo en staging**:
<https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev>.

| Referencia | Versión del Worker |
| --- | --- |
| Antes | `15928de0-f4e3-44e2-ab83-8cb1bab4aac3` |
| Después, vigente | `b92559d3-0c07-40fc-b5ec-1c2c15ad1425` |

El paquete desplegado quedó identificado por SHA-256
`de97b0c5ffd9b9b2f817dee74fdeeb8924c3357506e09702d0cc9d0af7865493`.
Proyecto utilizado: `aroma-infini-dev`, referencia `tkxvexfapszilzhogvgu`.
No se modificaron producción, migraciones, índices, dependencias, archivos
comerciales, precios, inventario, autenticación, permisos ni RLS.

La mejora más importante es eliminar la espera de React para descubrir el
Hero correcto. Hay una reducción medible del LCP móvil de Home y del código
y CSS transferidos. **No existe una mejora uniforme de todos los tiempos**:
la ficha permanece prácticamente igual, Tienda en escritorio tuvo resultados
peores en esta serie y el arranque de React sigue siendo relevante con CPU y
red limitadas. No se declara resuelto todo el rendimiento del sitio.

## Medición sobre servicios reales

Se efectuaron 27 cargas antes y 27 después, secuenciales, en Chrome contra
staging y sus servicios reales. Se midieron Home, Tienda y
`/producto/kamrha`, tres veces por ruta y perfil. Cada carga abrió un contexto
nuevo y limpió la caché HTTP del navegador; no se purgaron las cachés del
proveedor ni se generó carga agresiva.

| Perfil | Pantalla / DPR | CPU | Red emulada |
| --- | --- | --- | --- |
| Escritorio | 1440 × 900 / 1 | Sin limitación | Sin limitación adicional |
| Móvil | 390 × 844 / 2 | 4 veces más lenta | 9 Mbps bajada, 1,5 Mbps subida, 80 ms |
| Móvil lento | 390 × 844 / 2 | 4 veces más lenta | 1,6 Mbps bajada, 750 kbps subida, 150 ms |

Los valores son medianas de tres muestras. Se observaron LCP, CLS, tareas
largas, memoria, solicitudes, iniciadores y tiempos de recursos. La ventana
incluye cinco segundos después de encontrar el contenido; en Home también
se esperó la carga y decodificación de su imagen principal. No son métricas
de campo, percentiles de usuarios reales ni pruebas con teléfonos físicos.
El catálogo público disponible tenía **un producto**; esta fase no acredita
capacidad con miles de productos alojados.

### LCP observado, milisegundos

| Página | Escritorio antes → después | Móvil antes → después | Móvil lento antes → después |
| --- | ---: | ---: | ---: |
| Home | 1288 → 1040 | 1700 → 1500 | 4948 → 3924 |
| Tienda | 1368 → 1596 | 1812 → 1768 | 4128 → 3936 |
| Ficha | 1196 → 1196 | 1380 → 1360 | 3788 → 3836 |

Home mejoró aproximadamente un 21 % en el perfil móvil lento de esta serie.
La diferencia de la ficha es pequeña y no demuestra una mejora. La
variación de escritorio impide afirmar que toda navegación sea más rápida.
El LCP de la ficha móvil fue el logotipo, no siempre su fotografía; por eso
no debe interpretarse como tiempo de carga completa de la galería.

Como comprobación independiente, se capturaron trazas largas con Chrome
DevTools, su preset **Slow 4G**, CPU ×4 y la misma pantalla móvil. Es un perfil
distinto del anterior y una sola muestra por página y versión:

| Página | LCP antes → después | Espera para iniciar el recurso LCP, después del TTFB |
| --- | ---: | ---: |
| Home | 5566 → 5406 ms | 4307 → 77 ms |
| Tienda | 5034 → 4825 ms | 62 → 53 ms |

Estas trazas confirman el descubrimiento temprano, pero muestran una mejora
global más modesta: transferencia y renderizado pasan a dominar. En Home,
la descarga del recurso pasó de 590 a 3489 ms al competir desde el inicio
con CSS, fuentes y JavaScript; la espera posterior para pintarlo fue
8 → 1277 ms. Se eliminó una cascada, no esos costes restantes.

## Hero dinámico antes de React

Antes, la primera fotografía se solicitaba después de iniciar JavaScript,
resolver Home y montar el componente. Ahora el Worker incorpora al HTML:

- El documento editorial público recién leído, validado y limitado en tamaño.
- Dos instrucciones de precarga de imagen con condiciones de pantalla
  mutuamente excluyentes, `imagesrcset`, `imagesizes` y prioridad alta.
- Referencias al módulo y a los estilos del Home de esa compilación.

La selección utiliza el mismo orden, estado publicado y reglas de imagen
que `Hero.tsx`. Se extrajeron esas reglas y el parser a módulos puros
compartidos: no hay una campaña, un hash ni una fotografía activa escritos
en el Worker. Las imágenes personalizadas utilizan solo variantes del
manifiesto validado. Los recursos incluidos en el proyecto se resuelven
contra el inventario permitido y sus alias verificados.

En campañas de vídeo se anticipa **el póster adecuado**, no el MP4 ni todas
las campañas. Continúan vigentes la reproducción, selección móvil,
visibilidad, movimiento reducido y preferencias de ahorro de datos.
También se cubrieron reordenamiento, campañas ocultas, Home sin campañas,
contenido inválido, alias y fallo del servicio. Si la lectura no termina
en el límite de un segundo o no es válida, se conserva la carga ordinaria.
No se serializan campañas futuras de una proyección administrativa.

La aplicación consume una sola vez el JSON del documento inicial y mantiene
la barrera de versión del catálogo. Se rechazan documentos de otro proyecto,
fuera de Home, demasiado antiguos, demasiado grandes o posteriores a una
invalidación. Continúan funcionando la recarga habitual y sus errores.
El Home no tiene una nueva caché compartida entre peticiones HTML.

En móvil lento, la solicitud de la misma fotografía
`hero-v2-lumiere-mobile-780.webp` pasó de **3399 a 317 ms** desde navegación.
El iniciador pasó de JavaScript a **parser HTML**. La espera de descubrimiento
después del TTFB pasó de 3237 a 150 ms. La descarga se solapa ahora con otros
recursos: su duración aislada subió de 1528 a 2770 ms y la espera de pintado
de 19 a 790 ms; el LCP total aun así bajó.

Las RPC observadas en el navegador de Home pasan de tres a dos porque
`home_document` se reutiliza desde el HTML. **La lectura de Supabase sigue
existiendo en el Worker**: no se presenta como una consulta eliminada del
sistema. Tampoco se trasladaron al HTML precios o stock del catálogo.
La fase adicional de contexto público tuvo lecturas calientes de 37–67 ms
y una primera lectura de aproximadamente 495 ms. Ese coste de servidor es
parte del compromiso medido, no una operación gratuita.

La selección responsive sigue la estrategia de precarga documentada en
[web.dev](https://web.dev/articles/preload-responsive-images), aplicada a
fuentes dinámicas verificadas.

## CSS, fuentes y JavaScript

Se conservan exactamente los archivos de fuentes, pesos, tamaños y estilos.
Se anticipó el Lato 700 ya utilizado en títulos y acciones visibles. Antes
su descubrimiento dependía de CSS y renderizado; ahora parte del HTML.
No se añadió otra familia ni se descargó un peso nuevo en las rutas medidas.

| Móvil lento | Inicio de Lato 700 antes → después | Descarga terminada antes → después |
| --- | ---: | ---: |
| Home | 3446 → 300 ms | 4570 → 2391 ms |
| Tienda | 3483 → 399 ms | 3822 → 2194 ms |
| Ficha | 3720 → 402 ms | 4090 → 2331 ms |

Se retiraron del CSS público los estilos específicos de edición de Home,
vista previa administrativa y configuración de envíos. Se cargan al entrar
al espacio administrativo, antes de sus páginas para mantener la cascada.
Se conserva la base administrativa en su posición original: moverla cambiaba
prioridades tipográficas de componentes compartidos. También se conservan
los estilos institucionales que sí utiliza la tienda.

Home y los loaders administrativos pesados se separaron del arranque común.
El Home se importa de forma diferida, pero su grafo estático se anticipa
**solo al visitar `/`**. Se obtiene del manifiesto de Vite en cada build,
sin hashes manuales, módulos administrativos ni ejecución de loaders. Las
rutas Tienda, ficha y acceso administrativo no reciben esas instrucciones.
El Worker también las retira si falla la consulta opcional de metadatos.
Esta técnica utiliza el
[manifiesto de Vite](https://vite.dev/guide/backend-integration.html).

Una primera versión diferida introdujo otra cascada para descubrir el módulo
de Home; se corrigió con estas instrucciones antes de la medición final.
Al separar loaders también se detectó una segunda lectura administrativa de
Promociones: se conservó su coordinación síncrona existente y la prueba volvió
a exigir una sola RPC. No se relajaron los controles de permisos ni las pruebas.

Transferencias reales observadas en móvil lento, bytes de red redondeados a kB
decimales, dentro de la misma ventana:

| Página | JavaScript antes → después | CSS antes → después | Solicitudes antes → después |
| --- | ---: | ---: | ---: |
| Home | 337,5 → 327,6 kB | 62,6 → 55,3 kB | 83 → 82 |
| Tienda | 342,8 → 319,2 kB | 62,6 → 52,9 kB | 73 → 70 |
| Ficha | 350,2 → 326,8 kB | 62,6 → 52,9 kB | 74 → 71 |

No se observa una reducción importante de tareas largas: en móvil lento
Home registró 120 → 122 ms acumulados; Tienda 126 → 126 ms; ficha 127 → 126 ms.
El heap de Home fue 6,9 → 7,6 MiB; Tienda y ficha 6,5 → 6,4 MiB. No se declara
una mejora de CPU o memoria por el hecho de haber reducido el bundle.

## R2, imágenes y vídeos

Se descargaron cuerpos completos de tres URLs R2 reales, primero sin caché
HTTP del navegador y después desde caché, tanto en escritorio como en móvil
lento. Cada fase tiene doce lecturas. Los tamaños y SHA-256 coinciden antes
y después. No se recomprimieron fotografías ni se cambiaron encuadres,
variantes, formatos o animaciones comerciales.

| Mediana de tres archivos | Antes | Después |
| --- | ---: | ---: |
| Escritorio, navegador frío | 364 ms | 448 ms |
| Escritorio, navegador caliente | 1,2 ms | 1,3 ms |
| Móvil lento, navegador frío | 652 ms | 683 ms |
| Móvil lento, navegador caliente | 3,4 ms | 3,2 ms |

La caché caliente fue confirmada por Chrome (`fromDiskCache`). No se purgaron
R2, SQL ni cachés de Cloudflare: «frío» aquí significa **navegador frío**.
Los encabezados `Server-Timing` de una respuesta cacheada no representan
otra consulta al backend. Estos resultados no demuestran una mejora en
R2 ni justifican añadir otro intermediario de caché.

Se mantienen bucket privado, manifiesto `ready`, rutas permitidas, WebP
responsive y caché inmutable para URLs con hash. Los vídeos mantienen sus
resoluciones y contrato GET/HEAD/Range. No se añade precarga del vídeo de
campaña. El muestreo alojado encontró cinco imágenes gestionadas y comprobó
sus quince variantes; no había vídeos gestionados publicados para medirlos
de extremo a extremo. Los escenarios de vídeo sí se probaron de forma aislada.

## Fluidez, aspecto y regresiones

Se repitió Tienda → ficha desde la interfaz, tres veces por dispositivo y
versión, con trazas de Chrome guardadas. El tiempo hasta localizar el título
fue 209 → 310 ms en escritorio y 366 → 368 ms en móvil lento. Es una señal
de contenido presente, no una medición exacta de pintado. El máximo evento
de interacción observado fue 24 ms en móvil en ambas versiones; **no equivale
al INP de usuarios reales**. Esta fase no demuestra acelerar esa transición.

Las 54 cargas no registraron errores JavaScript ni desbordamiento horizontal.
Las medianas CLS finales fueron cero, salvo un valor inferior a 0,00001 en
Home de escritorio, dentro de la ventana observada. No se retiraron efectos
ni se cambiaron las duraciones de las animaciones para obtener esos valores.

Se inspeccionaron capturas reales antes y después. Adicionalmente, se comparó
la hoja compilada anterior con los estilos actuales sobre el mismo DOM,
esperando las fuentes: Home, Tienda, editar producto, crear producto y
Promociones, a 1440 × 900, 768 × 1024 y 390 × 844. En las quince combinaciones,
27 propiedades calculadas y dimensiones coincidieron sin diferencias.
Esta comparación usa datos y navegación aislados; las capturas de staging
complementan esa prueba, no se confunden con ella.

| Validación final | Resultado | Naturaleza |
| --- | --- | --- |
| TypeScript, lint, build staging y build producción aislado | Aprobados | Local; sin despliegue de producción |
| Catálogo con SDK | 75 aprobadas | Transporte aislado |
| Home y edición multimedia | 8 aprobadas | Navegador aislado |
| Rutas, formularios, Hero, estados y administración | 105 aprobadas | Navegador aislado |
| SEO, HTML inicial y selección de recursos | 45 aprobadas | Worker/runtime aislado |
| Medios, autorización, manifiestos y Range | 140 aprobadas | Worker/contratos aislados |
| Checkout | 24 aprobadas | Navegador/servicios aislados; sin compras reales |
| Favoritos y su integración con carrito | 15 aprobadas | Navegador/servicios aislados |
| Contratos Node y arquitectura | 185 aprobadas | Local |
| Equivalencia de estilos | 5 pruebas / 15 combinaciones aprobadas | Navegador aislado |
| Comprobación pública de staging | 25 comprobaciones aprobadas | Servicios alojados; solo lectura |
| API pública, rutas privadas y CORS | 55 comprobaciones aprobadas | Servicios alojados; sin identidades nuevas |

Los resultados finales de estas suites no presentan casos inesperados ni
flaky. No equivalen a ejecutar nuevamente todas las suites del repositorio,
a una prueba de carga o a una compra real.

## Evidencias y límites restantes

Directorio de trabajo ignorado por Git:
`artifacts/render-path-2026-11-12/`.

- `comparison.json`, `steps.json`: medianas y tiempos de descubrimiento.
- `before-browser.json`, `after-browser.json`: 54 cargas y sus solicitudes.
- `devtools-insights.json`: trazas largas Slow 4G y desglose de LCP.
- `before-journey.json`, `after-journey.json`, `traces/`: interacciones y CPU.
- `before-media-cache.json`, `after-media-cache.json`: cuerpos, hashes y caché.
- `screens/before-*.png`, `screens/after-*.png`: capturas de las tres páginas.
- `style-*.json`: equivalencia de estilos; `*-tests.json`: suites finales.
- `hosted-checks.json`, `hosted-security.log`, `optimized-deploy.json`: servicios,
  límites, seguridad pública y versión publicada.

Se conserva una medición intermedia como `intermediate-after-browser.json`;
no se utiliza como resultado final. El build aislado de producción utiliza
configuración de prueba y no es un artefacto para desplegar: un despliegue
posterior debe reconstruir para el entorno correcto.

El siguiente cuello de botella medido es el trabajo común de arranque y el
CSS que todavía precede al renderizado: en la traza larga final de Tienda,
la cadena crítica alcanzó 3635 ms y ya no incluía la descarga tardía de Lato
700; el LCP mantuvo 2387 ms de espera de renderizado. Separar más CSS requiere
auditar su cascada compartida; no se aplicaron recortes que cambien el aspecto.

En Home, anticipar el recurso no sustituye renderizarlo: el arranque sigue
necesitando React y puede competir por ancho de banda con la imagen. Por eso
los perfiles lentos todavía superan un LCP de 2,5 segundos. Quedan pendientes
mediciones de campo con dominio público, dispositivos físicos y contenido
comercial definitivo. No se activaron producción ni servicios adicionales.
