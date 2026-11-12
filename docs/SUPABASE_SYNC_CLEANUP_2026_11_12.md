# Supabase y limpieza del proyecto — 12 de noviembre de 2026

Esta auditoría conserva el trabajo previo sin confirmar en Git. No cambia el
diseño, las animaciones, las reglas comerciales o el historial de migraciones.
No ejecuta resets ni elimina datos alojados. Las operaciones sobre producción
son de lectura; su actualización requiere autorización posterior.

## Estado de los entornos

| Entorno                                 | Proyecto                                     | Historial aplicado | Pendientes del repositorio | Acción                                                            |
| --------------------------------------- | -------------------------------------------- | -----------------: | -------------------------: | ----------------------------------------------------------------- |
| Desarrollo / base utilizada por staging | `aroma-infini-dev` · `tkxvexfapszilzhogvgu`  |              37/37 |                          0 | Auditado nuevamente; no necesitó aplicar migraciones adicionales. |
| Producción cerrada                      | `aroma-infini-prod` · `ogpfhhucnaldgxyqajkc` |              25/37 |                         12 | Solo inspección y preparación; ninguna migración ejecutada.       |

Las 37 migraciones de desarrollo y las 25 de producción se comprobaron contra
las sentencias almacenadas en `supabase_migrations.schema_migrations`, mediante
hashes léxicos que ignoran comentarios y espaciado exterior, conservando el SQL
real y sus literales. No se modificó ni se reparó ese historial.

La sincronización de las seis migraciones más recientes de desarrollo ya se
había completado con autorización en la [revisión anterior](ADMIN_LATENCY_DIAGNOSIS_2026_11_12.md).
Esta auditoría no las vuelve a ejecutar ni presenta la lectura del historial como
un nuevo despliegue de staging o del Worker.

### Comparación estructural y tipos reales

Se reconstruyeron las versiones 25, 31 y 37 en un PostgreSQL nuevo y aislado en
loopback. Los catálogos reales se leyeron en transacciones de solo lectura con
TLS verificado. La comparación incluye columnas y valores predeterminados,
constraints y relaciones, índices, cuerpos de funciones por hash, firmas RPC,
triggers, políticas RLS, propietarios, grants, roles, membresías, secuencias y
privilegios predeterminados. No se comparan OIDs o valores corrientes de las
secuencias, que no identifican la estructura entre instalaciones.

Los objetos de aplicación corresponden a las migraciones aplicadas de cada
entorno. **El catálogo alojado completo no es idéntico al local**; se conservaron
en el informe estricto estas diferencias administrativas:

- Ambos proyectos tienen nueve otorgamientos administrativos adicionales de
  `supabase_admin` a `postgres` para roles internos. Se comprobaron los grantors
  y las opciones de cada otorgamiento, sin confundir filas duplicadas con la
  membresía efectiva. No otorgan esos roles a `anon` o `authenticated`; los grants
  explícitos de la aplicación permanecen intactos.
- Desarrollo contiene además `public.rls_auto_enable()`, su event trigger
  `ensure_rls` y dos grants de ejecución. Es una personalización administrativa
  compatible con el patrón de activación automática de RLS de Supabase. No se
  pudo probar que su cuerpo sea exactamente el predeterminado del proveedor.
  Su propietario es `postgres`, usa `SECURITY DEFINER` con `search_path` limitado
  a `pg_catalog`, devuelve `event_trigger` y actúa sobre creación de tablas en
  `public`. No se eliminó ni se incorporó silenciosamente a las migraciones:
  retirarlo podría suprimir una protección. No se considera una función RPC de
  negocio pendiente de publicar.

  La revisión completa de su cuerpo confirmó que identifica la tabla mediante
  metadatos DDL y cita los dos identificadores con `%I`; no construye SQL con
  nombres sin escapar ni modifica datos, grants o políticas. **Observación:**
  captura cualquier error de `ALTER TABLE` y solo lo registra. La activación de
  RLS para futuras tablas de `public` es, por tanto, de mejor esfuerzo; no debe
  utilizarse como garantía obligatoria de seguridad. Las tablas actuales de
  `app`, `api` y `private` no dependen de ese helper y conservan su RLS explícito.
  Se dejó intacto por ser una personalización administrativa fuera del historial;
  cambiar su tratamiento de errores requiere revisar el impacto sobre la creación
  de objetos en `public`, no una limpieza automática.

Las diferencias de roles gestionados, schema `public`, extensiones y privilegios
globales se conservan separadas de la comparación de objetos propios; no se
ocultan bajo una afirmación de igualdad total.

Los tipos obtenidos directamente de desarrollo con el mismo generador oficial
coinciden con los de la reconstrucción de 37 migraciones. Los **214 contratos
de TypeScript** de la aplicación coinciden semánticamente con esa versión.
Producción coincide con los tipos de su versión de 25 migraciones; le faltan
**41 contratos** de la versión actual. No se sobrescribieron los tipos de la
aplicación con los de producción antiguos. El endpoint alojado de generación
utiliza otra representación para algunos tipos; se conservó esa salida y se
resolvió la comparación utilizando el mismo generador directo y el catálogo real.

Las once comprobaciones de seguridad de la fundación pasan en desarrollo.
En producción pasan diez: `required_public_rpcs_are_available` queda pendiente
porque las RPC añadidas por migraciones posteriores todavía no están allí.
Las comprobaciones de RLS, roles, aislamiento de schemas, ausencia de privilegios
de tabla para el navegador y límites de los definers sí pasan. **Producción no
está sincronizada para recibir el frontend actual.**

Las cuatro RPC públicas actuales ausentes de producción son
`catalog_home_context`, `catalog_brand_previews`, `site_media_document` y
`public_media_aliases`; su ausencia coincide exactamente con la versión 25.

### Migraciones que quedan preparadas para producción

Se conservaron los doce archivos originales, en su orden:

1. `20261105000100_query_media_lookup.sql`
2. `20261105000200_home_catalog_projection.sql`
3. `20261107000100_checkout_lock_order.sql`
4. `20261110000100_atomic_import_preparation.sql`
5. `20261110000200_catalog_authorization_cost.sql`
6. `20261110000300_sales_bestsellers.sql`
7. `20261111000100_admin_trusted_devices.sql`
8. `20261111000200_media_library.sql`
9. `20261111000300_media_builtin_sources.sql`
10. `20261111000400_media_static_vectors.sql`
11. `20261112000100_media_library_page_queries.sql`
12. `20261112000200_admin_catalog_page_projection.sql`

No deben aplicarse aisladamente las dos últimas omitiendo sus dependencias.
Antes de cualquier autorización de producción se necesita un respaldo protegido
actual, comprobar de nuevo el proyecto de destino y el historial, revisar el
dry-run y verificar las mismas doce versiones y sus SHA-256. No se deben copiar
datos, cuentas, productos de prueba ni secretos de desarrollo. No utilizar
`reset`, `migration repair`, seeds o cambios de roles ajenos a los archivos
revisados. Tras aplicar, comprobar estructura, RLS, RPC, tipos y conservación de
datos antes de publicar el frontend correspondiente.

El plan revisable se conserva en
`artifacts/schema-cleanup-2026-11-12/production-migration-plan.json`, junto a un
workdir aislado con los 37 archivos. Su SHA-256 es
`f0a34001b94863f2f7d1f714841e120468b0241851d5321072bf9b45f2916ea7`.
Contiene el comando de dry-run para la siguiente fase, pero **no se ejecutó
`db push`, ni siquiera en dry-run, en producción**. La raíz continúa enlazada a
desarrollo y el workspace histórico de bootstrap no se modificó.

## Limpieza aplicada

### Código

La búsqueda utilizó el AST de TypeScript, resolución de imports, reexportaciones,
imports dinámicos con literales o constantes, rutas `/src` utilizadas por pruebas,
scripts de `package.json`, configuraciones, workflows y entradas del Worker.
Los casos ambiguos se revisaron manualmente; una coincidencia textual ausente no
fue suficiente para borrar.

| Eliminación                                      | Evidencia de desuso                                                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/admin/AdminProducts.tsx`           | Solo reexportaba las dos páginas ya separadas. Ninguna ruta, prueba o consumidor activo lo importaba.                            |
| `src/features/admin/AdminOperations.tsx`         | Solo reexportaba cuatro páginas. Su único import era una entrada diferida que tampoco tenía consumidores.                        |
| `adminRouteModules.operations`                   | El router y la precarga del menú ya utilizan las páginas específicas. No se enumeraba ni accedía dinámicamente a esta propiedad. |
| `loadBuiltinMedia` en `builtin-media-service.ts` | Wrapper sin llamadas; inicio, importador y pruebas utilizan `builtinMediaService.load`.                                          |
| `FinderPreferenceStep`                           | Alias de tipo sin referencias. Se conserva `FinderStep` y todos los contratos utilizados.                                        |

Las páginas reales de Productos, formulario, Marcas, Clientes, Promociones y
detalle de pedido permanecen intactas. Los dos archivos retirados ya eran pequeños
barrels antes de esta limpieza; el diff mayor contra HEAD incluye la separación
previa de módulos y no representa funciones retiradas por esta tarea.

Después de la limpieza no quedan imports relativos sin resolver. Desde 220
entradas de aplicación, Worker, pruebas, CLI y configuración se alcanzan los 319
módulos de ejecución, contenido y tipos revisados. Dos declaraciones `.d.ts`
pareadas se conservan porque el compilador las resuelve implícitamente.

### Temporales

Se eliminaron **2.088 archivos / 77.043.498 bytes (73,47 MiB)**, exclusivamente en
siete directorios internos de Playwright de ejecuciones antiguas:

| Directorio retirado bajo `artifacts/`                                                   |
| --------------------------------------------------------------------------------------- |
| `auth-centered-2026-10-26/test-results/.playwright-artifacts-5`                         |
| `auth-centered-2026-10-26/test-results/.playwright-artifacts-4`                         |
| `admin-performance-2026-11-11/excluded-interrupted-results/.playwright-artifacts-0`     |
| `admin-functional-audit-2026-11-10/panel/initial-test-results/.playwright-artifacts-19` |
| `account-consistency-2026-10-28/test-results/.playwright-artifacts-5`                   |
| `audit-2026-11-04-e2e/results/.playwright-artifacts-14`                                 |
| `security-audit-2026-11-07/mobile-resilience-results/.playwright-artifacts-6`           |

Antes de borrar se comprobaron las rutas canónicas dentro del workspace, ausencia
de enlaces o puntos de reanálisis, conjunto exacto de archivos, fechas y SHA-256
individuales y por árbol. Los informes, trazas finales y directorios padre se
conservaron. No se aplicó un borrado por edad o por extensión. Las cifras son
los archivos retirados, no una promesa de ahorro neto de disco: la auditoría
genera nuevos informes y builds.

### Dependencias y recursos conservados

**Dependencias retiradas: ninguna.** Las once dependencias de ejecución y las
veintiuna de desarrollo tienen consumidores reales, incluidos compilación,
codificación de vídeo, Excel, PDF, QR, pruebas, tipos ambientales y Cloudflare.
No se cambiaron `package.json` o el lockfile.

Los 210 archivos de `public/` se conservaron. No se encontraron duplicados de
bytes o píxeles; imágenes y SVG se pudieron decodificar. Los originales siguen
siendo respaldo de los aliases R2 y entradas de pruebas. Las rutas de galería,
Hero, categorías, familias y `srcset` también se construyen dinámicamente.
Se mantienen fuentes, licencias, pósters, iconos PWA, medios históricos y recursos
de categorías que pueden activarse desde el panel.

Los inventarios `src/content/media-default-inventory.json` y
`public/media-default-inventory.json` son una duplicación intencionada para dos
superficies de ejecución; una prueba verifica su igualdad. No se fusionaron.

Los mocks y datos sintéticos que continúan en `src/mocks`, contenido de pruebas
y adaptadores locales siguen siendo entradas del modo explícito de desarrollo
y de las suites aisladas. No son un fallback de producción ni se importaron a
Supabase. Quitarlos supondría retirar funcionalidad de desarrollo o pruebas.
Mercado Pago simulado, categorías ocultas y herramientas de recuperación siguen
siendo decisiones vigentes; no se consideran abandonadas por su nombre.

| Carpeta / recurso                                        | Motivo de conservación                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src`, `worker`, `supabase/migrations`, `supabase/tests` | Código, contratos, seguridad, historial y pruebas actuales.                                           |
| `public`                                                 | Recursos utilizados, originales de respaldo y licencias.                                              |
| `scripts`, `tests`, `.github`, configuraciones           | Desarrollo reproducible, calidad, recuperación y despliegue.                                          |
| `.agents`                                                | Skills instaladas, registradas en `skills-lock.json`.                                                 |
| `docs`                                                   | Decisiones e informes históricos fechados; sus cifras no sustituyen esta revisión actual.             |
| `dist`, `worker-configuration.d.ts`                      | Salidas generadas requeridas para preview, empaquetado y compilación. Se regeneraron.                 |
| `node_modules`                                           | Dependencias y herramientas necesarias; no se podaron manualmente.                                    |
| `.wrangler/state`                                        | Estado persistente del emulador; no es caché prescindible.                                            |
| Herramientas SQL y clústeres diagnósticos en `artifacts` | El runner conserva explícitamente esos clústeres para diagnóstico; se mantienen junto a sus informes. |
| Respaldos protegidos y workspace de producción           | Recuperación y aislamiento de entornos. No se sortearon sus restricciones de acceso.                  |
| `AROMAINFINI.xml`                                        | Exportación del usuario, ignorada por Git; no se probó una redundancia que justificase borrarla.      |

`.gitignore` ya excluye dependencias, compilaciones, cachés, configuraciones
locales, logs, resultados y exportaciones XML, conservando `.env.example` y
`.dev.vars.example`. No fue necesario ampliarlo. Los recursos de `public/` no
quedan ocultos de Git.

## Pruebas y límites

- TypeScript, generación de tipos Cloudflare y ESLint: aprobados antes y después.
- Builds locales de staging y producción: aprobados. No equivalen a despliegues.
- Pruebas Node: 179/179 antes y 179/179 después.
- Catálogo, autorización y comandos con SDK real y transporte aislado: 52/52.
- Navegación y recomendador, incluidos teclado y tamaños de pantalla: 16/16.
- Builds compilados anterior/posterior: cuatro recorridos, catorce rutas cada
  uno; 28/28 pares de capturas idénticos píxel a píxel, sin errores de chunks,
  imports de desarrollo, desbordamientos o escrituras.
- API pública alojada de desarrollo: 55 comprobaciones, incluidas denegaciones
  de operaciones administrativas y CORS; sin cuentas o registros de prueba.
- Suite SQL completa repetida durante esta auditoría: 37 migraciones, 911
  comprobaciones y pruebas de concurrencia aprobadas en un clúster nuevo
  aislado. La transacción de datos sintéticos se revirtió y el clúster se detuvo.
- Enlaces Markdown locales de README y documentación: 486 comprobados antes
  de añadir este informe, sin destinos ausentes.
- Auditoría npm: salida 0 al umbral alto, pero persisten dos avisos moderados
  preexistentes en ExcelJS → uuid. No se presenta como cero vulnerabilidades;
  la corrección forzada propuesta cambia ExcelJS de forma incompatible y no se aplicó.

La evidencia de esta revisión está en `artifacts/schema-cleanup-2026-11-12/`:
manifiestos de importaciones, dependencias y recursos, hashes de los temporales,
logs y salidas reales de los procesos, capturas y comparaciones de esquema.
No se guardaron contraseñas, tokens o contenido de filas de clientes/pedidos
en esos informes. No se hizo commit, push ni despliegue de producción.
