# Rendimiento integral — Aroma Infini

19 de noviembre de 2026. Alcance: tienda, cuenta, recomendador, panel y servicios
de desarrollo/staging. Se conserva el trabajo previo, el diseño y las reglas
comerciales. No se recibió un archivo de vídeo junto a la solicitud; el análisis
se basa en el proyecto, las trazas y los servicios disponibles.

## Estado de la entrega

Intervención implementada y validada en staging. Hay mejoras demostradas en
lecturas bajo demanda, escalabilidad del recomendador y trabajo de interfaz.
No se demuestra una mejora general del LCP/TBT ni de todas las navegaciones: los
resultados mixtos y las limitaciones permanecen explícitos. Las pruebas aisladas
no se presentan como mediciones de producción.

La candidata final `73bf7acc-315e-4d8d-95d9-97bfb4a41fa5` está activa al 100 % en
staging. Se verificaron 128 archivos JS/CSS/PWA por SHA-256, los bindings y el
acceso directo desactivado de R2. Las pruebas y mediciones posteriores están
completadas sobre la versión ordinaria activa, sin overrides.

La primera candidata `13df27ab-1f3e-4bef-b08a-f53c6dcdefd9` y sus evidencias se
conservan en `phase-one/`; no se mezclan con la validación final.

Desarrollo tiene 49 migraciones, cero pendientes y hashes de historial coincidentes.
La única aplicada en esta intervención fue `20261119000100_finder_projection.sql`;
los fingerprints de datos anteriores y posteriores a esa transacción coinciden.
Los tipos oficiales alojados representan de otra forma las funciones sin argumentos,
los campos calculados y JSON, e incluyen la versión de PostgREST `14.18`. Se conservó
la salida local anterior como evidencia y se sincronizó el archivo generado con
el servicio real, sin editar tipos a mano. TypeScript, lint, Node y build se
repitieron correctamente con esa salida.

## Problemas comprobados y cambios

### Datos privados fuera de su pantalla

El proveedor de cuenta leía perfil, dirección y pedidos al restaurar una sesión
de cliente, incluso en Tienda. Ahora consulta estos tres recursos al entrar en
Cuenta o checkout. El ID activo sigue procediendo de la verificación remota de
Auth. La respuesta se vincula a propietario y visita; una respuesta atrasada no
puede convertirse en datos de otra persona ni en una pantalla de éxito vacía.

Favoritos conserva los IDs necesarios para los corazones y el contador. Las
fichas completas se solicitan al abrir la colección. Con 500 favoritos, la prueba
de aplicación/SDK pasó de cinco lecturas de productos en una página pública a
cero. La lectura privada de los IDs se conserva. Las verificaciones simultáneas
del mismo token/audiencia comparten solamente la petición pendiente: no existe
caché de autorizaciones finalizadas ni se elimina la comprobación posterior.

Archivos: `AccountProvider.tsx`, `FavoritesProvider.tsx`, `account-adapter.ts`,
`customer-favorites-service.ts`. Se reutiliza `verified-auth-user.ts`.

### Recomendador: una proyección coherente, sin descargar fichas completas

Abrir las preguntas utiliza los perfiles/opciones del contexto público del Home,
en lugar de reconstruir todas las fichas. Al enviar las respuestas se realiza una
lectura nueva de `api.catalog_finder_context()`. Esta RPC devuelve únicamente los
datos usados por el algoritmo y sus resultados: producto canónico, variantes,
precios actuales, ofertas, familia, ocasión, intensidad y manifiesto de portada.
No devuelve galerías secundarias, notas ni descripciones largas.

La puntuación, ordenación y desempates siguen en el mismo algoritmo compartido.
No se fabrica una ficha completa a partir de datos parciales. El módulo remoto se
importa al enviar el cuestionario. Los resultados visibles registran únicamente
las fechas futuras de sus ofertas en el reloj existente; una actualización vuelve
a consultar precios sin mover el foco ni ocultar las respuestas ante un error.

La migración aditiva `20261119000100_finder_projection.sql` conserva el ejecutor
sin login/bypass, `search_path` vacío, RLS, marcas activas, disponibilidad y cálculo
canónico de precios. No añade índices, tablas, cachés ni permisos sobre tablas al
navegador. Mantiene el límite de lectura de 10.000 productos.

| Catálogo sintético aislado | Lectura anterior | Proyección compacta |
| --- | ---: | ---: |
| 1.000 productos: peticiones | 10 | 1 |
| 1.000 productos: ejecución SQL | 2.726 ms aprox. | 231 ms aprox. |
| 1.000 productos: JSON | 4.941.991 bytes | 1.295.721 bytes |
| 3.000 productos: peticiones | 30 | 1 |
| 3.000 productos: ejecución SQL | 15.429 ms aprox. | 674 ms aprox. |
| 3.000 productos: JSON | 14.834.823 bytes | 3.892.053 bytes |

Son medianas de cinco pares alternados en PostgreSQL local aislado, con datos
sintéticos confirmados y vacuum previo. Se compararon productos y campos usados
mediante hashes equivalentes. La cifra anterior suma los EXPLAIN de cada página;
no es una medición de red móvil. El staging comercial actual no contiene 3.000
productos y no recibió esa carga de prueba.

Limitación: todavía se transmiten los candidatos necesarios para puntuar en el
navegador. La reducción de aproximadamente 74 % del JSON y de 30 a una lectura no
convierte 10.000 candidatos en una respuesta instantánea sobre 4G. Llevar también
la puntuación al servidor exigiría demostrar equivalencia de normalización,
ordenación y desempates; no se cambia esa arquitectura por intuición.

El primer despliegue también permitió detectar que diferir el módulo remoto
hasta enviar las respuestas añadía una espera evitable. Doce recorridos reales
alternados, con contexto nuevo, compararon ese comportamiento con preparar solo
el módulo al abrir explícitamente el cuestionario: espera de envío mediana de
871,5 → 350,0 ms en escritorio y 1.027,8 → 556,6 ms en móvil lento. Las preguntas
no esperan a esa preparación y todavía no se solicitan candidatos/precios/stock.
La candidata final aplica únicamente esa preparación de código; se repitieron
las 96 pruebas de catálogo y los 17 contratos del recomendador. La prueba de
apertura comprueba que el módulo llega antes y que `catalog_finder_context`
no se llama hasta enviar las respuestas. Los resultados finales alojados se
presentan aparte del experimento.

### Panel: identidad estable de colecciones y coste de selectores

Se memoiza la combinación de páginas de ofertas. Escribir en el formulario ya no
recrea esa colección ni vuelve a armar su temporizador de ofertas. La detección de
IDs repetidos usa un `Set` conservando orden, errores y límites. En diez mediciones
alternadas de combinación de 10.000 opciones, después de excluir calentamiento,
la mediana de CPU pasó de 206,98 a 0,82 ms. Es un microbenchmark de transformación,
no una promesa equivalente sobre el tiempo de navegación alojada.

Se conserva `admin_catalog_context`: aporta familias dinámicas necesarias para
validar ofertas. La consulta de ofertas y ese contexto empiezan en paralelo, pero
el parseo espera al vocabulario y vuelve a comprobar la continuidad del actor.
Una prueba fría con familia personalizada demostró la carrera y su corrección.
No se elimina una consulta requerida para aparentar un ahorro.

Productos, Pedidos, Clientes, Marcas y Familias mantienen su paginación remota.
No se descargan instantáneas completas para navegar. Las páginas visibles ya están
acotadas; añadir virtualización sin un coste medido no aporta una mejora probada.
Se conserva la adaptación móvil y la selección entre páginas de pedidos.

### Animación de marcas

El carrusel solicitaba frames continuamente aunque estuviera fuera de pantalla,
en pausa, con hover, foco o movimiento reducido. Ahora no programa trabajo en
esos estados. Reanuda mediante los eventos existentes y un único temporizador
para la pausa tras interacción. Conserva velocidad, aceleración, arrastre, rueda,
teclado y enlaces. El ensayo determinista del hook pasó de 60 callbacks por segundo
simulado a cero en estados inactivos; no se presenta como una medición física de
una pestaña oculta, que Chrome puede limitar por su cuenta.

## Infraestructura: qué requiere Worker y qué ya es directo

| Operación | Recorrido conservado | Motivo |
| --- | --- | --- |
| Home, catálogo, filtros, ficha, opciones y recomendaciones | Navegador → Supabase RPC con RLS | No necesita un proxy adicional |
| Listados administrativos y cuenta | Navegador → Supabase RPC protegida | Actor, propietario, permisos y MFA según contrato |
| Documento inicial público/SEO | Worker → lecturas públicas paralelas | HTML híbrido y metadatos antes de React |
| Imágenes comerciales | Worker → manifiesto autorizado + caché de bytes/R2 privado | Publicación, integridad y retirada verificables |
| Cargas de medios | Worker → R2 y referencias SQL | Validación completa, autorización y asociación |
| Checkout y reservas | Worker → transacción/RPC | Idempotencia, límites y stock atómico |
| Dispositivos de confianza, push, reclamaciones y tareas programadas | Worker y RPC delimitadas | Cookies protegidas, secretos, entrega y operaciones de backend |

No se abre R2 ni se introduce un dominio directo que evite los manifiestos.
Se conserva la caché segura de bytes, WebP responsive, lazy loading, LoadingImage,
prioridad principal y vídeo exclusivo de escritorio. No se amplía la vigencia de
precios, stock, autorizaciones o información privada.

Treinta lecturas públicas seriales de la versión base, sin vaciar el edge ni
fabricar MISS, dieron para WebP: cabeceras aproximadamente 250 ms, cuerpo 51 ms, cabeceras del
manifiesto 31 ms, upstream Envoy 3 ms y acceso a caché de bytes 6 ms de mediana.
Los 16 WebP fueron HIT. Doce IDs se correlacionaron con logs del Worker: CPU 2,5 ms
y wall 41,5 ms de mediana. No son CPU/tiempos de todos los documentos ni un análisis
interno de Supabase; los intervalos pueden solaparse. El transporte restante no se
atribuye automáticamente a PostgreSQL, al proveedor o al ISP.

## Base de datos y capacidad

EXPLAIN (ANALYZE, BUFFERS) real bajo `anon`, cinco repeticiones por consulta:
Home 9,119 ms, catálogo 9,210 ms y ficha 10,213 ms de mediana. No hubo bloques
temporales ni lecturas físicas en esas muestras calientes. El recorrido SQL
completo por la conexión de auditoría rondó 104 ms: es diferente de la ejecución
SQL y no representa el tiempo de una petición HTTP individual del navegador.

Se observaron seis lecturas de Metrics API durante cinco minutos: CPU media
ocupada 2,70 %, iowait 1,74 %, pool máximo 10, seis conexiones disponibles, cero
esperas y cero timeouts. Había 18 conexiones en la instantánea, sin bloqueos ni
transacciones abandonadas. No se cambia pooler, región ni índices sin evidencia.
El frontend usa PostgREST HTTP; no debe abrir conexiones PostgreSQL/Supavisor.

Existe una señal real de capacidad ajustada: unos 432 MiB de RAM, 143–169 MiB
disponibles, 332–366 MiB de swap ocupada y margen de compromiso virtual de 21–47
MiB. Hubo actividad de swap, pero cero OOM. `Committed_AS` no equivale a RAM física
usada. Las muestras del exportador se repiten y no permiten atribuir un pico HTTP
concreto a memoria. No se demuestra que contratar Pro resuelva el LCP ni se ha
realizado una comparación con compute de pago. Conservar Free para estas pruebas
es razonable; antes de carga comercial sostenida se debe dimensionar con métricas
representativas, backups y objetivos de disponibilidad.

## Método de validación

- Antes/después sobre la versión ordinaria activa de staging, con SHA de recursos
  y bindings comprobados, sin tratar una versión experimental como desplegada.
- Chrome real: tres muestras por Home/Tienda/Producto, escritorio y móvil CPU ×4,
  1,6 Mbps y 150 ms; cada proceso frío seguido de recarga caliente. Frío significa
  caché del navegador, no un MISS forzado de Cloudflare.
- Lighthouse oficial con throttling DevTools: tres muestras por ruta/perfil para
  LCP, CLS y TBT. Los excesos de tareas largas de otra ventana de observación no
  se mezclan con el TBT oficial de Lighthouse.
- Navegación SPA, variantes, filtros, carrito, Contacto y entrada a checkout;
  navegación administrativa y capturas responsive en las resoluciones pedidas.
- Catálogos de 1.000/3.000 y permisos/concurrencia con PostgreSQL aislado; no se
  introducen miles de productos, compras o cobros en los servicios comerciales.
- Sesiones reales y temporales identificadas para administradores/TOTP y clientes,
  con retirada verificada al terminar. Las pruebas con transporte simulado se
  describen como aisladas, separadas de las pruebas alojadas.

No hay INP de campo disponible ni prueba física nueva de teléfonos. Event Timing
de laboratorio, CPU limitada y viewports no se presentan como usuarios reales ni
como validación de dispositivos físicos.

Evidencias: `artifacts/integral-performance-2026-11-19/`, excluidas de Git. La
biblioteca de Lighthouse se instaló solo entre las herramientas temporales de
auditoría; no se añadió a `package.json`, `package-lock.json` ni al bundle.

### Regresiones aisladas

Se completó el plan de 26 configuraciones: contratos de Worker (354 ejecuciones),
suite general (1.358 casos finales y tres capturas opcionales desactivadas),
configuraciones específicas (583 ejecuciones) y 215 comprobaciones Node. Hay
solapamientos entre suites; no son 2.510 casos únicos. Además, SQL nativo aprobó
1.128 comprobaciones con 49 migraciones, incluidos concurrencia y permisos.

Dos pruebas nuevas requirieron corregir su preparación o expectativa. La del
carrusel recargaba la página y perdía su regla de scroll de prueba: el puntero
salía del componente mientras seguía el desplazamiento suave. Se restauró esa
preparación y aprobaron sus siete casos con las mismas exigencias de pausa. La
de duplicados esperaba un error interno que el panel sanitiza intencionalmente:
ahora verifica el mensaje protegido existente, ambas páginas recibidas, ninguna
opción parcial publicada y el guardado bloqueado. Se repitió completa la suite
de catálogo: 96 aprobadas. No se aumentaron timeouts/reintentos ni se alteró la
aplicación para ocultar esos fallos. Los primeros logs y las repeticiones se
conservan separados.


## Comparación final alojada

Medianas de tres muestras por condición. Para cantidades pares se promedian los
dos valores centrales. Los JSON conservan mínimos, máximos, solicitudes y trazas,
no solo las medianas favorables. Estas cargas públicas usan un producto comercial
existente; no equivalen al ensayo sintético de 3.000 productos.

### Carga inicial ordinaria de Chrome

| Perfil / ruta | LCP frío antes → después (ms) | LCP caliente antes → después (ms) |
| --- | --- | --- |
| Escritorio / Home | 1,444 → 1,224 | 388 → 352 |
| Escritorio / Tienda | 1,084 → 1,232 | 640 → 364 |
| Escritorio / Producto | 1,084 → 1,088 | 408 → 364 |
| Móvil lento / Home | 2,248 → 2,324 | 596 → 524 |
| Móvil lento / Tienda | 2,596 → 2,660 | 548 → 648 |
| Móvil lento / Producto | 2,332 → 2,348 | 632 → 720 |

La serie no demuestra una mejora general de carga fría: Home escritorio mejora,
Tienda escritorio empeora y el móvil frío queda prácticamente en el mismo rango,
con variaciones de 16–76 ms de mediana. En caliente también hay resultados mixtos.
Las optimizaciones de esta entrega no sustituyen el arranque híbrido anterior ni
reducen arbitrariamente fotografías/animaciones para cambiar estas cifras.

El CLS medido permanece por debajo de 0,001 en las cargas iniciales. No hubo
fotografías rotas, errores JavaScript ni desbordamientos sostenidos en esos 36
casos. Las 18 cargas móviles no montaron vídeos ni solicitaron MP4/WebM.

| Móvil frío / ruta | Peticiones antes → después | Transferencia total antes → después (KiB) | Heap JS antes → después (MiB) |
| --- | --- | --- | --- |
| Home | 26 → 26 | 480 → 481 | 6.51 → 6.50 |
| Tienda | 16 → 16 | 441 → 441 | 6.93 → 6.92 |
| Producto | 17 → 17 | 572 → 573 | 7.09 → 7.08 |

No se presenta la pequeña variación de transferencia o heap como una reducción
demostrada de bundle ni como una prueba de ausencia de fugas. No se incorporaron
dependencias de aplicación. Se mantienen las rutas lazy y la separación del
almacén administrativo, verificada por las pruebas de catálogo.

### Lighthouse y bloqueo de JavaScript

| Perfil / ruta | LCP oficial antes → después (ms) | TBT oficial antes → después (ms) |
| --- | --- | --- |
| Escritorio / Home | 1,300 → 1,319 | 0 → 0 |
| Escritorio / Tienda | 1,179 → 1,014 | 0 → 0 |
| Escritorio / Producto | 1,168 → 1,260 | 0 → 0 |
| Móvil lento / Home | 2,290 → 2,308 | 138 → 260 |
| Móvil lento / Tienda | 2,610 → 2,787 | 97 → 170 |
| Móvil lento / Producto | 2,414 → 2,399 | 86 → 166 |

El TBT de la serie de tarde es mayor que el inicial de la mañana. Se investigó
alternando paquetes inmutables de la base y de la candidata, con Chrome nuevo,
CPU ×4 y la misma ventana temporal. Sus entradas JS se comprobaron antes de medir.

| Ruta / comparación controlada | TBT base (ms) | TBT candidata (ms) | Rangos base / candidata (ms) |
| --- | --- | --- | --- |
| Tienda | 158 | 164 | 149–188 / 161–170 |
| Producto | 159 | 158 | 146–163 / 140–171 |
| Home | 245 | 263 | 245–270 / 240–267 |

Tienda/Producto corresponden a la primera candidata; Home compara la base con
la candidata final. Ambas candidatas solo se diferencian por la preparación de
código al abrir el cuestionario, que no se ejecuta en una carga sin interacción.
Los rangos se solapan; no se demuestra que el aumento entre ventanas se deba al
nuevo código, ni una mejora de TBT. Estas pruebas usan hostnames de vista previa
distintos: sirven para diagnosticar CPU, pero su LCP/red no sustituye a las
mediciones ordinarias de staging. El intento inicial por encabezado de override
se descartó porque no seleccionaba paquetes distintos.

INP de campo no disponible. El observador Event Timing de los recorridos no
registró entradas utilizables por encima de su umbral de 16 ms. No se inventa
un INP cero ni un percentil de clientes a partir de esa ausencia de muestras.

### Navegación SPA y administrativa

| Perfil / destino | Datos disponibles antes → después (ms) |
| --- | --- |
| Escritorio / Home | 144 → 160 |
| Escritorio / Tienda | 148 → 159 |
| Escritorio / Producto | 160 → 146 |
| Escritorio / Checkout | 141 → 184 |
| Móvil 4G / Home | 225 → 260 |
| Móvil 4G / Tienda | 205 → 228 |
| Móvil 4G / Producto | 215 → 225 |
| Móvil 4G / Checkout | 225 → 249 |
| Móvil lento / Home | 230 → 253 |
| Móvil lento / Tienda | 247 → 270 |
| Móvil lento / Producto | 244 → 238 |
| Móvil lento / Checkout | 231 → 255 |

Son nueve recorridos medidos por versión, además de nueve calentamientos
excluidos, con diez acciones por recorrido. Se conservó el mismo documento;
filtros, variantes, carrito, Contacto y checkout siguieron operativos. Los tiempos
incluyen disponibilidad de datos y no solamente el cambio del título. No se
crearon pedidos ni se confirmaron pagos.

| Sección | Escritorio antes → después (ms) | Móvil limitado antes → después (ms) |
| --- | --- | --- |
| /admin/productos | 219 → 230 | 396 → 456 |
| /admin/pedidos | 220 → 228 | 414 → 424 |
| /admin/clientes | 221 → 235 | 385 → 411 |
| /admin/promociones | 221 → 221 | 336 → 353 |
| /admin/promociones?vista=ofertas | 203 → 220 | 254 → 287 |
| /admin/envios | 223 → 220 | 349 → 373 |
| /admin | 237 → 220 | 348 → 396 |

La navegación general del panel no muestra una mejora global: las diferencias
pequeñas y algunas subidas de decenas de milisegundos siguen en la tabla. Se
conservan lecturas actuales y sus comprobaciones de actor/MFA; no se ahorran
artificialmente con autorizaciones cacheadas. Las consultas de Productos,
Pedidos y Clientes permanecen paginadas; sus caminos de negocio no se alteraron.
La mejora demostrada en Ofertas es estabilidad de colecciones/temporizador y
coste de combinación de opciones, no una promesa de reducir cada viaje de red.

### Recomendador real: apertura y confirmación separadas

| Perfil | Abrir preguntas antes → después (ms) | Enviar respuestas antes → después (ms) |
| --- | --- | --- |
| Escritorio | 355 → 43 | 26 → 235 |
| Móvil 4G | 343 → 160 | 58 → 274 |
| Móvil lento | 448 → 160 | 62 → 406 |

Abrir las preguntas se vuelve claramente más rápido. Antes la confirmación podía
reutilizar la instantánea recién descargada al abrir; ahora hace una consulta
actual en un único snapshot SQL. Por ello no se comparan los 26–62 ms anteriores,
sin petición al enviar, como si fueran una cotización remota equivalente. La
respuesta final incorpora disponibilidad y ofertas actuales. El primer envío
frío aún varía: en la serie final alcanzó 1.348 ms en escritorio y 895 ms en móvil
lento; las repeticiones posteriores fueron más rápidas. No se declara eliminado
ese recorrido frío por preparar únicamente el módulo.

Una repetición diagnóstica adicional conservó tiempos HTTP e IDs. Ejemplo:
`01a1f59b-4e9b-7849-b42b-b7c666a82d6d`, CF-Ray
`a5d22350ed4756ac-LIM`: cabeceras 152 ms, cuerpo aproximadamente 341 ms,
Envoy upstream declarado 15 ms. Una consulta posterior de la misma operación
registró cabeceras 142 ms, cuerpo 1,4 ms y upstream 13 ms. Esto demuestra variación
fuera del tiempo upstream declarado; no demuestra una causa concreta de DNS,
TLS, pool o PostgreSQL. El POST ya reutilizaba conexión; el coste previo de SDK,
preflight y la etapa de transporte no queda completamente descompuesto por esa
telemetría. Evidencia: `finder-after-diagnostic.json`.

### SQL y multimedia finales

| Consulta | Ejecución SQL antes → después (ms) | Recorrido SQL de auditoría antes → después (ms) |
| --- | --- | --- |
| home | 9.119 → 9.117 | 103.7 → 99.5 |
| browse | 9.210 → 9.025 | 104.1 → 99.4 |
| product | 10.213 → 10.013 | 105.0 → 100.6 |
| finder | no existía → 2.614 | no existía → 92.9 |

La RPC nueva tarda 2,614 ms de mediana en el pequeño catálogo alojado. El resto
de consultas públicas conserva tiempos SQL similares a la base. El recorrido
de auditoría SQL y el HTTP del navegador usan rutas/protocolos distintos: no se
restan para atribuir causalmente una demora específica.

| WebP / Worker | Antes | Después |
| --- | --- | --- |
| Cabeceras HTTP WebP (ms) | 250 | 231 |
| Cuerpo HTTP WebP (ms) | 51 | 46 |
| Cabeceras del manifiesto (ms) | 31 | 27 |
| Envoy upstream declarado (ms) | 3 | 2 |
| Caché de bytes (ms) | 6 | 6 |
| CPU Worker correlacionada (ms) | 2.50 | 2.00 |
| Wall Worker correlacionada (ms) | 41.50 | 36.00 |
| WebP con HIT | 16/16 | 16/16 |

Son treinta lecturas seriales antes y treinta después; se correlacionaron 12 y
19 IDs respectivamente. Las muestras de CPU/wall pertenecen a eventos con logs
correlacionados, principalmente multimedia, no a todos los documentos. Ambas
series WebP fueron HIT de bytes. La variación no se vende como una nueva mejora
del Worker: su lógica y la política privada de R2 se conservaron. Sin un MISS
observado no hay una comparación nueva de lectura física fría de R2.

Durante la primera candidata reapareció una resolución DNS de 1.028 ms antes de
QUIC: CF-Ray `a5d1e4c3e9817b75-GIG`, upstream de catálogo declarado 33 ms.
La URL y los IDs exactos permanecen en `phase-one/outlier-inspection.json`.
No se modificó DNS/HTTP3 ni se asigna el problema al ISP o al proveedor sin NetLog
interno correlacionable. Que no reaparezca en las tres muestras finales de ficha
no demuestra su eliminación.

## Pruebas alojadas y revisión visual final

- **APROBADO:** dos clientes temporales navegando concurrentemente, cada uno con
  su UUID/perfil real. En Tienda se verificó el cambio de tres lecturas de cuenta
  y una ficha de favorito a cero; los IDs/corazones siguen disponibles. Entrar a
  Cuenta ejecuta sus tres lecturas. Se probaron pestaña nueva, cierre de sesión
  entre pestañas y convivencia con una sesión administrativa separada.
- **APROBADO:** un administrador real con TOTP/AAL2 fue rechazado como cliente
  por las RPC; la membresía revocada fue rechazada inmediatamente. Todas las
  identidades de estas pruebas se retiraron tras comprobar sus marcadores.
- **APROBADO:** 24 vistas de Home, Tienda, Producto y Contacto a 360, 390, 430,
  768, 1024 y 1440 px, con imágenes decodificadas y sin vídeo en anchuras móviles.
- **APROBADO:** Datos → Entrega → Revisión → volver a Entrega y Datos en las seis
  anchuras, conservando campos, cotización y controles. Se comprobó que existen
  botones para retroceder. Cero comandos de creación de pedido confirmados.
- **APROBADO:** 136 vistas de 17 rutas administrativas, en ocho resoluciones
  (las seis pedidas más 1366 y 1920). Selección de página de Pedidos y apertura/
  cancelación de confirmaciones masivas en cinco anchuras, pestañas de Home,
  menús, formularios y quince vistas anónimas de acceso. Cero errores HTTP/JS.
- **APROBADO:** TypeScript, lint, 215 Node, build, sellado y dry-run; plan de 26
  configuraciones aisladas, 1.128 comprobaciones SQL y 56 comprobaciones HTTP
  reales de acceso. Tras el último ajuste se repitieron catálogo completo y los
  17 contratos del recomendador. Las tres capturas opcionales de la suite amplia
  no se presentan como ejecutadas: están suplidas por el barrido alojado explícito.

La importación Excel, los errores de escrituras, ofertas y selectores con miles
de registros se validaron con aplicación/SDK y PostgreSQL aislados. La revisión
alojada abrió sus interfaces y comprobó permisos/datos reales, sin convertir esos
ensayos en escrituras masivas sobre el catálogo comercial.

Una captura inicial del editor a 360 px registró 382 px de ancho durante resize.
Se reprodujo en 12 secuencias con 120 mediciones: el ancho se corrige sin cambiar
estilos al tercer frame. Dos experimentos con 150 mediciones cada uno descartaron
contención de tamaño, layout y pintura porque no eliminaban el pico. No se
introdujo CSS sin beneficio ni overflow oculto global. La captura final espera
`document.fonts.ready` y tres frames tras redimensionar, manteniendo la misma
aserción de ancho. Las 136 vistas finales aprobaron. **PENDIENTE:** no se ha
eliminado ni demostrado la causa interna del pico transitorio del motor/navegador;
no se presenta como una reparación de CSS. Se conservan todos los fallos y los
experimentos, separados del barrido final.

La inspección visual manual revisó Pedidos y Crear producto a 390 px, Hero móvil
y checkout en Revisión. La barra de secciones del editor conserva su scroll
interno; el contenido no se elimina para que quepa. Se conservan los estados
sticky y las proporciones aprobadas.

Capturas de ejemplo:

- [Home móvil](../artifacts/integral-performance-2026-11-19/screens/after-slowMobile-home-cold.png).
- [Pedidos móvil](../artifacts/integral-performance-2026-11-19/final/orders-390-viewport.png).
- [Editor móvil](../artifacts/integral-performance-2026-11-19/final/product-new-390-viewport.png).
- [Revisión de checkout móvil](../artifacts/integral-performance-2026-11-19/checkout-after/revision-390.png).

## Despliegue, integridad y límites de cierre

| Comprobación | Resultado |
| --- | --- |
| Worker staging | `aroma-infini-frontend-staging` |
| Versión final activa 100 % | `73bf7acc-315e-4d8d-95d9-97bfb4a41fa5` |
| Despliegue | `fe072fd4-f620-47ed-ad18-20b29117a0d5` |
| Entrada JS | `assets/index-DVFwjbFt.js` |
| SHA-256 entrada JS | `1111fe2d27a21dfb964b17b4c8414063268137de1bcf4370f654f83ad5525b29` |
| SHA-256 paquete sellado | `206899e79a03a5b5dfacb99c08981cb385ec1779c7e35ea006b676c398dc5fd0` |
| ETag Worker | `b453f32b148a9267016524aa54060c212e31ab3ec20c8df41159a10e8e52eb5f` |
| SHA-256 configuración | `3de706eeb412b5e34f4d513d8c7628182e55c8d914c87aa3711327666a846249` |
| SHA-256 tipos remotos | `021857a7c45356d3764d86c8302cdaf5c7fd06d3e6952f6d180d85015ccae891` |
| JS/CSS/PWA cotejados local ↔ HTTPS | 128 archivos |
| Supabase desarrollo | 49 migraciones, cero pendientes, hashes coincidentes |
| R2 | Privado; r2.dev y dominio directo desactivados |
| Producción | Versión `ec8554f6-d47a-4af0-ba60-4623c8125020`, despliegue `9baa7c50-262a-4f23-bf52-5742a52ffa0b`, sin cambios |
| Git | `develop`, HEAD `7b76fedf125b9d61e17ee26958e0c7646544e821` |
| Trabajo previo | 125 rutas con cambios previos conservadas |

No hubo commit, push, reset, borrado de archivos comerciales ni migración de
producción. `package.json`, lockfile y configuración Wrangler no cambiaron.
Los archivos de credenciales y los artefactos generados no están rastreados.
`git diff --check` aprobó. Las optimizaciones están listas en staging; llevarlas
a producción requiere autorización y la migración correspondiente allí.

**PENDIENTE, sin afirmar resolución:** carga fría móvil, TBT y variación de
latencia HTTP/DNS; la medición de campo de INP y teléfonos físicos; capacidad
con carga comercial sostenida; selector nativo con miles de opciones y el límite
de candidatos del recomendador. Se redujo su coste demostrado, no se declara
escalabilidad ilimitada. No existe evidencia para una nueva caché de permisos,
cambiar de región/pool, hacer público R2 o recomendar un upgrade como solución
al LCP. La arquitectura híbrida actual se conserva.

Evidencias principales: `comparison-final.json`, `runtime-verified.json`,
`schema-final.json`, `migration.json`, `functional-final.json`,
`isolated-all.log`, `isolated-remainder.json`, `refinement-tests.json`,
`supabase-diagnostics/*`, `traces/*`, `lighthouse/*`, capturas y
`preservation-final.json`, bajo `artifacts/integral-performance-2026-11-19/`.

Referencias oficiales utilizadas: [Core Web Vitals](https://web.dev/articles/vitals),
[DevTools Performance](https://developer.chrome.com/docs/devtools/performance),
[métricas de Supabase](https://supabase.com/docs/guides/platform/metrics),
[R2 desde Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
y [versiones de Workers](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/).
