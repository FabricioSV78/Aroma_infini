# Home — hero, marcas y cierre

**Actualización de navegación · 21 de septiembre de 2026:** «Marca destacada» pasa al desplegable Marcas. El antiguo desplegable Aroma Infini se sustituye por un enlace directo a `/nosotros`; soporte y legales quedan en el footer. Las capturas nuevas se nombran `aroma-infini-{390,1280,1440}.png` dentro de `artifacts/navigation/final/`. Las menciones posteriores a tres grupos describen la versión anterior.

**Composición posterior vigente:** [HOME_COMPOSITION_REVIEW.md](HOME_COMPOSITION_REVIEW.md) documenta mayor escala de marcas, encabezado independiente de destacados, miniaturas editoriales de 120 px y cierre tipográfico. El resto de este archivo conserva los ajustes anteriores.

## Corrección posterior: rotación e igualdad de márgenes

El cursor sobre la fotografía detenía el hero porque el hover se escuchaba en toda la sección. Ahora solo se pausa al apuntar al enlace interactivo; la fotografía continúa rotando cada tres segundos. Se mantienen pausa por teclado, pestaña oculta, salida del viewport y movimiento reducido. Un contador visible `01 / 03` y tres líneas sincronizadas indican la campaña activa sin añadir botones de anterior/siguiente.

La marca destacada pasa al mismo contenedor que marcas, categorías, productos y confianza. Se ajustan altura y escala del titular para conservar proporción dentro de ese ancho. El hero mantiene el impacto de borde a borde; Nosotros/footer mantienen un fondo continuo con contenido alineado al contenedor. Esto limita los cambios de ancho a la apertura y el cierre, en vez de interrumpir el recorrido comercial.

Typecheck, lint, build y las 30 pruebas pasan. La regresión comprueba expresamente rotación con el cursor sobre la fotografía y actualización del indicador. Capturas de `artifacts/home-audit/refinement/` regeneradas en los ocho anchos: cero overflow, imágenes rotas o mensajes de error/advertencia. Revisadas las vistas completas a 390, 768 y 1440 px. Esta actualización prevalece sobre las descripciones anteriores de hover y franja visible.

Iteración terminada; pendiente de aprobación visual. Actualiza [HOME_PREMIUM_REVIEW.md](HOME_PREMIUM_REVIEW.md).

## Cambios

- **Hero:** tres campañas completas (imagen, titular, descripción y destino) con cambio cada tres segundos y fundido de 700 ms. Se elimina la franja visible de pausa, contador y flechas. La tercera campaña utiliza el frasco rosado de FORME, con fotografías independientes para móvil y escritorio.
- **Marcas:** se elimina el tratamiento tipográfico distinto por marca. Los cuatro nombres comparten tamaño, peso y espaciado; fotografía editorial junto a un directorio limpio con un enlace general. Móvil utiliza fotografía horizontal y dos columnas de marcas.
- **Marca destacada:** «Cuaderno de aromas» se sustituye por «En foco · ATELIER 01», con producto identificado y acceso a la marca. El destino del navbar pasa a «Marca destacada» y `/#marca-destacada`; no quedan enlaces a `/#cuaderno`.
- **Cierre:** «El perfume es personal» integra una presentación breve y el enlace a Nosotros. Fondo neutro continuo hasta el footer, marca más grande, enlaces más legibles y menos espacio inferior. Se acorta la separación desde destacados a confianza (56 → 40 px) y el padding inferior del aviso de prototipo (80 → 28 px).
- Categorías, Más vendidos, precios disponibles, favoritos locales y cambio entre fotografías de producto conservan su comportamiento. El navbar mantiene tres grupos y todas las utilidades.

## Qué estaba aprobado

Se releyó la aprobación inicial adjunta por el usuario: autoriza expresamente un «Bloque editorial de marca» dentro de la Fase 2 y aclara que las decisiones temporales pueden modificarse. Los pedidos posteriores favorecen su lenguaje fotográfico, pero no confirman «Cuaderno de aromas» como nombre definitivo ni como blog. Por ello se conserva la función aprobada de destacar una marca y se reemplaza ese nombre. La nueva redacción sigue siendo propuesta, no contenido comercial final.

Se retomaron [Jovoy](https://www.jovoyparis.com/en/), [Aedes](https://www.aedes.com/) y [Phlur](https://phlur.com/) para interpretar descubrimiento por marcas y continuidad del recorrido. No se copiaron fotografías ni diseños de las referencias.

## Comportamiento y límites del hero

La primera imagen mantiene prioridad alta. Las otras se preparan progresivamente después de la primera, con prioridad baja y decodificación antes de mostrarse. Si falla una campaña secundaria, la rotación continúa entre las disponibles.

Los controles no aparecen en la vista habitual. Existe un grupo auxiliar que se revela al recibir foco de teclado, con pausa/reanudación y selección de las tres campañas. Al interactuar por teclado la rotación se detiene. Se suspende también con hover, pestaña oculta o hero fuera del viewport. Con movimiento reducido queda estático y las campañas se pueden recorrer por teclado. No se presenta la eliminación de los controles habituales como una auditoría integral de accesibilidad.

## Assets

Dos originales generados con `image_gen` integrado en modo edición/composición, tomando el frasco conceptual existente como referencia. Prompts exactos, referencias y rutas originales: [hero-v3-assets.json](../scripts/hero-v3-assets.json).

Copias dentro del proyecto: `artifacts/home-refinement/sources/`. Seis variantes WebP locales: `public/images/hero-v3-petale-desktop-{960,1536,2048}.webp` y `hero-v3-petale-mobile-{480,780,1024}.webp`. Preparación: [prepare-hero-v3.mjs](../scripts/prepare-hero-v3.mjs). El original desktop mide 1672 × 941; la variante de 2048 es una ampliación, no detalle nativo adicional. El original móvil mide 1024 × 1536. Se conservan los originales.

La fotografía de marcas reutiliza el asset conceptual `hero-*` existente. No se incorporan marcas ni productos reales nuevos.

## Validación

- Typecheck, lint y build correctos, sin errores ni warnings.
- **30 pruebas aprobadas:** ocho anchos (360, 375, 390, 430, 768, 1024, 1280 y 1440), imágenes, overflow, consola, precios, favoritos, teclado, Escape, retorno de foco, anclas, rotación, movimiento reducido y fallo de la tercera fotografía.
- Cero imágenes rotas, overflow horizontal o errores/advertencias de consola en los recorridos probados. CLS local observado menor de 0.002.
- Las tres campañas se capturaron a los ocho anchos. El muestreo conservador de contraste de textos y controles sobre la fotografía pasó sus umbrales (4.5:1 normal, 3:1 grande). Se corrigió el script para ocultar también descendientes del texto antes de muestrear el fondo.
- Cierre revisado además a 1920 px, equivalente al ancho de la captura del usuario. Resultados de Chrome local; no métricas de campo ni prueba de dispositivos físicos.

Capturas de Home completa: [390 px](../artifacts/home-audit/refinement/home-390.png), [768 px](../artifacts/home-audit/refinement/home-768.png), [1440 px](../artifacts/home-audit/refinement/home-1440.png). [Medidas por sección](../artifacts/home-audit/refinement/measurements.json).

Detalles: [marcas móvil](../artifacts/home-audit/refinement/brands-390.png), [marcas escritorio](../artifacts/home-audit/refinement/brands-1440.png), [tercera campaña móvil](../artifacts/home-refinement/hero/390-slide-03.png), [tercera campaña escritorio](../artifacts/home-refinement/hero/1440-slide-03.png), [cierre 1920](../artifacts/home-refinement/closing-1920.png), [navbar móvil actualizado](../artifacts/navigation/final/aroma-infini-390.png).

Con Vite activo:

```powershell
node scripts/capture-home-audit.mjs refinement
node scripts/capture-hero-review.mjs --all
node scripts/capture-home-closing.mjs
node scripts/capture-navigation-review.mjs refinement
```

## Archivos y pendientes

Modificados: `Hero.tsx`, `useHeroRotation.ts`, `HomeSections.tsx`, `Footer.tsx`, `src/content/{home,navigation}.ts`, `src/styles/{entrance,home,footer}.css`, pruebas de hero/rotación/Home/navegación, scripts de captura y documentación. Nuevos: manifiesto y script de assets de la tercera campaña, seis WebP y script de captura del cierre.

Pendientes: aprobación visual y contenido comercial definitivo. Se conserva el aviso global de prototipo. No se avanza a catálogo completo, ficha, backend, autenticación, pagos ni administración.
