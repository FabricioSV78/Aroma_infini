# Auditoría de carpetas y archivos de Aroma Infini

Fecha: 26 de octubre de 2026. Alcance: clasificación del repositorio, comprobación de referencias y eliminación controlada de recursos obsoletos o temporales. Esta revisión se realizó sobre el estado de trabajo existente, incluidos los cambios del mantenimiento anterior; no se descartaron ni revirtieron esos cambios.

No se modificó el diseño, la lógica comercial, los componentes, las imágenes ni las funcionalidades. No se conectó Supabase ni se cambió la configuración de Cloudflare. No se eliminó ninguna dependencia.

## Clasificación de todas las carpetas principales

Los tamaños y cantidades siguientes corresponden al inventario inicial de esta revisión. `artifacts` y los caches cambian al ejecutar auditorías y pruebas; el inventario final se conserva por separado.

| Carpeta | Clasificación y función real | Decisión |
| --- | --- | --- |
| `.agents/` | Herramientas de desarrollo: 103 archivos de cuatro skills instaladas, con instrucciones, reglas, licencias y templates. Registradas en `skills-lock.json`. No se compilan en la tienda. | Conservar. Sus templates no son componentes abandonados de Aroma Infini. |
| `.git/` | Historial, índice y metadatos del control de versiones. | Conservar íntegra; no se limpiaron sus objetos ni su configuración. No se inventarió el contenido interno como archivos de la aplicación. |
| `.wrangler/` | Mezcla de temporales, logs y estado local del emulador de Cloudflare. | Conservar `.wrangler/state/` íntegra; retirar únicamente los logs y bundles antiguos verificados de `logs/` y `tmp/`. Estar ignorado por Git no significa que sea seguro borrar todo el directorio. |
| `artifacts/` | Resultados generados: capturas, trazas, PDFs, Excel de prueba, mediciones, diagnósticos y respaldos. No se sirve como parte de la web. | Conservar informes, respaldos, entradas utilizadas por scripts y capturas referenciadas. Retirar solo los temporales y copias redundantes enumerados abajo. |
| `dist/` | Build de producción generado por Vite y los scripts SEO: 282 archivos, 25.599.920 bytes al inicio. Wrangler lo utiliza como `assets.directory`. | Conservar y regenerar con `npm run build`. No es fuente y no debe editarse manualmente ni versionarse. No es una duplicación prescindible mientras se usa para preview/despliegue. |
| `docs/` | Documentación, requisitos, procedencia, decisiones, auditorías y entregas históricas: 54 archivos al inicio. Incluye un Excel de ejemplo. | Conservar. El historial documentado no equivale a código activo ni a basura; las instrucciones antiguas deben leerse con su fecha y alcance. |
| `node_modules/` | Dependencias instaladas y herramientas de compilación/pruebas; contiene también caches de Vite/TypeScript. | Conservar. Puede reconstruirse con `npm ci`, pero es necesario para ejecutar este entorno y el usuario pidió no borrar dependencias. No se quitaron paquetes ni versiones. |
| `public/` | Recursos públicos: 193 archivos, 22.058.589 bytes; fotografías, vídeo, fuentes, logos, licencias, favicon, 404, robots y cabeceras del hosting. | Conservar íntegra. No se encontraron duplicados de imágenes ni fotografías con desuso comprobado. |
| `scripts/` | Automatización de SEO/build, preparación de medios y utilidades manuales de revisión visual: 52 archivos al inicio. | Conservar 51; retirar un capturador experimental reemplazado y sin consumidores. No ejecutar todos los scripts como si fueran pruebas: algunos generan/reemplazan medios y requieren originales del cliente. |
| `src/` | Aplicación React/TypeScript: tienda, panel, componentes, estilos, servicios, reglas, modelos, contenido y datos iniciales utilizados. | Conservar los 233 archivos. No se identificaron módulos abandonados comprobados. `src/assets/` no existe; los medios locales están en `public/`. |
| `tests/` | 110 archivos de specs y cuatro fixtures/helpers, descubiertos por Playwright o importados por las pruebas. | Conservar los 114 archivos. Los casos de datos retirados prueban migraciones; sus nombres no justifican eliminarlos. |
| `worker/` | Dos módulos de Cloudflare Workers para política de rutas, respuestas SEO y entrega de activos. Entrada declarada en `wrangler.jsonc`. | Conservar ambos. No es Supabase ni una integración de pagos o imágenes remotas. |

Los 235 archivos de `src/` y `worker/` son alcanzables desde `src/main.tsx` y `worker/seo-router.ts` mediante imports estáticos, dinámicos literales, CSS/JSON o tipos: 227 participan en ejecución/recursos y ocho son contratos de tipos. Los 177 módulos TypeScript son alcanzables al incluir los imports de tipos. Esto se comprobó con el resolvedor de TypeScript; no se dedujo solo del nombre de los archivos.

## Archivos raíz necesarios

| Archivos | Función y conservación |
| --- | --- |
| `package.json`, `package-lock.json` | Comandos, dependencias y versiones reproducibles. Conservar ambos sin cambios. |
| `index.html`, `vite.config.ts` | Entrada HTML y configuración del frontend, plugins, servidor y división del build. Conservar. |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.worker.json` | Proyectos TypeScript para aplicación/pruebas, configuración Node y Worker. Conservar. |
| `playwright.config.ts` | Descubre `tests/`, usa Chrome y escribe resultados dentro de `artifacts/`. Conservar. |
| `eslint.config.js`, `.prettierrc.json` | Calidad y formato del código. Conservar. |
| `wrangler.jsonc` | Entrada Worker, binding `ASSETS`, carpeta `dist` y entorno staging. Conservar; no se desplegó nada. |
| `worker-configuration.d.ts` | Tipos generados por `wrangler types`; los usa `tsconfig.worker.json`. Conservar la versión vigente y regenerarla mediante los comandos existentes. Está correctamente ignorada por Git. |
| `.env.example` | Plantilla pública de configuración, sin secretos de operación. Conservar y mantener versionada. No se editaron ni mostraron credenciales. |
| `.gitignore` | Reglas de exclusión; comprobadas con rutas reales y casos de control. Conservar sin cambios porque ya son correctas. |
| `README.md`, `skills-lock.json` | Guía del proyecto y registro de skills instaladas. Conservar. |

## Referencias y configuraciones verificadas

- `npm run dev` ejecuta Vite. `pretypecheck` y `prebuild` generan los tipos de Cloudflare; `prebuild` también genera robots/sitemap y `postbuild` prepara el shell/prerender SEO. No se borraron esos scripts por no tener imports React.
- `npm run build` compila TypeScript y genera `dist/`; `npm run preview` lo sirve. `cloudflare:dev`, `cloudflare:check` y `cloudflare:deploy` tienen consumidores reales en el flujo de staging; esta auditoría no los ejecutó para publicar recursos.
- TypeScript incluye `src` y `tests`, configura Vite/Playwright por separado y compila `worker` con el archivo de tipos generado. Los `.tsbuildinfo` viven en `node_modules/.tmp` y son regenerables.
- Vite ignora `artifacts` en el watcher. Playwright dirige allí las trazas y capturas; no confundir esos resultados con fixtures de entrada.
- Wrangler usa `worker/seo-router.ts` y `dist/`; `.wrangler/state/` contiene 18 archivos locales de emulación, 876.456 bytes. Se verificaron sus hashes antes y después de la limpieza.
- Las galerías, variantes por ancho, campañas del Hero, categorías, Complementos ocultos, imagen olfativa y SEO construyen rutas dinámicas. Una fotografía puede seguir siendo necesaria aunque no aparezca en un import literal.

## Eliminaciones realizadas y evidencia

Se retiraron **6,049 archivos / 298,359,366 bytes (284.54 MiB)**, en nueve destinos. El ZIP recuperable pesa 154,166,637 bytes y está en `C:\Users\USUARIO\AppData\Local\Temp\aroma-infini-folder-audit-2026-10-26-0510cad3cca24f28ba2ae95d3cbaf8f9.zip`. Su SHA-256 es `1cd77b1d174b54b5e1998530b2d872ae480b2d60846d69e5357368cc034f0409`. El ahorro indicado corresponde al workspace; el ZIP ocupa espacio adicional fuera del proyecto. Los 18 archivos del estado persistente de Wrangler conservaron sus hashes.

| Ruta | Motivo concreto |
| --- | --- |
| `artifacts/maintenance-2026-10-26/after-test-results/.playwright-artifacts-9/` | Archivos internos sin recolectar de una ejecución interrumpida, sin lectores de aplicación/scripts/documentación. Se conservan sus reportes, logs y diagnósticos. |
| `artifacts/maintenance-2026-10-26/after-test-results/.playwright-artifacts-12/` | Mismo criterio: temporal interno de la ejecución interrumpida, sin proceso activo que lo use. |
| `artifacts/maintenance-2026-10-26/after-test-results/.playwright-artifacts-16/` | Mismo criterio; no se eliminaron las carpetas de resultados funcionales ni las trazas ZIP conservadas. |
| `artifacts/worker-types-before-build-fix.d.ts` | Copia de respaldo sin consumidores, idéntica por SHA-256 a los tipos generados vigentes. |
| `artifacts/worker-types-before-typecheck-fix.d.ts` | Segunda copia redundante idéntica al archivo anterior y a `worker-configuration.d.ts`. |
| `artifacts/complements-edits.mjs` | Script de mutación de una sola vez ya aplicado, sin referencias/comando y con reemplazos del markup antiguo. No corresponde al mecanismo vigente para gestionar Complementos. |
| `.wrangler/tmp/` | Cuatro bundles temporales del 10 de octubre, sin proceso Wrangler/workerd activo ni referencias. Se regeneran al ejecutar la herramienta. |
| `.wrangler/logs/` | Catorce logs de sesiones antiguas del 12 de octubre; no son configuración ni datos del emulador. |
| `scripts/capture-admin-home-products.mjs` | Capturador experimental sin referencias externas ni comando. Intentaba accionar «Mostrar vista previa», control que ya no existe, y asumía una categoría oculta. Sus revisiones están cubiertas por `admin-audit-capture.spec.ts` y `admin-product-editor-responsive.spec.ts`. |

Antes de borrar se comprobaron rutas absolutas dentro del workspace, fechas, ausencia de procesos relevantes y un respaldo ZIP recuperable con SHA-256 de cada entrada contrastado con el original. No se utilizó un borrado general por extensión ni se borraron directorios enteros por estar ignorados.

## Recursos que se conservaron expresamente

- Las 172 imágenes/SVG de `public/`: sin duplicados por bytes/píxeles, errores de decodificación ni recursos faltantes en 39 rutas literales y 128 variantes dinámicas. No se sustituyó ni recomprimió ninguna fotografía.
- Fotografías de Complementos ocultos, originales y variantes del Hero, imagen social, galerías y familias olfativas. Las claves guardadas por el administrador pueden seguir apuntando a fotografías históricas.
- `complementos-provisional.svg`, porque participa en fixtures; fuentes y licencias; logos y notas de procedencia; `public/_headers` y `404.html`, consumidos por convenciones del hosting aunque no se importen desde React.
- `docs/ejemplos/aroma-infini-10-productos-demo.xlsx`, 10.874 bytes: ejemplo de datos/documentación que el alcance protege, no archivo temporal.
- Capturas y reportes históricos que siguen citados o aportan evidencia de revisión. Las copias antes/después de una auditoría pueden ser idénticas y aun así cumplir funciones distintas como prueba comparativa; no se deduplicaron destruyendo sus rutas.
- `scripts/capture-phase-7.mjs`, abierto en el IDE: está documentado en README y la entrega de Fase 7. Se conserva como herramienta histórica; algunas etiquetas corresponden a aquella versión y no se afirma que sustituya las pruebas actuales.
- Plantillas/referencias de `.agents`, fixtures, datos de demostración y los adaptadores locales. No son servicios Supabase ficticios ni un motivo para eliminar funcionalidades.
- `.wrangler/state/` y los datos de navegador. Las pruebas usan contextos aislados; no se vació IndexedDB, localStorage ni sessionStorage del usuario.

## Comprobación de `.gitignore`

Las reglas actuales cubren `node_modules/`, `dist/`, `.wrangler/`, `artifacts/`, `worker-configuration.d.ts`, `.dev.vars*`, `.env*`, logs, `.tsbuildinfo` y salidas de herramientas; `!.env.example` mantiene la plantilla versionable.

Se verificaron 28 casos en la comprobación principal y otros 32 en la revisión de soporte, sin inconsistencias: fuentes, configuraciones, recursos públicos, documentación, tests y skills necesarios no están ocultos. No hay archivos ya versionados que coincidan con las exclusiones. No fue necesario cambiar las reglas ni ignorar carpetas adicionales sin uso demostrado.

## Validación posterior

- `npm.cmd run typecheck`: correcto.
- `npm.cmd run lint`: correcto, sin advertencias ESLint.
- `npm.cmd run build`: correcto; conserva `noindex` y los avisos conocidos de chunks grandes de Excel/PDF, cargados bajo demanda.
- Suite completa de esta auditoría: **793 pruebas pasaron, 1 falló y 3 quedaron omitidas** (9.5 minutos). Se conserva `tests.json` sin cambiar ni relajar aserciones.
- El fallo corresponde al foco del selector Producto después de «Guardar y crear otra» en ofertas. La traza confirma guardado y formulario vacío correctos, sin recarga ni error de almacenamiento. Al repetir ese caso tres veces: **2 pasaron y 1 falló**. Es una intermitencia reproducible del comportamiento existente; no se afirma que toda la suite esté verde ni se atribuye una causa definitiva al mecanismo de foco.
- La aplicación responsable del foco, sus pruebas y dependencias mantienen los mismos hashes que al comenzar esta revisión. Se documenta la incidencia en `offers-focus-diagnosis.json`; no se cambió la funcionalidad para resolver una incidencia ajena a la limpieza solicitada.
- Integridad: **577 archivos protegidos y los 103 archivos de skills sin modificaciones**, sin eliminaciones inesperadas; incluye aplicación, recursos, tests, configuración, dependencias declaradas y estado local de Wrangler.
- `.gitignore`: todas las comprobaciones aprobadas. `git diff --check`: correcto.

La suite disponible comprende tienda, catálogo/filtros, marcas, ficha, carrito, checkout, favoritos, cuenta, seguimiento, panel, Excel, imágenes, inventario, promociones, pedidos, estados masivos, PDF y Home. Las tres pruebas optativas de captura manual se identifican por separado; no se cuentan como pruebas pasadas. No se ejecutaron indiscriminadamente scripts históricos que modifican imágenes o requieren originales externos.

Se congelaron los archivos fuente y Markdown durante la suite para evitar que Tailwind/Vite recargaran páginas de pruebas. Se compararon los hashes de aplicación, recursos, configuraciones y estado persistente local con la referencia inicial de esta revisión. Los cambios de la auditoría técnica anterior se conservaron.

## Qué se necesita para trabajar y ejecutar Aroma Infini

El código y los recursos de entrada son `src/`, `public/`, `worker/` y sus configuraciones raíz. Para desarrollar y verificar se conservan además `tests/`, `scripts/`, `docs/`, `.agents/`, el lockfile y las dependencias instaladas. El historial `.git/` permite recuperar cambios y no es una caché que deba limpiarse.

`dist/` es la entrega compilada y se regenera con `npm run build`; `node_modules/` se instala con `npm ci`. Los tipos del Worker y las cachés se regeneran mediante sus comandos. Los artefactos de revisión no son necesarios para ejecutar la tienda, pero algunos se conservan como evidencia, respaldo o entrada de herramientas. **El estado local de `.wrangler/state/` no debe tratarse como una caché descartable.**

Supabase continúa desconectado. Esta limpieza no altera permisos, reglas de negocio, datos comerciales ni el diseño aprobado.

## Inventario y recuperación

La evidencia de esta revisión está en `artifacts/folder-audit-2026-10-26/`:

- [Inventario por archivo CSV](../artifacts/folder-audit-2026-10-26/file-classification.csv): clasificación y decisión para cada archivo inventariado.
- `before-inventory.json` y `after-inventory.json`: archivos, cantidades, bytes y hashes de los grupos protegidos; excluyen deliberadamente los objetos internos de `.git` y no incluyen valores de credenciales.
- `supporting-files.json` y `supporting-files-report.md`: clasificación individual de scripts/docs/tests/worker/skills y referencias por archivo/línea.
- `source-file-inventory.json`, `module-graph.json` y `resource-inventory.json`: alcance de fuentes, rutas dinámicas, hashes y duplicados.
- `cleanup-manifest.json`: lista exacta de eliminaciones, respaldo y hashes verificados.
- `gitignore-check.json` y `gitignore-supporting-checks.json`: exclusiones comprobadas.
- `before-working-tree.patch`, `baseline.json` y `untracked-backup/`: referencia de los cambios existentes antes de esta revisión, complementada por el bundle Git del mantenimiento anterior. No se creó un commit ni se cambió la rama del usuario.
- Logs y reportes de las comprobaciones finales.

Los inventarios completos están ignorados por Git porque contienen resultados generados; este informe permanece en `docs/`. No se promete una reducción estable del tamaño total del workspace después de las pruebas: los nuevos reportes y capturas generan archivos otra vez. El manifest cuantifica únicamente los archivos obsoletos retirados en esta revisión.
