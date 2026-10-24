# Complementos

## Gestión

- **Complementos comienza oculto.** En **Contenido del Home → Categorías**, activa **Mostrar Complementos en la tienda** y pulsa **Guardar cambios del Home** para habilitarlo. Desmárcalo y guarda para ocultarlo otra vez. El guardado incluye contenido, imágenes y visibilidad; la vista previa no publica el borrador.
- Con la categoría oculta, el Home muestra tres entradas y el menú y los filtros no ofrecen Complementos. Sus productos tampoco aparecen en búsquedas, recomendaciones, favoritos ni fichas públicas y no pueden comprarse. Los productos, fotos, stock y pedidos existentes se conservan; los artículos guardados por un cliente vuelven a estar disponibles al reactivar la categoría, si siguen activos y disponibles.
- Abre **Configurar Complementos** para preparar su fotografía y **Preparar un complemento** para registrar un borrador sin habilitar la categoría. Los complementos existentes siguen siendo editables en Productos. El mismo formulario muestra siempre **Tipo de producto**, también al entrar desde **Nuevo producto**; el acceso de preparación solo preselecciona Complemento.
- En **Productos → Nuevo producto**, selecciona **Complemento** en Tipo de producto para prepararlo, aunque la categoría esté oculta. La marca es opcional. Se conservan descripción, fotografías, presentaciones, precios, promociones, disponibilidad y stock. Ocultar o mostrar la categoría se gestiona por separado en el Home.
- Las presentaciones de complementos tienen un nombre (por ejemplo, Unidad o Negro), no mililitros. Cada una mantiene su propio precio y stock. No se solicitan género, familias, notas ni intensidad.
- En **Contenido del Home → Categorías**, cambia la imagen de Complementos, revisa la vista previa y guarda. Las cuatro categorías utilizan retratos 4:5 de al menos 800 × 1000 px.
- La imagen inicial de Complementos es una fotografía conceptual provisional de atomizadores, identificada en el panel. Su procedencia y prompt están en `scripts/category-complements-v1.json`. No se añadieron accesorios ficticios al catálogo público.

## Tienda y compra

`/tienda?tipo=complemento` abre Complementos; `tipo=perfume` muestra perfumes. Se admiten ambos parámetros simultáneamente. Precio, marca, búsqueda, ordenamiento y promociones siguen compartiendo la misma lógica.

Al seleccionar únicamente Complementos, se retiran Género y Familia olfativa y se descartan sus valores anteriores. En selecciones mixtas, aplicar una familia o género limita los resultados a perfumes que posean esa clasificación. El recomendador solo considera perfumes publicados y disponibles.

La etiqueta de presentación se conserva en favoritos, carrito, checkout, confirmación, cuenta, pedidos e inventario. La aprobación comprueba precio, presentación y stock antes de registrar la compra. No cambia el cálculo de descuentos ni las reglas de entrega.

## Excel

Con Complementos oculto, la plantilla ofrece 24 columnas de perfumes, sin opciones ni ejemplos de accesorios. Al habilitarlo, incorpora dos columnas opcionales: `tipo_producto` (`perfume` o `complemento`) y `presentacion`. Los archivos anteriores se interpretan como perfumes. Para complementos, las columnas de género, familias, notas, intensidad y tamaño se dejan vacías; se utiliza el nombre de la presentación. Sin nombre, se utiliza Unidad. El importador mantiene la compatibilidad con archivos de 26 columnas: los complementos se guardan como borradores y, si la categoría está oculta, se indica que no se mostrarán hasta habilitarla.

Una fila corresponde a una presentación. Los datos generales del mismo producto deben coincidir entre filas; no se permiten presentaciones duplicadas.

## Modelo y futura persistencia remota

Se mantiene un único modelo y repositorio de productos. `Product.productType` distingue `perfume` y `complemento`; los registros antiguos sin tipo conservan su significado de perfume. `ProductVariant.ml` admite null y `label` identifica presentaciones nominales. `PurchasedLine.variantLabel` conserva el nombre comprado aunque el catálogo cambie posteriormente.

Las reglas de tipo y presentación están centralizadas en `src/domain/product-type.ts`; catálogo, administración, Excel y recomendador utilizan el mismo modelo. La futura implementación de Supabase debe conservar estos discriminantes, nulabilidad y validaciones en su adaptador y restricciones de base de datos. No se conectó Supabase en este cambio.

`AdminState.features.complementsEnabled` centraliza la visibilidad; `src/domain/store-features.ts` normaliza registros anteriores a `false`. El repositorio público expone esa configuración y únicamente devuelve productos habilitados para venta. Al integrar Supabase debe guardarse como configuración compartida de tienda y aplicarse también en las consultas públicas y la validación de compra. Actualmente se conserva en el almacenamiento local del panel, igual que el resto de su configuración.

## Verificación

`tests/complements.spec.ts` comprueba registro, vista previa, publicación, importación, edición de la imagen del Home, filtros combinados y móviles, descuento, favoritos, carrito, checkout, aprobación de pedido, reducción de stock y exclusión del recomendador. Los productos de prueba se crean únicamente en contextos aislados de Playwright.

Las capturas en `artifacts/complementos/` incluyen Home, catálogo vacío real y fichas/formularios de prueba en 1920 × 1080, 1366 × 768, 768 × 1024 y 390 × 844.
