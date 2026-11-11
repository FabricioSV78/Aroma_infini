# Biblioteca multimedia — implementación y operación

11 de noviembre de 2026. Inventario completo en [MEDIA_ASSET_INVENTORY.md](MEDIA_ASSET_INVENTORY.md).

## Alcance y estado

La implementación añade **Biblioteca multimedia** al panel y mantiene las
composiciones públicas existentes. R2 guarda los archivos; Supabase conserva
metadatos, manifiestos verificados, versiones, ubicaciones y actividad.

Se auditaron **162 archivos comerciales activos: 159 WebP, 2 MP4 y 1 SVG**,
incluidos todos los tamaños que el código selecciona mediante `srcset`. Los
iconos de controles, QR operacionales, fuentes y recursos técnicos de la PWA
siguen versionados con la aplicación; no son archivos comerciales editables.
No se eliminaron los recursos históricos ni los originales del repositorio.

**Estado de esta entrega:** código y pruebas locales. Estas pruebas no aplican
migraciones ni publican cambios en servicios alojados. La importación solo se
ejecuta mediante una acción explícita del administrador en el entorno elegido;
el inventario no acredita que esos 162 archivos ya estén subidos a R2.

## Uso del panel

- **Archivos:** buscar por nombre o ALT, filtrar por sección/estado, paginar,
  abrir la vista previa, editar metadatos, consultar usos y actividad.
- **Ubicaciones de la tienda:** cambiar las imágenes de Nosotros, acceso de
  clientes, logotipo e imágenes para compartir. Es posible elegir un archivo
  existente, subir otro o recuperar el recurso original.
- **Home y Productos:** conservan sus editores. El botón **Biblioteca** permite
  reutilizar archivos compatibles sin volver a subirlos. Se mantienen galería,
  imagen olfativa, categorías, recomendador, campañas y portadas de vídeo.
- **Centralizar recursos actuales:** importa los originales sin cambiar bytes,
  dimensiones, recortes ni los descriptores de sus candidatos adaptativos.
  Muestra progreso, se puede pausar y continúa desde las asociaciones ya
  confirmadas. La salida del apartado cancela el trabajo restante.

La importación utiliza una lista cerrada y revisada, no descarga URLs
arbitrarias. Está limitada a cargas secuenciales separadas al menos 1,8 s.
La copia compilada y el inventario público se verifican mediante una prueba de
igualdad. Las asociaciones importadas también protegen los recursos que aún
forman parte del contenido original recuperable.

El ALT de biblioteca se ofrece al reutilizar el archivo. No reemplaza
silenciosamente el ALT específico de ubicaciones existentes. Las imágenes
decorativas conservan ALT vacío.

Las ubicaciones muestran su resolución mínima. El selector y el comando SQL
rechazan imágenes rasterizadas demasiado pequeñas; no se amplían para ocultar
el problema. Los SVG de identidad son independientes de la resolución. La tabla
de requisitos del frontend y sus nueve límites SQL se comprueban mediante pruebas.

## Imágenes, vectores y vídeo

Las imágenes nuevas se preparan en WebP. Se validan formato real, dimensiones,
animación, tamaño, proporción de destino y límites de descompresión. Los
derivados proceden de píxeles existentes; no se amplían fuentes pequeñas.
El perfil general conserva la proporción visible, incluida la orientación EXIF.
El Worker vuelve a comprobar los píxeles WebP y las huellas de todos los archivos.

El logotipo admite SVG estático de hasta 512 KiB, además de imagen rasterizada.
Se rechazan scripts, eventos, estilos, enlaces externos, entidades XML y elementos
activos. Se sirve como archivo, con `nosniff` y CSP restrictiva; nunca se inserta
su marcado en HTML. Este perfil vectorial no se ofrece a productos ni al Home.

La preparación de vídeo carga **Mediabunny 1.65.2 únicamente al subir un vídeo**.
La biblioteca es gratuita, MPL-2.0, y no utiliza un servicio de transcodificación
de pago. La licencia y el enlace al código correspondiente se distribuyen en
`public/licenses/`. R2 almacena; no transcodifica.

La conversión produce MP4 H.264 con inicio rápido, conserva tiempos y pistas
de audio y comprueba los archivos resultantes. Solo conserva una exportación
como optimización si reduce el peso o es necesaria para aceptar el original.
Puede generar una versión más ligera del mismo clip para móvil y portadas WebP,
sin inventar variantes, recortar el vídeo ni ampliar sus dimensiones.

Los originales de vídeo tienen un límite local de 20 MiB; cada archivo enviado
mantiene el límite de 10 MiB y duración de 2–60 s. Los códecs disponibles dependen
del navegador y del dispositivo: si no se puede convertir conservando las
pistas, únicamente puede conservarse el original si ya supera la validación
MP4 H.264 existente. El panel lo comunica; no anuncia una compresión inexistente.
Las versiones y portadas de biblioteca quedan identificadas y deben asignarse
a sus ubicaciones, como cualquier archivo sin usar.

## Referencias y limpieza

1. Quitar o reemplazar un recurso retira su asociación, sin borrar sus bytes.
2. Se comprueban galería, imagen olfativa, Home —incluido contenido oculto—,
   ubicaciones del sitio, importaciones y fotografías de pedidos anteriores.
3. Al desaparecer la última referencia, el plazo de seguridad es **24 horas**.
   Los archivos nuevos sin asignación también están sujetos a este plazo.
4. Una asociación válida durante ese plazo cancela la retirada automáticamente.
5. El cron del Worker solicita como máximo diez reclamaciones por ejecución,
   cada cinco minutos. SQL vuelve a comprobar referencias bajo bloqueo.
6. Antes de listar y antes de cada borrado físico, el Worker vuelve a verificar
   su reclamación. Solo puede borrar el prefijo UUID reclamado.
7. Los fallos parciales se registran con códigos acotados y no detienen los
   demás archivos. La reclamación permite reanudar la limpieza.

Una reclamación ya iniciada es terminal: no se permite reasignar un archivo
mientras otro Worker pueda estar borrándolo. La cancelación automática se
aplica antes de esa reclamación, durante las 24 horas de seguridad. No hay
un borrado de emergencia desde el navegador.

**Pendientes de limpieza** permite consultar recursos y fecha prevista. La
actividad registra programación, cancelación, reclamación, comprobación,
fallo y eliminación. Las filas eliminadas son historial, no archivos R2.
Un archivo que sigue usado no puede programarse para eliminación.

Las imágenes comerciales tienen caché pública inmutable. Sustituirlas crea
otra URL. Eliminar un archivo de R2 no revoca las copias ya cacheadas: esta
biblioteca no sirve para documentos privados. La recuperación posterior al
borrado requiere una copia de SQL y de los objetos R2 correspondientes.

## Activación por entorno

1. Revisar y aplicar las migraciones pendientes en el entorno autorizado:
   `20261111000200_media_library.sql`, `20261111000300_media_builtin_sources.sql`
   y `20261111000400_media_static_vectors.sql`, después de sus dependencias.
2. Publicar mediante el flujo GitHub existente el Worker y su frontend del
   mismo entorno. Mantener separados Supabase, bucket, secretos y orígenes.
3. Comprobar con una cuenta administrativa verificada: subir, reutilizar,
   reemplazar, consultar referencias y revisar la proyección pública.
4. Ejecutar **Centralizar recursos actuales** una vez. Si se interrumpe,
   volver a pulsarlo: no se repiten las asociaciones ya confirmadas.
5. Comprobar desde una sesión independiente que las imágenes y vídeos salen
   de las rutas verificadas del Worker y revisar el cron y los respaldos.

La migración concede a los recursos antiguos sin referencias un nuevo plazo
de 24 horas; no provoca su eliminación inmediata. No se han ejecutado estas
acciones en producción como parte de las pruebas locales.

## Verificación

Los resultados consolidados y métricas de esta entrega se encuentran en
`artifacts/media-library-2026-11-11/`. Las capturas del panel están en
`artifacts/media-library-review/`. Son pruebas de navegador con transporte
aislado, PostgreSQL local real y Worker local; no equivalen a una certificación
de Supabase Auth, R2 alojado o teléfonos físicos de todos los fabricantes.

Comandos reproducibles principales:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:media:worker
npm.cmd run test:media:browser
npx.cmd playwright test --config playwright.video-preparation.config.ts
npm.cmd run test:supabase:sql
npm.cmd run test:node
```

Los casos de codificación nativa comprueban capacidades reales del navegador.
Si faltan, se omiten explícitamente esos dos casos; no se presentan como aprobados.
El caso que conserva el MP4 original verificado se ejecuta siempre. Para exigir
los códecs y fallar si no están disponibles, usar `AROMA_REQUIRE_VIDEO_CODECS=true`.
La validación local de Windows ejecutó los tres casos, sin omisiones.

Resultados finales de las suites relacionadas:

| Comprobación | Resultado local |
| --- | --- |
| PostgreSQL 17, esquema completo | 35 migraciones; 884 comprobaciones aprobadas |
| Carreras de biblioteca | Asociación/limpieza, reclamación terminal, reintento, versiones y sustituciones simultáneas aprobadas |
| Worker y contratos de medios | 139 pruebas aprobadas |
| Biblioteca, fotos y navegador | 29 pruebas aprobadas |
| Codificación real en Windows | 3 pruebas aprobadas, sin omisiones |
| Regresión de autenticación | 77 pruebas aprobadas |
| Catálogo y Home remotos con SDK aislado | 43 y 8 pruebas aprobadas |
| SEO del Worker | 32 pruebas aprobadas |
| Node, incluidos respaldos y parser estático | 168 pruebas aprobadas |
| Visual | 20 capturas en cinco anchos; comparación de Nosotros móvil idéntica píxel por píxel |

La validación nativa usó un archivo real generado en Chrome, no un codificador
simulado: una ejecución conservó sus 73 cuadros y audio AAC al pasar de
7.445.968 bytes a 4.121.295 bytes; la versión móvil pesó 3.296.731 bytes.
Son medidas de ese archivo de prueba, no una garantía de ahorro para todo vídeo.

Se conservaron los registros de las primeras ejecuciones: dos esperas de Auth
coincidieron con recompilaciones de Vite y pasaron en la repetición completa
estable sin cambiar código ni tiempos de autenticación. Dos pruebas antiguas
del Home requirieron esperar explícitamente la nueva codificación, conservando
sus comprobaciones reales de UUID, guardado y reproducción.

La auditoría de dependencias de producción no detectó avisos altos o críticos.
Permanecen dos avisos moderados preexistentes de `uuid` a través de ExcelJS;
no se aplicó el downgrade incompatible que propone `npm audit fix --force`.

Los builds y empaquetados en seco de esta auditoría emplean configuración pública
aislada y una clave publicable ficticia. No prueban las credenciales del servidor
ni generan un artefacto para promover directamente: el flujo de despliegue debe
reconstruir con la configuración real del entorno autorizado.
