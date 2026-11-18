# Arranque del frontend y arquitectura de entrega R2

13 de noviembre de 2026, Lima. Investigación posterior a
[la optimización de arranque anterior](FRONTEND_STARTUP_OPTIMIZATION_2026_11_12.md).

## Decisión y entrega

Se conservó una optimización concreta del empaquetado, después de comparar
alternativas sobre servicios reales. El arranque tenía demasiados fragmentos
pequeños compartidos: se descargaban 59 chunks estáticos antes de resolver
la entrada. Ahora son cuatro, con los mismos módulos iniciales y sin incorporar
código administrativo privado. Los componentes de cada ruta siguen diferidos.

Publicado **solo en staging**:
<https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev>.

| Referencia | Identidad |
| --- | --- |
| Control anterior | `3c5debe7-abc0-40f8-b54c-26e4a991265a` |
| Variante medida | `48943d70-ea28-42f2-9d02-d88a0e005dd5` |
| Despliegue final | `02965b4a-f38b-4234-bc30-97c83f8d64f8` |
| SHA-256 del paquete final | `2ab1984e0ef9dc192a7e5670bb45b16eebeee5ed8ceb7c9cae105d328da2ed83` |
| Supabase / R2 administrados | `aroma-infini-dev` / `aroma-infini-media-dev` |

Los 119 archivos JS/CSS del build final son idénticos, byte por byte, a los
de la variante medida. El CSS también es idéntico al control. No se cambiaron
componentes visuales, animaciones, tipografías, consultas, Auth, precios,
stock, checkout, RLS, permisos, migraciones ni dependencias en esta entrega.
Se conservaron las modificaciones anteriores que ya estaban en el workspace.
No se hizo commit, push ni despliegue de producción.

La entrega R2 sigue siendo privada. **No se adoptó `r2.dev` como CDN**:
la comparación real no mostró una ventaja y ese acceso no preserva el control
actual de publicación del bucket administrado. Falta un dominio propio de
pruebas para comparar una CDN R2 con caché real; esa alternativa no está aprobada
ni se presenta como medida.

## Método y límites de la evidencia

Se efectuaron **84 cargas medidas**, 42 por versión, secuenciales y alternando
el orden AB/BA. Hubo además seis calentamientos y un piloto previo de 12 cargas
para otra variante. Cada muestra abre un contexto Chrome nuevo y limpia la
caché HTTP del navegador. No se purgó la caché de Cloudflare ni se realizaron
pruebas de carga concurrentes contra servicios alojados.

| Perfil | Pantalla / DPR | CPU | Red | Muestras por ruta y versión |
| --- | --- | --- | --- | --- |
| Escritorio | 1440 × 900 / 1 | Normal | Sin limitación adicional | 4 |
| Móvil | 390 × 844 / 2 | 4 veces más lenta | 9 Mbps / 1,5 Mbps, 80 ms | 4 |
| Móvil lento | 390 × 844 / 2 | 4 veces más lenta | 1,6 Mbps / 750 kbps, 150 ms | 6 |

Se usaron Home, Tienda y `/producto/kamrha`, con datos y R2 reales de desarrollo.
El catálogo alojado contenía un producto: estas mediciones no equivalen a una
prueba alojada con miles de productos. Son emulación de dispositivos y redes,
no teléfonos físicos. Las pruebas funcionales con transporte aislado se indican
separadamente; no se confunden con las mediciones alojadas.

LCP, CLS, tareas largas, bytes, solicitudes y métricas de CPU proceden del
navegador. Los marcadores de primer skeleton y composición de ruta observan
inserciones DOM: son aproximaciones del commit de React, no tiempos exactos
de pintura ni de hidratación. La aplicación usa `createRoot`, no `hydrateRoot`.
No hay datos CrUX/INP de usuarios reales en staging; no se declara INP de campo.

## Comparación de carga inicial

Medianas de LCP, en milisegundos. No se combinan las series con auditorías de
otros días ni con el preset distinto utilizado por el análisis nativo de DevTools.

| Perfil | Página | Antes | Después | Diferencia de medianas |
| --- | --- | ---: | ---: | ---: |
| Escritorio | Home | 1330 | 1264 | −66 |
| Escritorio | Tienda | 1500 | 1448 | −52 |
| Escritorio | Ficha | 1608 | 1404 | −204 |
| Móvil | Home | 1768 | 1622 | −146 |
| Móvil | Tienda | 2002 | 1938 | −64 |
| Móvil | Ficha | 2190 | 1936 | −254 |
| Móvil lento | Home | 4074 | 3582 | −492 |
| Móvil lento | Tienda | 4476 | 3836 | −640 |
| Móvil lento | Ficha | 4998 | 4334 | −664 |

En móvil lento la variante fue más rápida en las **18 parejas**. La mediana
de la mejora emparejada fue 584 ms en Home, 734 ms en Tienda y 664 ms en ficha.
La diferencia de medianas y la mediana de diferencias son estadísticas distintas.
Rangos antes/después: Home 3872–4280 / 3408–3688 ms; Tienda 4144–5120 /
3668–3948 ms; ficha 4752–5128 / 4280–4460 ms.

En escritorio, Home y ficha mejoraron solo en dos de cuatro parejas; Tienda,
en tres. Hubo regresiones individuales: no existe evidencia de mejora uniforme
en una red rápida. En móvil normal mejoraron 4/4, 3/4 y 3/4 parejas respectivamente.

| Métrica, móvil lento | Home antes → después | Tienda antes → después | Ficha antes → después |
| --- | --- | --- | --- |
| Primer skeleton DOM | 3651 → 3122 ms | 3238 → 2829 ms | 3639 → 3115 ms |
| Composición de ruta DOM | 3959 → 3468 ms | 3585 → 3145 ms | 3951 → 3418 ms |
| Solicitudes Script durante la ventana | 64 → 9 | 61 → 6 | 62 → 7 |
| Transferencia JS, bytes con cabeceras CDP | 320499 → 260225 | 310037 → 251047 | 317647 → 258309 |
| Tiempo ScriptDuration | 175,7 → 192,4 ms | 144,7 → 165,0 ms | 163,2 → 175,7 ms |
| Tiempo TaskDuration | 748,9 → 678,5 ms | 576,1 → 510,6 ms | 614,5 → 535,2 ms |
| Total observado de tareas >50 ms | 105,5 → 101,5 ms | 109,5 → 103,5 ms | 111,0 → 105,5 ms |
| Heap JS observado | 7,5 → 7,3 MiB | 6,2 → 6,1 MiB | 6,3 → 6,1 MiB |

El beneficio principal es de transferencia, compresión y fragmentación HTTP.
**La ejecución de JavaScript no se abarató universalmente**: ScriptDuration
aumentó entre 12 y 21 ms en ese perfil. En móvil normal Tienda también aumentó
el total de tareas largas, de 110 a 120,5 ms. No se ocultan estos costes.
El heap es una observación puntual, no una prueba exhaustiva de ausencia de fugas.

Las 84 muestras no tuvieron excepciones JS, respuestas HTTP ≥400 ni desbordamiento
horizontal. CLS fue cero. En las cargas móviles no hubo solicitudes de vídeo.
Las lecturas RPC mantuvieron dos solicitudes por carga y las imágenes conservaron
los mismos tamaños/archivos; no se obtuvo la mejora suprimiendo información.

## Alternativas ensayadas y cambio conservado

Se compararon variantes de agrupación automática, coincidencia con el conjunto
inicial real, dependencias recursivas y orden estricto. Cuatro builds compactos
incorporaban componentes o tablas de mensajes administrativos por dependencias
compartidas: se rechazaron antes de publicarlos. Otra variante capturaba
`index.html` dentro del grupo compartido y perdió la entrada del manifiesto:
también se descartó. El piloto de cinco chunks era viable, pero exigía una lista
experimental del conjunto inicial y una configuración más frágil.

La variante final utiliza la etiqueta `$initial` del empaquetador y su orden de
ejecución habitual. Excluye la entrada, HTML y recursos de estilo/imagen de esa
agrupación. Los servicios públicos que necesitaban `UserFacingError` la importan
directamente del módulo de dominio, en ocho sitios; la clase y su identidad son
las mismas. Esto evita retener mensajes y proveedores del administrador por
una reexportación. No se copiaron clases ni se cambiaron manejadores de errores.

El grafo inicial pasó de 823725 a 815971 bytes JS sin comprimir; no faltan ni
sobran módulos iniciales con respecto al control. El ahorro transferido es mayor
por compresión conjunta y menos respuestas. `scripts/startup-chunks.ts` añade
una comprobación de build sobre el grafo estático real: falla si se incorpora
código administrativo/codec al arranque público. No sigue los imports dinámicos
y rechaza una entrada o dependencia ausente para no producir falsos positivos.
Tiene cuatro pruebas nuevas.

No se aplicaron cambios adicionales de proveedores, SSR ni división de CSS:

- Auth ya inicia en paralelo sin bloquear el montaje público; las rutas privadas
  siguen esperando su autorización. Retrasarlo indiscriminadamente retrasaría
  la recuperación de sesión, favoritos y permisos.
- Cuenta, carrito y checkout conservan su ciclo de vida compartido entre rutas.
  Moverlos requiere demostrar una ganancia adicional y evitar pérdidas de estado;
  esta investigación no obtuvo evidencia que justifique ese cambio.
- Las rutas y los codecs/editores administrativos ya son diferidos. No se agruparon
  carpetas completas ni todas las páginas en un único bundle.
- DevTools identificó CSS bloqueante, pero estimó **0 ms de ahorro marginal**
  en FCP/LCP para Home y Tienda en las trazas de control y final. No significa
  que CSS sea gratis: el JS/ruta seguía limitando el montaje. Se preservó la cascada.

## Hero y trazas complementarias

La imagen correcta ya es descubierta por el parser del HTML, antes del montaje
de React. Se conservan el contenido dinámico y las precargas existentes; no se
añadieron nuevas. En el perfil móvil lento el Hero terminó de descargarse antes,
pero también pasó más tiempo esperando su montaje. Esta fase reduce el LCP total,
no elimina toda la espera entre descarga y representación.

DevTools, con su preset nativo Slow 4G y CPU ×4, observó en una traza por versión:

| Subparte | Home control → final | Tienda control → final |
| --- | --- | --- |
| LCP | 5363 → 4937 ms | 4811 → 4361 ms |
| TTFB | 563 → 563 ms | 563 → 563 ms |
| Retraso de descubrimiento | 63 → 76 ms | 60 → 46 ms |
| Duración de carga del recurso LCP | 3452 → 2550 ms | 1862 → 985 ms |
| Retraso posterior hasta pintar | 1285 → 1748 ms | 2326 → 2768 ms |

Son trazas de diagnóstico individuales, con instrumentación y un preset distinto,
no sustituyen las 84 muestras. Muestran por qué sería incorrecto afirmar que se
resolvió por completo el retraso de renderizado. Se conservaron también trazas
Chrome y perfiles CPU crudos de Home, Tienda y ficha, para ambas versiones.
El muestreo CPU sigue concentrando trabajo en evaluación de módulos y React;
no demuestra que un proveedor específico de cuenta/carrito sea ahora el cuello
dominante. Los nombres minificados y una muestra por ruta no permiten atribuir
un recuento exacto de renders ni justificar desmontar esos proveedores.

No hemos llegado a un límite absoluto: el primer contenido todavía depende de
descargar y ejecutar el runtime público. Ahora no hay evidencia suficiente para
justificar una migración de framework o SSR completa. Una representación inicial
del Hero desde servidor podría investigarse después, con datos versionados y
comparaciones propias para no duplicar UI ni romper campañas dinámicas. No se
implementó sin medirla. La ficha con red lenta todavía supera cuatro segundos.

## R2: arquitectura actual y prueba segura

La arquitectura ya es híbrida: `/assets`, imágenes locales, fuentes y el vídeo
editorial local usan Cloudflare Assets sin ejecutar el Worker de aplicación.
Los medios dinámicos pasan por Worker, validación pública de manifiesto en
Supabase y binding privado R2. Cambiar R2 no acelera el runtime ni el Hero local
de este catálogo.

Al habilitar el acceso `r2.dev` del bucket administrado se exponía su contenido
sin pasar por el manifiesto. Se volvió a deshabilitar ese acceso y se comprobó
HTTP 401 en una URL conocida. No se borraron objetos administrados. Cloudflare
documenta que `r2.dev` es limitado para desarrollo y que la caché/acceso de un
dominio propio son funciones diferentes. [Documentación de buckets públicos](https://developers.cloudflare.com/r2/buckets/public-buckets/).

El ensayo utilizó otro bucket temporal en la misma región indicada, con tres
copias de imágenes ya públicas y una copia del vídeo editorial público. El
Worker temporal solo aceptaba GET/HEAD y esas rutas exactas; para imágenes usaba
el manejador real y su consulta de manifiesto. No tenía credenciales privilegiadas
ni endpoints administrativos. El vídeo era un control de transporte, no un nuevo
recurso comercial registrado.

Se verificaron hashes SHA-256 y longitudes de las cuatro copias en los tres
caminos. Hubo 72 lecturas HTTP seriales medidas y 54 cargas Chrome de imagen,
con tres muestras por archivo, arquitectura y perfil. Cada carga tuvo una
primera lectura con caché de navegador vacía y una repetición inmediata caliente.
No se forzó una purga o un arranque frío de la infraestructura del proveedor.

### Resultados reales de imagen

Mediana de descarga completa HTTP, en ms; seis muestras por celda:

| Archivo | Worker actual + manifiesto | Worker aislado + manifiesto | R2 directo `r2.dev` |
| --- | ---: | ---: | ---: |
| 480 px, 27666 bytes | 311,3 | 302,7 | 314,3 |
| 480 px, 52006 bytes | 303,2 | 302,3 | 311,4 |
| 960 px, 63730 bytes | 347,1 | 308,1 | 310,7 |

El Server-Timing del Worker actual separó unos 18–47 ms de manifiesto y
139–202 ms de almacenamiento. Quitar el manifiesto no garantiza quitar el coste
de ubicación/red/almacenamiento. Estas mediciones no son tiempo de CPU facturable.

Imagen decodificada y lista en Chrome, ms; tres muestras por celda:

| Perfil / archivo | Worker actual | Worker aislado | R2 `r2.dev` |
| --- | ---: | ---: | ---: |
| Escritorio / 27,7 kB | 420,8 | 547,0 | 626,4 |
| Escritorio / 52,0 kB | 482,7 | 522,4 | 640,0 |
| Escritorio / 63,7 kB | 454,5 | 507,3 | 735,6 |
| Móvil lento / 27,7 kB | 568,1 | 600,6 | 767,7 |
| Móvil lento / 52,0 kB | 702,6 | 717,0 | 842,4 |
| Móvil lento / 63,7 kB | 731,7 | 746,0 | 927,2 |

La repetición caliente no generó peticiones adicionales en ninguna de las 54
pruebas: la imagen ya decodificada estuvo lista en aproximadamente 0,4 ms en
escritorio y 1,6–1,9 ms en móvil. Esto comprueba reutilización del navegador,
no un HIT de CDN R2. No se registró `CF-Cache-Status: HIT` en el acceso R2 directo.
El origen `r2.dev` distinto añade establecimiento de conexión; ese coste importa
para un cliente nuevo y no está presente de la misma manera en una conexión
Node ya reutilizada. No se atribuye toda la diferencia al código del Worker.

### Vídeo y peticiones parciales

Se comparó la misma copia pública de 6381008 bytes, sin transcodificar. La
primera lectura completa tardó 757 ms vía Assets actual, 908 ms en el control
Worker→R2 y 1294 ms en `r2.dev`; es **una muestra de diagnóstico**, no una
estimación estadística de vídeo en conexiones móviles.

En seis solicitudes `Range: bytes=0-65535` por camino, Assets devolvió HTTP 200
y el archivo completo, mediana 226 ms en la conexión del ensayo. Los otros dos
caminos devolvieron HTTP 206 y 65536 bytes correctos: 282,5 y 319,4 ms. No se
comparan esos tiempos como transferencias equivalentes. El primer intento del
ensayo detectó esta diferencia y se corrigió el instrumento para registrarla,
sin modificar la aplicación para que una prueba pasara.

El soporte Range de los vídeos dinámicos del Worker se mantiene y sus contratos
pasaron. No se migró el vídeo estático ni se cambió el reproductor. Para material
comercial definitivo conviene verificar también el seeking de ese archivo
estático o usar el flujo de vídeo dinámico ya gestionado. En móviles sigue sin
crearse el vídeo ni solicitarse su archivo, incluido el recorrido alojado completo.

## Comparación de las tres arquitecturas

| Alternativa | Seguridad / publicación | Caché y peticiones | Evidencia y decisión |
| --- | --- | --- | --- |
| Navegador → Worker → R2 privado | Conserva manifiesto, rutas permitidas y objetos privados | Una validación y lectura de almacenamiento por solicitud que llega al servidor; navegador inmutable para URLs verificadas | Medida con servicios reales; conservar para medios dinámicos actuales |
| Navegador → dominio R2 propio | Solo segura con objetos explícitamente publicados y separación de borradores/privados | CDN puede reducir lecturas de origen; no ejecuta el validador de aplicación en cada GET | Dominio no disponible: latencia/cache hit reales pendientes; `r2.dev` no sustituye esta prueba |
| Híbrida | Assets para recursos de build; Worker para autorización y medios gestionados; eventualmente CDN para una copia publicada segura | Reduce intermediación solo donde no hacen falta controles por petición | La parte Assets + R2 privado ya existe y se conserva; una segunda copia pública requiere ciclo de publicación/reconciliación probado |

Un dominio público conectado al bucket actual omitiría las validaciones; no
se habilita. Para una futura CDN se requiere un bucket de publicación separado
o una frontera de acceso equivalente demostrada. Debe excluir pendientes,
borradores y archivos privados, y conservar referencias y limpieza sin nuevas
carreras. Tampoco se activó una caché de respuestas del Worker que pudiera
evitar el manifiesto. No se alteraron la tarea de limpieza ni sus plazos.

Las subidas siguen pasando por el Worker: autorización, MFA, admisión limitada,
validación completa de bytes/píxeles, idempotencia y confirmación de manifiestos
son necesarias. Una subida prefirmada necesitaría firma de servidor, objeto de
cuarentena único, caducidad corta y validación/finalización posterior con la misma
seguridad. No basta firmar un Content-Type; una URL es un permiso portador que
puede reutilizarse hasta expirar. La firma S3 no funciona sobre el dominio público
personalizado. No se expusieron ni añadieron credenciales S3, ni se implementó
ese flujo sin demostrar una ventaja. [URLs prefirmadas de R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

### Costes y recomendación para producción

Por cada solicitud dinámica de red actual hay una invocación de Worker y una
validación Supabase, además de la operación R2 correspondiente. Las lecturas
calientes satisfechas en el navegador evitan las tres. Una CDN publicada podría
reducir esas invocaciones/consultas y lecturas de origen en proporción a sus HIT;
añadiría almacenamiento y operaciones de publicación/reconciliación de copias.
Las políticas comerciales y datos privados seguirían fuera de esa caché.

Precios consultados el 13/11/2026: R2 Standard indica USD 0,015/GB-mes,
USD 4,50/millón de operaciones A y USD 0,36/millón de B, sin cargo de egress.
Se aplican cuotas gratuitas, redondeo y el uso compartido de la cuenta: no es
una cotización ni una factura del proyecto. [Precios de R2](https://developers.cloudflare.com/r2/pricing/).
Workers Paid incluye cuotas y cobra excedentes de solicitudes/CPU; su espera
de red no equivale a CPU. Los Assets estáticos tienen tratamiento distinto.
Cambiar arquitectura para ahorrar una fracción de esas operaciones carece de
justificación sin volumen y medición. [Precios de Workers](https://developers.cloudflare.com/workers/platform/pricing/).

**Recomendación actual:** conservar Assets + Worker con R2 privado. No adoptar
`r2.dev`, no abrir el bucket gestionado y no introducir subidas prefirmadas ahora.
Con dominio de pruebas, repetir la comparación contra un bucket exclusivamente
publicado, midiendo MISS/HIT, Range, invalidación y seguridad. No se afirma que
el Worker supere a una CDN propia que todavía no se ha podido medir.

## Validación y cierre

| Comprobación | Resultado | Tipo de evidencia |
| --- | --- | --- |
| TypeScript y build de staging | Aprobados | Compilación real con guard de arranque |
| Lint | Aprobado | ESLint sin avisos |
| Pruebas Node | 190 aprobadas | Contratos aislados, incluidas cuatro del guard nuevo |
| Catálogo / Auth SDK / SEO Worker | 76 / 81 / 47 aprobadas | Transporte y servicios aislados |
| UI y navegación / checkout / configuración comercial | 88 / 24 / 18 aprobadas | Navegador y contratos aislados |
| Home / política móvil / Worker multimedia | 8 / 15 / 140 aprobadas | Suites aisladas |
| Recorrido final alojado | 27 comprobaciones aprobadas | Chrome, escritorio 1440, tablet 768 y móvil 390 |
| Cargas antes/después | 84 medidas, sin errores JS/HTTP | Staging y datos/R2 reales |
| Transporte multimedia | 72 lecturas y 54 cargas Chrome | R2 real, copias públicas verificadas |
| Producción / SQL / datos comerciales | Sin cambios | Scripts restringidos a staging; ninguna escritura comercial |

El recorrido final verificó Home, vídeo realmente reproduciéndose en escritorio,
póster sin elemento/petición de vídeo en tablet y móvil, ordenamiento, filtro de
marca, ficha, favorito anónimo, carrito entre documentos, checkout sin enviar,
alternancia de acceso manteniendo el destino y rechazo del administrador anónimo.
No se crearon cuentas, pedidos ni pagos. Los primeros intentos del instrumento
móvil no abrían el acordeón o coincidían con su sidebar oculto; se corrigió el
instrumento para usar el control visible, sin tocar la interfaz.

Se retiraron los cuatro objetos, el bucket y el Worker temporales del ensayo.
El acceso `r2.dev` del bucket administrado quedó desactivado y sus objetos intactos.
Las URLs temporales de versiones pertenecen solo al Worker staging y no son
recursos independientes de producción. El historial de versiones se conserva.

La evidencia está en `artifacts/frontend-architecture-2026-11-13/` (ignorado por
Git): `main-tagged-browser.json`, `main-tagged-comparison.json`,
`tagged-graph-comparison.json`, `final-code-identity.json`,
`media-http.json`, `media-browser.json`, `media-comparison.json`,
`hosted-smoke.json`, `probe-cleanup.json`, `*-insights.json`, `traces/`,
capturas `screens/` y resultados de cada suite. Los scripts del mismo directorio
documentan los experimentos; no deben ejecutarse como tareas de producción.

Pendientes reales: dominio multimedia para medir CDN propia; INP/CrUX con tráfico
real; validación en teléfonos físicos; comportamiento con el contenido comercial
definitivo y catálogo alojado representativo. Ninguna de esas comprobaciones se
declara aprobada por una simulación o un build.
