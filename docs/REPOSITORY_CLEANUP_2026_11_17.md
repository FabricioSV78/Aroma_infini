# Limpieza y organización del repositorio — 17 de noviembre de 2026

## Alcance y protección del trabajo

Revisión local de código, dependencias, recursos, documentación, pruebas,
configuración e historial de Git. No se modificaron producción, Supabase ni
R2. No se ejecutaron migraciones, compras, commits, push, restauraciones ni
limpieza masiva. Las verificaciones con Chrome usan servicios interceptados;
no son pruebas contra datos comerciales alojados.

Punto de partida: rama `develop`, HEAD
`7d2f3648e3b149023910a385bf9510f0ebf60d10`, con 258 rutas modificadas,
eliminadas o nuevas antes de esta tarea. Se conservaron mediante comparación
de sus hashes; las únicas modificaciones posteriores autorizadas afectan
documentación, `.gitignore` y la selección de pruebas.

Evidencias locales: `artifacts/repository-cleanup-2026-11-17/`.
Los archivos de esa carpeta están ignorados, incluyen los inventarios,
resultados y comprobaciones, y no se añaden al repositorio.

## Limpieza aplicada y eliminaciones

- Eliminada únicamente la carpeta vacía `test-results/`: cero archivos y
  cero datos. Las suites actuales escriben sus resultados en `artifacts/`.
- Retiradas 304 ejecuciones duplicadas de 31 archivos de contratos puros
  dentro de la suite general. Sus pruebas y configuraciones específicas
  permanecen. No se eliminó ningún archivo de pruebas.
- Documentación operativa corregida y separada del historial mediante
  `docs/README.md`. Se aclaran la reserva de stock de 15 minutos, los vídeos
  exclusivos de escritorio y el alcance histórico de guías anteriores.
- No se eliminaron archivos fuente, imágenes, vídeos, capturas, migraciones
  ni respaldos: no se demostró su obsolescencia con suficiente certeza.

Las siete eliminaciones que ya aparecían en Git antes de empezar corresponden
a la retirada anterior de la biblioteca multimedia. Esta tarea no las creó
ni restauró; figuran separadamente en la simulación de Git.

## Inventario y decisiones de conservación

Tamaños medidos al comienzo; los resultados generados cambian al ejecutar pruebas.

| Ruta | Función y decisión |
| --- | --- |
| `src/` | Código de React, dominio, servicios y estilos: conservar. Incluye los adaptadores locales y fixtures todavía utilizados. |
| `worker/` | API, seguridad, entrega multimedia y SEO: conservar. |
| `supabase/` | 44 migraciones históricas, pruebas SQL, auditorías y configuración: conservar íntegramente. |
| `public/` | 210 recursos y archivos públicos con consumidores directos, dinámicos, de procedencia o de pruebas: conservar. |
| `tests/` | Pruebas funcionales, contratos, fixtures y seguridad: conservar. |
| `scripts/` | Compilación, auditoría, mantenimiento, respaldo, PDF y recursos: conservar. |
| `.github/` | Tres workflows necesarios para calidad y despliegue: conservar. |
| `.agents/` | 103 archivos de skills y referencias: conservar. |
| `docs/` | Guías e informes históricos con enlaces útiles: conservar y ordenar mediante índice, sin mover archivos. |
| `node_modules/` | Dependencias instaladas, aproximadamente 1,33 GB: conservar; ignorado por Git. |
| `dist/` | Compilación generada, aproximadamente 9,9 MB al inicio: se regenera al validar; ignorado. |
| `.wrangler/` | 18 archivos de estado local persistente, aproximadamente 1,4 MB: conservar; ignorado. No se trató como caché desechable. |
| `artifacts/` | Aproximadamente 23,57 GB de herramientas, PostgreSQL de pruebas, respaldos, snapshots y evidencias: conservar; ignorado. |
| `test-results/` | Directorio generado vacío: eliminado e ignorado para futuras ejecuciones. |

No hay duplicados exactos entre los documentos y recursos públicos revisados.
Los dos `media-default-inventory.json` tienen consumidores diferentes en el
frontend y el Worker; una prueba exige su igualdad. No se unificaron por
nombre. Los vídeos y recursos provisionales siguen utilizados por pruebas y
adaptadores, aunque no sean material comercial definitivo.

El ZIP `artifacts/github-actions-core-2026-11-10/browser-core.zip` contiene
752 entradas que no están íntegramente extraídas en `evidence/`; no es una
copia redundante comprobada. Se conservó. También se preservaron 114 carpetas
de ejecuciones SQL locales con resultados y diagnósticos; no se borraron en
bloque ni se confundieron con la base remota.

El repositorio queda protegido frente a añadir esos resultados, pero esta
tarea no libera los 23,57 GB de evidencias locales. Borrarlos sin una política
de retención específica destruiría respaldos o capacidad de reproducción.
El conjunto versionable ocupa aproximadamente 35,2 MB; el resto de ese
volumen local no formaría parte de `git add .`.

## Dependencias y arquitectura

Se revisaron las 11 dependencias de producción y las 22 de desarrollo.
Todas tienen usos comprobados. `package.json` coincide con el lockfile v3
(560 entradas), y `npm ls --depth=0` y `npm ls --all` no encuentran problemas.
**Dependencias retiradas: ninguna.** No se modificó el lockfile ni se instaló
ningún paquete.

Se conservaron también dependencias utilizadas por herramientas y pruebas:
`sharp`, `pdfjs-dist`, `@napi-rs/canvas`, `qrcode-generator`, `mediabunny`,
`exceljs`, fuentes y paquetes de tipos. `esbuild` y `miniflare` son transitivos
de Wrangler; `rolldown` procede de Vite. No se eliminaron por no aparecer como
imports del frontend.

No se encontraron módulos TS/JS/MJS idénticos en el código revisado. El helper
`rememberMediaAlias()` no tiene consumidores actuales, pero sí referencias
en snapshots de reproducción del importador retirado; se conserva ante esa
dependencia histórica. No se realizó una reorganización que rompa imports.

## Exclusiones de Git y credenciales

`.gitignore` ahora agrupa credenciales, dependencias, compilaciones, estado
local, evidencias, informes, cachés y metadatos del sistema operativo.
Se añadieron `test-results/`, `playwright-report/`, `blob-report/`, `coverage/`,
`.vite/`, `.cache/`, `.npm/`, `.DS_Store`, `Thumbs.db` y `Desktop.ini`.

Se mantienen las exclusiones existentes de `node_modules/`, `dist/`,
`artifacts/`, `.wrangler/`, temporales de Supabase, tipos generados,
`*.tsbuildinfo`, logs y exportaciones locales del código.
Las excepciones `.env.example` y `.dev.vars.example` siguen versionables.
Se comprobaron 22 casos positivos y negativos: el código, medios públicos,
migraciones, workflows y skills no quedaron excluidos.

`.env.local`, `.env.production.local`, `.dev.vars`, `.dev.vars.staging` y
`.dev.vars.production` permanecen locales e ignorados. No se encontraron
archivos de credenciales reales ni directorios generados rastreados en el
árbol actual o en las rutas del historial revisado. Los únicos archivos de
entorno históricos son los dos ejemplos saneados.

Se escanearon por contenido 1.317 archivos versionables y 2.446 blobs de los
22 commits accesibles por las referencias locales. Las 20 coincidencias de
patrones sensibles son valores sintéticos o cabeceras falsas de tests de
rechazo, no credenciales operativas. No se detectó una exposición real que
exija rotación. El análisis de patrones no constituye una garantía absoluta
de ausencia de secretos. No se imprimieron sus valores ni se leyó el contenido
de respaldos protegidos para esta revisión.

## Playwright y validación

Las 26 configuraciones tienen consumidores en el plan aislado y los workflows.
Se comprobaron todas con `--list`, antes y después:

| Medida | Antes | Después |
| --- | ---: | ---: |
| Configuraciones válidas | 26 | 26 |
| Casos únicos por ubicación y nombre | 1.860 | 1.860 |
| Ejecuciones descubiertas entre suites | 2.349 | 2.045 |
| Casos únicos perdidos | — | 0 |

Solo se excluyeron de la suite general contratos sin fixtures de navegador.
Las repeticiones restantes no se retiraron indiscriminadamente: algunas
corresponden a entornos y finalidades diferentes. No se afirma una reducción
de tiempo de CI medida a partir de estos conteos.

| Comprobación final | Resultado |
| --- | --- |
| TypeScript | Aprobado, incluidas aplicación, herramientas y Worker. |
| ESLint | Aprobado, cero advertencias de ESLint. |
| Node | 215 pruebas aprobadas. |
| Contratos Worker, medios, comercio, push y SEO | 333 ejecuciones aprobadas. |
| Catálogo y administración remotos con transporte aislado | 92 pruebas aprobadas. |
| Fotografías, alias y edición de imágenes con Chrome | 26 pruebas aprobadas, incluidas escritorio, laptop, tablet y móvil. |
| Interfaz: cola de fotos, autenticación, diálogos, imágenes y estados | 38 pruebas aprobadas. |
| Todas las configuraciones Playwright | 26 válidas; mismo conjunto de 1.860 casos únicos. Es descubrimiento, no ejecución completa de los 1.860. |
| Build de staging y sello de integridad | Aprobados; 180 archivos verificados por el sello. |
| Wrangler staging `deploy --dry-run` | Aprobado; empaquetado sin subir ni activar versiones. |
| Configuraciones protegidas | Nueve hashes iguales, incluidos lockfile, entornos, workflows y bindings. |
| Enlaces de documentación | 135 Markdown, 607 enlaces locales, ninguno roto. |

Son **704 ejecuciones de pruebas aprobadas en las comprobaciones finales**;
no se presenta esa cifra como casos únicos ni como pruebas alojadas.
La compilación utilizó las referencias públicas de desarrollo y el proceso
existente omitió 162 copias predeterminadas en `dist` tras verificar sus
referencias R2. No eliminó sus originales de `public/` ni objetos de R2.

Se conservaron también dos incidencias de validación, sin ocultarlas:

1. En el sandbox, tres pruebas nativas no pudieron resolver imports porque
   esbuild recibió «Acceso denegado» al recorrer directorios superiores.
   La ejecución local autorizada, con los mismos tests, aprobó los cinco
   grupos de contratos. No se modificó código para evitar la comprobación.
2. La primera suite de catálogo aprobó 91 de 92. Una ficha no terminó de
   mostrarse y la traza registra una segunda navegación durante la espera.
   La repetición completa, sin ediciones ni builds simultáneos, aprobó las
   92 en 2,3 minutos; no se cambiaron timeouts ni reintentos. Su causa exacta
   no está demostrada y no se declara corregida por una sola repetición.
   Se conserva `catalog-initial-failure-trace.zip` junto al log inicial para
   investigar si vuelve a producirse. No se atribuye al código de limpieza
   ni a Supabase sin evidencia.

Los resultados, logs, hashes e inventarios completos permanecen en la carpeta
de evidencias. No se ejecutaron pruebas SQL nuevas: esta tarea no modifica
el esquema, las migraciones o sus permisos. La configuración de Supabase y
R2 se verificó localmente; no se certificó un nuevo estado remoto.

SHA-256 del manifiesto del build de staging comprobado:
`b4e370ea9698c89ee242b401bfca6e0c0a2798d890524e55c46241223d4c1ff9`.

## Estructura final y archivos que se añadirían

```text
src/                      Aplicación, dominio, servicios y estilos
worker/                   Backend Cloudflare y entrega segura
supabase/{migrations,tests,audit}/
public/                   Recursos y metadatos públicos
tests/                    Contratos, navegador, fixtures y seguridad
scripts/                  Compilación, mantenimiento y operación
docs/                     Guías vigentes e informes con índice
.github/workflows/        CI y despliegues
.agents/skills/           Skills del proyecto
playwright*.config.ts     Configuraciones por entorno de prueba
vite.config.ts            Compilación frontend
tsconfig*.json            Tipado de aplicación, herramientas y Worker
wrangler.jsonc            Bindings y entornos Cloudflare
package{,-lock}.json      Scripts y dependencias
.env.example              Ejemplo público saneado
.dev.vars.example         Ejemplo de secretos del Worker, sin valores reales
.gitignore                Exclusiones locales
```

`node_modules/`, `dist/`, `.wrangler/` y `artifacts/` siguen existiendo en disco
fuera del contenido que se añadiría. La simulación final utiliza una copia
temporal del índice mediante `GIT_INDEX_FILE` y comprueba que el índice real
no cambia durante ese paso.

Las primeras consultas de Git refrescaron metadatos de caché del índice;
su hash binario pasó de `d551e42e4a43c6a9f642f7fb3612490e4cbde089a57d08103126cf6138ca997a`
a `ac72d6d94408e996df80ae8339e92f765d04b36cccc2dea77eaf3c500250f3e6`.
El contenido preparado no cambió: no había archivos staged al empezar y
`git diff --cached` sigue vacío. No se restauró ni sobrescribió el índice real.

La lista exacta, incluidos los cambios previos del usuario,
queda en [GIT_ADD_PREVIEW_2026_11_17.md](GIT_ADD_PREVIEW_2026_11_17.md).
Contiene 267 rutas: 148 modificaciones, 112 archivos nuevos y siete
eliminaciones previas. Ninguna corresponde a credenciales reales, resultados
de pruebas, dependencias o compilaciones.
