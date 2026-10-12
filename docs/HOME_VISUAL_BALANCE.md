# Ajuste final de composición del Home

Esta revisión sustituye las composiciones de marcas y del dúo descritas en HOME_VISUAL_RHYTHM.md, atendiendo al feedback posterior del cliente.

- Más vendidos: cuatro columnas en escritorio, mayor separación entre cards, contenido agrupado bajo cada foto, nombres sin alturas vacías añadidas, precio destacado y tamaños debajo. «Ver perfume» ocupa el pie completo con un separador fino. Las fotografías mantienen #F4F4F1.
- Firmas con carácter: cabecera compartida, fotografía limitada a 360 px en escritorio y listado próximo, dentro de una composición de hasta 1140 px. Se mantienen las fotografías editoriales, el fondo cálido y la navegación con ratón y teclado.
- Dos perfumes, dos perfiles: una fotografía de hasta 960 px y dos fichas contiguas debajo, alineadas con ambos frascos. En tablet y escritorio los precios se sitúan junto a los nombres y perfiles; en móvil se conserva la comparación en dos columnas con información apilada dentro de cada ficha. Se mantienen favoritos y enlaces a producto.

[Comparador de antes y después](../artifacts/home-balance/comparison.html): Home y secciones individuales en 1920 × 1080, 1366 × 768, 768 × 1024 y 390 × 844. La captura anterior corresponde al inicio de esta revisión, no a versiones históricas.

Validación: 21 pruebas de Home y galería superadas, incluyendo navegación, teclado, movimiento reducido y tamaños entre 360 y 1904 px. Las cuatro capturas finales no presentan overflow ni imágenes rotas. Se corrigió un redondeo de anchos de las cards utilizando separaciones enteras, conservando la comprobación existente de igualdad de tamaños. Typecheck, formato, lint y build correctos. El build conserva el aviso de tamaño del módulo ExcelJS, ajeno a estos ajustes visuales.
