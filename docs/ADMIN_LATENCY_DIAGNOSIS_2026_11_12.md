# Demoras del administrador en localhost — 12 de noviembre de 2026

Esta revisión continúa la [auditoría anterior](ADMIN_PERFORMANCE_AUDIT_2026_11_12.md).
El usuario confirmó que la demora ocurre con `npm run dev`. Se conservaron los
cambios anteriores; no se cambió el diseño ni las reglas de compra.

## Causas comprobadas

### 1. El frontend local y Supabase no tienen la misma versión

Al comenzar, la consulta de solo lectura `supabase migration list --linked`
confirmó que el proyecto de desarrollo vinculado tenía 31 migraciones, frente a
las 37 locales. Las seis que faltaban eran:

| Migración        | Función                                   |
| ---------------- | ----------------------------------------- |
| `20261111000100` | Dispositivos administrativos de confianza |
| `20261111000200` | Biblioteca y referencias multimedia       |
| `20261111000300` | Recursos integrados y asociaciones        |
| `20261111000400` | Recursos vectoriales                      |
| `20261112000100` | Consultas paginadas de Biblioteca         |
| `20261112000200` | Proyección del catálogo por página        |

Las RPC públicas `site_media_document` y `public_media_aliases` devolvieron HTTP
404/PGRST202: **función ausente en el caché de esquema**, no un timeout. No se debe
interpretar ese error como falta de capacidad del plan gratuito. Las optimizaciones
SQL locales tampoco pueden mejorar la base remota hasta que se apliquen.

No se ejecuta una actualización general de esquema silenciosamente: incluye
cambios anteriores de autorización y multimedia, además de rendimiento.
El estado remoto y los errores están registrados sin credenciales ni filas
privadas en `artifacts/admin-latency-followup-2026-11-12/`.

**Resuelto con autorización explícita:** el usuario aprobó «Sí, sincronizar solo
desarrollo». Se creó y verificó primero un respaldo protegido; el dry-run oficial
incluyó exactamente esos seis archivos, sin seeds ni roles adicionales. Después
se aplicaron con la CLI de Supabase. El estado final es **37/37 migraciones** y
ambas RPC públicas responden HTTP 200. Producción no se modificó.

### 2. Promociones esperaba conjuntos que no utilizaba

Antes, abrir Cupones esperaba tanto el catálogo completo como los cupones y las
tarifas; abrir Ofertas volvía a consultar esos datos comerciales aunque el panel
solo necesita productos y marcas. Los cambios de pestaña vuelven a ejecutar los
loaders de React Router.

**Corregido:** el loader selecciona su dependencia según `vista`:

- Cupones: configuración comercial y cupones, sin descargar productos.
- Ofertas: catálogo, sin solicitar cupones o tarifas.

Se mantienen la comprobación remota de acceso, la revalidación normal, los enlaces
directos, la protección del borrador y las escrituras con versión. Al pasar a
Ofertas desde una entrada sin catálogo, se carga antes de mostrar el panel. Al
regresar a Cupones se consulta su estado actual; no se añadió un TTL de permisos.

Tres pruebas nuevas fallaron antes por las solicitudes sobrantes. Los seis casos
del archivo de cargas administrativas terminaron después con salida real 0,
incluyendo permisos revocados y creación/edición de cupones.

Se compararon los builds compilados anterior y nuevo con 1.000 productos,
latencia HTTP sintética de 200 ms para Auth/RPC y tres repeticiones por acción.
Cuatro recorridos secuenciales, escritorio y móvil CPU ×4, reunieron 36 muestras:

| Acción                                         | Escritorio antes → después | Móvil antes → después |
| ---------------------------------------------- | -------------------------: | --------------------: |
| Abrir Cupones con datos vacíos en memoria      |           1.917 → 1.005 ms |      2.082 → 1.419 ms |
| Entrar por primera vez a Ofertas desde Cupones |             844 → 1.371 ms |        934 → 1.445 ms |
| Volver a Cupones                               |               847 → 840 ms |          920 → 934 ms |
| Recorrido completo de las tres acciones        |           3.630 → 3.196 ms |      3.939 → 3.824 ms |

**Coste explícito:** las diez páginas de catálogo se desplazan de la entrada a
Cupones a la primera entrada a Ofertas. La primera apertura de Ofertas puede
tardar más; no se presenta como una aceleración de todas las acciones. El
recorrido completo mejoró 11,9 % en escritorio y 2,9 % en móvil; este último es
un cambio pequeño. Volver a Cupones mantiene la consulta actualizada. No se
precargan miles de productos sin intención de usarlos para maquillar los tiempos.

Estas mediciones usan contratos HTTP atendidos localmente: no miden el Supabase
alojado ni contienen la ganancia de SQL de la migración. Todos los estados API
fueron 200, sin escrituras, errores o hosts ajenos al fixture.
Evidencia: `navigation-metrics-summary.json` en la carpeta de artefactos.

### 3. Volver a Pedidos disparaba dos recargas completas

`focus` de la ventana y `visibilitychange` del documento llamaban directamente a
`loadAdminOrders(true)`. El refresco forzado omite intencionadamente el caché y la
reutilización de lecturas pendientes para poder detectar revocaciones y cambios.
Ambos eventos podían lanzar dos recorridos completos del historial.

**Corregido:** los eventos del mismo fotograma se agrupan en una sola lectura.
Ocultar la pestaña o desmontar el apartado cancela el trabajo aún no iniciado.
Los siguientes eventos de foco siguen refrescando; no se alteró la semántica del
servicio forzado ni se eliminó la comprobación de permisos.

La regresión previa mostró dos nuevas llamadas HTTP cuando se esperaba una.
Después pasan las tres regresiones y la suite completa de Pedidos: **23/23**,
salida 0, sin reintentos. La denegación inmediata sigue retirando las filas privadas.

### 4. La consulta SQL del catálogo repetía trabajo por cada perfume

La inspección real de `pg_stat_statements` del proyecto de desarrollo identifica
una sentencia que llama a `admin_product_document`: 106 ejecuciones, 23,379 s
acumulados y 30,2 % del tiempo representado por el informe. Son estadísticas
acumuladas de una sentencia envolvente; **no son el tiempo actual de un clic ni
el coste de cada producto**. No se guardaron los textos SQL o datos privados.

El perfil local ya había mostrado que la selección de IDs era barata y la
construcción repetida de documentos era el coste importante. Añadir un índice a
esa selección no resuelve este problema.

**Implementado y validado localmente:** la migración `20261112000200` construye
los documentos de la página en una consulta por conjuntos, conservando todas las
políticas RLS. El helper utilizado para responder a escrituras permanece intacto.
No se cachean permisos, no se modifica MFA y no cambia la respuesta JSON.
La optimización también quedó aplicada a desarrollo en la sincronización
autorizada; la siguiente tabla sigue mostrando mediciones locales, no tiempos
del servidor alojado después del despliegue.

En el mismo PostgreSQL aislado, con calentamiento y tres muestras seriales:

| Consulta SQL                                  |        Antes |      Después | Reducción |
| --------------------------------------------- | -----------: | -----------: | --------: |
| 100 productos, sesión AAL2                    |   147,683 ms |    61,192 ms |    58,6 % |
| 100 productos, dispositivo de confianza AAL1  |   343,519 ms |   108,471 ms |    68,4 % |
| Trabajo SQL completo de 1.000 productos, AAL2 | 1.405,655 ms |   609,063 ms |    56,7 % |
| Trabajo SQL completo de 1.000 productos, AAL1 | 3.412,940 ms | 1.126,772 ms |    67,0 % |

La prueba de 1.000 registros suma diez RPC dentro de SQL para medir trabajo de
base de datos: no equivale al tiempo de las cuatro peticiones concurrentes del
navegador. Los tamaños de respuesta siguen siendo 444.250 bytes por primera
página rica y 4.441.809 bytes para el conjunto completo. El JSON coincide
exactamente, al igual que propietario, ACL, `search_path` y límites.

La suite nativa completa supera **37 migraciones, 911 comprobaciones SQL y todas
las auditorías de concurrencia**, incluida revocación y dispositivos de confianza
reales dentro del fixture SQL. El clúster se detuvo y la transacción de datos
sintéticos se revirtió. Evidencia: `artifacts/admin-catalog-projection-2026-11-12/`.

### 5. Desarrollo local y latencia de red

Aunque la web esté en localhost, Supabase y R2 siguen siendo servicios remotos.
Las cuatro lecturas públicas seriales realizadas devolvieron encabezados en
130–390 ms; sus respuestas fueron 404, por lo que **no miden el coste SQL normal
de esas funciones**. Muestran tiempo real de red/gateway, no latencia cero.

Después de sincronizar desarrollo se repitieron las mismas cuatro lecturas:
**HTTP 200 en los cuatro casos**, con tiempos totales de 131–197 ms. Son muestras
puntuales de dos RPC públicas pequeñas, no percentiles de las rutas privadas.

Al cargar la página de acceso se observaron unos 195 módulos de script y 11,2 MB
transferidos en desarrollo. Es una señal del coste de módulos y transformaciones
de Vite, no el tamaño del bundle de producción ni una explicación suficiente de
cualquier demora posterior. No se atribuye toda la espera a ese número.

La sesión que el usuario abrió estaba en Edge. La herramienta de inspección
nativa detuvo el acceso porque no pudo verificar su URL con suficiente certeza.
El navegador de diagnóstico separado permaneció sin sesión administrativa. Por
ello **no se afirma haber medido el clic real de ese usuario en las rutas
privadas**; sí se midieron la base local, contratos HTTP y estadísticas agregadas
del Supabase conectado. No se extrajeron tokens de su navegador.

## ¿Es Supabase Free?

La documentación oficial distingue el cómputo Nano del plan gratuito y Micro o
superior en los planes de pago. Eso puede influir con carga, pero no demuestra
que este proyecto esté saturado. Tampoco explica las funciones ausentes, las
consultas de conjuntos innecesarios ni las recargas duplicadas.

No se recomienda contratar más recursos como sustituto de estas correcciones.
Para justificar un cambio de plan todavía hay que medir las rutas privadas con
sesión real y comprobar CPU, memoria, conexiones y consultas en el entorno alojado.
No se hicieron pruebas agresivas ni se cambió el plan.

Fuentes oficiales: [cómputo de Supabase](https://supabase.com/docs/guides/platform/compute-and-disk),
[pausa de proyectos gratuitos](https://supabase.com/docs/guides/platform/free-project-pausing),
[optimización de consultas](https://supabase.com/docs/guides/database/query-optimization).

## Activación

Las correcciones de React están en el workspace y se aplican en el servidor
local. **Las seis migraciones ya están aplicadas al proyecto de desarrollo**,
incluida la nueva proyección del catálogo. No se desplegó un frontend o Worker
nuevo en staging ni producción; producción no se modificó.

El respaldo previo tiene ACL privada de Windows, cifrado AES-GCM y clave
protegida con DPAPI, con comprobación de ida/vuelta y sin paquete en texto plano
retenido. El informe de la sincronización confirma que las **68 tablas
preexistentes conservaron cantidades y hashes de contenido exactos**, incluidos
usuarios, sesiones, membresía administrativa, catálogo, pedidos y referencias
multimedia. El helper de respuesta a escrituras conserva su hash. Las nuevas
tablas tienen RLS forzado y las llamadas administrativas anónimas siguen
rechazadas. No se crearon cuentas o pedidos de prueba en el proyecto alojado.

Evidencia de activación: `development-db-apply.json`, `development-db-after.json`
y `development-public-rpc-verification.json` en la carpeta de artefactos.

## Validación final

- Build optimizado de staging y TypeScript: aprobados; no se publicó el build.
- ESLint completo: aprobado, sin advertencias.
- Cargas administrativas: seis casos aprobados con SDK real y transporte aislado.
- Pedidos: 23 casos aprobados, incluidas las tres regresiones nuevas.
- PostgreSQL local: 37 migraciones, 911 comprobaciones y concurrencia aprobadas.
- Builds compilados: cuatro recorridos, catorce rutas cada uno, escritorio/móvil;
  los **28 pares de capturas son idénticos píxel a píxel**, sin máscaras.
- Navegación de Promociones: cuatro casos, 36 muestras, salida real 0; se conserva
  el coste de la primera carga de Ofertas en los resultados.
- Desarrollo alojado: respaldo previo verificado, seis migraciones autorizadas,
  hashes de las 68 tablas previas conservados y once comprobaciones de seguridad
  correctas. RPC públicas 200; acceso administrativo anónimo rechazado.

Los primeros intentos de teardown del runner de SDK y los fallos de regresión
contra el código anterior se conservan separados de los resultados finales. No
se habilitaron reintentos automáticos ni se rebajaron validaciones para aprobar.

Se mantiene el límite anterior: Productos y Pedidos todavía reúnen conjuntos
completos autorizados, hasta 10.000 registros. Esta entrega reduce esperas y
trabajo SQL, pero no convierte esos contratos en paginación remota de lista.
