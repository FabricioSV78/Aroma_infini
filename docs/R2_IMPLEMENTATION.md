# R2 de productos — entrega de desarrollo

> Actualización local del 11 de noviembre de 2026: la biblioteca centralizada
> amplía esta entrega y sustituye la retención de siete días por 24 horas al
> activar sus migraciones. Véase [MEDIA_LIBRARY.md](MEDIA_LIBRARY.md) para el
> alcance, los recursos del sitio y el estado de activación por entorno.

Este informe conserva la entrega del 29 de octubre. El Home remoto posterior
se documenta en [R2 del Home](R2_HOME_IMPLEMENTATION.md); el bucket independiente
de producción y los respaldos reales ya preparados están en
[Preparación de producción](PRODUCTION_PREPARATION.md).

29 de octubre de 2026. Implementación del plan aprobado en
[R2_INTEGRATION_PLAN.md](R2_INTEGRATION_PLAN.md). Instrucciones del panel en
[R2_MEDIA_OPERATIONS.md](R2_MEDIA_OPERATIONS.md).

## Alcance y entorno

El flujo de fotografías de productos utiliza almacenamiento R2 real y
referencias persistentes de Supabase. No necesita pegar URLs ni conocer R2
desde el panel. No se cambió la composición visual aprobada.

| Componente | Configuración |
| --- | --- |
| Proyecto SQL/Auth | `aroma-infini-dev` |
| Bucket | `aroma-infini-media-dev`, privado, Standard |
| Worker | `aroma-infini-frontend-staging` |
| Entrega | Rutas `/media/public/dynamic/<uuid>/<hash>/<ancho>.webp` del Worker |
| Administración | `POST /api/admin/media/upload`, sesión Supabase, administrador activo y MFA AAL2 |
| Limpieza | Cron horario, minuto 23; máximo diez reclamaciones por ejecución |
| Producción | No creada ni habilitada por esta entrega |

La identidad Cloudflare fue verificada antes de crear el bucket. No se
utilizaron buckets, secretos o configuraciones privadas de Bake Me Happy.
`r2.dev` permanece desactivado; el bucket no tiene dominios públicos directos.

## Flujo implementado

1. El administrador selecciona varias fotografías. Las vistas previas y los
   cambios de orden permanecen en el borrador hasta guardar.
2. El navegador comprueba la entrada y prepara WebP y derivados reales,
   sin ampliar fuentes pequeñas. Se mantienen cuatro fotos de galería y una
   imagen olfativa independiente para perfumes; cuatro para complementos.
3. Al guardar, el Worker comprueba identidad real, membresía activa, MFA,
   origen, límites y formato. Inspecciona la cabecera y decodifica los píxeles
   completos mediante WebAssembly; no confía en extensión o MIME declarado.
4. Supabase reserva un UUID y una operación idempotente. El Worker vincula
   el manifiesto a esa operación antes de escribir; un reintento con otros
   bytes no puede cambiarla.
5. R2 guarda objetos nuevos por UUID/hash con escritura condicional. El
   Worker verifica existencia, tamaño y metadatos antes de confirmar el
   activo mediante una RPC exclusiva del servidor.
6. El comando de producto guarda las asociaciones y verifica la versión
   abierta para editar. SQL no almacena archivos, base64 ni URLs temporales.
7. La tienda recibe los manifiestos verificados y ofrece únicamente sus
   variantes existentes mediante `srcset` y `sizes`.

Las operaciones confirmadas de una carga parcial se reutilizan al reintentar.
Si falla la carga o el guardado SQL, no se anuncia éxito ni se borra el
borrador. Los conflictos de edición continúan devolviendo HTTP 409 y no
sobrescriben el trabajo de otro administrador.

## Límites y seguridad

- Original local: JPG/PNG/WebP/AVIF, hasta 20 MiB, 40 megapíxeles y 12000 px
  por lado. El navegador vuelve a verificar las dimensiones al decodificar.
- Archivo enviado: WebP estático, hasta 4 MiB; máximo tres variantes y
  12 MiB de archivos por petición, más un margen limitado para multipart.
- Perfil de producto: 4:5, máximo preparado de 1600 × 2000 px; galería desde
  800 × 1000 e imagen olfativa desde 960 × 1200. Se acepta un píxel de
  redondeo, sin permitir proporciones deformadas.
- Variantes: 480, 960 y el ancho del original preparado, solo cuando caben
  en la fuente. Las reglas comunes están en `src/domain/media.ts`.
- Doble limitación de admisión: binding del Worker y reserva SQL por
  administrador, hasta 60 por minuto. Las cargas se procesan acotadamente.
- Claves privilegiadas solo en secretos del Worker o `.dev.vars` ignorado.
  Nunca en `VITE_`, `.env.example`, las respuestas públicas o el bundle web.
- Los roles de navegador no escriben metadatos verificados ni ejecutan
  confirmación o borrado. El ejecutor SQL de medios carece de login y de
  bypass de RLS.
- La lectura pública comprueba el manifiesto `ready`. No acepta rutas
  arbitrarias, prefijos privados, variantes inventadas o activos reclamados.
- Imágenes comerciales: `image/webp`, `nosniff`, ETag y caché pública
  inmutable de un año. Una sustitución obtiene otra URL. No son un almacén
  de documentos privados; una copia ya cacheada no se revoca inmediatamente.
- Cargas y errores administrativos: `Cache-Control: no-store`.

## Retirada y limpieza

Quitar una foto retira su asociación. Los archivos permanentes sin ninguna
referencia conservan siete días de recuperación. Las reservas pendientes
expiran tras 24 horas; preparar un reintento activo renueva ese plazo.

La asociación y la reclamación de limpieza bloquean la misma fila. Una
reclamación es terminal: ni una concesión vencida ni un reintento pueden
volver a asociar el activo. El Worker solo enumera y borra el prefijo UUID
reclamado. Primero retira los objetos, después confirma el borrado en SQL.
Si falla, la concesión permite continuar. La finalización HTTP 204 se maneja
sin interrumpir el resto del lote.

Las filas de auditoría permanecen como `deleted`; no son archivos huérfanos.
Los despliegues y Git no podan fotografías dinámicas. La eliminación de una
identidad Auth libera `uploader_id` sin invalidar sus imágenes ni dar permisos
comerciales al servicio de autenticación.

## Código y migraciones

- `worker/media-handler.ts`, `media-types.ts`, `media-webp-header.ts` y
  `media-codec.js`: autorización, carga, validación, entrega y limpieza.
- `worker/seo-router.ts`: integración sin alterar las rutas existentes;
  consulta pública de fichas remotas y carga diferida del decodificador.
- `src/services/media-upload.ts`, `media-registry.ts`, `image-source.ts` y
  `asset-source.ts`: borradores, reintentos, manifiestos y resolución pública.
- `src/services/catalog-admin-service.ts` y `supabase-storefront.ts`:
  guardado remoto y lectura de las mismas referencias.
- Migraciones nuevas `20261029000200_media_lifecycle.sql`,
  `20261029000300_media_pixel_rounding.sql` y
  `20261029000400_media_auth_delete_boundary.sql`. Se conservaron las ocho
  migraciones anteriores; los tipos se generaron desde el esquema real.
- `@jsquash/webp` 1.5.0 aporta el decodificador. No se activó un servicio de
  transformación de imágenes o vídeo de pago.

## Validación reproducible

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:media:worker
npm.cmd run test:media:browser
npm.cmd run test:catalog:supabase
npm.cmd run test:supabase:sql
npm.cmd run test:supabase:public
npm.cmd run cloudflare:check
```

Las suites de navegador utilizan SDK y aplicación reales con transporte
aislado; no equivalen por sí solas a una prueba del bucket alojado. La prueba
operativa de desarrollo sí utilizó Auth/TOTP, RPC, Worker y R2 reales, con
identidades y catálogo temporales identificados y retirados al terminar.
Su resultado final y las capturas se conservan en
`artifacts/r2-implementation-2026-10-29/`. El informe consolidado es
`result.json`; no contiene credenciales.

| Validación final | Resultado |
| --- | --- |
| SQL aislado | 212 comprobaciones; once migraciones; concurrencia de reservas, manifiestos, asociaciones y limpieza aprobada |
| Contratos y Worker aislado | 46 pruebas, incluidos grupos de 10/50 productos y respuesta 204 de finalización |
| Panel/navegador R2 aislado | 12 pruebas, incluida conservación del borrador, reintentos, respuesta perdida y conflicto 409 |
| Catálogo remoto con SDK aislado | 23 pruebas |
| Regresiones relacionadas | 71 casos únicos aprobados; se corrigieron el origen fijo de una prueba y la carga innecesaria del WASM en pruebas SEO |
| Decodificador real en workerd | Seis comprobaciones: 480/960/1600 px y archivos truncados |
| Supabase/R2 alojados | 14 comprobaciones; cinco imágenes, 15 objetos reales, perfume y complemento, cinco contextos de navegador, limpieza confirmada |
| API pública de Supabase | 14 comprobaciones de acceso |
| Límites HTTP del Worker desplegado | Carga anónima rechazada, origen ajeno rechazado, ruta privada cerrada y preflight válido |
| Calidad de código | Typecheck, lint, build y paquete Wrangler correctos |

Capturas del panel: `artifacts/r2-media/screenshots/photos-*.png`.
Capturas con servicios reales y catálogo temporal:
`artifacts/r2-implementation-2026-10-29/hosted-screenshots/product-*.png`.
Se comprobaron 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y
390 × 844, sin desbordamiento horizontal. Las imágenes de prueba se
identifican como fixtures; no son material comercial definitivo.

Los grupos de diez y cincuenta productos se ejercitan con los contratos y
el Worker bajo almacenamiento aislado. No se crearon cincuenta perfumes
comerciales en la base real ni se presentan esas pruebas como una medición
de carga de producción.

## Home y otros módulos

La entrega inicial documentada arriba conecta fotografías de productos.
Su continuación conecta también Hero, categorías, recomendador, franja y
vídeo: véase [Home remoto — Supabase y R2](R2_HOME_IMPLEMENTATION.md).
Incluye contenido versionado, asociaciones protegidas frente a limpieza,
perfiles WebP propios y vídeo principal/móvil con póster y GET/HEAD/Range.
Los recursos locales siguen intactos y no se importan automáticamente los
borradores del navegador. R2 almacena los MP4 suministrados, sin transcodificar;
no se activaron Images o Stream. Mercado Pago continúa simulado.

## Operación y producción posterior

En Vite, `.env.local` contiene el origen público del Worker de desarrollo en
`VITE_MEDIA_API_BASE_URL`. Si frontend y API comparten Worker puede quedar
vacío. `VITE_MEDIA_BASE_URL` es otra opción, reservada a una eventual copia
estática verificada; no debe utilizarse para cambiar el origen de las
fotografías dinámicas.

Los secretos de servidor se configuran con `wrangler secret put <NOMBRE>
--env staging`, introduciendo su valor por la entrada protegida. Los nombres
son `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_MEDIA_SECRET_KEY`. El binding R2
evita proporcionar claves S3 al navegador. Mantener `.dev.vars` fuera de Git.

Antes de publicar en producción:

1. Definir dominio y proyecto Supabase propios de producción. Revisar sus
   migraciones y backups; no reutilizar automáticamente la base de desarrollo.
2. Crear `aroma-infini-media-prod` privado y un entorno Worker de producción
   con su binding explícito. No reutilizar el bucket de desarrollo.
3. Configurar secretos propios, orígenes permitidos, cron, observabilidad y
   dominio de entrega sobre el Worker. No publicar directamente todo el bucket.
4. Construir con las variables del entorno correcto y comprobar que los
   activos no apuntan a desarrollo. Revisar las condiciones actuales de uso
   de R2/Workers y el consumo de CPU antes de activar otro plan.
5. Probar desde el panel y una sesión independiente con fotografías reales,
   incluidos reemplazos, formatos inválidos, reintentos y retiro de archivos.
6. Habilitar indexación únicamente después de confirmar contenido comercial,
   dominio y reglas de publicación. Restaurar código no restaura R2: conservar
   backups de SQL y un plan propio de recuperación de objetos.

La versión local instalada de workerd admite compatibilidad hasta
`2026-10-08`; se utiliza esa fecha comprobada, con `nodejs_compat`. No se
actualizaron dependencias Cloudflare incidentalmente para forzar otra fecha.

Referencias oficiales: [R2 desde Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[secretos de Workers](https://developers.cloudflare.com/workers/configuration/secrets/),
[módulos WebAssembly](https://developers.cloudflare.com/workers/runtime-apis/webassembly/),
[entornos de Wrangler](https://developers.cloudflare.com/workers/wrangler/environments/).

## Entregas posteriores del mismo entorno

La [auditoría de rendimiento](PERFORMANCE_AUDIT.md) registra la comparación
antes/después del catálogo y del GET de imágenes. La lectura actual conserva
el manifiesto verificado y elimina el HEAD redundante antes de GET. Las
cifras anteriores de este documento corresponden a la entrega inicial R2.

La [gestión de familias olfativas](OLFACTORY_FAMILY_MANAGEMENT.md) incorpora
administración persistente del vocabulario, sin modificar las fotos ni las
asociaciones existentes. Las migraciones posteriores de SKU, familias y
consulta paginada llevan el total del entorno de desarrollo a catorce.
