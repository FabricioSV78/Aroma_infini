# Home — revisión premium

**Nota histórica:** la navegación de tres grupos descrita aquí fue reemplazada el 21 de septiembre de 2026 por Perfumes, Marcas y un enlace directo Aroma Infini → Nosotros. La decisión vigente está en [NAVIGATION_REVIEW.md](NAVIGATION_REVIEW.md).

**Actualización posterior:** [HOME_REFINEMENT_REVIEW.md](HOME_REFINEMENT_REVIEW.md) recoge tres campañas cada tres segundos, controles habituales retirados, marcas uniformes, sustitución de Cuaderno de aromas y nuevo cierre. Este documento conserva el registro anterior.

13 de septiembre de 2026. Implementada y validada; pendiente de aprobación visual.

## Dirección y alcance

La petición más reciente prioriza marcas, Cuaderno de aromas, destacados y una navegación menos abrumadora. Autoriza expresamente que el hero cambie solo y suavemente; sustituye la restricción manual de los documentos anteriores. Categorías y Más vendidos mantienen su composición aprobada.

Se retoma la base de [referencias](REFERENCE_AUDIT.md), [plan](FRONTEND_DESIGN_PLAN.md), revisiones visuales y [auditoría previa](HOME_FRONTEND_AUDIT.md). Se aplicaron las cuatro skills frontend solicitadas e `imagegen`, manteniendo React, TypeScript, Vite, los tokens y la estructura modular existentes.

La propuesta interpreta la curaduría de [Aedes](https://www.aedes.com/), la jerarquía de producto de [D.S. & Durga](https://www.dsanddurga.com/), la escala fotográfica de [Vilhelm](https://vilhelmparfumerie.com/) y la continuidad de [Phlur](https://phlur.com/), cuyas portadas se volvieron a consultar. Se mantienen los criterios comerciales de Jovoy y Twisted Lily recogidos en la auditoría. No se copian sus layouts ni fotografías.

## Problemas y cambios

| Apartado | Ajuste e intención |
| --- | --- |
| Transición del hero | Se retira la franja intermedia de texto y enlace que repetía el descubrimiento de marcas. La fotografía desemboca directamente en la selección. |
| Marcas | «Casas con carácter», cuatro nombres con tratamiento tipográfico propio y un único enlace general. Una fila en escritorio, dos columnas en móvil y tablet. Líneas que delimitan el conjunto, sin tarjetas individuales. |
| Cuaderno de aromas | Fotografía nueva a todo el ancho, titular de mayor escala y una frase. En escritorio el texto ocupa el espacio luminoso de la propia imagen; en móvil se dispone sobre la fotografía, con recorte específico. Sin degradado añadido. |
| Destacados | Fotografía conjunta protagonista y dos fichas editoriales compactas. Móvil recorre titular → fotografía → productos → enlace. Se diferencia del grid de Más vendidos. |
| Navbar | Tres grupos: Perfumes, Marcas y Aroma Infini. Se eliminan imágenes de los paneles, el acceso superior repetido a Más vendidos y anclas redundantes. |

Se conservan las dos campañas y el encuadre del hero; categorías, tamaños iguales y cambio de fotografía de Más vendidos; confianza, Nosotros y footer compactos. Reseñas continúa oculto. Se mantiene la advertencia global de propuesta y «Selección ilustrativa» para no presentar ventas ficticias como reales.

## Espaciado y composición

Marcas ocupa 361 px a 390 px y 286 px a 1440 px, incluido su espaciado. Su contenido empieza directamente después del hero. Padding de marcas: 40/16 px arriba/abajo en móvil y 48/24 px desde tablet.

Cuaderno conserva una separación previa de 64 px móvil y 80 px desde tablet. Su imagen alcanza entre 480 y 720 px en escritorio; el titular escala hasta 96 px. Destacados comienza a 64/80 px y utiliza separaciones laterales de 36, 56 y 72 px según el ancho. Las fichas editoriales se organizan en filas con miniaturas de 76/92 px.

| Ancho | Altura anterior | Altura actual |
| --- | ---: | ---: |
| 360 | 5677 px | 5877 px |
| 375 | 5679 px | 5890 px |
| 390 | 5704 px | 5925 px |
| 430 | 5872 px | 6119 px |
| 768 | 4531 px | 4584 px |
| 1024 | 4583 px | 4515 px |
| 1280 | 5000 px | 4938 px |
| 1440 | 5058 px | 5054 px |

La extensión adicional en móvil corresponde principalmente a la fotografía de destacados. En 1440 px la altura total se mantiene prácticamente igual, con mayor presencia fotográfica. Medición con viewport de 844 px de alto en móvil y 900 px desde tablet: [datos actuales por sección](../artifacts/home-audit/premium/measurements.json).

## Hero automático y accesibilidad

Rotación cada siete segundos y crossfade de 700 ms. Solo empieza después de preparar la segunda fotografía. La primera conserva prioridad alta; la segunda se solicita después de la decodificación y oportunidad de pintado de la primera, con prioridad baja. Nunca se activa una imagen pendiente de preparación.

La rotación se suspende al pasar el mouse, salir del área visible o esconder la pestaña. Al recibir foco o utilizar las flechas manuales se detiene hasta pulsar «Reanudar cambio automático». El primer control de teclado permite pausar/reanudar. El estado accesible usa `aria-live="off"` durante reproducción y `polite` en interacción manual. Con movimiento reducido se desactiva la rotación y se conserva navegación manual. Criterio: [patrón de carrusel de WAI](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/).

Se mantienen Escape, retorno de foco, foco visible, navegación por teclado y controles táctiles existentes. El navbar conserva transparencia sobre el hero y fondo blanco al desplazarse o abrir un grupo.

## ProductCard y navegación

La variante estándar no cambia. Continúan el precio mínimo disponible, «Agotado» con precio de referencia, protección de arrays vacíos y corazones como botones con `aria-pressed`. El estado local sigue sincronizando productos repetidos en Home. La variante explícita `editorial` adopta filas compactas solo en destacados; no se crean más variantes.

Perfumes reúne catálogo, género y selecciones; Marcas reúne las cuatro casas y su directorio; Aroma Infini reúne contenido editorial, Nosotros, contacto, ayuda e información legal. Todos los destinos del footer siguen accesibles. Se mantienen búsqueda, favoritos, cuenta y carrito; en móvil favoritos y cuenta están al pie del menú. No se implementan búsqueda, compras ni nuevas pantallas.

## Fotografías y procedencia

Dos composiciones creadas con `image_gen` integrado, modo edición/composición con referencias de los frascos conceptuales existentes. No se incorporan productos reales nuevos. Los prompts completos, referencias y rutas originales están en [scripts/home-premium-assets.json](../scripts/home-premium-assets.json).

- Cuaderno: `public/images/editorial-essential-v3-{480,960,1536}.webp` y recortes móviles `editorial-essential-v3-mobile-{480,780}.webp`.
- Destacados: `public/images/featured-duo-v3-{480,960,1536}.webp`. El último archivo conserva 1448 px de ancho nativo; su descriptor `srcSet` es `1448w`.
- Copias de originales: `artifacts/home-premium/sources/`. Optimización y recortes reproducibles mediante [prepare-home-premium-images.mjs](../scripts/prepare-home-premium-images.mjs), sin modificar los originales.

Las imágenes son locales, WebP, con dimensiones explícitas, `srcSet`, `sizes` y carga diferida fuera del hero.

## Validación y capturas

`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` y `npm.cmd run test:e2e`: correctos, sin errores ni warnings. **29 pruebas aprobadas**. Se retiró `NO_COLOR` del proceso de pruebas para evitar el conflicto de colores documentado; no se ocultaron advertencias del código.

Se comprobó la Home completa en 360, 375, 390, 430, 768, 1024, 1280 y 1440 px: cero overflow horizontal, imágenes rotas y errores/advertencias de consola. CLS local observado entre 0.0005 y 0.0017. Las pruebas cubren precios, favoritos, alineación y fundido de productos, carga diferida del hero, altura entre slides, autoplay, pausa, teclado, Escape, retorno de foco, movimiento reducido y destinos de navegación. Son resultados de Chrome local, no métricas de campo ni certificación de otros navegadores.

Capturas completas revisadas visualmente: [390 px](../artifacts/home-audit/premium/home-390.png), [768 px](../artifacts/home-audit/premium/home-768.png), [1440 px](../artifacts/home-audit/premium/home-1440.png). También se revisaron los otros cinco anchos y capturas individuales de secciones.

Navbar: [cerrado 1440](../artifacts/navigation/premium/closed-1440.png), [Perfumes](../artifacts/navigation/premium/perfumes-1440.png), [Marcas](../artifacts/navigation/premium/marcas-1440.png), [Aroma Infini](../artifacts/navigation/premium/aroma-1440.png), [móvil](../artifacts/navigation/premium/aroma-390.png). Se capturó también a 1280 px.

Con Vite activo:

```powershell
node scripts/capture-home-audit.mjs premium
node scripts/capture-navigation-review.mjs premium
```

## Archivos de esta iteración

- Componentes: `src/features/home/{Hero,HomeSections,ProductCard}.tsx`, nuevo `useHeroRotation.ts`, `src/components/layout/Header.tsx`, `src/components/ui/Icon.tsx`.
- Datos: `src/content/{home,navigation}.ts`.
- Estilos: `src/styles/{entrance,home,navigation,product-card,tokens}.css`.
- Pruebas: `tests/{hero,hero-rotation,navigation}.spec.ts`.
- Assets y herramientas: ocho WebP nuevos, manifiesto y script de preparación; scripts de captura de Home y navegación.
- Documentación: este informe, `README.md`, `ASSETS.md`, `FRONTEND_DESIGN_PLAN.md`, `HOME_FRONTEND_AUDIT.md` y `NAVIGATION_REVIEW.md`.

## Pendiente

Aprobación visual de esta propuesta y posterior sustitución de contenido conceptual por material comercial confirmado. Catálogo completo, ficha de producto, backend, Supabase, autenticación, carrito real, pagos y administración siguen fuera del alcance. Esta entrega no inicia la siguiente fase.
