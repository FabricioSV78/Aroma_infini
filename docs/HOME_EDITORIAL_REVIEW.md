# Home — segunda revisión editorial

**Revisión posterior vigente:** [HOME_FRONTEND_AUDIT.md](HOME_FRONTEND_AUDIT.md) registra la limpieza de ritmo y textos, precios según disponibilidad, favoritos locales y las capturas actuales. El resto de este documento conserva el historial de la segunda iteración visual.

13 de septiembre de 2026. **Implementada para revisión; pendiente de aprobación visual del cliente.**

**Ajuste vigente:** el cliente sustituyó el acercamiento por un fundido entre dos fotografías del mismo producto. Las imágenes siguen iguales y alineadas. Véase [PRODUCT_CROSSFADE_REVIEW.md](PRODUCT_CROSSFADE_REVIEW.md), con assets, validación y capturas actualizadas. El zoom descrito a continuación queda únicamente archivado para un uso futuro.

**Ajuste posterior solicitado:** Más vendidos vuelve a imágenes iguales de proporción 4:5, alineadas sin desfase (cuatro columnas en escritorio y dos en móvil). Al pasar el mouse se amplía suavemente el mismo producto un 18% dentro del marco fijo, con transición de 650 ms y retorno al retirar el puntero. También funciona con foco de teclado y respeta movimiento reducido. El hover se limita a dispositivos con mouse; en pantalla táctil el enlace navega directamente. Se verificaron dimensiones, alineación, hover, retorno, foco y navegación táctil a 390/1440 px; typecheck, lint y build correctos. Capturas actualizadas: [escritorio](../artifacts/bestsellers-adjustment/rest-1440.png), [acercamiento](../artifacts/bestsellers-adjustment/hover-1440.png), [móvil](../artifacts/bestsellers-adjustment/rest-390.png). El resto de este documento y sus capturas registran la iteración anterior.

## Alcance y decisiones

Se mantienen el navbar y las dos diapositivas del hero aprobados. Solo se simplifica la franja posterior al hero: se elimina un titular redundante y se conserva el enlace a marcas. Se aplicaron nuevamente las cuatro skills de frontend del proyecto y la base de REFERENCE_AUDIT.md y FRONTEND_DESIGN_PLAN.md.

| Sección | Cambio | Motivo |
| --- | --- | --- |
| Marcas | Introducción editorial y cuatro nombres de gran escala, con índices discretos y enlaces sin cajas. | Dar presencia al descubrimiento multimarca y distinguirlo de una lista de navegación. |
| Para él / Para ella / Unisex | Tres fotografías nuevas. En escritorio, una imagen alta junto a dos horizontales; en móvil, dos verticales y Unisex a todo el ancho. | Introducir escala, textura y una composición específica para cada ancho. |
| Más vendidos | Proporciones alternadas y desfase vertical contenido; fotografías mayores, marca/nombre/precio/presentaciones separados y flecha en el enlace de producto. | Hacer que el frasco protagonice la sección manteniendo la lectura comercial. |
| Favoritos y foco | Corazón con superficie blanca discreta y objetivo de 44 × 44 px; foco visible. | Mantener el acceso legible sobre fotografías y con teclado. |
| La belleza de lo esencial | Banda a todo el ancho, fotografía y titular de mayor escala. | Crear una pausa visual clara entre las dos selecciones de producto. |
| Destacados y transiciones | Mayor escala compartida de producto, composición escalonada y espaciados ajustados. | Retomar el producto tras la pausa editorial sin repetir exactamente la sección anterior. |

La base sigue siendo blanca. No se añadieron dependencias, pantallas, estado comercial, backend ni cambios a los contratos de datos. Los enlaces de producto y favoritos conservan sus destinos informativos existentes. Las marcas, precios, imágenes y relatos siguen siendo temporales.

## Referencias

Se retomó el análisis visual documentado en [REFERENCE_AUDIT.md](REFERENCE_AUDIT.md). Se volvieron a consultar por lectura web las portadas de [Jovoy](https://www.jovoyparis.com/en/), [Aedes](https://www.aedes.com/), [D.S. & Durga](https://www.dsanddurga.com/), [Vilhelm](https://vilhelmparfumerie.com/), [Twisted Lily](https://twistedlily.com/) y [Phlur](https://phlur.com/). Esta lectura complementaria no constituye una nueva inspección visual interactiva de las seis webs; se conservan los límites de la auditoría, especialmente los de Phlur.

La interpretación propia combina la claridad multimarca y comercial del análisis de Jovoy/Twisted Lily, la curaduría de Aedes, la jerarquía de producto de D.S. & Durga, la escala fotográfica de Vilhelm y la continuidad de descubrimiento estudiada en Phlur. No se copiaron layouts ni se incorporaron imágenes de estas tiendas.

## Verificación

- Typecheck, lint y build: correctos.
- Suite existente de Playwright: 15 pruebas correctas; cubre 360, 375, 390, 430, 768, 1024, 1280 y 1440 px.
- Revisión visual directa de Home y sus cinco secciones principales a 390 y 1440 px. Se corrigió el recorte de Para ella en escritorio para conservar el frasco completo.
- Sin overflow horizontal, imágenes rotas ni errores/advertencias de consola de la aplicación en las pruebas.
- Precios y presentaciones visibles sin hover; enlaces con foco y favoritos de 44 × 44 px comprobados.
- Hero, menú móvil, retorno del foco, navegación por ancla y preferencia de movimiento reducido verificados con la suite existente.
- Verificación en Chrome local con viewport emulado; no equivale a pruebas en dispositivos físicos ni a una auditoría integral de accesibilidad.

## Capturas

| Vista | Home completo | Detalles |
| --- | --- | --- |
| 390 px | [Home móvil](../artifacts/home-editorial/home-390.png) | [Marcas](../artifacts/home-editorial/brands-390.png), [categorías](../artifacts/home-editorial/categories-390.png), [más vendidos](../artifacts/home-editorial/bestsellers-390.png), [editorial](../artifacts/home-editorial/editorial-390.png), [destacados](../artifacts/home-editorial/featured-390.png) |
| 1440 px | [Home escritorio](../artifacts/home-editorial/home-1440.png) | [Marcas](../artifacts/home-editorial/brands-1440.png), [categorías](../artifacts/home-editorial/categories-1440.png), [más vendidos](../artifacts/home-editorial/bestsellers-1440.png), [editorial](../artifacts/home-editorial/editorial-1440.png), [destacados](../artifacts/home-editorial/featured-1440.png) |

Con Vite activo: `node scripts/capture-home-review.mjs`. Las capturas completas usan viewports iniciales de 390 × 844 y 1440 × 900. Para los recortes aislados se amplía la altura de captura y se ocultan únicamente los elementos fijos, evitando que tapen el contenido. Las capturas son artefactos locales, excluidos del control de versiones.

## Fotografías temporales

Imágenes conceptuales originales generadas con imagegen; no representan productos ni identidades comerciales confirmados. Se conservan los PNG originales fuera del proyecto y se publican únicamente nueve variantes WebP (480, 960 y 1536 px de ancho, calidad 85). No requieren red en ejecución.

El manifiesto `scripts/discovery-assets.json` registra las rutas locales de origen; `node scripts/prepare-discovery-images.mjs` vuelve a producir las variantes cuando esos originales están disponibles. El build utiliza los WebP ya preparados.

Prompts enviados (cada uno recibió además el sufijo común):

### discovery-bois

Portrait editorial perfume photograph, clear rectangular unbranded bottle with matte charcoal cap on sculptural pale grey stone, textured cedar wood, architectural side light, tactile mineral textures. Entire bottle centered, occupies 45% image height. 1024x1536.

Original: `C:\Users\USUARIO\.codex\generated_images\01a097a9-5d43-72c3-9e56-29e1fb6b1905\exec-71d58585-39f8-4829-ab16-07eea585fcef.png`.

### discovery-petale

Landscape editorial perfume photograph, wide cylindrical clear unbranded bottle of pale blush liquid and silver cap gently tilted in ivory fabric folds, one translucent petal. Overhead three-quarter angle, soft daylight. Entire bottle in central 40 percent of width, fit portrait crop. 1536x1024.

Original: `C:\Users\USUARIO\.codex\generated_images\01a097a9-5d43-72c3-9e56-29e1fb6b1905\exec-56bc8e56-e00e-4356-8136-d9626335f1a0.png`.

### discovery-libre

Landscape editorial perfume photograph, muted olive-grey tall unbranded bottle with round black cap on pale travertine ledge, river pebble and clear glass sphere. Ripple of sunlight across white plaster wall. Entire bottle slightly right of center, 60% frame height. 1536x1024.

Original: `C:\Users\USUARIO\.codex\generated_images\01a097a9-5d43-72c3-9e56-29e1fb6b1905\exec-df1533ee-d639-4d25-97d6-ce318c899c7f.png`.

Sufijo común:

> Premium contemporary fragrance campaign, realistic photography, quiet sophisticated natural light. No text, logos, watermark, gold decoration or recognizable branded packaging. Temporary conceptual image for a white minimal fragrance store.

Esta entrega cierra exclusivamente la iteración visual del Home. La siguiente fase permanece pendiente de aprobación.
