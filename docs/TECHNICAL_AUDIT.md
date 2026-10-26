# Auditoría técnica de Aroma Infini

Fecha: 23 de octubre de 2026. Alcance: limpieza, mantenimiento, carga de medios y preparación de integración. No se modificaron textos comerciales, rutas, reglas de precios, descuentos, stock, estados de pedidos, filtros, recomendaciones ni diseño aprobado. No se conectaron Supabase, R2, autenticación o pagos.

## Respaldo y referencia inicial

Se copió el estado completo de los archivos versionados y nuevos no ignorados a un repositorio Git independiente, antes de limpiar: **665 archivos**, commit `cc6dcdb7313165fe1ff55d8ab534c848110f9e9b`. La rama y el historial del repositorio de trabajo no se modificaron. No se incluyeron `node_modules`, compilados ni variables de entorno ignoradas.

El respaldo está en `artifacts/technical-audit/2026-10-23/baseline-git/`; su copia portable `before-cleanup.bundle` se verificó con `git bundle verify`. `backup.json`, `baseline.patch` y `baseline-status.txt` documentan el punto de partida. El bundle corresponde al estado anterior a esta auditoría, incluidos los cambios que ya estaban pendientes en la rama.

Se ejecutaron typecheck, lint, build y las 615 pruebas iniciales sobre la referencia aislada. Resultado: **608 pasaron, 4 fallaron y 3 capturas manuales estaban desactivadas**. Los cuatro fallos procedían de dos selectores de pruebas obsoletos: «Explorar perfumes» en Favoritos ya era «Explorar tienda», y Seguir pedido ya utilizaba `.institutional-breadcrumb`. Se actualizaron los tests conservando sus comprobaciones y tolerancias; no se cambió la aplicación para hacerlos pasar.

## Eliminaciones comprobadas

| Archivo/código | Evidencia y actuación |
| --- | --- |
| `src/content/brand-photography.ts` | Único módulo TypeScript de contenido sin alcance desde la aplicación; sin consumidores en componentes, rutas dinámicas, pruebas, scripts o documentación. Eliminado. Sus fotografías no se eliminaron. |
| `getAdminProduct` y `getAdminOrder` | Solo aparecían en sus declaraciones, sin consumidores internos ni accesos por nombre. Eliminados de `admin-service.ts`. |
| `src/styles/shipping-editorial.css` | Pertenecía al markup antiguo de Envíos, sustituido por `delivery-*`. Eliminado junto con su import. |
| CSS antiguo de Nosotros/Contacto/Envíos y aviso comercial | Retirados únicamente selectores obsoletos en `institutional-editorial.css`, `service-pages.css` y `previews.css`. Conservados encabezados compartidos, Tracking aprobado, popularidad, reseñas y keyframes utilizados. |

La limpieza retiró **193 ramas de selector, aproximadamente 22 kB de CSS fuente y 1102 líneas**. Una comparación AST con el respaldo verificó que las reglas preservadas conservan selector, declaraciones, orden, contexto de media queries/keyframes y `!important`.

No se eliminó ninguna dependencia ni se instaló otra: las librerías tienen consumidores reales o un uso de desarrollo documentado. `package.json` y el lockfile se conservaron. Tampoco se borraron mocks activos, migraciones de snapshots, recursos ocultos de Complementos, scripts históricos documentados, licencias, fotografías antiguas con referencias o fuentes alternativas seleccionables. No se encontraron duplicados de imágenes por contenido.

## Arquitectura y rendimiento

- **Carrito y favoritos:** `commerce-service.ts` prepara índices temporales por producto, presentación y marca en lugar de recorrer el catálogo por cada línea. Conserva orden, referencias faltantes, primera coincidencia de IDs antiguos duplicados, presentación activa, stock, descuento y totales. Para listas vacías evita preparar índices. No mantiene una caché que pueda dejar precios desactualizados.
- **IndexedDB:** `admin-persistence.ts` cierra la conexión y limpia su promesa cacheada ante `versionchange`. Una actualización externa puede avanzar sin que una pestaña retenga la conexión antigua. No se borra ni reinicia el snapshot; una prueba real verifica que se conserva.
- **Medios:** `asset-source.ts`, `image-source.ts` y `hero-image-source.ts` concentran la resolución de URLs y variantes. Hero y panel comparten nombres por campaña/orientación/ancho. Las imágenes subidas y las URLs externas conservan su identidad.
- **Documentación:** README distingue el prototipo local de un backend compartido; Supabase/R2 tienen instrucciones vigentes y los informes anteriores se identifican como historia.

El CSS principal compilado pasó de **308,17 a 290,38 kB** (−17,79 kB, aproximadamente 5,8 %); comprimido por gzip, de **52,53 a 49,95 kB**. El pequeño resolvedor añade código compartido: no se afirma una reducción de JavaScript inicial. ExcelJS conserva su chunk bajo demanda de unos 930 kB brutos; el aviso de tamaño del build sigue visible y no implica que Excel se cargue al abrir el Home.

Las mediciones de desarrollo en Chrome, sin limitación de CPU/red, observaron LCP de 812 ms antes y 654 ms después, con CLS 0 en ambas. Son observaciones locales aisladas, con cachés de servidor y ruido distintos, no una prueba causal ni una medición de producción o usuarios reales. La mejora se cuantifica con bytes, integridad de recursos y regresiones, sin prometer una puntuación Lighthouse o una reducción de tiempos sostenida.

## Imágenes

Los **140 originales auditados mantienen su SHA-256**. No se recortaron, ampliaron ni recomprimieron fotografías aprobadas.

Se generaron 10 miniaturas WebP de 160/320 px para las cinco fotografías de familias utilizadas por el recomendador. Conservan la composición y utilizan calidad 92. Un manifiesto de variantes evita inventar archivos para fotografías administrativas desconocidas; el cuestionario mantiene la opción original de 960 px para tarjetas grandes o pantallas densas.

Las cinco fotografías originales suman 803 602 B; sus derivados de 160 px suman 71 676 B (−91,1 %). No equivale al ahorro total del Home: su escena editorial reutiliza una de esas fotos. Para los cuatro círculos y esa escena, el ahorro estático conservador calculado es **360 004 B**, antes de caché y selección por densidad de pantalla. Las prioridades del Hero, dimensiones, encuadres, vídeo diferido y movimiento reducido se conservaron.

Inventario, hashes, variantes y decisiones de conservación: [Auditoría de imágenes](ASSET_AUDIT.md). Regeneración: `node scripts/prepare-finder-thumbnails.mjs`.

## Preparación de integración

[Supabase](SUPABASE_READINESS.md) documenta los contratos públicos asíncronos, el adaptador local, los modelos compartidos y las mutaciones que requerirán transacciones y permisos en servidor. No se creó un SDK, esquema SQL, API falsa ni autenticación. Cambiar la persistencia local por un volcado remoto del snapshot no es una estrategia multiusuario válida.

[Medios y R2](MEDIA_READINESS.md) describe claves estables y el origen público futuro `VITE_MEDIA_BASE_URL`, comentado y desactivado en `.env.example`. Sin configurarlo, todas las URLs actuales siguen siendo locales. Las subidas reales requieren un endpoint autenticado, validación y referencias de activos en lugar de base64; esa integración no está implementada.

## Validación final

- `npm.cmd run typecheck`: correcto.
- `npm.cmd run lint`: correcto, sin advertencias ESLint.
- `npm.cmd run build`: correcto; conserva `noindex` y el aviso conocido del chunk ExcelJS.
- Suite posterior: **622 pruebas pasaron**, sin fallos; las tres capturas optativas se activaron aparte con `ADMIN_AUDIT_STAGE=after` y **las tres pasaron**. Total: **625 escenarios distintos validados**.
- Se añadieron 10 pruebas sobre resolución de medios, variantes existentes, conservación de rutas locales/HTTPS/data, selección real de miniaturas, carrito/favoritos y cambio de versión IndexedDB.
- La captura administrativa optativa se actualizó para utilizar controles actuales y nombres semánticos, incluyendo formularios, pestañas de Home, importación, entrega, menús y vista previa completa de producto en 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844.
- Comparación general: **126 pares de capturas** de tienda y panel en 1920×1080, 1366×768, 768×1024 y 390×844. Incluye Home, catálogo/filtros, marca, ficha, favoritos, carrito, checkout, institucionales, cuenta y pantallas administrativas, más recomendador, importación, vistas previas y gestión del Home. No se detectaron errores de JavaScript, imágenes rotas ni desbordamiento horizontal.

Las capturas y resultados originales están en `artifacts/technical-audit/2026-10-23/`: `before/`, `after/`, `before.json`, `after.json`, `visual-comparison.json`, `layout-comparison.json`, logs y reportes de Playwright. **112 de los 126 pares son idénticos píxel a píxel**; ninguno cambió dimensiones o títulos. La captura automatizada aísla las páginas y espera fuentes, imágenes y estados de foco/scroll; los modales se capturan dentro del viewport. Las diferencias restantes corresponden al remuestreo de miniaturas y pequeñas variaciones de renderizado inspeccionadas visualmente; no se presentan como una comparación binaria idéntica de todas las fotografías.

Reproducción:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e -- --workers=3
$env:ADMIN_AUDIT_STAGE = 'after'
npx.cmd playwright test tests/admin-audit-capture.spec.ts --workers=1
```

Con el servidor de cada versión activo, `node scripts/capture-technical-audit.mjs before|after` captura la matriz. `AUDIT_CAPTURE_URL` permite indicar el origen de la copia aislada; un tercer argumento de ruta repite solo esa pantalla y conserva el resto del registro. `compare` compara las capturas guardadas. Los artefactos y el respaldo son locales y están excluidos del repositorio principal.

## Pendientes antes de Supabase y datos reales

1. Definir roles/autenticación y políticas de acceso. Los eventos de pedidos actuales usan un actor técnico local, sin identidad autenticada; el panel ya no solicita un nombre manual.
2. Versionar/validar el snapshot y preparar una migración con respaldo y diagnóstico recuperable. La hidratación actual no valida exhaustivamente todas las estructuras antiguas.
3. Resolver concurrencia entre pestañas/equipos y trasladar stock, precios, cupones, pedidos e idempotencia a operaciones atómicas del servidor; el contador de revisión local no sustituye esa protección.
4. La posterior [auditoría de estados de UI](UI_STATES_AUDIT.md) unificó marcas, cupones, ofertas, publicación y datos de entrega para confirmar después de `flush()` y reintentar sin repetir la mutación. Sigue pendiente trasladar estas garantías a transacciones e idempotencia en servidor.
5. Definir pasarela real y evento de pago verificado; los pagos actuales se simulan. No importar fixtures, reseñas o clientes ficticios como datos reales.
6. Acordar subida de medios, migración de fotos base64, permisos, dominio y caché de R2. Nunca incluir secretos en variables `VITE_`.
7. Vincular publicación del catálogo y Home con regeneración SEO/sitemap, y confirmar datos comerciales, privacidad y consentimiento antes de indexar contenido real.

Estos puntos son decisiones de la fase siguiente. La auditoría no afirma que el prototipo local ya sea un sistema de producción o una base de datos compartida.
