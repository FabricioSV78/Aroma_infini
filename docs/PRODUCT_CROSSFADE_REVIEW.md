# Fotografías alternativas y fundido de producto

El hover de Más vendidos muestra una segunda fotografía mediante opacidad durante 450 ms, con retorno suave y marco 4:5 fijo. Las cuatro imágenes mantienen dimensiones iguales. El foco de teclado ofrece la misma vista; se respeta movimiento reducido. En móvil el enlace sigue navegando directamente.

El zoom anterior está conservado, desactivado, en [PRODUCT_ZOOM_SAVED.md](PRODUCT_ZOOM_SAVED.md).

## Assets

Se utilizó imagegen integrado en modo edición, con la imagen original de cada producto como referencia. Son fotografías conceptuales temporales: vista de tres cuartos con tapa al lado, manteniendo forma, color y etiqueta del frasco. No representan un nuevo tamaño en ml ni otra variante comercial.

Archivos publicados (cada nombre tiene versiones de 480 y 960 px):
- `public/images/cedre-alternate-{480,960}.webp`
- `public/images/petale-alternate-{480,960}.webp`
- `public/images/sillage-alternate-{480,960}.webp`
- `public/images/ambre-alternate-{480,960}.webp`

Los PNG originales se conservan en sus ubicaciones de generación. Las rutas exactas y el prompt enviado están en [alternate-product-assets.json](../scripts/alternate-product-assets.json). `node scripts/prepare-alternate-products.mjs` genera las variantes WebP a partir de esos originales; el build utiliza los assets ya preparados.

Prompt común:

> Edit target: the supplied perfume product photograph. Create an alternate studio photograph of EXACTLY THE SAME bottle for an ecommerce image-hover transition. Preserve the glass geometry, liquid color, blank label proportions, original cap shape and materials. Change the presentation: bottle viewed from a clear three-quarter angle, its cap removed and placed upright beside it on the same surface, revealing a realistic spray atomizer. Bottle and cap both fully visible, grouped centrally with generous margins. Same near-white seamless studio backdrop, soft natural product shadows, premium realistic glass reflections. Portrait 4:5 composition. No text, logos, extra bottles, plants, props, packaging, borders or watermark. This is a conceptual demonstration product, not a real branded item.

## Comprobación

Typecheck, lint y build correctos. Suite existente: 15 pruebas correctas. Comprobación adicional a 390/1440 px: imágenes cargadas, dimensiones iguales, alineación, dos fuentes distintas, opacidad de entrada/salida, ausencia de zoom, foco, movimiento reducido y navegación táctil.

Capturas: [vista original](../artifacts/bestsellers-crossfade/rest-1440.png), [segunda fotografía con hover](../artifacts/bestsellers-crossfade/hover-1440.png), [móvil](../artifacts/bestsellers-crossfade/rest-390.png).
