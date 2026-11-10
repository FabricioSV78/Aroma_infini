# Entorno de desarrollo en Cloudflare Workers

30 de octubre de 2026. Estado posterior a [Fase 5 de Supabase](SUPABASE_PHASE_5.md), [favoritos por cuenta de Fase 6](SUPABASE_PHASE_6.md) y [Home remoto](R2_HOME_IMPLEMENTATION.md).

## Alcance

La [limpieza de interfaces](INTERFACE_PRODUCTION_CLEANUP.md) introduce `APP_ENVIRONMENT` y el origen explícito de simulación en el Worker. La bandera `CHECKOUT_SIMULATION_ENABLED` por sí sola ya no habilita el registro de pedidos. Los comandos Cloudflare compilan mediante `build:staging`; el build normal se considera producción y bloquea el checkout mientras la pasarela real no exista.

`staging` sirve la tienda y el panel desde `aroma-infini-frontend-staging`, junto con los endpoints de medios y checkout. Usa el proyecto `aroma-infini-dev` y el bucket privado `aroma-infini-media-dev`. No es un entorno de producción ni confirma ventas cobradas.

Supabase Auth, perfiles/direcciones, catálogo, marcas, variantes, ofertas, familias, Home, tarifas, cupones y pedidos de prueba ya tienen persistencia remota. La administración requiere membresía activa y MFA AAL2. Mercado Pago permanece simulado: los pedidos se guardan con `simulation = true` y pago pendiente, sin consumir stock ni usos reales de cupones.

El build conserva `noindex,nofollow`. No se debe activar `VITE_ALLOW_INDEXING=true` mientras no existan dominio definitivo, contenido aprobado y flujo comercial real verificado.

## Arquitectura y configuración

- `worker/seo-router.ts` sirve los archivos compilados de `dist/` y resuelve rutas SPA. `worker/catalog-seo.ts` consulta las fichas públicas para servir sus metadatos iniciales, también en el filtro simple de marca, sin activar indexación. [Alcance y pruebas](SEO_FOUNDATION.md#metadatos-iniciales-del-catálogo-remoto).
- El binding `ASSETS` entrega los archivos estáticos. El Worker utiliza `/__app_shell` cuando corresponde; no depende de la antigua configuración de fallback `single-page-application`.
- `MEDIA_BUCKET` apunta exclusivamente al bucket privado de desarrollo. Las fotografías y vídeos gestionados pasan por validación, manifiestos y entrega desde el Worker; `r2.dev` no se utiliza como dominio público.
- `MEDIA_RATE_LIMITER` limita admisión de cargas a 60 solicitudes por minuto. El cron `23 * * * *` ejecuta la limpieza de activos reclamados sin referencias, respetando asociaciones de productos, Home e imágenes históricas de pedidos.
- `CHECKOUT_RATE_LIMITER` admite hasta diez solicitudes por minuto por IP. `CHECKOUT_SIMULATION_ENABLED=true` existe sólo en `env.staging`; si falta, el endpoint no crea pedidos de prueba.
- `MEDIA_ALLOWED_ORIGINS` permite los orígenes locales declarados; cada endpoint comprueba también su mismo origen. CORS complementa la autorización de identidad, no la reemplaza.
- Los activos con hash conservan caché inmutable. Respuestas administrativas y checkout usan `no-store`; las rutas de medios verifican su manifiesto antes de entregar archivos.
- Fecha de compatibilidad comprobada: `2026-10-08`, con `nodejs_compat`. Conservar la versión instalada de Wrangler y revisar compatibilidad al actualizarla.

La fuente de configuración es `wrangler.jsonc`. Tanto el entorno predeterminado como `staging` apuntan a desarrollo; el predeterminado no constituye un entorno de producción.

## Variables y secretos

`.env.local` contiene las variables públicas del frontend; `.env.example` es una plantilla. Las variables `VITE_` terminan en el navegador y nunca deben contener claves privilegiadas.

El Worker recibe `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_MEDIA_SECRET_KEY` y `SUPABASE_COMMERCE_SECRET_KEY` como secretos. Los archivos `.dev.vars` están ignorados por Git y no se publican automáticamente como secretos remotos. No mostrar valores en documentos, comandos, registros o conversaciones. Configurarlos mediante la entrada protegida de `wrangler secret put <NOMBRE> --env staging` en el entorno autorizado.

`VITE_MEDIA_API_BASE_URL` permite que Vite local use el Worker remoto de medios y checkout; puede quedar vacío cuando frontend y endpoints compartan origen. `VITE_MEDIA_BASE_URL` es independiente y no debe apuntar arbitrariamente las imágenes dinámicas a una copia estática no verificada.

## Comandos

```powershell
npm.cmd ci
npm.cmd run cloudflare:types
npm.cmd run cloudflare:check
npm.cmd run cloudflare:dev
```

`cloudflare:check` compila y comprueba el paquete con `--dry-run`; no valida por sí solo los servicios alojados. `cloudflare:dev` inicia el runtime local del Worker. Antes de guardar datos, revisar sus variables y bindings: una simulación local puede seguir consultando Supabase real si usa la configuración de desarrollo.

La publicación autorizada en desarrollo utiliza:

```powershell
npx.cmd wrangler login
npm.cmd run cloudflare:deploy
```

Si una red corporativa muestra `unable to verify the first certificate`, conserva la validación TLS y permite que Node use los certificados instalados por Windows antes de ejecutar Wrangler:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
```

La URL actual es `https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev`. Comprobar visitas directas a un producto realmente publicado, `/checkout`, `/cuenta` y `/admin`; no asumir que los slugs de ejemplo siguen existiendo en el catálogo remoto.

## Validación y límites

La prueba operativa de Fase 5 utilizó Supabase Auth/MFA, tarifas, cupón, creación de pedidos por Worker y consultas administrativas reales. Comprobó propiedad por UUID, seguimiento privado, historial, cambios individuales/masivos, conflictos y cinco tamaños de navegador. Su informe es `artifacts/supabase-phase-5-2026-10-29/hosted-latest-result.json`: resultado aprobado, configuración de envíos restaurada, dos pedidos y dos cuentas temporales retirados, producto/stock/imágenes intactos.

El alcance exacto y las suites aisladas están en [SUPABASE_PHASE_5.md](SUPABASE_PHASE_5.md). El carrito y los favoritos de invitado usan almacenamiento de navegador; los favoritos de cuenta se guardan en Supabase según [Fase 6](SUPABASE_PHASE_6.md). Las reseñas reales, la pasarela, las reservas/liberaciones de stock y la redención transaccional de cupones no están habilitadas. No se importan datos de demostración ni información personal desde IndexedDB.

El registro no pide confirmar correo y la recuperación funciona mediante código guardado, sin SMTP. Los administradores se crean en Supabase y se autorizan por UUID, sin alta administrativa pública. El seguimiento invitado requiere su enlace privado; una referencia por sí sola no expone datos del comprador.

## Comprobación operativa de solo lectura

```powershell
npm.cmd run staging:check
npm.cmd run staging:check -- --json
npm.cmd run test:staging
```

El comprobador obtiene el origen exacto de `env.staging` en `wrangler.jsonc` y las variables públicas del modo Vite **staging**, incluyendo sus posibles archivos `.env.staging`. No recibe una URL arbitraria, no carga `.dev.vars` ni utiliza sesiones del navegador o de las CLI. Rechaza claves privilegiadas y proyectos distintos antes de enviar solicitudes.

Comprueba las páginas públicas y las shells de cuenta/admin, los archivos de entrada JS/CSS, `noindex`, cabeceras, robots, redirección del catálogo y respuestas 404. Una shell administrativa HTTP 200 no concede acceso a datos: las comprobaciones de Auth, MFA y RLS siguen siendo independientes. También verifica que una lectura del endpoint de checkout no pueda crear un pedido y que las rutas privadas de medios estén cerradas.

Consulta únicamente las RPC públicas de lectura `catalog_products` —máximo doce productos— y `home_document`. Comprueba hasta seis imágenes administradas y todos sus tamaños declarados: descarga y decodificación WebP completa, dimensiones, tamaño HTTP, SHA-256 del original, HEAD, ETag, respuesta 304, CORS y caché. El hash de la ruta pertenece al original; no se exige que los derivados tengan los mismos bytes. Si hay vídeos R2 publicados, comprueba como máximo dos mediante HEAD y un rango de hasta 1024 bytes, sin afirmar una verificación del archivo completo.

El informe distingue productos disponibles y muestreados, así como medios descubiertos y comprobados. No enumera el bucket, no inspecciona archivos privados, no comprueba todos los recursos predeterminados locales ni sustituye un backup. Limita solicitudes, tiempo y bytes recibidos, cancela descargas excesivas y no sigue redirecciones. No crea cuentas, pedidos, cargas, copias ni cambios de configuración. La salida contiene códigos y recuentos, sin respuestas, claves ni datos de clientes; el código de salida es 1 cuando falla una comprobación.

La ejecución del 1 de noviembre de 2026 comprobó 25 contratos con 67 solicitudes y 1.876.463 bytes: un producto público y cinco imágenes R2 con sus quince tamaños. No había vídeos administrados publicados; su comportamiento por rangos se verificó con transporte aislado. Las dieciséis pruebas del comprobador incluyen corrupción, truncado, referencias sin manifiesto, límites, errores de red, configuración inválida y redirecciones ajenas. [Informe de esta ejecución](../artifacts/staging-check-2026-11-01/hosted.json).

Fuentes de los contratos HTTP: [R2 desde Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) y [cabeceras de activos estáticos](https://developers.cloudflare.com/workers/static-assets/headers/). El comprobador respeta la diferencia entre respuestas de ASSETS y respuestas generadas por el Worker; no se modificaron sus cabeceras ni su configuración.

## Paso a producción futura

Actualización de aceptación del 31 de octubre: las funciones Supabase `account-recovery` y `change-email` admiten el origen exacto de este Worker en `ACCOUNT_ACTION_ALLOWED_ORIGINS`, además de los dos orígenes locales declarados. La comprobación `test:supabase:public` verifica sus preflight CORS y el rechazo de orígenes ajenos. La lista de CORS del Worker no configura automáticamente las funciones de Supabase. El entorno de producción necesitará su propia lista de orígenes; no deben añadirse comodines.

Producción requiere proyecto Supabase, Worker, bucket, secretos y dominio propios, con configuración explícita que no reutilice automáticamente los recursos de desarrollo. Definir backups y restauración, orígenes permitidos, observabilidad y condiciones comerciales definitivas. La subida de contenido por el panel no debe depender de Git ni de una poda de archivos durante el despliegue.

Antes de habilitar ventas, conectar Mercado Pago y verificar notificaciones en servidor, transacciones de inventario y uso de cupones. El pago simulado del navegador nunca será evidencia de cobro. Revisar también CSP, metadatos y sitemap dinámicos con el catálogo publicado. La indexación sólo se activa al configurar `VITE_SITE_URL` con el dominio aprobado y completar esa validación.
