# Importación de productos con Excel

La importación registra los datos de perfumes y complementos con el mismo modelo que utiliza el catálogo. Todos los productos nuevos quedan como **borradores pendientes de fotos** hasta que el administrador añada una imagen principal y decida publicarlos.

La [plantilla definitiva](../artifacts/importacion-excel/aroma-infini-plantilla-productos.xlsx) contiene exclusivamente datos estructurados. No incluye imágenes, galerías, archivos multimedia ni campos de publicación. El administrador no necesita enlaces de fotografías, credenciales ni conocimientos de almacenamiento.

1. Abre **Productos → Importar productos con Excel** y descarga la plantilla. La descarga desde el panel incorpora las marcas registradas en ese momento.
2. Completa únicamente la hoja **Productos**. La hoja **Ejemplo** muestra un perfume con dos presentaciones; incluye un complemento cuando la categoría está habilitada. **Guía** explica cada columna. Las filas de ejemplo no se importan.
3. Sube el archivo `.xlsx` y pulsa **Revisar filas y confirmar**. Revisa los productos preparados, los errores con su número de fila y los posibles duplicados.
4. Confirma la importación de los productos válidos. El panel espera a que termine el guardado antes de comunicar el resultado.
5. Pulsa **Ver pendientes y subir fotos**, o selecciona **Pendientes de fotos** en el filtro de visibilidad de Productos. Abre **Subir fotos** en el producto que quieras completar.
6. Pulsa **Subir fotos** y selecciona hasta cuatro fotografías juntas desde tu computadora. Revisa **Vista previa**, marca **Producto activo en tienda** cuando la ficha esté completa y pulsa **Guardar producto**. También puedes guardar las fotos y mantener el producto como borrador.

**Cómo completar los datos.** Usa una fila por presentación. Repite el mismo `slug` y los mismos datos generales del producto en todas sus filas; cambia únicamente tamaño o presentación, SKU, precio y stock. Así, un perfume de 50 ml y 100 ml se registra como un producto con dos variantes. El `slug` es opcional: si se deja vacío, se genera a partir del nombre. Repetir una presentación dentro del mismo producto se considera un error.

El `sku` identifica cada variante y es opcional. Cuando se utiliza, debe ser único dentro del archivo y del catálogo, sin distinguir mayúsculas de minúsculas. Admite hasta 64 letras, números, puntos, guiones o guiones bajos; cada presentación necesita un código diferente. La comprobación de duplicados también utiliza slug, marca y nombre del producto. La importación agrega productos nuevos y nunca sobrescribe los existentes.

**Seleccionar opciones en Excel.** Al seleccionar una celda, las columnas `marca`, `genero`, `intensidad`, `descuento_tipo` y `descuento_activo` ofrecen sus listas desplegables. `tipo_producto` se incorpora al habilitar Complementos. `familia_olfativa` ofrece las ocho familias del catálogo. Excel elige una opción por celda, sin acumular selecciones: para varias familias, escribe sus nombres separados por comas, por ejemplo `Amaderada, Fresca`. El importador sigue comprobando que todas sean válidas.

El `slug` se genera desde el nombre si está vacío; `sku` puede quedar vacío, pues cada variante recibe un identificador interno independiente. Perfil breve, ocasión, temporada, notas y presentación permanecen como texto libre, igual que en el panel. La concentración del perfume se ha retirado del catálogo, del panel y de la plantilla: los archivos anteriores que todavía incluyan esa columna pueden importarse, pero su valor se ignora. La plantilla tiene 24 columnas con Complementos oculto; al habilitarlo desde **Contenido del Home → Categorías**, incorpora `tipo_producto` y `presentacion` y pasa a 26. Los archivos anteriores siguen siendo compatibles y no activan la categoría por sí mismos.

Nombre, descripción, precio y stock son obligatorios para todos los productos. Los perfumes también requieren una marca registrada, género, perfil aromático breve y tamaño en mililitros. Las familias y notas olfativas se utilizan según las reglas actuales del catálogo. Para complementos, selecciona `complemento` en `tipo_producto`, utiliza una presentación nominal —por ejemplo, Unidad o Negro— y deja vacíos el tamaño en mililitros y los campos olfativos. Su marca es opcional.

Escribe `precio_soles` como un importe positivo con un máximo de dos decimales, sin símbolo monetario ni separador de miles. `stock` y `umbral_stock` son enteros no negativos. Las fórmulas no se admiten. Conserva los nombres de las columnas y utiliza archivos de **hasta 5 MB y 1000 filas de datos**: el límite cuenta las variantes, no solo los productos principales.

**Descuentos.** El descuento pertenece al producto completo y debe repetirse en sus presentaciones. Puede dejarse vacío o completarse así:

| Campo                                | Uso                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `descuento_tipo`                     | `percentage` para porcentaje o `fixed` para un importe en soles.                                                                                           |
| `descuento_valor`                    | Porcentaje entero entre 1 y 99, o importe positivo con hasta dos decimales. El precio final debe seguir siendo mayor que cero en todas las presentaciones. |
| `descuento_activo`                   | `sí` o `no`; si existe un descuento, se considera activo por defecto. Esto activa la oferta, no publica el producto.                                       |
| `descuento_inicio` y `descuento_fin` | Opcionales. Admiten fechas `AAAA-MM-DD` —medianoche UTC— o fechas ISO con zona horaria. La fecha final debe ser posterior al inicio.                       |

**Revisión y guardado.** La vista previa presenta filtros **Todas**, **Con errores**, **Correctas** y **Duplicadas**, con un máximo de 25 filas por página. Las duplicadas forman parte de las filas con errores; sus contadores no deben sumarse como categorías independientes. Cada incidencia indica la fila y el motivo. Si una presentación tiene un error, se excluye el producto completo y todas sus variantes para evitar registros parciales. Los demás productos válidos pueden confirmarse. Corrige los productos rechazados en el archivo y vuelve a cargarlos.

Si el catálogo cambia después de validar el archivo, la confirmación se deshabilita y es necesario cargarlo de nuevo. La confirmación tiene protección contra dobles acciones y se vuelve a comprobar la revisión del catálogo al guardar. Reimportar el mismo archivo detecta los productos y SKU ya registrados sin duplicarlos ni modificar sus existencias.

Si falla la persistencia, el panel informa que los productos siguen en la sesión y ofrece **Reintentar guardado**. Este botón guarda de nuevo el estado actual sin volver a insertar el lote. Otra importación queda bloqueada mientras exista ese guardado pendiente. Se protege la navegación y se avisa antes de recargar o cerrar la pestaña con cambios sin guardar; mantén la pestaña abierta y completa el reintento para conservarlos.

**Fotografías y publicación.** Los borradores importados no aparecen en Tienda ni en su ficha pública. El listado muestra **Pendiente de fotos** y el enlace **Subir fotos** lleva directamente a la sección Fotografías. La primera imagen es la principal; pueden añadirse vistas secundarias, reordenarlas, reemplazarlas y quitarlas. Los perfumes también permiten cargar una imagen del perfil olfativo. Las imágenes preparadas se previsualizan antes de guardar. La publicación exige que la foto principal del catálogo coincida con la primera de la galería, además de cumplir las validaciones de marca, datos y variantes.

**Aceptación y pruebas.** Las pruebas se ejecutaron en localhost, con contextos de navegador aislados e IndexedDB de prueba. No utilizaron servicios ni inventario de producción. Los archivos mixtos contienen dos variantes por producto y exactamente seis productos con fallos intencionales: datos incompletos, precio incorrecto, dos productos con SKU repetido, marca inexistente y slug ya registrado.

| Archivo                                                                            | Productos candidatos | Filas | Productos importados | Productos rechazados | Variantes importadas |
| ---------------------------------------------------------------------------------- | -------------------: | ----: | -------------------: | -------------------: | -------------------: |
| [Mixto de 10](../artifacts/importacion-excel/productos-10.xlsx)                    |                   10 |    20 |                    4 |                    6 |                    8 |
| [Mixto de 50](../artifacts/importacion-excel/productos-50.xlsx)                    |                   50 |   100 |                   44 |                    6 |                   88 |
| [Mixto de 100](../artifacts/importacion-excel/productos-100.xlsx)                  |                  100 |   200 |                   94 |                    6 |                  188 |
| [Mixto de 300](../artifacts/importacion-excel/productos-300.xlsx)                  |                  300 |   600 |                  294 |                    6 |                  588 |
| [100 productos válidos](../artifacts/importacion-excel/productos-100-validos.xlsx) |                  100 |   200 |                  100 |                    0 |                  200 |

Consulta el [informe masivo y sus tiempos](../artifacts/importacion-excel/resultados-masivos.md), los [resultados JSON](../artifacts/importacion-excel/resultados-masivos.json) y la [aceptación de 100 productos válidos](../artifacts/importacion-excel/resultado-100-validos.json). Se verificaron precios, descuentos, stock por variante, complementos sin requisitos olfativos, exclusión de productos parciales, reimportación sin duplicados y ausencia de borradores en el catálogo público.

La entrega terminó con **85 pruebas únicas aprobadas**: **11 pruebas de navegador del importador y fotografías**, **73 regresiones** —que incluyen tres de las nuevas protecciones— y **una protección adicional**. También pasó la ejecución separada de las cuatro protecciones; sus tres casos repetidos no se vuelven a sumar. Las comprobaciones finales de TypeScript, lint global y compilación con Vite finalizaron correctamente.

Las ocho capturas documentan la revisión de filas y la vista previa del producto en cuatro tamaños. Las comprobaciones automatizadas de esos tamaños verificaron que los diálogos permanecieran dentro del viewport y no hubiera desbordamiento horizontal.

| Tamaño     | Revisión del Excel                                              | Producto con fotografías                                                         |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Móvil      | [Revisión](../artifacts/importacion-excel/revision-mobile.png)  | [Vista previa](../artifacts/importacion-excel/producto-vista-previa-mobile.png)  |
| Tableta    | [Revisión](../artifacts/importacion-excel/revision-tablet.png)  | [Vista previa](../artifacts/importacion-excel/producto-vista-previa-tablet.png)  |
| Portátil   | [Revisión](../artifacts/importacion-excel/revision-laptop.png)  | [Vista previa](../artifacts/importacion-excel/producto-vista-previa-laptop.png)  |
| Escritorio | [Revisión](../artifacts/importacion-excel/revision-desktop.png) | [Vista previa](../artifacts/importacion-excel/producto-vista-previa-desktop.png) |

**Almacenamiento e integraciones pendientes.** Actualmente las fotografías se preparan en el navegador: se valida el archivo, se recorta al formato correspondiente y se convierte a WebP. La imagen resultante se incorpora al estado administrativo guardado en IndexedDB de ese navegador. El panel indica que sus cambios se conservan localmente; esto no proporciona almacenamiento compartido entre equipos.

La persistencia compartida con **Supabase** y la subida real a **Cloudflare R2** siguen pendientes. La función actual no envía archivos a R2 ni simula una conexión. La futura integración debe sustituir la persistencia local mediante los servicios y repositorios existentes y efectuar las cargas mediante un backend autenticado, sin pedir al administrador URLs manuales ni exponer credenciales en el navegador. El estado general de esa migración se describe en [Preparación para Supabase](SUPABASE_READINESS.md).
