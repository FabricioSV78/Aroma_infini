# Validación desplegada de la candidata — 15 de noviembre de 2026

**Estado: cierre técnico aprobado en staging. Producción intacta.**

Se reanudó la validación pendiente, sin iniciar otra optimización. La suite completa de catálogo se ejecutó sola y pasó **91/91**, sin builds ni modificaciones de código simultáneos. Después se activó exactamente la candidata solicitada y se midió su comportamiento alojado. No se aumentaron timeouts ni reintentos. Durante este cierre no se modificó código de aplicación, diseño, dependencias ni reglas comerciales; solo ejecutores de verificación, evidencias y este informe.

Este documento cierra el estado pendiente de [ADMIN_FLUIDITY_TARGETED_READS_2026_11_15.md](ADMIN_FLUIDITY_TARGETED_READS_2026_11_15.md). Ese informe y sus resultados experimentales se conservan como antecedentes; **no se presentan como resultados del despliegue definitivo**.

## Versión y sincronización comprobadas

| Elemento | Resultado real |
| --- | --- |
| Worker de staging | aroma-infini-frontend-staging |
| Versión única activa, 100 % | c2ca5aa0-921c-489b-91e4-482f6cf9f3db |
| Deployment final | 0e76cd69-db75-4d93-b37d-3429f1aa9972 |
| Comparación anterior, retirada al terminar | 27a0a2ff-019b-48bf-9c5a-599eb8fd4db5 |
| Supabase de desarrollo | tkxvexfapszilzhogvgu / aroma-infini-dev |
| R2 | aroma-infini-media-dev; privado; URL de desarrollo devuelve HTTP 401 |
| Migraciones locales y remotas | 42 coincidentes; cero pendientes o desconocidas |
| Cambios SQL durante este cierre | Ninguno: la migración 20261115000100 ya estaba aplicada en desarrollo |
| Tipos TypeScript | Generación oficial de Supabase idéntica byte por byte; sin sobrescribir el archivo |
| Recursos JS/CSS HTTP | 126 de 126 coinciden con el paquete sellado |
| Recursos del paquete | 348 archivos comprobados |
| Git | develop, HEAD 7d2f3648e3b149023910a385bf9510f0ebf60d10; sin commit ni push |
| Cambios anteriores | 164 archivos iniciales conservados; ninguna eliminación; nueve archivos visuales/configuración/dependencias sin cambios |

URL comprobada: [staging](https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev/). Las mediciones públicas principales se realizaron sin override, sobre la candidata realmente activa. La comparación administrativa contemporánea usó el mismo mecanismo de selección de versión en ambos brazos; la antigua quedó al 0 % y la candidata al 100 %. Al terminar se retiró el brazo antiguo del deployment.

El estado final se volvió a leer después de retirar las identidades QA. Las huellas de **34 tablas estables**, incluidas asociaciones multimedia y membresías administrativas, coinciden con el estado previo de la intervención. No se guardaron productos, ofertas, pedidos, cupones ni cambios de inventario.

### Hashes verificados

| Recurso | SHA-256 |
| --- | --- |
| Manifiesto del paquete sellado | a871e7cac17801f5a96901d079683a9688b44ea5fe7073f17f5ecb94ced8eee4 |
| Configuración de lanzamiento | bce0e0ab8561c7105bdaa48cba3764066aacedac9d40c31d519cb0993cb2d0ac |
| Esquema de desarrollo | b53b7afbad51b4418bc71869b819a6da778d8f3b963eb38b4e6250eb3e0d503f |
| Tipos oficiales | cf372d5d0c5fb269cf9e6c50bc53133d1cc66a658d6eaaeba667e49b500060e6 |
| Worker activo: seo-router.js | 82019eb69cf58c6f4642dc6c7a20afe4cca6f2b4c7047c10561bebc2183fbbd3 |
| /assets/index-CjLNOEdL.js | 2886d4abc541e630982e147510b4c15406a8b2a54ad83f7134330b429994f9ae |
| /assets/index-Dfg5-yCg.css | c96b4a6912905bd10ad74dbcf0e73a7b502f305ce22cde1c40756cc8bd31b0bb |
| /assets/admin-protected-read-sKbHpQSH.js | 8e80c7c6ff591c40b60490339b45983beea81ac4fc1ebcb6faa18707bad28e11 |
| /assets/catalog-admin-service-COra9fUf.js | 3e69b17c1d6c98e24763bfb73af65c939af1a9f9a661331b8ee196ab538e33dd |
| /assets/order-admin-service-C1KV1e3h.js | cb6ad0bd592cfffd90cac30efccf482c95744493318a4fbaf1d1d9f27f0cad13 |

Todos los hashes de JS/CSS y los módulos Worker/WASM figuran en [verified-final.json](../artifacts/admin-fluidity-2026-11-15/verified-final.json). El Worker activo se descargó mediante la API oficial y se calculó su SHA-256; se comprobó la procedencia de su versión antes y después. **No existe una copia histórica local del bundle Worker original para afirmar una comparación binaria con aquel upload.** Su ETag no se interpreta como SHA-256. Sí existe comparación exacta del paquete estático y los 126 recursos HTTP.

## Navegación administrativa: comparación contemporánea

Medición desde clic de navegación hasta el contenido esperado de la ruta, después de calentar el código. **72 navegaciones SPA**: cuatro destinos, tres perfiles, dos versiones y tres repeticiones; orden AB/BA alternado. Se mantuvieron paginación remota y comprobaciones de servidor. No se introdujo caché de respuestas privadas resueltas.

| Perfil | Ruta | Antes, mediana ms | Candidata, mediana ms | Reducción |
| --- | --- | ---: | ---: | ---: |
| Escritorio | Productos | 276 | 159 | 42.4 % |
| Escritorio | Pedidos | 278 | 153 | 45.0 % |
| Escritorio | Clientes | 270 | 152 | 43.8 % |
| Escritorio | Resumen | 283 | 167 | 40.9 % |
| Móvil 9 Mbps | Productos | 386 | 257 | 33.3 % |
| Móvil 9 Mbps | Pedidos | 363 | 230 | 36.6 % |
| Móvil 9 Mbps | Clientes | 354 | 207 | 41.6 % |
| Móvil 9 Mbps | Resumen | 380 | 246 | 35.4 % |
| Móvil lento 1,6 Mbps | Productos | 455 | 275 | 39.5 % |
| Móvil lento 1,6 Mbps | Pedidos | 434 | 269 | 38.0 % |
| Móvil lento 1,6 Mbps | Clientes | 421 | 249 | 40.9 % |
| Móvil lento 1,6 Mbps | Resumen | 451 | 277 | 38.4 % |

Medianas agregadas de doce observaciones por versión/perfil: **277 → 157 ms** en escritorio, **365 → 236 ms** en móvil y **435 → 271 ms** en móvil lento. Son una nueva comparación emparejada de cuatro rutas; no deben restarse directamente de las antiguas cohortes heterogéneas de 138/504/591 ms.

### Causa y validación de la solución

En el brazo anterior, las 45 solicitudes HTTP de lectura RPC medidas empezaron después de terminar GET /auth/v1/user: mediana de separación **+4,3 ms**, sobre un viaje Auth de unos 142 ms. En la candidata, **45/45 empezaron mientras Auth seguía en curso**, mediana **139 ms antes** de que finalizara; también se solaparon con current_actor. Auth y las RPC conservaron respuestas reales, no se sustituyeron por datos cacheados.

La latencia HTTP mediana de esas solicitudes RPC fue 153 → 171 ms en esta muestra; no es una medición de ejecución interna de PostgreSQL. La mejora proviene de eliminar la espera serial, **no de afirmar que PostgreSQL se hizo más rápido**. El cliente espera las verificaciones antes de publicar registros; RLS, membresía y MFA siguen siendo autoritativos. Las pruebas aisladas cubren Auth rechazada con actor válido, logout, cambio/renovación de token, resultados anteriores a una escritura e invalidación. En Supabase real, la identidad QA AAL1 recibió 403/42501; solo después de TOTP/AAL2 pudo leer.

### Cargas completas del administrador

96 cargas de documento, dos muestras por ruta/perfil/versión/estado de caché. Tabla agregada: ocho observaciones por celda/version. Incluye arranque de JS y React; no es la misma métrica que navegación SPA.

| Perfil | Caché HTTP | Mediana antes → candidata, ms |
| --- | --- | ---: |
| Escritorio | Fría | 2246 → 1312 |
| Escritorio | Caliente | 977 → 466 |
| Móvil 9 Mbps | Fría | 2137 → 2185 |
| Móvil 9 Mbps | Caliente | 1117 → 671 |
| Móvil lento 1,6 Mbps | Fría | 4190 → 4211 |
| Móvil lento 1,6 Mbps | Caliente | 1154 → 1173 |

Las **48 cargas calientes transfirieron cero bytes de JS/CSS** según ResourceTiming. La carga completa fría de móvil no mejoró de forma demostrable; móvil lento quedó prácticamente igual y su carga caliente varió unos 19 ms. No se oculta esa limitación ni se atribuyen esos valores a DNS sin una traza correspondiente. El primer ejecutor usaba page.route y desactivaba la caché HTTP: se conservó como intento inválido para fría/caliente y se repitió íntegramente con CDP y prueba explícita de caché; no se usa su resultado para esta tabla.

También se completaron **126 cambios de ruta por las 14 secciones administrativas**, en escritorio/móvil/móvil lento, sin errores de página ni desbordamientos. Esa prueba complementaria mide disponibilidad del encabezado/ruta; no certifica que todos los procesos de fondo hayan finalizado. Su primera entrada a Productos repite la URL inicial y se considera no-op, no una muestra válida de velocidad. La prueba emparejada anterior evita ese problema.

## Home, Tienda y Producto: medición pública desplegada

**54 visitas de referencia y 54 de candidata**: tres páginas × tres perfiles × tres repeticiones × fría/caliente. Chrome con proceso nuevo por pareja fría/caliente; sin proxy, interceptación ni inyección de precargas. Misma máquina/ISP. Móvil emulado: CPU ×4; red 9 Mbps/80 ms o 1,6 Mbps/150 ms. Cada celda contiene tres muestras.

| Perfil | Página | Caché | LCP antes → candidata, ms | Foto decodificada antes → candidata, ms |
| --- | --- | --- | ---: | ---: |
| Escritorio | Home | Fría | 972 → 1148 | 910 → 1090 |
| Escritorio | Home | Caliente | 280 → 340 | 277 → 332 |
| Escritorio | Tienda | Fría | 900 → 1680 | 891 → 1637 |
| Escritorio | Tienda | Caliente | 284 → 328 | 223 → 254 |
| Escritorio | Producto | Fría | 1428 → 984 | 1114 → 800 |
| Escritorio | Producto | Caliente | 296 → 336 | 246 → 261 |
| Móvil 9 Mbps | Home | Fría | 1276 → 1296 | 1248 → 1269 |
| Móvil 9 Mbps | Home | Caliente | 480 → 408 | 475 → 394 |
| Móvil 9 Mbps | Tienda | Fría | 1376 → 1288 | 1363 → 1280 |
| Móvil 9 Mbps | Tienda | Caliente | 372 → 376 | 358 → 370 |
| Móvil 9 Mbps | Producto | Fría | 1276 → 1240 | 1277 → 1239 |
| Móvil 9 Mbps | Producto | Caliente | 412 → 424 | 404 → 414 |
| Móvil lento 1,6 Mbps | Home | Fría | 3260 → 3268 | 3223 → 3243 |
| Móvil lento 1,6 Mbps | Home | Caliente | 528 → 588 | 528 → 593 |
| Móvil lento 1,6 Mbps | Tienda | Fría | 3232 → 2916 | 3219 → 2899 |
| Móvil lento 1,6 Mbps | Tienda | Caliente | 468 → 496 | 459 → 474 |
| Móvil lento 1,6 Mbps | Producto | Fría | 3264 → 3320 | 3266 → 3316 |
| Móvil lento 1,6 Mbps | Producto | Caliente | 480 → 448 | 473 → 432 |

Las cohortes se tomaron en momentos diferentes y contienen variación de red. Por ejemplo, Tienda/escritorio tiene LCP 900 → 1680 ms, mientras su TTFB pasó de unos 312 → 1239 ms y dos de tres resoluciones DNS de candidata rondaron un segundo. No se presenta esa diferencia bruta como coste de React ni como una mejora; se conserva en la tabla.

### Precarga real de la primera imagen de Tienda

En las nueve cargas frías de Tienda de la candidata, el iniciador pasó de img a link, con una sola solicitud de la imagen seleccionada por visita. El srcset sigue apuntando a variantes reales del manifiesto y conserva exactamente las imágenes comerciales.

| Perfil | Inicio de imagen después de cabeceras, antes → candidata ms | Foto lista después de cabeceras, antes → candidata ms |
| --- | ---: | ---: |
| Escritorio | 438 → 86 | 579 → 401 |
| Móvil 9 Mbps | 893 → 38 | 1094 → 917 |
| Móvil lento 1,6 Mbps | 2507 → 46 | 2954 → 2651 |

En móvil lento, la solicitud dejó de esperar unos **2507 ms** después de las cabeceras y comienza en **46 ms**. La foto lista pasó de 2954 a 2651 ms después de cabeceras; el LCP bruto mediano pasó de **3232 a 2916 ms**. La descarga ahora puede solaparse con el arranque; React y su representación siguen limitando el momento de aparición. No se usa la inyección experimental de cabecera como evidencia de la candidata.

### Control adicional de la variación caliente

Se añadieron **18 cargas AB/BA emparejadas** en móvil lento, después de calentar las tres rutas en ambos contextos. JS/CSS desde caché verificados con ResourceTiming y CDP, sin SW ni modificación de red del sistema.

| Página | LCP antes → candidata ms | Foto lista antes → candidata ms | Ruta disponible antes → candidata ms |
| --- | ---: | ---: | ---: |
| Home | 500 → 444 | 499 → 439 | 355 → 337 |
| Tienda | 400 → 420 | 348 → 366 | 318 → 315 |
| Producto | 432 → 420 | 346 → 338 | 316 → 322 |

Home no reprodujo la regresión uniforme sugerida por la cohorte separada; Producto tampoco. Tienda caliente mostró **400 → 420 ms de LCP**, con diferencias emparejadas de +28/−24/+44 ms y sin tareas largas. Su ruta estuvo disponible en 318 → 315 ms. No hay evidencia para adjudicar esos 20 ms a PostgreSQL o una nueva espera de red.

En este control, Chrome prefirió la variante de 960 px ya cacheada después de visitar Producto; la precarga leyó también 480 px desde disco. **Las dos transferencias fueron cero bytes** y CDP identificó ambas como caché. Esto explica una entrada adicional en el registro de recursos, no una segunda descarga HTTP a R2. Los headers de esas copias cacheadas no se interpretan como una llamada nueva al upstream. Se conserva el caso como límite de reutilización responsive del navegador, sin cambiar arbitrariamente tamaños o calidad.

### Bloqueo, memoria y red

En móvil lento/frío, el bloqueo acumulado de tareas >50 ms fue Home 58 → 69 ms, Tienda 62 → 57 ms y Producto 63 → 57 ms. La memoria JS se mantuvo aproximadamente en 6,2–6,6 MB; la transferencia cambió solo unas centenas de bytes. CLS mediano fue cero en las tres páginas. No hay una nueva reducción general del bloqueo JavaScript demostrada; **no se hizo otra fragmentación ni se cambió CSS**. No hay INP de campo disponible; estas observaciones de laboratorio no lo sustituyen.

Los NetLog de candidata reprodujeron ocho trabajos de resolución de 1013–1029 ms entre 27 parejas, frente a uno entre 27 de referencia. Los IDs, CF-Ray y tiempos permanecen en las evidencias. La resolución transcurre antes de iniciar la petición HTTP; el patrón de timeout/reintento del resolver ya documentado volvió a aparecer. No demuestra por sí solo si el origen último es el equipo, el primer resolver, un paquete perdido o su upstream. No se modificaron DNS, IPv6, HTTP/2, HTTP/3, Cloudflare ni producción.

Home y Producto continúan cerca de **3,3 s de LCP frío** con red lenta, incluso sin un pico DNS: Home frío 3260 → 3268 ms y Producto 3264 → 3320 ms. Son limitaciones pendientes documentadas, no objetivos declarados resueltos. Las trazas separan fin de CSS/JS, montaje, fotografía y LCP; una imagen terminada antes no garantiza que React ya la esté mostrando.

## Validación funcional y de seguridad

| Prueba | Resultado | Alcance |
| --- | --- | --- |
| catalog | 91/91; 0 fallos, flaky o saltos | repetida en este cierre, sola; transporte aislado |
| orders | 34/34; 0 fallos, flaky o saltos | aprobada en la fase de implementación conservada; transporte aislado |
| auth | 82/82; 0 fallos, flaky o saltos | aprobada en la fase de implementación conservada; transporte aislado |
| commerce | 18/18; 0 fallos, flaky o saltos | aprobada en la fase de implementación conservada; transporte aislado |
| media-browser | 30/30; 0 fallos, flaky o saltos | aprobada en la fase de implementación conservada; transporte aislado |
| seo | 60/60; 0 fallos, flaky o saltos | aprobada en la fase de implementación conservada; transporte aislado |
| TypeScript y lint | APROBADO, repetidos al cierre | Código conservado |
| Node | 198/198, repetidos al cierre | Contratos aislados |
| PostgreSQL nativo aislado | 994 comprobaciones, 42 migraciones, rollback de fixtures | Evidencia conservada; no equivale a pagos/GoTrue reales |
| Build candidato y paquete Wrangler | APROBADO; paquete sellado íntegro | Se validó el artefacto ya compilado, sin reconstruir durante catálogo91 |
| Recorridos de cliente alojados | 16/16 | Ocho resoluciones, fría/caliente; nunca enviar pedido/pago |
| Navegación táctil real con locator.tap | 20/20 | Cinco anchos móviles; menú, foco, main no inert, sin vídeo/overflow |
| Excel/oferta/selectores/Home alojados | 12/12 | Tres viewports; solo borrador, revisión y vista previa |
| Seguridad HTTP multimedia alojada | 9/9 | HIT de bytes, manifiesto nuevo por lectura, HEAD/304, rechazos 404/401 |
| Auth/TOTP alojados | APROBADO | Identidades QA propias, AAL1 denegado, AAL2 permitido; retiradas al terminar |
| Supabase final | APROBADO | Esquema, 42 migraciones, 11 verificaciones base, permisos/RLS y datos estables |

Las seis suites Playwright anteriores reúnen 315 casos; los nueve de selection están incluidos en catálogo y no se suman otra vez. Solo catálogo91 se repitió completo en esta reanudación; las otras aprobaciones se conservan de la implementación verificada. Ningún fallo funcional final quedó abierto.

Los recorridos reales revisaron ordenamiento, búsqueda y vacío, marca y retirada del filtro, detalle y fotografía real, favoritos de invitado, variante de 100 ml, carrito y apertura de checkout. No se enviaron pedidos, no se probaron cobros reales y no se certifica una compra de producción.

Excel alojado analizó una fila, consultó admin_import_conflicts y llegó a revisión sin importar. Ofertas consultó identidades y solo el producto seleccionado, abrió precios por presentación y descartó el borrador. Se comprobaron marca/familias en Nuevo producto y preguntas del recomendador. No se llamó al listado completo del catálogo en estos flujos. Los escenarios de 3000 productos/1000 marcas/ofertas y Excel de 1000 identidades corresponden a las suites y PostgreSQL **aislados**, no a miles de datos comerciales introducidos en Supabase alojado.

R2 sigue privado. La caché conserva bytes, no decisiones de publicación: image/repeat devolvieron IDs de Worker y upstream distintos aun siendo HIT. Namespace interno, variante inexistente y prefijo privado devolvieron 404; carga anónima 401; respuesta condicional 304. Auth, MFA, permisos, precios, stock y checkout no se cambiaron.

## Capturas e integridad visual

Las capturas de Productos, Pedidos, Clientes y Resumen en escritorio son **idénticas byte por byte** entre brazos. Se inspeccionaron además Productos a 320 px y detalle/checkout móviles. Las capturas completas pueden mostrar contenido inferior aún reservado por sus animaciones de entrada; no se desactivó ni rediseñó ese comportamiento.

- Productos: [antes](../artifacts/admin-fluidity-2026-11-15/screens/paired-baseline-desktop-products.png) / [candidata](../artifacts/admin-fluidity-2026-11-15/screens/paired-candidate-desktop-products.png).
- Pedidos: [antes](../artifacts/admin-fluidity-2026-11-15/screens/paired-baseline-desktop-orders.png) / [candidata](../artifacts/admin-fluidity-2026-11-15/screens/paired-candidate-desktop-orders.png).
- [Administrador a 320 px](../artifacts/admin-fluidity-2026-11-15/screens/touch-320-products.png).
- [Ficha a 390 px](../artifacts/admin-fluidity-2026-11-15/screens/final-product-390-cold-context.png).
- [Checkout a 320 px, sin enviar](../artifacts/admin-fluidity-2026-11-15/screens/final-checkout-320-cold-context.png).

Viewports funcionales: 1920×1080, 1440×900, 768×1024, 320×740, 360×800, 390×844, 412×915 y 430×932. La prueba táctil usó 320×800 en su primer teléfono. Son emulaciones Chrome; no se presentan como pruebas con teléfonos físicos ni otros ISP.

## Producción y pendientes

El Worker de producción conserva deployment **9baa7c50-262a-4f23-bf52-5742a52ffa0b**, versión **ec8554f6-d47a-4af0-ba60-4623c8125020**. Su huella de metadatos antes/después es idéntica: **864d0f863f3afe06d0a6c85581edd96340c0618844f86006e2c2d5c1ded41ec9**. No hubo despliegues, migraciones, consultas SQL ni cambios de recursos de producción en esta intervención; la lectura de su deployment fue solo de comprobación.

Pendientes demostrados: fallback DNS intermitente externo a la petición HTTP; arranque frío de Home/Producto en móvil lento; pequeña variación caliente de Tienda; precisión limitada de colas de latencia con tres muestras por celda. No se ocultaron aumentando timeouts/reintentos ni cambiando protocolos, calidad, animaciones o seguridad. No bloquean la evidencia de que la regresión SPA de las cuatro rutas se recuperó; tampoco equivalen a afirmar que toda carga fría sea instantánea.

Evidencia final legible por máquina: [closure-complete.json](../artifacts/admin-fluidity-2026-11-15/closure-complete.json). Detalle de métricas: [admin](../artifacts/admin-fluidity-2026-11-15/closure-admin-summary.json), [público](../artifacts/admin-fluidity-2026-11-15/closure-public-summary.json), [control caliente](../artifacts/admin-fluidity-2026-11-15/public-warm-paired.json). Estado remoto/Git: [closure-final-state.json](../artifacts/admin-fluidity-2026-11-15/closure-final-state.json). Logs históricos y experimentos se conservaron sin sobrescribir su interpretación.
