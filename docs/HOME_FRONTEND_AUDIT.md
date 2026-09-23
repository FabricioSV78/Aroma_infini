# Home — revisión profesional y controlada

**Revisión posterior vigente:** [HOME_PREMIUM_REVIEW.md](HOME_PREMIUM_REVIEW.md). Por petición posterior del cliente, el hero ahora cambia automáticamente; se renuevan marcas, Cuaderno de aromas y destacados, y el navbar se simplifica a tres grupos. El resto de este documento conserva el registro de la revisión anterior.

13 de septiembre de 2026. Implementación terminada y validada; pendiente de aprobación visual del cliente.

## Alcance y base

Se revisaron la estructura del repositorio, configuración, rutas, componentes, datos de muestra, estilos, scripts de imágenes, pruebas y documentación antes de modificar el frontend. Se aplicaron las skills `frontend-design`, `frontend-react-best-practices`, `typescript-react-patterns` y `frontend-accessibility-best-practices` instaladas en `.agents/skills/`.

Base: [REFERENCE_AUDIT](REFERENCE_AUDIT.md), [FRONTEND_DESIGN_PLAN](FRONTEND_DESIGN_PLAN.md), [HOME_EDITORIAL_REVIEW](HOME_EDITORIAL_REVIEW.md), [PHASE_2_VISUAL_REVIEW](PHASE_2_VISUAL_REVIEW.md) y [NAVIGATION_REVIEW](NAVIGATION_REVIEW.md). Se conservan los criterios ya auditados: claridad multimarca de Jovoy, curaduría de Aedes, jerarquía del producto de D.S. & Durga, fotografía y escala de Vilhelm, utilidad comercial de Twisted Lily y continuidad de Phlur. Ningún layout se replica literalmente.

La instrucción «No añadas autoplay al hero» prevalece sobre la mención contradictoria a carrusel automático. El hero sigue siendo manual, con sus dos campañas y su fundido original. No se implementaron nuevas pantallas comerciales ni servicios externos.

## Problemas encontrados y ajustes

| Sección            | Hallazgo                                                                                                      | Resultado                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero               | Las dos imágenes se solicitaban al inicio, aunque la segunda tuviera prioridad baja. Aviso temporal repetido. | Primera imagen prioritaria; preparación diferida de la segunda, con espera a su decodificación antes de activar el slide. Se elimina el aviso repetido. |
| Marcas             | Cuatro nombres ocupaban 520 px de alto en móvil; numeración y textos auxiliares añadían densidad.             | Nombres protagonistas, reglas inferiores sutiles, sin numeración ni etiquetas de muestra. Se conserva el titular y el acceso a marcas.                  |
| Categorías         | Etiqueta editorial redundante, excesiva altura en escritorio y composición dependiente del índice.            | Fotografía dominante, descripciones breves existentes y variantes `portrait`, `landscape`, `panorama`. Asimetría preservada y proporciones ajustadas.   |
| Más vendidos       | Aviso extenso, familia olfativa redundante y separación excesiva en metadatos.                                | Fotografía, marca, nombre, precio y tamaño. Una indicación específica «Selección ilustrativa» evita presentar ventas de muestra como reales.            |
| Cuaderno de aromas | Tres indicaciones editoriales/temporales y texto mayor al necesario.                                          | Imagen responsive, identidad, titular, una frase corta y enlace. Sigue siendo la pausa visual a todo el ancho.                                          |
| Destacados         | Introducción y aviso de muestra competían con los productos.                                                  | Titular y enlace junto a dos productos con presentación editorial y desfase explícito por datos.                                                        |
| Confianza          | Texto de apoyo y altura superiores a lo necesario.                                                            | Envíos a Perú, envío gratis desde S/ 450, plazos existentes y atención pendiente, fáciles de escanear.                                                  |
| Reseñas            | Bloque grande sin contenido real y enlace directo desde el menú.                                              | Se retiran temporalmente el bloque y su ancla del navbar. No se crean testimonios.                                                                      |
| Nosotros           | Etiqueta repetida y cierre demasiado alto.                                                                    | Titular y enlace, con espaciado más contenido.                                                                                                          |
| Footer             | Avisos acumulados y columna de ayuda que dejaba vacío lateral en móvil.                                       | Una advertencia global discreta y enlaces de ayuda distribuidos en dos columnas móviles.                                                                |

Se preservan la fotografía existente, tipografía, paleta, gutters y lenguaje visual. No se añaden imágenes, promociones, badges decorativos ni nuevas dependencias.

## Ritmo y medidas

La secuencia final es hero → marcas/categorías → más vendidos → editorial → destacados → confianza → Nosotros/footer.

Cambios concretos de espaciado:

- Marcas: padding superior 56 → 32 px en móvil; 88 → 48 px en escritorio amplio. Filas más compactas y sin numeración.
- Títulos de sección: distancia al contenido 32 → 24 px en móvil y 40 → 28 px desde tablet.
- Categorías: padding superior 56 → 40 px móvil y 80 → 56 px escritorio amplio; imagen vertical 730 → 660 px en escritorio amplio.
- Más vendidos: padding superior 80 → 56 px móvil y 104 → 72 px desde tablet. Metadatos 20 → 14 px; separación del precio 14 → 8 px.
- Editorial: margen previo 80 → 64 px móvil y 104 → 80 px desde tablet. Imagen de escritorio mantiene 560 px de presencia; el texto reducido acorta especialmente móvil.
- Destacados: padding superior 64 → 56 px móvil y 104 → 72 px desde tablet; desfase 40 → 32 px móvil y 72 → 48 px desde tablet.
- Confianza: padding 32 → 24 px móvil y 40 → 28 px desde tablet. Nosotros: 40 px móvil / 48 px tablet y escritorio.

Altura total medida con idénticos viewports antes/después, fuentes cargadas e imágenes preparadas. Altura del viewport: 844 px en móviles y 900 px desde 768 px.

| Ancho |   Antes | Después | Reducción |
| ----- | ------: | ------: | --------: |
| 360   | 6801 px | 5677 px |   1124 px |
| 375   | 6863 px | 5679 px |   1184 px |
| 390   | 6872 px | 5704 px |   1168 px |
| 430   | 7038 px | 5872 px |   1166 px |
| 768   | 5392 px | 4531 px |    861 px |
| 1024  | 5497 px | 4583 px |    914 px |
| 1280  | 6018 px | 5000 px |   1018 px |
| 1440  | 6076 px | 5058 px |   1018 px |

La reducción ronda el 16–17 %, sin cambiar las dimensiones del hero. Datos por sección: [antes](../artifacts/home-audit/before/measurements.json) y [después](../artifacts/home-audit/after/measurements.json).

## ProductCard

`getProductPresentation()` calcula el menor precio entre variantes con `stock > 0`. Si ninguna tiene stock, devuelve el precio mínimo como referencia y la tarjeta indica «Agotado». Sin variantes, devuelve `null` y se muestra «Sin precio disponible»; nunca se evalúa `Math.min` con una lista vacía. «Desde» solo aparece cuando hay precios diferentes entre variantes disponibles. Los tamaños mostrados corresponden a esas variantes; los agotados conservan sus tamaños de referencia.

El corazón es un `button` de 44 × 44 px con `aria-pressed`, nombre accesible estable y estado visual relleno. `HomePage` mantiene un conjunto local de identificadores, compartido entre Más vendidos y Destacados; alternar el mismo producto en una sección actualiza la otra. No navega, no persiste tras salir de Home y no conecta todavía con la página `/favoritos`.

API pequeña: `variant="standard" | "editorial"`, `isFavorite` y `onToggleFavorite`. La presentación estándar conserva imágenes iguales 4:5 y el fundido de 450 ms entre las dos fotografías actuales, con hover de mouse y foco de teclado. Se respeta movimiento reducido. La presentación editorial conserva el tratamiento fotográfico propio de destacados. El zoom archivado no se reactiva en Más vendidos.

Las variantes visuales de marcas, categorías y posición de destacados están declaradas en `src/content/home.ts`; dejan de depender de `nth-child`, `last-child` o clases numéricas.

## Navegación y búsqueda

Se mantienen los cuatro grupos actuales: Perfumes, Marcas, Descubrir y Ayuda, más el acceso directo a Más vendidos. Conservarlos permite cumplir el pedido anterior de acceso a los apartados públicos sin otra reorganización general. La simplificación se aplica al contenido de los paneles: se retiran descripciones y pie repetitivo, se reduce el titular y la imagen de apoyo, y se reserva espacio para el cierre.

Se elimina únicamente el enlace a reseñas, cuyo destino deja de existir. Búsqueda, favoritos, cuenta y carrito permanecen accesibles. En móvil, favoritos y cuenta siguen dentro del menú. Se preservan Escape, retorno de foco, cierre al navegar y comportamiento de cambio de breakpoint.

El buscador dice «Perfume o marca» y utiliza un nombre de producto como ejemplo. Sigue mostrando una vista informativa de la consulta; no implementa búsqueda real.

## Carga del hero

La primera fotografía conserva `fetchPriority="high"`, `srcSet`, `sizes` y dimensiones explícitas. Tras `load` y `decode()`, dos callbacks de `requestAnimationFrame` dan oportunidad de pintar la imagen prioritaria antes de montar la fotografía secundaria con prioridad baja.

Una petición explícita del usuario también puede iniciar la preparación. El slide visible permanece activo hasta que la imagen solicitada se decodifica. Una referencia al destino solicitado evita que una descarga tardía revierta una pulsación rápida de ida y vuelta. Los callbacks se cancelan al desmontar. Un fallo de la segunda fotografía vuelve a la primera y permite reintentar, con aviso accesible y sin loader visual.

Las pruebas retienen deliberadamente las respuestas de imágenes para comprobar la secuencia de carga, ausencia de activación prematura y estabilidad de altura; no dependen de que la conexión local sea rápida.

## Archivos

| Responsabilidad        | Archivos nuevos o modificados                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home y productos       | `src/features/home/HomePage.tsx`, `HomeSections.tsx`, `Hero.tsx`, `ProductCard.tsx`, nuevo `product-presentation.ts`                                                                                                                                  |
| Contenido y navegación | `src/content/home.ts`, `src/content/navigation.ts`, `src/components/layout/Header.tsx`, `Footer.tsx`                                                                                                                                                  |
| Estilos                | `src/styles/global.css` queda como entrada; nuevos `base.css`, `home.css`, `product-card.css`, `footer.css`, `dialog.css`. Se ajustan `navigation.css`, `tokens.css` y únicamente se traslada el token de altura desde `entrance.css` a `tokens.css`. |
| Validación             | `tests/home.spec.ts`, `hero.spec.ts`, `navigation.spec.ts`, nuevo `product-card.spec.ts`; nuevo `scripts/capture-home-audit.mjs`                                                                                                                      |
| Documentación          | Este informe, `README.md` y notas de continuidad en `FRONTEND_DESIGN_PLAN.md`, `HOME_EDITORIAL_REVIEW.md`, `NAVIGATION_REVIEW.md`                                                                                                                     |

`global.css` deja de contener las aproximadamente mil líneas de todos los componentes. `base.css` concentra reset, utilidades compartidas, foco, movimiento reducido y la vista informativa existente. Tokens globales y ajustes de tokens por breakpoint permanecen en `tokens.css`. Se conserva el orden de importación y no se cambia la arquitectura, el contrato de datos, las rutas ni el stack.

## Validación final y capturas

| Comprobación                | Resultado                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm.cmd run typecheck`     | Correcto, sin errores                                                                                                    |
| `npm.cmd run lint`          | Correcto, cero warnings                                                                                                  |
| `npm.cmd run build`         | Correcto, sin warnings                                                                                                   |
| `npm.cmd run test:e2e`      | 25 pruebas correctas                                                                                                     |
| Ocho anchos solicitados     | Cero overflow horizontal, imágenes rotas o errores/warnings de consola                                                   |
| CLS observado               | Entre 0,0005 y 0,0084 en Chrome local; todos por debajo de 0,1                                                           |
| Accesibilidad e interacción | Teclado, Escape, retorno de foco, navegación modal, tamaños táctiles y movimiento reducido verificados                   |
| Hero y producto             | Imágenes responsive con dimensiones, altura estable entre campañas, fundido sin zoom en Más vendidos y anclas existentes |

Se retiró `NO_COLOR` únicamente del proceso de validación para evitar su conflicto con `FORCE_COLOR`, como ya documentaba el repositorio. No se silenciaron advertencias del código.

Capturas nuevas de Home completa, revisadas visualmente:

- [390 px](../artifacts/home-audit/after/home-390.png)
- [768 px](../artifacts/home-audit/after/home-768.png)
- [1440 px](../artifacts/home-audit/after/home-1440.png)

También se generaron y revisaron 360, 375, 430, 1024 y 1280 px. Las capturas de cada sección se encuentran junto a las completas. Se verificaron nuevamente los menús [móvil](../artifacts/navigation/descubrir-390.png) y [escritorio](../artifacts/navigation/perfumes-1440.png).

Para repetir la captura con Vite activo: `node scripts/capture-home-audit.mjs after`. Los resultados son de Chrome local, no métricas de campo ni una certificación de otros navegadores.

## Pendiente deliberadamente

Aprobación visual de esta iteración, contenido y marcas definitivos, reseñas reales, canal de atención y futura conexión de favoritos. Catálogo completo, ficha de producto, búsqueda real, autenticación, backend, Supabase, carrito, pagos y administración permanecen fuera del alcance. Esta entrega no autoriza ni inicia la siguiente fase.
