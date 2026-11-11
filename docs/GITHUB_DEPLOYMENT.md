# Despliegues desde GitHub

10 de noviembre de 2026. Preparación del flujo de Aroma Infini. Este documento
describe la configuración que debe completarse en GitHub y Cloudflare; no
certifica una ejecución alojada de GitHub Actions ni autoriza un despliegue.

La primera ejecución real de `main` y sus correcciones se documentan en
[Primera ejecución de GitHub Actions](GITHUB_ACTIONS_FIRST_RUN.md). Los fallos
posteriores de la suite general se revisan en
[Correcciones de browser-core](GITHUB_ACTIONS_BROWSER_CORE_2026_11_10.md).
Las correcciones necesitan una nueva ejecución alojada antes de crear `develop`.

## Flujo y destinos

Se utiliza el mismo repositorio público
[`FabricioSV78/Aroma_infini`](https://github.com/FabricioSV78/Aroma_infini).

| Acción                                      | Resultado previsto                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Push a `develop`                            | Pruebas completas y despliegue automático de staging si pasan.          |
| Pull request                                | Comprobaciones sin secretos de despliegue ni cambios alojados.          |
| Push o merge a `main`                       | Comprobaciones; no publica producción automáticamente.                  |
| Ejecución manual de producción desde `main` | Requiere habilitación explícita, confirmación y aprobación del entorno. |

| Entorno    | Worker                             | Supabase                             | R2                        |
| ---------- | ---------------------------------- | ------------------------------------ | ------------------------- |
| Staging    | `aroma-infini-frontend-staging`    | `aroma-infini-dev`                   | `aroma-infini-media-dev`  |
| Producción | `aroma-infini-frontend-production` | Proyecto independiente de producción | `aroma-infini-media-prod` |

Staging permanece en
<https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev>.
Su checkout es simulado y sus datos se guardan en desarrollo. La producción
actual permanece cerrada: sin dominio, rutas públicas, indexación ni pagos.
Un despliegue del Worker no abre esas funciones por sí mismo.

## 1. Configurar GitHub

Hacerlo con una cuenta que administre el repositorio. El repositorio es público
y utiliza GitHub Free: las protecciones de entorno descritas están disponibles
para este caso. Mantener revisados los límites de almacenamiento y minutos de
Actions; no contratar servicios ni cambiar la visibilidad como parte del alta.

En el repositorio, abrir **Settings → Actions → General**:

1. Habilitar GitHub Actions y permitir las acciones utilizadas por los workflows.
2. Mantener los permisos predeterminados de `GITHUB_TOKEN` en lectura.
3. No habilitar permisos de escritura generales para que las pruebas funcionen.

En **Settings → Secrets and variables → Actions → Variables**, crear:

| Nombre                      | Valor                                                                     |
| --------------------------- | ------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`     | ID de la cuenta Cloudflare donde existen los dos Workers. No es un token. |
| `PRODUCTION_DEPLOY_ENABLED` | `false`                                                                   |

La producción queda deshabilitada mientras esta variable no sea exactamente
`true`. No cambiarla para hacer pasar pruebas o completar la configuración.

En **Settings → Environments**, crear exactamente estos dos entornos:

### `staging`

- En **Deployment branches and tags**, permitir únicamente la rama `develop`.
- No necesita aprobación por cada publicación automática de desarrollo.
- En **Environment secrets**, crear `CLOUDFLARE_API_TOKEN` con el token de staging
  explicado en el siguiente apartado.
- Crear también `SUPABASE_PUBLISHABLE_KEY` con la clave **publicable o anon del
  proyecto de desarrollo**. Esta clave llega al navegador; guardarla como secreto
  de Actions evita escribirla en la configuración o los logs del workflow.

### `production`

- En **Deployment branches and tags**, permitir únicamente la rama `main`.
- Activar **Required reviewers** y seleccionar `FabricioSV78`, o el responsable
  definitivo autorizado para publicar.
- Si solo hay un responsable y él inicia y aprueba la publicación, dejar
  desactivado **Prevent self-review**. Si hay dos personas responsables,
  activarlo permite exigir una segunda revisión.
- Desactivar el bypass de las protecciones por administradores cuando la
  configuración del repositorio lo permita.
- En **Environment secrets**, crear `CLOUDFLARE_API_TOKEN` con un token separado
  para producción y `SUPABASE_PUBLISHABLE_KEY` con la clave **publicable o anon
  del proyecto de producción**, nunca la de desarrollo.

Configurar las credenciales únicamente dentro de su entorno. No crear un token
de producción como secreto global para que staging pueda encontrarlo.
No enviar tokens, contraseñas, claves privilegiadas ni códigos MFA por chat.

## 2. Crear los tokens de Cloudflare

En Cloudflare, con una identidad que administre la cuenta correcta:

1. Seleccionar la cuenta de Aroma Infini y abrir **Manage account → Account API
   tokens → Create Token**. Estos tokens de cuenta permiten que la integración
   continúe independientemente de una sesión personal.
2. Crear el token de staging con el rol de Workers **Editor**, restringido al
   Worker existente `aroma-infini-frontend-staging`.
3. No conceder el rol a todos los Workers ni utilizar una plantilla amplia de
   administrador. No añadir permisos de DNS, facturación o R2: este flujo no
   gestiona esos recursos directamente.
4. Elegir una expiración adecuada y registrar cuándo renovarlo; revisar el resumen
   antes de crear el token.
5. Copiarlo directamente a `staging → Environment secrets → CLOUDFLARE_API_TOKEN`.
6. Crear otro token con **Editor** restringido a
   `aroma-infini-frontend-production` y guardarlo solo en el entorno `production`.

El rol Editor permite actualizar un Worker existente con sus bindings, sin
necesitar acceso directo al bucket. Mantener también las protecciones de ramas,
entornos y revisores. Si el panel no ofrece estos roles o sus alcances, revisar
la documentación de permisos antes de sustituirlos por permisos más amplios.

El ID de cuenta se obtiene del panel de Cloudflare y se guarda en la variable
de repositorio `CLOUDFLARE_ACCOUNT_ID`. No utilizar la Global API Key ni una sesión
OAuth personal exportada como sustituto del token.

Los secretos de ejecución de Supabase, medios, comercio y push ya pertenecen
a cada Worker. Este flujo no necesita copiarlos a GitHub. Tampoco requiere claves
S3 de R2: conserva el binding del bucket privado. Revisar que los secretos
requeridos de ambos Workers existan antes de intentar publicar.

El helper `scripts/github-deployment.mjs` deriva la configuración pública desde
`wrangler.jsonc` y toma la clave publicable del entorno correspondiente. No requiere
copiar `.env.local`, crear variables `VITE_` por duplicado ni proporcionar la URL
de Supabase otra vez. Opcionalmente, los entornos de GitHub pueden definir
`ADDRESS_MAP_TILE_URL` y `ADDRESS_MAP_ATTRIBUTION` si se utiliza un proveedor raster
de mapas distinto del predeterminado.

No conectar además un despliegue automático independiente en Cloudflare Builds:
habría dos procesos publicando el mismo Worker y uno podría saltarse la aprobación
de GitHub. GitHub Actions será el mecanismo automático de este flujo.

## 3. Revisar y versionar el proyecto actual

Hay cambios anteriores de implementación que deben revisarse junto al nuevo
flujo. El primer commit no debe contener únicamente los YAML: el checkout de
GitHub necesita código, scripts, migraciones, tests, lockfile y recursos utilizados.

Desde PowerShell en la carpeta del proyecto:

```powershell
git status --short
git diff --stat
git fetch origin
git log --oneline --left-right main...origin/main
```

Si la rama remota contiene cambios nuevos, resolverlos antes de publicar;
no usar `--force` para sustituirlos. Revisar los archivos desde el control de
código fuente de VS Code y preparar solo los que corresponden. Evitar un
`git add .` sin revisión.

`.gitignore` conserva fuera del repositorio `.env*.local`, `.dev.vars*`,
`node_modules`, `dist`, `.wrangler`, artefactos y exportaciones locales. La plantilla
`.env.example` sí se versiona y debe contener únicamente ejemplos sin secretos.
Comprobar que no haya credenciales, datos de clientes ni respaldos en los archivos
preparados. Después de preparar y revisar la implementación completa:

```powershell
git diff --cached --stat
git commit -m "Versiona la base actual y prepara despliegues desde GitHub"
git push origin main
```

Ese primer push incorpora los workflows a la rama predeterminada y ejecuta sus
comprobaciones; no publica producción. Con el árbol de trabajo ya guardado y la
base revisada, crear `develop` si todavía no existe:

```powershell
git switch -c develop
git push -u origin develop
```

Si `develop` ya existe, utilizar esa rama en lugar de volver a crearla. Su push
inicia las comprobaciones y, cuando estén configuradas las credenciales del entorno,
el despliegue de staging. No ejecutar estos comandos como una publicación masiva
de archivos que aún no se hayan revisado.

## 4. Proteger las ramas y trabajar con pull requests

En **Settings → Rules → Rulesets**, o **Branches** si aparece esa interfaz:

- Proteger `main` y `develop` contra eliminación y force push.
- Exigir pull request para modificar `main`; el flujo habitual será `develop → main`.
- Exigir las comprobaciones de calidad, SQL y todas las matrices aisladas que
  aparecen en la primera ejecución real. Seleccionar sus nombres reales en GitHub.
- Impedir merge cuando falte o falle alguna comprobación requerida.
- Si trabaja una sola persona, no configurar una aprobación de PR que únicamente
  podría dar un segundo colaborador inexistente. La publicación de producción
  conserva además su paso manual y su revisión de entorno.

Para cada cambio posterior: crear una rama de trabajo desde `develop`, hacer un
PR a `develop`, esperar pruebas y comprobar staging. Cuando la versión esté
aprobada, abrir un PR de `develop` a `main`. No publicar producción para probar
cambios que todavía no se han validado en staging.

## 5. Comprobar la primera publicación de staging

En **Actions**, revisar la ejecución de despliegue de staging:

1. Todas las comprobaciones deben terminar correctamente.
2. Revisar que el commit desplegado sea el commit esperado de `develop`.
3. Confirmar el build de staging y su verificación de entorno e integridad.
4. Confirmar Wrangler apuntando a `aroma-infini-frontend-staging`.
5. Confirmar `staging:check` después de publicar.
6. Abrir la URL en navegador de escritorio y móvil. Probar inicio de sesión,
   permisos de admin con MFA, catálogo, fotos y el checkout de prueba.

Una ejecución verde no certifica cobros reales, teléfonos físicos, restauración
de respaldos ni todos los recorridos comerciales. Si falla la comprobación HTTP
posterior al despliegue, el código puede haberse publicado: revisar el estado y
los logs antes de reintentar. No anunciar éxito ni revertir datos automáticamente.

## 6. Publicar producción cuando corresponda

La producción actual se prepara **cerrada**. El workflow manual no habilita el
dominio, indexación ni cobros. Mantener `PRODUCTION_DEPLOY_ENABLED=false` hasta
terminar la revisión y recibir autorización específica para actualizar ese entorno.

Para una actualización autorizada: revisar el PR aprobado, el estado de staging,
las migraciones pendientes y los respaldos; habilitar conscientemente la variable,
abrir **Actions → despliegue de producción → Run workflow**, seleccionar `main`,
marcar la confirmación explícita y revisar el commit. Tras las comprobaciones,
el revisor aprueba el job de `production` en **Review deployments**.

No ejecutar el workflow desde otra rama ni sustituir las variables por las de
desarrollo para superar un error. Un workflow o dry-run correcto no prueba que
las migraciones y secretos alojados estén actualizados.

La futura apertura comercial necesita su propia revisión: dominio definitivo,
orígenes Auth y API, contenido real, pago verificado en servidor, inventario,
cupones y condiciones comerciales. `production:check` mantiene sus bloqueos
intencionales mientras estas condiciones no se cumplan; no se modifica para
obtener artificialmente una comprobación verde.

## Migraciones, datos, medios y recuperación

La persistencia de 2FA requiere aplicar primero la migración y la revisión de
[dispositivos de confianza](ADMIN_TRUSTED_DEVICES.md) en desarrollo. Un push del
frontend no instala ese cambio SQL. El entorno de producción mantiene su
aprobación independiente.

- GitHub contiene código y migraciones; PostgreSQL y R2 conservan los datos.
- El flujo de despliegue no ejecuta migraciones remotas ni carga datos de muestra.
- Antes de publicar código que necesite un cambio SQL, revisar y aplicar por
  separado las migraciones autorizadas en el proyecto correcto, con respaldo y
  compatibilidad con la versión desplegada. Hacer primero la validación en desarrollo.
- Los cambios en funciones alojadas de Supabase y sus secretos se revisan y publican
  por separado; desplegar el Worker no actualiza esas funciones.
- No sincronizar los usuarios, pedidos ni fotografías de staging hacia producción.
- Un despliegue no borra las fotos dinámicas; continúa la política de asociaciones
  y limpieza de medios existente.
- Revertir un Worker restaura código, no la base de datos ni los objetos R2.
  La recuperación de datos utiliza su procedimiento y copias independientes.
- Mantener la estrategia de respaldo vigente y verificar restauraciones; no
  desactivarla porque ahora se utilice GitHub.

## Datos que debe completar el responsable

1. Configurar los dos entornos y sus restricciones/revisores.
2. Guardar los dos tokens directamente en los secretos correspondientes.
3. Guardar las claves publicables de cada proyecto Supabase en su entorno.
4. Configurar el ID de cuenta y mantener la habilitación de producción en `false`.
5. Revisar y subir la implementación completa, crear `develop` y revisar el primer
   resultado real de Actions.

No hace falta proporcionar el dominio todavía para probar staging. Al terminar,
basta informar qué pasos están completos y compartir el enlace de la ejecución
de Actions si hay un error; nunca sus credenciales.

## Validación de esta preparación

- Los tres workflows pasan actionlint 1.7.12; las acciones externas conservan
  versiones fijadas por SHA verificadas contra sus versiones oficiales.
- Las 150 pruebas Node pasan, incluidas 13 nuevas pruebas de autorización,
  aislamiento, configuración pública y rechazo de revisiones obsoletas.
- TypeScript, lint y los builds de staging y producción pasan. Ambos paquetes
  pasan `wrangler deploy --dry-run`; esto no publica versiones.
- El paquete de staging también se comprobó en una copia local limpia sin
  `.env.local`, `.env.production.local` ni `.dev.vars`, para reproducir la ausencia
  de esos archivos en GitHub. Comparte las dependencias instaladas: no equivale
  a un runner Linux ni a una instalación nueva de `npm ci`.
- La primera ejecución real detectó los problemas descritos en el informe
  enlazado. Las correcciones requieren otro commit y una nueva ejecución. El
  despliegue desde GitHub sigue dependiendo de configurar los secretos y reglas
  de los entornos descritos arriba.

Evidencia local: `artifacts/github-deployment-2026-11-10/result.json`. Se conservan
también dos intentos locales fallidos: el sandbox impidió inicialmente leer una
carpeta padre y Wrangler recargó un valor de `.env.local` en lugar de una variable
explícitamente vacía al empaquetar staging en la carpeta original. La comprobación
limpia posterior pasó sin alterar la protección del paquete. Los archivos locales
ignorados no se copian a GitHub.
No se hicieron commits, pushes, migraciones ni despliegues alojados en esta preparación.

Referencias oficiales:
[Cloudflare desde GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[tokens de cuenta](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/),
[roles y alcance por Worker](https://developers.cloudflare.com/workers/authorization/workers/),
[protecciones y disponibilidad por plan](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments),
[aprobar despliegues](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).
