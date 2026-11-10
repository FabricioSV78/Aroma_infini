# Fotografías de productos

En **Productos**, utiliza **Visibilidad → Pendientes de fotos** para encontrar productos sin fotografía principal. Se retiró el filtro independiente de Fotografías para evitar controles redundantes. La búsqueda acepta nombre, código interno de producto y SKU de sus presentaciones. El enlace de fotografías abre una edición dedicada; **Guardar y continuar** avanza al siguiente pendiente de la cola sin publicar el producto. Los contadores de fotos y la gestión de galería e imagen olfativa se conservan.

## Organización

- Perfumes: cuatro fotos comerciales en `detail.gallery` y una imagen independiente en `detail.olfactoryImage`.
- Complementos: cuatro fotos comerciales; no requieren ni conservan imagen olfativa.
- `product.image` coincide con la primera foto de la galería y se utiliza como portada en la tienda.
- Los indicadores de completitud organizan el trabajo; no añaden requisitos de publicación. Excel mantiene los productos como borradores y la publicación conserva sus validaciones existentes.

Se pueden seleccionar varias imágenes, arrastrarlas, reemplazarlas, quitarlas y corregir su ubicación antes de guardar. Las flechas y el selector de ubicación permiten ordenar sin arrastrar. La preparación múltiple se aplica al borrador únicamente si todos los archivos seleccionados son válidos.

## Preparación y almacenamiento reales

`ProductPhotoUploadAdapter` (`src/services/product-photo-upload.ts`) separa la preparación de archivos del guardado del producto. Acepta JPG, PNG, WebP y AVIF de hasta 20 MB; verifica que el navegador pueda decodificarlos y que tengan dimensiones suficientes. Produce WebP con calidad 0,9, proporción 4:5, recorte central y ancho máximo de 1600 px, sin ampliar el original. Los mínimos son 800 × 1000 px para galería y 960 × 1200 px para la imagen olfativa.

En el adaptador local de pruebas, las fotos preparadas se representan mediante **data URLs dentro del snapshot de IndexedDB del mismo navegador y origen**. Ese modo no comparte fotografías entre dispositivos. El catálogo remoto guarda los archivos en R2 y sus referencias en Supabase; consulta [R2_IMPLEMENTATION.md](R2_IMPLEMENTATION.md).

No existe un repositorio separado de archivos subidos: descartar un borrador no genera archivos huérfanos. Reemplazar o eliminar una fotografía retira su referencia del siguiente snapshot; referencias aún utilizadas por otros productos permanecen. No hay deduplicación global de archivos ni un recolector remoto simulado.

El editor rechaza fotos idénticas repetidas en la misma galería antes de modificar el borrador. También impide que un cambio de ubicación introduzca una copia repetida. La imagen olfativa mantiene siempre su campo independiente.

El producto se asocia mediante su `product.id` estable; las referencias de fotos se conservan al editar y al recargar. `saveProductPhotos` obtiene el registro más reciente y actualiza únicamente galería, portada e imagen olfativa, preservando cambios de stock, precios, promociones y demás metadatos realizados después de abrir el borrador.

Si IndexedDB falla, la interfaz informa que el cambio permanece aplicado solo en la sesión, conserva el borrador y ofrece reintentar. La navegación al siguiente producto ocurre después de confirmar la escritura. Los envíos repetidos se bloquean durante el guardado.

## SKU de presentaciones y código interno

Cada presentación tiene su propio SKU. Se respeta el valor manual y, si falta en una presentación nueva, se genera desde `1000` o el siguiente disponible. Al editar o guardar fotografías se conserva el SKU existente. El listado y el encabezado de fotografías muestran esos SKU comerciales. `products.product_code` sigue siendo un código interno independiente; no se etiqueta como SKU ni se renumeran los productos existentes.

**El catálogo remoto utiliza Supabase y R2.** El servidor garantiza los SKU únicos con una secuencia propia y coordinación transaccional; Excel y el formulario comparten las mismas reglas. El adaptador local se conserva para pruebas aisladas. No se incluyen credenciales ni acceso directo a R2 para el administrador.

## Pruebas focalizadas

- `product-auto-sku.spec.ts`: seis pruebas aprobadas; Excel reales de 10, 50 y 100 productos, dos presentaciones por producto, recarga, migración de códigos antiguos y edición sin consumo incorrecto del contador.
- `product-photo-save.spec.ts`: siete pruebas aprobadas de estado de fotos, preservación del registro más reciente, separación olfativa, complementos y validaciones de guardado.
- `product-photo-persistence.spec.ts`: dos pruebas de navegador aprobadas para cuota insuficiente con reintento y doble envío con escritura pendiente.
- `admin-product-photo-queue.spec.ts`: nueve pruebas del flujo real, incluidos importaciones de 10/50/100 productos, arrastre, asignación, filtros, navegación, complementos y capturas responsive.
- `product-photo-upload-duplicates.spec.ts`: fotografías repetidas, vista previa con teclado y conservación de las cinco imágenes al recargar.
- Regresión de importación: seis pruebas aprobadas de desplegables, SKU opcional de presentaciones, publicación e identidad del inventario.

Estos casos son independientes de las capturas y las pruebas completas del flujo visual, que se ejecutan en la validación general del proyecto.

## Validación final

- Typecheck, ESLint completo y build de producción aprobados.
- Ejecución focalizada final: **38/38 pruebas aprobadas** (`artifacts/product-photo-queue/final-core.log`).
- La suite general ejecutó 746 casos: 707 aprobados inicialmente y tres omitidos por configuración. Se actualizaron contratos antiguos y esperas que confundían el skeleton con la página final; **35/35 casos repetidos aprobaron** (`full-rerun.log`). El caso restante se sustituyó por la comprobación de guardar fotografías parciales como borrador y aprobó en la ejecución focalizada.
- Capturas reales en 1920 × 1080, 1366 × 768, 768 × 1024 y 390 × 844. Se verificaron controles con teclado, ausencia de desbordamiento y acciones de guardado accesibles.
