# Panel administrativo móvil — validación de staging

19 de noviembre de 2026. Adaptación de `/admin` para teléfonos y tabletas, sin cambios en las reglas comerciales ni en el diseño de escritorio. La versión final está desplegada y verificada en staging.

## Resultado y alcance

Se revisaron Resumen, Productos, alta y edición de productos, fotografías, importación Excel, Pedidos y su detalle, Clientes, Marcas, Familias olfativas, Cupones, Ofertas, Home y recomendador, Tarifas de envío, Datos de la tienda, Notificaciones, Reclamaciones y acceso administrativo.

Las reglas nuevas se limitan a pantallas de hasta 1199 px. Desde 1200 px se conservan las reglas existentes de escritorio. No se añadieron dependencias, consultas, endpoints, índices, migraciones ni cachés. Las colecciones siguen utilizando su paginación remota; no se sustituyeron por descargas completas.

Se preservaron precios, inventario, estados y comandos de pedidos, checkout, permisos, RLS, Auth/MFA, separación de sesiones y almacenamiento privado R2. No se realizaron pagos ni escrituras sobre productos, pedidos o configuración comercial alojados.

## Problemas corregidos

| Área | Corrección aplicada |
| --- | --- |
| Navegación | Cabecera compacta y menú en cajón hasta 1199 px; se evita comprimir el contenido con una barra lateral permanente en tabletas. Se conserva el foco y la navegación SPA. |
| Jerarquía | Se retiran de la vista móvil únicamente categorías de encabezado y descripciones genéricas redundantes. Permanecen referencias de pedido, cobertura, ayuda de SKU, recuentos de fotos, errores y avisos de seguridad. |
| Componentes compartidos | Márgenes, separadores, tarjetas, filtros, paginación y diálogos proporcionados. Los controles principales tienen zonas táctiles de 44 px; los campos móviles usan texto de 16 px. |
| Pedidos | Se recupera el checkbox real de «Seleccionar esta página», antes oculto en móvil/tableta. Mantiene estado parcial, conteo y selección entre páginas. «Seleccionar todos los filtrados» continúa siendo una acción distinta y explícita. |
| Acciones masivas | Barra adaptable, cantidad seleccionada, confirmación y resultados por pedido. El diálogo bloquea el cierre mientras procesa. No se duplicó la tabla ni el modelo de selección. |
| Filtros de pedidos | Las fechas se agrupan bajo «Filtrar por fecha» en teléfono. Se mantienen los mismos campos, valores y consultas; una fecha activa abre el grupo. En escritorio siguen visibles. |
| Productos y fotografías | Navegación de secciones desplazable, variantes y controles de imagen adaptables, guardado accesible. Se conservan las cinco posiciones de perfume y la imagen olfativa independiente. |
| Contenido olfativo | Estación y momento usan una columna en teléfonos pequeños para evitar recortar opciones como «Todo el año» o «Por definir». |
| Excel | Archivo, revisión paginada, errores y confirmación accesibles. No se modifica la validación ni se importa automáticamente. |
| Home y promociones | Pestañas compactas y desplazables, formularios y controles avanzados conservados; alta consecutiva de cupones/ofertas disponible. |
| Otros módulos | Tablas y acciones de clientes, familias y marcas adaptadas; tarifas con importes juntos y plazo en su propia fila; configuración y dispositivos con controles accesibles. |
| Estilos diferidos | La especificidad de las reglas impide que los estilos de editores cargados posteriormente reviertan los tamaños táctiles. |

Las ayudas legales, de seguridad o necesarias para completar un formulario no se ocultaron para reducir artificialmente su tamaño. Los menús desplazables mantienen todas sus opciones.

## Archivos de esta intervención

- `src/styles/admin-mobile.css`: sistema responsive compartido.
- `src/features/admin/admin-editor-mobile.css`: productos, imágenes, Excel, contenido y formularios.
- `src/features/admin/admin-orders-mobile.css`: selección, fechas, tarjetas y confirmaciones de pedidos.
- `AdminLayout.tsx`: importación de estilos, breakpoint del cajón y enlace a tienda accesible.
- `AdminShared.tsx`: conservación explícita de descripciones/referencias importantes en móvil.
- `AdminOrdersPage.tsx`: selección de página, despliegue de fechas y bloqueo del diálogo ocupado.
- `AdminProductFormPage.tsx`, `AdminProductPhotoPage.tsx`, `AdminShippingPage.tsx` y `AdminOrderDetailPage.tsx`: marcadores de información que debe permanecer visible.
- `tests/admin-mobile-workspace.spec.ts`: nuevo recorrido transversal de 168 casos.
- `tests/orders-supabase.spec.ts` y `tests/admin.spec.ts`: selección móvil y expectativas responsive actualizadas.

Los demás cambios locales del repositorio provienen de intervenciones anteriores y se conservaron. No se atribuyen a esta adaptación.

## Validación automatizada

Se ejecutaron secuencialmente las suites dirigidas, sin builds o modificaciones simultáneas. **782 casos aprobados en 15 suites; ningún fallo final.** Se añadieron **215 pruebas Node aprobadas**, sin omisiones. La repetición adicional de cinco casos no se suma al total de 782.

| Suite | Casos aprobados |
| --- | ---: |
| Recorrido móvil transversal | 168 |
| UI, formularios y regresiones administrativas | 167 |
| Catálogo remoto, selectores e importación | 92 |
| Pedidos remotos y selección | 42 |
| Operaciones, estados y exportación | 39 |
| Edición y preparación multimedia | 26 |
| Home remoto | 8 |
| Tarifas y configuración comercial | 18 |
| Datos de la tienda | 53 |
| Familias olfativas | 7 |
| Notificaciones | 18 |
| Reclamaciones | 25 |
| Autenticación y permisos | 93 |
| Editores y fotografías múltiples | 14 |
| Campañas del Hero | 12 |

También aprobaron TypeScript, ESLint, build de staging, comprobación del paquete sellado y empaquetado Wrangler mediante `--dry-run`.

### Escenarios funcionales

- Pedidos a 360, 390, 430, 768 y 1024 px: selección individual, parcial, página actual, conservación entre páginas, desmarcado limitado a una página, todos los 65 filtrados, limpieza al cambiar filtros y una sola operación confirmada. Se conserva el límite del comando para más de cien pedidos.
- Paginación remota con 3000 productos y 6000 pedidos mediante transporte aislado. Metadatos con 1000 marcas; sin reconstruir un snapshot completo del catálogo.
- Excel con 10, 50, 100 y 300 entradas; importación válida de cien productos con doscientas presentaciones; duplicados, correcciones y conservación de datos ante errores.
- Marcas con listas de 5, 20, 50 y 100 nombres; cupones/ofertas consecutivos; confirmaciones y errores; formularios de familias y tarifas por distrito.
- Exportaciones con 1, 3, 5, 10, 50 y 100 pedidos, cancelación, errores y protección frente a doble clic.
- Todos los apartados y pestañas de Home/recomendador; controles de fotografías, carga múltiple, vista previa y borradores.
- Identidades de cliente y administrador separadas, MFA/TOTP, dispositivos de confianza, revocación, expiración y respuestas privadas descartadas tras perder permisos.

Estos volúmenes son pruebas aisladas reproducibles, no cargas contra Supabase alojado ni datos comerciales insertados en staging. Las pruebas de notificaciones de esta intervención no acreditan una nueva recepción push en un teléfono físico.

Resultados y logs: [tests-final.json](../artifacts/admin-mobile-2026-11-19/tests-final.json), [quality-final.json](../artifacts/admin-mobile-2026-11-19/quality-final.json) y [node-final.log](../artifacts/admin-mobile-2026-11-19/node-final.log).

## Prueba real del despliegue

Chrome accedió a staging con una identidad temporal propia y MFA/TOTP real. La identidad y su membresía se retiraron al terminar. Se comprobó el rechazo de acceso administrativo con AAL1.

- **136 vistas completas:** 17 rutas a 360 × 800, 390 × 844, 430 × 932, 768 × 1024, 1024 × 768, 1366 × 768, 1440 × 900 y 1920 × 1080.
- Espera a datos cargados y decodificación de las imágenes administradas; cero errores HTTP o JavaScript y ningún desbordamiento horizontal en el barrido final.
- Menú, foco, pestañas, selección de página y apertura/cancelación de confirmaciones masivas en las cinco anchuras solicitadas.
- Quince vistas anónimas de inicio de sesión, recuperación y restablecimiento: ninguna mostró el dashboard.
- Las confirmaciones de staging se cancelaron sin escribir sobre pedidos comerciales. Las escrituras y sus errores se comprobaron con transporte aislado.

Se tomaron capturas de página completa y, en teléfonos, capturas del viewport. En las primeras el navegador puede representar la barra sticky dentro de la página larga; las capturas `*-viewport.png` muestran su posición real en la pantalla.

Evidencias: [final.json](../artifacts/admin-mobile-2026-11-19/final.json) y carpeta [final](../artifacts/admin-mobile-2026-11-19/final/).

### Comparativa visual

Altura total del mismo contenido a 390 px, sin retirar registros ni acciones:

| Pantalla | Antes | Después | Reducción |
| --- | ---: | ---: | ---: |
| Resumen | 1647 px | 1481 px | 10,1 % |
| Productos | 1386 px | 1217 px | 12,2 % |
| Pedidos | 1782 px | 1406 px | 21,1 % |
| Envíos | 1738 px | 1417 px | 18,5 % |
| Home | 2056 px | 1787 px | 13,1 % |

En escritorio de 1440 px, **13 de 17 capturas son idénticas píxel a píxel**. Las cuatro restantes conservan dimensiones y composición: edición de producto (1,84 % de píxeles diferentes), configuración (1,47 %), notificaciones (0,75 %) y reclamaciones (0,10 %). La captura inicial no esperó todos los recursos y estados asíncronos; la final sí. Por ello no se presenta ese grupo como una comparación exacta de estados equivalentes ni como una regresión visual resuelta mediante ocultamiento.

Comparativas: [Pedidos](../artifacts/admin-mobile-2026-11-19/comparison-orders.png), [Envíos](../artifacts/admin-mobile-2026-11-19/comparison-shipping.png), [Resumen](../artifacts/admin-mobile-2026-11-19/comparison-dashboard.png). Revisión por anchura: [360](../artifacts/admin-mobile-2026-11-19/review-360.png), [390](../artifacts/admin-mobile-2026-11-19/review-390.png), [430](../artifacts/admin-mobile-2026-11-19/review-430.png), [768](../artifacts/admin-mobile-2026-11-19/review-768.png), [1024](../artifacts/admin-mobile-2026-11-19/review-1024.png). Datos: [visual-review.json](../artifacts/admin-mobile-2026-11-19/visual-review.json).

## Navegación antes y después

Se midieron Productos, Pedidos, Clientes, Promociones, Envíos y Resumen, tres visitas por ruta y perfil: 36 navegaciones antes y 36 después. El documento permaneció montado, sin recargas completas. La medición termina con URL, título y datos listos; no utiliza el tiempo de generación de capturas.

Perfil móvil: Chrome a 390 px, CPU ×4, 100 ms de latencia, descarga de 200 kB/s y subida de 100 kB/s. La primera visita incluye descubrimiento del código de ruta; las visitas siguientes reutilizan código, pero conservan la verificación de permisos y lecturas actuales.

| Perfil y estado | Mediana antes | Mediana después |
| --- | ---: | ---: |
| Escritorio, primera visita por ruta | 341,5 ms | 239,5 ms |
| Escritorio, visitas con código disponible | 224,5 ms | 222 ms |
| Escritorio, conjunto de 18 visitas | 232,5 ms | 222,5 ms |
| Móvil limitado, primera visita por ruta | 440 ms | 436 ms |
| Móvil limitado, visitas con código disponible | 366 ms | 361,5 ms |
| Móvil limitado, conjunto de 18 visitas | 375 ms | 377 ms |

Cada conjunto de dieciocho navegaciones realizó **39 RPC antes y después**. No se añadieron consultas ni datos privados cacheados para obtener estos resultados.

La muestra móvil global no demuestra una mejora de velocidad; su diferencia de 2 ms y las pequeñas variaciones por ruta no justifican atribuciones al backend. El cambio de esta entrega es una interfaz más compacta y operable, manteniendo el rendimiento observado. Tres muestras por ruta no son INP de campo ni una prueba de capacidad del proveedor. La reducción de la primera visita de escritorio requiere más muestras para atribuir causalidad.

Evidencias: [navigation-before.json](../artifacts/admin-mobile-2026-11-19/navigation-before.json), [navigation-after.json](../artifacts/admin-mobile-2026-11-19/navigation-after.json), [navigation-comparison.json](../artifacts/admin-mobile-2026-11-19/navigation-comparison.json).

## Incidencias y límites de la validación

- Se actualizaron las expectativas antiguas que exigían ocultar el checkbox móvil y se desambiguaron contadores de resultados frente al nuevo contador de selección. No se aumentaron timeouts ni reintentos.
- Una ejecución local inicial se quedó en «Cargando panel». Se conservó la traza, se repitió el escenario cinco veces y pasó la suite final de 168 casos. No se afirma una causa raíz de ese episodio aislado.
- Durante capturas preliminares se alcanzó el límite del servicio push por repetir recargas completas. Se corrigió el procedimiento: una carga por ruta y redimensionamiento posterior. No se modificó el límite ni la seguridad. El barrido final muestra servicio disponible y cero respuestas HTTP de error.
- En dos secuencias automatizadas de redimensionamiento se observó anchura de documento de 382 px en viewport de 360 px, asociada en la captura al enlace «Visibilidad» de la navegación desplazable. No se reprodujo en cuatro repeticiones dirigidas ni en las 136 vistas finales; la navegación tenía `overflow-x: auto` y contención correcta en las repeticiones. Se conservan [overflow-final.json](../artifacts/admin-mobile-2026-11-19/overflow-final.json) y [resize-investigation.json](../artifacts/admin-mobile-2026-11-19/resize-investigation.json). No se oculta globalmente el overflow ni se declara demostrada una causa que no pudo repetirse.
- Las resoluciones se comprobaron con Chrome y emulación táctil. No equivalen a certificar cada combinación de Safari/iOS, teclado virtual, navegador y teléfono físico.

## Versión y sincronización verificadas

| Elemento | Resultado |
| --- | --- |
| Worker staging | `aroma-infini-frontend-staging` |
| Versión activa al 100 % | `1e78479f-3478-4bf6-b7b5-b2ffcd8e47bb` |
| Deployment staging | `3106e2c5-1e03-47c8-bb2e-cc024e4eca29` |
| Entrada frontend | `/assets/index-RAvOuLZr.js` |
| SHA-256 del paquete sellado | `4fc1f8402be50a756c702b23f9719ac78abc575efe24a58c38d5fdd168a795b9` |
| SHA-256 de configuración | `3de706eeb412b5e34f4d513d8c7628182e55c8d914c87aa3711327666a846249` |
| ETag del Worker | `b453f32b148a9267016524aa54060c212e31ab3ec20c8df41159a10e8e52eb5f` |
| Recursos JS, CSS y PWA | 127 descargados por HTTPS ordinario y contrastados con el paquete |
| Supabase staging | `tkxvexfapszilzhogvgu`; sin migraciones nuevas en esta entrega |
| R2 staging | `aroma-infini-media-dev`, privado; acceso directo público desactivado |
| Bindings y secretos requeridos | Coincidentes; sin imprimir valores secretos |
| Producción | Versión `ec8554f6-d47a-4af0-ba60-4623c8125020`, deployment `9baa7c50-262a-4f23-bf52-5742a52ffa0b`, sin cambios |

URL: <https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev/admin>.

Comprobación: [runtime-verified.json](../artifacts/admin-mobile-2026-11-19/runtime-verified.json). Los hashes individuales están en ese archivo. La verificación comprobó respuestas de la versión activa, sin sobrescribir la versión mediante cabeceras de prueba.

## Conservación y reproducción

Rama `develop`, HEAD `7b76fedf125b9d61e17ee26958e0c7646544e821`. Se conservaron los 116 archivos/rutas de trabajo registrados antes de esta intervención. No se hizo commit, push, reset, limpieza destructiva ni despliegue de producción. No hay `.env` o `.dev.vars` reales rastreados según la comprobación final. Evidencia: [preservation-final.json](../artifacts/admin-mobile-2026-11-19/preservation-final.json).

Comandos de calidad utilizados:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:node
npm.cmd run build:staging
node --experimental-strip-types scripts/worker-build.mjs check staging
```

Las invocaciones exactas de las quince suites y el entorno de transporte aislado se conservan en [run-tests.mjs](../artifacts/admin-mobile-2026-11-19/run-tests.mjs). Los scripts y capturas de esta validación están en `artifacts/`, excluido de Git; no son dependencias del sitio.

La entrega móvil está implementada y validada en staging. Permanecen como límites documentados la observación transitoria de resize y la falta de una matriz de teléfonos físicos; no se presentan como pruebas aprobadas de una causa no demostrada.
