# Limpieza del proyecto y GitHub — 20 de noviembre de 2026

## Alcance y resultado

Limpieza de archivos con desuso comprobado, sin cambios de diseño, componentes,
reglas comerciales, dependencias, migraciones ni servicios alojados. Rama de
trabajo: `develop`; revisión inicial
`dfd7d3fca49392afd11e0de5868a258f2c929dc7`. El árbol y el índice estaban limpios;
`origin/develop` coincidía tras ejecutar `git fetch origin --prune`.

Se eliminaron **191 archivos preexistentes, 91.213.442 bytes en total
(86,99 MiB)**. Los archivos retirados están enumerados y sus hashes anteriores
conservados en `artifacts/repository-cleanup-2026-11-20/`, ignorado por Git.
Los 189 archivos generados eran locales; dos scripts estaban versionados.

La reducción neta medida en los directorios generados fue de **87.054.242
bytes (83,02 MiB)** en la comprobación posterior al build: las pruebas y esta
auditoría también crean evidencias nuevas. No se confunde el total de archivos
retirados con la variación neta de espacio, ni con el tamaño del historial Git.
El inventario detallado se conserva comprimido sin pérdida: aproximadamente
2,1 MB frente a 52,4 MB del JSON original, con comprobación SHA-256.

## Archivos eliminados y comprobación de desuso

| Ruta | Archivos | Bytes | Justificación |
| --- | ---: | ---: | --- |
| `artifacts/npm-cache/` | 86 | 48.184.173 | Caché de descargas de auditorías anteriores; regenerable, sin consumidores ni procesos que la utilizaran. |
| `artifacts/npm-audit-cache/` | 50 | 1.061.111 | Caché npm de auditoría, sin entradas utilizadas por código, documentación o CI. |
| `artifacts/cache-worker-audit-tmp/` | 24 | 1.100.702 | Transformaciones temporales de Playwright; no contiene código fuente ni configuración vigente. |
| Cuatro carpetas `artifacts/font-cache-contract-*` anteriores | 11 | 1.439 | Fixtures de ejecuciones concluidas; la prueba crea una carpeta aleatoria nueva y no reutiliza las antiguas. |
| `artifacts/final-full-suite/` | 5 | 14.966.162 | Resultados fallidos del 8 de octubre, sin consumidores; sustituidos por la regresión funcional aprobada de esta intervención. |
| `artifacts/full-regression-results/` | 13 | 25.897.002 | Resultados fallidos del 8 de octubre; mismos criterios y comprobación de los recorridos actuales antes de retirarlos. |
| `scripts/prepare-gallery-photos.mjs` | 1 | 1.998 | Generador puntual sin argumentos ni consumidores; depende de originales inexistentes y rutas absolutas de otra computadora. |
| `scripts/prepare-product-photos.mjs` | 1 | 855 | Generador puntual de cuatro imágenes, con los mismos problemas y sin participación en build, pruebas ni despliegue. |
| **Total** | **191** | **91.213.442** | |

Las cuatro carpetas de fuentes retiradas terminaban en `F1KRwe`, `g3EU89`,
`PH4hWK` y `uj9B0K`. Se conservaron los WebP que produjeron los dos scripts
retirados: siguen utilizados por adaptadores, recursos públicos y pruebas.

Se buscaron referencias en código, scripts, pruebas, documentación, workflows
y herramientas históricas de `artifacts`. Los inventarios antiguos que nombran
un archivo no se trataron como un consumidor funcional. Cada archivo local
retirado se comprobó por ruta absoluta dentro del workspace, tamaño y SHA-256.
No hubo borrado recursivo general, seguimiento de junctions, reset ni limpieza
del historial Git.

## Estructura conservada

| Ruta | Función y decisión |
| --- | --- |
| `src/` | React, dominio, servicios y estilos: conservar íntegramente. |
| `worker/` | API, Auth/MFA, entrega privada R2, SEO y tareas programadas: conservar. |
| `supabase/` | Configuración, 49 migraciones históricas y pruebas SQL: conservar. No se ejecutaron migraciones ni resets. |
| `public/` | 210 recursos públicos, fotografías, vídeos, fuentes, licencias y convenciones del hosting: conservar. |
| `tests/` | Pruebas funcionales, seguridad, contratos y fixtures: conservar todos los archivos. |
| `scripts/` | 82 herramientas de mantenimiento, build, respaldo y despliegue después de retirar únicamente los dos generadores obsoletos. |
| `.github/` | Tres workflows de calidad, staging y producción: conservar sin modificaciones. |
| `.agents/` | 103 archivos de skills y referencias: conservar. |
| `docs/` | Guías operativas, procedencia y decisiones históricas: conservar mediante su índice, sin mover rutas. |
| `node_modules/` | Dependencias instaladas necesarias: conservar e ignorar en Git. |
| `dist/` | Build regenerado y validado; conservar para preview/empaquetado e ignorar en Git. |
| `.wrangler/state/` | 18 archivos de estado persistente local, sin cambios de tamaño ni fecha respecto al inventario inicial: conservar. |
| `artifacts/` restante | Evidencias finales, trazas útiles, paquetes base/candidatos, herramientas y diagnósticos que no se demostraron prescindibles: conservar e ignorar. |

No se elimina `artifacts/supabase-sql-tests/` indiscriminadamente: contiene
aproximadamente 10,47 GiB de clústeres diagnósticos locales que el runner conserva
expresamente. Tampoco se alteran respaldos protegidos, originales, perfiles de
navegador ni el Excel entregado en `artifacts/import-perfumes-2026-11-20/`.
Las carpetas de respaldos con ACL protegida se excluyeron de la inspección; no
se cambiaron permisos para acceder a ellas.

Se conservaron capturas idénticas que acreditan estados antes/después. También
se conservó un directorio de trazas incompletamente duplicado en su ZIP: sólo
68 de 97 recursos coincidían; borrar la carpeta completa habría perdido datos.

Las dos copias de `media-default-inventory.json` son deliberadas: tienen
consumidores diferentes en cliente/Worker y una prueba exige su igualdad.
No se retiró ninguna dependencia: las 11 de producción y 22 de desarrollo
tienen usos comprobados, incluidos tipos y herramientas de prueba. Los árboles
de `npm ls --depth=0` y `npm ls --all` resultaron correctos; el lockfile no cambió.

## Git, credenciales y exclusiones

Las reglas existentes ya excluían dependencias, `artifacts`, builds, resultados,
cachés, estado local de Wrangler/Supabase, tipos generados y credenciales.
Se añadieron exclusivamente:

```gitignore
/.eslintcache
/.prettiercache
/npm-debug.log*
```

Se comprobaron **28 casos positivos y negativos**. Código, recursos públicos,
migraciones, skills, workflows y ejemplos siguen siendo versionables.
`.env.example` y `.dev.vars.example` permanecen incluidos; los archivos locales
reales siguen ignorados y sus hashes no cambiaron.

En los 1.365 archivos versionados iniciales no había carpetas generadas ni
credenciales reales detectadas. La comparación con secretos locales no encontró
coincidencias; cinco coincidencias de patrones genéricos eran fixtures sintéticos
de pruebas de seguridad. No se publicaron sus valores ni se encontró evidencia
que exigiera rotación. Esta comprobación del árbol actual no acredita una
auditoría exhaustiva de todos los secretos posibles del historial remoto.

La limpieza deja 1.364 archivos versionables: elimina dos scripts y añade este
informe. El commit contiene exclusivamente cinco rutas: `.gitignore`,
`docs/README.md`, este informe y las dos eliminaciones de scripts. No incluye
ningún archivo local de credenciales ni contenido de `artifacts`.

## Validaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| TypeScript | Aprobado; aplicación, herramientas y Worker. |
| ESLint | Aprobado, cero advertencias de ESLint. |
| Pruebas Node | 216 aprobadas. |
| Navegación, fotos, importación Excel, Home, páginas institucionales, entrega y checkout | 65 aprobadas en Chrome, con transportes y datos locales aislados. |
| Contratos de medios, comercio, push/criptografía y SEO | 366 aprobados en las cinco suites. |
| Playwright | 26/26 configuraciones válidas; 2.329 entradas descubiertas. Descubrimiento, no ejecución íntegra de esas 2.329 entradas. |
| Build staging | Aprobado. El proceso vigente omite 162 copias predeterminadas de `dist` tras verificar sus referencias; no borra originales de `public` ni objetos de R2. |
| Sello Worker | Aprobado, 192 archivos comprobados. |
| Wrangler staging `deploy --dry-run` | Aprobado; compila/empaqueta sin subir ni activar versiones. |
| Supabase CLI | Versión instalada 2.122.0 ejecutable; configuración y migraciones conservadas. No se conecta ni modifica la base para esta limpieza. |
| Recursos y referencias | 69 referencias literales a recursos públicos y 741 archivos de código revisados, sin referencias rotas demostradas. |
| Dependencias y Git | Árbol de dependencias correcto, sin generados versionados ni cambios funcionales adicionales. |

Son **647 ejecuciones de pruebas aprobadas** entre Node, navegador y contratos;
no se presentan como una regresión alojada ni como toda la suite de CI.
La comprobación visual de los recorridos incluye anchos desde 320 hasta 1920 px;
no modifica el diseño para superar las pruebas.

Se conservan también los incidentes de ejecución: el primer intento de contratos
tuvo tres fallos de compilación por «Acceso denegado» del sandbox de esbuild;
la ejecución autorizada pasó íntegramente, sin cambiar código, timeouts ni
reintentos. Tras completar los 65 casos de navegador se cerró exclusivamente
el proceso Vite de pruebas en 5373, cuyo cierre había quedado esperando. El
runner terminó con código 0; no se terminó ningún servidor de desarrollo ajeno.

## Publicación y límites

El flujo revisado publica `develop` exclusivamente en staging, después de sus
validaciones completas. Producción requiere despacho manual desde `main`,
habilitación y confirmación explícita; no se modificó ni se activó desde esta
intervención.

El commit de limpieza se publica con avance normal a `develop`, sin force push.
La comprobación posterior de SHA y rutas remotas queda en `github-after.json`,
dentro de las evidencias locales. La ejecución de Actions es asíncrona: un push
confirmado no demuestra que haya terminado su validación o despliegue. Su estado
observado se registra aparte; no se presenta como aprobado antes de finalizar.
Los scripts eliminados desaparecen del árbol nuevo de `develop`, pero permanecen
recuperables en commits históricos; no se reescribió ninguna rama.

Quedan conservados para revisión futura los clústeres diagnósticos, respaldos
protegidos y evidencias históricas sin obsolescencia demostrada. No se dejan
dependencias supuestamente innecesarias ni pruebas/configuraciones abandonadas
sin señalar: no hubo evidencia suficiente para retirarlas con seguridad.

## Evidencias locales

`artifacts/repository-cleanup-2026-11-20/` incluye inventario comprimido,
manifiestos de eliminación con hashes, comprobación de credenciales, conservación
de archivos, casos de `.gitignore`, logs de calidad/build/contratos, resultados
funcionales, descubrimiento de Playwright y verificaciones Git. Es información
local ignorada, no parte del código que se publica en GitHub.

Referencia de empaquetado: [Wrangler y `--dry-run`](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
