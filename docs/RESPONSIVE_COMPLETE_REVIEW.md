# Revisión responsive de tienda y administración

## Alcance

Auditoría en Chrome real automatizado con viewports emulados. No sustituye una comprobación física en iOS/Safari o Android.

37 vistas: Home, catálogo, búsqueda, marcas y redirección de marca, producto, favoritos, carrito con producto, checkout, confirmación sin compra, seguimiento, acceso a cuenta, resumen, datos, direcciones, pedidos y detalle, pagos, favoritos de cuenta, páginas informativas y legales; dashboard administrativo, productos, alta y edición, marcas, pedidos y detalle, clientes, promociones, envíos y contenido del Home.

Capturas completas en 320×568, 390×844, 844×390, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080 y 2560×1440. La regresión automatizada incluye además 1280×600, 1600×900 y 1904×947, y las pruebas existentes de 360, 375 y 430 px.

## Hallazgos y correcciones

- **Video editorial en horizontal:** con 844×390, el texto y CTA excedían el bloque en unos 30 px. El espaciado ahora responde a la altura disponible y el bloque puede crecer con su contenido. Se conserva el encuadre completo del video.
- **Compra en pantallas bajas:** el bloque de compra deja de ser sticky por debajo de 650 px de alto en tablet/escritorio. Todos sus controles permanecen accesibles mediante scroll normal.
- **Favoritos en móvil:** se eliminó la excepción que reducía “Guardar” a 40 px; conserva el área táctil mínima de 44 px.
- **Carga tipográfica:** se reprodujo un salto de layout del hero de aproximadamente 0,145 al llegar la fuente. Se precargan los pesos 300, 400 y 500 de la tipografía existente. Vite transforma los enlaces a archivos compilados; no se introduce una fuente externa ni otra familia tipográfica.
- **Auditoría desactualizada:** se sustituyeron referencias antiguas de pedidos, se retiró la ruta administrativa de categorías eliminada y se espera a la cuenta antes de medir. Los nombres de capturas incluyen ancho y alto. Las vistas táctiles se ejecutan con `hasTouch`.

## Comprobaciones

Capturas de página completa y revisión de composición; overflow horizontal; imágenes rotas; errores de consola; texto recortado; controles pequeños. Pruebas de menús, filtros, modales, teclado, Escape y retorno del foco, galerías, hover, animaciones de aparición, movimiento reducido, carrito, checkout de demostración, cuenta y administración.

Resultado final: **333 capturas, 0 fallos de auditoría, 0 controles pequeños detectados y 0 textos recortados detectados**. La suite completa de Playwright terminó con **282/282 pruebas aprobadas**; `typecheck`, `lint` y `build` terminaron correctamente. El CLS medido en el Home quedó por debajo de 0,1 en los ocho tamaños de esa prueba (máximo observado: 0,036 a 360 px).

Las pruebas de ventanas comprueban los cuatro bordes del diálogo contra el viewport, incluyendo 844×390 y 1280×600. Las del video comprueban que su texto queda íntegramente dentro del bloque.

No se modifican reglas comerciales, integraciones ni la identidad visual aprobada. La confirmación de compra y pagos se prueban con los flujos simulados existentes; las capturas de acceso directo a confirmación muestran su estado vacío.

## Evidencia

- `artifacts/visual-ux-audit/responsive-verified/index.html`: índice navegable de las capturas finales; junto a él están `report.json` y las 333 imágenes.
- `artifacts/responsive-validation.log`: ejecución final de la suite completa.
- `artifacts/responsive-build.log`: compilación de producción.
- `artifacts/cls-details.json` y `artifacts/cls-after.json`: diagnóstico del salto del hero antes y después.

Comandos reproducibles: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e -- --workers=2` y, con Vite activo, `node scripts/audit-visual-ux.mjs responsive-verified`.
