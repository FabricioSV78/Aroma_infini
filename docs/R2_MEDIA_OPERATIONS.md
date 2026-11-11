# Fotografías administradas: uso y límites

La ampliación de biblioteca, reutilización entre apartados, gestión de logotipo
y limpieza a las 24 horas se describe en [MEDIA_LIBRARY.md](MEDIA_LIBRARY.md).
Requiere activar sus migraciones y el Worker del mismo entorno; no basta con
actualizar únicamente el frontend.

## Flujo desde Productos

El formulario y la cola de fotografías conservan sus controles actuales. Un
perfume tiene cuatro fotografías comerciales y una imagen independiente de
familia olfativa. Los complementos utilizan las cuatro comerciales.

1. Seleccionar una o varias fotografías. Se pueden elegir las cinco juntas
   para un perfume; el administrador revisa y corrige sus ubicaciones.
2. Revisar las fotografías preparadas. Reemplazar, quitar, intercambiar y
   reordenar actúan sobre el borrador, sin publicar cambios por sí mismos.
3. Pulsar **Guardar producto**, **Guardar fotos** o **Guardar y continuar**.
   En el catálogo remoto, ese guardado prepara las variantes WebP, solicita
   la subida autenticada al Worker y espera sus referencias verificadas.
4. El comando de producto guarda las asociaciones en Supabase con la versión
   que se abrió para editar. La portada sigue siendo la primera imagen de
   la galería. La imagen olfativa no se convierte en una quinta fotografía
   comercial.
5. Solo tras la confirmación de guardado se anuncia éxito o se continúa al
   siguiente producto de la cola.

«Quitar» elimina una asociación del borrador. No ordena un borrado inmediato
del archivo permanente. La retirada física y su período de recuperación
pertenecen al proceso controlado del servidor, que comprueba las referencias.
No existe sincronización desde Git que pueda podar las fotografías dinámicas.

La completitud de las cinco fotografías facilita la cola de trabajo; no añade
un requisito nuevo de publicación. Se conservan las condiciones de portada,
marca, presentación, precio, stock y visibilidad existentes.

## Preparación, calidad y entrega

La preparación local acepta fotografías JPG, PNG, WebP y AVIF de hasta 20 MiB.
Inspecciona cabeceras antes de decodificar, limita la entrada a 40 megapíxeles
y 12000 px por lado y vuelve a comprobar las dimensiones del bitmap. Esa
inspección mejora la experiencia y el uso de memoria; no sustituye la
validación completa del Worker.

Los archivos comerciales se normalizan a WebP estático, proporción 4:5 y
calidad 0,9. La galería requiere un área útil mínima de 800 × 1000 px y la
imagen olfativa de 960 × 1200 px. Se conserva hasta un original preparado de
1600 × 2000 px; no se amplían fuentes pequeñas. El recorte central existente
no incorpora una pantalla adicional de encuadre.

Por fotografía se generan únicamente anchos disponibles: 480, 960 y el ancho
real del original preparado, sin repeticiones ni ampliaciones. Por ejemplo,
una fuente preparada de 800 px produce 480 y 800; no inventa una variante de
960 px. Cada archivo preparado admite hasta 4 MiB y el conjunto hasta 12 MiB.

El manifiesto confirmado contiene UUID, hash del original y rutas inmutables.
Las candidatas de `srcset` proceden de ese manifiesto. Las vistas previas y
la imagen olfativa conservan el original como alternativa cuando no usan
`srcset`; las tarjetas y la galería mantienen sus `sizes`, carga diferida y
prioridades existentes. No se usa una transformación externa de pago.

`VITE_MEDIA_API_BASE_URL` es un origen público opcional para acceder al Worker
desde Vite. En desarrollo admite HTTP únicamente para loopback. En producción
se utiliza HTTPS o el mismo origen de la aplicación. Nunca contiene claves.
Este origen no activa la migración global de las imágenes estáticas mediante
`VITE_MEDIA_BASE_URL`; ambos espacios permanecen separados.

## Errores y reintentos

El servicio no modifica el registro que está editando el administrador hasta
confirmar todas las fotografías nuevas. Un fallo parcial conserva el borrador
y no muestra éxito de producto. Los archivos ya subidos pueden existir sin
asociación mientras se reintenta o hasta su revisión y limpieza controlada.
No se afirma que R2 y PostgreSQL participen en una única transacción.

La identidad de reintento combina propietario, propósito y SHA-256 de la
fotografía preparada. Las operaciones tienen UUID estables y el navegador
conserva únicamente metadatos de reintento en memoria durante diez minutos;
no almacena tokens ni bytes adicionales en esa caché. Un segundo usuario no
reutiliza la operación de otro. El servidor vuelve a autorizar las operaciones
y conserva la responsabilidad de la idempotencia real.

La solicitud fija el JWT autorizado y comprueba propietario, permiso
administrativo y contexto de sesión antes y después de los pasos asíncronos.
Cerrar sesión o cambiar de cuenta cancela una subida pendiente. Un conflicto
de versión del producto conserva el borrador; las fotografías no justifican
sobrescribir una edición ajena. La caché de reintento tampoco autoriza una
subida ni una asociación por sí misma.

La respuesta se valida antes de incorporarla: rutas administradas, UUID,
hash del original enviado, tamaños, proporciones y conjunto de variantes.
Una URL arbitraria, una firma temporal o una ruta derivada inexistente no se
acepta como prueba de almacenamiento.

## Gestión del Home conectada en desarrollo

Desde Gestión del Home puedes seleccionar imágenes de cada apartado, editar sus textos y guardar. La vista previa conserva el borrador: no publica archivos ni contenido. El guardado confirma los archivos en R2 y el documento versionado en Supabase. Un error o conflicto conserva los cambios para revisarlos.

Hero y recomendador conservan versiones 16:9 para escritorio y 2:3 para móvil; categorías 4:5 y opciones 1:1. El vídeo permite un archivo principal y una exportación móvil opcional del mismo material, cada uno con su póster. R2 no transcodifica.

Los archivos predeterminados permanecen en el proyecto. No se importan automáticamente personalizaciones antiguas del navegador. Los detalles, límites y pruebas se encuentran en [Home remoto](R2_HOME_IMPLEMENTATION.md).

## Pruebas de esta capa

`tests/media-upload-domain.spec.ts` verifica manifiestos, rutas, dimensiones,
srcset, separación de orígenes, ausencia de ampliaciones y registros de diez
y cincuenta grupos de cinco fotografías. Son pruebas de contratos y
resolución; no acreditan por sí mismas una subida real a R2 ni persistencia
alojada. Las pruebas del Worker y el flujo administrativo completo se
documentan por separado en la entrega de integración.
