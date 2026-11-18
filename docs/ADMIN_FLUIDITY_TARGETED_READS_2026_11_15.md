# Fluidez administrativa y consultas específicas — seguimiento del 15 de noviembre

**Estado: implementación preparada; validación final desplegada pendiente.**
Este documento continúa
[ADMIN_SCALING_CONNECTION_AUDIT_2026_11_15.md](ADMIN_SCALING_CONNECTION_AUDIT_2026_11_15.md).
No sustituye sus resultados por estimaciones. La versión final está compilada
y subida a Cloudflare, pero todavía no se activó ni se midió como candidata
desplegada. No se declara recuperada la navegación SPA hasta esa comparación.

## Causa demostrada de la regresión administrativa

El listado paginado esperaba a que `actor()` terminara `GET /auth/v1/user`
antes de iniciar su RPC. La autorización de la ruta hacía en paralelo su
propia comprobación, pero la lectura de productos/pedidos seguía acumulando
dos viajes de red. Por ejemplo, una navegación alojada anterior registró
126 ms de verificación, después 169 ms de listado y unos 323 ms hasta la
interfaz. Pedidos mostró la misma secuencia: 129 ms y luego 131 ms.

La instantánea completa antigua ya estaba en memoria y no pagaba ese segundo
viaje; de ahí su ventaja con el catálogo pequeño, a costa de descargarlo todo
previamente. Se conserva la paginación remota para evitar esa reconstrucción.

## Solución implementada

`src/services/admin-protected-read.ts` inicia la verificación remota de
identidad y la RPC protegida de SQL **en paralelo**, con la misma credencial.
Espera ambas antes de devolver, interpretar o publicar registros. SQL sigue
comprobando membresía y MFA en cada llamada; no se concede acceso por el
estado de React ni por la existencia de una respuesta en memoria.

El coordinador comparte solamente operaciones todavía pendientes con la misma
credencial, propietario, revisión de acceso, consulta y generación de escritura.
Una llamada posterior a la finalización vuelve a leer el servidor. No se
introdujo TTL de fichas administrativas, caché de precios/stock, localStorage
de confianza ni una decisión de autorización reutilizable.

Las escrituras invalidan las lecturas antes de comenzar y al terminar. Una
respuesta anterior no puede reemplazar la respuesta canónica de una escritura.
Cerrar sesión, cambiar de usuario, perder permisos o MFA impide publicar datos.
La renovación del token del mismo administrador descarta la consulta anterior
sin tratarla como pérdida de permisos. No se oculta con reintentos automáticos.

Se aplicó a páginas de Productos, Pedidos, Clientes y Resumen; detalles y
selección explícita de pedidos; consultas específicas del catálogo; y lectura
administrativa de Envíos/Cupones. La configuración pública conserva su política
previa. Los componentes privados de coordinación se importan bajo demanda para
mantener la frontera de arranque público que verifica el build.

El documento del Home y sus metadatos ahora también se consultan en paralelo.
No se recuperan ni se muestran fichas completas para abrir ese editor.

**Alternativas no adoptadas:** reutilizar fichas ya resueltas durante un TTL o
precargar datos comerciales y tratarlos como actuales al hacer clic. Sin una
prueba nueva de vigencia podrían ocultar cambios de otro administrador. Esta
fase elimina primero la dependencia serial demostrada; el resultado real
antes/después del navegador queda pendiente, no se sustituye por una promesa.

## Colecciones completas sustituidas

| Interfaz | Lectura actual |
| --- | --- |
| Marcas y Familias | `admin_catalog_context`: diccionarios, versiones y conteos, sin fichas de productos |
| Home | Documento editorial y contexto; opciones agregadas del recomendador solo al abrir su pestaña |
| Destino de producto del Hero | `admin_catalog_choices`: búsqueda por nombre/marca/SKU, máximo cien identidades y selección explícita |
| Ofertas | `admin_offer_list`: doce fichas por grupo; grupos siguientes al aproximarse al final de la lista |
| Nueva oferta | Nombres e IDs al abrir el formulario; solo la ficha elegida para precios, variantes y versión |
| Recomendaciones manuales | Identidades por grupos de cien al desplegar/desplazarse, incluyendo los IDs ya seleccionados |
| Excel | `admin_import_conflicts`: únicamente las identidades propuestas en el archivo, máximo mil filas |
| Recuperación de un resultado de importación incierto | `admin_products_by_ids`, máximo cien IDs por llamada, sin reconstruir el catálogo |

La lista de ofertas conserva su composición continua. Una revisión calculada
con IDs y versiones detecta cambios entre grupos, incluso si el total no
cambió; se reinicia la lectura en lugar de mezclar grupos con desplazamientos
incompatibles o duplicados. Al guardar se revalida la lista y se conservan las
versiones esperadas y el cálculo centralizado de descuentos.

Los diccionarios de marcas/familias permanecen completos: se necesitan para
los selectores nativos y la revisión de listas de marcas pegadas. No incluyen
fotografías, variantes ni textos de todos los productos. El selector nativo de
nueva oferta conserva sus opciones y navegación por teclado; al abrirlo carga
identidades en páginas de cien, no documentos completos. No se afirma que toda
lista de nombres se reduzca a una única página si su interacción necesita todas
las opciones. Los contratos completos antiguos se conservan para compatibilidad
con consumidores que todavía los invoquen expresamente.

### Excel e integridad

Se conservan las validaciones de columnas, filas, agrupación de presentaciones,
familias, marcas, precios, descuentos y duplicados dentro del archivo.
El servidor comprueba globalmente slug, nombre dentro de la marca y SKU sin
devolver productos ajenos al archivo. La escritura existente sigue siendo la
autoridad final ante concurrencia; una prevalidación no reserva un SKU.

La normalización de nombre conserva NFD, retirada de diacríticos, minúsculas y
recorte. No se asignan familias, productos ni SKU inventados para resolver
conflictos. Un fallo de consulta conserva el archivo/borrador y no anuncia éxito.

## Datos representativos en PostgreSQL aislado

Fixture transaccional: 3.000 productos, 3.000 variantes, 1.000 marcas y 1.000
ofertas. Tres muestras por alternativa; medianas. Sin cargar esos fixtures en
Supabase alojado.

| Trabajo | Llamadas | Tiempo SQL | JSON de respuesta |
| --- | ---: | ---: | ---: |
| Reconstrucción completa anterior | 30 | 591,5 ms | 7.863.924 B |
| Contexto administrativo sin productos | 1 | 4,2 ms | 160.088 B |
| Primera página de ofertas | 1 | 6,5 ms | 14.816 B |
| Conflictos de mil filas Excel | 1 | 16,1 ms | 41.896 B |

Son tiempos de PostgreSQL nativo y tamaños JSON de texto, no latencia HTTP ni
transferencia comprimida de una red real. El bucle completo anterior es
secuencial; no se presenta como una reproducción de la concurrencia HTTP del
navegador. No se añadieron índices, tablas o dependencias.

La suite completa de SQL aprobó **994 comprobaciones y 42 migraciones**,
incluyendo autorización anónima/cliente/AAL1, revocación, límites, coherencia de
versiones, solicitudes concurrentes, importación y contratos anteriores.
Artefacto: `artifacts/supabase-sql-tests/run-oHW11N/result.json`.

## DNS y carga fría

Se completaron 54 visitas públicas de referencia, 48 visitas de diagnóstico
DNS/protocolo y 24 navegaciones del experimento de precarga de Tienda. Chrome
real con caché fría/caliente; CPU ×4 y redes emuladas para móvil. Son el mismo
equipo e ISP: no equivalen a pruebas desde varias redes físicas.

El nuevo NetLog y el anterior de 1.026 ms permiten demostrar la secuencia:

1. Chrome envía una consulta UDP al primer resolver configurado.
2. No registra recepción de bytes para ese intento.
3. Tras aproximadamente un segundo intenta el resolver secundario.
4. Este devuelve una respuesta válida en aproximadamente 1–2 ms.
5. Después empieza QUIC/HTTP; PostgreSQL y el Worker no habían recibido aún
   la solicitud del documento.

El NetLog registra un timeout de resolución de un segundo y dos intentos.
El incidente anterior corresponde a una consulta A; el nuevo reproduce el
recorrido con una AAAA. No se confunden las dos transacciones ni tráfico de
fondo de Chrome. Esto identifica la espera por el resolver y su fallback,
**no la causa del primer intento sin respuesta**: faltan captura de paquetes y
registros del resolver para distinguir pérdida, trabajo recursivo o respuesta
de la autoridad. No prueba un fallo de Supabase ni de Cloudflare Workers.

Se compararon HTTP/3 predeterminado, HTTP/2 y dos proveedores DoH en perfiles
temporales de Chrome. NetLog confirmó sus preferencias; no se modificó DNS del
sistema, IPv6, certificados, protocolos del servidor ni producción.

| Perfil de diagnóstico, conexión nueva | DNS p50 / máximo | Foto lista p50 |
| --- | ---: | ---: |
| Predeterminado | 15 / 1.018 ms | 3.328 ms |
| HTTP/2 | 7 / 1.098 ms | 3.816 ms |
| DoH Cloudflare, perfil temporal | 14 / 1.002 ms | 3.439 ms |
| DoH Google, perfil temporal | 190 / 223 ms | 3.546 ms |

Cuatro procesos/perfiles nuevos por alternativa, además de conexión reutilizada
y caché caliente. DoH puede pagar su propio arranque DNS/TLS; Cloudflare DoH
también sufrió el fallback al resolver su host. No hay evidencia para imponer
otro DNS o desactivar QUIC a todos los clientes. Los perfiles temporales son
instrumentación diagnóstica, no configuración comercial del sitio.

La referencia móvil lenta registró LCP de 3.260 ms en Home, 3.232 en Tienda y
3.264 en ficha **con DNS máximo inferior a 41 ms en esas celdas**. Por tanto el
LCP habitual de 3,3 segundos no se explica por el pico DNS. Siguen influyendo
transferencia de CSS/JavaScript, arranque de React y descubrimiento de contenido.
No se hicieron fragmentaciones generales ni cambios visuales para mejorar cifras.

## Mejora pública justificada: primera imagen del catálogo

En Tienda, la primera imagen todavía se descubría después de montar React,
cerca de 2,8 segundos en móvil lento. Se comparó el mismo HTML con y sin una
precarga de la imagen exacta, en secuencia ABBA, con la misma interceptación en
ambos brazos. Seis parejas móviles lentas y tres por cada uno de los otros dos
perfiles; se conservaron los picos de TTFB.

| Imagen de Tienda lista, p50 | Control | Precarga experimental |
| --- | ---: | ---: |
| Escritorio | 914 ms | 715 ms |
| Móvil | 1.387 ms | 1.212 ms |
| Móvil lento | 3.240 ms | 2.940 ms |

El LCP experimental móvil lento fue 3.256 → 2.952 ms. El descubrimiento pasó
de 2.784 → 327 ms. Cada navegación pidió una sola vez la foto seleccionada.
Los intervalos posteriores a cabeceras también mejoraron; no se adjudica la
diferencia del TTFB de un pico al hint.

La implementación utiliza únicamente el primer producto del resultado fresco
de `catalog_browse` para esa URL/filtro/orden/página, con su manifiesto validado,
`imagesrcset` y el mismo `sizes` de la card. No añade otra consulta, variantes
inventadas, vídeo móvil ni permisos públicos en R2. Si el recurso no está
verificado o el resultado está vacío, no genera precarga.

**Límite pendiente:** el experimento insertaba el hint en el head de una
respuesta controlada; la implementación lo integra con la proyección inicial
en streaming sin retrasar el head esperando al catálogo. La ganancia exacta de
la versión desplegada aún debe medirse. No se sustituye esa medición por la del
experimento ni se afirma que Home y ficha hayan mejorado con este cambio.

## Validaciones y estado del despliegue

| Comprobación | Estado |
| --- | --- |
| TypeScript, lint, 198 pruebas Node, build staging y dry-run Wrangler | APROBADO |
| 994 comprobaciones SQL, 42 migraciones | APROBADO, PostgreSQL aislado |
| Migración `20261115000100_admin_targeted_catalog_reads.sql` | APROBADO, aplicada solo a desarrollo |
| Historia remota, RLS, permisos y datos comerciales | APROBADO; 42 migraciones, ninguna pendiente en desarrollo |
| Tipos | APROBADO; regenerados oficialmente desde Supabase de desarrollo |
| Pedidos/sesiones/invalidation | 34 pruebas aprobadas |
| Auth/MFA | 82 pruebas aprobadas |
| Envíos/cupones | 18 pruebas aprobadas |
| Medios en navegador | 30 pruebas aprobadas |
| Documento/SEO/workerd | 60 pruebas aprobadas |
| Selección carrito/favoritos aislada | 9 pruebas aprobadas |
| Suite completa de catálogo, 91 casos | PENDIENTE de una ejecución final estable |
| Activación de versión final, verificación de assets y medición candidata | PENDIENTE de disponibilidad de ejecución |

La última ejecución completa de catálogo tuvo 83 casos aprobados y ocho fallos
de selección; los nueve casos de selección pasaron después al ejecutarlos
aisladamente. Hubo builds/cambios de fuente durante intentos anteriores. Esa
coincidencia no demuestra por sí sola una causa; por eso no se da por aprobada
la suite completa ni se aumentaron sus timeouts/reintentos. Los tres casos
nuevos de escala de marcas/Excel y ofertas pasaron en el último recorrido.

Las 126 navegaciones administrativas de referencia con Auth/TOTP alojados
terminaron, sin cambios comerciales; la identidad QA se retiró. Se midió el
trabajo de rutas mediante clics programáticos de enlaces para separar la
animación del menú móvil. No se presentan como latencia completa de un toque
físico. Aún falta su cohorte equivalente de la versión candidata: no hay una
nueva tabla de navegación SPA antes/después aprobada.

La migración añade cinco RPC de lectura con ejecutores restringidos y
`search_path` vacío. Se conservaron las 41 migraciones previas y las huellas de
datos comerciales. No se modificaron RLS, Auth/MFA, inventario, precios, pagos,
almacenamiento privado de R2, limpieza multimedia o configuración de producción.

| Identificación preparada | Valor |
| --- | --- |
| Worker | `aroma-infini-frontend-staging` |
| Última referencia activa comprobada antes del intento de activación | `27a0a2ff-019b-48bf-9c5a-599eb8fd4db5` |
| Versión final subida, aún sin activar por esta entrega | `c2ca5aa0-921c-489b-91e4-482f6cf9f3db` |
| SHA-256 del paquete final | `a871e7cac17801f5a96901d079683a9688b44ea5fe7073f17f5ecb94ced8eee4` |
| Proyecto de desarrollo | `tkxvexfapszilzhogvgu` |
| Hash del esquema de desarrollo después de aplicar | `b53b7afbad51b4418bc71869b819a6da778d8f3b963eb38b4e6250eb3e0d503f` |

Se conservaron los 164 archivos de la instantánea inicial de trabajo. Los nueve
archivos de estilo/configuración/dependencias comprobados conservaron sus
bytes. No se hizo commit, push, cambio de rama o eliminación de archivos
versionados. Las evidencias locales están en
`artifacts/admin-fluidity-2026-11-15/result.json` y `resume.json`.

## Reanudación exacta

El usuario eligió **reanudar cuando esté disponible la ejecución**, después de
que el servicio de revisión automática rechazara ejecutar la siguiente llamada
por su límite de uso. No indicó que la acción fuera insegura; no se ejecutó esa
llamada ni se intentó eludir la revisión mediante otro canal.

Cuando se restablezca, quedan estas actividades, en este orden:

1. Repetir la suite completa de catálogo sin builds ni cambios de fuente simultáneos.
2. Volver a comprobar rama/HEAD, paquete, bindings y estado de staging.
3. Activar solo la versión final en staging; producción continúa excluida.
4. Verificar assets servidos, entorno, esquema y referencias antes de medir.
5. Ejecutar las cohortes administrativas y públicas candidatas sin otras pruebas
   que compitan por CPU; separar consultas, disponibilidad de interfaz y navegación.
6. Validar el recorrido público en cinco resoluciones, menú administrativo móvil
   y seguridad HTTP, sin compras, pagos ni escrituras comerciales reales.
7. Comparar muestras completas, incluidas regresiones, DNS y caché fría/caliente;
   decidir si conservar la candidata o corregir cualquier regresión demostrada.
8. Confirmar la versión de staging elegida al 100 % y completar este informe con
   métricas reales. No declarar cerrada la recuperación de fluidez antes de eso.

Los comandos y scripts ya preparados se enumeran en `resume.json`. No incluyen
credenciales ni un despliegue de producción. Los artefactos de red conservan
metadatos técnicos y deben revisarse antes de compartirlos con proveedores.
