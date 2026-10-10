# Revisión visual de Aroma Infini con el feedback del cliente

Fecha: 6 de octubre de 2026. Alcance: tienda pública, con recorrido de regresión del panel administrativo. El manual de marca sigue en desarrollo; sus indicaciones se trataron como guía visual, no como reglas de negocio.

## Dirección aplicada

El blanco permanece como fondo principal. El verde de marca `#003935` se reserva para el logotipo, las acciones principales y los estados activos; el footer usa un gris verdoso claro `#F0F2EF` para que el cierre no sea demasiado intenso. Las superficies secundarias usan blanco humo `#F4F4F1` y salvia `#E8EFED`. El texto principal es `#242827` y el borde `#E5E7E5`. Lato se sirve localmente en los pesos 300, 400 y 700 y sigue siendo la única fuente predeterminada de la tienda. La combinación opcional con Cormorant Garamond no se adoptó.

Se revisaron individualmente las seis referencias del proyecto: [Jovoy Paris](https://www.jovoyparis.com/en/), [Aedes](https://www.aedes.com/), [D.S. & Durga](https://www.dsanddurga.com/), [Vilhelm Parfumerie](https://vilhelmparfumerie.com/), [Twisted Lily](https://twistedlily.com/) y [Phlur](https://phlur.com/). Se tomó de ellas la claridad de la fotografía, la separación funcional de secciones y la visibilidad de la acción de compra, sin reproducir sus composiciones.

## Ajustes por recorrido

| Apartado | Mejora aplicada |
| --- | --- |
| Cabecera | Logotipo vectorial del manual sobre blanco, en escala compacta; foco visible y navegación actual conservados. |
| Hero | Cinco campañas con imágenes panorámicas y verticales adaptadas al viewport. Cada slide rota tras 3 segundos, el fundido dura 550 ms y hay flechas de 44 px, gestos horizontales y navegación por teclado. La rotación se pausa al interactuar, al salir del viewport o con movimiento reducido. Las campañas 4 y 5 usan fotografías editoriales generadas para esta demostración, sin marca ni promesas de producto. |
| Categorías y colecciones | Fondo humo para diferenciar el descubrimiento; colección de más vendidos sobre blanco. Fotografías completas y tarjetas con familia, precio y foco interactivo más claros. |
| Marcas y editorial | Galería de marcas sobre blanco humo, con salvia en interacciones pequeñas; directorio con fotografía de productos ya existentes y enlace al catálogo filtrado. El video conserva el encuadre completo y en tablet ya no presenta franjas oscuras. |
| Catálogo y búsqueda | Cabecera compacta, filtros más reconocibles, estados activos verdes y fondo fotográfico común. Si la búsqueda devuelve un solo producto, usa una ficha horizontal para evitar una columna vacía; el filtro sigue accesible. |
| Ficha de producto | Compra y variante seleccionada tienen mayor prioridad visual. Los productos agotados conservan estados neutros. La familia olfativa presenta intensidad, momento, temporada y notas 01–03 con rótulos más legibles. El aviso social se muestra cuando deja de cubrir la galería; en pantallas pequeñas entra en el flujo de la página. |
| Carrito, checkout y cuenta | Resúmenes, selección, estados y pedidos se distinguen mediante superficies suaves y bordes discretos. Se mantuvieron las reglas y funciones ya existentes. |
| Ayuda y páginas informativas | En pantallas de hasta 1199 px, la ayuda aparece después del contenido para no tapar fotos, precios ni CTA; el panel sigue siendo accesible. Contacto y Nosotros usan bloques suaves donde existe una acción útil. |
| Footer | Se sustituyó el verde oscuro dominante por `#F0F2EF`, conservando el logotipo verde y la navegación. |

## Comprobación visual y funcional

El [reporte de recorrido completo](../artifacts/visual-ux-audit/client-feedback-complete/report.json) registra 351 capturas de 39 estados de ruta en nueve viewports: `320×568`, `390×844`, `844×390`, `768×1024`, `1024×768`, `1366×768`, `1440×900`, `1920×1080` y `2560×1440`. Incluye 28 estados públicos y 11 administrativos. No registró desbordamientos horizontales, imágenes rotas, errores de consola, texto recortado ni objetivos táctiles pequeños. Las capturas se inspeccionaron en móvil, tablet, laptop y escritorio.

Tras añadir el carrusel se capturaron las dos campañas nuevas en ocho viewports adicionales (16 capturas) y se verificó que la acción y las flechas estuvieran dentro de cada pantalla, sin desbordamiento. Ejemplos: [slide ámbar, móvil](../artifacts/visual-ux-audit/carousel-final/slide-4-320x568.png), [slide cítrico, móvil](../artifacts/visual-ux-audit/carousel-final/slide-5-390x844.png), [slide ámbar, tablet](../artifacts/visual-ux-audit/carousel-final/slide-4-768x1024.png), [slide cítrico, laptop](../artifacts/visual-ux-audit/carousel-final/slide-5-1440x900.png) y [slide ámbar, monitor grande](../artifacts/visual-ux-audit/carousel-final/slide-4-2560x1440.png).

El [recorrido final del Home](../artifacts/visual-ux-audit/carousel-final-home/report.json) añadió 18 capturas de portada y editor administrativo en los nueve viewports; registró cero fallos, objetivos táctiles pequeños o textos recortados.

Las imágenes 4 y 5 se crearon con la herramienta integrada de generación de imágenes y se guardaron como WebP optimizados en `public/images/hero-v4-amber-*` y `public/images/hero-v4-citrus-*`, cada una en tres tamaños de escritorio y tres de móvil. Prompt ámbar: fotografía editorial de frasco ámbar sin marca, etiqueta en blanco, travertino y madera, luz cálida, espacio limpio a la izquierda para texto. Prompt cítrico: frasco claro sin marca junto a bergamota y caliza blanca, luz de mañana, espacio limpio a la izquierda. Las variantes móviles conservaron el producto en la mitad superior y dejaron piedra clara para el texto en la mitad inferior.

Las comprobaciones de `typecheck`, `lint` y `build` finalizaron sin errores. Las 12 pruebas específicas del carrusel pasaron y la suite completa cerró con **286 pruebas aprobadas**. Dos ejecuciones previas sufrieron recargas del servidor de desarrollo mientras se escribía este informe; los recorridos afectados pasaron de nuevo, incluido el de compra con cuenta en diez repeticiones aisladas. La ejecución final se realizó sin cambios de archivos simultáneos.

## Pendiente de confirmación de marca

La variante verde del logotipo sobre blanco se derivó de las formas vectoriales del manual. Es legible en una cabecera blanca; conviene confirmar esta aplicación cuando el cliente publique el manual definitivo. Las nuevas imágenes del hero son material visual de demostración y no fotografías de productos reales del catálogo.

## Revisión final de equilibrio visual

Se reforzó la jerarquía de los rótulos de las secciones del Home con el verde de marca, se dio un contorno y una respuesta de hover discretos a las fotografías de categorías, y se distinguieron los accesos de marcas y las líneas del carrito con superficies apenas más definidas. Los iconos de la franja de entrega y ayuda ahora tienen un fondo salvia pequeño que facilita reconocer cada servicio. No se añadieron secciones, textos comerciales, fuentes ni colores intensos.

El [recorrido final de 351 capturas](../artifacts/visual-ux-audit/final-balanced-contrast/report.json) incluye móvil, tablet, laptop y monitores amplios en nueve tamaños. Registró cero desbordamientos horizontales, imágenes rotas, errores de consola, textos recortados y objetivos táctiles demasiado pequeños. `typecheck`, `lint`, `build` y las **286 pruebas e2e** terminaron correctamente.

## Revisión según el feedback explícito más reciente

La auditoría se volvió a realizar sobre el estado actual, tomando el texto del cliente como criterio principal. El manual en desarrollo confirma Lato, el verde `#003935` y un mínimo digital de 55 px para el logotipo; no prescribe tamaños de títulos web ni incluye Cormorant Garamond. Por ello Lato sigue siendo la fuente predeterminada, los títulos conservan su escala adaptable y no se introdujo otra familia.

| Sección | Decisión y motivo |
| --- | --- |
| Cabecera y hero | Se mantienen blancos o fotográficos. La imagen editorial aporta impacto sin añadir un fondo de marca dominante; el texto hereda ahora el `#242827` correcto. |
| Descubrimiento | `#F4F4F1` diferencia las categorías del hero y de los productos sin un salto brusco; las imágenes llevan un contorno apenas visible para reconocerse como accesos. |
| Más vendidos y catálogo | El blanco deja respirar el producto. Los contenedores de fotografía comparten `#F4F4F1`; una mezcla `darken` integra mejor los fondos claros ya presentes en los WebP opacos, sin alterar los archivos de producto. El verde se reserva para precios, selección y acciones. |
| Marcas | La gran galería salvia pasó a `#F4F4F1` para preservar la predominancia blanca; los estados activos mantienen un acento verde y la fotografía se distingue mediante un borde fino. El directorio usa cards blancas con borde y salvia solo al interactuar. |
| Video y selección editorial | El video sigue siendo la pausa fotográfica de mayor contraste. En tablet se redujo el alto mínimo y el padding para mostrar todo el encuadre sin bandas negras. La selección siguiente usa blanco humo con fichas blancas. |
| Ficha de producto | La compra continúa visible desde la primera vista. En pantallas bajas la galería gana presencia colocando sus controles dentro del marco fotográfico, sin desplazar la compra. La familia olfativa emplea salvia solo para ordenar las notas. |
| Carrito, checkout, cuenta y páginas informativas | Se conservan mayormente blancos. Humo o salvia separan resúmenes y acciones concretas; los CTA principales son verdes. No se añadieron bloques decorativos. |
| Footer | Permanece en un gris verdoso muy claro `#F0F2EF`, con identidad en logotipo y acentos. La distribución tablet se compactó para evitar una fila adicional de enlaces. |

Las fotografías comerciales originales tienen fondos claros opacos ligeramente distintos entre sí. El CSS los integra visualmente en el soporte `#F4F4F1`, pero la sustitución exacta de cada píxel requeriría archivos de producto aprobados por la marca; no se modificaron botellas, etiquetas ni colores de las fotografías.

El [nuevo recorrido de 351 capturas](../artifacts/visual-ux-audit/client-brand-complete/report.json) cubre 39 estados en nueve viewports, del móvil estrecho al monitor de 2560 px, y registró cero errores de consola, imágenes rotas, desbordamientos, textos recortados y objetivos táctiles menores de 44 px. La [revisión final de fichas](../artifacts/visual-ux-audit/client-brand-product-final-2/report.json) añade 54 capturas en esos tamaños tras el ajuste de la galería móvil. En móvil y tablet se eliminó la fila de accesos duplicada que aparecía junto a las pestañas de contenido; las pestañas siguen visibles y operativas.
