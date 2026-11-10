# Carrusel multimedia del Home

4 de noviembre de 2026. Ampliación del Hero y del editor existentes; no cambia
la composición aprobada ni los demás apartados del Home.

## Arquitectura y decisiones

El sistema anterior tenía cinco campañas fijas, imágenes y destinos definidos
en código. Se conserva su orden visual, fotografías predeterminadas, estilos,
transiciones, flechas, indicadores, teclado y gesto táctil.

El mismo documento versionado del Home admite ahora **entre una y diez
campañas**, con identificador estable, posición, estado, imagen/vídeo,
portadas, textos, botón y destino. El orden no altera la fotografía original
asociada a una campaña anterior. Si todas están ocultas, no se muestra el Hero.

No hay una segunda fuente de contenido. Supabase guarda configuración y UUID
de medios; R2 guarda los archivos. La migración
`20261104000200_hero_campaigns.sql` convierte el formato antiguo sin sustituir
fotografías ni modificar productos. El adaptador nuevo acepta también ese
formato anterior, lo que permite desplegar frontend antes de migrar SQL.

## Uso desde el administrador

En **Contenido del Home → Carrusel**:

1. Elegir una campaña o pulsar **Nueva campaña**. Las nuevas empiezan ocultas.
2. Seleccionar **Imagen** o **Video** y subir el archivo. Un vídeo genera su
   portada; se puede reemplazar. La exportación móvil y su portada son opcionales.
3. Configurar título, descripción y botón. **Mostrar textos** y **Mostrar botón**
   permiten campañas sin texto o sin enlace.
4. Elegir destino: producto por nombre/SKU, categoría, tienda o página interna.
5. Usar **Subir/Bajar** para ordenar, revisar la **Vista previa** y guardar.

El selector Publicada/Oculta se aplica al guardar el Home. La vista previa y
los archivos preparados permanecen en el formulario hasta ese guardado; abrir
la vista previa no sube ni publica nada. Una campaña oculta incompleta puede
guardarse para continuar después. Una campaña publicada requiere su imagen
o vídeo con portada. Los errores conservan el borrador y archivos para reintentar.

Las campañas ocultas y sus manifiestos exclusivos no aparecen en la respuesta
pública. El administrador sí los recibe para editar. Sus asociaciones en
`app.home_media` se conservan, por lo que la limpieza no elimina esos archivos.
Ocultar una campaña no revoca inmediatamente una URL comercial que ya se haya
distribuido o cacheado. El borrador local aún no guardado se pierde al abandonar
deliberadamente el formulario tras aceptar la advertencia de cambios pendientes.

## Destinos seguros

Los productos se guardan por **ID**, y su slug vigente se resuelve con el catálogo
público. El editor permite buscar por nombre o SKU de presentación. Si el
producto deja de estar disponible, se elimina o no tiene ficha pública, aparece
una advertencia y se omite el botón en la tienda. Cambiar su slug no obliga a
editar cada campaña. No se modifica el estado comercial de un producto desde
este editor.

Categorías: Para él, Para ella, Unisex y Complementos. Si Complementos está
deshabilitado, su botón se omite. Páginas internas permitidas: Marcas, Nosotros,
Contacto, Envíos y entregas y Seguir pedido. No se admite escribir URLs externas,
rutas administrativas ni esquemas como `javascript:`. Los botones públicos son
enlaces HTML reales mediante el router existente.

## Vídeo y rendimiento

- Se reutiliza la carga autorizada existente: MP4 H.264, **2–60 segundos**,
  **máximo 10 MiB**, de 480 a 4096 px por lado. No se usa el procesamiento WebP
  para el vídeo. El backend inspecciona formato, pistas, dimensiones y muestras;
  la validación de imágenes sí decodifica todos sus píxeles.
- Se muestra primero una portada WebP responsive. Solo el vídeo de la campaña
  activa recibe `src`, después de preparar su portada; no se descargan todos
  los clips. Los vídeos se reproducen silenciados, inline y sin controles invasivos.
- Las imágenes conservan **3,8 segundos**. El vídeo avanza al terminar, con un
  límite de **15 segundos**. Navegar o enfocar manualmente conserva la pausa
  de autorrotación del diseño anterior; el vídeo activo puede controlarse con
  su botón discreto y también se detiene al llegar al límite.
- Se pausa fuera de pantalla o con pestaña oculta. Movimiento reducido y ahorro
  de datos muestran portadas sin descargar automáticamente los MP4.
- No se realizan transformaciones de vídeo de pago. Una versión móvil debe ser
  otra exportación real del mismo material; si no se sube, se usa el principal.
  Las imágenes mantienen `srcset`, dimensiones y prioridad de la primera portada.

La altura y estructura del Hero permanecen reservadas para evitar saltos. El
contraste adicional se limita a medios personalizados con textos/botón;
las campañas originales conservan su tratamiento visual.

### Preparación de archivos

Preferir campañas breves de 6–15 segundos, sin sonido necesario para comprender
el mensaje. Recomendación de escritorio: 1920×1080; móvil: 720×1080 (2:3), con
el producto y texto dentro de una zona segura. El texto comercial se escribe
en el editor, no exclusivamente dentro del vídeo. Evitar ampliar fuentes pequeñas.

Un editor de vídeo debe exportar H.264, píxel `yuv420p`, MP4 con **fast start**
(índice `moov` al principio), sin pista de audio si el clip es decorativo.
Como preparación opcional de escritorio, con FFmpeg instalado por el responsable:

```text
ffmpeg -i original.mp4 -t 15 -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2" -c:v libx264 -crf 23 -preset medium -pix_fmt yuv420p -an -movflags +faststart campana-web.mp4
```

Comprobar el tamaño final y reducir resolución/bitrate si excede 10 MiB.
Preparar la composición móvil desde el mismo montaje, revisando el encuadre;
no se genera automáticamente un recorte definitivo. No se instaló FFmpeg ni se
modificó el material del cliente en esta entrega.

## Almacenamiento, caché y permisos

Se reutilizan `film-video` y `film-poster` y los perfiles de imágenes del Hero.
La subida exige sesión real, membresía administrativa, MFA AAL2 y origen válido.
Los secretos permanecen en el servidor. PostgreSQL no recibe base64, blobs
ni URLs temporales: las pruebas comprueban los UUID del comando de guardado.

Las seis posiciones de medios de cada campaña se registran en `app.home_media`,
incluso las ocultas. Reemplazar/eliminar retira asociaciones en la misma transacción,
coordinada con los bloqueos del recolector existente. Se mantienen los siete días
de recuperación de activos sin referencias y 24 horas de reservas pendientes.

La entrega usa rutas inmutables por UUID/hash y caché pública de un año, con
ETag. Los MP4 admiten GET, HEAD, Range, If-Range y respuesta 206; sustituciones
obtienen otras URLs. El documento público mantiene la caché breve invalidada
tras publicación y el control de versión existente. Conflictos entre editores
devuelven 409 y no sobrescriben el trabajo confirmado.

## Configuración y límites de la entrega

No hacen falta nuevos buckets, claves, servicios o planes para este cambio.
Se mantienen los bindings de R2 y secretos Supabase del Worker de cada entorno.
La migración debe aplicarse con la CLI enlazada al proyecto correcto, tras
dry-run, y la interfaz debe construirse para ese mismo entorno. No copiar
configuración de desarrollo sobre producción.

El archivo móvil opcional, las fotografías y los vídeos comerciales deben ser
proporcionados por el cliente. Las pruebas usan recursos identificados como
fixtures y restauran cualquier contenido temporal empleado en desarrollo.
No se crea una campaña comercial Hawas Ice ni se inventa su fotografía/producto.

El informe final de pruebas, despliegue y capturas se conserva en
`artifacts/hero-campaigns-2026-11-04/`. Las pruebas de navegador con transporte
aislado se distinguen de la verificación con Supabase/R2 alojados. Las mediciones
locales no equivalen a métricas Core Web Vitals de usuarios en producción.

Referencias oficiales: [vídeo HTML](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video),
[carga selectiva de vídeo](https://web.dev/articles/lazy-loading-video),
[API R2 y rangos](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

## Resultado verificado

| Comprobación | Resultado |
| --- | --- |
| PostgreSQL local | 24 migraciones y 596 comprobaciones aprobadas; incluye privacidad, destinos, MFA, 409 y protección de campañas ocultas frente a GC |
| Hero y navegación anterior | 30 pruebas aprobadas en una ejecución limpia |
| Editor administrativo | 12 pruebas aprobadas; imágenes, vídeos, destinos, borrador, orden y errores |
| SDK/adaptadores remotos con HTTP aislado | 8 pruebas aprobadas, incluidas campañas de vídeo y ocultas, UUIDs, recarga y conservación ante errores |
| Worker/medios/contratos | 109 casos únicos aprobados; dos pruebas del runtime R2 se ejecutaron fuera del sandbox por restricciones del compilador local |
| API pública alojada | 53 comprobaciones aprobadas, sin escrituras autorizadas |
| Calidad | `typecheck`, `lint`, build staging y build producción aprobados |
| Supabase/R2 reales, solo desarrollo | 13 comprobaciones aprobadas; diez activos y 19 objetos, TOTP/AAL2, publicación, conflicto, reproducción y rangos |

La prueba alojada utilizó cinco tamaños (1920×1080, 1440×900, 1366×768,
768×1024 y 390×844), sin imágenes rotas, desbordamientos ni errores del navegador.
Restauró el Home con guardas de versión/huella, confirmó que los productos no
cambiaron y retiró solo las dos cuentas y los 19 objetos de su propia prueba.

Capturas: 15 del editor en `admin-screenshots/`, cinco del Hero en
`playback-screenshots/` y diez alojadas en
`run-2455c7a4-538f-4081-9928-be3e4f4933d1/screenshots/`, bajo la carpeta de
artefactos indicada. Son pruebas técnicas, no campañas comerciales definitivas.

Staging actualizado: `81a260fe-8fef-4caf-afdc-0053a101502b`.
Producción cerrada actualizada con autorización específica posterior del propietario:
`c433074d-74b0-43de-91c4-1de1f5d99233`. La migración 24 está aplicada en ambos
proyectos con sus workspaces separados. El dry-run final de producción confirma
que no hay migraciones pendientes.

La lectura de configuración alojada confirmó `workers.dev` y previews desactivados,
cero dominios/rutas públicas, indexación y compras simuladas deshabilitadas,
Supabase/R2 propios de producción. Evidencia: `production-closed.json` en la
carpeta de artefactos. Esta entrega no habilita la apertura comercial.

Durante prelanzamiento es intencional que el Worker de producción carezca de
dominio/ruta pública y mantenga `noindex`. Las rutas de la aplicación siguen
implementadas y pueden probarse en staging. Al configurar el dominio definitivo,
el acceso comercial se habilitará por ese dominio y se revisará la indexación de
las páginas públicas; cuenta, carrito y administración seguirán excluidos.
`noindex` controla buscadores y no sustituye autenticación.
[Documentación de Google](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

Comandos reproducibles:

```powershell
npx.cmd playwright test --config=playwright.hero-campaigns.config.ts
npx.cmd playwright test --config=playwright.admin-hero.config.ts
npm.cmd run test:home:supabase
npm.cmd run test:media:worker
npm.cmd run test:supabase:sql
npm.cmd run test:supabase:public
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build:staging
npm.cmd run build
```
