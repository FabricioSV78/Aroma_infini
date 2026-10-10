# Ajuste visual final de la tienda

Fecha: 6 de octubre de 2026. Criterio principal: feedback explícito del cliente sobre fondo fotográfico `#F4F4F1`, lectura del perfil olfativo y contraste suave en una web mayormente blanca.

| Recorrido | Decisión visual y propósito |
| --- | --- |
| Home | Las categorías mantienen el blanco humo como pausa después del hero. La selección de productos ya no suma un panel blanco dentro de otro fondo completo: la fotografía, el título y los bordes finos organizan la sección. |
| Catálogo, búsqueda y marcas | Los encabezados se apoyan en blanco y una división discreta. Los filtros y enlaces conservan el verde para indicar acciones o selección; las fotografías tienen soporte común `#F4F4F1`. |
| Ficha y recomendaciones | El soporte de fotografía usa `#F4F4F1` también en miniaturas, tarjetas relacionadas, sugerencias de búsqueda, resumen de compra y vista previa del aviso de producto. La compra sigue visible desde la primera pantalla. |
| Perfil olfativo | Una foto editorial de ingredientes acompaña, sin sustituir, los datos reales del producto. La familia y una frase sensorial abren la lectura; salida, corazón y fondo aparecen en secuencia numerada; intensidad, temporada y momento quedan como contexto. Se eliminó el panel coloreado anidado. |
| Panel administrativo | La vista previa reutiliza exactamente el perfil público. La fotografía de cada uno de los ocho productos de demostración corresponde a sus notas; los campos de temporada y momento tienen espacio suficiente para mostrar el valor entero. |

Las ocho fotografías de notas son evocaciones visuales generadas para los productos de demostración. Se identifican como tales en la ficha. Al crear un producto nuevo o modificar las notas de uno existente, el perfil muestra las notas sin mantener una fotografía que ya no les corresponda. Las fotografías comerciales originales tienen fondos opacos ligeramente distintos; el contenedor y la integración visual usan `#F4F4F1`, pero un cambio exacto de cada píxel dentro de los archivos originales requeriría fotografías aprobadas por la marca.

El [recorrido completo](../artifacts/visual-ux-audit/client-olfactory-complete/report.json) capturó 44 estados de tienda y panel en nueve viewports, de `320×568` a `2560×1440`: **396 capturas**, sin desbordamiento horizontal, errores de consola, imágenes rotas o pendientes visibles ni títulos duplicados. Ejemplos: [perfil en móvil](../artifacts/visual-ux-audit/client-olfactory-complete/producto-ambar-390x844.jpg), [perfil en laptop](../artifacts/visual-ux-audit/client-olfactory-complete/producto-iris-1440x900.jpg), [catálogo en tablet](../artifacts/visual-ux-audit/client-olfactory-complete/tienda-768x1024.jpg) y [editor administrativo](../artifacts/visual-ux-audit/client-olfactory-complete/admin-producto-editar-1440x900.jpg).

`typecheck`, `lint` y `build` finalizaron sin errores. La suite funcional y responsive completa terminó con **286 pruebas aprobadas**. El recorrido visual completo registró cero textos recortados y cero objetivos táctiles pequeños.
