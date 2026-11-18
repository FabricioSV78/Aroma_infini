# Intervención de rendimiento público — 13 de noviembre de 2026

## Resultado y alcance

**APROBADO en staging:** cambios publicados y verificados, 40 migraciones sincronizadas en desarrollo, pruebas funcionales y de seguridad terminadas y datos temporales retirados. **Producción no fue modificada ni se realizaron cobros.**

La mejora principal está en Home y Tienda. La ficha no muestra una mejora consistente en escritorio: no presento esa ruta como una ganancia importante. Persisten variaciones HTTP del backend y un coste de arranque/renderizado en CPU limitada; esta entrega no promete cargas instantáneas ni certifica Core Web Vitals de usuarios reales.

## Causas y cambios conservados

| Hallazgo medido | Corrección |
| --- | --- |
| El listado completo de distritos del Perú formaba parte del arranque de todas las rutas públicas | Índice derivado con códigos y jerarquías para validar cobertura; nombres completos cargados solo por los módulos que los necesitan. Se conserva el JSON canónico y se comprueba su equivalencia automáticamente. |
| Home emitía un perfil por producto, aunque muchos eran idénticos | Migración 40 conserva las primeras y últimas apariciones de cada perfil idéntico, mantiene el orden y añade el conteo real de perfumes disponibles. No modifica productos, precios, ventas ni resultados comerciales. |
| Home/Tienda solicitaban sus datos públicos después de descargar y arrancar React | Proyecciones anónimas frescas incluidas en el documento, con la misma validación del SDK. Se consumen una vez y solo para proyecto, ruta y consulta coincidentes. |
| Esperar esas proyecciones antes del HTML retrasaba recursos en conexiones rápidas | Se envía primero el shell y sus recursos; el JSON inerte llega antes de cerrar el documento. La entrega progresiva se conserva para Home/catálogo. En fichas se mantuvo el camino anterior más simple, porque el experimento no acreditó beneficio. |
| Volver al catálogo podía repetir una lectura tras utilizar la proyección inicial | La proyección validada alimenta la caché pública existente, únicamente por el tiempo restante de sus cinco segundos. No sobrescribe lecturas nuevas/en curso ni sobrevive a invalidaciones. |
| La primera petición posterior del SDK podía abrir una conexión nueva | Una sola indicación de preconexión al origen Supabase configurado, sin leer datos ni enviar credenciales. Es una sugerencia al navegador; no atribuyo mejoras grandes de latencia a esta indicación. |
| Las URLs de vista previa podían mezclar orígenes de imágenes y condiciones de ejecución | Comparación definitiva bajo el mismo hostname, alternando versiones mediante la función oficial de Cloudflare y comprobando el archivo de arranque recibido. Las mediciones entre hostnames distintos son exploratorias. |

El chunk común pasó de **534724 a 477534 bytes sin compresión**. No se añadieron dependencias ni se cambió package-lock.json. El guard de compilación impide introducir de nuevo los nombres completos de distritos o módulos privados en el grafo inicial. Todos los CSS de la compilación publicada son idénticos por SHA-256 a los del control: no se modificaron diseño, tipografías ni animaciones.

### SQL: equivalencia y volumen

- Prueba alojada con **1.001 productos y 2.002 presentaciones**: 1.000 productos temporales identificados más el catálogo existente; ningún pedido creado.
- Home: **1001 → 3 perfiles**, manteniendo el conteo real, el vocabulario y el orden que consumen marcas/recomendador.
- JSON lógico minificado: **223711 → 26135 bytes**. Esta reducción del 88,3 % **no equivale** a una reducción igual del tráfico comprimido: los duplicados también se comprimen. Los bytes HTTP/JavaScript observados están en las evidencias.
- EXPLAIN (ANALYZE, BUFFERS), cinco muestras por alternativa sobre el mismo volumen: mediana **67.334 → 61.183 ms**. La función experimental se probó en una transacción y se revirtió antes de aplicar la migración versionada.
- Se verificaron los consumidores reales con 10.000 perfiles sintéticos y las reglas SQL con datos aislados. Esto comprueba equivalencia; no es una medición de carga alojada con 10.000 productos.
- Se compararon 2.249 elementos de metadatos SQL: únicamente cambió api.catalog_home_context(). Permanecen iguales tablas, relaciones, índices, triggers, RLS y permisos. Se conservaron **120 índices**; no se añadieron índices sin justificación.
- catalog_browse, precios finales, ventas para más vendidos, inventario y checkout conservan sus funciones y reglas existentes. La mejora del catálogo es del recorrido HTTP/renderizado, no una nueva reescritura de esa RPC.

La compactación aprovecha perfiles repetidos. Con perfiles todos diferentes no debe esperarse la misma reducción de respuesta. Se conserva el límite previo de 10.000 productos de la RPC del Home.

## Despliegue comprobado antes de medir

| Elemento | Estado verificado |
| --- | --- |
| Worker | aroma-infini-frontend-staging |
| Versión final | 82fa9a15-8c84-4d4c-acd3-6271972e828d |
| Deployment final, una sola versión al 100 % | 14c06e01-2589-40fd-8047-70d84ab7dccc |
| Origen probado | [Staging](https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev/) |
| Paquete frontend sellado, SHA-256 | c58b9d00e758ba9a7c702110ed6dc05d9b4b96ce5290df4f5a18e24e5a651c8e |
| Supabase de desarrollo | tkxvexfapszilzhogvgu; 40 migraciones coincidentes con el repositorio |
| Migración aplicada | 20261113000100_home_profile_projection.sql |
| R2 | aroma-infini-media-dev; acceso público directo desactivado; manifiestos y referencias conservados |
| Código de control | 02965b4a-f38b-4234-bc30-97c83f8d64f8 |
| Git | HEAD 7d2f3648e3b149023910a385bf9510f0ebf60d10, árbol de trabajo con cambios previos y actuales; no se creó commit ni se hizo push |

Se comprobaron HTML servido, assets contra dist byte a byte, configuración/bindings del Worker, proyecto utilizado y privacidad de R2. Durante la comparación, el control recibió 0 % del tráfico normal y solo las solicitudes de prueba con override. Al terminar se retiró del deployment activo. La publicación de un build local no se trató como prueba de despliegue.

## Comparación definitiva en Chrome

**84 cargas seriales**, AB/BA, sobre las versiones alojadas y el mismo esquema SQL ya sincronizado. Cuatro muestras por versión/página en escritorio, cuatro en móvil 9 Mbps/80 ms/CPU ×4 y seis en móvil 1,6 Mbps/150 ms/CPU ×4. Caché HTTP del navegador vacía, sin purgar toda la CDN. No se ejecutaron builds, pruebas pesadas ni otros perfiles de Chrome en paralelo.

Medianas de LCP, segundos:

| Página | Escritorio | Móvil 9 Mbps, CPU ×4 | Móvil 1,6 Mbps, CPU ×4 |
| --- | --- | --- | --- |
| Home | 1.344 → 0.694 | 1.480 → 1.304 | 3.466 → 3.160 |
| Tienda | 1.284 → 1.104 | 1.866 → 1.564 | 3.686 → 3.472 |
| Ficha | 1.158 → 1.184 | 1.406 → 1.402 | 3.350 → 3.276 |

Todos los grupos registraron **CLS 0** y ningún desbordamiento horizontal o error JavaScript. En fichas móviles algunas muestras eligen el logo como candidato LCP; por eso también se comprobó el contenido, la fotografía real decodificada y la navegación. LCP no se presenta como tiempo de descarga completa de toda la galería.

**Caso adverso conservado:** una carga final de Home en escritorio llegó a **3.796 ms**, frente a 984–1.476 ms del control de ese grupo. Las consultas públicas superaron su presupuesto de un segundo y se activó la lectura alternativa del navegador. No se eliminó la muestra. La mediana mejoró, pero la cola de latencia de ese caso empeoró.

### JavaScript y bloqueo en móvil lento

| Página | Ejecución JS, ms, antes → después | Bloqueo observado, ms, antes → después | Bytes JS HTTP observados, antes → después |
| --- | --- | --- | --- |
| Home | 211.5 → 207.6 | 49 → 57 | 261215.5 → 245047.5 |
| Tienda | 196.9 → 188.8 | 53.5 → 64.5 | 250953 → 234834.5 |
| Ficha | 191.6 → 182.7 | 58 → 58.5 | 258110.5 → 242044 |

El bloqueo es la suma de la duración que excede 50 ms por tarea durante la ventana observada; no es una puntuación Lighthouse ni INP de campo. **No disminuyó de forma general**, aunque bajaron el JavaScript transferido y parte de su ejecución. No se aplicaron más divisiones de bundles o cambios de CSS sin beneficio probado.

Las trazas adicionales de DevTools dieron ahorro estimado de CSS bloqueante de **0 ms**. En una traza móvil de Home: LCP 4.223 ms, TTFB 563 ms, descubrimiento 64 ms, descarga 2.455 ms y retraso de representación 1.141 ms. Es una captura diagnóstica con el preset de DevTools, distinta de la serie AB/BA; no se mezcla con sus medianas. En otra traza de Tienda, el candidato fue el logo: tampoco se interpreta como fotografía completamente visible.

### Navegación con datos/código calientes

Tres recorridos por versión y perfil. Se midió dentro del navegador desde el clic real hasta el siguiente fotograma con la ficha, y desde popstate hasta el catálogo. Los tiempos de espera de selectores de Playwright no se cuentan como renderizado.

| Perfil | Catálogo → ficha, ms | Volver al catálogo, ms |
| --- | --- | --- |
| desktop | 243 → 283 | 15 → 15 |
| slowMobile | 342 → 365 | 67 → 101 |

No hay una mejora concluyente al entrar en ficha. Volver mientras la proyección sigue vigente reutiliza la caché. En una muestra móvil se volvió después de cinco segundos y se hizo una consulta nueva: se mantuvo esa caducidad para no mejorar artificialmente el resultado conservando precios/stock antiguos. Las trazas y los tiempos de DNS/TLS/HTTP se conservaron.

## Workers, R2 y alternativas de arquitectura

Se mantiene la arquitectura híbrida: archivos estáticos mediante Workers Assets, HTML/API con lógica mediante Worker, consultas interactivas públicas del SDK y almacenamiento R2 privado. Las rutas estáticas de assets/imágenes/vídeos locales no invocan innecesariamente el código del Worker. Migrar a Pages no elimina las lecturas de Supabase ni la validación de medios; no se encontró una razón medida para realizar esa migración. No se presenta una comparación real Pages/Workers que no se haya desplegado. [Enrutamiento oficial de Assets](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).

Se hicieron 12 GET de imágenes R2, comprobaciones de representación completa y dos grupos de tres lecturas simultáneas de HTML. Las imágenes repetidas conservaron el mismo SHA-256. El endpoint existente ignora Range en WebP y devuelve la imagen íntegra con 200; los rangos 206 de vídeo tienen pruebas específicas del Worker. No se cambiaron esas reglas.

Hubo una respuesta de imagen de unos **2.047 ms**: Server-Timing atribuyó **1.732 ms a la lectura HTTP del manifiesto y 174 ms al almacenamiento**. En las estadísticas SQL acumuladas, media_public_asset promedió aproximadamente **1,52 ms** y su máximo fue **138 ms**. No son la misma muestra correlacionada; permiten descartar que todo ese retraso sea, sin más, ejecución SQL de 1,7 segundos. La localización exacta entre red, gateway y espera de conexión requiere trazas correlacionadas del proveedor. No se concluye que contratar Pro resuelva este caso.

Las respuestas tienen caché de navegador inmutable, pero **eso no demuestra un HIT de CDN**. No se proclamó entrega R2 caliente en CDN cuando las cabeceras no lo acreditaban. El dominio r2.dev no proporciona la caché CDN de un dominio R2 personalizado y no es una entrega de producción. [Documentación de R2/CDN](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/).

Se conservaron los resultados del [experimento anterior de R2 y arquitectura](FRONTEND_ARCHITECTURE_R2_REVIEW_2026_11_13.md). No se abrió el bucket privado ni se publicaron borradores. Con un dominio disponible, corresponde comparar caché después de validar el manifiesto o un bucket separado que contenga solo copias publicadas y verificadas, incluyendo su limpieza. No se activó caché delante de todo el Worker: omitir su ejecución podría omitir las validaciones. [Distinción de Workers Cache](https://developers.cloudflare.com/workers/cache/).

## Pruebas e integridad

| Grupo | Resultado |
| --- | --- |
| TypeScript, lint y build de staging sellado | Aprobados |
| Node | 198 aprobadas |
| catalog | 87 aprobadas; 0 omitidas |
| seo | 53 aprobadas; 0 omitidas |
| auth | 81 aprobadas; 0 omitidas |
| checkout | 24 aprobadas; 0 omitidas |
| commerce | 18 aprobadas; 0 omitidas |
| ui | 88 aprobadas; 0 omitidas |
| home | 8 aprobadas; 0 omitidas |
| media | 140 aprobadas; 0 omitidas |
| mobile | 15 aprobadas; 0 omitidas |
| profiles | 2 aprobadas; 0 omitidas |
| PostgreSQL aislado | 929 comprobaciones y pruebas de concurrencia aprobadas; 40 migraciones |
| API pública alojada | 55 comprobaciones aprobadas, sin altas ni escrituras autorizadas |
| UI alojada | Flujo de filtros, orden, página 2, búsqueda, vacío, ficha, carrito y checkout aprobado en 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844 |
| Vídeo alojado | Reproducción y pausa fuera de pantalla en escritorio; 0 solicitudes de vídeo y 0 elementos video al recorrer Home en 768 y 390 px |
| Tras limpiar fixtures | Home, catálogo original y ficha aprobados en escritorio y móvil |

Las pruebas de SDK/navegador aisladas usan transporte controlado y no se presentan como compras reales. Las pruebas alojadas sí utilizaron frontend, Supabase, Worker y R2 reales, pero **se detuvieron antes de enviar un pedido/pago**. La pasarela real no forma parte de esta entrega.

Los 1.000 productos y su marca temporal fueron retirados con sus UUID exactos, comprobando pedidos, favoritos y reseñas y bloqueando únicamente esos productos durante la comprobación. Se verificaron los hashes originales y las secuencias comerciales. Estado final: **1 producto, 2 variantes, 0 pedidos; 0 productos/marcas de esta prueba**. No se crearon ni borraron objetos R2 para los fixtures: reutilizaron fotos ya existentes. Se hizo mantenimiento VACUUM/ANALYZE únicamente en desarrollo después de retirarlos.

## Límites y acciones posteriores

| Estado | Punto |
| --- | --- |
| APROBADO | Código de esta intervención, frontend, Worker y migración sincronizados en staging; sin pruebas importantes de esta entrega pendientes |
| APROBADO | Seguridad, caducidad e invalidación conservadas; ninguna caché nueva de Auth, usuarios, pedidos o cotizaciones transaccionales |
| PENDIENTE de observación | Variación HTTP y fallbacks ante upstream lento. No se ocultó con precios/stock obsoletos ni relajando RLS |
| PENDIENTE de validación real | CrUX/INP y capacidad con tráfico comercial; esta emulación no equivale a teléfonos físicos ni a una prueba de miles de usuarios simultáneos |
| PENDIENTE de material | Se utilizaron 1.000 productos con fotografías reutilizadas. La transferencia de 12 imágenes comerciales diferentes debe medirse cuando estén disponibles |
| PENDIENTE del dominio | DNS/TLS, CDN multimedia personalizado y comparación MISS/HIT en el dominio definitivo; no basta con r2.dev |
| FUERA DE ESTA ENTREGA | Publicar estos cambios en producción y aplicar allí la migración requiere autorización; no se ejecutó |

Todavía existe un coste de descarga y representación del frontend, especialmente con CPU ×4. No afirmo haber alcanzado un límite absoluto. Un salto adicional mediante renderizado de contenido/hidratación desde servidor requeriría un prototipo específico y validación de Auth/carrito/CMS; no se hizo una refactorización general por intuición. Tampoco se sacrificaron imágenes, efectos o funcionalidades para obtener mejores números.

## Evidencias reproducibles

Directorio local: artifacts/root-performance-2026-11-13/.

- final-evidence.json: versión, deployment, paquete y huellas del código, sin secretos.
- deployed-verification.json y staging-deployments-after.json: publicación real y assets servidos.
- after-final-confirmation-browser.json y after-final-confirmation-comparison.json: 84 cargas definitivas.
- before-journey.json, after-journey.json y traces/: navegación y trazas Chrome.
- home-prototype.json, volume-before-remote.json y volume-after-remote.json: SQL con el mismo volumen; after-remote.json corresponde al estado ya limpio y no se usa para atribuir ganancias por volumen.
- functional-hosted.json, video-hosted.json, http-final.json y public-security-final.log: servicios alojados.
- fixture-manifest.json y cleanup-verification.json: retiro de datos temporales e integridad.
- screens/: capturas de ambas versiones y checkout en cinco resoluciones.
- chrome-home-lcp.txt, chrome-home-css.txt, chrome-store-lcp.txt y chrome-store-css.txt: diagnóstico adicional de DevTools.

Capturas: [Home móvil antes](../artifacts/root-performance-2026-11-13/screens/final-confirmation-baseline-slowMobile-home.png), [Home móvil después](../artifacts/root-performance-2026-11-13/screens/final-confirmation-final-slowMobile-home.png), [Tienda después](../artifacts/root-performance-2026-11-13/screens/final-confirmation-final-desktop-store.png), [Checkout escritorio](../artifacts/root-performance-2026-11-13/screens/final-checkout-1920.png) y [Checkout móvil](../artifacts/root-performance-2026-11-13/screens/final-checkout-390.png).

La aplicación se construyó desde el árbol de trabajo revisado, no desde un commit nuevo. Las capturas, scripts de investigación y resultados permanecen como artefactos locales ignorados por Git. El informe y los cambios de producto están en el proyecto; no se hizo commit, push ni despliegue de producción.

### Rangos completos de LCP, milisegundos

| Versión | Perfil | Página | n | Mínimo–máximo | Mediana |
| --- | --- | --- | --- | --- | --- |
| baseline | desktop | Home | 4 | 984–1476 | 1344 |
| baseline | desktop | Tienda | 4 | 1244–1420 | 1284 |
| baseline | desktop | Ficha | 4 | 1104–1384 | 1158 |
| baseline | mobile | Home | 4 | 1432–1584 | 1480 |
| baseline | mobile | Tienda | 4 | 1788–2052 | 1866 |
| baseline | mobile | Ficha | 4 | 1332–1436 | 1406 |
| baseline | slowMobile | Home | 6 | 3412–3560 | 3466 |
| baseline | slowMobile | Tienda | 6 | 3632–4704 | 3686 |
| baseline | slowMobile | Ficha | 6 | 3308–3552 | 3350 |
| final | desktop | Home | 4 | 640–3796 | 694 |
| final | desktop | Tienda | 4 | 1000–1336 | 1104 |
| final | desktop | Ficha | 4 | 1120–1392 | 1184 |
| final | mobile | Home | 4 | 1276–1380 | 1304 |
| final | mobile | Tienda | 4 | 1560–1616 | 1564 |
| final | mobile | Ficha | 4 | 1308–1444 | 1402 |
| final | slowMobile | Home | 6 | 3148–3200 | 3160 |
| final | slowMobile | Tienda | 6 | 3456–3564 | 3472 |
| final | slowMobile | Ficha | 6 | 3248–3364 | 3276 |
