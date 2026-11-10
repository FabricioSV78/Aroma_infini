# Home remoto — Supabase y R2

**Ampliación vigente, 4 de noviembre:** el [carrusel multimedia](HERO_CAMPAIGNS.md)
reutiliza esta arquitectura para campañas dinámicas, vídeos y portadas del Hero,
destinos configurables y publicación/ocultación. Este informe conserva el alcance
y los resultados históricos de la integración inicial.

29 de octubre de 2026. Continuación del punto 5 de [R2_INTEGRATION_PLAN.md](R2_INTEGRATION_PLAN.md). Sólo entorno de desarrollo; no habilita producción ni pagos reales.

## Qué queda conectado

El editor existente de Gestión del Home conserva su distribución y su botón de guardar. Ahora publica en Supabase los textos del Hero, franja, vídeo y recomendador, sus preguntas, opciones y resultados, y las referencias de imágenes de categorías, Hero, recomendador y vídeo. Complementos y marca destacada se confirman en la misma transacción que el Home.

Las imágenes se guardan en `aroma-infini-media-dev` mediante el Worker `aroma-infini-frontend-staging`. La base contiene UUID de activos verificados, nunca base64, blobs o URLs temporales. La respuesta pública reemplaza esos UUID por rutas inmutables y manifiestos de variantes existentes.

No se importan automáticamente los cambios de Home que existían en IndexedDB. Se conserva ese contenido local para su revisión. Si no existe un documento remoto, aparecen los recursos y textos predeterminados del proyecto; un error de red muestra un error y no se sustituye por una copia local.

## Guardado y protección de cambios

- Seleccionar archivos y abrir la vista previa sólo modifica el borrador del formulario.
- Al guardar se preparan y suben los archivos nuevos con operaciones idempotentes. Los recursos ya confirmados reutilizan sus referencias.
- Supabase comprueba la sesión administrativa, MFA AAL2, la versión del Home y la versión de ajustes de catálogo. Un conflicto devuelve 409 sin sobrescribir la otra sesión.
- Sólo después de la confirmación canónica se limpia el estado pendiente y se actualiza la caché pública. Un fallo conserva los campos y archivos preparados para reintentar.
- `app.home_document` almacena contenido versionado; `app.home_media` registra todas las asociaciones, incluidas categorías ocultas. Las mismas filas de medios coordinan asociaciones y limpieza.
- Quitar un recurso retira su asociación al guardar. Mientras otro producto o parte del Home lo utilice, la limpieza no puede reclamarlo. Permanecen los plazos existentes: pendientes 24 horas y activos sin referencias siete días.

## Imágenes y vídeo

| Apartado | Proporción | Preparación verificada |
| --- | --- | --- |
| Categorías | 4:5 | Desde 800 × 1000, máximo 1600 px de ancho |
| Hero y recomendador, escritorio | 16:9 | Desde 1536 × 864, máximo 2304 px de ancho |
| Hero y recomendador, móvil | 2:3 | Desde 780 × 1170, máximo 1560 px de ancho |
| Opciones del recomendador | 1:1 | Desde 480 × 480, máximo 960 px |
| Póster del vídeo | Proporción del clip | WebP generado del archivo seleccionado |

Se generan hasta tres variantes reales, sin ampliar fuentes pequeñas. El frontend utiliza los candidatos confirmados mediante `srcset` y `sizes`. Los perfiles de producto conservan sus límites anteriores.

El vídeo admite MP4 H.264 entre 2 y 60 segundos, hasta 10 MiB y de 480 a 4096 px por lado. El Worker valida estructura, pistas, dimensiones SPS, tablas de muestras y posiciones dentro del archivo; no realiza transcodificación ni decodifica todos los fotogramas. Las imágenes WebP sí se decodifican completamente en el Worker.

La versión móvil es opcional y debe ser otra exportación del mismo material. Se genera un póster independiente de cada archivo. Si no se añade versión móvil, se utiliza el clip principal. R2 no crea versiones de vídeo; no se activan Cloudflare Stream o servicios de transformación de pago. La entrega admite GET, HEAD, Range, ETag e If-Range.

## Validación

- SQL aislado: 16 migraciones y 376 comprobaciones; diez guardados concurrentes producen uno confirmado y nueve conflictos. Incluye protección frente a GC, sustitución de asociaciones y manifiestos de vídeo competidores.
- Worker y contratos: 102 pruebas, incluidos los perfiles del Home, archivos MP4 reales, límites, rangos, formatos inválidos y ocho regresiones de contenido/caché.
- SDK y navegador con transporte aislado: seis pruebas específicas del Home; vídeo principal/móvil, pósteres, imágenes responsive, recarga, vista previa, 503, reintento y 409.
- Regresión del catálogo remoto: 24 pruebas. Controles locales de vídeo y Hero: cinco pruebas.
- Regresión de fotografías de producto: 12 pruebas; Home y contratos relacionados: 47 pruebas (algunos contratos también pertenecen a la suite Worker).
- API pública alojada: 22 comprobaciones de lectura y rechazo de operaciones administrativas anónimas.
- Prueba operativa con servicios alojados: 11 comprobaciones, ocho imágenes WebP y dos MP4 reales (19 objetos), Auth/TOTP real, guardado/publicación, conflicto y entrega por rangos. Cinco contextos independientes en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844; diez capturas del contenido temporal publicado, sin desbordamientos ni errores de navegador.
- El Home previo quedó restaurado mediante guardas de versión/huella, los 19 objetos y dos cuentas temporales se retiraron, y se comprobó que el producto existente, sus SKU y sus fotografías no cambiaron.
- Typecheck, lint, build y empaquetado Wrangler aprobados. Desplegado únicamente en `aroma-infini-frontend-staging`, versión `e8ec6e5c-6668-4955-8cfd-a940063d2c42`; después se aplicó la corrección SQL 009, sin cambiar el paquete del Worker.

Los resultados de la prueba operativa alojada, capturas y comprobaciones de compilación se conservan en `artifacts/r2-home-2026-10-29/`. Su `latest-result.json` confirma restauración y limpieza. Las capturas comparativas del diseño aprobado están en `visual-before/` y `visual-after/`; las capturas con recursos temporales reales están en `run-bf96d75a-ad04-4605-a18d-f43085a4422f/screenshots/`. Las pruebas de transporte aislado no se presentan como pruebas del bucket remoto.

Comandos reproducibles:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run cloudflare:check
npm.cmd run test:supabase:sql
npm.cmd run test:media:worker
npm.cmd run test:home:supabase
npm.cmd run test:catalog:supabase
npm.cmd run test:supabase:public
```

Las migraciones son `20261029000800_home_content.sql` y `20261029000900_home_scoped_replacement.sql`. La segunda añade el predicado explícito que exige la protección `safeupdate` de la Data API; la prueba SQL local por sí sola no reproduce esa extensión. Los tipos de `database.generated.ts` se regeneran con la CLI oficial desde el esquema aplicado; no deben editarse manualmente.

## Límites de esta entrega

No cambia la composición pública aprobada. Los contenidos institucionales ajenos al editor del Home, configuración de envíos, cupones, pedidos y reseñas conservan sus adaptadores existentes; esta entrega no los declara remotos. Mercado Pago sigue simulado. Producción requiere proyecto, bucket, secretos y dominio propios según el punto 6 del plan.

Referencias: [R2 desde Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [migraciones de Supabase](https://supabase.com/docs/reference/cli/supabase-db-push).
