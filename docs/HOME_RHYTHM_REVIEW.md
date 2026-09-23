# Home — recorrido y contraste entre secciones

14 de septiembre de 2026. Nueva iteración autorizada por el usuario después de la Fase 3. Sustituye el criterio de mantener todas las secciones dentro del mismo contenedor de HOME_COMPOSITION_REVIEW.md.

## Diagnóstico y dirección

La repetición de fondos blancos, márgenes idénticos y bloques de fotografía junto a texto diluía la separación entre apartados. La solución alterna anchos y densidad, reduce la sección de marcas y adelanta el acceso a productos. No se añadieron secciones, promociones ni relatos de marca inventados.

Referencias consultadas: [Aedes](https://www.aedes.com/) alterna campañas de firmas con novedades; [D.S. & Durga](https://www.dsanddurga.com/) combina acceso al perfume con formatos de descubrimiento; [Vilhelm](https://vilhelmparfumerie.com/) intercala producto e identidad; [Phlur](https://phlur.com/) se conserva como referencia de descubrimiento. También se mantiene la auditoría previa de Jovoy y Twisted Lily. Se interpreta el ritmo comercial/editorial sin copiar layouts ni utilizar sus fotografías. No se afirma que el diseño sea único en el mercado peruano: no se realizó un estudio exhaustivo de competidores locales.

## Orden y propósito

| Orden | Sección | Ancho y propósito |
| --- | --- | --- |
| 1 | Hero | Campaña a todo el ancho: primera impresión y acceso al catálogo. Se conserva el carrusel. |
| 2 | Categorías | Márgenes comunes y asimetría aprobada: elegir un camino inmediatamente. |
| 3 | Más vendidos | Franja de fondo suave a todo el ancho; productos dentro del contenedor. Mostrar opciones de compra sin demorar el acceso. |
| 4 | ATELIER 01 | Fotografía a todo el ancho, escala de campaña. Profundizar en una firma después de ver producto. |
| 5 | Marcas | Directorio breve y blanco: pasar de una firma al descubrimiento multimarca. Cuatro nombres uniformes; se elimina la fotografía redundante. |
| 6 | Destacados | Composición a todo el ancho, fotografía a la izquierda y selección compacta a la derecha en desktop. Facilitar una exploración más pausada. |
| 7 | Entregas | Franja blanca compacta con márgenes: resolver dudas operativas. |
| 8 | Nosotros | Cierre tipográfico amplio sobre fondo suave: identidad y enlace institucional antes del footer. |

El gris cálido existente distingue superficies sin introducir nuevos colores. Los márgenes del texto siguen alineados con el contenedor de 1320 px, aunque la fotografía y los fondos lleguen a los bordes. Categorías y Más vendidos conservan sus imágenes, tarjetas, hover y contenido; cambian el contexto y la separación vertical.

## Responsive y espacios

Separación de categorías: 56 px en móvil y 80 px en desktop; misma respiración de salida para Más vendidos. Marcas se reduce a un directorio de 48/64 px de padding, con dos columnas móviles y cuatro desde tablet. La campaña editorial conecta directamente con la franja de producto; en móvil la fotografía precede al texto para que la transición sea visible. Destacados dispone titular, foto 4:3 y fichas en móvil/tablet, y pasa a dos mitades desde 1024 px. Entregas utiliza 32/40 px de padding. El cierre escala tipografía en vez de añadir copy.

## Validación y archivos

Typecheck, lint y build correctos sin warnings. Suite completa: 44 pruebas finalizadas correctamente con un worker; se conserva la lógica del hero, navegación, catálogo y favoritos. La corrección final de encuadre tablet/orden de imagen móvil se revisa además con capturas y pruebas de Home/ProductCard.

Capturas reproducibles: `node scripts/capture-home-audit.mjs rhythm`. Ocho anchos de 360 a 1440 px, sin overflow ni imágenes rotas ni errores/avisos de consola. CLS observado en las pruebas locales menor de 0.002. No equivale a métricas de campo.

- [Home 390 px](../artifacts/home-audit/rhythm/home-390.png)
- [Home 768 px](../artifacts/home-audit/rhythm/home-768.png)
- [Home 1440 px](../artifacts/home-audit/rhythm/home-1440.png)
- [Mediciones](../artifacts/home-audit/rhythm/measurements.json)

Archivos modificados: `src/features/home/HomePage.tsx`, `HomeSections.tsx`, `src/styles/home.css`, `scripts/capture-home-audit.mjs`, README y este documento. Se reemplazaron las reglas anteriores de marcas/editorial/destacados para evitar acumular overrides históricos. No hay nuevas dependencias ni imágenes. El catálogo con filtros laterales y la arquitectura quedan conservados.

Pendiente: valoración visual del cliente. Fotografías, firmas y productos siguen siendo ilustrativos; se conserva el aviso global de prototipo. No se avanzó a fase 4 ni backend.
