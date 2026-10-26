# Estados vacíos, cargas e interacciones

Auditoría del 23 de octubre de 2026. Se conservaron la composición aprobada, las reglas comerciales y el almacenamiento local. No se añadieron dependencias ni conexiones a Supabase, R2 o una pasarela.

## Criterios y referencias

- [Shopify — Empty state](https://shopify.dev/docs/api/app-home-ui-extension/latest/web-components/feedback-and-status-indicators/empty-state): diferenciar un recurso sin registros de una búsqueda sin coincidencias; ofrecer una acción útil y breve. Los errores de lectura tienen un mensaje y reintento propios.
- [Shopify — Loading](https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/loading): vincular el indicador a la operación que realmente está pendiente y retirarlo al terminar. El contenido disponible se conserva durante las actualizaciones.
- [Stripe — Pruebas automatizadas](https://docs.stripe.com/automated-testing): probar la recuperación con errores controlados en el código de pruebas. Las lecturas y escrituras retenidas de esta auditoría existen únicamente en los tests y scripts de captura.
- [Linear — UI refresh](https://linear.app/changelog/2026-03-12-ui-refresh): consistencia de controles, navegación e iconos para facilitar la lectura. Se aplicó a los estados de los componentes existentes, sin trasladar un diseño ajeno.

Se utilizaron las skills instaladas de diseño frontend, accesibilidad, React y TypeScript.

## Revisión por interfaz

| Interfaz | Respuesta cuando no hay contenido | Carga, error e interacción |
| --- | --- | --- |
| Home | Se conserva la ocultación de colecciones comerciales sin productos o marcas; no aparecen carruseles vacíos. | Arranque con estructura de carga; se mantienen hero, carruseles y movimiento reducido aprobados. |
| Tienda y búsqueda completa | Catálogo sin publicaciones, búsqueda inicial y filtros sin coincidencias tienen mensajes diferentes. Limpiar filtros conserva el comportamiento de la URL. | Conserva las cards durante la consulta; el indicador sustituye temporalmente al contador, sin desplazar la cuadrícula. Errores recuperables con reintento bloqueado mientras consulta. |
| Buscador del navbar | Sugerencias vacías y búsqueda sin coincidencias se distinguen. | Estado de consulta y error con reintento. Conserva el debounce y la cancelación de respuestas antiguas. |
| Marcas | Mensaje explícito si no hay marcas, con salida al inicio. | Error distinto del vacío; reintento deshabilitado durante la lectura. Se aislaron los estilos del mensaje para que no herede la composición de una marca. |
| Detalle del producto | Producto inexistente conserva acceso a la tienda. Reseñas y relacionados conservan sus condiciones existentes. | Skeleton inicial de ficha y reintento de errores con bloqueo. Galería, descuentos, stock y compra se mantienen. |
| Favoritos, carrito y drawer | Icono discreto, mensaje breve y acceso a la tienda. Favoritos no disponibles conserva su acción de retirada. | Anuncios al vaciar, selección del corazón y controles de stock existentes. El drawer prioriza explorar la tienda. |
| Checkout y confirmación | Selección vacía, carrito que requiere revisión y ausencia de confirmación conservan sus salidas específicas. | Bloqueo inmediato de repetición, indicador durante escritura real y recuperación de excepciones. Los datos/cupón no cambian mientras se guarda. Se retiraron esperas artificiales de 350/650 ms; no se ejecuta ningún cobro. |
| Cuenta | Vacíos consistentes de direcciones, pedidos y pagos; acciones adecuadas al contenido. | Errores de dirección como alertas y guardados como estado. Corregida la validación que permanecía bloqueada después de corregir espacios. La sesión de ejemplo sigue siendo inmediata. |
| Recomendador | Se conservan ausencia de coincidencias, disponibilidad y resultados parciales, sin inventar productos. | Indicador durante la consulta real; conserva respuestas y recuperación de errores. |
| Contacto, seguimiento, envíos y legales | Se conservan los estados de consulta y la información configurada existente. | El formulario local de seguimiento no recibe un spinner ficticio. Foco, enlaces y botones comparten las reglas de interacción. |
| Resumen administrativo | Cero pedidos y ausencia de alertas de stock mantienen mensajes específicos. | Los cálculos locales no muestran cargas ficticias. El arranque y la navegación de módulos sí tienen respuesta mientras esperan. |
| Productos e inventario | Diferencia entre catálogo sin productos, filtros sin resultados y borradores pendientes de fotos. | Guardado del formulario y activación/desactivación esperan la escritura; fallo conservado y reintento sin volver a modificar el producto. Preparación de fotos mantiene controles y prevención de cargas simultáneas. |
| Importación Excel | Se conservan archivo inválido, filas con errores, duplicados, filtros vacíos y borradores pendientes de imágenes. | Lectura y generación de plantilla con estado real. Importación conserva bloqueo inmediato, conteos reales y reintento de persistencia sin reimportar. |
| Marcas, cupones y ofertas | Mensajes reutilizables y acción de creación. Ofertas distingue productos sin promoción de una vista filtrada sin coincidencias. | Formularios conservados ante fallo; botones «Guardando…», controles inertes/deshabilitados y confirmación después de `flush()`. |
| Pedidos, detalle y PDF | Vacío total y filtros sin resultados conservan acciones pertinentes; exportar requiere pedidos seleccionados. | Estados individuales, masivos y datos de entrega informan mientras guardan. Se conservan confirmaciones, resultados parciales, historial y separación entre pago y preparación. |
| Clientes | No hay registros y búsqueda sin coincidencias tienen mensajes distintos. | «Limpiar búsqueda» recupera la lista, sin spinner para un filtro síncrono. |
| Gestión del Home | No se añaden secciones nuevas. | Preparación real de imagen/vídeo con indicador, bloqueo de edición durante preparación/guardado y reintento del mismo borrador. |
| Configuración de envíos | Se conservan tarifas, cobertura y controles provinciales actuales. | Formulario protegido durante escritura; fallo conserva los datos y permite reintentar antes de salir. |

## Componentes y comportamiento compartido

- `EmptyState`: título semántico `h2`/`h3`, descripción opcional, icono y acciones. Los vacíos no se usan para disfrazar fallos.
- `InlineStatus` y `Spinner`: mensaje accesible con indicador decorativo; `status` o `alert` según la situación.
- `Skeleton` y `PageLoadingState`: estructura adaptable para el arranque del catálogo, producto y panel, mientras se hidrata o resuelve el router.
- `NavigationStatus`: aviso no bloqueante compartido por tienda y panel durante una navegación pendiente; mantiene la pantalla actual disponible.
- `useAdminSave` y `AdminSaveFeedback`: bloqueo síncrono con ref; separan mutación en memoria de escritura en IndexedDB. Si falla la escritura, «Reintentar guardado» ejecuta únicamente la persistencia y recibe el foco.
- `ui-states.css` e `interaction-states.css`: estilos compartidos sin modificar el diseño de las pantallas en reposo.

Los botones principales, secundarios y acciones de tablas tienen feedback de hover, foco y pulsación. Los controles seleccionados conservan su estado; los deshabilitados no reaccionan como acciones disponibles. Se retiró el hover de filas y elementos estáticos que sugerían una interacción inexistente. El hover nuevo se limita a punteros precisos; la selección y el foco siguen siendo utilizables con teclado o tacto.

Los skeletons son decorativos para asistencia y tienen un mensaje de carga. Las animaciones nuevas respetan `prefers-reduced-motion`. No se añadieron porcentajes de progreso inventados.

## Evidencia visual

- [Comparativa de estados, antes y después](../artifacts/ui-states/2026-10-23/comparison.html): 55 pares en 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844. Incluye vacíos, errores y consultas pendientes.
- [Estados administrativos](../artifacts/ui-states/2026-10-23/admin-states/report.json): 20 capturas de escritura pendiente, fallo recuperable, fotos pendientes e importación en esos cinco tamaños.
- [Recorrido general](../artifacts/ui-states/2026-10-23/pages/after.json): 126 capturas de páginas, filtros, recomendador, formularios, vistas previas y gestión del Home en desktop, laptop, tablet y móvil.

En esas capturas se verificaron desbordamientos, imágenes rotas, errores del navegador, estados accesibles y proporciones. La inspección visual corrigió la herencia tipográfica del vacío de Marcas y el desplazamiento de cards durante el filtrado.

Los originales del trabajo están preservados. La copia comparativa y sus hashes/procedencia se documentan en [BASELINE_PROVENANCE.md](../artifacts/ui-states/2026-10-23/comparison-baseline/BASELINE_PROVENANCE.md). La primera copia había capturado cuatro componentes durante su edición paralela; se reconstruyó únicamente su versión anterior desde el snapshot verificado, sin modificar los respaldos originales ni el código principal.

## Validación funcional

Las pruebas nuevas cubren lecturas pendientes, errores/reintentos, conservación del contenido, cargas iniciales, guardado fallido en IndexedDB, doble submit, reintento sin duplicar revisiones, visibilidad de productos, teclado, tacto y movimiento reducido. Se mantiene la suite existente para precios, descuentos, variantes, filtros, inventario, importación, pedidos y selecciones de 10/50/100 pedidos.

| Comprobación | Resultado |
| --- | --- |
| Typecheck | Aprobado (`typecheck.log`). |
| ESLint | Aprobado, sin advertencias (`lint.log`). |
| Build | Aprobado (`final-build.log`). Permanece el aviso conocido del tamaño de ExcelJS, cargado bajo demanda; no se añadieron dependencias. |
| Suite completa ejecutada | 660 casos en ese pase: 654 correctos, 3 capturas opcionales omitidas y 3 incidencias de prueba posteriormente resueltas/revalidadas (`final-tests.log`). |
| Cierre de estados y hero | **50/50 correctos**, incluidos todos los estados nuevos, geometría de cards/skeletons y navegación del panel (`closing-tests.log`). |
| Flujos ampliados y capturas opcionales | 99 correctos en `verified-tests.log`, incluidas las 3 pruebas de captura. Su único fallo era una espera intermedia del hero, cubierta por el cierre de 50/50. |
| Capturas de estados | 55 anteriores + 55 actuales, sin errores ni desbordamientos. |
| Capturas administrativas y generales | 20 + 126, sin errores, imágenes rotas ni desbordamientos. |

El inventario final contiene **661 casos distintos**: las incidencias del pase completo quedaron cubiertas por las reejecuciones y se añadió una prueba de navegación pendiente del panel. No quedan fallos funcionales abiertos en esta auditoría. Los logs conservan también los intentos anteriores; no se presentan como una única ejecución completa sin incidencias.

Las esperas frágiles del hero asumían una cantidad transitoria de fotos preparadas y avanzaban 3100 ms. La prueba ahora espera los recursos disponibles y utiliza 3900 ms, coherente con el intervalo vigente de 3,8 s, sin modificar el hero. La comparación de posición de filtros se realiza con fuentes listas y movimiento reducido para medir el layout y no la animación de entrada.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npx.cmd playwright test --workers=3
node scripts/capture-ui-states.mjs after
node scripts/capture-ui-admin-states.mjs
```

Para `before` debe estar sirviéndose la copia comparativa en 5174. `UI_STATES_CAPTURE_URL` y `UI_STATES_ONLY` permiten elegir origen y repetir escenarios; `compare` actualiza la galería. El recorrido general permite `AUDIT_CAPTURE_OUTPUT` para preservar las evidencias de auditorías anteriores.

## Integraciones pendientes

La persistencia actual es de este navegador, con soporte de sesión según las condiciones existentes; no es una base compartida. Los bloqueos de UI evitan repeticiones en la vista actual y no sustituyen transacciones, permisos ni idempotencia en servidor. Supabase deberá proporcionar esos contratos, autenticación y concurrencia. R2 deberá resolver subida y progreso de red reales. La pasarela actual sigue sin realizar cobros. Los componentes admiten promesas pendientes y errores sin simular esas integraciones.
