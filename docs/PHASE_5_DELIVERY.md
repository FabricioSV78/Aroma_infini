# Aroma Infini — Entrega de Fase 5

Fecha: 15 de septiembre de 2026.

Esta fase implementa favoritos y carrito sobre el catálogo de muestra existente. Conserva la dirección visual aprobada y no incorpora checkout, pagos, cuenta, backend ni Supabase.

## Favoritos

- `/favoritos` reúne los perfumes guardados con las mismas tarjetas y jerarquía del catálogo.
- El corazón comparte estado entre Home, catálogo, búsqueda, ficha y favoritos.
- Los IDs se guardan en `localStorage` con un esquema versionado y validado; no se duplican productos completos.
- Si el navegador bloquea el almacenamiento, la selección continúa durante la sesión y la interfaz lo comunica de forma discreta.
- Un ID retirado del catálogo no rompe la página y puede eliminarse de la selección.

## Carrito

- Cada línea se identifica por variante, por lo que dos presentaciones del mismo perfume permanecen separadas.
- La misma variante acumula cantidad sin superar el stock de muestra.
- La vista completa permite aumentar, reducir y retirar productos; muestra precio unitario, subtotal por línea y resumen consistente.
- El resumen distingue envío gratis desde S/450 de un envío todavía pendiente de destino.
- El botón de la ficha agrega la presentación seleccionada y muestra una confirmación breve sin abrir el panel de forma inesperada.
- El icono del header abre un panel lateral; `/carrito` ofrece la vista completa.
- El carrito persiste únicamente IDs de variante y cantidades mediante un esquema versionado. Al leerlo se reconcilia con el catálogo actual y señala variantes agotadas, faltantes o cantidades superiores al stock.

## Accesibilidad y responsive

- El panel lateral usa semántica de diálogo, bloquea el fondo, se cierra con Escape y devuelve el foco al control que lo abrió.
- Los contadores se anuncian con nombres accesibles; los controles de cantidad conservan objetivos táctiles de al menos 44 px.
- Las confirmaciones usan una región de estado sin mover el foco.
- Se respeta `prefers-reduced-motion` mediante la base de diálogos existente.
- Se revisaron favoritos y carrito en 360, 375, 390, 430, 768, 1024, 1280 y 1440 px: sin desbordamiento horizontal, imágenes rotas ni errores de consola.

## Capturas

`node scripts/capture-phase-5.mjs`, con Vite activo, genera vistas de favoritos, carrito, panel lateral y confirmación en 390, 768 y 1440 px. Las mediciones quedan en `artifacts/phase-5/measurements.json`.

## Validación final

- `npm.cmd run typecheck`: aprobado.
- `npm.cmd run lint`: aprobado, sin warnings.
- `npm.cmd run build`: aprobado con Vite 8.2.2.
- `npm.cmd run test:e2e -- --workers=1`: 79 pruebas aprobadas.
- Capturas automatizadas: cero overflow horizontal, cero imágenes rotas y cero mensajes de error o warning de la aplicación.

## Límites deliberados

- El CTA de pago permanece deshabilitado hasta la Fase 6.
- No se inventaron cupones, descuentos, tarifas por zona ni promociones.
- No se implementaron autenticación, sincronización con cuenta, stock real, checkout, órdenes ni pasarela.
- Los datos, precios, disponibilidad e imágenes siguen siendo ilustrativos.
