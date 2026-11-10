# Supabase — Fase 2: base de datos inicial aplicada

**Informe del punto de control inicial.** La autenticación, el administrador y la corrección de compatibilidad del Auth alojado se completan en [Fase 3](SUPABASE_PHASE_3.md). Los pendientes de este informe corresponden a su fecha de cierre.

27 de octubre de 2026. Destino de desarrollo: **`aroma-infini-dev`**.

**Estado: tres migraciones de base aplicadas al proyecto dev y tipos obtenidos
del esquema real.** Esta etapa prepara identidad, lectura pública del catálogo
y sus restricciones. No equivale todavía a una tienda conectada ni a una
certificación de producción: el SDK y los adaptadores reales del frontend aún
no están activados.

El diseño aprobado no se ha modificado. Mercado Pago continúa **simulado** por
indicación del cliente. No se conectaron R2, Supabase Storage ni una pasarela
real; no se crearon cuentas administrativas ni se importaron productos,
clientes, pedidos o reseñas de demostración a la base comercial.

## 1. Qué se comprobó antes y después

| Comprobación | Resultado |
| --- | --- |
| CLI | Supabase CLI **2.122.0**, autenticada por el propietario. No se incorporan sus credenciales al repositorio, la documentación o las respuestas públicas. |
| Motor remoto | PostgreSQL **17.11**. |
| Preflight remoto | No existían los schemas `app`, `api`, `private`, roles de aplicación ni tablas comerciales de esta instalación. Se inspeccionó antes de aplicar; no se reemplazaron objetos ajenos. |
| Migraciones | Dry run revisado y después aplicación de las tres migraciones identificadas abajo. El historial remoto de migraciones quedó creado. |
| Inventario posterior | `app`, `api` y `private` existentes; **14 tablas** de aplicación, todas con RLS habilitado. Perfiles, direcciones y membresías también tienen `FORCE ROW LEVEL SECURITY`. |
| Roles ejecutores | `aro_api_executor` y `aro_profile_bootstrap`: sin login, superusuario, creación de roles ni `BYPASSRLS`. No son dueños de las tablas operativas y los roles del navegador no heredan su membresía. |
| Data API | Se expone únicamente **`api`**. `app` y `private` permanecen fuera de los schemas expuestos. |
| Tipos | [database.generated.ts](../src/types/database.generated.ts), generados desde los schemas `api` y `app` del proyecto alojado, no redactados a mano para simular introspección. |

La configuración remota se actualizó usando un archivo **parcial**, limitado
a la lista de schemas de la Data API: `public, graphql_public → api`. Se revisó
el diff antes de enviarlo. Las trece propiedades existentes únicamente en la
configuración remota —incluidas las relacionadas con Auth, SMTP y Storage— no
se sobrescribieron con los defaults del archivo local completo.

El archivo [config.toml](../supabase/config.toml) es la configuración del stack
local. No debe utilizarse para un `config push` completo sobre dev sin revisar
su diff: que un ajuste local exista no demuestra que sea el valor real del
Dashboard remoto.

Evidencias de esta etapa:

- `artifacts/supabase-phase-2-2026-10-27/remote-before.json`.
- `artifacts/supabase-phase-2-2026-10-27/migration-dry-run.log`.
- `artifacts/supabase-phase-2-2026-10-27/migration-apply.log`.
- `artifacts/supabase-phase-2-2026-10-27/remote-after.json`.
- `artifacts/supabase-phase-2-2026-10-27/api-config-diff.log` y `api-config-apply.log`.

Los archivos de artifacts son evidencia local ignorada por Git; no sustituyen
las migraciones versionadas ni un respaldo comercial. El inventario técnico
no constituye una prueba de registro, correo, MFA o pago reales.

## 2. Migraciones aplicadas

| Migración | Contenido |
| --- | --- |
| [20261027000000_bootstrap.sql](../supabase/migrations/20261027000000_bootstrap.sql) | Schemas separados, roles ejecutores acotados, permisos iniciales y helper de fechas. Aborta ante nombres existentes sin revisar. No altera defaults de `public`, `auth` o extensiones ajenas. |
| [20261027000100_identity_foundation.sql](../supabase/migrations/20261027000100_identity_foundation.sql) | Perfiles, una dirección actual por propietario, membresía administrativa protegida, helpers de identidad/AAL y RPC propias. Trigger de perfil tras alta de Auth, sin conceder roles desde metadata. |
| [20261027000200_catalog_foundation.sql](../supabase/migrations/20261027000200_catalog_foundation.sql) | Marcas, productos, variantes, familias/notas, referencias de medios, galería, recomendaciones, ofertas y configuración mínima; restricciones, lectura pública acotada y SKU de producto transaccional. |

Los únicos registros iniciales de referencia son las ocho familias olfativas
ya contempladas por la aplicación y la configuración mínima con Complementos
deshabilitado. No son marcas, productos ni ventas inventadas. No se insertaron
tarifas de envío procedentes de mocks.

Quedan para las etapas correspondientes los comandos administrativos de
escritura de catálogo, Home y promociones, cupones/redenciones, favoritos,
pedidos y sus snapshots, importaciones, inventario comercial y pagos. No se
reconstruyen lotes de trabajo.

## 3. Superficie de acceso instalada

Solo las siguientes funciones de `api` reciben permisos explícitos:

| Acceso | RPC | Alcance |
| --- | --- | --- |
| Anónimo y autenticado | `catalog_products(p_limit, p_offset)` | Catálogo publicado con cantidad total y página acotada; máximo 100 registros por solicitud. |
| Anónimo y autenticado | `catalog_product(p_slug)` | Un producto publicado por slug o NULL. |
| Anónimo y autenticado | `catalog_brands()` | Marcas activas, sin estado administrativo completo. |
| Autenticado | `current_actor()` | Propia identidad, membresía y necesidad de completar MFA. No enumera administradores. |
| Autenticado | `get_profile()`, `update_profile(...)` | Perfil del `auth.uid()` actual. No acepta un propietario arbitrario, contraseña ni rol. |
| Autenticado | `get_address()`, `save_address(...)`, `remove_address()` | Dirección del propietario actual; no permite reasignarla a otro usuario. |

El navegador no tiene CRUD directo sobre las tablas base ni permiso para
consumir la secuencia de SKU. El acceso público pasa por DTO limitados; conocer
los nombres de tablas en los tipos TypeScript no concede acceso a ellas.

### RLS y funciones

- Las políticas de perfiles y direcciones filtran por `auth.uid()`, tanto en
  lectura como en escritura. Las comprobaciones locales probaron A frente a B
  usando el ejecutor real sin privilegio de bypass, además del rol del navegador.
- La membresía administrativa reside en `private.admin_memberships`. Un campo
  `role` de metadata, email conocido o flag del navegador no puede concederla.
- `private.is_admin()` exige membresía activa y AAL2. AAL1 se identifica como
  pendiente de MFA y una revocación se observa sin esperar a renovar el JWT.
  Esto prepara la autorización SQL; aún falta conectar y probar el desafío
  MFA real del panel con Supabase Auth.
- Las funciones definidoras tienen dueño ejecutor distinto del dueño de las
  tablas, `search_path` vacío y nombres de objetos cualificados. Las funciones
  internas no reciben EXECUTE de los roles del navegador.
- **Precaución con los defaults:** `ALTER DEFAULT PRIVILEGES ... IN SCHEMA`
  no cancela por sí solo el EXECUTE concedido globalmente a `PUBLIC` por
  PostgreSQL. Cada función creada revoca permisos explícitamente y vuelve a
  conceder solo los necesarios. Las futuras migraciones deben repetir y
  comprobar ese patrón; no basta confiar en RLS o en el schema no expuesto.

No se creó un endpoint universal con clave privilegiada ni una función que
acepte SQL, rol o propietario libres del navegador.

## 4. Reglas del catálogo conservadas

- SKU de producto de cinco dígitos mediante secuencia `10000–99999`, UNIQUE y
  sin reciclaje de huecos tras rollback; el SKU comercial de variante es otro
  identificador, opcional y único cuando existe. No se usa `max + 1`.
- Publicación condicionada por marca activa cuando corresponde, fotografía
  principal verificada, precios positivos y stock en una presentación activa.
  Complementos conserva su feature flag desactivado.
- Al agotarse las variantes activas, el producto se desactiva. Reponer stock
  no lo republica automáticamente.
- La comprobación de disponibilidad es diferida al estado final de la
  transacción: reemplazar una presentación por otra con stock no desactiva
  accidentalmente el producto por un estado intermedio.
- Hasta cuatro fotografías comerciales ordenadas; la imagen olfativa es un
  FK independiente y no añade una quinta imagen a la galería. La publicación
  conserva la exigencia actual de una imagen principal, sin imponer cuatro.
- Medios como referencias, sin BLOB ni data URI/base64. Una referencia marcada
  `ready` exige verificación; esto no implementa una subida permanente a R2.
- Familia olfativa múltiple, con orden estable y vocabulario existente. Los
  complementos no reciben notas, intensidad ni clasificación olfativa.
- Una oferta por producto, validada contra todas sus presentaciones activas,
  incluidas las agotadas. El precio final público se calcula en SQL con fechas
  del servidor; una oferta vencida no conserva una rebaja ficticia.

Las cotizaciones y pedidos comerciales aún no están implementados en servidor.
La lectura pública de precio/stock no constituye una reserva ni una garantía
de venta; será necesario revalidarlos dentro de la transacción de compra.

## 5. Pruebas SQL locales ejecutadas

Se utilizó PostgreSQL **17.10 nativo** en Windows x64, en una base desechable
creada por el runner. El proceso escucha únicamente en `127.0.0.1`, con puerto
y credencial aleatorios; no instala un servicio de Windows ni acepta un
`DATABASE_URL` o destino remoto.

Resultado: **72 comprobaciones SQL aprobadas**, tres migraciones aplicadas en
esa base y **100 asignaciones concurrentes de SKU mediante 10 conexiones**,
todas únicas y dentro del rango permitido. Las filas de prueba de usuarios,
perfiles, membresías y catálogo quedaron revertidas.

Se probaron, entre otros casos:

- Anónimo sin acceso a perfiles, membresías o escritura comercial.
- Cliente A sin lectura/modificación de B; propietario no reasignable.
- Metadata administrativa falsa sin escalada, rol autenticado sin identidad,
  AAL1, AAL2, membresía revocada y ejecución directa de helpers denegada.
- DTO público sin borradores, productos agotados, fotos pendientes o
  Complementos mientras su flag permanece deshabilitado.
- Nombres de marca duplicados normalizados, stock negativo, publicación a
  precio cero, referencias base64 y galería fuera de sus cuatro posiciones.
- Ofertas inválidas/vencidas, familia múltiple e imagen olfativa independiente.
- Agotado automático, reposición sin republicación y reemplazo transaccional
  de variantes sin desactivación intermedia.

Evidencia: `artifacts/supabase-sql-tests/latest-result.json`; cada ejecución
conserva también su reporte, hashes de migraciones y logs en una carpeta
`run-*`. Los incrementos de una secuencia no se revierten con `ROLLBACK`, por
lo que esta suite debe ejecutarse solo en la base desechable del runner.

### Qué no prueba este entorno

[standalone-auth.sql](../supabase/tests/fixtures/standalone-auth.sql) es un
fixture exclusivo de pruebas. Proporciona una tabla `auth.users` mínima y
helpers `auth.uid()`/`auth.jwt()` alimentados por claims del test. **No ejecuta
GoTrue, valida firmas de JWT, envía correos ni comprueba un factor TOTP real.**
Permite comprobar las políticas, grants y funciones con el motor PostgreSQL
real; no permite afirmar que el login, SMTP o MFA del proyecto alojado estén
completados. El fixture rechaza un schema `auth` ya existente y requiere un
marcador de test que el runner establece exclusivamente en su conexión local.
No es una migración y nunca se aplica al proyecto Supabase remoto.

### Repetir la suite aislada

Desde PowerShell en la raíz del proyecto, Windows x64:

```powershell
npm.cmd install --prefix artifacts/supabase-sql-tools --no-save embedded-postgres@17.10.0-beta.17 pg@8.23.1
node scripts/test-supabase-sql.mjs
```

La instalación queda bajo `artifacts`, sin añadir estas herramientas al bundle
del frontend ni instalar un servidor del sistema. Para reutilizar la carpeta
de herramientas de esta revisión:

```powershell
$env:SUPABASE_SQL_TOOLS_DIR = 'artifacts/supabase-phase-2-2026-10-27/sql-tools'
node scripts/test-supabase-sql.mjs
```

El runner prepara el Auth fixture, aplica las migraciones ordenadas, ejecuta
[001_identity_catalog.sql](../supabase/tests/001_identity_catalog.sql), comprueba
concurrencia y rollback, y detiene el proceso de PostgreSQL al terminar. Retiene
únicamente su nueva carpeta local para diagnóstico; no borra bases existentes.
En Linux/macOS será necesario un runner equivalente o el stack oficial local
de Supabase. No cargar el fixture standalone sobre un stack que ya tiene Auth.

## 6. Verificaciones de aplicación y acceso remoto

Las verificaciones remotas de [verify_foundation.sql](../supabase/audit/verify_foundation.sql)
aprobaron diez condiciones: RLS, roles restringidos, ausencia de CRUD del
navegador, esquemas internos cerrados, funciones con permisos explícitos y
`search_path` fijo, separación de propietarios y trigger de perfil. Se comprobó
el historial con las tres versiones aplicadas y cero perfiles, direcciones,
membresías, marcas y productos creados por esta etapa.

El script [verify-supabase-public.mjs](../scripts/verify-supabase-public.mjs)
aprobó **12 comprobaciones HTTP reales**: catálogo/marcas públicos (200),
producto inexistente (NULL), límite de página (400), RPC privadas denegadas
al anónimo (401), schemas `app`/`private`/`public` no expuestos (406), ausencia
de tablas CRUD en `api` (404) y petición sin API key denegada (401). No usa
Secret key ni tokens de CLI, crea cuentas o ejecuta escrituras.

Typecheck, lint y build aprobados. La regresión seleccionada de Playwright
aprobó **111/111 pruebas** con dos workers en aproximadamente 1,6 minutos:
auth-interfaces, auth-admin-feedback, account, checkout, technical-data-boundaries,
seo-routing, product-auto-sku, product-discounts, order-workflow-domain,
order-workflow-service, shipping-operations y admin-brand-batch. Incluye
interfaces de acceso a 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844,
teclado, validaciones, SKU, precios, marcas y operaciones de pedidos.

Estas pruebas de aplicación conservan adaptadores aislados y el checkout local
simulado; no certifican GoTrue ni checkout remoto. Las comprobaciones SQL y
HTTP están separadas para no confundir la regresión del frontend con una
integración de Auth terminada. El dry run final informó «Remote database is
up to date». Los hashes de las tres migraciones coinciden con los de la última
ejecución SQL aprobada.

Logs en `artifacts/supabase-phase-2-2026-10-27/`: `typecheck.log`, `lint.log`,
`build.log`, `baseline-tests.log`, `sql-final.log`, `public-api-checks.log`,
`remote-verification.json` y `migration-final-check.log`. Se conserva el aviso
de chunks grandes de Excel/PDF de la compilación anterior; la CLI añadida es
una dependencia de desarrollo y no se incluye en el bundle de la tienda.

La conexión funcional del frontend sigue pendiente de la etapa 3. Sus guards,
layouts y adaptadores actuales permanecen; la existencia de RPC y tipos no
activa por sí sola sesiones reales ni sustituye el catálogo local visible.

## 7. Continuación segura

1. Conectar `@supabase/supabase-js` mediante URL y publishable key públicas,
   adaptadores actuales y tipos generados. Mantener las pantallas aprobadas,
   solo email/contraseña y sin Google OAuth.
2. Completar callback/confirmación, refresh, recuperación y cierre de sesión;
   probar usuarios A/B reales de desarrollo sin reutilizar las identidades del
   fixture SQL. Configurar las URLs y comprobar SMTP sin sobrescribir sus ajustes.
   La inspección encontró `site_url` en `http://localhost:3000`, redirect en
   `http://localhost:5173/**` y mínimo remoto de ocho caracteres con requisitos
   de composición; el formulario actual exige doce. Estos ajustes se conservaron
   en esta etapa y deben reconciliarse con los orígenes/callbacks y validaciones
   del adaptador real antes de habilitar registro o recuperación.
3. Autorizar el primer administrador por UUID desde un procedimiento
   privilegiado controlado; completar MFA y verificarlo también en operaciones
   HTTP directas. No se ha creado esa cuenta durante esta etapa.
4. Conectar consultas de catálogo y comandos administrativos de forma
   progresiva, sin fallback silencioso a mocks cuando falle Supabase. Un error
   remoto no debe convertirse en un éxito local ni perder borradores.
5. Revisar y migrar únicamente datos comerciales confirmados, con mapa de IDs,
   SKU y referencias de fotos. No importar automáticamente IndexedDB ni fixtures.
6. Implementar pedidos/cotización/inventario y su idempotencia antes de admitir
   compras reales. Mercado Pago seguirá simulado en desarrollo; un `approved`
   elegido en el navegador no consume inventario ni confirma un pago real.
7. Definir política y vencimiento de reservas antes de habilitarlas. R2,
   webhooks de pago real y operación comercial de producción permanecen fuera
   de esta entrega; no se prometen resueltos por las tablas iniciales.

### Migraciones y tipos posteriores

Con la CLI autenticada en un entorno local seguro y el proyecto dev enlazado:

```powershell
npx.cmd supabase migration list --linked
npx.cmd supabase db push --linked --dry-run --skip-vault
```

Revisar el SQL, diff e impacto antes del `db push` efectivo de una nueva
migración. No editar las tres migraciones ya aplicadas: cualquier corrección
posterior debe ser una nueva migración reproducible. No ejecutar `db reset`
contra el proyecto alojado ni usar una Secret key desde React.

Los tipos se regeneran después de aplicar e inspeccionar el esquema real:

```powershell
npx.cmd supabase gen types typescript --linked --schema api,app > artifacts/database.types.next.ts
```

Revisar el resultado y actualizar `src/types/database.generated.ts` con UTF-8,
seguido de typecheck. En Windows PowerShell antiguo, la redirección puede
producir UTF-16; no copiarla sin comprobar la codificación. Los tipos no contienen
credenciales ni sustituyen RLS. Un entorno de producción posterior deberá usar
otro proyecto, otros usuarios y credenciales, sin datos de prueba.

