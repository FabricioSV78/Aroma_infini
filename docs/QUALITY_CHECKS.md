# Comprobaciones reproducibles

Las comprobaciones no necesitan credenciales. No despliegan, no consultan
proyectos alojados y no realizan cobros. Las pruebas del navegador utilizan
la aplicación y el SDK reales con transportes y datos aislados.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:node
npm.cmd run build
npm.cmd run security:audit
```

Para ejecutar toda la regresión aislada:

```powershell
npx.cmd playwright install chrome
npm.cmd run test:isolated -- --list
npm.cmd run test:isolated
```

Se pueden ejecutar los grupos `contracts`, `browser-core`,
`browser-accounts` o `browser-commerce` por separado. Cada grupo ejecuta sus
configuraciones en serie porque algunas comparten puertos. El grupo general
utiliza el puerto 5373 para no interrumpir el servidor de desarrollo 5173.
Los servidores de prueba no se reutilizan. Un puerto ocupado causa error;
el runner nunca detiene procesos ajenos.
La suite general se limita a dos workers para evitar saturar CPU y memoria
en equipos con muchos núcleos. Las suites dedicadas conservan sus límites.
No ejecutes grupos distintos simultáneamente en el mismo equipo: también
pueden compartir puertos entre grupos. CI los ejecuta en máquinas separadas.

El runner descubre los archivos `tests/*.test.mjs`. Una prueba comprueba que
las 25 configuraciones Playwright estén incluidas en el plan, sin perder las
suites específicas de Auth, catálogo, checkout, medios o administración.
`test:e2e` conserva su suite histórica; por sí sola no representa todas las
regresiones del proyecto. TypeScript ahora revisa todos los configs root.

La suite SQL crea PostgreSQL desechable en loopback, aplica las migraciones y
comprueba RLS, permisos y concurrencia. Actualmente requiere Windows x64:

```powershell
npm.cmd install --prefix artifacts/supabase-sql-tools --no-save embedded-postgres@17.10.0-beta.17 pg@8.23.1
npm.cmd run test:supabase:sql
```

Las herramientas SQL están separadas de las dependencias de la aplicación y
sus versiones quedan declaradas en CI. `artifacts` sigue ignorado por Git.
No se ejecutan los comandos `test:supabase:public`, respaldos alojados ni
despliegues desde CI. Los secretos y archivos `.env*.local` no son necesarios.

`.github/workflows/quality.yml` ejecuta calidad, cuatro grupos aislados y SQL
local, con permisos mínimos y acciones fijadas a commits. GitHub solamente
lo ejecutará después de incorporar estos archivos al repositorio remoto.
La ejecución del workflow en GitHub queda pendiente hasta ese momento; no
debe confundirse una comprobación local correcta con un CI ya ejecutado.

CI utiliza Node 24 LTS y acciones oficiales con runtime Node 24, fijadas a
commits completos. Se verificaron las versiones en las publicaciones de
[checkout](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node](https://github.com/actions/setup-node/releases/tag/v6.4.0) y
[upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2).
La validación local de esta entrega usa Node 24.18.1; el runner alojado tomará
la revisión disponible de la rama 24. No se actualiza la instalación del equipo.
