# Fase 2 — revisión visual del header y hero

13 de septiembre de 2026. Propuesta temporal, pendiente de aprobación visual. Alcance autorizado: header/navbar, hero/carrusel y transición hacia el resto de Home.

## Resultado y dirección

La entrada se convierte en una fotografía continua a todo el ancho, con navegación y contenido editorial sobre la propia escena. La tipografía oscura, el espacio negativo de las fotos y los controles discretos sostienen una identidad blanca y contemporánea. El producto conserva el protagonismo; el resto de Home mantiene sus contenedores comerciales.

Se retomó `REFERENCE_AUDIT.md`: inmersión fotográfica de Vilhelm, integración entre campaña y navegación de Aedes, escala tipográfica de D.S. & Durga y claridad multimarca de Jovoy. No se copiaron assets, identidad ni composición exacta de ninguna referencia.

## Cambios implementados

- **Header:** una sola fila en escritorio desde 1200 px, wordmark tipográfico de mayor presencia, seis enlaces y cuatro accesos. En móvil/tablet: menú, marca centrada, búsqueda y carrito; favoritos/cuenta permanecen en el menú. Announcement de 26 px, discreto y fuera del área fija.
- **Superposición:** sobre la Home comienza transparente y pasa a blanco al superar el anuncio durante el scroll. Conserva su altura —72 px en móvil/tablet y 88 px en escritorio— para evitar saltos. La transición dura 220 ms; no utiliza blur ni glassmorphism. Los destinos informativos mantienen header blanco.
- **Hero:** ancho completo, sin el límite de 1440 px del hero anterior. A 1440 × 900 ocupa 828 px de alto, aproximadamente 92vh. A 390 × 844 ocupa 818 px más el anuncio de 26 px; la fotografía, el texto, el CTA y los controles caben en la primera pantalla. En pantallas más cortas permite una pequeña extensión de altura para conservar legibilidad.
- **Fotografía:** dos campañas conceptuales, cada una con composición horizontal y vertical independiente. `<picture>` utiliza la toma vertical hasta 1023 px y la horizontal desde 1024 px. Copias WebP y `srcset`; aproximadamente 99 KB entre las dos imágenes móviles de 780 px. Los archivos antiguos se conservan para las secciones existentes.
- **Carrusel:** dos slides, fundido de opacidad de 450 ms, numeración y flechas. Es manual, sin autoplay. Admite botones con Enter/Espacio y flechas izquierda/derecha dentro del carrusel. El foco permanece en el control; el slide inactivo queda fuera del recorrido de teclado y de la lectura accesible. Solo existe un h1 activo.
- **Contraste:** tinta #202020 sobre áreas luminosas. El velo claro móvil sigue el comienzo del texto para funcionar también con poca altura; en escritorio se concentra en el pie de controles. Es un tratamiento de lectura sobre la imagen, sin cajas detrás de cada enlace. `prefers-reduced-motion` elimina prácticamente el fundido y las transiciones del header.
- **Continuación:** franja blanca breve con “Encuentra tu punto de partida” y enlace hacia marcas. El ancla recibe foco y respeta el espacio del header fijo.

El copy, las campañas y el wordmark siguen siendo temporales. La indicación aparece en el hero y se conserva la advertencia de contenido de muestra en el footer. No se añadieron promociones reales.

## Capturas para revisar

| Estado | Desktop 1440 × 900 | Mobile 390 × 844 |
| --- | --- | --- |
| Slide 01 | [Abrir captura](../artifacts/hero-v2/1440-slide-01.png) | [Abrir captura](../artifacts/hero-v2/390-slide-01.png) |
| Slide 02 | [Abrir captura](../artifacts/hero-v2/1440-slide-02.png) | [Abrir captura](../artifacts/hero-v2/390-slide-02.png) |
| Header blanco y transición a marcas | [Abrir captura](../artifacts/hero-v2/1440-transition.png) | [Abrir captura](../artifacts/hero-v2/390-transition.png) |

Las capturas adicionales de 360, 375, 430, 768, 1024 y 1280 px están en el mismo directorio local. Para regenerar las principales, con Vite activo:

```powershell
node scripts/capture-hero-review.mjs
```

Añadir `--all` revisa los ocho anchos. El script comprueba contraste del texto y de los accesos sobre el fondo fotográfico renderizado, además de generar las capturas. Las capturas son artefactos locales de revisión, no forman parte del bundle de la tienda.

## Validación

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Correcto |
| `npm.cmd run lint` | Correcto, cero errores y warnings |
| `npm.cmd run build` | Correcto, sin warnings de compilación |
| `npm.cmd run test:e2e` | 15 pruebas correctas |
| Responsive | Los ocho anchos requeridos, ambos slides y transición revisados sin overflow horizontal |
| Teclado | Menú, búsqueda, skip link, anclas, retorno del foco y controles del carrusel comprobados |
| Header | Transparente al inicio; blanco durante scroll; altura constante; accesos móviles sin solaparse a 360 px |
| Imágenes y estabilidad | Todas cargan con dimensiones reservadas; altura del hero estable entre slides; CLS observado menor de 0,009 en los recorridos locales |
| Movimiento reducido | Fundido prácticamente inmediato; navegación manual operativa |
| Consola | Sin errores ni warnings de aplicación en los recorridos |

En las capturas de 1440 px, el contraste mínimo conservador fue de **5,91:1** para el slide 01 y **9,85:1** para el 02. En 390 px fue de **6,48:1** y **8,68:1**, respectivamente. La medición toma el píxel más oscuro del fondo bajo las áreas de texto, ocultando los glifos y conservando el tratamiento fotográfico. Los ocho anchos superaron los umbrales evaluados. Es evidencia sobre estos assets y encuadres actuales; hay que repetirla cuando se incorporen las fotos finales.

## Archivos y alcance

- `src/components/layout/Header.tsx`: composición compacta y observación del cambio a fondo blanco.
- `src/components/layout/StoreLayout.tsx`: variante visual de portada para superponer el header.
- `src/features/home/Hero.tsx`: slides, controles, accesibilidad y franja de continuación.
- `src/content/home.ts`: imágenes y descriptores temporales de las dos campañas.
- `src/styles/entrance.css`: estilos del header y hero, separados de las secciones comerciales.
- `src/styles/tokens.css`: alturas, espaciado y tiempos de transición de esta entrada.
- `src/styles/global.css`: retirada de los estilos anteriores del header/hero e importación de la nueva composición.
- `src/features/home/HomePage.tsx`: retirada del rótulo independiente que separaba header y foto; la indicación temporal está integrada en el hero.
- `src/features/home/HomeSections.tsx`: únicamente el identificador y foco del ancla de marcas.
- `tests/hero.spec.ts`: cuatro pruebas específicas nuevas; se conservaron las once existentes.
- `scripts/capture-hero-review.mjs`: capturas y medición de contraste.
- `scripts/prepare-hero-v2.mjs` y `public/images/hero-v2-*`: preparación y copias de las fotos nuevas.

Los prompts exactos, modo de generación integrado y rutas de los cuatro originales/copias se encuentran en [HERO_V2_ASSETS.md](HERO_V2_ASSETS.md).

Las categorías, más vendidos, editorial de marca, destacados, confianza, reseñas, Nosotros y footer mantienen su composición. No se modificaron tipos, mocks ni HomeService. No se añadieron dependencias, pantallas ni funciones comerciales.

## Puntos de evaluación visual

1. La fuerza de la primera pantalla y el equilibrio entre tamaño del titular y frasco.
2. La integración del header transparente y su densidad en una sola fila.
3. La composición móvil y el tratamiento suave detrás del texto.
4. El ritmo del fundido manual y la visibilidad de sus controles.
5. La continuidad hacia marcas y el regreso a contenedores blancos controlados.

**Punto de parada:** revisión visual de la Fase 2 terminada. A la espera de aprobación; no se avanza a otras pantallas.
