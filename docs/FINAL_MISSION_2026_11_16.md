# Cierre técnico de V3 y reservas — 16–17 de noviembre de 2026

**Estado: cambios implementados, desplegados y validados en staging; cierre con
limitaciones explícitas.** Se corrigió un 404 real de Biblioteca, se verificaron
las reservas de quince minutos, los estados de imagen y las mejoras acotadas
de carga. No se certifica capacidad de producción, pagos reales ni LCP inferior
a 2,5 segundos en todas las condiciones. Las esperas externas y el margen de
memoria siguen abiertos. Producción no se modificó; su metadato coincide
exactamente con el inicial.

Se conserva la base de [NAVIGATION_EXPERIENCE_2026_11_16.md](NAVIGATION_EXPERIENCE_2026_11_16.md),
V3 `c8de4204-c378-45cb-a7bd-7bd8b805008e`. Evidencias nuevas, sin credenciales:
`artifacts/final-mission-2026-11-16/`, fuera de Git. Las fechas son de Lima;
varios registros ya indican 17 de noviembre en UTC.

## Memoria de Supabase: resultados actuales

Proyecto verificado: `aroma-infini-dev`, `tkxvexfapszilzhogvgu`, `sa-east-1`.
Se utilizaron conexiones SQL breves con TLS verificado y el endpoint oficial
Metrics API. No se cambiaron conexiones máximas, parámetros, extensiones,
compute, plan, protocolos ni configuraciones de producción.

En las tres observaciones SQL iniciales hubo diez conexiones cliente incluyendo
la auditoría, ninguna transacción inactiva, ninguna conexión bloqueada y ningún
otro cliente ejecutando una consulta en esos instantes. Las conexiones antiguas
de PostgREST estaban inactivas en el pool; su antigüedad no demuestra una fuga.
El pool declaró máximo diez conexiones, cero solicitudes esperando y cero
timeouts acumulados en las lecturas. No se observaron transacciones prolongadas.

Las seis lecturas oficiales posteriores abarcan 299 segundos, con cadencia de
un minuto. No son una prueba de carga del servicio alojado:

| Métrica | Observación |
| --- | --- |
| Memoria física total de la métrica del sistema | 431,88 MiB |
| Memoria disponible, contando lo recuperable | 157,09–160,77 MiB |
| Comprometida, `Committed_AS` | 1.172,20–1.172,68 MiB |
| Límite de compromiso, `CommitLimit` | 1.239,93 MiB |
| Margen de compromiso observado | aproximadamente 67 MiB, un 5,4 % |
| Swap ocupado | 332,15–343,63 MiB |
| Incremento de contadores swap-in / swap-out | 9.611 / 8.824 páginas |
| Incremento de OOM kills | 0 |
| CPU ocupada / iowait medios del intervalo | 3,92 % / 1,58 % |

Los valores crudos y sus unidades están en `memory-series.json`; el resumen,
en `memory-summary.json`. No se convierten las páginas de swap a bytes sin
comprobar el tamaño de página del sistema. Algunas muestras repiten valores
del exportador; la resolución de esta serie no permite descartar picos breves.

**No se confirmó una tormenta de conexiones, una fuga ni un colapso activo de
memoria durante la observación. Sí existe poco margen de compromiso.** El uso
de caché y buffers no equivale a RAM irrecuperable; tampoco `Committed_AS`
equivale a páginas físicas utilizadas. El porcentaje de la captura del usuario
corresponde a otro instante y no debe compararse directamente mezclando MB,
MiB y métricas de distinto significado.

`shared_buffers` es de 224 MiB; `work_mem`, de unos 2,13 MiB; máximo sesenta
conexiones. Esas asignaciones, los procesos y sus mapas de memoria participan
en el compromiso del sistema. No hay telemetría por proceso suficiente para
atribuir exactamente cada byte a una extensión, al pool o a una consulta.
La lectura de `pg_backend_memory_contexts` describe únicamente la sesión de
auditoría; no representa toda la instancia. No se solicitó instrumentación
intrusiva ni se incrementaron límites para ocultar el riesgo.

El cache-hit acumulado de PostgreSQL fue 99,9978 %. Los 85.011.675.249 bytes de
temporales son acumulados desde el 2 de octubre, no archivos actualmente vivos
ni memoria simultánea. Las estadísticas de sentencias se reiniciaron el 26 de
octubre: no es válido explicar todo ese acumulado con las sentencias retenidas
después de esa fecha. Entre las consultas actuales retenidas con temporales
destacan inspecciones del catálogo de PostgreSQL; las RPC comerciales revisadas
no registraban escrituras temporales. Los máximos históricos de las RPC incluyen
versiones anteriores y no certifican el rendimiento de la versión actual.

Las quince lecturas `EXPLAIN (ANALYZE, BUFFERS)` anteriores y posteriores se
guardaron completas. Incluyen la duración de la función; el nodo exterior
no revela por sí solo todos los planes SQL internos de una RPC PL/pgSQL.
No justificaron índices adicionales sobre las tablas comerciales existentes.

La instancia observada permite validar tráfico ligero; estas lecturas no
certifican capacidad productiva bajo carga. Antes de producción se recomienda
compute con mayor margen que el actual, contrastando Micro y Small en un
entorno independiente y con datos representativos. El cambio requiere
autorización; no se contrató nada. Los límites y costes deben verificarse en el
[catálogo de compute de Supabase](https://supabase.com/docs/guides/platform/compute-and-disk).
La distinción entre memoria física y compromiso sigue los
[informes oficiales](https://supabase.com/docs/guides/observability/reports),
y el intervalo de lectura sigue la [Metrics API](https://supabase.com/docs/guides/observability/metrics).

Una comprobación posterior, limitada a 24 lecturas RPC durante un minuto y
como máximo dos en paralelo, terminó sin errores: medianas hasta cabeceras
de 198 ms para Home, 210 ms para catálogo y 208 ms para ficha. No representa
una prueba de capacidad de producción. El compromiso pasó transitoriamente
de 1.172,45 a 1.210,14 MiB, dejando aproximadamente 29,8 MiB de margen; dos
minutos después volvió a 1.172,35 MiB. La memoria disponible volvió a unos
155 MiB. No aumentaron las colas, timeouts ni OOM observados y se mantuvo el
número de conexiones. Esa coincidencia temporal no demuestra qué proceso
originó el incremento. Las capturas están en `capacity-read-summary.json` y
`database-latest-path.json`; faltan métricas por proceso y asignaciones
internas del proveedor para atribuirlo con precisión.

## Reserva de stock autorizada

El flujo anterior creaba pedidos simulados pendientes sin retener unidades.
El usuario autorizó reservar durante quince minutos y liberar si no se confirma
el pago. La migración `20261116000100_checkout_reservations.sql` incorpora:

- Un registro privado por pedido y presentación, con cantidad, fecha de creación,
  vencimiento y cierre. No modifica retrospectivamente pedidos anteriores.
- Bloqueo ordenado de productos y variantes antes de volver a cotizar y reservar.
  Se conservan los bloqueos ordenados de imágenes, los precios calculados en SQL,
  los hashes de operación y la validación de identidad existente.
- Creación del pedido y de sus reservas en la misma transacción. Un rollback no
  deja pedidos ni reservas parciales; un reintento no duplica ni amplía la reserva.
- Disponibilidad pública y cotización que descuentan reservas activas aún vigentes.
  El stock físico administrativo no se descuenta ni se altera la visibilidad
  configurada. Si vence una reserva, la disponibilidad vuelve inmediatamente por
  la condición SQL, aunque el cron se retrase.
- Un control diferido que impide bajar el stock físico por debajo de las reservas
  vigentes, compatible con el reemplazo transaccional de variantes existente.
- Un cron de staging que registra hasta cien vencimientos por ejecución, con
  `FOR UPDATE SKIP LOCKED`. Está limitado al proyecto de desarrollo; el navegador
  y los administradores autenticados no pueden ejecutar ese mantenimiento.
- RLS forzado, roles sin login y sin bypass, permisos explícitos, y dos índices
  parciales para las búsquedas de disponibilidad y vencimientos. No se modificaron
  índices anteriores ni se agregaron dependencias.

Mercado Pago permanece desactivado. **Una reserva no es una confirmación de pago**.
No se añadió un webhook ficticio ni se presenta una simulación como liquidación
real. La captura de un pago, el descuento definitivo del inventario y los eventos
duplicados de Mercado Pago deberán validarse al conectar ese proveedor. Ninguna
prueba de esta entrega realizó cobros o creó pedidos comerciales alojados.

La migración pasó en PostgreSQL nativo aislado antes de aplicarse exclusivamente
a desarrollo: 43 migraciones y 1.011 comprobaciones, además de concurrencia.
Con stock uno y dos clientes, una reserva fue aceptada y otra rechazada; con
stock cinco y diez clientes, se aceptaron cinco y se rechazaron cinco. Se
comprobaron reintentos concurrentes, rollback, respuesta perdida, precios
manipulados, cotización obsoleta, stock agotado, vencimiento, aislamiento,
ediciones administrativas concurrentes y carritos en orden inverso sin deadlock.
Esto prueba los contratos SQL aislados, no un cobro de Mercado Pago ni capacidad
de producción de la instancia Nano.

La aplicación alojada de la migración verificó el prefijo histórico completo y
sus hashes, los controles de seguridad existentes y que ninguna fila previa de
`app` o `private` cambiase durante la transacción. La tabla nueva quedó vacía.
Se regeneraron los tipos desde el esquema real de desarrollo. Producción no
recibió esta migración.

## Fotografías y validaciones de interfaz

Se reutilizó el componente de V3 en trece ubicaciones de seis módulos del panel:
Productos, gestión de fotografías, Hero, Home, selector y biblioteca multimedia.
Conserva cada `img`, sus dimensiones, `srcset`, `sizes`, ALT, arrastre y controles.
El error utiliza una ilustración local neutra dentro del espacio original.
No realiza otra descarga ni entra en un ciclo de reintentos; al cambiar la fuente
se recupera el comportamiento normal.

Una prueba encontró que la proporción intrínseca de la ilustración cambiaba la
altura de una miniatura. Se corrigió conservando la proporción de su caja al
fallar. Las doce pruebas específicas de imágenes públicas y administrativas
pasaron, en 390 y 1440 píxeles. Se preservaron las imágenes ya cacheadas, los
eventos de cambio de fuente y el pintado nativo previo a `decode()` de V3.

La primera regresión amplia obtuvo 1.442 casos aprobados, tres omitidos y un
fallo de sincronización en una prueba Excel de complementos. Su traza contiene
el rechazo correcto de una revisión de catálogo capturada antes de la carga
inicial. Se hizo que la prueba esperase a la interfaz real; seis repeticiones
pasaron sin debilitar esa validación ni aumentar timeouts. La suite completa
corregida pasó posteriormente. El fallo original permanece en las evidencias.

El texto del checkout ya no afirma que no se reservan unidades. Explica la
reserva de quince minutos y mantiene explícito que no se efectúa ningún cobro.
No se cambió la composición visual.

## Regresión funcional final

La ejecución final, con el código de la candidata congelado y sin builds
simultáneos, terminó correctamente en sus 26 configuraciones: **2.318
ejecuciones aprobadas, cero fallos y cero casos inestables**. Incluye las 91
pruebas de catálogo. Algunas configuraciones comparten casos, por lo que esa
cifra no representa 2.318 comportamientos distintos. Los tres casos omitidos
son capturas manuales optativas; se ejecutaron expresamente y sus tres casos
pasaron, como se detalla más abajo. TypeScript, lint y las 201 pruebas Node también pasaron.

Una segunda ejecución anterior había detectado una navegación móvil que aún
esperaba el módulo de Carrito. La traza conservaba la ficha y sus precios
correctos; no demostraba un fallo SQL ni de cálculo comercial. Ocho
repeticiones enfocadas pasaron. Se añadió precarga exclusivamente de código
al abrir el carrito y al mostrar su resumen, conservando los loaders y sus
validaciones frescas. Dos pruebas adicionales comprueban que, incluso si
esa descarga se demora, el diálogo responde y la precarga no ejecuta
operaciones de checkout. No se aumentaron timeouts ni reintentos.

## Despliegue candidato y comprobaciones ya completadas

La revisión administrativa alojada encontró después un defecto real de
entrada directa: `/admin/biblioteca` devolvía HTTP 404 en unos 104 ms. La
ruta existía en React, pero faltaba en `worker/route-policy.ts`; por eso el
esperar al encabezado terminaba en timeout. No era un bloqueo de Supabase
ni una descarga multimedia lenta. Dos pasadas conservaron el fallo y la
segunda registró el documento 404, el encabezado de página no disponible y
las solicitudes finalizadas. Las dos identidades temporales se retiraron.

Se añadió únicamente esa ruta a la lista de aplicación y a las pruebas de
shell/noindex, incluyendo la barra final. Se conserva el rechazo de rutas
administrativas inexistentes y todos los controles Auth/MFA/RLS. Esta
corrección posterior exige otra versión del Worker; el paquete frontend
permanece idéntico. Las cifras de la candidata v2 se mantienen identificadas
como tales hasta repetir las comprobaciones de la versión final.

La candidata v2 `71b82b1a-0c8d-4147-853b-abc3a9a3e3ed` estuvo activa al 100 % en
`aroma-infini-frontend-staging` durante la primera serie medida. Su despliegue comparativo fue
`f0ff5e1c-4f29-4c5a-9296-10fd6de34ae4`, con V3 al 0 % únicamente para
seleccionarla expresamente en las comparaciones. Se verificaron los hashes
de los **128 recursos JS/CSS realmente descargados**, el contenido del
Worker, sus bindings, el proyecto de desarrollo, el bucket privado y el HTML
responsive servido. El manifiesto del paquete tiene SHA-256
`45f12a226790dbe8fad92e7c84fd0e1c783850f90d06660958249d80733039f2`.

Después de corregir la ruta, está activa la candidata v3
`1f410026-ca53-45a3-8aa0-27d847cf7fba`, con despliegue comparativo
`9f71453e-e938-4252-bce7-0d6d1ba5d630`. El manifiesto frontend es **idéntico**
al anterior y se reutiliza su paquete sellado, sin duplicar recursos. Se
verificaron nuevamente los 128 hashes, el nuevo Worker y sus bindings, así
como `/admin/biblioteca` con HTTP 200 y noindex. Las cifras de v2 no se
presentan como mediciones de v3; la serie definitiva identificada con el
Worker corregido figura más abajo.

El ensayo R2 alojado utilizó un único recurso sintético nuevo y rotulado,
sin purgar fotografías comerciales: 50 solicitudes seriales, dos MISS y
48 HIT, todas con bytes verificados. Se comprobó autenticación real con
contraseña y TOTP, rechazo AAL1 y revocación del permiso con JWT AAL2 aún
vigente. La identidad temporal ya se retiró. El recurso quedó programado
para eliminación con el período de seguridad vigente de 24 horas; no se
borró inmediatamente. Los 50 resultados conservan IDs y tiempos de respuesta;
el tail de Worker retuvo correlación exacta para 24. Esta mejora de caché
pertenece a V3 y se conservó: no se atribuye como una nueva optimización.

| Entrega R2 real | HIT, 48 solicitudes | MISS, 2 solicitudes |
| --- | ---: | ---: |
| Hasta cabeceras, mediana | 144,9 ms | 439,4 ms |
| Lectura del cuerpo, mediana | 0,14 ms | 0,96 ms |
| Total, mediana | 145,6 ms | 440,3 ms |
| HTTP del manifiesto, mediana | 18,5 ms | 18,5 ms |
| Almacenamiento, mediana | 4 ms | 286 ms |
| Upstream Envoy informado, mediana | 3 ms | 4 ms |

El objeto sintético pesa 1,6/5,2 KB según variante; esos tiempos de cuerpo
no representan la descarga de una fotografía comercial grande. Las fotos
reales se incluyen en las visitas de Chrome. La muestra MISS no permite
estimar una cola p95 fiable. En los 24 eventos correlacionados del Worker,
la mediana de CPU fue 1 ms y la de duración, 23,5 ms; no son la latencia
completa del navegador. La lectura del manifiesto se mantiene incluso en
HIT para preservar su validación. No se publicó el bucket ni se añadió una
caché de autorizaciones o datos comerciales.

## Fuentes y arranque: cambio acotado y medido

En V3 competían por la conexión móvil el JavaScript inicial, CSS, tres
pesos de Lato y la fotografía principal. Se midió el uso tipográfico real:
el peso 300 no aparece en el primer viewport móvil de Home, Tienda ni ficha;
Home sí lo utiliza más abajo. No se retiró ese peso ni se cambió ninguna
tipografía. Únicamente su **precarga**, en esas rutas, tiene ahora la condición
de escritorio del breakpoint existente. CSS continúa solicitándolo cuando
un texto lo necesita. Las demás rutas conservan su regla original.

Treinta visitas experimentales con el mismo tratamiento HTML en ambos
brazos justificaron el cambio; otra alternativa que solo bajaba la prioridad
no mostró mejora consistente y se descartó. La candidata desplegada fue
comprobada después con **180 visitas reales**, cinco pares por ruta, perfil
y estado de caché. No hubo errores de imágenes, desbordamientos ni vídeo
móvil en esas visitas. CLS fue cero en las cargas frías; una carga caliente
de Home en escritorio registró un desplazamiento de 0,000385. Algunas
observaciones de Home conservaron cinco solicitudes pendientes: la ventana
termina 1.200 ms después de estar lista la foto principal, no después de
descargar todos los recursos diferidos de la página.

| Móvil lento, caché fría | LCP V3, mediana | LCP candidata, mediana | Diferencia pareada del tramo posterior a cabeceras |
| --- | ---: | ---: | ---: |
| Home | 3.076 ms | 3.788 ms | −88 ms |
| Tienda | 2.672 ms | 3.472 ms | −126 ms |
| Ficha | 2.848 ms | 2.724 ms | −128 ms |

**Las medianas absolutas de Home y Tienda empeoraron en esta serie.** No se
ocultan ni se sustituyen por el experimento anterior: las cinco visitas de
cada brazo tuvieron una distribución desigual de resoluciones de nombre de
aproximadamente un segundo, anteriores al inicio de la solicitud HTTP. Por
eso se presentan también las diferencias pareadas posteriores a cabeceras,
que no son tiempos exclusivamente de CPU. La comprobación adicional con
conexión establecida y caché HTTP vacía se describe a continuación. Los picos de 12–18 segundos
de informes anteriores no reaparecieron en estas visitas, lo que no demuestra
que se hayan eliminado.

Para aislar esa variación se realizaron otras treinta visitas, cinco pares
por ruta, usando la misma página/proceso por par, conexión previamente
establecida con dos lecturas inocuas de `robots.txt`, caché HTTP vacía en
ambos brazos y el mismo perfil lento. La resolución de nombre medida fue
cero; una conexión se renegoció normalmente. No se cambió DNS, QUIC, proxy,
protocolo ni configuración del sistema. El estado del proceso/V8 está caliente
y el orden AB/BA compensa su efecto, por lo que esta serie **no sustituye las
mediciones totalmente frías**.

| Conexión establecida, HTTP frío, móvil lento | V3, LCP mediano | Candidata, LCP mediano |
| --- | ---: | ---: |
| Home | 2.780 ms | 2.564 ms |
| Tienda | 2.460 ms | 2.276 ms |
| Ficha | 2.716 ms | 2.468 ms |

La mejora del tramo de carga está verificada, pero **no se alcanzó LCP <2,5 s
en las tres rutas ni bajo todas las condiciones**. Home conserva trabajo
crítico de transferencia y renderizado; además persisten las variaciones de
conexión fría. Una muestra de ficha en la serie controlada llegó a 3.016 ms;
la mediana tampoco es una garantía de cola máxima.

El bloqueo por tareas largas no mejoró de forma consistente: en móvil lento
frío, las medianas fueron 46→47 ms en Home, 41→42 ms en Tienda y 40→43 ms en
ficha. El JavaScript transferido creció aproximadamente 0,5–0,7 KB por los
ajustes implementados. No se afirma una mejora de CPU ni se realizó otra
fragmentación especulativa. El heap observado se mantuvo alrededor de 7 MiB;
no equivale a la memoria total de un teléfono. INP de usuarios reales no está
disponible en este staging; las tareas largas son evidencia de laboratorio.

## Resolución de nombre: recorrido identificado

El análisis pasivo de los NetLogs de la serie v2 encontró DNS superior a
500 ms en siete de 45 visitas frías de V3 y doce de 45 de la candidata. No
se descartaron esas visitas. Se inspeccionaron tres lentas y dos rápidas
de cada versión; el registro derivado conserva hashes de los NetLogs y
CF-Ray, sin copiar cabeceras de sesión ni direcciones locales.

En las seis muestras lentas seleccionadas se observa este mecanismo:

1. Chrome emite consultas A, AAAA y HTTPS al resolver configurado.
2. Una consulta A o AAAA no registra recepción UDP del primer intento.
3. Aproximadamente 1.012–1.024 ms después inicia otro intento con el
   segundo resolver; este registra respuesta en 2–3 ms.
4. La resolución termina y comienza después la conexión con Cloudflare.

Un ejemplo de la candidata tiene un trabajo de resolución de 1.022 ms;
las consultas A y HTTPS terminan en 37 ms, mientras AAAA cambia de resolver
a los 1.019 ms. En los controles rápidos las respuestas llegan al primer
intento. Esto ubica la espera en el recorrido de resolución observado por
Chrome, **antes de HTTP y del Worker**. No demuestra si hubo pérdida del
paquete de ida/vuelta o demora dentro del primer resolver, ni identifica
por sí solo al responsable operativo. No se modificaron DNS, protocolos,
VPN, proxy ni configuración del equipo o de producción. Tampoco se añadió
una precarga para intentar ocultar un retraso anterior al documento.

Es una evidencia distinta de las esperas históricas de 12–18 s posteriores
al envío HTTP y del upstream Envoy de 1.000 ms. Esos picos no se consideran
resueltos por esta explicación DNS. Para el upstream se mantiene el paquete
de [evidencia y telemetría que debe solicitarse a Supabase](SUPABASE_UPSTREAM_SUPPORT_2026_11_14.md);
no se contactó a terceros ni se atribuyó la demora a PostgreSQL sin prueba.

## Primer acceso al carrito y al checkout

Se probaron 36 contextos nuevos de Chrome, con alternancia AB/BA, tres pares
por perfil y dos tiempos de lectura iguales en ambos brazos: cero o 500 ms.
El tiempo de lectura se excluye del tiempo desde el clic. No hubo envío de
formularios de compra. Los bloqueos CDP impedirían enviar una escritura
comercial inesperada antes de que llegara al servidor.

| Primer acceso, móvil lento | V3 | Candidata |
| --- | ---: | ---: |
| Carrito, clic inmediato | 371 ms | 232 ms |
| Checkout, clic inmediato | 1.232 ms | 996 ms |
| Carrito, después de 500 ms de lectura | 249 ms | 141 ms |
| Checkout, después de 500 ms de lectura | 600 ms | 331 ms |

Son medianas de tres muestras, no un compromiso de latencia en producción.
En escritorio con clic inmediato, Carrito quedó esencialmente igual
(236→237 ms); no se declara una mejora universal. La precarga es de módulos,
sin ejecutar cotizaciones, reservar unidades ni almacenar precios o stock.

## Serie definitiva de la candidata corregida

La primera tentativa final falló en **V3 base**, antes de comparar la candidata:
cinco transferencias críticas recibieron cabeceras HTTP 200 y después
terminaron con `ERR_QUIC_PROTOCOL_ERROR`. CSS y JavaScript incompletos dejaron
la página sin su presentación normal; el desbordamiento de esa captura no
demuestra una regresión del layout aprobado. NetLog registra un único cierre
de conexión, duplicado en dos eventos, `QUIC_PACKET_WRITE_ERROR` (27),
`from_peer=false`, y fallo de escritura −109 (`ERR_ADDRESS_UNREACHABLE`). Eso
identifica el error informado por Chrome, no la causa última ni su responsable.
Los cierres −3 al terminar el navegador son posteriores y distintos.

Se conservaron la tentativa, los CF-Ray, los recursos afectados y la revisión
independiente en `readonly-quic-interruption-review.json`. Se ejecutó después
una **cohorte completa nueva**, sin reintentos automáticos, aumentos de timeout,
desactivación de HTTP/3 ni ajustes de red: `public-paired-closure.json`. El éxito
posterior no convierte el fallo de transporte en un problema resuelto.

La cohorte definitiva contiene 180 visitas reales contra V3 y
`1f410026-ca53-45a3-8aa0-27d847cf7fba`: cinco pares por Home/Tienda/Ficha,
escritorio 1440×900, móvil 390×844 CPU×4 con 9 Mbps/80 ms y móvil lento con
1,6 Mbps/150 ms; caché fría y caliente. Chrome nuevo por par de visitas frías y
calientes, orden AB/BA, sin builds ni otros navegadores de pruebas simultáneos.
La caché fría del navegador no implica MISS del edge. Las métricas siguientes
son medianas; la diferencia pareada se calcula por par, no restando medianas.

| Perfil y caché | Ruta | LCP V3 | LCP final | Diferencia pareada después de cabeceras |
| --- | --- | ---: | ---: | ---: |
| Escritorio, fría | Home | 620 ms | 604 ms | +7 ms |
| Escritorio, fría | Tienda | 432 ms | 416 ms | +3 ms |
| Escritorio, fría | Ficha | 744 ms | 732 ms | −19 ms |
| Móvil 9 Mbps, fría | Home | 1.396 ms | 1.428 ms | +9 ms |
| Móvil 9 Mbps, fría | Tienda | 1.188 ms | 1.176 ms | −29 ms |
| Móvil 9 Mbps, fría | Ficha | 1.376 ms | 1.336 ms | −34 ms |
| Móvil lento, fría | Home | 3.112 ms | 3.012 ms | −80 ms |
| Móvil lento, fría | Tienda | 2.716 ms | 2.604 ms | −113 ms |
| Móvil lento, fría | Ficha | 3.264 ms | 2.924 ms | −171 ms |
| Móvil lento, caliente | Home | 636 ms | 620 ms | −16 ms |
| Móvil lento, caliente | Tienda | 564 ms | 552 ms | 0 ms |
| Móvil lento, caliente | Ficha | 768 ms | 672 ms | −15 ms |

Los máximos observados de la candidata en móvil lento frío fueron 4.060,
3.652 y 3.240 ms respectivamente. Con cinco muestras por celda no se certifica
una distribución de cola de producción. En esta serie los contadores de tareas
largas son mayores en ambos brazos que en la anterior: sus medianas lentas
fueron 88→91, 77→81 y 79→76 ms. Las comparaciones válidas son contemporáneas
dentro de cada cohorte; no se presenta el cambio entre sesiones como beneficio
del código. No hay una disminución general de bloqueo JavaScript demostrada.

Las 180 visitas finales no tuvieron errores críticos de transferencia,
errores de imagen, desbordamientos ni solicitudes de vídeo en móvil. Todas
las medianas CLS fueron cero, sin cambios de proporciones en las capturas
comparativas. Los recursos diferidos pendientes siguen registrados. Tienda
y ficha evitan una descarga de fuente de unos 24 KB cuando no se utiliza;
Home conserva su uso bajo el primer viewport. El descubrimiento de su imagen
principal sigue ocurriendo en decenas de milisegundos después de cabeceras:
no se afirma una nueva mejora importante en ese tramo ya optimizado en V3.

En esta segunda cohorte reapareció el mismo mecanismo DNS en una de 45
visitas frías base y tres de 45 de la candidata. El archivo
`final-latency-outliers.json` separa DNS, conexión, espera HTTP y cuerpo para
todos los documentos con TTFB >900 ms. Una ficha base caliente, sin DNS ni
conexión nueva, tuvo TTFB 1.067 ms y `catalog_context` 886 ms (CF-Ray
`a5bc3055f9fad76a-SCL`). Ese contador abarca la lectura HTTP del catálogo;
no expone su descomposición interna de PostgREST/pool/PostgreSQL ni un ID
upstream de esa operación en esa respuesta. Se conserva como limitación de
telemetría; no se atribuye a SQL ni se añade un caché comercial para ocultarlo.

## Navegación y panel administrativo

Los treinta recorridos públicos medidos, con treinta calentamientos separados,
completaron 300 destinos: Home, Tienda, marca, ordenamiento, quitar filtro,
ficha, añadir al carrito local, Contacto, Carrito y Checkout. No hubo recargas
completas de documento ni fallos de solicitud en esos recorridos. Las rutas
de catálogo/ficha conservaron una lectura RPC por destino medido; Contacto
no necesitó otra. En móvil lento la disponibilidad de datos de Tienda fue
265→272 ms y la ficha 252→246 ms. La navegación ya caliente quedó esencialmente
similar: la mejora de primer uso del carrito no se traslada artificialmente
a una mejora universal de rutas ya cargadas. Esta serie SPA corresponde a v2;
la candidata final mantiene exactamente su frontend y se valida además en las
capturas y comparaciones administrativas definitivas.

El panel se abrió con una identidad temporal real creada para esta auditoría,
contraseña aleatoria no guardada y TOTP verificado por Supabase. Se rechazó
AAL1; al retirar su membresía administrativa se rechazó la RPC incluso con
JWT AAL2 vigente. Las identidades se retiraron y el cierre SQL confirma **cero
cuentas temporales restantes** de esta intervención. No se utilizaron las
credenciales personales de un administrador ni se cerraron sus sesiones.

Se comprobaron 17 destinos administrativos en 1440/390 y cinco destinos
(Resumen, Productos, Pedidos, Home, Biblioteca) en otras seis anchuras:
64 vistas en total. No son 17×8 combinaciones. Las tablas y pedidos recientes
están enmascarados en capturas para proteger información, de ahí las franjas
magenta. La primera medición esperaba URL y encabezado: acredita disponibilidad
de interfaz, no finalización de una biblioteca que carga después del montaje.
Su conteo inicial de solicitudes mezclaba lecturas de la ruta anterior; no
se utiliza para afirmar consultas reducidas ni tiempos SQL.

Por ello se hizo otra validación real de 80 navegaciones, que espera el
contenido de lista y dos frames, y atribuye solicitudes por su inicio CDP
después del clic. Las lecturas ya en curso reutilizadas quedan separadas.

| Lista y dos frames, mediana | Escritorio V3→final | Móvil lento V3→final |
| --- | ---: | ---: |
| Productos | 191→206 ms | 620→610 ms |
| Pedidos | 185→184 ms | 571→575 ms |
| Clientes | 179→173 ms | 583→584 ms |
| Resumen | 185→184 ms | 558→570 ms |

Las diferencias son pequeñas y mixtas; **no se demostró una aceleración general
del administrador en esta intervención**. Se mantiene la paginación remota,
la ejecución coordinada de permisos y datos y sus verificaciones antes de
publicar resultados. No se reintrodujeron instantáneas completas ni una caché
privada compartida. Los controles de aislamiento y la concurrencia SQL pasan.

Biblioteca se comprobó aparte en ocho tamaños hasta `aria-busy=false`, con
conteo, tarjetas, paginación y sin error. Fotografías mantiene cinco espacios;
los controles de la primera y quinta foto son alcanzables y el botón Guardar
admite interacción, comprobada sin enviar. Las capturas de viewport y pruebas
de hit-testing descartan que el footer tape esos controles al desplazarse;
la superposición aparente de una captura full-page no se trató como un defecto
sin comprobarlo. No se subió ni guardó un producto real para obtener estas vistas.

## Capturas y pruebas finales

Las capturas públicas de v3 abarcan 1920, 1440, 1366, 768, 430, 414, 390 y
360 píxeles. Pasaron 40 páginas cargadas, seis comparaciones antes/después y
doce escenarios controlados de retraso/error 404. Estos doce acreditan skeleton,
fallback y recuperación, **no una mejora de latencia real**. Los tres casos
manuales optativos de la suite local se ejecutaron después: cinco tamaños,
formularios Excel, marcas, promociones, edición, menús y vistas previas.

| Validación | Resultado y alcance |
| --- | --- |
| TypeScript, lint, build staging | APROBADO; sin dependencias nuevas |
| Node | APROBADO, 201 pruebas |
| 26 configuraciones aisladas | APROBADO, 2.318 ejecuciones, cero fallos/inestables; algunos casos se comparten |
| Capturas optativas antes omitidas | APROBADO, tres casos ejecutados expresamente |
| PostgreSQL aislado | APROBADO, 43 migraciones, 1.011 comprobaciones y concurrencia; datos revertidos |
| Cambio final de ruta Worker | APROBADO, TypeScript/lint, 318 pruebas Worker y cuatro de routing repetidas |
| API alojada pública | APROBADO, 55 controles y rechazo 401 adicional del mantenimiento de reservas |
| Auth/TOTP/membresías alojadas | APROBADO con identidades temporales; credenciales fuera de archivos |
| R2 alojado | APROBADO, 50 solicitudes, dos MISS/48 HIT; prueba v2 conservada, sin purgas |
| Navegación pública alojada | APROBADO, 30 recorridos medidos de diez destinos, sin pedidos |
| Render inicial definitivo | APROBADO funcionalmente, 180 visitas de v3; objetivo LCP pendiente |
| Admin alojado | APROBADO, 64 vistas y dos mediciones de 80 cambios de sección |
| Biblioteca y controles de fotos | APROBADO en ocho anchuras, sin guardar |

Los fallos previos permanecen en sus informes: sincronización prematura de
una prueba Excel, navegación que esperaba el módulo de Carrito, defecto real
404 de Biblioteca, una excepción del capturador CDP ante una solicitud
cancelada, dos pruebas nativas bloqueadas por permisos del sandbox y el
incidente QUIC. Se corrigieron la causa de la prueba Excel, la precarga de
código, la ruta y el capturador; las pruebas nativas pasaron con el permiso
de ejecución normal aprobado. No se aumentaron reintentos ni timeouts para
marcarlos como correctos. La cuenta del capturador interrumpido se identificó
por su marcador privado, correo único y fecha, y se retiró mediante Auth;
no se alteraron cuentas existentes.

## Esquema, integridad y recursos al cerrar

Desarrollo queda con 43 migraciones, ninguna pendiente ni desconocida y hashes
históricos concordantes. Las once comprobaciones de seguridad de la base y
los ocho controles de reservas pasan. Los tipos oficiales generados coinciden
byte a byte con `src/types/database.generated.ts`; SHA-256
`2640322f82f3f196d2fe3469966258d799d3003074255ffa5fcf5313a4040801`.
El histórico registra 129 lecturas de la RPC de vencimiento, media 5,6 ms y
máximo 59,8 ms. La tabla de reservas permaneció vacía en el cierre alojado:
los ensayos de última unidad y demás escrituras comerciales fueron aislados.

La última observación de memoria posterior a las pruebas registró 166,08 MiB
disponibles, compromiso 1.177,61/1.239,93 MiB y swap 327,09 MiB. Las tres
instantáneas de actividad tuvieron diez conexiones cliente, cero clientes
ajenos activos, bloqueados o inactivos en transacción; el pool mantuvo cero
esperas/timeouts y no se observaron OOM. Esto descarta crecimiento persistente
durante la ventana observada, no garantiza margen bajo tráfico comercial.

El único archivo sintético de la prueba R2 quedó sin referencias y marcado
para el proceso backend habitual después de **2026-11-18 03:00:18 UTC**
(17 de noviembre, 22:00:18 de Lima). No se eliminó antes de sus 24 horas ni
se usó una purga comercial. R2 sigue privado: `r2.dev` desactivado y sin
dominios públicos directos, comprobado por la API oficial y HEAD 401.

## Despliegue final e integridad de la entrega

| Elemento | Identificador verificado |
| --- | --- |
| Worker staging | `aroma-infini-frontend-staging` |
| Versión activa única, 100 % | `1f410026-ca53-45a3-8aa0-27d847cf7fba` |
| Despliegue final | `7072b245-515e-4452-9a23-5f9bb525493a` |
| Supabase de desarrollo | `tkxvexfapszilzhogvgu` |
| Bucket privado | `aroma-infini-media-dev` |
| Paquete frontend SHA-256 | `45f12a226790dbe8fad92e7c84fd0e1c783850f90d06660958249d80733039f2` |
| Worker servido `seo-router.js` SHA-256 | `0a5e42170c04e526dfc2bea166a51f1ded074403568d9fc0440e80835835e65b` |
| CSS global servido SHA-256 | `c96b4a6912905bd10ad74dbcf0e73a7b502f305ce22cde1c40756cc8bd31b0bb` |
| Home JS servido SHA-256 | `5729f85a5dc6423265f984b0227d3565b2e7f1942a50889faa9528b703e14c40` |

Los 128 hashes servidos, módulos WASM y mapa del Worker están en
`verified-final.json`. Se comprobó el contenido actual descargado y su
procedencia de despliegue activa; no se afirma una comparación de bytes con
un bundle histórico local que no se conservó. El frontend reutiliza el paquete
sellado de v2 y el último cambio afecta únicamente la ruta del Worker.

Producción conserva la versión `ec8554f6-d47a-4af0-ba60-4623c8125020` y
el despliegue `9baa7c50-262a-4f23-bf52-5742a52ffa0b`. El hash del metadato
inicial/final es idéntico:
`6fd1c5ae4cd2f6df996c4c161db2748f97e95704d017e8023991252a1c28a5e6`.
No se consultó ni migró su base de datos; tampoco se publicaron dominios,
pagos o buckets. No hubo commit, push, reset, restauración ni eliminación
del trabajo existente. La verificación de conservación y cambios intencionales
se entrega en `final-source-state.json`.

La comprobación final conserva los **1.295 archivos inventariados**, sin
eliminaciones, con `git diff --check` correcto. Rama `develop` y HEAD
`7d2f3648e3b149023910a385bf9510f0ebf60d10` permanecen iguales al inicio.
Los cambios previos no se restauraron ni sobrescribieron. Las áreas de esta
intervención son:

- `worker/route-policy.ts` y prueba `seo-routing`: entrada directa de Biblioteca.
- `LoadingImage`, `useImageStatus`, CSS de carga y seis módulos admin:
  skeleton/fallback sin envolver ni cambiar la composición de sus imágenes.
- Módulos de rutas públicas, router, `CartDrawer` y `CartSummary`: precarga
  de código por intención, con pruebas de respuesta y ausencia de escrituras.
- Helpers de prerender/Worker de fuentes y sus pruebas: condición responsive
  de una precarga, sin retirar fuentes ni cambiar CSS tipográfico.
- Migración nueva de reservas, `worker/stock-reservations.ts`, scheduler,
  pruebas SQL/Worker, tipos generados y textos de checkout acordes con la reserva.
- Instrumentación de pruebas/capturas y este informe. No se añadieron paquetes
  ni se eliminaron recursos audiovisuales o dependencias.

## Límites y decisiones antes del lanzamiento

| Estado | Punto | Acción necesaria |
| --- | --- | --- |
| APROBADO | Funcionalidad probada y versión staging | Presentar la candidata; mantener estas evidencias |
| APROBADO | Reserva atómica de quince minutos | Validada en desarrollo; no equivale a pago confirmado |
| PENDIENTE | LCP <2,5 s en las tres rutas bajo móvil lento frío | No alcanzado; mejora medida sin sacrificar diseño ni calidad |
| PENDIENTE | Margen de memoria y capacidad productiva | Nano no está certificado para concurrencia comercial; dimensionar compute independiente con datos representativos, sin contratar automáticamente |
| PENDIENTE | Fallos de resolución y transporte | Evidencia DNS/QUIC conservada; falta diagnóstico del camino externo, sin atribuir responsables sin telemetría |
| PENDIENTE | Picos upstream de Supabase | Solicitar trazas internas al proveedor con el paquete de evidencia; no son tiempos SQL demostrados |
| BLOQUEANTE para cobros reales | Mercado Pago y liquidación | Integrar webhook auténtico, idempotencia del proveedor y descuento definitivo del stock; no implementados mediante un webhook ficticio |
| PENDIENTE antes de activar pagos | Reintento de un pedido con reserva vencida | Hoy devuelve el pedido pendiente original sin renovar; definir la experiencia y su relación con el estado real del proveedor |
| PENDIENTE antes de activar pagos | Acaparamiento temporal de stock invitado | El límite por IP no impide múltiples intenciones diferentes; definir admisión/reutilización y protección antibot, sin inventar reglas comerciales en este cierre |
| PENDIENTE | Escala del barrido de reservas | Evaluar con EXPLAIN aislado el predicado temporal volátil; no se demostró un cuello de botella que justifique otro índice o migración ahora |
| PENDIENTE externo | Dispositivos físicos, INP de campo y producción | Las resoluciones/CPU/red son emulación de Chrome, no pruebas en teléfonos físicos ni analítica de usuarios reales |

No se certifica «absolutamente todo listo para producción». La intervención
de código, staging y validación queda cerrada con resultados reproducibles;
las limitaciones externas y comerciales se identifican para evitar una falsa
aprobación del lanzamiento.

## Evidencias y capturas

Todo se conserva en `artifacts/final-mission-2026-11-16/`, sin credenciales,
conservando también las ejecuciones fallidas. Archivos principales:

- `public-closure-summary.json`, `public-paired-closure.json`,
  `network-traces/closure-*` y `network-netlog/closure-*`: serie definitiva v3.
- `public-release-summary.json`, `connection-control-summary.json` y
  `cold-cart-summary.json`: series v2 y control de conexión, separadas.
- `dns-closure-comparison.json`, `dns-release-comparison.json`,
  `final-latency-outliers.json` y `readonly-quic-interruption-review.json`:
  red y límites de atribución.
- `final-regressions.json`, `route-fix-authorized-validation.json`,
  `manual-captures-tests.json`, `final-quality.json` y `final-public-api.log`:
  validación funcional; PostgreSQL en
  `artifacts/supabase-sql-tests/run-l7K3c0/result.json`.
- `admin-data-summary.json`, `admin-data-and-controls.json`,
  `admin-staging-validation-admin-validation-fourth.json`: UI y datos separados.
- `r2-final-summary.json`, `r2-isolated-probe.json`, `r2-isolated-worker.json`,
  `final-r2-metadata.json`: archivos sintéticos, correlación y privacidad.
- `final-schema.json`, `closed-development-state.json`,
  `reservation-migration.json`, `types.json`, `verified-final.json`,
  `after-environment.json`: esquema, permisos, recursos y despliegue.
- `visual-screens/2026-11-17T04-31-43-974Z/`: 40 capturas, seis pares y
  estados simulados; `admin-ready-screens/` muestra biblioteca terminada y
  controles de fotos. `admin-local-captures/` contiene los tres escenarios
  optativos locales, identificados como fixtures.
