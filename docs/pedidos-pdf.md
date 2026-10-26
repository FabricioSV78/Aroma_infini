# Pedidos y documentos PDF

En **Pedidos**, marca uno o varios pedidos, o selecciona todos los resultados filtrados. La selección se conserva al pasar de página y se limpia al cambiar filtros para evitar incluir pedidos de otra consulta.

La barra ofrece **Cambiar estado**, **Exportar PDF** y **Quitar selección**. Los estados siguen separados del pago: Nuevo → En preparación → Enviado → Entregado. Se mantienen transiciones adyacentes, pago aprobado, datos de entrega necesarios, confirmación explícita de envío/entrega y resultados parciales de las actualizaciones masivas.

En el detalle, **Preparación del pedido** utiliza opciones visuales con iconos y el estado actual identificado. Solo se pueden elegir transiciones válidas. La selección muestra el cambio pendiente y permite **Deshacer**; únicamente **Guardar estado** lo aplica. Los radios admiten teclado y las confirmaciones de envío, entrega y retroceso se conservan. En tablet las opciones se organizan en dos columnas y en el lateral de escritorio o móvil en una.

## Exportación

1. Selecciona los pedidos y pulsa **Exportar PDF**.
2. Elige **Fichas de envío** (dos fichas de 150 × 100 mm por A4) o **Resúmenes de pedidos** (dos resúmenes breves por A4; los extensos usan páginas completas).
3. Revisa el número de documentos y pulsa **Descargar PDF**. Se descarga un único archivo con fecha de Lima en su nombre.

Imprime en papel A4 a tamaño real (100 %) para conservar las medidas de las fichas de 10 × 15 cm. Se disponen en horizontal y tienen líneas de recorte. Cuatro fichas de esas medidas no caben en A4 sin reducirlas. Con 50 pedidos se generan 25 hojas de fichas.

La exportación usa exactamente las referencias seleccionadas, incluidas las de otras páginas. No modifica estados, pagos, importes, inventario, selección ni historial.

Las fichas priorizan destinatario, contacto, dirección, distrito/provincia/departamento, referencia y modalidad. Si hay destinatario alternativo se usa su nombre; su DNI solo se incluye cuando está registrado para identificar a quien recibe. El correo del comprador no aparece en la etiqueta. Para pedidos antiguos sin teléfono propio se conserva el recurso al contacto del cliente existente.

Los resúmenes utilizan las líneas e importes guardados con el pedido: marca, producto, presentación, cantidad, precio comprado, precio habitual cuando hubo rebaja real, descuento del pedido, subtotal, envío, total y estados de pago/preparación. No recalculan compras históricas con precios actuales del catálogo. El formato breve conserva cliente, contacto y receptor alternativo; la dirección detallada corresponde a las fichas de envío. Se miden textos, filas y totales antes de elegir el formato: si no caben de forma legible en media hoja, se utiliza el resumen completo con sus continuaciones, sin encoger el documento.

Si faltan datos necesarios, el diálogo muestra cada pedido y sus campos por revisar. Descargar queda deshabilitado hasta corregirlos o elegir explícitamente **Exportar solo los pedidos válidos**. No se inventan datos. Una nueva apertura reinicia esa autorización. Los errores de generación conservan la selección y permiten reintentar; los controles y el cierre quedan bloqueados durante el procesamiento.

## Implementación

- `domain/order-documents.ts` centraliza validación, destinatario y nombre de archivo.
- `services/order-pdf.ts` genera texto vectorial con tipografía IBM Plex Sans incrustada y subconjuntos de caracteres. PDF-lib y fontkit se cargan al exportar, sin llamadas a servicios externos ni guardado de documentos en la base local.
- El diseño mide el texto, envuelve direcciones y nombres, respeta márgenes, repite cabeceras en continuaciones y evita páginas vacías. Cada documento se coloca como contenido vectorial en hojas A4 sin rasterizar ni reducir sus medidas. Los pedidos impares dejan un espacio libre en la última hoja. Una etiqueta con un texto excepcionalmente extenso se rechaza con un mensaje específico antes de descargar un documento ilegible.
- La interfaz depende de contratos de pedidos y clientes existentes. Supabase no se conecta; una futura lectura remota puede suministrar los mismos snapshots sin rediseñar la exportación.

## Retirada de agrupaciones y auditoría

Se retiraron la creación, los filtros, las pantallas, los enlaces y las APIs de lotes. La migración elimina exclusivamente los metadatos antiguos de agrupaciones del snapshot; conserva pedidos, líneas, pagos, clientes, inventario e historial operativo. Los parámetros antiguos de lote no aplican filtros ocultos.

No se solicita responsable manualmente. Los nuevos eventos locales registran fecha, estado anterior/nuevo, operación y actor técnico sin identidad autenticada. Los actores históricos se mantienen en los datos, aunque la interfaz muestra únicamente la transición, la fecha y si fue una acción individual o masiva. Un backend futuro deberá obtener la identidad autenticada del servidor.

## Pruebas

Se generan y descargan PDF reales de 1, 3, 5, 10, 50 y 100 pedidos en ambos formatos. PDF.js comprueba número de páginas, dimensiones, texto, caracteres y límites; las páginas primera, intermedia y final se renderizan en PNG para inspección visual. Las fichas y los resúmenes breves generan `ceil(pedidos / 2)` hojas A4; los casos impares no añaden hojas vacías. También se verifica un pedido de 85 líneas con continuaciones A4, selecciones entre páginas, destinatario alternativo, dirección larga y exclusión explícita de pedidos incompletos.

Las pruebas adicionales cubren conservación de historial al migrar, estados individuales y masivos, errores parciales, reintento de persistencia, doble envío, error de recursos del PDF y responsive en 1920, 1440, 1366, 768 y 390 px. Los documentos de pruebas usan pedidos sintéticos aislados del navegador; no crean pedidos remotos.

Capturas y documentos: `artifacts/order-pdf-export/`. Interfaz: `artifacts/order-workflow/export-*.png`.

## Pedidos de demostración y paginación

El panel local contiene 50 pedidos para revisar la navegación de 20 pedidos por página: 20, 20 y 10. Los registros añadidos usan referencias `AI-DEMO-…`, clientes de demostración, correos `example.invalid` y direcciones ficticias identificadas. No representan compras ni cambian existencias.

`content/demo-orders.ts` prepara solo los registros necesarios para completar 50. `demoOrdersVersion` registra la carga de una sola vez: al abrir un snapshot anterior se conservan todos sus pedidos, clientes e historial, sin sobrescribirlos; las recargas posteriores no duplican ni reponen registros modificados. Un snapshot con 50 o más pedidos no recibe pedidos extra. Estos datos locales no deben migrarse como ventas reales a un backend.

Se verificaron las tres páginas, referencias sin duplicados, selección entre páginas para PDF, recarga, migración sin cambios de inventario y navegación móvil. Capturas: `artifacts/orders-demo-pagination/`.

### Resultado de validación

La revisión de impresión agrupada aprobó **30 pruebas de generación y descarga PDF** y **33 regresiones** de envíos, teclado, estados y responsive. Capturas actualizadas: `artifacts/order-pdf-export/shipping-3-page-1.png` y `summary-3-page-1.png`. En el detalle del pedido se unificaron los textos **Ficha de envío** e **Imprimir ficha**.

- Suite completa: **773 pruebas aprobadas y tres omitidas por configuración**, sin fallos (`artifacts/order-export/full-suite.log`).
- Generador PDF: 10/10 casos; descargas reales, contenido y renderizado: 12/12; flujo de estados y migración: 22/22; regresiones del panel/checkout: 10/10.
- Revisión final de cancelación, reintento, doble envío y retirada de agrupaciones: 5/5 (`last-validation.log`).
- Typecheck, ESLint completo, build de producción y revisión de diferencias aprobados. Node mínimo 22.13 por las herramientas de inspección de PDF; verificado con 24.18.1. Las dependencias de inspección permanecen solo en desarrollo.
