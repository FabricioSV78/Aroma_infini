# Medios locales y preparación para R2

## Contrato vigente

`src/services/asset-source.ts` concentra la resolución de rutas locales de `images/`, `videos/` y `brand/`. Sin configuración adicional devuelve exactamente las mismas URLs. Se utiliza desde imágenes de producto y galería, categorías, familias olfativas, Hero, vistas previas, Nosotros, logos, vídeo y póster.

`image-source.ts` conserva los identificadores locales de producto y sus variantes por ancho. Las URLs HTTPS y las fotografías WebP subidas como `data:` se conservan sin transformaciones ni parámetros inventados. `imageSourceSet()` solo ofrece derivados que existen: claves tradicionales por ancho o fotografías registradas en `content/image-variants.ts`. Un archivo administrativo desconocido no recibe un `srcset` ficticio.

`hero-image-source.ts` centraliza los nombres por campaña, orientación y ancho que comparten Hero y panel. Conserva los tamaños, prioridades, carga progresiva, encuadres y fallbacks actuales. No hay un segundo catálogo de fotografías.

## Configuración futura, actualmente desactivada

`.env.example` incluye comentada `VITE_MEDIA_BASE_URL`. Cuando exista una colección pública verificada, un origen como `https://media.ejemplo.pe/aroma` resolverá `/images/cedre-480.webp` como `https://media.ejemplo.pe/aroma/images/cedre-480.webp`. La configuración solo admite una base HTTPS sin credenciales, query ni fragmento. Configuraciones inválidas conservan la ruta local.

No se creó un bucket, cliente S3, endpoint de subida, token, binding o conexión de red. Esta variable futura es un origen **público**; nunca debe contener claves privadas, firmas de subida ni credenciales R2.

## Secuencia de migración posterior

1. Conservar claves estables y copiar los archivos aprobados con sus variantes y metadatos MIME. Verificar existencia, proporción, integridad, caché y visualización antes de cambiar el origen.
2. Implementar subida autenticada mediante un servidor controlado o URL firmada de corta duración. Validar permisos, formato, tamaño y dimensiones; no aceptar la extensión como prueba del contenido.
3. Almacenar referencias ordenadas a activos en Supabase, no imágenes base64 en filas. Migrar explícitamente las fotos administrativas existentes y validar cada producto antes de sustituirlas; no borrarlas en una conversión automática.
4. Adaptar normalizadores y validaciones de Home/productos al modelo remoto real. Los `string` actuales y el resolvedor son una frontera de presentación; no equivalen a una integración de subida o a una base compartida.
5. Configurar el dominio público, caché/CORS/CSP y regeneración SEO. Los metadatos prerenderizados, el sitemap y las URLs sociales necesitan la misma fuente publicada que la ficha visible. La configuración SEO actual se conserva local en esta etapa.
6. Activar el origen solo después de pruebas públicas y administrativas; conservar un plan de reversión a los recursos locales.

## Preparación y mantenimiento de imágenes

Los originales auditados ya utilizan WebP/SVG y no se recomprimen ni recortan. `scripts/prepare-finder-thumbnails.mjs` genera únicamente miniaturas de 160 y 320 px de las fotografías locales del recomendador, sin ampliar ni sobrescribir originales. El cuestionario conserva el original para tamaños grandes o pantallas densas. Véase [Auditoría de imágenes](ASSET_AUDIT.md) para los hashes y tamaños medidos.

Las fotografías históricas, imágenes ocultas de Complementos, fuentes alternativas y recursos referenciados por documentación/SEO se conservan. La ausencia en un import estático no demuestra su desuso.
