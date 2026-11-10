# Auditoría funcional administrativa — 10 de noviembre de 2026

**Auditoría cerrada: cero fallos funcionales pendientes en los escenarios
cubiertos.** Se corrigieron tres problemas: confirmación de importaciones,
rendimiento del comando de 500 productos y foco del menú móvil. Las pruebas
alojadas y la limpieza terminaron; los registros originales conservaron sus
huellas en las siete ejecuciones. Los límites de cobertura se mantienen
explícitos: este resultado no equivale a aprobar funciones inexistentes,
dispositivos físicos no ensayados ni cambios globales deliberadamente evitados.

Evidencia de cierre:
`artifacts/admin-functional-audit-2026-11-10/hosted/postflight.json`,
`hosted/full-suite-before-manual-field-correction.json` y
`hosted/manual-corrected-result.json`.

## Alcance y criterio

Se inventariaron doce entradas de navegación, dieciséis rutas de trabajo y
tres rutas de acceso/recuperación. El detalle de controles y rutas está en
[la matriz de cobertura](ADMIN_FUNCTIONAL_COVERAGE_2026_11_10.md).

Se utilizaron tres niveles de evidencia, sin confundirlos:

1. Chrome y aplicación reales con almacenamiento local o SDK y transporte
   aislado: interacción, errores, formularios, responsive y reintentos.
2. PostgreSQL desechable con todas las migraciones: restricciones, permisos,
   integridad, concurrencia y guardado atómico.
3. Staging con Auth/TOTP, Supabase, Worker y R2 reales: exclusivamente registros
   propios identificados `QA-AROMA-`, con lectura posterior independiente.

El proyecto operativo es `aroma-infini-dev`, el Worker
`aroma-infini-frontend-staging` y el bucket privado `aroma-infini-media-dev`.
Las dos migraciones de esta auditoría se aplicaron exclusivamente en desarrollo.
La versión del Worker de staging es `2b6f9791` —identificador abreviado—.
**No se desplegó ni se escribieron datos de prueba en producción.** No se
modificaron el diseño, las animaciones, los precios originales, las condiciones
comerciales ni la arquitectura de autenticación; no se añadió SMTP.

Los estados significan:

- **APROBADA:** el alcance indicado cuenta con resultado satisfactorio y evidencia.
- **APROBADA CON OBSERVACIONES:** funciona en el alcance probado, con límites
  concretos que impiden afirmar una verificación completa de todos los entornos.
- **FALLIDA:** una prueba válida detectó un problema pendiente de corregir.
- **NO PROBADA:** no se ejecutó el escenario o no existe ese control en la interfaz.

## Matriz de funcionalidades

| Sección o función | Estado final | Evidencia y observaciones |
| --- | --- | --- |
| Dashboard | APROBADA | Navegación, indicadores, accesos y responsive en Chrome; lectura alojada confirmada sin escrituras. Sus pedidos simulados se excluyen de estadísticas comerciales. |
| Productos: lista, búsqueda y filtros | APROBADA | Pruebas de nombre/marca/SKU, stock, visibilidad, paginación y búsquedas vacías. Búsqueda SKU alojada y galería comprobadas en cinco tamaños. |
| Crear y editar productos | APROBADA | Formulario manual alojado: vista previa sin publicar, alta, SKU automático, edición de precio y stock preservando SKU; lectura posterior. Validaciones, versión, cancelación y borrador cubiertos en navegador/SQL. |
| Publicar y desactivar | APROBADA | Publicación verificada desde sesión anónima independiente. Stock cero desactiva y la ficha deja de ser pública; reposición y publicación explícita restauran el producto. |
| Inventario por presentación | APROBADA | Precio en céntimos, SKU, stock y variantes; edición y agotado alojados preservan los valores ajenos. Alcance: edición individual con varias presentaciones, no un editor masivo inexistente. |
| Eliminar productos desde el panel | NO PROBADA | No existe botón de eliminación en la interfaz actual. Activar/desactivar es el mecanismo disponible. Una RPC SQL de eliminación no acredita una función de UI. |
| Importación Excel 10/50/100/500 | APROBADA | Plantilla oficial descargada y archivos reales confirmados desde la interfaz en Supabase; los cuatro tamaños devolvieron HTTP 200 y persistieron los recuentos exactos. Limpieza confirmada. |
| Excel con datos inválidos y reintentos | APROBADA CON OBSERVACIONES | Archivos reales válidos/mixtos, formatos inesperados, duplicados, corruptos y reimportación probados en navegador; atomicidad de un último registro inválido verificada en SQL. Los errores no se equiparan a ensayos masivos alojados de todas las variantes inválidas. |
| Fotografías por SKU: cuatro + olfativa | APROBADA | Catorce casos distintos de navegador. En staging: cinco fotos, reordenación y reemplazo; lectura posterior, píxeles, hashes y cabeceras reales. Retirada final y ausencia de los objetos QA confirmadas. |
| Marcas individuales y múltiples | APROBADA | Registro 5/20/50/100, slugs, duplicados, edición y estados cubiertos; cinco marcas por ejecución creadas desde la UI y verificadas en Supabase real. Limpieza confirmada. |
| Eliminar marcas desde el panel | NO PROBADA | La UI ofrece editar/activar/desactivar. No se añadió una acción inexistente para presentar la auditoría como completa. |
| Familias olfativas y filtros | APROBADA | Mantenimiento, asignación, renombre, inactivación, eliminación sin asociaciones y protección de las utilizadas; contrato SQL y navegador. En staging se creó una familia QA, se asignó junto a otra y se renombró/desactivó conservando su código. Limpieza confirmada. |
| Categorías y tipos de producto | APROBADA CON OBSERVACIONES | Perfume/complemento y género son opciones centralizadas, no un CRUD independiente. Se conserva el interruptor de Complementos y su tratamiento de campos. |
| Ofertas de productos | APROBADA | Porcentaje/importe, fechas, variantes, activar/desactivar, eliminar con confirmación y guardado consecutivo. En staging: dos altas, edición, vencimiento, estados y eliminación, con lectura posterior y limpieza. |
| Cupones | APROBADA | Validación, límites y fechas cubiertos; en staging dos altas consecutivas, edición y eliminación confirmada, verificando persistencia. Alcance: gestión; no se realizó un cobro/redención comercial. |
| Pedidos: lista y detalle | APROBADA | Búsqueda, filtros, veinte por página e historial con datos aislados; tres checkouts simulados mediante servicios reales de staging, estados individuales y masivos, lectura posterior e historial. Limpieza confirmada. |
| Cambios masivos de estado | APROBADA | Cien pedidos con transporte aislado; en staging dos cambios, conflicto parcial, reintento sin duplicar historial y bloqueo de entrega sin confirmación. No se reintrodujeron lotes ni responsables manuales. |
| Fichas de envío y resúmenes PDF | APROBADA | Exportación de 1/3/5/10/50/100 con datos aislados; en staging ambos formatos, tres documentos y dos páginas A4 por PDF. La extracción de texto confirmó las mismas tres referencias seleccionadas, en su orden y sin documentos duplicados. No se confunden los tamaños de lote locales con los tres pedidos alojados. |
| Clientes | APROBADA | Búsqueda, paginación y acceso a pedidos verificados en interfaz; lectura alojada sin escrituras. No es un CRUD de usuarios Auth ni debe incluir simulaciones como clientes comerciales. |
| Envíos | APROBADA CON OBSERVACIONES | Formularios, validaciones, versiones, errores y responsive con transporte aislado; lectura alojada confirmada sin escrituras. No se alteraron tarifas originales para una prueba. |
| Home y carrusel | APROBADA CON OBSERVACIONES | Interfaz, categorías, franja, marca destacada, recomendador y controles inventariados; lectura alojada y cinco vistas previas sin escrituras. No se acredita una nueva escritura multimedia real del Home por la prueba R2 de productos. |
| Configuración, Contacto y redes | APROBADA CON OBSERVACIONES | Validación, enlaces seguros, guardado versionado y conflictos cubiertos en aislamiento. No se inventaron URLs oficiales ni un dominio para el QR; configuración original preservada. |
| Reseñas y moderación | APROBADA CON OBSERVACIONES | Política y restricciones SQL cubiertas; no existe un módulo administrativo de edición/aprobación. No se acredita una nueva publicación de reseña desde la UI alojada en esta auditoría. |
| Reclamaciones | APROBADA CON OBSERVACIONES | En staging se registró una reclamación propia desde la UI/Worker, se descargó constancia, se verificó acceso restringido y respuesta con evidencia/historial. Limpieza confirmada. El envío externo de la respuesta fue simulado expresamente, no acreditado. |
| Notificaciones y PWA | APROBADA CON OBSERVACIONES | Dieciséis casos de interfaz/SDK: permiso voluntario, alta/baja, errores, sesión revocada y privacidad. No se acredita entrega push física a un teléfono. |
| Entrega push en teléfonos físicos | NO PROBADA | Requiere dispositivos y permisos reales. Los mocks de PushManager o el permiso de Chrome de escritorio no la sustituyen. |
| Autenticación, MFA y permisos | APROBADA | Login/TOTP real; denegación a anónimo/cliente y restricciones SQL/MFA/roles verificadas en los comandos cubiertos. No constituye una certificación general del proveedor Auth. |
| CRUD administrativo de usuarios/roles | NO PROBADA | No existe esa interfaz. Los administradores se aprovisionan en Supabase mediante UUID/membresía; clientes no pueden autoconcederse permisos. |
| Limpieza QA e integridad original | APROBADA | Postflight de siete ejecuciones: sin filas comerciales QA restantes; catorce usuarios, 1021 productos y 35 marcas retirados; 24 tumbas de medios sin referencias y 72 objetos R2 ausentes. Huellas originales iguales en todas las ejecuciones. |

No queda un fallo funcional pendiente en los escenarios cubiertos. Los límites
de las filas con observaciones y de los escenarios no probados se mantienen;
las pruebas no autorizan un despliegue ni la apertura de producción.

## Resultados cuantitativos

| Validación | Resultado confirmado |
| --- | --- |
| TypeScript | Código 0. |
| ESLint | Código 0, sin advertencias admitidas. |
| Build de producción | Código nativo 0, confirmado en `quality/build-production-result.json` y `build-production-confirmed.log`; compilar no equivale a desplegar. |
| Tests Node | 137/137 aprobados, cero fallos y cero omitidos. |
| PostgreSQL desechable | 704 comprobaciones con treinta migraciones. |
| Playwright: panel | 208 casos distintos aprobados. |
| Playwright: Excel | 19 casos distintos aprobados. |
| Playwright: catálogo SDK | 41 casos distintos aprobados. |
| Playwright: fotografías SDK | 14 casos distintos aprobados entre ejecuciones. |
| Total Playwright de estos grupos | 282 casos distintos aprobados. No incluye los ensayos alojados ni repeticiones. |
| Recorridos funcionales alojados | 22 comprobaciones compuestas distintas aprobadas al consolidar las ejecuciones completa y manual corregida; no se suman a los 282 casos Playwright. |
| HTTP anónimo alojado | Seis comprobaciones de rechazo aprobadas, sin mutaciones; no se suman a los 282 casos Playwright. |
| Postflight de limpieza | Aprobado en las siete ejecuciones; huellas originales iguales y 72 objetos R2 ausentes. |

Los fallos iniciales se conservaron: foco del menú; respuestas de fixtures
desalineadas con el contrato real; configuración de notificaciones; coincidencia
amplia de una URL en un test nuevo; espera de arranque insuficiente en un caso
laptop. No se borraron para ocultar resultados. Tras las correcciones del
producto o del montaje, según correspondía, los casos afectados aprobaron.
La primera captura PowerShell del build interpretó avisos de stderr como
`NativeCommandError`; se repitió mediante un subproceso Node y se comprobó su
código real 0. Persiste el aviso de Vite para un chunk superior a 500 kB: es una
observación de tamaño, no un fallo de compilación. No se introdujeron cambios
de empaquetado ajenos a esta auditoría para silenciarlo.

## Excel y persistencia real

La plantilla oficial se descargó desde el administrador. Cada perfume tenía dos
presentaciones; el Excel contenía datos, sin imágenes, URLs ni referencias R2.
La vista previa no creaba registros antes de confirmar.

| Productos | Filas/presentaciones | Resultado alojado | Productos / variantes leídos después | Tiempo medido |
| ---: | ---: | --- | ---: | ---: |
| 10 | 20 | HTTP 200 | 10 / 20 | 3,174 s |
| 50 | 100 | HTTP 200 | 50 / 100 | 3,704 s |
| 100 | 200 | HTTP 200 | 100 / 200 | 4,524 s |
| 500 | 1000 | HTTP 200 | 500 / 1000 | 7,955 s |

En total se importaron 660 perfumes QA y 1320 presentaciones en esta ejecución.
**Los tiempos incluyen la comprobación SQL posterior**: no son latencia pura
de la RPC ni una prueba de carga concurrente. Se ejecutaron de forma controlada,
sin carga agresiva contra servicios alojados.

Los archivos mixtos locales conservaron respectivamente 4, 44, 94 y 494 perfumes
válidos; rechazaron seis perfumes/doce filas por archivo. Se comprobaron precios
exactos, stock, caracteres especiales, duplicados, marcas/familias, datos
incompatibles, reimportación sin duplicar y conservación de los originales.
La suite SQL prueba que un error en el registro 500 revierte los 499 anteriores.

## Otros recorridos alojados confirmados

La ejecución completa `b6193079-b1e5-4ea0-b9e5-f37e2cebd198` ya registró estos
resultados. La limpieza terminó correctamente; su único error de automatización
en el formulario manual se repitió de forma satisfactoria en otra ejecución:

- Dos ofertas consecutivas, porcentaje e importe fijo, con formulario
  reiniciado y lectura posterior independiente. Edición a 12 %, activar,
  desactivar, vencimiento, cancelar la eliminación y eliminar con confirmación,
  manteniendo intactos precios habituales, variantes y stock.
- Dos cupones consecutivos, una edición y una eliminación directa confirmada.
- Familia propia: alta, asignación junto a otra familia al perfume QA, renombre
  conservando su código y desactivación sin perder la asociación histórica.
- Tres checkouts simulados a través del Worker/Supabase reales: precios
  canónicos, stock sin consumo comercial, petición repetida idempotente y
  rechazo de reintento con contenido alterado.
- Pedido individual y dos cambios masivos desde la UI; conflicto parcial de
  versión, repetición sin duplicar el historial, cuatro entradas de historial
  atribuidas al administrador verificado y rechazo de entrega sin confirmación.
- Fichas de envío y resúmenes: tres pedidos exactos, tres documentos en dos
  páginas A4 para cada modalidad; PDF de 15343 y 20843 bytes respectivamente.
- Una reclamación propia: validación de campos, constancia pública persistente,
  PDF de una página, rechazo de acceso no autorizado y respuesta con evidencia
  obligatoria. Dos registros de historial y formulario respondido inmutable.
  **La entrega externa de esa respuesta se simuló**: no prueba envío de un mensaje
  a un destinatario real ni debe presentarse como tal.
- Lectura de Dashboard, Clientes, Home, Tarifas de envío, Configuración y
  Notificaciones: cero escrituras en esos seis módulos. Se abrieron cinco
  vistas previas del Home conservando los documentos originales.

El caso de creación manual no finalizó en la primera ejecución porque el
automatismo omitió «Perfil olfativo», un campo obligatorio. El navegador mostró
su validación y bloqueó el guardado correctamente. Se conserva el resultado
original `failed` y su captura; no se reescribe como si hubiera pasado.

La ejecución corregida `9318dbbc-2006-4527-b5bc-f1d9d8834238` terminó `passed`,
con nueve comprobaciones y limpieza e integridad originales confirmadas. Aportó
tres comprobaciones nuevas, además de repetir seis ya cubiertas:

- Se dejó completar una importación real de diez productos/veinte variantes
  en Supabase y se interrumpió deliberadamente su respuesta al navegador. La UI
  reconcilió los mismos IDs y contenido, sin volver a crear productos ni anunciar
  un error falso. La interrupción del transporte fue inducida; el commit y la
  comprobación posterior fueron reales.
- Se creó un producto desde el formulario manual, con vista previa aún no
  publicada, SKU automático y edición posterior de precio/stock preservando SKU.
- Se guardó el perfume QA sin stock: quedó desactivado y la lectura pública
  devolvió ausencia. Al reponer y publicar explícitamente volvió a estar
  disponible, conservando SKU, precios y oferta.

La unión consta de diecinueve comprobaciones de la ejecución completa y tres
nuevas de la repetición: **22 comprobaciones compuestas distintas**. No son
veintiocho independientes, ni se oculta el fallo inicial del montaje.

## Problemas encontrados y correcciones

### Confirmación de importación tras guardar

El cliente hacía una recarga adicional después de confirmar la transacción.
Si esa lectura fallaba, podía anunciar error aunque los productos ya existieran.
Se utiliza ahora la respuesta canónica validada del comando: IDs, contenido,
versiones y cantidad deben coincidir con lo revisado antes de anunciar éxito.
Ante una respuesta perdida, se verifica el mismo conjunto de identidades y
datos; no se crean otros IDs ni se sobrescribe una edición ajena para «reintentar».

### Timeout real al importar 500 productos

La primera prueba alojada canceló la operación con SQLSTATE `57014`. No dejó
registros parciales: la transacción completa se revirtió. Las pruebas aisladas
previas no habían revelado ese límite real.

La migración `20261110000100_atomic_import_preparation.sql` preparó los SKU una
sola vez y difirió la comprobación final del lote. Por sí sola no resolvió el
timeout alojado, por lo que se conservó esa evidencia y se perfiló el trabajo.

La migración `20261110000200_catalog_authorization_cost.sql` reduce la evaluación
repetida de identidad y la construcción duplicada de documentos por producto.
No cachea permisos fuera de la sentencia ni utiliza un GUC nuevo que permita
omitir MFA/RLS. Conserva identidad verificada, membresía activa, dueños, ACL,
validaciones, bloqueos de medios y DTO final tras comprobar restricciones.

| Perfil PostgreSQL local, mismo payload de 500 | Antes | Después |
| --- | ---: | ---: |
| Duración nativa | 6,687943 s | 1,170506 s |
| Llamadas a `request_user_id` | 144030 | 40010 |

La reducción nativa fue aproximadamente **82,5 %**. No se presenta como mejora
porcentual alojada: el antes alojado acababa en timeout y el después terminó
correctamente, con el tiempo de lectura posterior incluido en la tabla anterior.
No se elevaron los límites globales de timeout para ocultar el problema.

### Foco del menú móvil

El primer frame intentaba enfocar el botón todavía oculto por su transición.
Se espera su visibilidad y se cancela el frame al desmontar. El mismo caso pasó
tres repeticiones consecutivas. No cambiaron estilos ni animaciones.

## Fotografías y R2

La suite aislada cubre búsqueda por SKU, cinco posiciones, subida conjunta,
previsualización, separación de galería/imagen olfativa, guardar, reemplazar,
ordenar y retirar. Verifica errores de formato, WebP corrupto, tamaño excesivo,
fallo de carga, respuesta perdida y conflicto 409, conservando el borrador.

Las fotografías QA se identificaron como material de prueba. El borrado
operativo comprobó cada UUID, autor de carga, operación, prefijo y ausencia de
referencias —incluidos Home y pedidos— antes de retirar sus objetos exactos.
Se preservaron fotografías originales y activos todavía asociados.

Sí están confirmadas estas operaciones alojadas: búsqueda por SKU, selección
conjunta de cinco archivos, vistas previas sin publicación, guardado de cuatro
fotos de galería y una olfativa independiente, lectura RPC posterior, entrega
WebP real por Worker/R2 con comprobación de píxeles y hashes, reordenación y un
reemplazo. Se usaron seis activos QA por recorrido completo de fotografías; la
imagen retirada no se borró de inmediato.
La publicación se verificó mediante una lectura anónima independiente y la
galería se comprobó junto a la búsqueda administrativa en los cinco tamaños.

## Seguridad, integridad y alcance visual

Se revisó que el escritor preparado no sea ejecutable por los roles de navegador
ni por `service_role`; las RPC públicas conservan su ejecutor restringido y
autorización administrativa con MFA. Las comprobaciones SQL incluyen rechazo
de usuarios no autorizados, validaciones, atomicidad, referencias y versiones.
En staging se comprobó el rechazo real a anónimo/cliente y el login TOTP.
Se realizaron además seis solicitudes anónimas alojadas sin mutaciones:

| Solicitud | Resultado |
| --- | --- |
| Carga administrativa de medios sin sesión | HTTP 401. |
| Ruta privada de medios | HTTP 404. |
| Checkout simulado con cuerpo vacío | HTTP 400. |
| RPC de importación administrativa sin sesión | HTTP 401, SQLSTATE `42501`. |
| RPC de catálogo administrativo sin sesión | HTTP 401, SQLSTATE `42501`. |
| RPC de reclamaciones administrativas sin sesión | HTTP 401, SQLSTATE `42501`. |

La evidencia está en `hosted/anonymous-http-security.json`. Estas comprobaciones
acreditan el rechazo de esas solicitudes concretas, no una prueba de penetración
completa.

No se detectó una nueva regresión concreta de ACL, RLS o MFA en las dos
migraciones; los resultados aislados no equivalen a certificar ausencia de toda
vulnerabilidad posible.

La conservación de propietario y permisos al reemplazar funciones corresponde
al contrato de [PostgreSQL 17: CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html).
Las políticas y permisos se revisaron manteniendo la separación de roles y la
protección de filas descrita en [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
Estas referencias explican los mecanismos; su aplicación concreta se verificó
con el esquema y las pruebas del proyecto.

Se observaron las dieciséis rutas en 1920×1080, 1440×900, 1366×768, 768×1024 y
390×844: ochenta mediciones sin desbordamiento horizontal. Se probaron controles
abiertos, diálogos, búsquedas vacías, paginación, teclado y retorno del foco.
Se inspeccionaron también capturas de creación de producto y PDF en móvil.
No se confunde emulación de viewport con ensayos en teléfonos físicos ni una
comprobación de teclado con una auditoría exhaustiva de lectores de pantalla.

Los documentos globales de Home, configuración y envíos pertenecían a la tienda.
Se preservaron: sus escrituras y errores se probaron con transporte aislado,
y las lecturas alojadas se documentan por separado. Cambiar y restaurar un
documento real no sería equivalente a «no modificar datos originales».

## Limpieza y cierre operativo

`hosted/postflight.json` consolida las siete ejecuciones. Se retiraron únicamente
los registros creados por esta auditoría, mediante sus identidades y prefijos
verificados, no por una limpieza indiscriminada:

| Comprobación final | Resultado |
| --- | --- |
| Usuarios Auth QA retirados | 14. |
| Productos QA retirados | 1021. |
| Marcas QA retiradas | 35. |
| Filas comerciales QA restantes | 0. |
| Filas de auditoría de medios conservadas | 24, todas `deleted` y sin referencias. |
| Objetos R2 verificados ausentes | 72; comprobación independiente obtuvo HTTP 404 para cada clave exacta. |
| Registros originales | Huellas iguales antes/después en cada una de las siete ejecuciones. |

Las 24 filas de medios son trazabilidad de borrado, no archivos huérfanos.
Las secuencias comerciales pueden haber avanzado durante pruebas y reversiones:
no se rebobinaron ni se reciclaron identificadores. Las credenciales y sesiones
temporales no se exportaron como artefactos.

La ejecución completa conserva su resultado original `failed` por la omisión
del campo obligatorio en el automatismo. La repetición corregida pasó y las dos
ejecuciones terminaron con limpieza e integridad confirmadas. El consolidado
une los escenarios ya verificados sin ocultar ese antecedente.

## Límites e intervención manual

- La entrega push física, instalación PWA en teléfonos reales y una auditoría
  exhaustiva de lectores de pantalla no se ejecutaron en esta sesión.
- No se modificaron los documentos originales globales de Home, tarifas o
  configuración para acreditar escrituras alojadas. Se probaron sus lecturas,
  vistas previas y escrituras aisladas; no se afirma una nueva carga R2 real del
  Home por haber probado imágenes de productos.
- No existen controles de UI para borrar productos/marcas, un CRUD de roles ni
  un editor masivo de inventario existente. No se añadieron como parte de una
  auditoría ni se presentan como funciones probadas.
- La moderación de ofensas sigue su política vigente y pruebas SQL; no existe
  edición/aprobación administrativa de reseñas y no se publicó una nueva reseña
  alojada desde la UI en esta ejecución.
- La entrega externa de la respuesta de reclamación fue simulada. Verificar un
  envío real requiere un destinatario y autorización; no se envió un mensaje real.
- Dominio definitivo, URLs oficiales necesarias para Contacto/QR y activación de
  pagos reales mantienen su proceso propio. No se sustituyen por datos inventados
  ni quedan autorizados por este informe.

No quedan correcciones técnicas pendientes de esta auditoría en los escenarios
cubiertos; estos límites son pruebas o decisiones fuera del alcance acreditado.

## Evidencia reproducible

Capturas seleccionadas del resultado:

| Recorrido | Captura |
| --- | --- |
| Revisión de 500 productos en staging | [Vista previa Excel](../artifacts/admin-functional-audit-2026-11-10/hosted/import-500-preview.png). |
| Búsqueda administrativa por SKU en móvil | [SKU a 390 px](../artifacts/admin-functional-audit-2026-11-10/hosted/admin-sku-390.png). |
| Galería pública en laptop | [Producto a 1366 px](../artifacts/admin-functional-audit-2026-11-10/hosted/public-product-1366.png). |
| Pedidos alojados propios | [Pedidos](../artifacts/admin-functional-audit-2026-11-10/hosted/hosted-orders.png). |
| Reposición y publicación verificadas | [Inventario restaurado](../artifacts/admin-functional-audit-2026-11-10/hosted/hosted-inventory-restored.png). |
| Modal PDF en móvil, transporte aislado | [Exportar PDF](../artifacts/admin-functional-audit-2026-11-10/panel/screenshots/390-pdf-dialog-top.png). |

- Inventario y clasificación detallada: [matriz](ADMIN_FUNCTIONAL_COVERAGE_2026_11_10.md).
- Comandos de calidad: `quality/{typecheck,lint,test-node}.log`,
  `quality/build-production-confirmed.log` y `quality/build-production-result.json`.
- Panel: `panel/run-initial.log`, `panel/run-sdk-corrected.log`,
  `panel/menu-after-fix.log` y `panel/surface-measurements.json`.
- Excel: `excel/local-first.log`, `responsive-500.log`,
  `unexpected-formats-final.log`, `remote-full.log`, `remote-500-final.log` y
  los `.xlsx`/resultados con hashes.
- Fotografías aisladas: `media/result.json` y capturas de cinco tamaños.
- Ensayos alojados: `hosted/full-suite-before-manual-field-correction.json`,
  `hosted/manual-corrected-result.json`, hojas oficiales, capturas y huellas.
- Cierre: `consolidated-result.json`, `hosted/anonymous-http-security.json` y
  `hosted/postflight.json`.
- Contenido de ambos PDF alojados: `hosted/pdf-content-verification.json`,
  contrastado con las tres filas seleccionadas de `hosted-orders.png`.
- Las rutas anteriores parten de `artifacts/admin-functional-audit-2026-11-10/`.

Los artefactos QA no contienen contraseñas, claves privilegiadas, tokens ni
estados de sesión exportados. La sesión de prueba se conserva solo en memoria.
Las evidencias de intentos anteriores se mantienen para distinguir fallos reales,
errores del montaje y verificaciones repetidas.
