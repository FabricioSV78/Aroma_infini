# Revisión visual y UX del Home

Alcance: únicamente `/`. Se conservaron las secciones, textos, fotografías, Lato y la paleta aprobada. Los estilos añadidos están limitados a `.home` y `.store-layout--home`; el catálogo y las fichas no reciben estos ajustes.

| Zona | Hallazgo y corrección |
| --- | --- |
| Navbar / hero | La integración del logo y la navegación era correcta en los tamaños habituales. En móviles pequeños el texto invadía el frasco; ahora foto y contenido tienen espacio propio. En horizontal se sirve la fotografía horizontal para evitar cortes fuertes. |
| Carrusel | Los puntos eran decorativos y la pausa solo aparecía al usar teclado. Ahora los puntos permiten elegir campaña y hay una pausa visible, con áreas de 44 px y foco accesible. Se mantienen cinco slides, tres segundos, flechas sutiles, gesto táctil y movimiento reducido. |
| Categorías | La altura mínima del mosaico generaba un vacío entre las entradas de la derecha. Se eliminaron esas restricciones y se corrigió el encuadre. En laptops de poca altura se presentan las tres entradas en una fila: a 1366 × 768, la sección pasa de 991 a 687 px. |
| Más vendidos | Cuatro columnas resultaban estrechas en tablet vertical. Se usan dos columnas, con cuatro en horizontal; marca, nombre, precio y tamaño tienen una jerarquía más clara. La selección de resolución de imagen acompaña ese ancho. El fondo sigue siendo `#F4F4F1`. |
| Marcas | La fotografía y los espacios consumían demasiado alto respecto a la lista. Se ajustaron tamaño de imagen y separación, manteniendo el cambio de fotografía por hover y foco. |
| Video editorial | El velo oscurecía demasiado toda la fotografía. El contraste se concentra junto al texto y deja más luminosa la imagen. Se añadió pausa/reproducción; la pausa elegida se conserva al salir y volver. Con movimiento reducido queda el póster, salvo reproducción voluntaria. |
| Destacados | El título se partía en demasiadas líneas cortas. Se ajustaron ancho y escala, y se compactó el conjunto de imagen y productos sin paneles anidados. |
| Atención / footer | Se conservaron los separadores, la superficie suave y los enlaces con área táctil adecuada. El enlace de ayuda en móvil se integra como una acción centrada, sin el rectángulo aislado anterior. |

## Verificación

- Capturas reales en Chrome: 1920 × 1080, 1366 × 768, 768 × 1024, 390 × 844, 320 × 568 y 844 × 390.
- Revisión de las cinco campañas; fotografías completas en los encuadres corregidos, sin solapamiento entre CTA e indicadores.
- Sin desbordamiento horizontal, imágenes rotas ni errores de JavaScript en el recorrido capturado.
- Hover de producto: imagen principal → alternativa → principal al salir; favoritos activan y desactivan correctamente.
- Navbar sólido al desplazarse, menú móvil, navegación por teclado, enlaces del Home y movimiento reducido comprobados.
- Suites: `home`, `home-gallery`, `hero`, `hero-rotation` y `home-media-controls`.
- Capturas y mediciones locales: `artifacts/home-current-audit/`.

## Dato pendiente del cliente

Instagram, Facebook y TikTok tienen `url: null` en `src/content/social.ts`. El footer los muestra como perfiles en preparación. Para convertirlos en enlaces se necesitan sus URLs oficiales; no se inventaron destinos.
