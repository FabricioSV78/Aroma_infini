# Entorno de validación en Cloudflare Workers

## Objetivo

`staging` publica el frontend actual como una SPA estática en Cloudflare Workers. Sirve para que el cliente revise la tienda y el panel desde una URL estable sin presentar la propuesta como un e-commerce operativo.

El build conserva `noindex,nofollow`. No se debe activar `VITE_ALLOW_INDEXING=true` mientras marcas, productos, fotografías, precios, políticas y dominio sigan siendo referenciales.

## Arquitectura

- Worker de activos estáticos, sin código de servidor ni bindings.
- Archivos compilados desde `dist/`.
- Fallback `single-page-application` para que React Router resuelva rutas directas y recargas.
- Entorno independiente `aroma-infini-frontend-staging` sobre `workers.dev`.
- Assets con hash de Vite almacenados en el navegador durante un año; HTML y `robots.txt` se revalidan siempre.
- Cabeceras básicas contra interpretación MIME, iframes y permisos de navegador innecesarios.
- Fecha de compatibilidad `2026-10-05`, validada con Wrangler 4.147.0. Debe revisarse al actualizar Wrangler.

## Comandos

```powershell
npm.cmd ci
npm.cmd run cloudflare:types
npm.cmd run cloudflare:check
npm.cmd run cloudflare:dev
```

El servidor local de Workers usa `http://localhost:8787` por defecto. La validación remota se publica con:

```powershell
npx.cmd wrangler login
npm.cmd run cloudflare:deploy
```

Si una red corporativa muestra `unable to verify the first certificate`, conserva la validación TLS y permite que Node use los certificados instalados por Windows antes de ejecutar Wrangler:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
```

Wrangler mostrará la URL final `https://aroma-infini-frontend-staging.<subdominio>.workers.dev`. Antes de compartirla hay que abrir directamente rutas como `/producto/petale-nu`, `/checkout`, `/cuenta` y `/admin` para comprobar el fallback SPA.

## Límites del entorno

- Productos, pagos, pedidos, reseñas y métricas siguen siendo demostraciones identificadas como tales.
- La administración no tiene autenticación real.
- Cambios, carrito, favoritos y datos simulados se almacenan en memoria o `localStorage`; no se comparten entre navegadores, dispositivos o usuarios.
- Mercado Pago, Supabase, correo, R2 y persistencia comercial no están conectados.
- No deben cargarse datos personales ni credenciales reales.

Si el enlace se compartirá fuera del equipo y del cliente, conviene proteger el Worker con Cloudflare Access desde el panel de Cloudflare antes de distribuirlo.

## Paso a producción futura

Producción debe usar otro Worker o un dominio separado, autenticación real para `/admin`, variables y secretos administrados por Cloudflare, políticas comerciales definitivas y una revisión de CSP compatible con Mercado Pago y los servicios finalmente aprobados. La indexación solo se activa después de configurar el dominio público mediante `VITE_SITE_URL` y aprobar el contenido.
