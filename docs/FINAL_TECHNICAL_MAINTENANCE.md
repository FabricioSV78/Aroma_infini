# Mantenimiento técnico de Aroma Infini — 26 de octubre de 2026

Auditoría, limpieza y refactorización previa al backend. Se conservan el diseño, las fotografías, los textos comerciales y las reglas de catálogo, precios, promociones, inventario, pedidos y envíos. No se conectaron Supabase ni R2; no se añadieron SDKs, servicios remotos ficticios ni funcionalidades comerciales.

## Referencia y recuperación

El trabajo comenzó con Git limpio en `5487e8b05f149105f460b88d66ac092b878919f3`. Se creó y verificó el respaldo portable `artifacts/maintenance-2026-10-26/before-maintenance.bundle`, con el historial completo de ese estado. No se modificaron la rama ni el historial. Las credenciales y archivos ignorados de entorno no forman parte del respaldo Git.

Antes de modificar la aplicación se ejecutaron TypeScript, lint y build, y se tomaron 126 capturas en 1920 × 1080, 1366 × 768, 768 × 1024 y 390 × 844. La suite inicial registró 786 pruebas correctas, cuatro fallos y tres capturas optativas desactivadas. Los logs y resultados iniciales se conservan; no se presentan como una ejecución limpia.

## Archivos retirados y recursos conservados

Se eliminaron exclusivamente estos cuatro directorios temporales internos de Playwright, del 19 de octubre, ajenos a las ejecuciones actuales:

- `artifacts/test-results-callao/.playwright-artifacts-11/`
- `artifacts/test-results-final/.playwright-artifacts-2/`
- `artifacts/test-results-final/.playwright-artifacts-4/`
- `artifacts/test-results-final/.playwright-artifacts-6/`

Contenían 11.544 archivos y 519.236.137 bytes: **495,18 MiB retirados del workspace**. Antes de borrar se verificaron las rutas absolutas y se creó un ZIP cuyos archivos se compararon individualmente mediante SHA-256 con los originales. Respaldo recuperable: `C:\Users\USUARIO\AppData\Local\Temp\aroma-infini-maintenance-2026-10-26-playwright-e160347a77b040cda80ba613c6db47dd.zip`, de 258.345.562 bytes. Su SHA-256 es `65f95bcd466c67496d8dcedd3230e27a55b47166be1bd09b98654aa5b7a9bf45`. El ahorro de disco contando ese respaldo es menor que el ahorro del workspace.

Se retiraron 14 líneas de CSS de `.featured-intro` y `.featured-products`, clases de la sección antigua sin markup ni consumidores dinámicos actuales. El análisis AST confirma que las demás reglas, declaraciones y su orden no cambiaron. El script histórico de tipografía ahora apunta al título real del recomendador.

El grafo de imports estáticos, dinámicos literales y tipos alcanza los **177 módulos TypeScript** de aplicación y Worker: no apareció otro componente o página cuyo abandono estuviera demostrado. No se borraron archivos por su nombre, fixtures, plantillas Excel, documentación con procedencia, fuentes ni recursos de PDF. Los informes históricos y fotografías configurables se conservaron cuando no existía evidencia suficiente para retirarlos.

## Código simplificado

| Área | Cambio y garantía |
| --- | --- |
| Contratos administrativos | 18 tipos e interfaces pasaron a `src/types/admin.ts`. El servicio mantiene reexports compatibles y los adaptadores importan el contrato directamente. Los contratos conservan el mismo AST. |
| Datos de demostración | El constructor inicial de pedidos, clientes, tarifas y Home pasó a `src/mocks/admin-state.ts`. El servicio conserva las validaciones y operaciones. El snapshot antes/después es idéntico: 73.269 bytes y SHA-256 `b79c30db78db502a849f71f0df0aeb45778c94923e5f29c262e0ffe322cf7e44`. |
| Reglas administrativas | 39 declaraciones de negocio restantes se compararon mediante AST normalizado y mantienen su semántica. No se cambió la desactivación por agotado ni las migraciones de datos locales. |
| Ofertas programadas | `getNextProductDiscountChange()` sustituye dos recorridos/ordenamientos duplicados por un mínimo lineal. Mantiene límites temporales, activación, descarte de fechas inválidas, temporizadores y actualización al recuperar visibilidad. Equivalencia comprobada con 10.000 muestras y cuatro pruebas de fronteras. |
| Inventario en Productos | Se calcula una vez por producto y se reutiliza para filas y métricas. El mapa de marcas conserva la primera coincidencia anterior. Equivalencia comprobada con 5.000 catálogos, incluidos IDs duplicados y marcas ausentes. No hay caché persistente que conserve datos antiguos. |
| Rutas públicas | Ocho módulos de página pasan a `route.lazy`: catálogo, marcas, ficha, favoritos, carrito, checkout, confirmación y seguimiento. Se conservan URLs, loaders estáticos, redirecciones y estados de error/carga. Home continúa disponible desde el módulo inicial. |
| Prueba de agotados | El fixture espera el estado vacío real y prepara el carrito antes del montaje del siguiente documento. Antes podía aprobar cero cards durante el skeleton y perder la semilla por el efecto inicial del proveedor. Las aserciones de stock y bloqueo de compra se conservan. |

No se trasladaron carpetas completas ni se creó una capa de repositorios ficticia para cada entidad. La estructura `features/`, `components/`, `domain/`, `services/`, `types/` y `mocks/` ya resulta adecuada.

## Dependencias

Se quitó únicamente `repomix`, herramienta de desarrollo sin consumidores, scripts ni documentación de uso. NPM retiró sus 132 dependencias transitivas exclusivas: el lockfile pasó de 664 a 531 entradas de paquetes. **Ninguna versión de los paquetes conservados cambió.** `npm ls --depth=0` es correcto. No se instalaron nuevas librerías.

Se conservan ExcelJS, PDF-lib, Fontkit, PDF.js, Canvas, Sharp, fuentes y herramientas de Cloudflare porque tienen consumidores reales de aplicación, pruebas, preparación de recursos o build. No se ejecutaron actualizaciones automáticas de versiones ni `audit fix`; esta revisión no constituye una auditoría de vulnerabilidades del registro NPM.

## Imágenes y medios

Los 193 archivos de `public/`, de 22.058.589 bytes, conservan sus hashes. Incluyen 172 imágenes/SVG, de 11.961.016 bytes: sin duplicados por contenido o píxeles ni errores de decodificación. Se verificaron 39 rutas literales y 128 variantes dinámicas, sin recursos faltantes. No se sustituyó, recortó, amplió ni recomprimió ninguna fotografía aprobada.

Se mantienen `srcset` con variantes existentes, lazy loading de recursos secundarios, dimensiones reservadas y prioridad del Hero. El vídeo conserva su carga diferida y preferencias de movimiento/datos. No se recodifica sin una comparación perceptual que justifique hacerlo. La fotografía histórica `featured-duo-v3-1536.webp` mide 1448 px nativos; se conserva su URL por referencias SEO y posibles configuraciones almacenadas.

Las cuatro fotos comerciales y la imagen olfativa independiente siguen perteneciendo al producto; los complementos conservan su galería. La preparación pasa por `product-photo-upload.ts`, y `saveProductPhotos()` reemplaza únicamente imágenes del registro más reciente. Actualmente las fotos subidas son `data:` dentro de IndexedDB; esto no es almacenamiento R2.

## Tamaños medidos

JavaScript realmente solicitado en una navegación nueva del build de producción, con contextos independientes:

| Entrada | Antes | Después | Reducción bruta |
| --- | ---: | ---: | ---: |
| Home | 633.136 B | 552.048 B | 12,8 % |
| Tienda | 633.136 B | 566.029 B | 10,6 % |
| Ficha | 633.136 B | 587.744 B | 7,2 % |
| Productos del panel | 724.529 B | 679.141 B | 6,3 % |

El conjunto del Home pasa de 191.516 a 172.741 bytes al comprimir cada script con gzip. Es una estimación reproducible de compresión, no una medición de transferencia HTTP del hosting futuro.

El build completo pasa de **25.593.057 a 25.599.920 bytes**: aumenta 6863 bytes por la división en módulos. El beneficio es descargar menos código en cada entrada, no reducir artificialmente la suma de todos los módulos. El CSS compilado total baja de 355.668 a 355.452 bytes. `public/` no cambia de tamaño. La fuente TypeScript incorpora dos módulos de contratos/fixtures; no se presenta esa separación como ahorro de código.

Persisten los avisos de chunks grandes de ExcelJS y PDF/Fontkit: se descargan al ejecutar sus funciones, no al abrir el Home. No se ocultó el aviso elevando el umbral. Las observaciones aisladas de Chrome en desarrollo fueron LCP 922/588 ms y CLS 0/0, sin limitación de CPU/red. La carga del equipo y los caches eran distintos: no prueban una mejora causal ni sustituyen métricas reales de producción/INP.

## Pruebas y preservación visual

- Typecheck y lint completos: correctos, sin advertencias ESLint. El build de producción termina correctamente y conserva `noindex`.
- Última suite completa: **794 pruebas pasaron, cero fallos y cero reintentos inestables** (9.5 minutos). Tres pruebas optativas de capturas manuales permanecen omitidas por diseño; se sustituyó su finalidad visual por la matriz activa de 126 pares, no se contabilizan como pruebas pasadas.
- Incluye compra, filtros/paginación, favoritos, cuenta, seguimiento, productos, marcas, Excel, fotos, inventario, cupones/ofertas, pedidos individuales/masivos, PDF y Home; conserva estados vacíos, carga, errores y recuperación. Los cuatro casos nuevos de programación de ofertas y la prueba corregida de agotados también pasaron.
- Evidencia final: `artifacts/maintenance-2026-10-26/final-tests.json`, `final-tests.log`, `final-typecheck.log`, `final-lint.log` y `after-build.log`.
- `git diff --check`: correcto. No hay cambios en fotografías, credenciales, reglas comerciales ni configuración de despliegue.

Se compararon 126 pares de capturas: **121 idénticos píxel a píxel**, cuatro con diferencias máximas de un nivel RGB y una diferencia de renderizado en la captura inicial del editor de categorías móvil. Esta última no se reprodujo en el control de ambos builds de producción: imágenes idénticas, mismos archivos y misma fuente real `Lato-Regular`, verificados mediante Chrome. No se atribuye una causa definitiva a esa captura aislada. No cambiaron dimensiones, encabezados ni alineaciones; no se detectaron imágenes rotas, errores JavaScript ni desbordamientos en la matriz.

La cobertura visual incluye Home, recomendador, catálogo/filtros, marcas, ficha, favoritos, carrito, checkout, institucionales, cuenta y módulos administrativos, incluyendo importación, vista previa y gestión del Home. Las pruebas funcionales además revisan 1440 × 900 y otros tamaños.

Capturas y visor: [Comparación interactiva](../artifacts/maintenance-2026-10-26/comparacion-visual.html), [Home antes](../artifacts/maintenance-2026-10-26/before/home-desktop.png), [Home después](../artifacts/maintenance-2026-10-26/after/home-desktop.png), [Productos antes](../artifacts/maintenance-2026-10-26/before/admin-products-laptop.png), [Productos después](../artifacts/maintenance-2026-10-26/after/admin-products-laptop.png).

Durante las comprobaciones preliminares se identificaron dos interferencias del entorno: URLs de módulos conservadas por HMR y recargas completas de Tailwind al editar Markdown. Se reinició el servidor y se congeló el repositorio durante la comprobación final; no se modificaron reglas de la aplicación para ocultar esos fallos. Logs anteriores y diagnósticos permanecen disponibles.

Los primeros comandos también mostraron un error de permisos al escribir logs de Wrangler fuera del workspace. Las comprobaciones posteriores usan `WRANGLER_LOG_PATH` dentro de `artifacts/`; no se modificó la configuración de la aplicación para resolverlo.

Permanecen avisos de React Router en los escenarios de la redirección histórica `/catalogo` sin componente y de navegación POP fuera de su historial. Sus pruebas de redirección y protección de cambios pasan; se conservan los logs y el comportamiento existente. No se silenciaron estos mensajes ni se cuentan como errores JavaScript de las capturas.

## Preparación para Supabase y R2

[SUPABASE_READINESS.md](SUPABASE_READINESS.md) y [MEDIA_READINESS.md](MEDIA_READINESS.md) describen los límites actuales y puntos de sustitución. Los modelos compartidos ya no dependen de la implementación del estado administrativo. La lectura pública conserva sus repositorios asíncronos; la persistencia local sigue encapsulada y las URLs de medios se resuelven en `asset-source.ts`, `image-source.ts` y `hero-image-source.ts`. No se cambiaron credenciales, variables de entorno ni configuración de despliegue.

Antes del backend quedan decisiones y trabajo reales:

1. Autenticación, roles y autorización de lectura/escritura; el panel local todavía no autentica administradores.
2. Validación/versionado y recuperación del snapshot, concurrencia y migración explícita. IndexedDB no es una base compartida entre equipos.
3. Operaciones atómicas e idempotentes para SKU, stock, pedido, pago y cupón; el checkout actual simula el pago y puede conservar un pedido solo en memoria si falla IndexedDB.
4. Subida R2 autenticada, límites de medios y migración verificada de imágenes base64, conservando orden y función de cada fotografía. Los componentes no deben incorporar credenciales ni conocer buckets.
5. Catálogo y contenido reales, privacidad, tratamiento del DNI y permisos de seguimiento/reseñas. Los datos de demostración, los 50 pedidos y las reseñas ficticias no deben importarse como datos comerciales.
6. Publicación del catálogo y Home coordinada con SEO/sitemap. Se mantiene `noindex` mientras el contenido siga siendo ilustrativo.

Estas decisiones pertenecen a la integración posterior; no se inventó un esquema SQL definitivo ni una autenticación simulada adicional.

## Evidencias y reproducción

La carpeta `artifacts/maintenance-2026-10-26/` conserva respaldo Git, inventarios/hashes, ZIP manifest, equivalencias de AST/snapshot, comparación de tamaños, peticiones de producción, capturas, diagnósticos y reportes Playwright. Las equivalencias aleatorias de ofertas/inventario se calcularon sobre el patch que después se aplicó; sus etiquetas originales documentan esa fase previa. Está ignorada por Git, igual que los demás artefactos locales. Los archivos preparados durante la auditoría no forman parte del bundle público.

Ejecutar las comprobaciones en secuencia, sin editar archivos mientras corren las pruebas:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e -- --workers=3
$env:AUDIT_CAPTURE_OUTPUT = 'artifacts/maintenance-2026-10-26'
node scripts/capture-technical-audit.mjs before
# Aplicar únicamente los cambios controlados, reiniciar Vite y capturar after.
node scripts/capture-technical-audit.mjs after
node scripts/capture-technical-audit.mjs compare
```

No se debe sobrescribir la referencia original para una nueva auditoría: usar otro directorio en `AUDIT_CAPTURE_OUTPUT`. Las métricas y los archivos conservados corresponden a esta ejecución local del 26 de octubre; no son una garantía de comportamiento multiusuario ni una medición del hosting final.

Referencias técnicas utilizadas: [módulos de ruta de React Router](https://reactrouter.com/start/data/route-object), [división del build de Vite](https://vite.dev/guide/build.html#chunking-strategy) y [métricas Web Vitals](https://web.dev/articles/vitals). La consulta documental no supuso una actualización de las versiones instaladas.
