# Evidencia de conexión y renderizado — 15 de noviembre de 2026

Investigación de staging complementaria a
[SECOND_PERFORMANCE_ROUND_2026_11_14.md](SECOND_PERFORMANCE_ROUND_2026_11_14.md).
No modifica código público, protocolos de producción, R2 ni permisos.

## Qué significaba la muestra de 15.905 ms

`primaryDecoded = 15.905,6 ms` mide el tiempo desde el inicio de navegación
hasta que el observador confirmó la fotografía lista. **No mide 15,9 segundos
de trabajo del decodificador de WebP.** En esa muestra el DOM de la imagen se
detectó a los 15.808,3 ms: el intervalo observado posterior fue de 97,3 ms,
que tampoco equivale exclusivamente a tiempo de CPU.

El documento tenía TTFB de 8.006 ms. Su registro CDP sitúa `connectStart` en
275,544 ms y `sslStart` en 7.431,983 ms: hay 7.156,439 ms anteriores al tramo
SSL registrado. El SSL registrado dura 222,428 ms. El contexto del Worker
midió aproximadamente 184 ms; estos datos no permiten atribuir los siete
segundos a PostgreSQL ni al procesamiento del Worker.

Faltan NetLog y protocolo de aquella navegación, su secuencia de resolución,
selección de direcciones, intentos de transporte, posibles retransmisiones y
reutilización. No es válido etiquetar ese intervalo simplemente como «TCP»:
las capturas nuevas utilizan principalmente HTTP/3 sobre QUIC. Tampoco se ha
demostrado que el ISP, un proxy, Cloudflare o el sistema operativo causaran
el intervalo antiguo. El artefacto original se conserva en
`artifacts/second-round-2026-11-14/slow-product-sample.json`.

## Cohorte de referencia con conexiones identificadas

Versión comprobada: `700c39a5-be65-446c-bb2a-c975e67a185c`, Worker
`aroma-infini-frontend-staging`, tráfico al 100 %. Se registraron 36
navegaciones reales en Chrome 157: cuatro procesos nuevos para cada uno de
los tres perfiles. Cada proceso midió conexión nueva con caché HTTP vacía,
conexión reutilizada después de vaciar únicamente la caché HTTP y recarga
con caché caliente. Sin interceptar Fetch ni añadir cabeceras de versión.

| Perfil | Foto lista, conexión nueva p50 | Reutilizada, caché vacía p50 | Caché caliente p50 |
| --- | ---: | ---: | ---: |
| Escritorio | 831 ms | 558 ms | 268 ms |
| Móvil, CPU ×4, 9 Mbps/80 ms | 1.375 ms | 1.015 ms | 473 ms |
| Móvil, CPU ×4, 1,6 Mbps/150 ms | 3.242 ms | 2.956 ms | 499 ms |

Los percentiles usan rango más próximo; cuatro muestras por celda describen
esta cohorte, no la distribución de cola de producción. No reapareció el
pico antiguo. Esto **no demuestra su eliminación**.

Los doce NetLogs se correlacionaron con CF-Ray y fuentes `URL_REQUEST` del
host de staging. Se siguieron dependencias en ambas direcciones sin saltar
a otras solicitudes `URL_REQUEST`; una conexión compartida es contexto y
no trabajo exclusivo de una solicitud. Se excluye tráfico de fondo de
Chrome no relacionado con el host. Los 36 documentos tuvieron espera de
conexión de 96–235 ms en frío y de 0–1 ms en las recargas reutilizadas;
no aparece un tramo de conexión de siete segundos. La resolución contiene
una cancelación DNS en una muestra exitosa, sin un retraso comparable al
antiguo: no se presenta como causa.

Artefactos reproducibles en `artifacts/scaling-latency-2026-11-14/`:

- `baseline-network.json`: CDP, recursos, métricas y correlación de cabeceras.
- `baseline-netlog-correlated.json`: grafo acotado y 36 documentos identificados.
- `netlog/baseline-*.json`: doce capturas NetLog en modo Default, sin sesiones.
- `traces/baseline-*.json`: tres trazas de navegación.

El modo Default excluye valores sensibles de cookies, pero conserva metadatos
de red y URLs. Los NetLogs son artefactos locales; antes de adjuntarlos a un
ticket externo debe revisarse su contenido. Esta auditoría utiliza contextos
invitados sin sesiones del negocio.

## Experimento de protocolo, conservando el código

Se alternaron HTTP/3 predeterminado y Chrome con `--disable-quic` (HTTP/2),
cuatro procesos nuevos por alternativa, las mismas tres condiciones de
conexión y caché: **24 navegaciones seriales**. CPU ×4, 1,6 Mbps y 150 ms.
El despliegue de referencia se comprobó con Wrangler antes de comenzar.
No se modificaron protocolos del servidor ni configuración de los clientes.

| Alternativa | Foto lista fría p50 / máximo | Reutilizada, caché vacía p50 | Caliente p50 | TTFB frío p50 |
| --- | ---: | ---: | ---: | ---: |
| Predeterminado, HTTP/3 | 3.282 / 3.885 ms | 3.037 ms | 550 ms | 292 ms |
| HTTP/2 forzado | 3.293 / 3.369 ms | 3.021 ms | 606 ms | 348 ms |

No hay una ventaja estable que justifique desactivar QUIC. En HTTP/2 el
intervalo previo a SSL fue de 44–62 ms; el SSL de 45–63 ms. En HTTP/3 CDP
registra `connectStart == sslStart`: esto no es una medición de TCP y no
significa que la conexión carezca de coste. Ninguna solicitud medida
superó un segundo hasta sus cabeceras en esta cohorte.

Una tentativa previa no llegó a mostrar la galería dentro del límite de la
prueba y no dispone de captura de fallo completa. Se conserva como intento
fallido, **no como resultado aprobado**. El ejecutor se reforzó para guardar
captura, DOM, errores y solicitudes si vuelve a ocurrir. La segunda cohorte
completa es la que aparece en la tabla.

**Variación de ruta observada:** los CF-Ray de la referencia anterior terminan
en `GRU`; los del experimento de protocolo terminan en `SCL`. No representa
otra conexión física ni demuestra el motivo del cambio. Obliga a separar
variación de red/ruta de una mejora atribuible al código.

Artefactos: `protocol-network.json`, `protocol-network-groups.json`,
`protocol-netlog-correlated.json` y ocho `netlog/protocol-*.json`.

## Qué sigue retrasando la ficha móvil fría

La traza de referencia lenta muestra:

| Hito de la muestra | Desde inicio de navegación |
| --- | ---: |
| Cabeceras / fin de documento | 422 / 448 ms |
| Descubrimiento de WebP principal mediante preload HTML | 471 ms |
| Fin del CSS principal, 52,6 KB transferidos | 2.123 ms |
| Fin del WebP principal, 64,0 KB transferidos | 2.312 ms |
| Fin del último módulo descargado antes de la ficha | 3.135 ms |
| Imagen detectada en DOM / confirmada lista | 3.335 / 3.373 ms |
| Último candidato LCP registrado | 3.308 ms, logo |

La fotografía llega antes de su montaje. Hay dependencia del arranque de
JavaScript y del módulo de la ficha, además del ancho de banda artificialmente
limitado. La observación de tareas largas registra una de 108 ms en el
arranque. La traza muestra evaluación del módulo de entrada de 37,8 ms,
evaluación de ProductPage de 19,7 ms y layout de 38,4 ms. Son eventos
potencialmente anidados; no se suman como costes independientes.

El intervalo de 38,3 ms tras detectar la imagen confirma que el problema
dominante de esa muestra no es un decodificador trabajando durante segundos.
El logo es el último candidato LCP móvil capturado; **LCP y disponibilidad
de la fotografía son métricas diferentes**, y se conservan ambas. No hay
datos de INP de campo en esta prueba; las tareas de laboratorio no se
presentan como INP de usuarios reales.

No se ha dividido más JavaScript, movido CSS, quitado animaciones ni reducido
calidad de fotos en esta investigación: esta evidencia por sí sola no
demuestra que una partición adicional mejore el recorrido completo.
`baseline-trace-summary.json` conserva recursos y eventos de las tres trazas.

## Home y Tienda: nueva referencia en el mismo corte

Se midieron otras 36 navegaciones reales sin interceptación: dos páginas,
tres perfiles, tres muestras frías y tres calientes por combinación. La
versión seguía siendo `700c39a5…`; el nuevo esquema administrativo no cambia
las funciones públicas utilizadas aquí. Todos estos CF-Ray salen por SCL.

| Página / perfil | LCP frío p50 | LCP caliente p50 |
| --- | ---: | ---: |
| Home, escritorio | 612 ms | 244 ms |
| Tienda, escritorio | 572 ms | 208 ms |
| Home, móvil | 1.192 ms | 376 ms |
| Tienda, móvil | 1.188 ms | 328 ms |
| Home, móvil lento | 3.140 ms | 548 ms |
| Tienda, móvil lento | 3.184 ms | 432 ms |

Se conservó una primera respuesta de Home de **1.013 ms**, CF-Ray
`a5ae4f15ce80b43d-SCL`, `wallTime = 1794746261.993614`. DNS ocupa 57,7 ms
y conexión QUIC 48,7 ms; el Worker informa `public_context;dur=703.0`.
Por tanto este pico nuevo incluye demora en obtener el contexto público.
No es el tramo de siete segundos de conexión de la muestra histórica.
El documento no expone identificadores Worker/upstream: una coincidencia
temporal con un registro de Supabase no debe presentarse como correlación
exacta de la misma solicitud. El tramo interno sigue sin atribución
demostrada a PostgreSQL, pool o gateway.

Las 36 visitas terminaron con imagen lista, sin errores de aplicación,
desbordamiento horizontal ni solicitudes de vídeo en móviles. Los bytes de
recursos corresponden a la ventana de medición, que termina 1,2 segundos
después de confirmar la imagen; no son el total final de todos los recursos
del Home. Artefactos: `baseline-pages-network.json`,
`baseline-pages-groups.json`, seis `traces/baseline-*-home|store.json` y sus
capturas en `screens/`.

## Experimentos controlados no adoptados

### Precargar únicamente ProductPage

Se comprobó por SHA-256 el módulo desplegado de la ficha y se comparó el
mismo documento con y sin un único `modulepreload` de ese módulo. Ambos
brazos interceptan y entregan de igual manera la respuesta del documento;
solo el candidato añade el enlace. El experimento **no cambia el código
desplegado** y sus tiempos no se mezclan con las cohortes sin interceptación.
Se alternó AB/BA para formar ABBA: seis pares móviles lentos y tres pares
de escritorio, 18 navegaciones, todos por SCL.

| Métrica | Control | Un hint de ProductPage |
| --- | ---: | ---: |
| Foto móvil lenta lista, p50 | 3.216 ms | 3.197 ms |
| LCP móvil lento, p50 | 3.216 ms | 3.200 ms |
| Suma de tareas largas por navegación móvil, p50 | 165 ms | 168 ms |
| Foto de escritorio lista, p50 | 545 ms | 559 ms |

El módulo de ficha llega mucho antes (ejemplo: 1.009 ms frente a 3.051 ms),
pero ProductCard y OlfactoryProfile siguen descargándose después de los
módulos comunes y terminan cerca de 3.028 ms. Además, en ese mismo par el
módulo común termina 36 ms después al competir con la nueva descarga.
Los pares ajustados por TTFB incluyen mejoras y regresiones; una pareja
de escritorio empeora 42 ms. La transferencia no disminuye y las tareas
largas no mejoran.

**Decisión:** no incorporar ese hint aislado. Anticipar un archivo no prueba
que el usuario vea antes la ficha. Los resultados no justifican una nueva
precarga en producción. Se conservan alternativas y regresiones en
`product-hint-experiment.json`, `product-hint-summary.json` y cuatro capturas
`screens/hint-*.png`.

Se hizo un último control causal con **el grafo exacto de tres módulos**,
incluyendo ProductCard y OlfactoryProfile, sin duplicar los módulos comunes
que ya precarga el HTML. Se verificaron sus tres hashes antes de ejecutar
otros seis pares móviles y tres de escritorio. No se fragmentó ningún módulo.

- Móvil lento: foto lista p50 **3.217 → 3.123 ms** y LCP **3.220 → 3.120 ms**.
  Los seis pares mejoran después de ajustar por TTFB: 19–99 ms. La mejora
  completa de una pareja fue de 778 ms, pero **701 ms eran diferencia de
  TTFB**; solo los 77 ms restantes pueden compararse como recorrido posterior
  a cabeceras. No se oculta ese pico de control.
- Las tareas largas y los bytes no disminuyen: el bloqueo observado por
  encima de 50 ms tiene mediana 65 → 62 ms y media 67 → 69,8 ms. Es una
  aproximación de laboratorio en esta ventana, no INP ni un TBT de campo.
- Escritorio: foto lista p50 **537 → 543 ms**. Dos pares mejoran poco y uno
  empeora; ajustados por TTFB son −4,7, +34 y −19,5 ms. No hay beneficio
  estable demostrado en escritorio con esas tres parejas.

El experimento demuestra que la cascada existe y que eliminarla aporta una
ganancia móvil acotada, aproximadamente un 3 % en esta muestra. No demuestra
que el bloqueo de CPU desaparezca ni que otra arquitectura sea necesaria.
**Decisión final:** descartar también esta variante de tres hints. La ganancia
móvil es marginal y no hay beneficio estable en escritorio. Se conservan
el grafo y las precargas públicas actuales; no se añade código experimental
a la web. Evidencias: `product-graph-experiment.json`,
`product-graph-summary.json` y `screens/product-graph-*.png`.

## Límite de correlación del nuevo pico de Home

La revisión de registros del proveedor encontró cuatro solicitudes candidatas
en la ventana temporal del pico: una de `catalog_home_context`, una de
`site_settings`, una de `home_document` y una de `public_media_aliases`. El documento solo proporciona
CF-Ray y duración del contexto; no devuelve los identificadores de cada
solicitud hija. **No se ha demostrado cuál corresponde exactamente al
documento lento.** Comparar timestamps no sustituye ese enlace.

La consulta oficial de observabilidad del Worker por el CF-Ray exacto
devolvió HTTP 403 por permisos insuficientes. Las evidencias preservadas por
la auditoría principal son `context-provider.json` y `worker-event.json` en
el mismo directorio de artefactos. No se atribuyen las diferencias entre
duración de origen y upstream de aquellas candidatas a una capa interna
concreta sin telemetría adicional. Para cerrar el incidente hacen falta el
evento correlacionado del Worker y los IDs de las solicitudes hijas o una
traza distribuida accesible del proveedor.

La versión candidata añade `X-Aroma-Public-Reads` exclusivamente en staging.
Contiene las operaciones públicas permitidas, su UUID de cliente ya enviado
en `X-Client-Info` y, cuando ya llegaron, el request ID del gateway y el tiempo
hasta cabeceras. Las lecturas pendientes se identifican sin esperarlas. No
incluye claves, sesiones, cuerpos, SQL ni URLs; está acotada a ocho entradas.
La producción conserva el transporte original y no recibe estos metadatos.
Las pruebas cubren ausencia de espera adicional, conservación del stream,
exclusión de operaciones privadas/credenciales e IDs inválidos.

## Verificación final de la versión candidata

La versión `27a0a2ff-019b-48bf-9c5a-599eb8fd4db5` quedó activa al 100 % en
staging. Se comprobó el contenido servido de doce assets, la configuración
del Worker y las 41 migraciones de desarrollo. Producción no se modificó.
La cohorte candidata repitió las 36 navegaciones de ficha y las 36 de
Home/Tienda sin interceptación de Fetch.

| Móvil lento | Referencia p50 | Candidata p50 |
| --- | ---: | ---: |
| LCP Home frío | 3.140 ms | 3.360 ms |
| LCP Tienda fría | 3.184 ms | 3.416 ms |
| LCP ficha fría | 3.192 ms | 3.284 ms |
| Fotografía de ficha lista, conexión nueva | 3.242 ms | 3.365 ms |
| Fotografía de ficha lista, conexión reutilizada y caché vacía | 2.956 ms | 3.016 ms |
| Fotografía de ficha lista, caché caliente | 499 ms | 556 ms |

No hay una mejora pública demostrada. La cohorte conserva sus muestras
lentas y cambios de POP; la optimización administrativa de esta versión
no permite adjudicarse una reducción del LCP público. Home/Tienda tuvieron
CLS 0 en ambas cohortes y continuaron sin solicitar vídeos en móvil.

### Retraso DNS observado en la cohorte candidata

La muestra `candidate-slowMobile-3`, CF-Ray `a5af27e3d9890310-GRU`, tuvo
TTFB de 1.445 ms. CDP registra DNS de 0 a 1.025,898 ms, seguido por QUIC
aproximadamente de 1.026 a 1.137 ms. El contexto de catálogo del Worker
duró 71 ms y el público, 27 ms.

El grafo NetLog acotado al host identifica el trabajo de resolución 123:
HTTPS (tipo 65) y AAAA (28) respondieron aproximadamente a los 9 ms; la
consulta A (1), fuente 130, tuvo su primer evento de respuesta cerca de los
1.026 ms sin los campos de respuesta válida. Un segundo intento, fuente
158, devolvió dos respuestas con `rcode=0`; la resolución finalizó cerca
de 1.029 ms. Se conserva en `dns-detail.json` y el NetLog correspondiente.

Esto demuestra dónde esperó esa navegación, **no qué operador o componente
DNS provocó la demora ni que hubiera un timeout concreto**. No se mezclaron
eventos de resolución de tráfico de fondo de Chrome con la solicitud de
staging. Tampoco explica retroactivamente el tramo antiguo de siete
segundos anterior a SSL. No se cambiaron DNS, IPv6 ni protocolos.

### Correlación final del contexto y los manifiestos

`final-provider-correlated.json` conserva 96 observaciones multimedia,
incluyendo cabeceras repetidas desde caché del navegador: corresponden a
**64 solicitudes distintas**, todas encontradas por su ID exacto en los
registros del gateway. Las medianas/máximos fueron:

- Navegador hasta cabeceras: 144,8 / 267,4 ms.
- HTTP del manifiesto desde el Worker: 19 / 98 ms.
- Lectura de bytes: 5 / 26 ms.
- Upstream Envoy: 2 / 18 ms; origen del proveedor: 9 / 87 ms.

Las 64 fueron HIT de caché de bytes; estas muestras no evalúan una descarga
R2 con MISS del edge. Una prueba HEAD de seguridad adicional sí conservó
`media_storage=473 ms`; no se oculta como excepción ni se presenta toda
lectura de almacenamiento como un acceso de cinco milisegundos.

También se enlazaron **118 lecturas hijas** mediante la nueva cabecera de
staging y los registros del proveedor. Esto cierra la identificación de
esas operaciones medidas, pero no explica la cola interna del incidente
anterior ni cubre todavía todo el transporte SEO específico de producto.
La ausencia del pico de un segundo en esta muestra no demuestra que haya
desaparecido. La consulta de observabilidad del Worker siguió limitada por
permisos y no se inventaron tiempos internos de PostgREST o PostgreSQL.

El informe conjunto de paginación, validaciones, regresiones y despliegue es
[ADMIN_SCALING_CONNECTION_AUDIT_2026_11_15.md](ADMIN_SCALING_CONNECTION_AUDIT_2026_11_15.md).

## Pendiente y recomendación

- Mantener HTTP/3 predeterminado y las protecciones actuales de R2.
- Conservar el pico anterior como incidente sin causa interna demostrada.
- Para una recurrencia, capturar NetLog de esa misma navegación, CF-Ray,
  identificadores Worker/upstream, protocolo, conexión, DNS, intentos y
  tiempos. La muestra histórica no se puede reconstruir retroactivamente.
- Una comparación posterior de código debe verificar primero versión, assets,
  esquema y POP, y separar caché fría, conexión nueva y conexión reutilizada.
- No se declara que el pico desapareció ni se recomienda ampliar timeouts o
  añadir reintentos para ocultarlo.

Referencias técnicas: [fases de solicitudes en Chrome DevTools](https://developer.chrome.com/docs/devtools/network/reference#timing-explanation)
y [diseño y privacidad de NetLog en Chromium](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/net-log.md).
