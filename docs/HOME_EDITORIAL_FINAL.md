# Marcas y comparación editorial

Revisión posterior a HOME_VISUAL_BALANCE.md. Alcance: Firmas con carácter y Dos perfumes, dos perfiles.

## Referencias observadas

Capturas de las páginas internacionales guardadas en `artifacts/home-editorial-final/references`.

- [D.S. & Durga](https://www.dsanddurga.com/): continuidad entre fotografía y descripción breve; diferencia clara entre nombre, perfil y precio.
- [Jovoy](https://www.jovoyparis.com/en/): las notas de salida, corazón y fondo ayudan a comparar productos sin abrir cada ficha. Se adopta esta utilidad con datos existentes, sin replicar su estilo tipográfico.
- [Saison](https://www.saison.com.au/): fotografía ambiental y cambios de escala. La captura intermedia está parcialmente cubierta por su formulario promocional; no se replican sus promociones ni colores.

## Decisiones

Marcas funciona como un índice de nombres de mayor escala, con fotografía contenida a la derecha y superficie cálida continua. En móvil se convierte en filas con miniatura, evitando otra cuadrícula de tarjetas. Se conservan enlaces, foco y selección fotográfica por ratón o teclado.

El dúo agrupa fotografía y dos perfiles en una sola composición horizontal de escritorio. Nombre, precio y notas comparten alineaciones; la información procede del mismo registro publicado que usa la tienda. En tablet y móvil las fichas quedan juntas bajo la fotografía para mantener la comparación. Las notas vacías no generan texto inventado.

Se mantienen Lato, las fotografías existentes, los favoritos y las rutas. No se alteran Hero, categorías, Más vendidos ni footer en esta revisión.

## Verificación

Capturas reales a 1920, 1366, 768 y 390 px; sin desbordamiento ni imágenes rotas. Comparador: `artifacts/home-editorial-final/comparison.html`.

21 pruebas de Home/galería y una prueba de edición del Home desde administración superadas. Typecheck, lint y build correctos. Persiste el aviso previo de tamaño del módulo ExcelJS.
