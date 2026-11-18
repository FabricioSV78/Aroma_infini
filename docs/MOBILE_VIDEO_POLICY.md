# Vídeo exclusivo de escritorio

12 de noviembre de 2026. Regla de selección de recursos para toda la web.

Actualización documental del 17 de noviembre: la biblioteca multimedia fue
retirada del panel. Se mantienen las subidas directas y vistas previas de cada
editor; los detalles de operación están en [R2_MEDIA_OPERATIONS.md](R2_MEDIA_OPERATIONS.md).
Los resultados de la entrega original se conservan como evidencia histórica.

## Comportamiento

- Desde **1024 px** se conserva la experiencia de vídeo de escritorio.
- Por debajo de 1024 px, incluidos móviles horizontales y tablets con ese
  ancho de viewport, se muestran imágenes: no se monta ningún `<video>` ni
  se asigna una fuente de vídeo. No se utiliza CSS para ocultar reproductores.
- Hero conserva textos, enlaces, botones, navegación, estilos y rotación.
  El vídeo editorial conserva su contenido y composición; en móvil no ofrece
  un botón de reproducción de un recurso que no está disponible.
- Al volver de escritorio a móvil, los reproductores se desmontan, se pausan
  y liberan su `src`. Una descarga iniciada previamente en escritorio no puede
  deshacerse, pero no se inicia otra descarga móvil.

Se utiliza el breakpoint de escritorio ya presente en catálogo y panel.
La selección de encuadre del Hero para una fotografía sigue siendo distinta
de la autorización de vídeo: un móvil horizontal puede tener una composición
ancha, pero eso no lo habilita para reproducir vídeos.

La regla está centralizada en `src/domain/media-playback.ts` y en
`src/components/media/useDesktopVideo.ts`, con `useSyncExternalStore` y
`matchMedia`, sin eventos de resize por píxel ni nuevas consultas de datos.
El snapshot de servidor deniega vídeo hasta que el navegador confirma el
viewport. Las condiciones se reevalúan al cruzar el breakpoint.

## Imágenes configurables y compatibilidad

En **Gestión del Home → Carrusel principal**, las campañas de vídeo permiten
subir una **Imagen alternativa para móvil**. Se utiliza el campo
`mobileImage` existente, con las mismas validaciones y preparación WebP de las
fotografías móviles del Hero (2:3, mínimo 780 × 1170 px).

La precedencia de una campaña de vídeo es:

1. Imagen alternativa móvil (`mobileImage`).
2. Portada móvil anteriormente configurada (`mobilePoster`).
3. Portada principal del vídeo (`poster`).

No es necesario registrar un vídeo móvil para asignar su imagen. Las campañas
publicadas siguen requiriendo vídeo principal y portada válida según las
validaciones existentes. El campo independiente también se conserva al
reemplazar el vídeo principal.

En **Gestión del Home → Video editorial**, la alternativa se guarda en
`film.mobilePoster`, un campo ya persistente. Admite subida de imagen
(4:5, mínimo 720 × 900 px) desde su editor. Sin alternativa,
se usa `film.poster`; sin contenido personalizado, se conserva la portada
incluida del material editorial. El escritorio conserva su vídeo y póster
principal, sin utilizar la antigua exportación móvil.

Las vistas previas móviles del Hero y del editorial tampoco montan vídeos,
aunque se abran desde una computadora. Los controles de la biblioteca y su
detalle de archivos fueron retirados; no forman parte del flujo actual.

La preparación local de un archivo de vídeo se permite solo en escritorio,
antes de cargar códecs o inicializar un decodificador. Desde móvil se pueden
gestionar las imágenes alternativas desde los editores disponibles.
Si se intenta preparar un MP4, se ofrece un mensaje para hacerlo desde una
computadora; se conserva el borrador.

Las referencias `mobileVideo` anteriores se mantienen compatibles con el
modelo, las RPC y los documentos existentes; no participan en la selección
de reproducción de la web. No se borraron archivos, referencias ni columnas,
ni se alteró el ciclo de limpieza de R2. Tampoco se añadieron migraciones.

## HTML inicial y precarga

`heroVisualSources` y `heroVisualQueries` son compartidos entre React y el
Worker. El HTML inicial anticipa la misma imagen que el navegador utilizará:
para campañas de vídeo, la alternativa móvil y el póster de escritorio tienen
condiciones complementarias alrededor de 1024 px. No se precarga el MP4.
Las campañas de fotografía conservan sus reglas anteriores de encuadre.

El generador de SEO utiliza `scripts/prerender-media.mjs` para guardar una
copia del documento con imágenes y textos, sin `<video>` ni precargas de
vídeo. Así una captura generada desde escritorio no puede inicializar un
reproductor móvil antes de que arranque React. El documento en ejecución no
se modifica al crear la copia; escritorio monta después su reproductor normal.

`preload="none"` por sí solo no constituye esta política: es una indicación
al navegador. Se evita crear el elemento y asignar el recurso, conforme a
las APIs documentadas de
[vídeo HTML](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video)
y [matchMedia](https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia).

## Alcance auditado

En la auditoría original se revisaron los cinco lugares que renderizaban vídeo: Hero, editorial,
vista previa del Hero, vista previa editorial y detalle de biblioteca. Los
demás banners, categorías, promociones, fichas, Contacto y secciones públicas
actuales admiten imágenes, no otros reproductores ni iframes de vídeo.
También se revisaron precargas, generación de HTML y preparación de archivos.

Para incorporar un componente de vídeo en el futuro debe aplicar la misma
política **antes de montar el reproductor**, reutilizar las selecciones de
imágenes y cubrir solicitudes de red con las pruebas correspondientes.
No se debe introducir un `<video src>` y ocultarlo por media queries.

## Validación

Pruebas de política en Chrome:

- 360 × 800, 390 × 844, 599 × 900, 600 × 390, 844 × 390,
  768 × 1024 y 1023 × 768: cero elementos de vídeo creados, cero solicitudes
  de vídeo, imagen correcta decodificada y controles de navegación conservados.
- 1024, 1366 y 1920 px: vídeo principal y controles de escritorio disponibles.
- Cambios móvil → escritorio → móvil: montaje único y liberación de fuentes.
- Sin imagen independiente: portada anterior y portada principal verificadas.
- Vista previa administrativa, biblioteca, intento de preparar MP4 en móvil
  y HTML inicial sin JavaScript: sin descarga automática de vídeo.

Suites finales de esta entrega:

| Suite | Resultado |
| --- | ---: |
| Política responsive y red | 15 aprobadas |
| Hero, editorial, formularios y edición | 59 aprobadas |
| Home con SDK y R2 aislados | 8 aprobadas |
| Biblioteca móvil | 1 aprobada |
| Preparación de vídeo en escritorio | 3 aprobadas |
| Worker, SEO y selección anticipada | 47 aprobadas |
| Catálogo y datos iniciales | 75 aprobadas |
| Contratos Node y arquitectura | 185 aprobadas |

TypeScript, lint, build de staging y empaquetado Wrangler aprobados. Las
suites anteriores usan transporte o almacenamiento aislado y no equivalen
a subir vídeos comerciales a servicios alojados. No se hicieron cambios de
contenido para probar campañas en el Home real.

## Despliegue y evidencias

Publicado solo en `aroma-infini-frontend-staging`:

- Antes: `b92559d3-0c07-40fc-b5ec-1c2c15ad1425`.
- Después: `a0476236-8dc3-4569-8056-588849bcdf67`.
- SHA-256 del manifiesto del paquete:
  `125b109a8796f223cc5282276d00eda1933dc542d80d3e4e20683d6d5d4ac020`.

Producción, datos de Supabase, bucket R2 y configuración de seguridad no
fueron modificados. No se añadieron dependencias ni se recompusieron imágenes.

Evidencias en `artifacts/mobile-video-policy-2026-11-12/` (ignorado por Git):
resultados `*-tests.json`, capturas en `screens/`, comprobación del paquete y
registro de despliegue `optimized-*.json`.

La comparación de red alojada utiliza visitas anónimas secuenciales a staging
en 390 × 844, 768 × 1024, 844 × 390 y 1366 × 768. En los perfiles móviles se
limita CPU ×4 y se emula una conexión lenta; no son teléfonos físicos.
Los archivos `before-hosted-network.json` y `after-hosted-network.json`
conservan los resultados. La prueba alojada cubre el contenido publicado,
incluido el vídeo editorial de origen; las campañas de vídeo personalizadas
y las imágenes de reemplazo se verificaron con transporte aislado.

Resultado de las ocho visitas alojadas (cuatro antes y cuatro después):

| Viewport | Solicitudes MP4 antes → después | Reproductores después |
| --- | ---: | ---: |
| 390 × 844 | 1 → 0 | 0 |
| 768 × 1024 | 1 → 0 | 0 |
| 844 × 390 | 1 → 0 | 0 |
| 1366 × 768 | 1 → 1 | 1 |

En los tres perfiles móviles la imagen alternativa se decodificó correctamente,
sin errores JavaScript ni desbordamiento horizontal. En escritorio se probó
también pausa manual y se mantuvo la solicitud del vídeo principal. Los
resultados cuentan solicitudes observadas, no suponen que el vídeo completo
se descargara en cada visita anterior ni equivalen a una medición de LCP.
