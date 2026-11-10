# Medios de producto en R2 y recursos locales

## Contrato vigente

`src/services/asset-source.ts` concentra la resolución de rutas locales de `images/`, `videos/` y `brand/`. Sin configuración adicional devuelve exactamente las mismas URLs. Se utiliza desde imágenes de producto y galería, categorías, familias olfativas, Hero, vistas previas, Nosotros, logos, vídeo y póster.

`image-source.ts` conserva los identificadores locales de producto y sus variantes por ancho. También resuelve las fotografías administradas mediante sus manifiestos verificados: `imageSourceSet()` solo ofrece derivados existentes, tanto del catálogo estático como de las variantes WebP confirmadas por el Worker. Las vistas previas `data:` no reciben un `srcset` ficticio ni se convierten en referencias permanentes de Supabase.

`hero-image-source.ts` centraliza los nombres por campaña, orientación y ancho que comparten Hero y panel. Conserva los tamaños, prioridades, carga progresiva, encuadres y fallbacks actuales. No hay un segundo catálogo de fotografías.

La gestión de producto conserva hasta cuatro fotografías comerciales ordenadas y una imagen olfativa independiente para perfumes; los complementos usan únicamente la galería comercial. `saveProductPhotos()` relee el producto actual antes de reemplazar imágenes para no sobrescribir precios ni inventario con un borrador antiguo. Las subidas se validan y preparan mediante `product-photo-upload.ts`. En el catálogo remoto, el borrador conserva las vistas previas hasta guardar: `media-upload.ts` sube los archivos al Worker y Supabase recibe únicamente referencias verificadas y sus asociaciones, nunca los bytes base64. El adaptador de catálogo local conserva su persistencia IndexedDB para su propio modo de funcionamiento. La cola de fotografías, el formulario de producto y la vista previa comparten los mismos campos y no constituyen almacenes independientes.

## R2 de productos conectado en desarrollo

El bucket R2 es privado. La subida pasa por el Worker, que verifica la sesión real de Supabase, la membresía administrativa y MFA antes de aceptar fotografías. Valida bytes, formato, dimensiones y decodificación; prepara el manifiesto en SQL y comprueba los objetos antes de marcar el activo como disponible. Los archivos usan claves inmutables por UUID y hash. La lectura pública también pasa por el Worker y solo admite rutas incluidas en un activo confirmado; no expone el bucket completo.

Las fotografías se normalizan a WebP 4:5, hasta 1600 × 2000 px, con variantes reales de 480, 960 y el ancho del original preparado cuando corresponda, sin ampliaciones ni tamaños inventados. La imagen olfativa permanece separada de la galería comercial. Un fallo parcial conserva el borrador y permite reintentar sin duplicar la operación; quitar una imagen no la borra inmediatamente del almacenamiento.

`VITE_MEDIA_API_BASE_URL` configura el origen público del Worker cuando Vite necesita acceder a otro origen; nunca contiene credenciales. Admite HTTPS y, solo en desarrollo, HTTP de loopback. Las claves privadas se mantienen en el servidor. Esta conexión de desarrollo no equivale a una habilitación de producción.

Detalles de uso, límites y reintentos: [Operación de medios](R2_MEDIA_OPERATIONS.md). Arquitectura: [Plan de integración](R2_INTEGRATION_PLAN.md) y [Entrega de implementación](R2_IMPLEMENTATION.md).

## Home remoto y recursos editoriales

El editor del Home guarda ahora contenido versionado en Supabase y fotografías/vídeo en R2, con asociaciones incluidas en la protección frente a limpieza. Sus perfiles conservan las proporciones de cada apartado. Véase [Home remoto](R2_HOME_IMPLEMENTATION.md). Los recursos predeterminados siguen incluidos en el proyecto y los cambios locales previos no se importan automáticamente. Los contenidos editoriales fuera de ese editor conservan sus adaptadores existentes.

`VITE_MEDIA_BASE_URL` es independiente de la API de subida y continúa siendo una opción para una futura colección estática pública verificada. Un origen como `https://media.ejemplo.pe/aroma` resolvería `/images/cedre-480.webp` como `https://media.ejemplo.pe/aroma/images/cedre-480.webp`. Solo admite una base HTTPS sin credenciales, query ni fragmento; configuraciones inválidas conservan la ruta local. No debe contener firmas ni claves R2.

Para publicar el material definitivo será necesario:

1. Seleccionar desde el panel los archivos aprobados para Hero, categorías, recomendador y vídeo. Se aplican perfiles propios, sin utilizar el recorte 4:5 de producto para todos los apartados.
2. Migrar explícitamente los recursos aprobados con sus variantes, metadatos y asociaciones. Verificar cada contenido antes de sustituirlo y conservar las personalizaciones locales existentes.
3. Configurar el dominio final y revisar caché, CORS, CSP y SEO. Los metadatos prerenderizados, el sitemap y las URLs sociales necesitan la misma fuente publicada que la ficha visible; la configuración SEO actual se conserva local en esta etapa.
4. Validar el flujo público y administrativo desde otra sesión antes de declarar conectado cada apartado. No ejecutar sincronizaciones desde Git que eliminen fotografías dinámicas por ausencia en el repositorio.

## Preparación y mantenimiento de imágenes

Los originales auditados ya utilizan WebP/SVG y no se recomprimen ni recortan. `scripts/prepare-finder-thumbnails.mjs` genera únicamente miniaturas de 160 y 320 px de las fotografías locales del recomendador, sin ampliar ni sobrescribir originales. El cuestionario conserva el original para tamaños grandes o pantallas densas. Véase [Auditoría de imágenes](ASSET_AUDIT.md) para los hashes y tamaños medidos.

Las fotografías históricas, imágenes ocultas de Complementos, fuentes alternativas y recursos referenciados por documentación/SEO se conservan. La ausencia en un import estático no demuestra su desuso.
