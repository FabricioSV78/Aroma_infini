# Auditoría integral de Aroma Infini

4 de noviembre de 2026, Lima. Informe histórico de esta revisión. La validación
actual de lanzamiento, con estado real de servicios y bloqueos, está en
[LAUNCH_AUDIT_2026_11_06.md](LAUNCH_AUDIT_2026_11_06.md).

Se revisaron tienda y navegación, ficha, filtros, precios, favoritos, carrito, checkout simulado, seguimiento, cuenta y recuperación, páginas informativas, reclamaciones, panel, importación, medios, notificaciones, permisos SQL y preparación de despliegue. Se preservaron el diseño aprobado y las reglas comerciales actuales.

## Incidencias corregidas

| Hallazgo                                                                                                                                | Corrección y comprobación                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El checkout podía borrar unidades añadidas desde otra pestaña mientras esperaba la confirmación.                                        | Descuenta únicamente las cantidades confirmadas del estado actual del carrito. Regresión de concurrencia entre pestañas aprobada.                                                                                                                                                                    |
| Una excepción inesperada del checkout podía mostrar su texto técnico.                                                                   | Solo `UserFacingError` conserva un mensaje escrito para el cliente; el resto muestra un aviso seguro, conserva los datos y permite reintentar. Se mantiene la prueba que introduce un error interno y comprueba que no se publica.                                                                   |
| `closeDisabled` bloqueaba la X del modal, pero permitía cerrarlo con Escape o desde el fondo durante una operación.                     | Los tres mecanismos respetan el bloqueo. Verificados teclado, finalización y recuperación del foco.                                                                                                                                                                                                  |
| Las lecturas de cuerpos incompletos podían quedar esperando; algunos caminos también esperaban una cancelación que podía no terminar.   | Límites de tamaño y plazo en checkout, reclamaciones, carga de medios y suscripciones push; cancelación sin bloquear la respuesta. Las cargas de medios conservan un plazo de 120 segundos. Las respuestas de Auth/confirmación del checkout también se acotan.                                      |
| La barrera de build detectaba claves privilegiadas de Supabase, pero no otros secretos colocados accidentalmente en variables públicas. | Detector compartido por Vite, comprobación de producción y verificación de paquetes. Rechaza nombres de credenciales, claves privadas y valores privilegiados sin imprimirlos. La prueba con contraseña sintética detiene Vite antes del build. No se identificó una credencial real publicada.      |
| El Libro de reclamaciones descargaba las librerías de PDF al abrir el formulario.                                                       | PDF y tipografía se importan al descargar la constancia. Antes se observaban 1.131.703 bytes de Fontkit sin comprimir, 506.663 transferidos, aunque no se descargara ningún documento. Se verificó que el PDF completo sigue generándose.                                                            |
| La campana del panel desbordaba el encabezado en móviles pequeños.                                                                      | En hasta 379 px las acciones pasan a una segunda fila. Se mantienen Notificaciones, Ver tienda, Salir y Menú, sin reducir sus zonas de interacción. Medición: 360 px pasaba a 373 px de contenido; ahora cabe. Comprobados también 320, 375 y 390 px.                                                |
| Las migajas de Reclamaciones tenían otra separación respecto a la cabecera.                                                             | Se unificó a 24 px en escritorio y móvil.                                                                                                                                                                                                                                                            |
| El auditor SQL solo reconocía las RPC y roles de las primeras migraciones.                                                              | Se actualizó al contrato de 15 RPC públicas, todos los ejecutores y las tablas sensibles con FORCE RLS. Once comprobaciones y ocho mutaciones negativas verifican que el auditor detecta permisos inseguros.                                                                                         |
| Avisos altos en herramientas de desarrollo.                                                                                             | Vite 8.2.4, Wrangler 4.153.0, Sharp 0.35.5 y actualizaciones transitivas compatibles. Se conservaron los rangos existentes y el lockfile; no se usó `audit fix --force`, overrides globales ni descensos mayores. Se aprobaron únicamente los instaladores nativos versionados de esbuild y workerd. |

También se actualizaron contratos de pruebas que todavía esperaban compras simuladas pagadas, consumo de stock/cupón, ausencia del formulario de reclamaciones, SKU vacíos o textos de secciones retirados. Las pruebas conservan sus comprobaciones de precios, validación, navegación y persistencia. Los escenarios de pago aprobado del adaptador local se declaran explícitamente como fixtures aisladas; no son pagos reales ni alteran la base alojada.

## Validación y alcance real

| Comprobación                                 | Resultado                                                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suite general                                | 1.229 casos activos distintos aprobados de un inventario de 1.232; tres capturas opcionales omitidas intencionalmente.                                                                              |
| Guardas Node                                 | 114 pruebas aprobadas: configuración, builds, respaldos, restauración y límites públicos de credenciales.                                                                                           |
| PostgreSQL local aislado                     | 25 migraciones y 668 comprobaciones; concurrencia de SKU, marcas, familias, stock, medios, Home, pedidos y favoritos. Incluye ocho pruebas negativas del auditor.                                   |
| SQL alojado                                  | Once comprobaciones de solo lectura aprobadas en desarrollo y producción; ambas bases tienen las 25 migraciones. Sin permisos de tablas internas para navegador ni herencia de roles ejecutores.    |
| API pública alojada                          | 53 comprobaciones aprobadas sin cuentas nuevas, escrituras ni claves privilegiadas de navegador.                                                                                                    |
| Staging HTTP                                 | Páginas, recursos compilados y cinco imágenes R2 publicadas verificados; 67 solicitudes, sin escrituras.                                                                                            |
| Auth/cuenta                                  | 66 casos distintos aprobados entre la pasada y dos repeticiones aisladas; registro, sesión, MFA, perfil, ubicación y recuperación.                                                                  |
| Catálogo remoto                              | 24 casos distintos aprobados, incluida la repetición de una navegación interrumpida.                                                                                                                |
| Favoritos / pedidos / Home / comercio remoto | Suites de 15 / 17 / 8 / 8 casos aprobadas con SDK y transporte aislados.                                                                                                                            |
| Fotos / reseñas / configuración / checkout   | Suites de 12 / 14 / 16 / 12 casos aprobadas con transporte aislado.                                                                                                                                 |
| Web Push                                     | 43 contratos, criptografía, PWA y runtime nativo aprobados; 14 pruebas de interfaz/SDK aprobadas. No se envió una notificación comercial.                                                           |
| Reclamaciones                                | 22 casos aprobados, incluidos formulario, estados, límites, descarga y PDF de varias páginas.                                                                                                       |
| Código y paquetes                            | TypeScript, lint, compilación y comprobación de paquete por entorno.                                                                                                                                |
| Respaldos actuales                           | Exportación cifrada y restauración local aprobadas para los dos entornos; 68 tablas por entorno. Tarea diaria habilitada, último resultado 0, próxima ejecución 5 de noviembre a las 02:00 de Lima. |

Los números de suites se muestran por separado: algunas comparten contratos y **no deben sumarse como casos únicos**. La suite general se completó en varias pasadas. Los fallos iniciales, contratos antiguos, recargas de Vite y repeticiones quedan conservados; no se presenta una primera ejecución fallida como una pasada limpia. El inventario consolidado es `artifacts/full-audit-2026-11-04/test-coverage.json`.

Las pruebas SQL crean PostgreSQL temporal local y retiran sus datos. Las suites SDK interceptan el transporte y no equivalen por sí solas a una compra o carga alojada. Esta auditoría no creó ventas ni cambió tarifas, catálogo, cuentas o fotografías comerciales en los entornos alojados.

### Revisión visual

Se recorrieron 33 rutas públicas/administrativas y siete del perfil en 1920 × 1080, 1366 × 768, 768 × 1024 y 390 × 844: **160 vistas**. Otras suites cubren 1440 × 900 y anchos de 320 a 2560 px. Se conservaron 200 capturas locales: 196 del recorrido y sus recapturas —incluidas 36 con desplazamiento para cargar imágenes diferidas y modales— y cuatro del encabezado de 320 a 390 px. También se revisaron 36 vistas públicas de staging en escritorio y móvil, esperando el contenido final antes de capturarlo.

No se identificaron otros desbordamientos, imágenes rotas o errores JavaScript en esos recorridos. Las capturas locales usan fixtures identificadas: sus precios y datos no sustituyen la configuración comercial alojada.

- [Contacto móvil alojado](../artifacts/full-audit-2026-11-04/hosted/contacto-390.png)
- [Envíos alojados](../artifacts/full-audit-2026-11-04/hosted/envios-1440.png)
- [Catálogo en laptop, fixture local](../artifacts/full-audit-2026-11-04/ui/screenshots/final-1366-tienda.png)
- [Modal de familias móvil, fixture local](../artifacts/full-audit-2026-11-04/ui/screenshots/final-390-admin-family-dialog.png)

### Rendimiento y dependencias

La traza fría de laboratorio del Home alojado registró **LCP 1.351 ms, TTFB 181 ms y CLS 0,00**, con CPU 1× y sin limitación de red. No hay datos de usuarios reales/CrUX en esta revisión ni se afirma un resultado de campo o móvil bajo 4G. No se alteró el Hero para perseguir un ahorro estimado de 0 ms en recursos bloqueantes. El resumen se conserva en `home-performance-summary.txt` dentro de los artefactos de esta auditoría.

Después del despliegue se repitió la medición del formulario de reclamaciones: el JavaScript observado antes de descargar el PDF pasó de **2.052.331 a 922.263 bytes sin comprimir**, una reducción aproximada del **55 %**. Fontkit ya no se descarga al abrirlo. Es una medición de recursos de esa página y no una promesa de reducir el tiempo de carga en el mismo porcentaje.

La auditoría completa de npm pasó de **20 entradas, ocho altas**, a **12 moderadas y ninguna alta/crítica**. La auditoría de dependencias de producción conserva **dos entradas moderadas** de la cadena ExcelJS/UUID. Las restantes corresponden a ESLint/TypeScript ESLint y minimatch. No se afirma que cada entrada sea explotable desde la tienda: el Worker no incluye ExcelJS, y los parsers de herramientas de desarrollo no forman parte del servicio público. Las correcciones mayores propuestas por npm requieren evaluación propia; forzarlas no sería una limpieza segura. Los informes JSON y el análisis de alcance quedan en `artifacts/`.

## Entrega desplegada

| Entorno            | Versión de Worker                      |
| ------------------ | -------------------------------------- |
| Staging            | `995adb06-29a5-42e0-a4ce-44f9ca132d8c` |
| Producción cerrada | `ec8554f6-d47a-4af0-ba60-4623c8125020` |

Se publicaron las correcciones verificadas. La versión activa de producción se contrastó con la API de despliegues: 100 % de tráfico asignado a esa versión. Se confirmaron proyecto y bucket propios, secretos separados, cero dominios/rutas públicas y `workers_dev=false`/`preview_urls=false`. Compras, indexación y envío push de producción continúan desactivados. El acceso público al Worker cerrado devuelve 404; no se ha presentado como una prueba navegable de producción.

Después de publicar staging aprobaron 25 contratos HTTP mediante 67 solicitudes y 36 capturas de páginas reales, sin escrituras. Esta auditoría no necesitó nuevas migraciones ni modificar registros comerciales. Los resultados actuales están en `artifacts/full-audit-2026-11-04/production-result.json`, `hosted/result.json` y los logs de entrega de `artifacts/audit-2026-11-04-*`.

## Pendientes reales antes de abrir comercialmente

1. **Dominio definitivo:** rutas, orígenes permitidos, Auth y metadatos. Habilitar indexación solo tras revisar el catálogo y el contenido final. La comprobación de producción debe seguir bloqueada mientras falte el dominio.
2. **Mercado Pago real:** credenciales de servidor, eventos verificados, conciliación, inventario y cupones transaccionales y pruebas de pago. Cambiar una bandera no implementa esta integración. Producción mantiene las compras bloqueadas y staging simulado.
3. **Operación de respaldo independiente del PC:** Supabase Pro y la copia independiente de R2 están preparados, pero no contratados/activados. El respaldo local está verificado y se conserva; depende del equipo y del perfil Windows/DPAPI. No equivale a una copia externa. Véase [plan de transición](BACKUP_PRO_TRANSITION.md).
4. **Contenido del negocio:** sustituir identidad legal, contacto, horarios, políticas, tarifas provisionales y material editorial autorizado como ejemplo; cargar el catálogo comercial en producción, que sigue vacío. Esto requiere datos reales del titular. No se inventaron durante la auditoría.
5. **Validación física:** comprobar instalación y recepción push en Android/iPhone reales y GPS real con permiso/conexión. Las emulaciones de pantalla, permisos y coordenadas no sustituyen esas pruebas. El acceso administrativo de producción conserva la activación de MFA por su titular.

La recuperación sin correo/SMS depende del código de recuperación que el usuario genere y conserve. No se puede prometer recuperar una cuenta sin contraseña, sin código y sin otro medio de verificar a su titular. La ubicación precisa del perfil sigue siendo privada; no se añadió automáticamente al snapshot de un pedido. El filtro de ofensas de reseñas es léxico y no garantiza detectar toda expresión ofensiva. Son límites funcionales conocidos, no capacidades que esta entrega haya certificado.

No quedan incidencias reproducibles abiertas de los flujos cubiertos después de sus correcciones y repeticiones. Esto no constituye una prueba de penetración ni una certificación de ausencia de cualquier fallo posible.

## Reproducción

`npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build:staging`, `npm.cmd run build`, `npm.cmd run test:e2e`, `npm.cmd run test:supabase:sql` y las suites específicas de `package.json`. `npm.cmd run security:audit` comprueba las dependencias de producción; `npm.cmd audit` incluye herramientas y conserva código de salida no cero por los avisos moderados descritos.

Fuentes primarias: [variables públicas de Vite](https://vite.dev/guide/env-and-mode.html), [Request y cancelación en Workers](https://developers.cloudflare.com/workers/runtime-apis/request/), [CLI de Playwright e inventario selectivo](https://playwright.dev/docs/test-cli#test-list). El análisis de versiones y avisos consultados se conserva en `artifacts/full-audit-2026-11-04/dependency-remediation.md`.
