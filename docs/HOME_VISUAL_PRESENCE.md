# Home: presencia visual y jerarquía

Revisión del 11 de octubre de 2026. Alcance: Home; los datos, rutas, administración y funciones de compra se conservan.

## Referencias, una por una

Se consultaron las cinco páginas públicas. Se guardaron capturas y estilos computados en `artifacts/home-presence/references/`.

| Referencia                                  | Observación y adaptación                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Àerre](https://aerre.co/)                  | Fotografía de campaña cálida y amplia, mensaje breve, CTA inequívoco. Se toma la calidez de las fotografías existentes y la claridad de la acción; no se trasladan sus promociones, franjas negras ni acentos rojos.                                                                                                      |
| [D.S. & Durga](https://www.dsanddurga.com/) | El frasco ocupa un lugar dominante; nombres, notas y precio se distinguen. Se refuerzan títulos y nombres de producto, conservando las superficies claras y el fondo fotográfico oficial.                                                                                                                                 |
| [Phlur](https://phlur.com/)                 | El contenido público permite estudiar la separación entre novedades, más vendidos, colecciones y relato de marca. La página visual mostró una verificación de seguridad en dos navegadores: no se atribuyen conclusiones visuales a una captura que no pudo observarse. Se mantiene como referencia parcial de contenido. |
| [Jovoy](https://www.jovoyparis.com/en/)     | Blanco dominante, titulares negros y Cormorant Garamond con peso fuerte, fotos grandes y datos comerciales diferenciados. Se aplica el contraste de escala y peso. Se evaluó Cormorant, pero se conserva Lato para sostener la identidad de Aroma Infini y evitar introducir una segunda familia sin necesidad.           |
| [Saison](https://www.saison.com.au/)        | Composiciones fotográficas de gran formato, riqueza cromática dentro de las imágenes y variación de proporciones. Se adopta esa separación entre fotografía expresiva e interfaz sobria; no se copian colores de campañas ni popups.                                                                                      |

## Antes y después

| Sección        | Problema anterior                                                                                      | Corrección                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hero           | Titular Lato 300 demasiado fino sobre fondos claros; velo blanco que suavizaba en exceso las imágenes. | Peso 400, verde muy oscuro, CTA más firme y menor velo en escritorio. Se revisaron los cinco slides en laptop y móvil.                                                                                                               |
| Categorías     | Jerarquía débil en la composición de categorías.                                                       | Blanco y encabezado editorial distribuido. A petición del cliente se restaura el mosaico anterior: imagen grande a la izquierda y dos a la derecha en pantallas amplias; se conserva la adaptación previa en laptop, tablet y móvil. |
| Más vendidos   | Título ligero y datos comerciales poco diferenciados.                                                  | Título 700, nombres 700, precio destacado y tamaños/descriptores secundarios. Fondo de fotografía conservado en #F4F4F1. Separación por una línea fina, sin caja adicional.                                                          |
| Marcas         | Encabezado horizontal repetido, foto pequeña y espacio poco aprovechado.                               | Foto a la izquierda, título y listado a la derecha en escritorio. Nombres más presentes y un único fondo arena #F3F0E9. Se conserva la interacción con ratón y teclado.                                                              |
| Audiovisual    | Título tenue frente a una imagen expresiva.                                                            | Mayor escala y peso del título, CTA blanco legible y subrayado sutil. Video y poster cubren la sección sin marcos mediante cover, con recorte proporcional en los bordes.                                                            |
| Destacados     | Fondo gris repetido y título débil junto a la fotografía.                                              | Superficie blanca, foto cálida protagonista, título firme y nombres de producto diferenciados.                                                                                                                                       |
| Ayuda y footer | La jerarquía funcional ya era adecuada.                                                                | Revisados dentro del conjunto; se conserva su escala para no competir con las secciones comerciales.                                                                                                                                 |

La interfaz continúa mayoritariamente blanca. El verde se concentra en identidad, enlaces y acciones. Se retiran las sombras del hover de categorías; se conservan movimientos suaves de flechas e imágenes y el comportamiento de movimiento reducido. No se añaden secciones ni textos comerciales.

## Evidencia visual

[Comparador interactivo antes/después](../artifacts/home-presence/comparison.html)

| Tamaño              | Antes                                                      | Después                                                   |
| ------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Desktop 1920 × 1080 | [Captura](../artifacts/home-presence/before/home-1920.png) | [Captura](../artifacts/home-presence/after/home-1920.png) |
| Laptop 1366 × 768   | [Captura](../artifacts/home-presence/before/home-1366.png) | [Captura](../artifacts/home-presence/after/home-1366.png) |
| Tablet 768 × 1024   | [Captura](../artifacts/home-presence/before/home-768.png)  | [Captura](../artifacts/home-presence/after/home-768.png)  |
| Móvil 390 × 844     | [Captura](../artifacts/home-presence/before/home-390.png)  | [Captura](../artifacts/home-presence/after/home-390.png)  |

Las capturas usan Lato por defecto, los datos iniciales del catálogo y movimiento reducido para comparar el mismo estado. No alteran los datos del navegador del usuario. Los archivos de `artifacts` se generan localmente y no se versionan; pueden regenerarse con `node scripts/capture-home-presence.mjs before`, `after` o `references`, con el servidor de desarrollo activo. Para preservar una comparación, ejecutar `before` antes de editar.

## Validación

- Typecheck, lint y build correctos. El build mantiene el aviso previo por el tamaño de ExcelJS, que no se carga en el Home.
- 32 pruebas relevantes superadas entre Home, composición del hero, galería, controles de vídeo y rotación del carrusel. Se restauraron las pruebas del mosaico; se validó también la cobertura sin franjas del video en seis tamaños.
- Sin desbordamiento horizontal ni imágenes rotas en las resoluciones capturadas; un H1 activo.
- Las pruebas de Home cubren además 360, 375, 430, 1024, 1280 y 1440 px, foco del menú, navegación y movimiento reducido.
- Las fotografías de categorías conservan los tamaños asociados al mosaico anterior. Sin nuevas dependencias, fuentes ni imágenes.

## Archivos

- `src/styles/home-refinements.css`: jerarquía, superficies y composición del Home.
- `src/styles/hero-compositions.css`: título, legibilidad y tratamiento fotográfico del carrusel.
- `tests/home-gallery.spec.ts`: encuadre esperado del mosaico.
- `scripts/capture-home-presence.mjs`: referencias, capturas responsive y comparador.
