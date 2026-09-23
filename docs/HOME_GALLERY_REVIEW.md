# Home — galería de firmas y producto sobre blanco

Iteración del 14 de septiembre de 2026, completada tras la indicación de continuar. Sustituye las decisiones de fondo de Más vendidos y tratamiento de marcas de HOME_RHYTHM_REVIEW.md. El usuario exige fondo blanco en Más vendidos y mayor carácter visual en marcas, manteniendo una Home limpia y profesional.

## Referencias revisadas una por una

| Referencia | Evidencia y criterio aprovechado | Aplicación propia |
| --- | --- | --- |
| [Jovoy](https://www.jovoyparis.com/en/) | Consulta actual de contenido y navegador: distingue campaña, producto sobre blanco y descubrimiento de firmas con fotografías grandes, nombre y texto breve. | Cada firma se relaciona visualmente con un perfume; la sección comercial conserva blanco. |
| [Aedes](https://www.aedes.com/) | Contenido y navegador: mosaico de campañas fotográficas, separaciones blancas estrechas, enlaces breves y banner seguido por productos blancos. El hero inicial apareció negro: no se atribuye a ese frame una composición verificada. | Una campaña panorámica y una galería de marcas diferenciada. No se reproduce su abundancia de campañas. |
| [D.S. & Durga](https://www.dsanddurga.com/) | Hero de gran escala, tipografía sans, fotografía de campaña y contraste con presentación comercial de tamaños/precios. Verificación en navegador y lectura de contenido. La captura intermedia contiene una zona todavía sin producto renderizado; no se interpreta como espacio editorial deliberado. | Escala tipográfica y un único cambio suave de fotografía ligado a una acción del visitante. No se copia su crema dominante ni su identidad. |
| [Vilhelm](https://vilhelmparfumerie.com/) | Verificación visual: campaña inmersiva, producto sobre blanco y fotografía institucional con márgenes. | Alternar campaña a todo el ancho con bloques de exploración contenidos. |
| [Twisted Lily](https://twistedlily.com/) | Verificación visual: márgenes coherentes, producto aislado sobre blanco y escenas editoriales amplias asociadas a una selección. | Mantener claridad comercial y dar contraste mediante las secciones vecinas, sin teñir Más vendidos. |
| [Phlur](https://phlur.com/) | El lector muestra acceso temprano a bestsellers, descubrimiento e identidad. El navegador respondió «Just a moment…»; no se verificaron visualmente sus proporciones ni interacciones. | Mantener acceso temprano al producto y enlaces claros. No se deducen colores ni layouts de la extracción textual. |

Las referencias se utilizaron para criterio, no para copiar assets, textos, marcas o código. Capturas de D.S. & Durga y Vilhelm y registro del bloqueo de Phlur: `artifacts/reference-revisit/`. Script reproducible: `node scripts/inspect-home-references.mjs`. Jovoy, Aedes y Twisted Lily se inspeccionaron en navegador mediante las herramientas de Chrome.

## Composición implementada

El recorrido queda: **hero → categorías → Más vendidos → campaña de ATELIER 01 → marcas → destacados → entregas**. Cada bloque orienta, muestra producto, introduce una firma o resuelve una duda. El 14 de septiembre se retiró por solicitud del usuario el bloque final «El perfume es personal»; la Home termina directamente en la información práctica y el footer.

- **Más vendidos:** fondo blanco explícito. Se mantienen fotos alineadas, tamaños, precio disponible, agotados, favoritos y fundido de imágenes.
- **Categorías:** la superficie suave pasa a este bloque para distinguirlo del producto blanco que sigue. Se conserva la composición asimétrica aprobada.
- **Marcas:** se reemplaza la lista compacta por «Firmas con carácter». Nombres grandes y uniformes; cada firma se acompaña del perfume y familia ya presentes en los datos de muestra. Ratón y foco de teclado cambian la imagen y su pie mediante un fundido de 380 ms. El enlace sigue llevando directamente a la marca. No hay autoplay, tarjetas con borde ni testimonios inventados.
- **Móvil:** cada firma tiene una miniatura propia visible. No se exige hover ni una pulsación extra para navegar. La galería grande solo se monta desde 768 px; el cambio de ancho conserva los enlaces y no deja imágenes ocultas sin cargar en el DOM móvil.
- **Destacados:** vuelve al blanco para distinguirse de la galería suave anterior; conserva fotografía a todo el ancho de su mitad y fichas compactas.
- **Entregas:** una línea discreta cierra la selección y abre la información operativa.

La galería gana altura para dar escala a la fotografía y a las firmas. Home pasa de 5977 a 6328 px a 390 px, y de 5274 a 5915 px a 1440 px respecto a la revisión «rhythm». No se añaden secciones: el incremento corresponde al bloque de marcas. La revisión sigue siendo una propuesta visual, no una afirmación de mejora de conversión ni de exclusividad en el mercado peruano.

## Validación

`typecheck`, `lint` y `build` correctos, sin warnings. **47 pruebas aprobadas** con `npm.cmd run test:e2e -- --workers=1 --global-timeout=180000`.

Se incluyen tres pruebas nuevas: cambio de fotografía por ratón/teclado y navegación a la firma; miniaturas móviles/cambio de ancho; fondo blanco, alineación de Más vendidos y reduced motion. Las pruebas existentes verifican hero, catálogo, navegación, Escape, foco y favoritos.

Ocho anchos: 360, 375, 390, 430, 768, 1024, 1280 y 1440 px. Sin overflow horizontal, imágenes rotas ni errores/avisos de consola en los recorridos comprobados. CLS local observado menor de 0.002. Capturas completas y por sección en `artifacts/home-audit/gallery/`:

- [390 px](../artifacts/home-audit/gallery/home-390.png)
- [768 px](../artifacts/home-audit/gallery/home-768.png)
- [1440 px](../artifacts/home-audit/gallery/home-1440.png)
- [Marcas desktop](../artifacts/home-audit/gallery/brands-1440.png)
- [Marcas móvil](../artifacts/home-audit/gallery/brands-390.png)

## Archivos y límites

Nuevo componente: `src/features/home/BrandGallery.tsx`. Se actualizaron `HomePage.tsx`, `HomeSections.tsx` y `src/styles/home.css`; el componente y los estilos de `AboutPreview` se eliminaron completamente. Nuevos tests: `tests/home-gallery.spec.ts`. Scripts: `capture-home-audit.mjs`, `capture-home-review.mjs`, `inspect-home-references.mjs`. Documentación: README y este informe.

Se reutilizan las fotografías alternativas existentes. No hay dependencias nuevas, backend ni avance a fase 4. El navbar y catálogo con filtros laterales mantienen sus recorridos. Pendiente: revisión visual del cliente y sustitución futura del contenido ilustrativo por el catálogo real aprobado.
