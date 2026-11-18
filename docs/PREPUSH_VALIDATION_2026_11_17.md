# Validación antes del push a develop — 17 de noviembre de 2026

## Resultado

Reproducción local completa de los controles de `.github/workflows/quality.yml`:
TypeScript, ESLint, Node, build aislado, auditoría npm, los cuatro grupos
Playwright y PostgreSQL temporal. Todos terminaron con código de salida cero.

Esta comprobación corresponde al árbol de trabajo pendiente de guardar en Git,
partiendo de `develop`, HEAD `7d2f3648e3b149023910a385bf9510f0ebf60d10`.
No se realizó commit, push, despliegue ni cambio en Supabase o R2 alojados.
Las 267 rutas pendientes anteriores se conservaron sin sobrescribirlas.

## Causa y corrección del fallo del footer

El fallo era una carrera en `tests/navigation.spec.ts`, no un footer diferente:

1. React muestra primero el estado de carga mientras prepara el layout.
2. Comprobar cero enlaces sociales también resulta correcto cuando el footer
   todavía no existe.
3. `allInnerTexts()` devuelve inmediatamente `[]` si no encuentra encabezados.
4. La lectura posterior de `textContent()` espera al footer y obtiene el texto
   completo. El snapshot mezclaba así momentos distintos del montaje.

La prueba ahora exige los tres encabezados completos antes de comprobar los
perfiles sociales. Luego obtiene títulos, texto, fondo, tamaño tipográfico y
padding en una única evaluación del navegador.

Se conserva la comparación completa entre Home, Tienda, Marcas, producto y
Contacto, tanto a 390 como a 1440 píxeles. La nueva regresión retiene la carga
de `StoreLayout` con una promesa, comprueba el estado todavía vacío y verifica
el snapshot completo después de liberar el recurso.

No se modificaron `Footer.tsx`, estilos, funcionalidades, datos, timeouts ni
reintentos. Las tres repeticiones diagnósticas fueron ejecuciones completas
adicionales, no reintentos automáticos para ocultar fallos.

## Resultados de las comprobaciones

| Comprobación | Resultado |
| --- | --- |
| Navegación repetida tres veces | 30 ejecuciones aprobadas. |
| TypeScript | Aprobado. |
| ESLint | Aprobado, cero advertencias de ESLint. |
| Formato del archivo modificado | Prettier y `git diff --check` aprobados. |
| Node | 215 pruebas aprobadas. |
| Build de calidad | Aprobado con catálogo local, sin claves y sin publicación. |
| `contracts` | 333 ejecuciones aprobadas. |
| `browser-core` | 1.281 aprobadas y tres capturas manuales omitidas. |
| `browser-accounts` | 169 ejecuciones aprobadas. |
| `browser-commerce` | 260 ejecuciones aprobadas. |
| Configuraciones Playwright | Las 26 del plan aislado ejecutadas, ninguna perdida. |
| PostgreSQL 17.10 local | 44 migraciones y 1.046 comprobaciones SQL aprobadas, incluidos escenarios de concurrencia. |
| Seguridad y consistencia SQL | RLS, permisos, SKU, stock reservado, precios, pedidos y referencias multimedia comprobados en el servidor temporal. |

Total del flujo reproducido: **2.258 ejecuciones aprobadas** entre Node y
Playwright, además de SQL y las 30 ejecuciones diagnósticas de navegación.
Las cifras son ejecuciones; algunas suites comprueban un mismo caso bajo
contratos diferentes. No se presentan como 2.258 casos únicos.

Las tres omisiones ya existían en `admin-audit-capture.spec.ts`: capturas
manuales que requieren `ADMIN_AUDIT_STAGE=before` o `after`. No se añadió
ningún `skip` ni se desactivaron comprobaciones para aprobar el flujo.

Los grupos y compilaciones se ejecutaron en serie, sin editar código durante
las suites. Las pruebas del navegador utilizan aplicación y SDK reales con
transporte interceptado. SQL usa un PostgreSQL nuevo, únicamente en loopback;
sus datos de prueba se revirtieron y el servidor se detuvo al terminar.
No se efectuaron compras, cobros o escrituras alojadas.

## Auditoría de dependencias

`npm audit --omit=dev --audit-level=high` terminó correctamente: no encontró
vulnerabilidades altas o críticas. Señaló dos paquetes, `uuid` y su consumidor
ExcelJS, por una alerta moderada transitiva.

El [aviso oficial de GitHub](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
describe un problema al escribir en buffers suministrados a `v3`, `v5` y `v6`.
En el código de ExcelJS instalado se encontró el uso de `v4`, sin argumentos,
en su generador de reglas de formato. Esto limita la exposición observada en
ese uso revisado; no elimina el aviso del árbol de dependencias.

Se mantiene documentada la actualización compatible pendiente. No se ejecutó
`npm audit fix --force`: la propuesta automática era cambiar ExcelJS a una
versión incompatible. No se alteraron dependencias ni el umbral de CI.

## Git y alcance de la certificación

La consulta pública a GitHub confirmó que `origin/develop` y el HEAD local
partían del mismo commit. La comprobación final verifica además la rama,
el HEAD, los hashes del trabajo anterior y la ausencia de archivos staged.

Las verificaciones se realizaron en Windows con Node 24.18.1 y Chrome local.
GitHub ejecuta los trabajos de navegador en Ubuntu y el trabajo SQL en Windows.
La ejecución de Actions del nuevo commit será la confirmación en ese entorno
limpio, con sus revisiones de Chrome/Node y sus permisos externos. No se puede
garantizar de antemano el resultado de servicios externos o cambios futuros
del registro npm.

Un push a `develop` activa `deploy-staging.yml`. El despliegue depende de que
termine correctamente calidad; el flujo no publica producción. Esta tarea
no ha activado ninguna versión de staging ni producción.

Resultados, logs y comparación de hashes:
`artifacts/prepush-validation-2026-11-17/summary.json` y archivos contiguos.
Estos recursos están ignorados por Git.
