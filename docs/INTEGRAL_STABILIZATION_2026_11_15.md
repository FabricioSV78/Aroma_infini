# Estabilización y rendimiento integral — 15 de noviembre de 2026

**Cierre de staging verificado el 16 de noviembre de 2026.** Las mejoras y las
pruebas bajo nuestro control quedaron completadas. Producción permanece intacta.
El perfil móvil lento frío todavía supera 2,5 segundos de LCP; no se certifica
INP de campo ni compra real con reserva/cobro de inventario. Los límites y sus
acciones concretas figuran al final.

Evidencia reproducible: `artifacts/integral-stabilization-2026-11-15/`.
Las horas de los registros están en UTC; la intervención comenzó el 15 de
noviembre en Lima. No se modificó producción ni se realizaron compras reales.

## Alcance y conservación

Se continuó el trabajo de los informes anteriores, conservando paginación remota,
consultas específicas, comprobación paralela de Auth y SQL, caché de bytes WebP,
galería, imágenes responsive, ausencia de vídeo móvil y vistas previas diferidas.
No se modificaron estilos, componentes visuales, tipografías, imágenes, precios,
stock, reglas de descuentos, RLS ni migraciones. No se añadieron dependencias.

El punto inicial fue `develop`, HEAD
`7d2f3648e3b149023910a385bf9510f0ebf60d10`, con 174 entradas de trabajo y 1.288
archivos inventariados con SHA-256. No se hizo commit, push, reset, restauración
de archivos ni limpieza destructiva. `initial.json` conserva ese inventario.

## Cambios implementados y fundamento

### SDK de Supabase fuera del arranque bloqueante público

El SDK completo formaba parte de `startup-common`, aunque el contenido público
inicial ya dispone de sus datos verificados en el documento. Se mantuvo el mismo
SDK y su configuración, pero su inicialización ahora es una única promesa de
importación dinámica. Las operaciones que lo necesitan esperan esa promesa;
un fallo de carga no concede acceso ni convierte un usuario desconocido en
administrador. Auth sigue iniciándose; no se agregó una espera artificial.

La comprobación de sesión, el almacenamiento existente, los controles de cambios
de identidad, el timeout de solicitudes y el MFA no fueron sustituidos. Se
adaptaron los consumidores públicos que pueden ejecutar RPC antes de que termine
la inicialización. Un guard del build impide reintroducir el SDK en el grafo
estático del arranque.

Medición de los **archivos realmente servidos**, no estimaciones del build:

| Recurso | Base | Candidata |
| --- | ---: | ---: |
| `startup-common`, bytes descomprimidos | 478.909 | 264.832 |
| `startup-common`, bytes comprimidos observados | 131.478 | 75.677 |
| `react-vendor`, bytes descomprimidos | 284.542 | 284.542 |

Se retiran 214.077 bytes del módulo bloqueante; el SDK se sigue descargando en
otro módulo. **No es una reducción equivalente de transferencia total**: se añade
una solicitud JS y la transferencia total observada es prácticamente igual.
La mejora proviene del orden de descarga y ejecución, no de eliminar funciones.

### Corrección de la regresión administrativa del primer experimento

La primera candidata (`423a28e2-4132-41a6-9401-1ba8318e80f8`) mejoró la carga
pública, pero empeoró la recarga administrativa caliente: la mediana móvil pasó
de unos 710 a 1.147 ms. Se conservan sus datos en `candidate-v1-evidence/`; no se
utilizan como resultados de la versión definitiva.

Se corrigieron dos causas concretas:

- En rutas de acceso, cuenta y administración, el HTML descubre anticipadamente
  el módulo real del SDK. El Worker elimina esa indicación del resto de rutas.
  No se precarga en Home, Tienda, Producto, Contacto ni checkout.
- Varias comprobaciones concurrentes pedían `current_actor` con el mismo token.
  Ahora comparten únicamente la petición pendiente de esa credencial y revisión
  de sesión. Al resolverse se elimina; un evento de Auth/storage o una elevación
  de dispositivo de confianza invalida la coordinación. Cada consumidor conserva
  sus comprobaciones de identidad, rol y MFA. No existe caché de decisiones de
  autorización completadas ni intercambio entre usuarios.

Una primera implementación de coordinación solo por token falló una prueba de
supersesión de eventos de Auth. **No se desplegó**. La revisión por sesión corrigió
la condición; la suite final de Auth aprobó 85 casos. Esto se registra como fallo
encontrado y corregido, no como prueba omitida.

## Comparación real de navegador

Base: `c2ca5aa0-921c-489b-91e4-482f6cf9f3db`.
Candidata: `d6ffdc13-dae9-41ac-ac63-31117ec6048b`.

Chrome real contra el mismo staging, comparaciones secuenciales AB/BA con
selección de versión en ambos brazos. Sin builds, suites pesadas ni cambios de
código simultáneos. Mismo equipo e ISP. Escritorio 1440 × 900; móvil 390 × 844
con CPU ×4; perfiles de 9 Mbps/80 ms y 1,6 Mbps/150 ms, subida de 750 kbps.
La caché fría es la del navegador: no significa MISS de Cloudflare ni que el
resolver del sistema esté frío. No equivale a teléfonos físicos o tráfico real.

### Tienda pública

180 visitas: tres páginas × tres perfiles × dos versiones × dos estados de caché
× cinco muestras. Nuevos procesos de Chrome por par frío/caliente. Se conservaron
NetLog, tiempos de red, CF-Ray y 18 trazas de la muestra inicial de cada celda.

| Móvil lento, frío; mediana | Base | Candidata |
| --- | ---: | ---: |
| Home, LCP | 3.440 ms | 3.112 ms |
| Tienda, LCP | 4.132 ms | 2.884 ms |
| Producto, LCP | 3.372 ms | 3.176 ms |
| Home, LCP menos TTFB | 3.186 ms | 2.813 ms |
| Tienda, LCP menos TTFB | 2.868 ms | 2.573 ms |
| Producto, LCP menos TTFB | 3.068 ms | 2.799 ms |
| Home, bloqueo de tareas largas | 99 ms | 79 ms |
| Tienda, bloqueo de tareas largas | 127 ms | 108 ms |
| Producto, bloqueo de tareas largas | 104 ms | 82 ms |

La caída bruta de Tienda incluye diferencias de TTFB/DNS entre muestras; no se
atribuye toda al cambio. La comparación después de cabeceras y las trazas
permiten separar ese efecto. El bloqueo es la suma de `duración − 50 ms` de las
tareas largas observadas: **no es INP de campo ni un resultado Lighthouse TBT**.

En móvil de 9 Mbps las medianas frías fueron Home 1.504 → 1.444 ms, Tienda
1.368 → 1.324 ms y Producto 1.436 → 1.388 ms. En escritorio Tienda pasó de
724 a 756 ms; no se oculta esa variación ni se declara una mejora universal.
Los datos completos, incluidos p75 y extremos, están en `public-summary.json`.
Con cinco muestras, el p95 empírico es el máximo; no describe la cola de producción.

Las 180 visitas no registraron errores JS, fotografías fallidas ni desbordamiento.
No hubo elementos de vídeo ni peticiones de vídeo en móvil. El CLS observado fue
0. El consumo total de CPU JS y el heap **no disminuyeron sistemáticamente**;
la ejecución se redistribuyó y algunas capturas de heap aumentaron. No se presenta
la reducción del módulo inicial como reducción de todo el trabajo de la página.
En Home lento quedaron cinco solicitudes secundarias pendientes al terminar la
ventana de observación; sus bytes no se contabilizan como página completa.

El objetivo de LCP ≤2,5 s **no se alcanzó en el perfil móvil lento frío**. Los
datos de laboratorio y las mejoras del arranque no son una certificación de
Core Web Vitals de usuarios reales. No se dispone de INP de campo.

### Navegación administrativa y recarga

96 cargas de documento y 72 navegaciones SPA contemporáneas de Productos,
Pedidos, Clientes y Resumen. Las dos versiones utilizan la misma cuenta QA,
MFA AAL2, transporte y datos; se retiró la identidad al terminar.

| Mediana | Base | Candidata |
| --- | ---: | ---: |
| SPA escritorio | 159 ms | 150 ms |
| SPA móvil | 258 ms | 250 ms |
| SPA móvil lento | 291 ms | 293 ms |
| Documento caliente escritorio | 476 ms | 483 ms |
| Documento caliente móvil | 767 ms | 781 ms |
| Documento caliente móvil lento | 1.279 ms | 1.246 ms |

Se conserva la fluidez SPA sin descargar colecciones completas ni reutilizar
resultados privados caducados. En cada brazo, las 45 consultas medidas se
solaparon con Auth y con `current_actor`; las comprobaciones de permisos siguen
siendo obligatorias antes de conceder acceso. Las 48 recargas calientes no
transfirieron otra vez sus archivos JS/CSS.

La primera serie fría de escritorio mostró 1.260 → 1.913 ms y motivó una prueba
diagnóstica adicional, en lugar de ocultar la regresión. En 48 documentos nuevos,
12 muestras frías por brazo entre Productos, Pedidos y Clientes, la mediana fue
1.435 → 1.385 ms; después de cabeceras, 1.260 → 1.175 ms. Se conservaron las dos
series: la variación inicial no se reprodujo como regresión sostenida.

Una ejecución anterior se interrumpió tras 76 visitas por un timeout en Pedidos
móvil lento. Conservó datos y retiró su cuenta QA. El colector no capturó el
detalle de red antes de cerrar ese contexto; se corrigió esa limitación del
colector. La repetición completa aprobó sin subir límites ni reintentos. La
causa del timeout original **no está demostrada** y no se atribuye a Supabase.

La auditoría de los otros destinos hizo 126 navegaciones por versión, con tres
repeticiones por perfil y 14 destinos: Productos, Pedidos, Clientes, Cupones,
Ofertas, Marcas, Familias, Envíos, Home, Biblioteca, Configuración, Notificaciones,
Reclamaciones y Resumen. Se verificó el elemento propio de cada destino, no un
encabezado compartido; se distinguió la apertura de interfaz de los datos que
cargan después. No hubo errores observados ni peticiones administrativas fallidas.
Esta serie fue secuencial por versión; la de cuatro destinos AB/BA es la
comparativa principal, con mejor control temporal.

En móvil lento, la mediana de disponibilidad de datos fue Productos 328 → 320 ms,
Pedidos 309 → 309 ms, Clientes 319 → 302 ms, Cupones 292 → 290 ms, Ofertas
307 → 323 ms, Envíos 302 → 303 ms y Home 354 → 352 ms. Biblioteca pasó de
453 a 491 ms y Notificaciones de 229 a 260 ms; son variaciones de tres muestras,
no mejoras. Los 42 pares de resúmenes y sus latencias están en
`admin-all-modules-summary.json`. Se mantiene visible qué módulos necesitan una
lectura adicional después de abrir la interfaz.

## Pruebas alojadas de funcionamiento y seguridad

Además de las mediciones:

| Comprobación real en staging | Resultado |
| --- | --- |
| Navegación táctil, anchos 320/360/390/412/430 px | 20 cambios de destino aprobados |
| MFA AAL1 rechazado y AAL2 autorizado con la cuenta QA | Aprobado |
| Excel: archivo leído, conflictos y vista previa; no confirmado | Aprobado en 1440/768/390 px |
| Oferta: producto y precios por presentación; cancelación sin guardar | Aprobado en 1440/768/390 px |
| Selectores de marca/familias y edición sin guardar | Aprobado en 1440/768/390 px |
| Preguntas del recomendador administrativo | Aprobado en 1440/768/390 px |
| Compra pública hasta abrir checkout, favoritos, búsqueda, filtros y variantes | 16 recorridos en ocho tamaños; sin enviar pedidos |
| Caché de imagen, HEAD, ETag/304, rutas privadas, variante inválida y carga anónima | Nueve comprobaciones aprobadas |

Cada prueba con una identidad administrativa temporal comprobó su retirada y la
ausencia de su membresía al terminar. Las pruebas de módulos verificaron además
que las membresías existentes y diez tablas comerciales no cambiaran. Los
archivos `admin-touch.json`, `admin-modules-readonly.json`, `functional-final.json`
y `security-hosted.json` distinguen las lecturas realizadas de las escrituras
que deliberadamente no se ejecutaron contra datos comerciales.

R2 permanece privado y su URL `r2.dev` responde 401. Una variante inexistente o
una ruta del prefijo interno de caché responde 404; la carga sin sesión responde
401. Los dos GET HIT de una misma imagen tuvieron request ID y upstream ID
distintos: la caché reutiliza bytes después de una comprobación actual del
manifiesto, sin conservar decisiones de publicación. La respuesta condicional
también conservó esa comprobación.

No se introdujo otro intermediario. Auth y las consultas autorizadas del panel
siguen usando Supabase; la entrega y validación multimedia siguen en el Worker
con R2 privado. Una entrega directa exigiría un dominio multimedia, un almacén
separado de publicaciones y un protocolo de publicación/revocación coherente.
No se dispone de una prueba de ese dominio y no se declara más rápida por
intuición. El diseño y los límites permanecen en el expediente anterior.

Las capturas comparativas están en `network-screens/`, y las de formularios y
administración en `screens/`. Se revisaron visualmente Home móvil, Tienda de
escritorio y móvil, Producto móvil y Productos administrativos. Seis de los
nueve pares PNG de la primera muestra fría resultaron idénticos byte por byte;
los restantes se conservan para inspección, sin exigir igualdad de una animación
capturada en momentos distintos. No se editaron componentes visuales ni CSS.

## Validaciones finales

| Validación | Resultado final | Evidencia |
| --- | --- | --- |
| TypeScript | Aprobado | `quality.json`, `typecheck.log` |
| ESLint | Aprobado, cero advertencias | `quality.json`, `lint.log` |
| Contratos Node | 200 aprobados | `node.log` |
| Build optimizado de staging y paquete inmutable | Aprobado | `candidate-v2-build.json`, `packages/candidate-v2/` |
| Comprobación final de paquete/bindings y Wrangler dry-run | Aprobado | `final-check.json` |
| 26 configuraciones de Playwright, último resultado válido de cada una | 2.296 ejecuciones aprobadas; 1.826 casos fuente distintos; cero fallos y cero flaky | `result.json` y reportes referenciados |
| Suite local completa final | 1.428 aprobadas de 1.431; tres capturas manuales históricas sin activar | `repair-reports/repairs-legacy-final.json` |
| Auth, dispositivos y carreras de sesión | 85 aprobadas | `full-reports/supabase.json` |
| Catálogo remoto completo, ejecutado sin builds/ediciones simultáneos | 91 aprobadas | `full-reports/catalog.json` |
| Configuración / Reclamaciones / limpieza de interfaces | 53 / 25 / 15 aprobadas | `repair-reports/repairs-*.json` |
| PostgreSQL 17.10 nativo y aislado | 994 comprobaciones, 42 migraciones, datos de pruebas retirados | `sql-final.json` |
| Restauración física de PostgreSQL local | Nueve comprobaciones aprobadas | `sql-final.json`, sección `recovery` |
| Supabase de desarrollo | 42 migraciones, cero pendientes, esquema y datos `app/private` sin cambios | `after-remote.json`, `remote-data-comparison.json` |
| Tipos TypeScript frente al generador oficial remoto | Coincidencia exacta | `closure-types.json` |
| JS/CSS realmente servidos | 127 archivos con bytes y SHA-256 coincidentes | `verified-final.json` |
| Worker realmente servido | Descargado y hasheado con procedencia de versión activa | `verified-final.json`, `workerContent` |
| R2 | Acceso administrado desactivado, cero dominios personalizados, objeto conocido directo 401 | `r2-private-configuration.json` |
| Preservación | 1.288 archivos iniciales conservados, cero ausentes; mismo HEAD y rama | `preservation-final.json` |
| Producción | Mismo despliegue y huella observados al inicio; ninguna escritura ejecutada | `after-environment.json` |

Los 2.296 son ejecuciones entre configuraciones, algunas con contratos repetidos;
**no son 2.296 pruebas únicas**. Las tres omisiones son exclusivamente las tareas
históricas de `admin-audit-capture.spec.ts`, activables con `ADMIN_AUDIT_STAGE`;
no se contabilizan como aprobadas. Las capturas nuevas y comprobaciones alojadas
de esta intervención están descritas en su sección propia. GitHub Actions no se
ha vuelto a ejecutar: no se hizo commit ni push. Esta validación usa Chrome y
Node locales en Windows, además de los servicios alojados indicados.

### Fallos encontrados durante la validación y correcciones

Se conserva la primera ejecución de las 26 configuraciones: 22 aprobadas y
cuatro con 38 casos fallidos. No se borraron sus reportes. Se corrigieron:

- **Hidratación local:** el observador de IndexedDB del test podía abrir por su
  cuenta una base vacía antes de que la aplicación creara su almacén. Ahora
  espera la hidratación inicial. No espera escrituras posteriores: algunos casos
  las rechazan o retienen deliberadamente para verificar el último dato guardado.
  Dos iteraciones del propio observador detectaron ese requisito; ambas se
  conservaron y se corrigieron sin alterar la persistencia de la aplicación.
- **Reseñas diferidas:** una prueba esperaba reseñas antes de abrirlas. Ahora
  confirma su ausencia inicial, abre el panel y verifica las tres reseñas y la
  compra. Se conserva la optimización.
- **Vídeo móvil:** una prueba intentaba preparar vídeo desde 390 px y esperaba
  reproducción móvil. Ahora verifica el rechazo previsto, prepara desde
  escritorio y confirma que volver a móvil retira el reproductor y conserva
  la imagen. No se permitió vídeo móvil para conseguir un test verde.
- **Medición responsive:** un auditor medía ocasionalmente el contenedor de carga.
  Ahora espera el encabezado real y la retirada del skeleton antes de medir.
- **Espaciados:** un único caso recorría 13 documentos dentro de 30 segundos.
  Se dividió por ruta, manteniendo todas las comprobaciones y el límite original.
- **Fixtures de RPC:** Configuración y Reclamaciones tenían listas que rechazaban
  las RPC paginadas antes de llegar a respuestas ya implementadas en sus fixtures.
  Limpieza de interfaces no incluía los nuevos contratos de contexto y selectores.
  Se incorporaron esos nombres y respuestas canónicas; no hay un comodín que
  convierta peticiones desconocidas en éxito ni se amplió la autorización.
- **Filtros:** se conservó el fallo original de recarga inesperada. Se añadió
  diagnóstico CDP del motivo de navegación y de mensajes de recarga de Vite.
  Las 21 repeticiones dirigidas y la ejecución completa final aprobaron. No se
  afirma conocer retroactivamente la causa del evento original.

La suite local completa final aprobó sin fallos en 17,4 minutos. Las otras tres
configuraciones afectadas se repitieron completas. No se aumentaron timeouts ni
reintentos, no se añadieron omisiones funcionales y no se modificó el código
comercial para satisfacer expectativas antiguas. El resumen original sigue en
`full-tests-all.json`; los resultados corregidos se enlazan explícitamente desde
`result.json`. La lista original está en `initial-full-failures.json`.

### Escala, integridad y concurrencia

Las migraciones y funciones actuales se ejercitaron en PostgreSQL real local con
3.000 productos, 6.000 pedidos, 1.000 marcas y 1.000 ofertas en sus fixtures de
escala. Se comprobaron páginas acotadas y totales, equivalencia de búsquedas y
filtros, selectores de 25 identidades, lecturas explícitas y validación de 1.000
conflictos de Excel. El SDK real con transporte aislado comprobó además importación
de 500 productos/1.000 presentaciones y ausencia de descargas completas innecesarias.
**No se poblaron los servicios alojados con miles de registros comerciales**:
su catálogo contenía un producto, y las pruebas alojadas respetaron esos datos.

La concurrencia local utilizó diez conexiones independientes, incluyendo:

- Cien códigos internos únicos y carreras de SKU automático/manual sin duplicados.
- Lotes de marcas con normalización y duplicados; familias con altas y cambios
  simultáneos sin sobrescribir versiones ajenas.
- Dos administradores actualizando stock o estado: una operación válida y un
  conflicto de versión, sin perder la escritura confirmada.
- Diez reintentos del mismo checkout simulado: un pedido, no diez. Grupos de
  10/50/100 pedidos, estados mixtos y reintentos idempotentes.
- Reservas de medios, manifiestos en conflicto, rechazo de toma de propiedad y
  asociación frente a limpieza concurrente. Las asociaciones confirmadas se
  conservaron y una reclamación terminal no pudo volver a asociarse.
- Límites e aislamiento de Favoritos y revalidación de precios cambiados.

**Límite comercial confirmado:** con una unidad, dos clientes obtienen dos pedidos
pendientes de **simulación**, cero unidades comerciales comprometidas y stock
inalterado. No es prueba de protección contra sobreventa de compras reales.
La reserva/asignación y confirmación de inventario debe integrarse con el pago
real y su política de expiración/reconciliación. No se inventó esa regla ni se
convirtió una simulación en venta aprobada.

La restauración empleó un nuevo clúster de loopback: parada limpia, copia física,
1.266 archivos comparados por SHA-256, arranque en otro directorio/puerto y
comparación de 51 tablas, permisos, RLS, propietarios y secuencias. Los nueve
controles aprobaron. Se retiraron exclusivamente sus directorios temporales
verificados. **No fue una restauración de Supabase Auth alojado ni de objetos R2**.

## Despliegue definitivo de esta intervención

| Elemento | Valor verificado |
| --- | --- |
| Worker | `aroma-infini-frontend-staging` |
| Versión activa, 100 % | `d6ffdc13-dae9-41ac-ac63-31117ec6048b` |
| Despliegue de cierre | `8941ae62-8193-4986-b846-83bdd41bcd32` |
| Supabase inspeccionado | `tkxvexfapszilzhogvgu`, desarrollo |
| R2 | `aroma-infini-media-dev`, privado |
| Manifiesto del paquete, SHA-256 | `1183484e67e446e8dd10765142d6568bbe9db8a5f422575ad290225d907ec18d` |
| Esquema de desarrollo, SHA-256 | `b53b7afbad51b4418bc71869b819a6da778d8f3b963eb38b4e6250eb3e0d503f` |
| Tipos remotos, SHA-256 | `cf372d5d0c5fb269cf9e6c50bc53133d1cc66a658d6eaaeba667e49b500060e6` |

La comparación de navegador utilizó esta misma versión al 100 % y la base al
0 %, seleccionada explícitamente solo para las mediciones. El cierre retiró
esa entrada de comparación; no cambió la candidata, el frontend ni el esquema.
Después se verificaron otra vez bytes de activos, documentos, configuración y
contenido del Worker.

| Recurso servido | SHA-256 |
| --- | --- |
| `startup-common-DsvVlorj.js` | `cac65a364b1466b2120cc15f6f5e3df2be2e86fff0fc49821ec5596c76d43353` |
| `react-vendor-DYloAdPz.js` | `07b77461c235dbb1c8f93d868b5d5bc9ea7482495cdc1d5b98945b791284f2df` |
| `index-Dfg5-yCg.css` | `c96b4a6912905bd10ad74dbcf0e73a7b502f305ce22cde1c40756cc8bd31b0bb` |
| Módulo Worker `seo-router.js` descargado | `2fdd5f993ee5ab8a6a421d3c82734e2193d79b41194ce38143de83c7301680d9` |

Los 127 hashes completos y los módulos WASM/map están en `verified-final.json`.
El Worker se obtuvo del endpoint oficial de contenido actual y se vinculó a la
versión activa y su ETag. No se afirma una comparación binaria con un bundle
histórico local del Worker que no se conservó. Los archivos de frontend sí se
compararon contra el paquete inmutable local.

Producción conserva el despliegue
`9baa7c50-262a-4f23-bf52-5742a52ffa0b`, versión
`ec8554f6-d47a-4af0-ba60-4623c8125020`, creado el 4 de noviembre.
Su huella de metadatos antes/después es
`6fd1c5ae4cd2f6df996c4c161db2748f97e95704d017e8023991252a1c28a5e6`.
Se leyó su metadato; no se desplegó, migró ni consultó su base comercial.

Se conservan los 1.288 archivos iniciales. Los 33 archivos existentes modificados
durante la intervención son servicios de carga/Auth, scripts de arranque, el
filtro de hints del Worker y pruebas. No cambió ningún CSS, componente visual o
archivo de `public`. Las modificaciones previas permanecen; no hubo commit,
push, reset ni limpieza del trabajo anterior.

## Latencia residual: evidencia y límites

Se analizaron 90 trabajos DNS del hostname exacto de staging: 45 por versión.
Diez trabajos de la base y seis de la candidata superaron 500 ms; los máximos
fueron 1.044 y 1.093 ms. La distribución entre brazos varió. Ese tramo ocurre
antes de que Cloudflare pueda procesar el HTTP; no demuestra lentitud de SQL.
Los detalles están en `paired-*-network-summary.json`, con las dependencias
NetLog limitadas al trabajo y al hostname correspondiente.

La prueba administrativa adicional encontró además una espera en la apertura de
conexión para el **preflight**, que Resource Timing puede hacer parecer tiempo de
cuerpo de la petición final:

- NetLog `admin-cold-netlog-1d11d52a-9dc8-470d-bd31-977c2b4f2aa0.json`:
  petición Auth 3080, preflight 3081, trabajo del resolver 3120 para el Supabase
  de desarrollo, transacción A 3127.
- La transacción A comienza a +2 ms; a +1.013 ms se registra otro intento; a
  +1.016 ms llega una respuesta válida. El preflight obtiene conexión a
  +1.032 ms y cabeceras a +1.056 ms.
- Auth comienza después, obtiene cabeceras aproximadamente 129 ms más tarde y
  termina sin una descarga de cuerpo de un segundo. No se atribuye esa espera a
  PostgreSQL, al pool, al servicio Auth ni al gateway de Supabase.

Se conservó una extracción sin cabeceras sensibles en
`admin-cold-preflight-dependencies.json`. No permite determinar dónde se perdió
la primera respuesta DNS: faltan capturas del resolver y de la red de acceso.
El paso externo concreto es contrastar los mismos timestamps con el resolver y
otra conexión física/ISP. No se cambiaron DNS, proxy, QUIC, TLS ni producción.

Se probó una preconexión adicional únicamente en el navegador, contra la misma
candidata desplegada: 48 documentos AB/BA, seis pares por perfil y caché.
Los criterios de aceptación se registraron antes de leer resultados. La mediana
fría de escritorio cambió 1.307 → 1.277 ms y la móvil lenta 3.788 → 3.791 ms;
no alcanzó el beneficio mínimo definido. **Experimento descartado**: no se añadió
otra precarga ni se modificó el código por una diferencia aislada.

El pico interno de Envoy identificado en el informe del 14 de noviembre sigue
requiriendo telemetría del proveedor. El expediente existente
`SUPABASE_UPSTREAM_SUPPORT_2026_11_14.md` conserva los identificadores. No se
declara resuelto por no reaparecer durante una serie corta. Tampoco se abre R2
para evitar artificialmente la comprobación del manifiesto.

## Dependencias

`npm audit --omit=dev` reportó cero avisos altos/críticos y dos moderados en la
cadena ExcelJS → uuid. El aviso
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
afecta a v3/v5/v6 con buffer proporcionado. La versión instalada de ExcelJS solo
llama a `uuid.v4()` sin buffer en `cf-rule-ext-xform.js`; el proyecto no importa
esas funciones afectadas. No se presenta todo el paquete como libre de avisos.
La sugerencia automática de npm cambia de versión mayor de ExcelJS; no se aplicó
un downgrade u override incompatible a una función de importación en uso.
Se conserva la evidencia de alcance y queda pendiente la corrección compatible
del proveedor. No se añadió ni retiró ninguna dependencia en esta intervención.

## Estado de las tareas y límites de cierre

**SOLUCIONADA** significa que el cambio o la comprobación indicada se terminó con
evidencia. **BLOQUEADA** significa que no puede certificarse el resultado indicado;
no equivale a que toda la web esté inoperativa. **NO APLICABLE** indica una acción
innecesaria o expresamente excluida de esta intervención.

| Tarea | Estado | Resultado y acción necesaria |
| --- | --- | --- |
| Inventario inicial, conservación de trabajos y revisión de entornos | SOLUCIONADA | Mismos HEAD/rama, cero archivos iniciales ausentes, cambios anteriores conservados. |
| SDK de Supabase fuera del módulo bloqueante público | SOLUCIONADA | 214.077 bytes menos en el módulo común, con mejora de renderizado medida en la candidata desplegada. |
| Regresión administrativa del primer experimento | SOLUCIONADA | Hints específicos de Auth y coordinación solo en vuelo; recarga caliente recuperada y SPA conservada. |
| Permisos, sesión, MFA, aislamiento e invalidación | SOLUCIONADA | 85 casos Auth, SQL y verificaciones alojadas; peticiones de actor de mediana tres a una por documento. |
| Paginación y consultas específicas administrativas | SOLUCIONADA | Conservadas; 91 casos del catálogo y fixtures de miles de registros; 14 destinos alojados revisados. |
| Excel, selectores, promociones, fotos, galerías, favoritos y navegación | SOLUCIONADA | Suites completas aprobadas; lecturas y borradores reales alojados. Las escrituras funcionales usan servicios aislados, no registros comerciales reales. |
| Diseño, animaciones y recursos responsive | SOLUCIONADA | Sin cambios visuales; capturas y pruebas responsive aprobadas, vídeo ausente de red móvil. |
| Seguridad de entrega R2 y caché de bytes | SOLUCIONADA | Bucket y objeto privado verificados; manifiesto actual por petición, incluso HIT/304; rutas privadas y carga anónima rechazadas. |
| Concurrencia administrativa y ciclo de medios | SOLUCIONADA | PostgreSQL local real, diez conexiones y RPC migradas; conflictos, reintentos y limpieza frente a asociaciones aprobados. |
| Sincronización de esquema/tipos de desarrollo | SOLUCIONADA | 42 migraciones, cero pendientes, tipos exactos y misma huella de esquema. |
| Backup/restauración local de SQL | SOLUCIONADA | Copia física y nueve verificaciones de restauración; datos, políticas, roles y secuencias coincidentes. |
| Calidad, regresión y publicación de staging | SOLUCIONADA | Typecheck/lint/build, 200 Node, 26 configuraciones Playwright y 994 SQL; 127 activos verificados. |
| LCP ≤2,5 s en móvil lento frío | BLOQUEADA | No alcanzado: Home 3,112 s, Tienda 2,884 s y Producto 3,176 s. No se presenta como exclusivamente externo. La traza aún contiene transferencia del arranque y layout; no hay evidencia de otra modificación ya probada que permita garantizar el umbral conservando toda la experiencia. |
| Diagnóstico de la pérdida/espera DNS inicial | BLOQUEADA | El segundo intento y su demora están demostrados, pero localizar la pérdida requiere telemetría del resolver/red y otra conexión física. Facilitar NetLog filtrado y timestamps al responsable de red; no cambiar DNS/protocolos por intuición. |
| Identificación del pico interno de Envoy | BLOQUEADA | Enviar el expediente de soporte ya preparado y solicitar spans por request/trace ID, adquisición de conexión y tiempos de servicio. No se envió ningún mensaje sin autorización. |
| INP y Core Web Vitals de campo | BLOQUEADA | Staging y CPU/red emuladas no proporcionan datos representativos de usuarios reales. Recogerlos al habilitar el dominio y el tráfico real; no sustituirlos por tareas largas de laboratorio. |
| Cobro y sobreventa de compra real | BLOQUEADA | Mercado Pago sigue simulado. Hace falta la integración y credenciales de prueba, más la política confirmada de reserva/expiración o asignación al pago y reconciliación. No se aprobó pago ni se reservó stock automáticamente. |
| Recuperación de Supabase alojado y objetos R2 de producción | BLOQUEADA | La restauración validada es local. Se requiere un destino aislado autorizado y copias reales del entorno productivo para acreditar ese recorrido sin tocar datos vigentes. |
| Aviso moderado transitivo de uuid | BLOQUEADA | Funciones afectadas fuera de la ruta utilizada; queda pendiente una actualización compatible del proveedor o una sustitución validada. Cero avisos altos/críticos. |
| QR definitivo, dominio multimedia y publicación del dominio final | BLOQUEADA | Falta el dominio confirmado/configurado; no se generó QR temporal ni se abrió el bucket actual. |
| Nuevos índices, migraciones o cachés comerciales | NO APLICABLE | No apareció una justificación medida para añadirlos; no hubo migraciones nuevas ni alteraciones de reglas. |
| Preconexión adicional del experimento | NO APLICABLE | Descartada por no demostrar beneficio suficiente en 48 documentos. |
| Otra separación de CSS o rediseño | NO APLICABLE | Se mantuvo la cascada y el diseño; no se separaron estilos ni módulos por intuición. |
| Capturas manuales históricas dentro de la suite normal | NO APLICABLE | Tres tareas optativas sin activar, declaradas como omitidas; las capturas actuales se generaron con los recorridos de esta intervención. |
| Limpieza destructiva, commits/push, despliegue/migración de producción | NO APLICABLE | Excluidos por el usuario; no realizados. |

El LCP pendiente merece atención: en la primera muestra móvil lenta de la
candidata, la imagen de Home se descubrió desde el HTML a 323 ms, terminó a
2.171 ms y quedó decodificada en su elemento a 3.071 ms. El CSS común terminó
a 2.108 ms y el layout principal duró unos 123 ms. En Tienda y Producto también
se precargó la imagen real; la espera posterior no se resuelve únicamente
acelerando R2. Es una observación de traza, no una prueba de que todo el intervalo
sea CPU React ni de que deba eliminarse CSS. No se declara agotada toda posibilidad
futura de optimización ni se atribuye este objetivo incumplido solo a DNS.

## Cómo revisar y reproducir la entrega

- Informe consolidado: este documento. Resultado legible por herramientas:
  `artifacts/integral-stabilization-2026-11-15/result.json`.
- Base y candidata públicas: `public-paired-full.json`, `public-summary.json`,
  `paired-*-traces-summary.json`, `paired-*-network-summary.json`.
- Comparativa del panel: `closure-admin-summary.json`, `admin-cold-summary.json`,
  `admin-all-modules-summary.json`, `actor-request-counts.json`.
- Pruebas: `result.json` relaciona las 26 configuraciones con su último reporte
  válido. `full-tests-all.json` conserva la ejecución inicial; `repair-reports/`
  conserva las repeticiones. No sustituir los fallos originales por éxitos.
- Seguridad y entornos: `sql-final.json`, `r2-private-configuration.json`,
  `after-remote.json`, `closure-types.json`, `verified-final.json`,
  `after-environment.json` y `preservation-final.json`.
- Capturas: `network-screens/` y `screens/`. No compartir NetLog completo ni
  árboles enteros de artifacts: pueden contener detalles locales de red. El
  expediente de soporte existente selecciona únicamente evidencia acotada.

Para reproducir calidad y SQL de manera aislada: `npm.cmd run typecheck`,
`npm.cmd run lint`, `node scripts/test-isolated.mjs node`,
`node scripts/test-isolated.mjs all` y
`node scripts/test-supabase-sql.mjs --restore-check`.
Las herramientas nativas SQL ya están instaladas en el directorio de pruebas;
el runner crea su propio clúster loopback y no acepta una base remota. Las
mediciones alojadas requieren las sesiones de CLI autorizadas y deben ejecutarse
secuencialmente, sin builds ni otra carga pesada. No es necesario repetirlas
para consultar los resultados conservados. No se publicó el código mediante Git.
