# Rendimiento administrativo — auditoría del 11–12 de noviembre de 2026

## Alcance y método

Se revisaron las trece entradas del menú administrativo: Resumen, Productos,
Marcas, Familias olfativas, Pedidos, Clientes, Promociones, Gestión del Home,
Biblioteca multimedia, Envíos, Configuración, Notificaciones y Reclamaciones.
También se revisaron los editores de productos, fotografías y detalle de pedido.
El diseño, las hojas de estilo, las animaciones y las reglas comerciales no se
rediseñaron. No se añadieron dependencias.

La comparación de navegador usa React y el SDK de Supabase reales, con
transporte HTTP interceptado, 1.000 productos, 1.000 pedidos, veinte marcas,
200 recursos multimedia y 200 ms añadidos a cada petición de Auth/RPC/API.
Se midieron 120 transiciones por versión: escritorio 1440 × 900 con CPU normal
y móvil 390 × 844 con CPU ralentizada cuatro veces. Cada ruta tiene una apertura
fría y tres visitas con la aplicación abierta; cuatro rutas tienen tres aperturas
frías. Se mantuvieron las mismas condiciones y no se ejecutaron otras pruebas
intensivas durante las mediciones.

Los 1.000 pedidos de esa prueba principal tienen el indicador `simulation: true`.
Por las reglas aprobadas, quedan excluidos del listado comercial de Clientes y
de los indicadores comerciales del Resumen. La prueba principal mide su carga
y transporte, pero **no representa una tabla con 1.000 clientes comerciales**.
Se completó una prueba independiente de ese volumen sobre los builds compilados,
descrita más abajo; no se mezclaron ambos escenarios para calcular mejoras.

Son mediciones de laboratorio sobre Vite en desarrollo, **no tiempos de la web
alojada ni percentiles de producción**. Una apertura fría restablece documento,
módulos y estado de los servicios; el caché HTTP se deshabilita al interceptar el
transporte. El tiempo hasta contenido preparado incluye los controles del
instrumento, una espera de estabilidad de 120 ms y dos fotogramas. No representa
exclusivamente la latencia del clic.

La referencia inicial contiene 120 transiciones completas, quince interacciones
completas y una interacción móvil interrumpida tras veinte segundos. No se
presenta esa ejecución inicial como una suite íntegramente aprobada: se
conservaron por separado los errores del instrumento y la intervención del
protector de cambios sin guardar. El caso móvil de escritura es una cota inferior,
no una duración exacta. Los registros originales permanecen en
`artifacts/admin-performance-2026-11-11/`.

PostgreSQL se midió aparte, en un clúster nativo local aislado con las migraciones
reales y una identidad Auth de prueba: 1.000 productos, 2.000 presentaciones,
6.000 notas, 2.000 relaciones, 3.000 activos, 6.000 variantes multimedia,
1.000 pedidos, 3.000 líneas y 3.000 eventos. No se hicieron pruebas de carga,
compras ni escrituras en Supabase, Workers o R2 alojados.

## Resultados finales de navegador

La ejecución final terminó con salida real 0: 120 transiciones, dieciséis interacciones completas, ninguna petición inesperada ni cambio de fuente durante la medición. No se ejecutaron otros navegadores, builds o pruebas SQL al mismo tiempo. Los tiempos son los del laboratorio descrito arriba.

### Primera apertura del apartado

| Apartado           | Escritorio antes → después (ms) |  Cambio | Móvil antes → después (ms) |  Cambio |
| ------------------ | ------------------------------: | ------: | -------------------------: | ------: |
| Resumen            |                     3628 → 2324 | -35,9 % |                5138 → 3370 | -34,4 % |
| Productos          |                     3798 → 2290 | -39,7 % |                5159 → 3408 | -33,9 % |
| Marcas             |                     3612 → 2231 | -38,2 % |                5318 → 3433 | -35,4 % |
| Familias olfativas |                     3798 → 2306 | -39,3 % |                5011 → 3320 | -33,7 % |
| Pedidos            |                     3838 → 2349 | -38,8 % |                5635 → 3839 | -31,9 % |
| Clientes           |                     3733 → 2187 | -41,4 % |                5119 → 3250 | -36,5 % |
| Promociones        |                     3604 → 2321 | -35,6 % |                5013 → 3309 | -34,0 % |
| Gestión del Home   |                     3907 → 2312 | -40,8 % |                5094 → 3665 | -28,1 % |
| Biblioteca         |                     3834 → 1611 | -58,0 % |                5409 → 2528 | -53,3 % |
| Envíos             |                     3766 → 1614 | -57,1 % |                4992 → 2460 | -50,7 % |
| Configuración      |                     3579 → 1289 | -64,0 % |                5101 → 2445 | -52,1 % |
| Notificaciones     |                     3609 → 1254 | -65,3 % |                5039 → 2323 | -53,9 % |
| Reclamaciones      |                     3621 → 1237 | -65,8 % |                5103 → 2397 | -53,0 % |

### Volver al apartado con la aplicación abierta

| Apartado           | Escritorio antes → después (ms) |  Cambio | Móvil antes → después (ms) |  Cambio |
| ------------------ | ------------------------------: | ------: | -------------------------: | ------: |
| Resumen            |                     2690 → 1611 | -40,1 % |                3781 → 2240 | -40,8 % |
| Productos          |                       274 → 264 |  -3,6 % |                  898 → 736 | -18,0 % |
| Marcas             |                       264 → 263 |  -0,4 % |                 1084 → 933 | -13,9 % |
| Familias olfativas |                       236 → 220 |  -6,8 % |                 1007 → 793 | -21,3 % |
| Pedidos            |                      1071 → 495 | -53,8 % |                1711 → 1263 | -26,2 % |
| Clientes           |                       657 → 471 | -28,3 % |                1894 → 1192 | -37,1 % |
| Promociones        |                     1039 → 1026 |  -1,3 % |                1164 → 1023 | -12,1 % |
| Gestión del Home   |                     1032 → 1038 |  +0,6 % |                1158 → 1055 |  -8,9 % |
| Biblioteca         |                     1078 → 1045 |  -3,1 % |                1747 → 1581 |  -9,5 % |
| Envíos             |                     1048 → 1029 |  -1,8 % |                1082 → 1038 |  -4,1 % |
| Configuración      |                       549 → 538 |  -2,0 % |                 1028 → 964 |  -6,2 % |
| Notificaciones     |                       454 → 421 |  -7,3 % |                1196 → 1072 | -10,4 % |
| Reclamaciones      |                       548 → 427 | -22,1 % |                 1059 → 886 | -16,3 % |

Las visitas cálidas tienen tres observaciones por apartado. Las aperturas frías tienen una observación, excepto Resumen, Productos, Pedidos y Biblioteca, que tienen tres; en esos casos se muestra la mediana. Diferencias pequeñas, como los seis milisegundos adicionales del Home en escritorio, no se interpretan como cambios estadísticamente demostrados. La referencia completa, incluidos conteos de peticiones, CPU y tareas largas, está en `comparison.json` y `COMPARISON.md`.

En escritorio, la apertura fría de Envíos pasó de diecinueve a diez peticiones y la de Pedidos de veintiocho a diecinueve. Son peticiones Auth/RPC/API administrativa, no solamente consultas SQL. No todas las rutas reducen su número: Resumen sigue necesitando ambos conjuntos y Productos sigue cargando el catálogo. Las tres listas con catálogo reutilizado conservan cero peticiones adicionales en visitas cálidas.

### Edición y filtros

| Acción                                  | Escritorio antes → después (ms) | Móvil antes → después (ms) |
| --------------------------------------- | ------------------------------: | -------------------------: |
| Abrir opciones del recomendador         |                     3118 → 3099 |                3482 → 2446 |
| Escribir veinte caracteres en el Hero   |                       421 → 367 |                1783 → 1287 |
| Configurar una nueva oferta             |                       425 → 400 |                1692 → 1335 |
| Editar el importe de una oferta         |                       231 → 196 |                  442 → 345 |
| Cambiar página de Productos             |                      1091 → 561 |                 1168 → 630 |
| Filtrar Productos                       |                      1104 → 573 |                 1200 → 665 |
| Abrir la edición de producto            |                       715 → 489 |                 3936 → 942 |
| Escribir veinte caracteres del producto |                      1689 → 360 |  >20000, incompleto → 1882 |

Cada interacción tiene una muestra por versión/dispositivo. El caso móvil incompleto de referencia no permite calcular un factor exacto de aceleración. El trabajo de script para escribir veinte caracteres del producto en escritorio pasó de 1303,4 a 161,4 ms. El desplegable cerrado de relacionados pasó de 5001 a tres descendientes; las opciones siguen disponibles al abrirlo y mantienen su selección.

### Comprobación adicional de 1.000 clientes

Se sirvieron los mismos builds compilados antes/después y se atendieron localmente
las respuestas de 1.000 pedidos con 1.000 clientes distintos y el indicador
comercial en el contrato HTTP sintético. **No se crearon pedidos ni clientes
reales ni se modificaron datos alojados.** Se comprobó que el listado muestra
1.000 clientes, pagina veinticinco filas, filtra al escribir y recupera la lista
al limpiar la búsqueda. Se realizaron tres muestras consecutivas por build y
dispositivo, sin otros procesos de prueba en paralelo.

| Escribir y filtrar veinte caracteres | Escritorio antes → después | Móvil CPU ×4 antes → después |
| ------------------------------------ | -------------------------: | ---------------------------: |
| Mediana del recorrido de entrada     |            127,5 → 70,2 ms |             631,9 → 244,0 ms |
| Mediana del trabajo de script        |             72,1 → 11,8 ms |              439,6 → 64,1 ms |
| Peticiones RPC durante la escritura  |                      0 → 0 |                        0 → 0 |

Son tres muestras en un contexto por combinación, no percentiles de población.
Este complemento no añade latencia de red y mide principalmente el trabajo de
filtrado; sus tiempos no se comparan directamente con las aperturas de la tabla
principal. Los cuatro casos terminaron con salida real 0 y los dos pares de
capturas coinciden exactamente. Resultados: `commercial-customers/comparison.json`
y `commercial-customers-execution.json` en la carpeta de artefactos.

### Conservación visual

Se compararon los veintiséis pares de capturas de las trece rutas en ambos tamaños: **26/26 idénticos píxel a píxel**, sin desbordamientos horizontales. La diferencia de filtros detectada en el intento intermedio se corrigió trasladando sus mismas reglas a la hoja del listado; no se cambiaron sus valores. Capturas y paneles comparativos: `artifacts/admin-performance-2026-11-11/visual-comparison/`.

También se sirvieron los builds compilados anterior y final, sin módulos de
desarrollo: cuatro recorridos (dos builds × escritorio/móvil), catorce rutas cada
uno. Las 56 capturas forman **28/28 pares idénticos**, sin máscaras ni tolerancia.
No hubo errores de chunks/CSS, desbordamientos, imports de `/src`, escrituras
comerciales ni solicitudes remotas reales. Se utilizó el SDK compilado con
transporte HTTP sintético atendido localmente; no es una prueba de Supabase o R2
alojados. Evidencia: `compiled-smoke-execution.json`,
`compiled-smoke-comparison.json` y `compiled-smoke/` en la misma carpeta de
artefactos.

Durante un intento previo, un POST de catálogo atendido por el transporte de prueba no registró evento terminal y la espera de estabilidad falló. El trace no permite afirmar su causa. Ese intento se conserva como excluido/no concluyente; no se cuenta como aprobado. El instrumento final registra tanto finalización como fallo, exige respuestas válidas y conserva el límite de 45 s para peticiones realmente pendientes. No se aumentaron tiempos ni se cambió la aplicación para esconderlo.

## Problemas encontrados y cambios

### Carga de rutas y módulos

- El loader padre descargaba el catálogo entero al entrar a cualquier apartado,
  incluso Envíos, Notificaciones o Reclamaciones. Ahora autentica el shell y cada
  ruta solicita únicamente los conjuntos que utiliza. Una prueba cubre también
  entrar primero a una ruta sin catálogo y navegar después a Productos.
- Productos compartía módulo con el formulario y Marcas compartía módulo con
  Clientes, Promociones y el detalle de pedido. Se separaron sus módulos diferidos
  conservando los componentes, sus estilos y las exportaciones de compatibilidad.
- La precarga por intención del menú sigue descargando exclusivamente código;
  no precarga registros privados. Se conserva el respeto a ahorro de datos y 2G.
- Se mantienen los indicadores de navegación y los estados de carga existentes.
  No se sustituyó la espera real por contenido vacío ni se retiraron funciones.
- La primera comparación detectó un aumento de espera al volver a Productos,
  Marcas y Familias: los loaders explícitos volvían a validar el acceso también
  al navegar entre esas rutas. Se restauró la política anterior de reutilizar el
  snapshot **completo** de esas tres listas, exclusivamente si coincide su
  propietario con una sesión administrativa válida, sin MFA pendiente y sin
  caducar. Una entrada sin catálogo, otro propietario o un estado inválido sigue
  el loader autenticado completo. No es un atajo para editores, subidas,
  comandos, lecturas forzadas ni otros apartados; no se guarda un nuevo resultado
  de autorización. Las tres listas reutilizadas no afirman haber vuelto a
  consultar remotamente los permisos: mantienen la política de memoria anterior.
  Cuando corresponde verificar, Auth y `current_actor` se consultan ahora en
  paralelo con el **mismo token capturado**; ambas respuestas, la identidad,
  el token actual y su caducidad deben validarse antes de devolver una sesión.
  No se cachea la autorización. La restauración de un dispositivo de confianza
  conserva su verificación posterior independiente. Dos pruebas con respuestas
  retenidas reprodujeron primero la cadena serial y comprueban después que
  ninguna respuesta por sí sola permite completar el acceso.

### Trabajo de React

- El formulario construía aproximadamente 5.000 descendientes dentro de la
  selección de productos relacionados, aun estando cerrada. Ahora su contenido
  se monta al abrir el mismo desplegable nativo. La selección permanece en el
  borrador al cerrar y volver a abrirlo.
- El Home recalculaba las opciones del recomendador al escribir en el Hero.
  Se memorizó el cálculo con invalidación tanto por configuración como por
  cambios del vocabulario olfativo. Las comparaciones de borradores evitan
  recorrer estructuras cuando siguen siendo el mismo objeto inmutable.
- Los listados de Productos y Clientes reutilizan índices y proyecciones cuando
  los registros no cambian. Una búsqueda filtra esos índices en lugar de volver
  a construirlos en cada pulsación.
- Ofertas reutiliza los índices de marcas/productos, la ordenación y las opciones
  del selector. Las fechas, la vigencia y los precios de las promociones siguen
  evaluándose según las reglas existentes.
- Las miniaturas de fotografías y de ubicaciones multimedia usan `srcset` con
  variantes verificadas y tamaños apropiados. Se conservan el original de
  respaldo, los ALT y las vistas previas completas. La cuadrícula de Biblioteca
  ya utilizaba miniaturas y carga diferida; no se atribuye esa mejora a esta entrega.

### Datos, concurrencia y seguridad

- Las páginas privadas de catálogo y pedidos se leían consecutivamente. Ahora
  se obtiene primero la página que confirma el total y se leen las restantes en
  grupos de **hasta cuatro peticiones**, manteniendo orden y límites. No es una
  petición ilimitada ni un cambio de los contratos de paginación SQL.
- El grupo se drena antes de exponer un fallo y no se publica un catálogo o lista
  de pedidos parcialmente cargados. Un total inválido o cambiante cancela la carga.
- Se reprodujeron cinco carreras entre lecturas antiguas y escrituras: producto,
  estado de pedido, tarifas, guardado de cupón y eliminación de cupón. Una revisión
  de generación al comenzar y terminar cada comando impide que esas respuestas
  antiguas sustituyan el resultado confirmado.
- Se conservan la identidad del propietario, la continuidad de sesión, MFA,
  autorización SQL, control de versiones y las validaciones de cada petición.
  No se añadieron cachés compartidos de datos privados o permisos, ni se amplió
  el TTL de autorización. Los datos de otro administrador no se reutilizan.
- La publicación atómica descrita corresponde al snapshot administrativo. El
  parser compartido conserva sus efectos previos de registrar manifiestos y
  vocabulario durante la validación; no se afirma una transacción global del
  estado JavaScript ante cualquier respuesta malformada.

### SQL y entrega multimedia

La RPC `admin_media_library` contaba referencias de todo el historial antes de
seleccionar cada página. La migración
`20261112000100_media_library_page_queries.sql` selecciona primero la página para
los filtros Todos, Pendientes de eliminación y Eliminados; después cuenta sus
usos exactos. Utilizados y Sin uso mantienen el conteo global que necesitan para
filtrar correctamente. Se preservan el JSON público del contrato, propietario,
ACL, `SECURITY DEFINER`, `search_path` y la comprobación administrativa.

En el mismo clúster y con la RPC real, las medianas de tres consultas fueron:

| Consulta                    |     Antes |   Después |  Cambio |
| --------------------------- | --------: | --------: | ------: |
| Biblioteca, veinte recursos | 17,605 ms | 11,482 ms | −34,8 % |
| Búsqueda de un recurso      |  6,978 ms |  2,505 ms | −64,1 % |

Ambas respuestas conservaron exactamente el mismo JSON y tamaños de 17.827 y
933 bytes, respectivamente. No se añadieron índices sin evidencia: los planes
mostraron que este coste provenía del agregado global previo a la paginación.

El Worker ya sirve imágenes y vídeo mediante streaming, ETag, Range y variantes
verificadas. El decodificador se carga al subir archivos, no al navegar por el
panel. Se conservaron la verificación del manifiesto y las respuestas privadas
`no-store`; no se cachearon permisos para acelerar artificialmente R2.

### Código compilado

Se conservó un build anterior y se comparó con el build optimizado final de
staging. La tabla cuenta el módulo de entrada y sus dependencias ESM estáticas,
excluyendo destinos de imports dinámicos. No equivale a transferencia real en
cada visita: muchos módulos compartidos pueden estar ya cargados por el shell.

| Ruta                   | Bytes JS estáticos antes | Después |  Cambio |
| ---------------------- | -----------------------: | ------: | ------: |
| Productos              |                  908.371 | 812.771 | −10,5 % |
| Formulario de producto |                  908.371 | 868.980 |  −4,3 % |
| Marcas                 |                  831.647 | 778.229 |  −6,4 % |
| Clientes               |                  831.647 | 675.787 | −18,7 % |
| Detalle de pedido      |                  831.647 | 720.366 | −13,4 % |

La suma gzip por módulo de Productos pasa de 271.727 a 238.815 bytes y la de
Clientes de 241.244 a 195.866. No se utiliza el pequeño tamaño de un módulo de
reexportación para afirmar que una página completa pesa solo unas decenas de
bytes. Los inventarios son `before-bundles.json` y `after-bundles.json`.

## Verificación funcional y de calidad

- **APROBADO:** 102 pruebas de los módulos separados: productos, formulario,
  marcas, clientes, pedidos, importación, fotografías y estados de carga.
  Se verifican también relacionados al cerrar/reabrir, cambios sin guardar,
  reintentos, teclado y distintas anchuras. Salida real del proceso: 0.
- **APROBADO:** 58 pruebas adicionales de Home, recomendador, ofertas, cupones,
  envíos, navegación, ahorro de datos y estados táctiles. Salida real: 0.
- **APROBADO:** 49 pruebas de catálogo remoto y veinte de pedidos mediante
  SDK/transporte aislado. Después de los últimos cambios se repitieron siete
  casos de carga: tres entradas sin catálogo seguidas de visitas cálidas, dos
  catálogos de 1.000 registros y dos escenarios de pedidos de 1.000 registros.
  El getter de reutilización sigue falso con datos parciales y tras cerrar
  sesión; solo es verdadero al completar el catálogo del propietario válido.
- **APROBADO:** 81 pruebas de autenticación sobre el adaptador corregido:
  identidad, dos órdenes de respuesta, rechazo de Auth con actor aparentemente
  válido, cierre de sesión en vuelo, cambio de token, MFA, confianza y revocación
  de dispositivos, recuperación y cuentas independientes. Salida final: 0.
- **APROBADO:** dieciocho pruebas finales de tarifas y cupones, incluidos los
  tres casos de lectura anterior a una escritura. El primer intento de otra
  prueba agotó cinco segundos durante la recarga de página; se conserva su log
  y JSON, sin atribuirle un trace ya sobrescrito. La prueba sin cambios y la
  suite completa final se repitieron correctamente, sin ampliar tiempos.
- **APROBADO:** 26 pruebas de Biblioteca y fotografías con SDK real y transporte
  aislado: filtros, paginación, permisos, reintentos, conflictos, variantes,
  reutilización, SVG/EXIF y cinco tamaños de pantalla. Salida real: 0.
- **APROBADO:** siete pruebas de la lectura acotada de páginas, incluidos
  errores parciales, orden de respuestas, ausencia de publicación parcial,
  totales inválidos y el límite existente de cien páginas.
- **APROBADO:** 36 migraciones y 893 comprobaciones SQL locales, incluidas las
  240 comparaciones exactas de Biblioteca y pruebas de permisos y concurrencia.
  La transacción de fixtures se revirtió y el clúster se detuvo.
- **APROBADO:** generación local de tipos de Cloudflare, TypeScript y ESLint
  completo sin advertencias sobre la fuente corregida.
- **APROBADO:** ciclo completo `npm run build:staging`, con TypeScript,
  optimización, generación de recursos SEO y sellado de 386 archivos. Se usó
  configuración pública sintética de empaquetado; no se desplegó ese build.
- **APROBADO:** cuatro pruebas de los builds compilados, antes/después y
  escritorio/móvil, con catorce rutas por recorrido y transporte aislado.
  Salida real: 0. Se verifican también módulos diferidos y hojas CSS reales.
- **APROBADO:** cuatro casos adicionales de los builds compilados con 1.000
  clientes comerciales sintéticos, veinticinco filas por página y doce muestras
  de escritura en total. Se verifican resultados, limpieza, ausencia de nuevas
  consultas, errores y desbordamientos. No se escriben registros en ningún backend.
- **APROBADO:** cuatro pruebas reales con `Vite.resolveConfig` para separar la
  caché de dependencias de los servidores de prueba por su puerto efectivo,
  conservando las rutas habituales de desarrollo y build. Se investigó un
  arranque fallido del SDK: el trace registraba HTTP 504 «Outdated Optimize Dep»
  al importar Supabase, antes de emitir una sola solicitud de Auth. Las pruebas
  concurrentes compartían `node_modules/.vite`; ahora los servidores marcados
  usan `node_modules/.cache/aroma-tests/vite-<puerto>`. La marca común de pruebas
  no decide el puerto. No se modifica el build de producción ni la caché normal
  de desarrollo.
- **REVISADO:** `npm audit --omit=dev --audit-level=high` termina con salida 0,
  pero informa dos avisos moderados preexistentes en la cadena ExcelJS → uuid.
  No se presentan como cero vulnerabilidades. La corrección forzada propuesta
  rebajaría ExcelJS con cambios incompatibles; no se aplicó en esta auditoría.

Los fallos iniciales del instrumento, los arranques interrumpidos y las pruebas
negativas ejecutadas contra el código anterior se conservan separados de las
ejecuciones finales. No se cuentan como pruebas aprobadas ni se habilitaron
reintentos automáticos para ocultarlos.

## Límites y activación

- El catálogo y los pedidos todavía reúnen snapshots completos autorizados,
  con un máximo existente de 10.000 registros. La concurrencia acotada reduce
  espera pero **no reduce sus bytes ni los convierte en listados remotos por
  página**. Para crecer más se necesitan proyecciones SQL paginadas de lista y
  detalle y contratos explícitos para selección masiva, exportaciones e importación.
- Se conservan las políticas de frescura anteriores. Los comandos actualizan
  sus resultados e invalidan lecturas en curso; no se promete detectar al instante
  todos los cambios de otro administrador o de otro proceso. Una revisión global
  o suscripciones requieren un contrato adicional, no un TTL privado improvisado.
- El perfil SQL detectó mayor coste de las lecturas del catálogo con dispositivo
  de confianza AAL1 por validaciones en subconsultas. Las políticas ya utilizan
  `(SELECT private.is_admin())`. Se conservaron esos controles; una futura
  proyección DTO por conjuntos debe medirse sin debilitar la autorización.
- Se observaron solicitudes coincidentes de Biblioteca bajo StrictMode en
  desarrollo. Eso no demuestra un doble montaje en el bundle de producción;
  sus RPC ya se solapan. No se introdujo un nuevo caché con invalidación parcial:
  reutilizar esos resultados correctamente exige coordinar además asociaciones
  de productos, Home, ubicaciones, subidas y alias. Es un candidato para medir
  en producción si aparece congestión, no una mejora de latencia ya verificada.
- La migración SQL se probó localmente. **No se aplicó en bases alojadas ni se
  desplegó una nueva versión del Worker o de la web**. La mejora SQL alojada
  requiere aplicar esa migración mediante el flujo autorizado de despliegue.

Referencias técnicas utilizadas: [medición con Profiler](https://react.dev/reference/react/Profiler),
[memoización de cálculos](https://react.dev/reference/react/useMemo),
[módulos de rutas diferidos](https://github.com/remix-run/react-router/blob/main/decisions/0002-lazy-route-modules.md),
[optimización de consultas](https://supabase.com/docs/guides/database/query-optimization)
y [planes de PostgreSQL](https://supabase.com/docs/guides/api/query-plans).
