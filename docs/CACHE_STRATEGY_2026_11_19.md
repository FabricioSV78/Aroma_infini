# Auditoría y optimización de caché — Aroma Infini

19 de noviembre de 2026, hora de Lima. Referencia obligatoria:
[Rendimiento integral del 19 de noviembre](INTEGRAL_PERFORMANCE_2026_11_19.md).
Evidencias: `artifacts/cache-strategy-2026-11-19/`, excluidas de Git.

## Resultado y alcance

**Implementado, desplegado y validado exclusivamente en staging.** Se corrigieron
cachés editoriales que no vencían, consultas repetidas del Home, tres problemas
de coordinación de lecturas privadas y una lectura innecesaria de R2 en las
revalidaciones condicionales. Las fuentes originales ahora tienen URLs con hash.

Hay mejoras demostradas al volver a un Home ya visitado, revalidar imágenes y
reutilizar fuentes. **No hay evidencia de una mejora general de la primera carga
móvil ni de todas las navegaciones SPA.** Se conservan los resultados mixtos y
dos picos HTTP de aproximadamente un segundo; no se declaran solucionados.

No se modificaron diseño, tipografías, animaciones, calidad de fotografías,
precios, promociones, inventario, reglas de checkout, RLS ni Auth/MFA. No se
añadieron dependencias, índices o migraciones. No se abrió R2. No hubo compras,
pagos, cambios en pedidos comerciales, commit, push ni limpieza destructiva.

## Matriz de caché comprobada

| Información | Ubicación y política | Frescura e invalidación |
| --- | --- | --- |
| JS, CSS y fuentes con hash | Navegador/CDN, `/assets/*`, `public, max-age=31536000, immutable` | Otra compilación cambia la URL; las fuentes mantienen exactamente sus bytes |
| Fuentes y otros recursos heredados con URL mutable | Se conserva la revalidación; no reciben un año de caché por su extensión | Permite sustituir el archivo en esa URL sin congelarlo |
| HTML dinámico, cuenta, admin y checkout | Respuesta HTML `no-store`; sin caché pública de identidad o importes | Se conservan SSR inicial y validaciones existentes |
| Configuración pública, medios y alias | Memoria del navegador, 30 s; solicitudes idénticas pendientes compartidas | Caducidad en lectura, publicación confirmada, navegación y renovación visible |
| Documento editorial del Home | Memoria, 30 s y barrera de versión/publicación | Semilla HTML conserva su edad; no reinicia el TTL al entrar en React |
| Marcas/configuración del repositorio público | Metadatos en memoria, 30 s; se conservan las proyecciones reducidas | La invalidación pública también reinicia los relojes del repositorio |
| Home comercial, catálogo, fichas y vistas previas | Caché pública en memoria ya existente, 5 s, máximo 40 entradas, claves por consulta | No se amplía el TTL comercial; renovación por publicación, visibilidad y límites de ofertas |
| Precios y stock visibles | Proyecciones anteriores, sin nuevo CDN/SWR comercial | Se conserva el reloj de ofertas y la comprobación visible de hasta 60 s; una nueva lectura vencida vuelve al servidor |
| Cotización y creación de pedido | Lectura/transacción vigente del servidor, sin nueva caché de resultados | SQL sigue validando precios, cupón, disponibilidad, reserva e idempotencia |
| Cuenta: perfil, dirección y pedidos | Solo se agrupa SQL que todavía está pendiente | Clave por UUID, token, época de sesión y revisión de escritura; no hay TTL de resultados privados terminados |
| Favoritos | Estado privado existente, 30 s para IDs, ligado al propietario y generación | Cambio de propietario/logout y comandos mantienen su invalidación; no entra en caché pública |
| Administración y verificaciones de Auth | Se mantienen lecturas protegidas pendientes compartidas, no resultados de autorización | Rol, propietario, sesión y MFA se siguen comprobando en backend y consumidor |
| WebP/SVG publicados | Caché de **bytes inmutables** por UUID/hash/ruta en Worker y navegador | El Worker verifica el manifiesto publicado en SQL en cada solicitud que le llega |
| Vídeo publicado | Se conservan entrega, validadores y Range existentes | No se cambia el camino de vídeo; móvil continúa sin inicializarlo ni descargarlo |
| Metadatos públicos de medios en HTML del Worker | Caché existente por entorno/origen, 30 s, máximo ocho entradas | Ahora comunica su edad al navegador para evitar sumar otros 30 s |
| PWA administrativa | Service worker de push, sin manejador `fetch` ni caché de páginas privadas | SW `no-store`; manifiesto `no-cache`; los IDs de deduplicación push no almacenan pedidos ni credenciales |

No se añadió `stale-while-revalidate` a datos comerciales, privados o decisiones
de publicación. Los fallos HTTP no se convierten en HIT. En los tres servicios
que utilizan `createPublicDocumentCache`, los documentos HTTP 200 malformados se
retiran de su entrada exacta, permitiendo un reintento real sin invalidar una
respuesta más reciente. La interfaz puede
mantener su documento editorial previamente confirmado durante una renovación;
no se presenta un fallo como un nuevo guardado o una nueva confirmación válida.

Un TTL de lectura no es una actualización instantánea universal. La señal entre
pestañas funciona en el mismo origen; otros dispositivos se actualizan mediante
lecturas vencidas y los mecanismos existentes de visibilidad/renovación. No se
ha introducido una suscripción global ni se promete invalidación inmediata entre
todos los dispositivos.

## Problemas encontrados y correcciones

### Documentos públicos y Home

`site-settings-service`, `site-media-service` y `builtin-media-service` mantenían
un indicador `loaded` que evitaba consultar indefinidamente, aunque existiera
una caché de 30 s. El nuevo `createPublicDocumentCache` aplica ese vencimiento,
agrupa las renovaciones simultáneas y evita notificar/rerenderizar un HIT que
ya se confirmó. Una renovación explícita supera lecturas antiguas pendientes;
los errores conservan el contrato de fallo y no se cachean como éxito.

El Home usaba una clave que cambiaba al descubrir su propia versión y no
incorporaba el documento inicial de HTML a la misma ventana de frescura. Volver
al Home podía repetir `home_document` innecesariamente. Ahora la clave es estable
por revisión de lectura y la semilla validada conserva la edad del documento.
Se mantiene la barrera con el contexto comercial y se descarta una época inicial
que haya sido invalidada mientras llegaba su consulta independiente.

Los metadatos de medios ya podían llevar hasta 30 s en el Worker. El campo
validado `ageMs` permite restar esa edad y el tiempo transcurrido en el navegador;
no se conceden otros 30 s completos a un documento antiguo.

### Publicación e invalidación

Se conecta la invalidación de las cachés públicas con la del repositorio y los
guardados confirmados de catálogo, marcas, familias, Home, configuración y medios.
También invalidan los comandos de pedidos que cambian disponibilidad/ranking y
la creación confirmada de una reserva desde checkout.

Una señal `publication-v1` por `BroadcastChannel`, acotada al origen y proyecto,
avisa a otras pestañas. **No transporta datos, UUID de clientes, precios, tokens
ni permisos**. Cualquier otro payload se ignora. Los relojes de renovación no
publican señales, evitando bucles. Las pestañas visibles revalidan por el camino
existente; las ocultas esperan a recuperar visibilidad. Los documentos
editoriales se renuevan en segundo plano sin bloquear una navegación.

### Lecturas privadas concurrentes

Antes de corregirlas se reprodujeron tres fallos en pruebas de aplicación/SDK:

1. Dos cargas simultáneas de cuenta duplicaban el grupo de tres consultas SQL.
2. Una lectura iniciada antes de guardar el perfil podía publicar el nombre antiguo.
3. Una lectura podía terminar después de cerrar y reabrir sesión con el mismo UUID.

Se coordinan únicamente operaciones pendientes del mismo UUID/token/época/revisión.
Logout o cambio de propietario invalida esa época; una escritura invalida antes y
al finalizar. Cada consumidor conserva verificación remota anterior y posterior
de identidad y las comprobaciones del propietario del DTO. No se cachea una
autorización ni un perfil terminado. El cuarto escenario, mezcla entre UUID
diferentes, ya era rechazado y sigue siéndolo. Los cuatro pasan tras el cambio.

### Revalidaciones de imágenes

Una petición con `If-None-Match` omitía la caché de bytes y consultaba metadatos de
R2 aunque ya estuvieran disponibles los bytes verificados. Ahora GET/HEAD puede
responder 304 desde ese HIT, **después de verificar el manifiesto SQL vigente**.
Se manejan ETag fuerte/débil, listas y `*`, sin aceptar validadores malformados.

La clave no incorpora cookies o credenciales. Se mantienen validación de hash,
formato y tamaño, CSP de SVG, fallback de R2 y errores `no-store`. Un manifiesto
revocado o no disponible no se autoriza con un HIT de bytes. El camino Range de
vídeo y la limpieza por referencias permanecen intactos.

Sustituir un recurso produce otra URL por UUID/hash. Un archivo comercial público
ya descargado con caché inmutable no puede retirarse inmediatamente de la caché
de un navegador; el nuevo contenido usa su nueva referencia. No se presenta
esta política como almacenamiento de documentos privados o revocación retroactiva.

### Fuentes

Las fuentes Lato originales bajo `/fonts/` exigían revalidación HTTP incluso en
cargas calientes. Un plugin de compilación pequeño permite a Vite emitir las
mismas fuentes con hash bajo `/assets/`, incluyendo CSS anidado procesado por
Tailwind y precargas HTML. No cambia fuentes, pesos, calidad ni URLs de desarrollo.
Se verificaron los bytes originales de ocho fuentes y los doce archivos de
fuente emitidos. Las precargas y CSS apuntan a las mismas URLs versionadas.

## Comparativa real de rendimiento

Las versiones se midieron en orden antes/después sobre staging real. No se
sustituyeron respuestas de datos. La fase SPA fija explícitamente la versión
que también estaba activa al 100 %; las otras mediciones usan HTTPS ordinario.
No son ensayos aleatorizados ni mediciones de todos los visitantes.

- 50 solicitudes multimedia por versión: 20 WebP, cinco SVG y 25 condicionales.
  Además, una lectura de descubrimiento y nueve documentos por versión.
- 36 cargas de página por versión: Home/Tienda/Producto, escritorio y móvil lento,
  tres procesos Chrome nuevos por ruta/perfil, cada uno con carga fría y caliente.
- 20 recorridos cortos Home → Contacto → Home por versión: diez por perfil.
- Cinco ciclos por cada uno de tres perfiles SPA, con recorrido previo excluido:
  150 pasos medidos por versión y otros 150 de calentamiento, diez destinos/pasos.
- Móvil lento: Chrome, CPU ×4, 1,6 Mbps y latencia emulada de 150 ms; móvil 4G:
  CPU ×4, 9 Mbps y 80 ms. Escritorio de 1440 px. Son perfiles de laboratorio.

p50 es la mediana convencional; p95 usa rango más cercano. Con tres o cinco
muestras p95 equivale al máximo: se conservan tamaños y rangos en `comparison.json`.
«Fría» significa caché del navegador vacía, **no** un MISS físico de R2/CDN.

### Mejoras directamente verificadas

| Medida | Antes | Después |
| --- | ---: | ---: |
| Imágenes condicionales: TTFB p50, 25 por versión | 344,4 ms | 207,3 ms |
| Imágenes condicionales: TTFB p95 | 373,3 ms | 227,3 ms |
| Tramo almacenamiento/caché: p50 / p95 | 140 / 150 ms | 5 / 7 ms |
| Uso de byte-HIT en esas 25 condicionales | Camino omitido en 25 | 25/25 HIT; sin lectura R2 en ese camino |
| Volver al Home ya visitado, escritorio: p50 / p95, n=10 | 267 / 849 ms | 30 / 38 ms |
| Volver al Home ya visitado, móvil lento: p50 / p95, n=10 | 476 / 988 ms | 132 / 139 ms |
| `home_document` en esos 20 retornos | 20 consultas | 0 |
| Revalidaciones HTTP de fuentes en 18 cargas calientes | 48 | 0 |
| Transferencia de esas fuentes calientes | 30.102 bytes de respuestas/cabeceras | 0 bytes por red |

Las 48 respuestas anteriores eran **304**, no 48 descargas completas de fuentes.
Después las 48 respuestas lógicas vienen de caché del navegador. La mejora de
TTFB condicional es aproximadamente 39,8 % y se explica por retirar la lectura
R2 innecesaria; cada petición continúa consultando el manifiesto.

Los WebP normales no mejoran de forma general: p50 de cabeceras 219 → 221 ms,
p95 271 → 251 ms, HIT 20/20 en ambas versiones. SVG, n=5, pasa de 215 → 234 ms
de mediana y 236 → 358 ms de p95. Estas variaciones no se ocultan ni se atribuyen
a una mejora de caché. No hubo MISS en esta cohorte; no se purgó ni abrió R2 para
fabricar un escenario frío.

Wrangler Tail correlacionó 41 IDs por fase, en 31 eventos antes y 29 después.
CPU de Worker p50/p95: 1/8 → 2/21 ms; duración incluyendo `waitUntil`:
47/226 → 34/104 ms. Son métricas distintas y parcialmente solapadas con la red:
no se suman al TTFB ni prueban una reducción general del uso de CPU.

### LCP: cargas iniciales y calientes

Medianas, tres muestras por celda, milisegundos:

| Perfil / caché | Home antes → después | Tienda antes → después | Producto antes → después |
| --- | ---: | ---: | ---: |
| Escritorio fría | 1108 → 1232 | 912 → 1024 | 1348 → 1068 |
| Escritorio caliente | 332 → 292 | 308 → 288 | 380 → 292 |
| Móvil lento fría | 2300 → 2312 | 2688 → 2552 | 2312 → 2372 |
| Móvil lento caliente | 592 → 384 | 540 → 452 | 580 → 500 |

La carga fría móvil del Home no mejoró; sus rangos son 2244–2416 y 2236–2324 ms.
En Tienda la reducción también coincide con TTFB 480 → 351 ms; en Producto el
TTFB sube de 390 → 460 ms. No se atribuyen esas diferencias a caché ni se declara
una mejora estructural de JavaScript.

El elemento LCP siguió siendo la fotografía: Hero WebP 780 px, tarjeta de Tienda
480 px y galería de Producto 960 px. No se redujeron dimensiones o calidad.
CLS de las cargas iniciales observadas: 0. No equivale a CLS de campo ni cubre
toda interacción SPA posterior.

Transferencia fría móvil, Home/Tienda/Producto: 464.412/451.921/586.492 →
464.974/452.721/587.241 bytes. Caliente: 17.773/17.113/17.122 →
15.921/16.007/15.700 bytes. No hay reducción de transferencia fría. Bloqueo
observado de tareas largas: 118/135/112 → 112/125/111 ms; no es Lighthouse TBT
ni INP de campo. Heap observado: aproximadamente 6,80/7,26/7,44 →
6,84/7,32/7,48 MB; no se declara ahorro de memoria.

### Navegación SPA: resultados mixtos y picos

Tiempo hasta datos/interfaz de destino, mediana de cinco ciclos por perfil:

| Destino | Escritorio antes → después | Móvil 4G antes → después | Móvil lento antes → después |
| --- | ---: | ---: | ---: |
| Home | 165 → 174 ms | 214 → 210 ms | 255 → 241 ms |
| Tienda | 145 → 165 ms | 228 → 208 ms | 262 → 247 ms |
| Producto | 155 → 159 ms | 217 → 216 ms | 240 → 236 ms |
| Contacto | 8 → 7 ms | 46 → 37 ms | 47 → 37 ms |
| Checkout | 146 → 181 ms | 207 → 211 ms | 242 → 232 ms |

Cada destino comercial mantiene una RPC principal por muestra; Contacto ninguna.
No hay recargas completas ni errores JS en esos recorridos. Renovar documentos
editoriales vencidos puede requerir lecturas en segundo plano que antes se
omitían incorrectamente para siempre; no se cuenta ese fallo antiguo como ventaja.

Dos muestras de escritorio empeoran el p95: Home 169 → 1085 ms y Tienda
152 → 1028 ms. En el mismo ciclo se observa:

| Operación | Duración HTTP | Request ID de Supabase | CF-Ray |
| --- | ---: | --- | --- |
| `catalog_home_context` | 1075,6 ms | `01a1f67b-111b-79ad-8539-9a07695b9860` | `a5d38954ecca953c-LIM` |
| `catalog_browse` | 1020,8 ms | `01a1f67b-1a48-7c4f-b5da-72e5cfa0af07` | `a5d389638f54953c-LIM` |

En cada caso hay una sola RPC **directa navegador → Supabase**, ninguna tarea
larga y aproximadamente 99 % del tiempo de disponibilidad coincide con la
petición. El Worker multimedia no interviene en esa llamada. El registro original
no capturó el span interno ni la cabecera Envoy de esas dos respuestas: no permite
culpar a SQL, pool, DNS, ISP o un plan Free.

Se hicieron 20 lecturas adicionales secuenciales para ampliar el diagnóstico:

| Perfil, n=10 | Fetch total p50 / p95 | Cabeceras p50 | Cuerpo p50 / p95 | Envoy p50 / p95 |
| --- | ---: | ---: | ---: | ---: |
| Escritorio | 141,6 / 195,5 ms | 141,4 ms | 0,2 / 0,3 ms | 12,5 / 24 ms |
| Móvil lento | 198,7 / 273,2 ms | 197,2 ms | 1,2 / 15,3 ms | 12 / 14 ms |

Las 20 usaron conexiones H3 reutilizadas, sin nueva resolución DNS/TLS en esas
solicitudes, respuestas `DYNAMIC`, sin HIT HTTP, errores o muestras mayores de
un segundo. **No reproducir el pico no demuestra su desaparición.** Estos datos
no sustituyen la cohorte antes/después. `upstream-final-raw.json` conserva eventos;
`upstream-analysis.json` separa el momento de cabeceras de ResourceTiming y el
cuerpo. El timestamp de entrega del evento CDP puede llegar después de la
finalización de cuerpos pequeños y no se usa como frontera física del cuerpo.

En el Home lento de SPA se registró un layout shift de 0,961 y en Tienda 0,041,
al llegar el destino más de 500 ms después del último input. Se informa separado
del CLS de carga inicial; no se afirma que todas las interacciones tengan CLS 0.
No se oculta esa espera con una caché comercial más larga.

También se observa revalidación del favicon mutable tras cambios de ruta; no
bloquea datos ni LCP. No se le asignó `immutable` a una URL sustituible ni se
atribuyen esos bytes pequeños a los picos de la RPC.

## Validación funcional, privacidad y despliegue

### Pruebas aisladas y calidad

| Suite | Resultado |
| --- | --- |
| Worker multimedia final | 168 aprobadas |
| Catálogo final | 105 aprobadas |
| Auth/cuenta | 97 aprobadas, incluidas las cuatro regresiones de coordinación |
| Configuración del sitio | 53 aprobadas |
| Panel multimedia | 26 aprobadas |
| Home | 8 aprobadas |
| SEO/Worker | 80 aprobadas |
| Checkout | 30 aprobadas |
| Pedidos | 42 aprobadas |
| Favoritos | 19 aprobadas |
| Configuración comercial | 18 aprobadas |
| Navegación, foco, diálogos y tipografía seleccionados | 47 aprobadas |
| Contratos finales de caché y documentos en navegador | 10 + 10 aprobadas |
| Node | 216 aprobadas |
| TypeScript, ESLint, build staging, paquete sellado y Wrangler dry-run | Aprobados |

`tests-final.json` contiene 645 ejecuciones de once suites; después se repitieron
las suites afectadas por los últimos ajustes (`tests-refinement.json` y
`tests-cache-final.json`). **Los conteos se solapan; no se suman como casos únicos.**
No se ejecutó nuevamente toda la suite general histórica de más de mil casos.
No se aumentaron timeouts/reintentos ni se omitieron pruebas para aprobar.

Se conservan las pruebas rojas iniciales de cuenta. En el experimento del Worker
se detectó además un bloqueo del fixture al cancelar una rama clonada de un
stream: se corrigió la emulación de Cache API para entregar cuerpos independientes.
No se relajó el código de cancelación productivo. La prueba de fuentes conserva
errores reales de compilación; solo distingue el aviso diagnóstico de tiempos de
plugins, que no es un error de resolución de recursos.

### Pruebas reales sobre los servicios alojados

- Dos pestañas anónimas: una señal válida provoca una renovación por documento
  en cada pestaña, sin ecos; payloads arbitrarios no alteran permisos o stock.
  Es una prueba de transporte/invalidation, no una modificación de contenido comercial.
- Dos clientes temporales identificados: perfil/favoritos propios, restauración,
  nueva pestaña, logout, cambio de cliente y aislamiento de identidad. Se eliminaron
  solamente esas identidades temporales al terminar.
- Administrador temporal con Auth/TOTP y AAL2 reales: cliente/admin separados;
  RPC protegida rechazada después de revocar el administrador. Se retiró el fixture.
- 56 comprobaciones HTTP reales de acceso público, privacidad, RLS y CORS aprobadas.
- 24 vistas públicas: Home/Tienda/Producto/Contacto × 360, 390, 430, 768, 1024 y
  1440 px. Sin desbordamiento horizontal, fotos rotas o errores JS. Sin solicitudes
  de vídeo en las anchuras móviles que prohíbe el breakpoint existente.
- Checkout en seis anchuras: Datos → Entrega → Revisión → volver, conservando
  campos. Se consultan tarifas/cotización reales; **no se envió un pedido**.
- 136 capturas de 17 rutas administrativas en ocho anchuras: 360, 390, 430, 768,
  1024, 1366, 1440 y 1920 px. Selección/paginación/confirmación masiva cancelada,
  formularios, configuración y pestañas; sin modificación de registros comerciales.
- Revisión visual directa de Home móvil, Tienda escritorio, Revisión de checkout
  móvil y Pedidos móvil. Se conserva la apariencia existente.

Los cambios de contenido, versiones, respuestas inválidas, fallos HTTP y carreras
de escritura también tienen pruebas aisladas de aplicación/SDK. No se presentan
estas simulaciones como escrituras o fallos deliberados en servicios comerciales.
No se afirma haber probado teléfonos físicos ni INP de campo.

### Versión y sincronización comprobadas

| Componente | Estado verificado |
| --- | --- |
| Worker staging | `aroma-infini-frontend-staging` |
| Versión activa, 100 % | `347898f7-72c5-4fcc-9493-0720e7dccf29` |
| Deployment | `b0735e5b-a313-41ca-b387-ec768d445921` |
| Base anterior medida | `73bf7acc-315e-4d8d-95d9-97bfb4a41fa5` |
| Entrada JS actual | `/assets/index-BEmP1fvo.js` |
| SHA-256 entrada JS | `c01429970b0bc6aaade1ab74ccde553532989219b49dda0aad6cfbfa2357a720` |
| SHA-256 paquete sellado | `22c0df19817462de1166a26a8a5bf2157308622b3d8688e51207333c50db65be` |
| SHA-256 configuración Wrangler | `3de706eeb412b5e34f4d513d8c7628182e55c8d914c87aa3711327666a846249` |
| Archivos JS/CSS/fuentes/PWA alojados | 140 hashes coincidentes con el paquete local, HTTPS sin override |
| Supabase desarrollo | 49 migraciones, cero pendientes; hashes de historial coincidentes |
| Tipos oficiales remotos/locales | SHA-256 `021857a7c45356d3764d86c8302cdaf5c7fd06d3e6952f6d180d85015ccae891` coincidente |
| RLS, roles, permisos y RPC de fundamento | Comprobaciones aprobadas |
| R2 | `aroma-infini-media-dev` privado; acceso directo público desactivado |
| Producción | **Intacta**, versión `ec8554f6-d47a-4af0-ba60-4623c8125020`, deployment `9baa7c50-262a-4f23-bf52-5742a52ffa0b` |

Bindings y presencia de secretos de servidor se verificaron sin imprimir valores.
No se aplicaron migraciones en esta intervención. Git conserva `develop`, HEAD
`7b76fedf125b9d61e17ee26958e0c7646544e821` y los 151 archivos previamente modificados.
Dependencias y `wrangler.jsonc` permanecen sin cambios respecto a HEAD.
La comprobación final conserva 175 rutas de trabajo, incluido este informe;
no hay borrados ni credenciales o artefactos rastreados. El paquete local completo
conserva sus 192 archivos verificados. Ejecutar su verificador fuera de las
variables selladas de despliegue fue rechazado por la protección de entorno;
con el entorno exacto de la candidata volvió a aprobar, sin reconstruir ni desplegar.

## Archivos de implementación

- Público/editorial: `src/services/public-query-cache.ts`, nuevo
  `public-document-cache.ts`, `home-content-service.ts`, `site-settings-service.ts`,
  `site-media-service.ts`, `builtin-media-service.ts`, `storefront-repository.ts`.
- Integración de renovación: `src/components/layout/StoreLayout.tsx`,
  `commerce-settings-service.ts`, `order-admin-service.ts`, `checkout-server.ts`.
- Edad del documento: `src/domain/public-media-bootstrap.ts`,
  `src/services/public-media-bootstrap.ts`, `worker/site-media-seo.ts`.
- Privado: `src/services/account-adapter.ts`.
- Bytes condicionales: `worker/media-handler.ts`.
- Fuentes: nuevo `scripts/versioned-public-fonts.ts`, `vite.config.ts`,
  `scripts/public-route-hints.mjs`, `worker/public-route-hints.ts`.
- Pruebas: `public-query-cache.spec.ts`, `public-document-cache-browser.spec.ts`,
  `public-home-cache.spec.ts`, `supabase-account.spec.ts`, `r2-media-worker.spec.ts`,
  `r2-media-svg.spec.ts`, `site-media-seo-worker.spec.ts`,
  `public-route-hints-worker.spec.ts`, `versioned-public-fonts.test.mjs`.

## Límites y decisión final

Las optimizaciones justificadas de esta intervención están implementadas y
probadas. No se deja propuesto aumentar TTL de precios, saltarse manifiestos,
cachear MFA o publicar el bucket: esas alternativas comprometerían las condiciones.

La primera carga móvil fría sigue cerca de 2,3–2,6 s y el bloqueo inicial de JS
no presenta un cambio estructural. La caché caliente no resuelve el primer viaje
de un usuario. Aumentar el TTL comercial para mejorar un benchmark sería incorrecto.

Los dos picos de RPC directa se mantienen como incidencia abierta y correlacionada.
Para atribuir su causa interna se necesita telemetría del proveedor sobre los IDs
indicados: entrada/salida de gateway, despacho PostgREST, espera de conexión/pool,
inicio/fin SQL y trace vinculado. No se dispone de esos spans para las dos muestras;
las veinte posteriores no justifican descartarlas. No hay evidencia nueva para
recomendar contratar un compute superior como solución de esta auditoría de caché.

## Evidencias y reproducción

`comparison.json` reúne estadísticas y referencias a las comprobaciones. Datos
sin agregar: `worker-before/after.json`, `browser-before/after.json`,
`home-return-before/after.json`, `spa-baseline/candidate.json`, `spa-outliers.json`,
`upstream-analysis.json`, `headers-before/after.json`, `font-build-proof.json`.
Las trazas están en `traces/`; capturas en `screens/`, `checkout-after/` y `final/`.
`runtime-verified.json`, `schema-final.json`, `environments-final.json`,
`functional-final.json` y `preservation-final.json` registran el cierre.

Ejemplos de capturas:
[Home móvil](../artifacts/cache-strategy-2026-11-19/screens/after-slowMobile-home-hot.png),
[Tienda escritorio](../artifacts/cache-strategy-2026-11-19/screens/after-desktop-store-hot.png),
[Checkout móvil](../artifacts/cache-strategy-2026-11-19/checkout-after/revision-390.png),
[Pedidos móvil](../artifacts/cache-strategy-2026-11-19/final/orders-390-viewport.png).

Comprobaciones de calidad reproducibles: `npm.cmd run typecheck`,
`npm.cmd run lint`, `npm.cmd run test:node`, `npm.cmd run build:staging` y
`node --experimental-strip-types scripts/worker-build.mjs check staging`.
Build y verificación deben utilizar las mismas variables de despliegue generadas
por `scripts/github-deployment.mjs`, como hace `release.mjs` en las evidencias;
no se deben sustituir por variables locales de otro destino.
Los runners de evidencias fijan el entorno de staging, admiten solo lecturas
públicas en rendimiento y no deben utilizarse contra producción. El runner de
comparación solo agrega datos; no despliega ni sustituye resultados.

Referencias técnicas:
[Cache API de Workers](https://developers.cloudflare.com/workers/runtime-apis/cache/),
[cabeceras de assets](https://developers.cloudflare.com/workers/static-assets/headers/),
[assets de Vite](https://vite.dev/guide/assets),
[Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control),
[BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel).

## Nota de conservación de evidencias del seguimiento

En la intervención posterior, un runner heredó por error esta carpeta de salida
y sobrescribió `spa-baseline.json` y las capturas SPA de la base anterior.
Ese JSON contiene ahora una nueva medición de `347898f7`, no la de `73bf7acc`.
El informe, `comparison.json` con los agregados originales, `spa-candidate.json`
y las demás cohortes de esta auditoría se conservan. No se reconstruyeron datos
crudos faltantes ni se presentaron los nuevos como antiguos. La ruta se corrigió
y el seguimiento documenta el incidente y sus mediciones por separado en
`artifacts/public-followup-2026-11-19/`. No afectó a código ni datos comerciales.
