# Navegación e imágenes — cierre de staging del 16 de noviembre de 2026

Se implementaron y desplegaron las mejoras verificadas. La validación funcional
aprobó, pero **no se declara resuelta toda la latencia ni cumplido un LCP de
2,5 segundos en móvil lento**. La carga fría de Producto mejora; Home no mejora
uniformemente y algunas recargas calientes conservan variaciones de layout.

Esta intervención parte de [INTEGRAL_STABILIZATION_2026_11_15.md](INTEGRAL_STABILIZATION_2026_11_15.md)
y de sus evidencias. Los resultados entregados corresponden exclusivamente a
V3, `c8de4204-c378-45cb-a7bd-7bd8b805008e`. Los experimentos V1/V2 permanecen
identificados como históricos, sin presentarlos como mediciones de V3.

Las fechas de este documento corresponden a Lima. Algunos registros del cierre
ya muestran 17 de noviembre en UTC. Evidencia local:
`artifacts/navigation-experience-2026-11-16/`, excluida de Git.

## Implementación

**Imágenes.** Se añadió un ciclo común de carga, éxito y error para las imágenes
administradas, categorías, buscador, marcas, carrito, checkout, cuenta y
recomendador. Conserva el elemento `img` original: no introduce contenedores que
alteren las columnas ni hijos inválidos en `picture`. Mantiene dimensiones,
`srcset`, `sizes`, ALT, prioridad y carga diferida existentes.

Los placeholders permanecen detrás de las fotografías; el pintado nativo no
espera una transición ni la actualización de React. Se reconocen imágenes ya
cacheadas, se descartan respuestas de fuentes anteriores y se limpian los
listeners. Un fallo conserva el espacio y ofrece un fallback. Los marcos se
marcan únicamente ante un error; su limpieza respeta otras imágenes fallidas
del mismo marco. El CSS final no utiliza `:has()`.

En las tarjetas, la foto principal ya no desaparece al pasar el cursor o usar
teclado mientras la alternativa sigue pendiente o ha fallado. Hero conserva sus
controles y su composición también cuando falla una portada. La galería que ya
tenía estados de carga y reutilización de rendiciones se conservó.

No se cambiaron fotografías, calidad, fuentes, animaciones, textos comerciales,
precios, inventario ni lógica de compra. No se editaron los CSS preexistentes;
se añadió `media-loading.css` para los estados nuevos. Los mapas conservan su
gestión propia de teselas y reintento; los iconos SVG no requieren una descarga
fotográfica. Se mantiene la selección de imágenes, sin vídeos, por debajo del
breakpoint de escritorio de 1024 px.

**Descubrimiento del código.** El build obtiene del manifiesto real el grafo
estático de Home, Tienda o Producto. El Worker entrega únicamente las
indicaciones de la ruta solicitada y retira las de las otras rutas. No se
precargan módulos dinámicos de administración, reseñas ni SDK privado por este
mecanismo. Se mantienen las indicaciones de Auth exclusivamente en sus rutas.
Se validan nombres de archivos y se respeta el orden del CSS existente.

En móvil lento, la mediana del descubrimiento del módulo desde las cabeceras
pasó aproximadamente de **1977 a 36 ms** en Tienda y de **2173 a 35 ms** en
Producto. Esto elimina una cascada de descubrimiento; **no equivale a descontar
dos segundos del LCP**, porque otras descargas y ejecuciones se solapan.

**Consultas e infraestructura.** No se añadieron cachés, dependencias, índices ni
migraciones. En las 180 visitas iniciales finales no se observaron RPC del
navegador: se aprovechó la proyección pública fresca que ya entrega el
documento. Las navegaciones SPA conservaron una consulta por destino comercial;
no se sustituyeron por instantáneas antiguas. Se mantienen los límites de
frescura, invalidación, validaciones transaccionales, RLS y Auth/MFA.

## Medición definitiva de la versión entregada

Base: `d6ffdc13-dae9-41ac-ac63-31117ec6048b`. Entregada: V3 `c8de4204…`.
Chrome real, comparaciones AB/BA con tratamiento equivalente en ambos brazos,
cinco muestras por ruta/perfil/caché: **180 visitas**. Escritorio 1440 × 900;
móvil 390 × 844 con CPU ×4, perfiles de 9 Mbps/80 ms y 1,6 Mbps/150 ms. Procesos
nuevos por par frío/caliente. Sin builds ni suites pesadas simultáneas.

La caché fría es la del navegador, no un MISS forzado en Cloudflare. Es una
medición de laboratorio en el mismo equipo y conexión, no teléfonos físicos,
usuarios de campo ni una certificación de percentiles de producción.

| Móvil lento, carga fría | LCP base → V3 | Δ LCP pareado | Δ después de cabeceras |
| --- | ---: | ---: | ---: |
| Home | 2916 → 2956 ms | +52 ms | +33,7 ms |
| Tienda | 2672 → 2744 ms | +84 ms | −72,1 ms |
| Producto | 3096 → 2868 ms | −232 ms | −111,7 ms |

Los valores base/final son medianas independientes; los deltas son medianas de
las diferencias de cada par y no tienen por qué coincidir con su resta.
Después de cabeceras incluye cuerpo del documento, red y ejecución; no es una
medida aislada del CPU de React. En Tienda, el TTFB pareado aumenta 137,7 ms:
mejora la fase posterior en cinco de cinco pares, pero no su LCP total. Producto
mejora en los cinco pares y su foto queda lista unos 240 ms antes, por delta
pareado. Home añade aproximadamente 6,4 ms de JS y 5,4 ms de estilos en este
perfil; no se presenta como una mejora de carga fría.

En escritorio frío, las medianas de LCP fueron Home 1072 → 944 ms, Tienda
812 → 760 ms y Producto 1244 → 1040 ms. En móvil de 9 Mbps fueron 1288 → 1376,
1336 → 1108 y 1312 → 1276 ms, respectivamente. Las 18 celdas, incluyendo las
calientes y todas las regresiones, están en
[public-analysis-release.md](../artifacts/navigation-experience-2026-11-16/public-analysis-release.md).

Se observaron cero errores JS, HTTP/descarga, imágenes fallidas, desbordamientos
o vídeos móviles en la ronda final. El CLS inicial máximo observado fue
**0,000566 en ambos brazos**. Las solicitudes secundarias pendientes al cerrar
la ventana están registradas —106 en conjunto— y no se contabilizan como
descargas terminadas. No hay INP de campo disponible. Las tareas largas se
registran como métrica de laboratorio, sin llamarlas INP o Lighthouse TBT.

### Navegación dentro de la tienda

Se completaron **30 recorridos medidos y 30 calentamientos excluidos**, con cinco
muestras por perfil/versión. Cada recorrido ejercitó Home, Tienda, marca,
ordenamiento, eliminación de filtro, Producto, variante, carrito, Contacto y
checkout. Fueron 300 pasos medidos, sin recargas completas ni errores.

| Móvil lento, navegación caliente | Base → V3 |
| --- | ---: |
| Home, foto lista | 255 → 251 ms |
| Tienda, foto lista | 274 → 269 ms |
| Producto, foto lista | 247 → 238 ms |
| Contacto, contenido visible | 38 → 37 ms |
| Carrito, contenido visible | 34 → 41 ms |
| Checkout, interfaz inicial | 30 → 29 ms |
| Checkout, fin HTTP de la cotización | 383 → 381 ms |

La interfaz inicial del checkout no es una compra lista ni una cotización
completada. Se midió por separado la respuesta HTTP: las 30 cotizaciones
terminaron en la ventana de observación. No se rellenó entrega ni se envió un
pedido, reserva, pago o confirmación. No hay una mejora general grande de SPA:
la navegación comercial ya era rápida y varias diferencias son pequeñas.
Filtros y carrito conservan sus pequeñas variaciones, documentadas en
[spa-summary.json](../artifacts/navigation-experience-2026-11-16/spa-summary.json).

## Imágenes y R2

En la ronda entregada se registraron 400 respuestas lógicas de WebP dinámico:
192 reproducciones de caché de navegador y **208 manifiestos nuevos únicos**,
104 por brazo. No se cuentan las cabeceras reproducidas como lecturas nuevas.
Todos los bytes de esas solicitudes nuevas fueron HIT de la caché segura.

Las medianas base/V3 fueron: comprobación del manifiesto 24/23 ms, preparación
de bytes HIT 8/8 ms y cabeceras HTTP 175,2/175,5 ms. El cuerpo WebP tardó
163,7/147,2 ms, mezclando los tres perfiles. Estos son tramos distintos; el
tiempo del manifiesto no es tiempo SQL y un HIT no elimina su validación fresca.
No se provocaron purgas para fingir una prueba fría de R2. Esta muestra no
certifica el rendimiento de MISS. Se conserva R2 privado, referencias,
manifiestos, retirada y limpieza existentes.

## Capturas y funcionalidad

La versión final aprobó 40 comprobaciones cargadas: Home, Tienda, Producto,
Contacto y checkout en 1920 × 1080, 1440 × 900, 1366 × 768, 360 × 900,
390 × 844, 414 × 900, 430 × 900 y 768 × 1024. Se recorrieron las cuatro fotos
reales de la galería y se restauró la primera en las ocho resoluciones.

Además aprobaron seis pares de capturas base/V3 y 12 escenarios de descarga
retenida o HTTP 404 simulado, con recuperación por carga real. Esas
intercepciones prueban la interfaz, no son fallos reales de R2 ni mediciones de
rendimiento. Los tamaños reservados se conservaron. Durante la revisión
completa con scroll y galería, el CLS observado máximo fue 0,05845; no se
confunde con el CLS inicial de las 180 visitas ni se afirma cero cambios de
layout durante todos los recorridos.

Capturas finales, con los nombres de ruta, estado y resolución:

- [Tienda, móvil](../artifacts/navigation-experience-2026-11-16/visual-screens/2026-11-16T23-54-46-534Z/loaded-store-candidate-390.png).
- [Producto, escritorio](../artifacts/navigation-experience-2026-11-16/visual-screens/2026-11-16T23-54-46-534Z/loaded-product-candidate-1440.png).
- [Checkout, móvil](../artifacts/navigation-experience-2026-11-16/visual-screens/2026-11-16T23-54-46-534Z/loaded-checkout-candidate-390.png).
- [Fallback de imagen simulado](../artifacts/navigation-experience-2026-11-16/visual-screens/2026-11-16T23-54-46-534Z/simulated-error-store-390-fallback.png).

El registro completo y los pares comparativos están en `staging-visual.json`.

La primera regresión dirigida detectó tres fallos relacionados con la altura
del Hero: una clase de contenedor de carga alteraba su posicionamiento. Se
corrigió antes de entregar y la repetición aprobó los 108 casos dirigidos.
También se corrigieron supuestos de los scripts de QA —abrir el carrito tras
añadir un producto y no esperar imágenes lazy horizontales fuera de pantalla—,
sin cambiar esos comportamientos de la web. Los intentos fallidos se conservaron.

## Pruebas, seguridad y despliegue

| Comprobación | Resultado |
| --- | --- |
| TypeScript, lint, build y comprobación del paquete staging | APROBADO |
| Contratos Node | 200 aprobados |
| Regresión pública afectada | 326 aprobados, sin omisiones o flakiness |
| Catálogo completo, ejecución aislada sin build/edición simultánea | 91 aprobados |
| Auth/MFA y recuperación, SDK con transporte aislado | 85 aprobados |
| Checkout remoto, transporte aislado | 24 aprobados |
| Home remoto, transporte aislado | 8 aprobados |
| SEO/HTMLRewriter y contextos públicos en workerd aislado | 62 aprobados |
| Permisos anónimos reales | Tres lecturas administrativas y una carga sin archivo rechazadas con 401 |
| Esquema de desarrollo | 42 migraciones, cero pendientes, once comprobaciones de seguridad correctas |
| R2 | Acceso público desactivado, sin dominios públicos; objeto conocido devuelve 401 directo |
| Producción | Versión, despliegue y huella de metadatos idénticos al inicio |

Hay 596 ejecuciones en las seis suites seleccionadas, **591 casos únicos** al
deduplicar cinco compartidos, más los 200 Node. No se suman reintentos ni se
presentan las 994 comprobaciones SQL históricas como ejecutadas otra vez.

Staging activo al 100 %:
`https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev`.
Versión `c8de4204-c378-45cb-a7bd-7bd8b805008e`, despliegue
`8a33fd02-60da-45e2-91ed-4efd4d48316b`. Se retiró la selección comparativa del
despliegue activo; las versiones históricas no se eliminaron.

SHA-256 del manifiesto del paquete:
`65d29ff455c24d70e379fa61c8a313645c082ee8bff0fde982584ca04877e7ae`.
Los 128 JS/CSS servidos coinciden con sus bytes y hashes locales. El módulo
Worker descargado y correlacionado con la versión activa tiene SHA-256
`037082314e8d383582d2684752e851e70b9283de7b0ddfedfb89a763a8a35b8d`;
no se afirma una comparación con un bundle local histórico que no se conservó.
Bindings comprobados: proyecto `tkxvexfapszilzhogvgu`, entorno staging y bucket
`aroma-infini-media-dev`. La huella de esquema sigue siendo
`b53b7afbad51b4418bc71869b819a6da778d8f3b963eb38b4e6250eb3e0d503f`.
Hashes individuales y procedencia en `verified-final.json`.

Producción conserva `ec8554f6-d47a-4af0-ba60-4623c8125020` y el despliegue
`9baa7c50-262a-4f23-bf52-5742a52ffa0b`. No hubo despliegues, migraciones ni
consultas SQL a producción, ni commit, push, reset, borrados o dependencias nuevas.

Las 1289 rutas iniciales se conservaron. La intervención ajustó 20 archivos
existentes y añadió seis de implementación/pruebas, además de este informe.
Todas las tablas `app` mantienen sus huellas iniciales. Durante la ventana larga
cambiaron dos tablas privadas de dispositivos de confianza; se registró ese
cambio concurrente sin borrarlo ni atribuirlo sin auditoría. Las pruebas públicas
no realizaron operaciones autenticadas de gestión de dispositivos. No se
afirma que toda la base haya permanecido inmóvil.

## Límites que permanecen abiertos

1. **LCP móvil lento frío: PARCIAL.** Sigue entre aproximadamente 2,7 y 3 s en
   estas medianas. Home frío no mejoró. También permanece una variación de
   layout/scheduling en recarga caliente de Tienda: delta pareado LCP +48 ms.
   No se oculta como red: su TTFB apenas cambia y se observan +42,8 ms de layout.
   No hay traza caliente que aísle su función responsable. No se aplicó otro
   refactor ni caché por intuición para atribuir o esconder esa variación.
2. **Picos de red: NO DEMOSTRADOS COMO RESUELTOS.** En V2 aparecieron esperas
   de cabeceras estáticas de 12–18 s en ambos brazos, con distintas ubicaciones
   CF-Ray. NetLog enlaza petición, stream QUIC y ACK rápido; no explica por sí
   solo la espera de respuesta ni permite descartar pérdida entrante. No fue
   espera DNS/TLS de esos archivos concretos ni hay evidencia para culpar a SQL
   o al plan Free de Supabase. El usuario confirmó que no cambió su conexión.
   Un control posterior de 72 visitas sobre la misma V2, con/sin cabecera de
   selección y hashes iguales, no reprodujo el contexto: ambos brazos fueron
   GRU y no hubo una penalidad uniforme de la cabecera. No se extrapola ese
   resultado aislado a una resolución permanente. Se preparó, sin enviarlo,
   [un paquete para soporte](../artifacts/navigation-experience-2026-11-16/network-support-packet.md).
3. **Atribución del CSS: LIMITADA.** Se probaron tres candidatas y un control
   CSS de 60 visitas. El control V1/V2 no estableció causalidad sobre el gran
   intervalo de layout anterior. V3 elimina los selectores relacionales del
   nuevo estado, pero no se presenta esa limpieza como explicación demostrada
   de todas las variaciones. Los resultados de cada versión se conservaron.
4. **Campo y volumen real: NO CERTIFICADOS.** No hay INP/RUM de campo, teléfonos
   físicos o prueba de pago/reserva real. El catálogo publicado de staging es
   pequeño; no se introdujeron miles de productos comerciales para medirlo.
   Las pruebas de escala SQL anteriores se conservan sin reutilizarlas como
   mediciones nuevas de navegador. No se cambió DNS, protocolos, placement ni
   planes de pago para obtener resultados artificiales.

El [resultado consolidado](../artifacts/navigation-experience-2026-11-16/result.json)
enlaza las comprobaciones finales. Las mejoras están entregadas y probadas; estos
límites se mantienen visibles y no se declara una web completamente libre de
latencia.
