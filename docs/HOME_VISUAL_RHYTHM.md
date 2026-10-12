# Home: ritmo visual aprobado

Revisión del 11 de octubre de 2026. Se implementa la dirección aprobada por el cliente, conservando Lato, la paleta, las siete secciones existentes y sus funciones.

## Evaluación del resultado

La mejora más visible está en marcas y en la selección de dos perfiles. Las escenas editoriales aportan materiales, sombras naturales y profundidad; el dúo deja de repetir la distribución de fotografía izquierda y listado derecho. Más vendidos funciona como una pausa comercial legible entre el mosaico de categorías y el universo de marcas. El audiovisual mantiene el máximo impacto del recorrido.

El Home sigue siendo claro por decisión de marca. La mejora se apoya en diferencias de composición, escala y fotografía, sin nuevas superficies decorativas, sombras de interfaz ni una modificación general de colores y fuentes. La percepción estética puede evaluarse con el comparador: no se atribuye una puntuación objetiva a la sensación de profundidad.

| Sección                    | Antes                                                                                                                              | Después                                                                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero                       | Cinco campañas con alternancia de lado, fotos claras y una campaña cálida.                                                         | Se conserva la composición aprobada; sigue siendo la entrada de mayor escala tipográfica.                                                                                                                                                 |
| Categorías                 | Mosaico correcto, títulos separados por más espacio.                                                                               | Posiciones conservadas, títulos más próximos a la foto y respuesta verde coordinada con zoom y flecha existentes.                                                                                                                         |
| Más vendidos               | Encabezado de la misma escala que las secciones editoriales, precio y presentaciones pequeños, acción representada por una flecha. | Título más compacto, precios de mayor escala, perfil y tamaños legibles, acción explícita «Ver perfume», disponibilidad más visible. Fondo de fotos #F4F4F1.                                                                              |
| Firmas con carácter        | Foto blanca de catálogo y pie con superficie propia dentro de un gran fondo cálido.                                                | Escenas editoriales relacionadas con el frasco; pie directamente sobre el fondo cálido. Cambio de fotografía con ratón y teclado conservado.                                                                                              |
| Audiovisual                | Fotografía humana, contraste y video a todo el ancho.                                                                              | Conservado. Se comprueba reproducción manual y movimiento reducido.                                                                                                                                                                       |
| Dos perfumes, dos perfiles | Foto a la izquierda, título y dos fichas con miniaturas a la derecha.                                                              | Cabecera horizontal, foto central y cada perfil a su lado correspondiente. En tablet las fichas quedan bajo la foto; en móvil se ordenan verticalmente. Se muestran las familias reales, precio, tamaños y favoritos.                     |
| Servicios y footer         | Acciones a diferentes alturas y una columna de identidad mucho más alta que las de navegación.                                     | Acciones alineadas, descripciones más legibles y cierre más compacto. Los cambios del footer se limitan al Home. Los perfiles sin URL no se muestran como botones; se habilitan al incorporar las URLs reales en `src/content/social.ts`. |

## Capturas reales

[Comparador interactivo](../artifacts/home-rhythm/comparison.html): cuatro pantallas y cinco vistas por pantalla (Home completo, más vendidos, marcas, dúo y footer). Los archivos «before» se capturaron antes de editar esta revisión; los «after» representan el resultado final. Los datos son los mismos de la sesión inicial del catálogo, con Lato y movimiento reducido para reproducir un estado estable.

| Pantalla            | Antes                                                    | Después                                                 |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Desktop 1920 × 1080 | [Captura](../artifacts/home-rhythm/before/home-1920.png) | [Captura](../artifacts/home-rhythm/after/home-1920.png) |
| Laptop 1366 × 768   | [Captura](../artifacts/home-rhythm/before/home-1366.png) | [Captura](../artifacts/home-rhythm/after/home-1366.png) |
| Tablet 768 × 1024   | [Captura](../artifacts/home-rhythm/before/home-768.png)  | [Captura](../artifacts/home-rhythm/after/home-768.png)  |
| Móvil 390 × 844     | [Captura](../artifacts/home-rhythm/before/home-390.png)  | [Captura](../artifacts/home-rhythm/after/home-390.png)  |

Las capturas aisladas finales ocultan temporalmente los controles fijos para evitar que tapen el contenido fotografiado. Esta regla solo pertenece a la captura, no al diseño. Las capturas completas mantienen el navbar real. Los artefactos se generan localmente y no se versionan.

## Validación

- Typecheck, lint y build correctos. El build conserva el aviso previo de tamaño de ExcelJS, correspondiente al importador del panel.
- 25 pruebas existentes de Home, galería, composición del hero y controles de video superadas; cubren además 360, 375, 430, 1024, 1280 y 1440 px.
- Tres pruebas adicionales existentes superadas: edición visual del Home y persistencia, orden de destacados desde el panel y favoritos compartidos entre vistas.
- Sin imágenes rotas ni desbordamiento horizontal en las cuatro capturas; un H1 activo.
- Cambio de foto de producto comprobado: primaria 0 / alternativa 1 en hover; primaria 1 / alternativa 0 al salir. Los cuatro fondos calculados permanecen en rgb(244, 244, 241).
- Las cuatro fotografías de marcas cargan al enfocarlas y el enlace «Ver perfume» del dúo lleva a la ficha correcta.
- Las 20 combinaciones de pantalla/vista del comparador cargan sus dos imágenes correctamente. Evidencia en `artifacts/home-rhythm/interaction-checks.json`.
- La información comercial continúa derivando del mismo producto y sus variantes. Las fotos editoriales se relacionan por la clave de imagen del catálogo; un producto nuevo o una foto reemplazada conserva su galería como alternativa y no hereda una escena de otro frasco.

## Fotografía editorial nueva

Las escenas de Atelier 01, Forme y Studio sillage utilizan recursos existentes que corresponden a los respectivos frascos. Para Ambre Lent se creó una escena con la herramienta integrada `image_gen`, partiendo de su fotografía `public/images/ambre-960.webp`. Se revisó la forma del frasco, la tapa negra horizontal y la etiqueta vacía antes de integrarla. No se utiliza una fotografía de otro perfume para representar esta firma.

Archivos finales, optimizados en WebP:

- [brand-ambre-editorial-480.webp](../public/images/brand-ambre-editorial-480.webp)
- [brand-ambre-editorial-960.webp](../public/images/brand-ambre-editorial-960.webp)

Prompt utilizado:

> Use case: precise-object-edit. Project asset: Aroma Infini brand editorial photograph, portrait 4:5. Preserve the EXACT single fictional perfume bottle in the input: broad clear rectangular glass, amber liquid, wide flat BLACK rectangular cap on short black neck, blank pale square label, exact geometry and proportions. Keep bottle fully in frame, cap attached. Change only photographic environment and lighting: bottle stands on pale warm limestone, refined tactile sand/cream plaster background with one naturally darker shadow to the upper left, grazing soft afternoon light reveals glass and amber; sophisticated perfume campaign, quiet warm neutral colors, real depth, crisp realistic detail. Bottle occupies roughly 65 percent of photo height, balanced generous margins. No other bottles, no wood props, no botanical props, no text, logos, border, frame, gradients or graphic decoration. Do not turn the cap gold or cylindrical. Editorial photo should feel integrated with a soft sand #F3F0E9 website surface.

## Reproducción

Con el servidor Vite activo:

```powershell
node scripts/capture-home-presence.mjs after artifacts/home-rhythm
```

Para una revisión futura, generar `before` en otra carpeta antes de editar; no sobrescribir esta evidencia con el estado posterior.
