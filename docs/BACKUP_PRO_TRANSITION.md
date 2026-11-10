# Transición de respaldos de producción a Supabase Pro

Decisión del propietario y revisión técnica: **4 de noviembre de 2026**.

**Aroma Infini utilizará Supabase Pro para los respaldos automáticos de
PostgreSQL en producción, con una estrategia independiente para Cloudflare R2.**

Estado: **transición preparada; contratación y ejecución pendientes**. Esta
revisión no activó Pro/PITR, creó servicios, modificó fotografías, ejecutó
restauraciones ni cambió la tarea local. Las copias actuales se conservan.

## 1. Entornos e inventario actual

| Entorno | Proyecto Supabase | R2 | Worker |
| --- | --- | --- | --- |
| Desarrollo | `aroma-infini-dev` · `tkxvexfapszilzhogvgu` | `aroma-infini-media-dev` | `aroma-infini-frontend-staging` |
| Producción | `aroma-infini-prod` · `ogpfhhucnaldgxyqajkc` | `aroma-infini-media-prod` | `aroma-infini-frontend-production` |

La consulta de lectura confirmó proyectos activos y organizaciones distintas.
La organización de producción es **`aroma-infini-production`**
(`sbtpwqrzjdgwlewwvusj`). No transferir desarrollo a ella: la suscripción se
aplica por organización, no individualmente a cada proyecto.
[Facturación de Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase).

Inventario local comprobado, sin abrir archivos cifrados o claves:

| Elemento | Resultado |
| --- | --- |
| Tarea de Windows | `Aroma Infini - Respaldos locales protegidos`, habilitada, diaria a las 02:00 de Lima |
| Última ejecución | 4 de noviembre, inicio 08:28; informe final 08:31 de Lima, resultado `0`, ambos entornos aprobados |
| Condiciones | Sesión interactiva, equipo/red disponibles, CLI vigente, privilegios limitados, `IgnoreNew`, máximo una hora |
| Carpetas históricas | 9: cuatro de desarrollo y cinco de producción |
| Archivos cifrados conservados | 8 archivos AES-GCM; aproximadamente 5,46 MB |
| Inventario completo | 51 archivos, 5.639.296 bytes; incluye informes y logs |
| Informes históricos | Exportación: ocho aprobados/uno fallido. Restauración: ocho aprobados/siete fallidos históricos |
| Último informe existente | Exportación y restauración aprobadas para ambos entornos; paquetes temporales en claro retirados |

Los fallos históricos se conservan como diagnóstico; no significan que la última
copia haya fallado. Un informe antiguo indicaba conservación de temporales, pero
la inspección actual de nombres/tipos encontró solo informes en esa carpeta.
No se volvió a descifrar ni a certificar criptográficamente cada archivo durante
este inventario: se distinguen los resultados de ensayos previos y la revisión
de metadatos actual.

Evidencias sin credenciales:
`artifacts/backup-transition-2026-11-04/local-inventory.json`,
`project-isolation.json` y `source-tracking.json` en esa misma carpeta.

## 2. Qué cubrirá Supabase Pro

Pro incluye copias automáticas **diarias** y acceso a los últimos **siete días**
en **Database → Backups**. Elegir una copia diaria puede perder aproximadamente
un día de cambios. Restaurar sobre el proyecto provoca indisponibilidad y
retrocede su base al punto elegido; no hay un tiempo de recuperación fijo.
Los diarios no conservan contraseñas de roles PostgreSQL personalizados.
Eliminar el proyecto también elimina sus backups gestionados.
[Respaldos oficiales](https://supabase.com/docs/guides/platform/backups).

| Recurso | Cobertura y acción adicional |
| --- | --- |
| Datos PostgreSQL | Productos, variantes, ofertas, pedidos, perfiles, direcciones, favoritos, reseñas, reclamaciones y documentos del Home almacenados en SQL |
| Estructura SQL | Tablas, índices, funciones, triggers, roles, permisos y políticas RLS; comprobarlos durante el ensayo |
| Datos de Auth | Registros del esquema `auth`, cuentas y hashes de contraseñas. Distinguirlos de las contraseñas de roles PostgreSQL |
| Objetos R2 | **Fuera del backup**: necesitan su propio archivo y recuperación |
| Archivos de Supabase Storage | Tampoco se recuperan con los metadatos SQL; actualmente los medios comerciales usan R2 |
| Código, funciones Edge y configuraciones externas | Conservar y reconstruir por separado |
| Secretos, ajustes Auth/API y Cloudflare | Custodia y procedimientos propios; no asumir que restaurar SQL los configura |

La guía de clonado diferencia lo que se transfiere con la base de los ajustes
que requieren reconfiguración. Un proyecto nuevo necesita revisar Auth, API,
Realtime y servicios; no asumir que las sesiones JWT siguen siendo válidas.
[Alcance de una restauración a otro proyecto](https://supabase.com/docs/guides/platform/clone-project).

En Free no se debe depender de una garantía de acceso a diarios gestionados.
La documentación de soporte no es uniforme sobre copias previas al upgrade:
verificar las fechas que aparezcan realmente, sin prometer historial retroactivo.
[Free](https://supabase.com/kb/faqs/platform/free-plan-backups),
[disponibilidad después de actualizar](https://supabase.com/kb/troubleshooting/will-backups-be-accessible-from-the-dashboard-immediately-after-upgrading-to-a-paid-plan-hXY4rs).

### Diarios frente a PITR

| Modalidad | Decisión para esta transición |
| --- | --- |
| Diarios de Pro | Base prevista. El negocio debe aceptar la posible pérdida de cambios entre copias |
| PITR | Complemento independiente, con puntos de recuperación más finos; requiere al menos compute Small y tiene coste adicional. No está activado ni autorizado |

PITR permite ventanas de 7, 14 o 28 días y sustituye la modalidad diaria.
Si se exige perder menos de un día de pedidos, hay que evaluar ese coste y
coordinar también la frecuencia de respaldo de archivos. Mejorar SQL por sí
solo no mejora la recuperación de R2.
[PITR](https://supabase.com/docs/guides/platform/backups#point-in-time-recovery),
[ventanas y costes](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery).

## 3. Estrategia independiente para R2

**Propuesta, todavía no implementada ni contratada:** un Worker exclusivo de
respaldos, programado en la nube, que copie incrementalmente a un bucket privado
separado. Nombre propuesto: `aroma-infini-media-backup-prod`. No depende de una
sesión de Windows; no se añade al Worker público de la tienda.

El alcance debe incluir originales preparados y derivados de productos,
imagen olfativa, Home, Hero/banners, categorías, recomendador, pósteres, vídeos
y archivos de borradores guardados. Inventariar todos los prefijos permanentes;
un tipo desconocido requiere revisión, no una omisión silenciosa. Fotos que
solo están en el PC o en un borrador del navegador no están almacenadas en R2.

Requisitos para la implementación futura:

1. Carga inicial completa y después copias de claves nuevas, sin propagar
   borrados del origen. Conservar la clave original, metadatos, tamaño y SHA-256
   de cada archivo. Un espejo que borre también el destino no protege el historial.
2. Trabajo paginado por lotes, con cursor persistente, reintentos idempotentes y
   concurrencia limitada. No cargar un catálogo entero o un vídeo grande en memoria.
3. Manifiestos fechados con identidad de producción, inicio/fin UTC, recuentos,
   checksums y estado. Marcar `COMPLETE` únicamente al confirmar todos los objetos;
   una ejecución parcial o demasiado antigua debe generar aviso y bloquear el retiro local.
4. Lectura del origen y escritura del archivo de respaldo con identidades
   separadas. Un binding R2 normal no impone solo lectura: para ese aislamiento
   usar credenciales S3 limitadas al bucket y permiso Object Read only del origen.
   El Worker de tienda no debe tener acceso al destino de respaldo.
5. Validación de bytes y ensayo de recuperación. El hash de la carpeta representa
   el master; las variantes WebP tienen su propio SHA-256. ETag no sustituye esa
   comprobación. Los manifiestos que incluyan metadatos SQL internos permanecen privados.

Las APIs soportan enumeración, transferencias en streaming y comprobaciones
de objetos, pero R2 no ofrece todas las funciones de S3.
[API Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[credenciales](https://developers.cloudflare.com/r2/api/tokens/).

### Versionado, retención y aislamiento

No asumir versionado o replicación S3 automáticos: sus operaciones no figuran
como implementadas. Las claves inmutables de Aroma Infini conservan versiones
distintas mientras existan sus objetos; la copia independiente evita perderlas
por limpieza del origen. Super Slurper sirve para una copia inicial/migración,
no sustituye un sistema periódico con historial verificado.
[Compatibilidad S3](https://developers.cloudflare.com/r2/api/s3/api/),
[Super Slurper](https://developers.cloudflare.com/r2/data-migration/super-slurper/).

R2 dispone de **Bucket Locks**, que impiden borrar/sobrescribir durante el periodo
configurado. No es equivalente al Object Lock S3 ni una garantía contra un
administrador capaz de retirar sus reglas. Aplicarlo solo al destino y después
de aprobar su política; no cambiar la limpieza del bucket comercial en esta etapa.
[Bucket Locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/).

Propuesta inicial: conservar los bytes copiados sin poda automática y al menos
35 días de manifiestos. Una futura poda debe respetar todas las referencias
actuales y contar la retención desde la última presencia confirmada por copias
completas, con margen superior al horizonte SQL. **No usar un lifecycle que borre
la copia a los 30 días de subida:** eliminaría imágenes antiguas aún utilizadas.
Los siete días de retirada y las 24 horas de reservas de la aplicación no son
una política de backup.

Un bucket separado en la misma cuenta protege frente a errores de la aplicación,
pero no frente a perder toda esa cuenta/proveedor. Para ese desastre, se propone
un destino bajo otra cuenta o proveedor —por ejemplo, almacenamiento S3 compatible—
y una exportación SQL independiente en hitos críticos. Evaluar esa cobertura y
su presupuesto antes de declararla resuelta; no crear otro sistema diario SQL
duplicado sin justificarlo. Mantener un diario de Pro no protege la eliminación
de todo el proyecto.

### Costes antes de activar

Preferir inicialmente R2 Standard. La tarifa consultada es USD 0,015/GB-mes,
más operaciones; la franquicia Standard incluye 10 GB-mes y límites de operaciones
compartidos con el consumo de la cuenta. No implica que el respaldo sea gratuito.
Presupuestar bytes nuevos/reemplazados, manifiestos, verificaciones, retención y
eventual segundo destino. Los límites de Workers Free pueden exigir otra forma
de ejecución o un plan de pago; medir primero y solicitar autorización.
[Precios R2](https://developers.cloudflare.com/r2/pricing/),
[límites Workers](https://developers.cloudflare.com/workers/platform/limits/).

## 4. Consistencia PostgreSQL–R2 y objetivos de recuperación

SQL guarda identificadores, hashes, variantes y asociaciones; R2 guarda los
bytes. No existe un snapshot transaccional común entre ambos servicios.
Un SQL antiguo puede necesitar una fotografía que la limpieza ya eliminó.
Un archivo extra en R2 no implica que deba añadirse al catálogo restaurado.
[Consistencia de R2](https://developers.cloudflare.com/r2/reference/consistency/).

El punto de recuperación será válido **solo si cada referencia del SQL elegido
tiene un objeto íntegro disponible**. Comparar productos, imagen olfativa,
`product_images`, Home/`home_media`, activos/derivados y referencias que conserva
el historial de pedidos. Conservar claves exactas evita cambiar URLs o romper
las asociaciones.

Una copia R2 diaria tiene hasta aproximadamente 24 horas de retraso desde la
última ejecución completa. Desfases con el horario SQL o fallos pueden ampliar
la pérdida conjunta. PITR a las 14:37 no garantiza tener un archivo subido a las
14:36 si la última copia R2 terminó antes. No prometer un RPO/RTO conjunto sin
ensayo; RPO es pérdida admisible y RTO, tiempo de recuperación objetivo.

Para menor pérdida de archivos se puede añadir copia por eventos y reconciliación
periódica. Asegurar que toda carga publicada ya tiene copia exige un cambio
posterior del flujo de confirmación; no se presume implementado.

## 5. Código, permisos, configuración y secretos

| Elemento | Custodia y recuperación previstas |
| --- | --- |
| Migraciones, funciones Edge/Worker, frontend y lockfile | Repositorio privado con historial y copia remota revisados; conservar versiones de despliegue |
| Roles, permisos, RLS, triggers y funciones SQL | Backup de base y migraciones; comparar después de restaurar, no reaplicar a ciegas todas las migraciones sobre SQL ya recuperado |
| Configuración Auth | Registro de valores no secretos: registro sin confirmación, MFA administrativo, orígenes/callbacks y funciones de recuperación sin SMTP |
| Cloudflare | `wrangler.jsonc`, bindings, buckets, reglas de retención, cron, permisos y futuros dominios; guardar la configuración futura del archivo de respaldo |
| Claves servidor/API, JWT y credenciales de respaldo | Bóveda controlada por el negocio con MFA y recuperación independiente de este PC; no Git, manifiestos públicos, informes ni capturas |
| Servicios externos | Inventario de cuentas, permisos y procedimiento de reconfiguración; conciliar pagos externos cuando Mercado Pago esté integrado |

**Hallazgo actual:** las migraciones, funciones Supabase y herramientas nuevas
están en el workspace, pero todavía no constan como archivos seguidos por Git.
Existe un remoto configurado; eso no demuestra que estas versiones estén allí.
Antes del lanzamiento, el responsable debe revisar y registrar esos cambios en
el repositorio privado. Esta auditoría no creó commits ni realizó pushes amplios.

Los secretos alojados no se recuperan leyendo una lista de sus nombres. Conservar
su custodia segura o un procedimiento autorizado para rotarlos/reconfigurarlos.
Cambiar claves JWT puede invalidar sesiones: verificar clientes, administrador
y MFA, sin desactivar RLS para facilitar la recuperación.

Los archivos DPAPI actuales requieren el mismo perfil Windows y sus claves.
No son portables por copiar el archivo cifrado. Incluyen también una credencial
inicial de administración: no tratarlos como temporales prescindibles. Confirmar
la custodia o sustitución de esa credencial antes de proponer cualquier retirada.

## 6. Qué hacer personalmente al pasar a Pro

1. Entrar a Supabase y seleccionar **`aroma-infini-production`**, verificando
   `aroma-infini-prod` / `ogpfhhucnaldgxyqajkc`.
2. Abrir **Billing → Subscription Plan → Change subscription plan → Pro**.
   Revisar cargos de plan, compute y uso antes de confirmar. No activar PITR,
   réplicas ni otros extras por esta preparación. El cambio de plan es inmediato.
   [Procedimiento oficial](https://supabase.com/docs/guides/platform/manage-your-subscription).
3. Abrir **Database → Backups** del proyecto correcto. Esperar a que existan
   copias completadas; registrar fecha UTC/Lima, estado y retención visible.
   No dar por hechos siete puntos de historial el primer día.
4. Avisar que Pro está activo. Mantener la tarea local mientras verificamos
   varios ciclos, cobertura R2 y el ensayo de recuperación. Recomendación de
   transición: al menos dos ciclos consecutivos válidos; conservar solapamiento
   suficiente para cubrir el historial que se vaya a necesitar.
5. Aprobar por separado presupuesto/destino de R2 y la ventana de ensayo.
   Solo después de las cinco condiciones de retirada, autorizar expresamente
   qué automatismo local se retira. **Pagar Pro no equivale a autorizar esa retirada.**

No existe un cambio de código, variable `Pro=true` o migración SQL que contrate
el plan o certifique sus respaldos.

## 7. Cinco condiciones para retirar la automatización local de producción

| Condición | Evidencia requerida antes de actuar |
| --- | --- |
| 1. Pro activo en producción | Plan/organización/proyecto correctos confirmados por el propietario |
| 2. Respaldos automáticos válidos | Fechas, estado, ventana disponible y sucesivos ciclos comprobados |
| 3. Recuperación comprobada | Ensayo autorizado del procedimiento gestionado, verificaciones SQL/Auth y RPO/RTO medidos |
| 4. Recursos externos protegidos | R2 en la nube con copias completas, ensayo y cobertura del horizonte SQL; código/configuración/secretos con custodia independiente |
| 5. Autorización explícita | Orden posterior del propietario que identifique alcance, fecha y conservación de archivos |

**Hoy no se declara cumplido ese conjunto.** El ensayo PostgreSQL local previo
no demuestra una restauración gestionada Pro.

Al cumplirse las cinco condiciones:

- Guardar el estado y definición de la tarea; hacer una última comprobación de
  las coberturas sustitutas. Ninguna copia local antigua se borra automáticamente.
- Retirar la rama **producción** del runner diario. Mantener los respaldos de
  desarrollo según la estrategia vigente, sin crear dos tareas redundantes.
- La tarea actual ejecuta ambos perfiles. Deshabilitarla entera quitaría también
  desarrollo: hacerlo únicamente si el propietario autoriza además esa parte;
  conservar entonces las herramientas manuales.
- Observar que las tareas de nube siguen completándose y probar la recuperación
  sin este PC encendido. Si falla la sustitución, conservar/reactivar el mecanismo
  anterior con autorización y diagnosticar antes de reanudar operaciones.

| Componente actual | Destino después de la transición validada |
| --- | --- |
| Exportación/restauración diaria local de producción | Prescindible como proceso habitual; Pro cubre SQL y el trabajo de nube cubre R2 |
| `backup-scheduled.mjs`, launcher e instalador Windows | Reducir a desarrollo o retirar tras autorización de toda la tarea; no eliminar ahora |
| Exportador manual, verificador y restaurador | Conservar para auditorías, hitos críticos y recuperación puntual |
| Ensayo PostgreSQL local y sus pruebas | Conservar para migraciones, permisos y recuperación aislada |
| SQL/objetos cifrados históricos, DPAPI y sus informes | Conservar; cualquier eliminación requiere otra autorización y prueba de recuperación/custodia |
| Workspace CLI y ejecutables oficiales de PostgreSQL | Mantener mientras los usen desarrollo o exportaciones manuales; no limpiar por su ubicación en `artifacts/` |

No se proporciona un comando de desactivación inmediata que pueda ejecutarse
por error antes de validar las condiciones.

## 8. Procedimiento de recuperación ante incidentes

1. **Contener.** Designar responsable; cerrar temporalmente escrituras y compras,
   detener limpieza de medios y automatismos con efectos externos en el entorno
   afectado. Preservar evidencia y copias previas. No aplicar estas acciones a
   desarrollo cuando el incidente sea de producción.
2. **Elegir el punto.** Identificar qué se dañó, el backup SQL anterior al incidente
   y los objetos R2 que necesitará. Documentar pérdida posible. Si no hay cobertura
   de archivos, conservar un punto más antiguo o recuperar los bytes que faltan;
   no inventar referencias para aparentar una recuperación completa.
3. **Restaurar SQL.** Preferir un ensayo/destino aislado autorizado. La función
   gestionada **Restore to a New Project** está en beta, requiere plan de pago y
   backup físico y puede generar costes: revisar antes de crear nada. Una
   restauración sobre producción requiere ventana y autorización por su impacto.
   El clonado físico incluye jobs/extensiones con efectos externos (`pg_cron`,
   `pg_net`, wrappers): arrancan al completar la restauración y no se pueden
   excluir ni pausar durante ella. Evaluar ese riesgo **antes** de elegir el clon.
   Si es necesario inspeccionarlos o neutralizarlos antes de cualquier ejecución,
   usar una restauración lógica controlada mediante CLI; esta alternativa no
   transfiere por sí sola la clave raíz de cifrado, por lo que Vault/columnas
   cifradas requieren un procedimiento adicional seguro.
   [Restaurar a otro proyecto](https://supabase.com/docs/guides/platform/clone-project).
4. **Restaurar archivos.** Extraer del SQL recuperado las claves y hashes requeridos;
   buscarlos en el archivo R2 completo. Recuperar en un bucket aislado, con las
   mismas claves, variantes y metadatos. Comparar tamaños y SHA-256 de cada objeto.
   No borrar fotos del origen ni añadir objetos a un estado SQL por su mera presencia.
5. **Reconfigurar y probar.** Verificar migraciones presentes, versiones, FK,
   roles sin privilegios excesivos, RLS, Auth/MFA, sesiones y código de recuperación;
   catálogo/stock/descuentos/pedidos, asociaciones, Home, imagen olfativa y vídeos
   con GET/HEAD/Range. Restaurar secretos/configuraciones desde su custodia segura.
6. **Conciliar.** Cuando exista Mercado Pago real, comparar el estado restaurado
   con el proveedor antes de reintentar operaciones; no cobrar o devolver por
   duplicado por haber retrocedido SQL.
7. **Reabrir.** Solo con comprobaciones aprobadas y aceptación de la pérdida de
   datos; reanudar limpieza y automatismos al final. Registrar el tiempo real del
   ensayo/incidente y corregir el plan.

El primer ensayo Pro/R2 deberá ser autorizado y ejecutado después de activarlos.
Este documento define el procedimiento; no afirma haber restaurado hoy Pro
ni un destino de respaldo R2 que todavía no existe.

## 9. Pendientes y límites de esta preparación

- Activación Pro por el propietario, comprobación de sus copias y aceptación
  de pérdida/tiempo de recuperación. No se garantiza cobertura retroactiva de Free.
- Aprobación e implementación del respaldo R2 en nube, avisos de fallo/antigüedad,
  retención, presupuesto y ensayo. La propuesta no es un servicio funcionando.
- Decidir protección frente a pérdida de cuentas/proyecto, incluyendo custodia
  independiente de exportaciones y secretos. Pro no es un respaldo completo de
  todo el e-commerce; dos buckets en una cuenta comparten parte del mismo riesgo.
- Registrar en el repositorio privado las versiones de código/configuración
  todavía pendientes de seguimiento, sin incluir archivos secretos o backups.
- Autorización posterior para retirar automatismos locales. Hasta entonces,
  tarea, archivos y estrategia de desarrollo permanecen vigentes.

Validación de esta preparación: inventario y configuración de la tarea consultados
en modo lectura, separación de proyectos comprobada y fuentes oficiales revisadas.
`npm.cmd run test:backup`: **41 pruebas aprobadas**, sin exportar ni restaurar
datos alojados; cubren perfiles separados, rutas, checksums y paquetes incompletos.
No se ejecutó una prueba destructiva para simular un servicio aún no contratado.
