# Supabase: desarrollo y recuperación

La comprobación alojada del 7 de noviembre registró 28 migraciones en desarrollo y 25 en producción cerrada. La revisión local del 8 de noviembre no aplica migraciones ni despliega servicios. Véanse el [informe de seguridad](../docs/SECURITY_ROBUSTNESS_AUDIT_2026_11_07.md) y el [mantenimiento actual](../docs/PROJECT_HEALTH_IMPROVEMENTS_2026_11_08.md). Auth/cuenta, catálogo, Home, envíos, cupones,
pedidos de prueba, favoritos, reseñas, configuración y reclamaciones conectados en desarrollo. Las fotografías
y vídeos administrables utilizan R2. Las entregas vigentes están en
[Fase 5](../docs/SUPABASE_PHASE_5.md), [Fase 6](../docs/SUPABASE_PHASE_6.md) y
[Home remoto](../docs/R2_HOME_IMPLEMENTATION.md). Mercado Pago permanece simulado;
la [aceptación de staging](../docs/INTERFACE_PRODUCTION_CLEANUP.md#8-aceptación-en-staging--31-de-octubre)
no habilita cobros ni infraestructura de producción.

La ampliación del [Hero multimedia](../docs/HERO_CAMPAIGNS.md) conserva UUIDs y asociaciones de medios de campañas visibles y ocultas; la respuesta pública omite campañas ocultas y el editor mantiene su contenido completo.

Las direcciones del perfil admiten un [punto preciso opcional por GPS o mapa](../docs/ACCOUNT_DELIVERY_LOCATION.md), privado por propietario y sin cambiar cobertura o tarifas.

- `migrations/`: SQL versionado; no editar migraciones ya aplicadas.
- `audit/preflight.sql`: inventario completo de metadatos para SQL Editor.
- `audit/inventory.sql`: inventario en un solo resultado para CLI/Management API.
- `audit/verify_foundation.sql`: comprobaciones de permisos/RLS e historial,
  de solo lectura y sin exponer filas personales. Incluye los RPC públicos vigentes,
  todos los roles ejecutores de la aplicación, RLS en todas las tablas internas
  y FORCE RLS en las 16 tablas sensibles declaradas por las migraciones; el runner
  SQL local verifica tanto el resultado correcto como la detección de permisos indebidos.
- `tests/`: pruebas exclusivas de una base local desechable. El fixture Auth
  no reproduce el servicio Supabase Auth y nunca se aplica al proyecto remoto.
- `config.toml`: configuración del stack local, con seeds deshabilitadas.
  No enviar el archivo completo al proyecto alojado sin revisar el diff.
- `admin/first-admin.sql`: alta interna por UUID verificado; crear la cuenta
  desde Supabase Authentication, sin pasar por el registro público de clientes.
- `functions/change-email/`: cambio de correo con contraseña actual, sin SMTP.
- `functions/account-recovery/`: recuperación por código guardado de un solo uso,
  sin mensajería. [Funcionamiento y límites](../docs/AUTH_OFFLINE_RECOVERY.md).
- `.temp/`, `.branches/`: cachés generadas ignoradas por Git.

CLI fijada como herramienta de desarrollo en `package.json`. Los tipos reales
están en [database.generated.ts](../src/types/database.generated.ts). La sesión
de CLI se conserva fuera del repositorio por sus mecanismos oficiales.

Pruebas: `npm run test:supabase:sql` (preparación del motor local documentada
en la Fase 2) y `npm run test:supabase:public` (lecturas anónimas del proyecto
configurado, solo URL/clave publicable, sin secretos ni creación de cuentas).

La arquitectura original y el plan de siguientes etapas están en
[Fase 1](../docs/SUPABASE_PHASE_1.md) y [esquema propuesto](../docs/SUPABASE_SCHEMA_PLAN.md).
No ejecutar `db reset` remoto, aplicar fixtures ni migrar IndexedDB sin revisión
y respaldo. El primer administrador utiliza MFA. El entorno independiente de
producción ya está preparado; los pagos reales y la apertura comercial siguen
pendientes. Consultar el [informe vigente](../docs/PRODUCTION_PREPARATION.md).

## Estrategia acordada para producción comercial

**Aroma Infini utilizará Supabase Pro para los respaldos automáticos de
PostgreSQL en producción, con una estrategia independiente para Cloudflare R2.**
Pro y el trabajo de copia R2 en nube todavía no están activados por esta entrega.
El [plan de transición](../docs/BACKUP_PRO_TRANSITION.md) recoge el inventario,
cobertura, costes condicionados, recuperación conjunta y cinco requisitos de
retirada. La tarea local combina ambos entornos; no deshabilitarla entera por
actualizar producción. Conservar copias/DPAPI y desarrollo hasta la autorización
posterior correspondiente. No existe una bandera TOML que contrate o certifique Pro.

## Ensayo de recuperación local

```powershell
npm.cmd run test:recovery:local
```

Utiliza el mismo PostgreSQL portátil de las pruebas SQL (Windows x64), sin instalar
un servicio. Prepara una base nueva en loopback, aplica las migraciones y ejecuta
los contratos. El ensayo añade datos identificados exclusivamente locales, detiene
el motor y copia **todo** el clúster. Compara sus archivos con SHA-256, arranca la
restauración en otra carpeta y puerto, y verifica datos, secuencias y permisos.
No acepta una URL remota, no carga `.env.local` ni `.dev.vars` y no utiliza la
sesión de Supabase CLI. Las carpetas desechables se retiran sólo después de
confirmar la parada de sus propios procesos; los diagnósticos fallidos se conservan.

Es una copia física en frío de la misma versión de PostgreSQL, con un fixture SQL
de Auth. **No es una exportación de Supabase alojado ni prueba recuperación de
GoTrue, JWT, contraseñas, MFA o archivos R2.** No sustituye a `pg_dump`, backups
gestionados o PITR para el entorno alojado. Los resultados quedan bajo
`artifacts/supabase-sql-tests/`, fuera de Git y del build web.

## Qué deberá respaldarse al preparar producción

- Base de datos mediante el mecanismo oficial de Supabase y su verificación de
  restauración en un entorno independiente. Mantener migraciones y comprobar
  propietarios, permisos, políticas RLS y secuencias antes de abrir tráfico.
- Objetos R2 por separado, cotejados con las referencias y manifiestos de la misma
  copia de datos. Recuperar SQL o Git no recupera fotografías o vídeos eliminados.
- Configuración de Auth, funciones, CORS, Worker, dominios y secretos en un canal
  protegido. Los archivos de entorno y las credenciales no pertenecen al backup Git.
- Retención, destino independiente, responsables y objetivos de pérdida de datos
  y tiempo de recuperación acordados antes del lanzamiento. Esta etapa no activa
  servicios de pago ni tareas de copia sobre los recursos alojados.

Fuentes: [copia física PostgreSQL 17](https://www.postgresql.org/docs/17/backup-file.html)
y [backups de Supabase](https://supabase.com/docs/guides/platform/backups).

### Resultado del 31 de octubre de 2026

Ensayo aprobado con PostgreSQL 17.10: 12 guardas de seguridad, 19 migraciones,
470 comprobaciones SQL y nueve comprobaciones de recuperación. Los 1153 archivos
del respaldo local (66.936.679 bytes) coincidieron por SHA-256 antes de arrancar
la restauración. Coincidieron además los datos de 33 tablas, los metadatos de
seguridad y los estados de las secuencias; se verificaron aislamiento entre dos
propietarios y rechazos de acceso privado tras recuperar la copia.

Las tres carpetas de datos de esa ejecución (origen, respaldo y restauración)
se retiraron después de detener sus procesos. Se conservaron únicamente informes
y diagnósticos bajo [artifacts/recovery-2026-10-31](../artifacts/recovery-2026-10-31/).
No se exportaron cuentas ni datos comerciales alojados, no se cambiaron tarifas,
no hubo operaciones R2 y no se creó infraestructura de producción.

## Verificar un paquete de respaldo alojado

```powershell
node scripts/backup-verify.mjs <directorio-del-respaldo>
node --test tests/backup-verify.test.mjs
```

El verificador recibe **archivos ya exportados** mediante herramientas oficiales.
No conecta servicios, obtiene credenciales, ejecuta SQL, restaura, programa copias
ni elimina archivos. Comprueba por streaming tamaños y SHA-256 de los tres SQL y
de cada objeto declarado, incluyendo derivados, medios de borradores y activos
retenidos. Un solo archivo ausente o corrupto hace fallar el paquete.

El paquete necesita `backup-manifest.json` en su raíz. Formato versión 1:

| Campo | Contenido |
| --- | --- |
| `version` | `1` |
| `projectRef` | Referencia de Supabase de veinte letras minúsculas; nunca una clave. |
| `createdAt` | Fecha UTC ISO completa, por ejemplo `2026-11-01T12:00:00.000Z`. |
| `database.tool` / `toolVersion` | `supabase-cli` o `pg_dump` y su versión numérica. Son procedencia declarada; el hash no autentica qué herramienta los produjo. |
| `database.schemas` | `auth`, `app`, `api` y `private`. La exportación real debe incluir sus datos y permisos pertinentes, no limitarse al esquema `public`. |
| `database.files` | Tres entradas: `kind` igual a `roles`, `schema` y `data`; cada una con `path`, `byteSize` y `sha256`. Las rutas relativas comienzan por `database/` y terminan en `.sql`. |
| `media.bucket` | Nombre del bucket exportado. |
| `media.inventorySource` | `same-database-snapshot`: el inventario se obtiene de la misma copia SQL, no de una muestra del catálogo público. |
| `media.assets` | Entradas con `id`, `status` (`ready` o `disabled`) y `objects`. Incluye recursos publicados, asociados a borradores, Home e historial de pedidos. Los archivos de cargas pendientes o ya reclamadas requieren diagnóstico aparte, no se presentan como imágenes comerciales completas. |
| `media.assets[].objects` | De uno a tres objetos con `key`, `path`, `byteSize` y `sha256`. `key` conserva `public/dynamic/<uuid>/<hash-original>/<ancho>.webp` o `…/video.mp4`; `path` es exactamente `objects/<key>`. Cada derivado tiene su propio hash de bytes. |

Los hashes son hexadecimales minúsculos de 64 caracteres y los tamaños, enteros
en bytes. Las rutas son relativas, sin `..`, unidades de Windows, URLs, enlaces
simbólicos, junctions o enlaces duros. No se aceptan rutas repetidas, identificadores
duplicados ni campos de credenciales. Los originales de imagen deben coincidir
con el hash de su ruta; el hash del derivado puede y normalmente debe ser distinto.

El informe contiene únicamente códigos y recuentos. Un resultado aprobado
significa que **los archivos declarados están íntegros**, no que la copia tenga
todas las filas del servidor o que ya se haya restaurado correctamente:
`inventoryCompletenessVerified` y `restoreVerified` permanecen en `false`.
No inspecciona otros archivos ajenos al manifiesto. El paquete contiene datos
sensibles, incluidos datos de Auth; debe guardarse cifrado fuera del repositorio,
del build y del bucket público. Una copia dentro de `artifacts/` no equivale a
retención independiente.

### Procedimiento operativo necesario

1. Usar una exportación oficial coherente de roles, esquema y datos. La ayuda de
   Supabase aclara que el dump predeterminado no incluye datos ni roles y omite
   esquemas administrados; revisar explícitamente el alcance de Auth. No utilizar
   un JSON de la API pública como sustituto de esa copia.
2. Extraer el inventario desde `app.media_assets` y `app.media_renditions` de esa
   misma copia SQL. Descargar todos los objetos estables allí declarados,
   incluidos recursos no visibles en la tienda, y conservar sus claves y hashes.
3. Ejecutar el verificador antes y después de transferir el paquete al destino
   independiente. Proteger por separado secretos, claves de cifrado y configuración
   de Auth/funciones/Worker. Git y una restauración SQL no recuperan objetos R2.
4. Restaurar en otro entorno y comprobar Auth, datos, secuencias, permisos, RLS,
   archivos, asociaciones y consultas. No sobrescribir el proyecto de desarrollo
   como ensayo. Sólo esa prueba permite declarar recuperación completa.
5. Acordar y configurar destino, responsable, periodicidad y retención. Los
   backups alojados, su programación y las alertas no quedan activados por este
   verificador. No se contrató PITR ni otro servicio de pago.

En el cierre del 2 de noviembre de 2026 se prepararon clientes oficiales
PostgreSQL 17.11 y el certificado raíz oficial de Supabase, bajo `artifacts/`.
El motor aislado de ensayos sigue siendo PostgreSQL 17.10; ambos pertenecen a la
misma versión mayor. No se instaló un servicio de base de datos ni Docker.
La conexión real usa TLS con verificación completa y el certificado fijado por
SHA-256. Las credenciales efímeras se obtienen de la salida oficial `db dump
--dry-run`, que se analiza como datos y nunca se ejecuta como shell ni se publica.

Fuentes: [backups Supabase](https://supabase.com/docs/guides/platform/backups),
[dump oficial](https://supabase.com/docs/reference/cli/supabase-db-dump) y
[backup/restauración mediante CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Respaldos protegidos operativos — 2 de noviembre de 2026

Mecanismo **transitorio de producción y vigente para desarrollo**. No se retiró
ni modificó en esta preparación. Su futura simplificación se rige por el
[plan Pro/R2](../docs/BACKUP_PRO_TRANSITION.md), no por el simple cambio de plan.

Se mantienen dos perfiles cerrados, sin aceptar URLs, proyectos o buckets libres:

| Perfil | Supabase | R2 |
| --- | --- | --- |
| Desarrollo | `tkxvexfapszilzhogvgu` | `aroma-infini-media-dev` |
| Producción independiente | `ogpfhhucnaldgxyqajkc` | `aroma-infini-media-prod` |

Producción utiliza el workspace CLI aislado de su preparación. Exportar esa base
no cambia el enlace de desarrollo del repositorio. La copia no escribe catálogo,
pedidos, cuentas comerciales ni objetos R2; la CLI puede renovar su acceso SQL
efímero de administración mediante el mecanismo oficial.

`scripts/backup-development.mjs` exporta roles sin contraseñas SQL, esquema y datos
de `api`, `app`, `auth` y `private`, junto con todos los objetos estables R2
declarados en el mismo snapshot, aunque pertenezcan a borradores. Conserva cada
hash independiente de sus derivados. Incluye huellas del contenido de todas las
tablas en `database-verification.json`, dentro del archivo cifrado.

Cada ejecución crea una carpeta privada, con ACL limitada al usuario actual y
SYSTEM, dentro de `artifacts/protected-backups/`. El ZIP se cifra con AES-256-GCM
y una clave aleatoria protegida mediante Windows DPAPI `CurrentUser`. Se verifica
un descifrado completo antes de retirar el paquete y ZIP en claro. `tar.exe` de
Windows permite las rutas largas UUID/hash sin truncar nombres. No hay archivos
de respaldo en Git, `dist`, el navegador o el bucket público.

Las guardas actuales admiten hasta 1000 activos estables y 512 MiB por paquete;
si se superan, la operación falla en lugar de omitir archivos. Estos límites
deben revisarse cuando crezca el catálogo. Una tarea fallida queda identificada
en el informe; no se considera un respaldo completo.

Comandos manuales desde la raíz del proyecto:

```powershell
$env:DO_NOT_TRACK = '1'
$env:NODE_OPTIONS = '--use-system-ca'
node scripts/backup-development.mjs --confirm-development-export
node scripts/backup-development.mjs --confirm-production-export
node scripts/restore-development-backup.mjs --confirm-local-restore artifacts/protected-backups/<carpeta-creada>
node --test tests/backup-development.test.mjs tests/backup-restore.test.mjs tests/backup-verify.test.mjs
```

La restauración acepta únicamente carpetas de los dos perfiles conocidos y crea
siempre otro clúster PostgreSQL privado en `127.0.0.1`, con puerto y contraseña
aleatorios. Nunca acepta un destino remoto. Recupera los roles con sus otorgantes
originales, preserva `supabase_admin` como usuario bootstrap de PostgreSQL 17,
restaura esquema y datos y compara todas las tablas con las huellas del snapshot.
Comprueba secuencias, claves foráneas, RLS, lectura pública del catálogo y rechazo
de lectura privada anónima. El clúster y los archivos descifrados se retiran
únicamente después de detener su propio proceso y aprobar las verificaciones.
Un fallo conserva diagnósticos privados y nunca se presenta como recuperación
exitosa.

### Tarea diaria de Windows

Tarea: **Aroma Infini - Respaldos locales protegidos**. Frecuencia: **02:00 de
Lima**; se verificó `SA Pacific Standard Time`, UTC−05:00. Usa el usuario actual,
inicio interactivo y privilegios limitados, sin almacenar su contraseña de Windows.
Los procesos se ejecutan ocultos. `IgnoreNew` y un mutex impiden instancias
simultáneas; la duración máxima es una hora. Si se omitió la hora, Windows puede
ejecutarla al estar disponible el equipo y la red.

La tarea ejecuta ambos perfiles y sus restauraciones de prueba. Conserva un
informe sin datos personales en `artifacts/backup-readiness/latest-scheduled.json`.
Puede consultarse también desde el Programador de tareas; el resultado correcto
es `0`. Un perfil fallido no impide comprobar el otro. No se configuró borrado
automático por retención ni se contrataron servicios de pago.

Para reinstalar la misma tarea, sin parámetros arbitrarios:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-protected-backup-task.ps1
```

**Condiciones de operación:** requiere este equipo encendido, la sesión iniciada,
red disponible y sesiones CLI de Supabase/Cloudflare vigentes. DPAPI necesita el
mismo perfil de Windows y sus claves: copiar solamente el ZIP cifrado a otro
usuario no permite abrirlo. La copia local no es off-site ni cubre la pérdida
completa del equipo o del perfil DPAPI. No reproduce GoTrue, claves JWT, pasarelas,
configuración de Auth, funciones desplegadas ni secretos externos: las migraciones
y la configuración versionada deben conservarse y los secretos protegerse aparte.
Restaurar Auth SQL no equivale a certificar el servicio alojado de autenticación.

Fuentes: [GRANT en PostgreSQL 17](https://www.postgresql.org/docs/17/sql-grant.html),
[DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
y [configuración de tareas Windows](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset).
