# Seguridad, concurrencia y robustez — Aroma Infini

7 de noviembre de 2026, Lima.

Actualización local del 8 de noviembre: la [consolidación técnica](PROJECT_HEALTH_IMPROVEMENTS_2026_11_08.md)
incorpora recuperación del intento S02 en la misma pestaña, con límites explícitos.
No está desplegada y no sustituye la conciliación durable de pagos. Las cifras
y el estado alojado que siguen corresponden a la auditoría del día 7.

**Dictamen: no habilitar todavía compras comerciales.** Se encontraron y
corrigieron problemas verificables de concurrencia, límites de respuestas y
cancelación. Las correcciones están probadas y publicadas en **staging**.
Producción permanece cerrada y sin cambios. El simulador no constituye una
implementación de cobros ni de reserva de inventario.

Esta revisión usa [OWASP Top 10:2025](https://top10.owasp.org/2025/) y
[OWASP API Security Top 10:2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/)
como guías de cobertura. No es una certificación OWASP ni un pentest externo.

## 1. Alcance y evidencia

Se distinguen tres clases de pruebas:

- **PostgreSQL nativo local:** migraciones y RPC reales sobre PostgreSQL 17.10
  desechable, conexiones independientes y transacciones concurrentes. Auth se
  representa mediante claims SQL de prueba; no equivale a GoTrue alojado.
- **Aplicación y Workers aislados:** Chrome, SDK, adaptadores y handlers reales
  con transporte/almacenamiento controlado. Las respuestas artificiales de
  error no se presentan como errores producidos por Supabase o R2 alojados.
- **Servicios alojados:** consultas SELECT de permisos/configuración, lecturas
  públicas, rechazos anónimos y navegación pública de staging. No se crearon
  compras, clientes ni pruebas destructivas sobre servicios alojados.

Las únicas modificaciones remotas fueron la migración de desarrollo y la
publicación de las correcciones en su Worker y dos Edge Functions. No se
modificaron productos, stock, cupones ni pedidos comerciales. No hubo cobros,
SMTP, Resend, cambios de diseño ni dependencias nuevas en esta auditoría.

| Comprobación nueva                                    | Resultado                                     | Alcance                                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| SQL completo                                          | **684 aserciones**, 28 migraciones, correctas | Ejecución nueva en PostgreSQL local; incluye pruebas negativas de RLS/roles y carreras de catálogo, medios, Home y pedidos. |
| Escenarios A–E                                        | Ejecutados, con límites descritos abajo       | Diez conexiones independientes; no pagos reales.                                                                            |
| Handlers, Auth, R2, push y runtime                    | **223 casos**, correctos                      | Contratos aislados, criptografía y runtime nativo; no 223 ensayos alojados.                                                 |
| Guardas de configuración, build, entornos y respaldos | **103 casos**, correctos                      | Pruebas Node locales, sin restauración nueva de respaldos alojados.                                                         |
| Recuperación de checkout, pedidos e imágenes          | **23 casos**, correctos                       | Chrome táctil de 360/390 px y tablet; transporte aislado.                                                                   |
| Sesiones y notificaciones en móvil                    | **24 casos**, correctos                       | Incluye sesión reemplazada/expirada, logout y rechazo de permisos; proveedor push y permisos del navegador controlados.     |
| Selección y foco de pedidos                           | **5 casos**, correctos                        | 1920, 1440, 1366, 768 y 390 px; selección y acción masiva conservadas.                                                      |
| Módulos administrativos                               | **26 vistas**                                 | Trece rutas en 390 y 768 px, datos/Auth aislados; se esperó el contenido real del módulo antes de capturar.                 |
| Tienda pública alojada                                | **36 vistas y 3 interacciones**, correctas    | 360, 390 y 768 px; menú, filtros y desconexión/reintento.                                                                   |
| API pública de Supabase                               | **55 comprobaciones**, correctas              | Lecturas y denegaciones reales; repetidas después de publicar staging.                                                      |
| Configuración y permisos SQL alojados                 | **11 controles por entorno**, correctos       | SELECT de RLS, FORCE RLS, ejecutores, grants y RPC anónimas.                                                                |
| Archivos y rutas protegidas                           | **9 comprobaciones HTTP**, correctas          | Fuentes privadas 404, métodos y orígenes indebidos rechazados.                                                              |
| TypeScript, lint, build y empaquetado                 | Correctos                                     | Build de producción y `wrangler deploy --env production --dry-run`; **no despliegue de producción**.                        |

Las cantidades son grupos de cobertura; no deben sumarse como un único número
de pruebas independientes. Por ejemplo, las guardas de respaldos ya están
incluidas en las 103 pruebas Node. Se conservaron los intentos fallidos de
harness/permisos de Windows y sus correcciones; no se borraron para fingir una
ejecución inicial perfecta.

## 2. Hallazgos por criticidad

**CRÍTICO:** no se confirmó una vulnerabilidad explotable de esa categoría en
el alcance probado. Esto no acredita ausencia absoluta de vulnerabilidades.

| ID  | Nivel                        | Hallazgo y evidencia                                                                                                                                                         | Estado                                                                                                                                                            |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | **ALTO**                     | No existe todavía reserva/consumo de stock ni liquidación de pagos comerciales. Aceptar pedidos simulados no limita compromisos comerciales a las unidades disponibles.      | **BLOQUEANTE antes de Mercado Pago.** Producción conserva checkout deshabilitado.                                                                                 |
| S02 | **ALTO al habilitar cobros** | Una respuesta incierta seguida de recarga pierde el UUID del intento, guardado solo en memoria. La reproducción envió dos UUID distintos para la misma intención.            | **Pendiente** de conciliación durable del intento antes de cobrar. Prueba de navegador con transporte aislado; no se ejecutó un doble cobro.                      |
| S03 | **ALTO**                     | Dos carritos con los mismos dos productos en orden inverso podían adquirir bloqueos de imágenes en orden opuesto y provocar PostgreSQL `40P01`.                              | **Corregido y aplicado en desarrollo/staging.** Antes: 1 commit/1 deadlock; después: 2 commits/0 deadlocks. Producción requiere su migración autorizada.          |
| S04 | **ALTO operativo**           | Producción tiene un administrador activo y ningún TOTP verificado. Desarrollo tiene uno activo con TOTP.                                                                     | **BLOQUEANTE operativo** del titular. Los controles MFA no se debilitaron para permitir acceso.                                                                   |
| S05 | **MEDIO**                    | Algunas respuestas Auth/RPC de medios y acciones de cuenta se leían con `response.json()` sin un límite explícito de bytes.                                                  | **Corregido en staging.** Lectura incremental hasta 512 KiB, UTF-8 estricto, deadline y cancelación sin esperar callbacks que no terminan.                        |
| S06 | **MEDIO, defensa adicional** | Algunas llamadas privilegiadas seguían redirecciones por defecto. No se encontró control externo sobre su origen ni se demostró fuga de una clave.                           | **Corregido en staging.** `redirect: 'manual'` en medios/limpieza, checkout y las acciones de cuenta. Push y reclamaciones ya lo utilizaban.                      |
| S07 | **MEDIO**                    | En el runtime fijado a 2026-10-08, una desconexión HTTP real no se propagaba a `request.signal` sin activar la compatibilidad correspondiente.                               | **Corregido en staging.** Prueba workerd con socket HTTP: antes `false`, después `true`; flag y guarda de preflight añadidos. Los deadlines explícitos continúan. |
| S08 | **MEDIO, escalabilidad**     | Administración pagina la lectura SQL en bloques de 100, pero reúne hasta 10.000 pedidos en memoria antes de paginar la UI. La cuenta también solicita su historial completo. | **Pendiente** de paginación de extremo a extremo con selección masiva de servidor. No se cambió su comportamiento durante esta revisión.                          |
| S09 | **MEDIO**                    | En una muestra fría de 4G lenta el Home registró LCP 4.656 ms. No es una prueba de capacidad ni una medición de teléfono físico.                                             | **Pendiente** de optimización medida de la cadena de carga, conservando el diseño.                                                                                |
| S10 | **MEDIO de mantenimiento**   | npm informa 12 entradas moderadas, cero altas/críticas: cadenas minimatch de herramientas y uuid de ExcelJS.                                                                 | **Pendiente** de actualización compatible. No se forzaron versiones mayores o downgrades para ocultar avisos.                                                     |
| S11 | **BAJO**                     | El checkbox de selección del encabezado de pedidos estaba recortado visualmente en móvil, pero seguía pudiendo recibir foco.                                                 | **Corregido.** Se oculta únicamente ese control en el modo tarjetas; encabezados, checkboxes visibles y selección de filtrados se conservan.                      |
| S12 | **BAJO, defensa adicional**  | No hay una Content Security Policy aplicada. React escapa los textos ordinarios y no se confirmó XSS en el alcance probado.                                                  | **Pendiente** de política probada con medios, WASM y mapa. No se instaló una política genérica que rompa funciones aprobadas.                                     |

Permanecen los bloqueos operativos de dominio, contenido comercial y respaldo
independiente descritos en la auditoría de lanzamiento. No se consideran
resueltos por aprobar tests de código.

## 3. Compras simultáneas e inventario

| Escenario solicitado                         | Resultado observado                                                                                                                                                               | Evaluación                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A: 2 clientes / stock 1                      | 2 pedidos **simulados pendientes**, 0 unidades comprometidas comercialmente; stock final 1.                                                                                       | **NO APROBADO como protección comercial contra sobreventa.** El simulador deliberadamente no reserva stock.   |
| B: 10 clientes / stock 5                     | 10 pedidos **simulados pendientes**, 0 unidades comprometidas comercialmente; stock final 5.                                                                                      | **NO APROBADO para venta real.** No debe interpretarse como 10 compras válidas de 5 unidades.                 |
| C: 2 administradores                         | Se comprobaron dos transacciones esperando el bloqueo; una escritura se confirmó y la otra recibió `PT409`.                                                                       | **APROBADO** en PostgreSQL local; sin sobrescritura silenciosa.                                               |
| D: cambia el precio/stock antes de confirmar | El checkout esperó el commit administrativo y rechazó la cotización antigua con `PT409`; también rechazó precio/total enviados por cliente, cantidad negativa y stock agotado.    | **APROBADO** para la revalidación actual del servidor.                                                        |
| E: 10 reintentos con el mismo identificador  | Un solo pedido; otro dueño rechazado, payload cambiado rechazado. Un rollback no dejó pedidos parciales y el reintento de una respuesta ya comprometida devolvió el mismo pedido. | **APROBADO** de RPC con identidad estable; **pendiente** la continuidad tras recarga y el proveedor de pagos. |

La prueba del deadlock ejecuta la RPC real con dos conexiones y añade en el
clúster de prueba una demora de 150 ms antes del primer ítem para hacer
reproducible el intercalado. Ese trigger solo cambia el momento de ejecución;
no inventa bloqueos ni modifica el cuerpo de la RPC. Se retira al terminar.
La migración nueva bloquea las portadas por UUID antes de escribir los ítems,
independientemente del orden elegido por el cliente. No cambia precios,
permisos, descuentos, confirmación de pago ni retención de medios.

Invariantes finales de ese ensayo: 16 simulaciones pendientes antes de retirar
fixtures, cero pagos reales, cero reservas, stock final 5, sin stock negativo,
cero usos de cupón; fixtures propias retiradas. El runner detiene su clúster
local y no recibe una URL de base de datos remota.

Las pruebas adicionales de grupos de 10/50/100 pedidos también comprobaron
versiones y errores parciales: en el lote mixto, 40 actualizados y 60 omitidos
sin duplicar historial ni cambiar el estado de pago.

## 4. Supabase, permisos y datos privados

- RLS en las tablas de aplicación, FORCE RLS en datos sensibles, ejecutores
  sin login/bypass y `search_path` fijo en definers comprobados por SQL.
- Los navegadores no heredan los ejecutores ni acceden a tablas privadas.
  `create_simulated_order` no puede ejecutarse directamente como `anon` o
  `authenticated`; el Worker usa su secreto de servidor tras la autorización.
- Identidad basada en usuario verificado, membership activo y AAL2 en acciones
  administrativas. Metadata editable del registro no concede privilegios.
- Parámetros RPC tipados, límites de longitud/cantidad y allowlists. Las pruebas
  de manipulación de importes y cantidades llegan al servidor; no dependen del
  formulario. No se encontró concatenación de SQL de comprador en la ruta de
  catálogo/checkout revisada.
- Los escenarios de propietarios, cambio de sesión y respuesta antigua no
  restituyen datos privados del usuario anterior. Persistir otro módulo no
  copia pedidos/clientes remotos a IndexedDB.
- No se ejercitó fuerza bruta agresiva contra GoTrue alojado. Los límites de
  las acciones de recuperación/cambio de correo se prueban en contratos y SQL;
  antes de apertura, revisar los límites efectivos y monitorización de Auth
  del proyecto real. El control de Origin complementa la autorización: no es
  por sí solo una defensa contra un cliente no navegador.
- Sin confirmación de correo por decisión del negocio. Autoconfirmado técnico
  no prueba propiedad del buzón. No se asociaron pedidos a cuentas por una
  coincidencia de email; se mantiene UUID verificado y códigos de recuperación
  de un solo uso, sin SMTP ni Resend.

El escaneo dirigido de 768 archivos encontró literales con forma de secreto
únicamente en fixtures y su copia XML; se verificó esa correspondencia sin
imprimir valores. Ocho valores privados locales conocidos no aparecen en los
activos de texto del build. Los archivos de credenciales locales están
ignorados por Git; solo `.env.example` está versionado. Esto no sustituye una
revisión completa del historial, gestores de secretos o máquinas del equipo.

## 5. Cloudflare, R2 y fallos de red

- Buckets separados y privados; sin `r2.dev` ni dominio público directo. Las
  rutas públicas exigen manifiesto verificado y una variante existente.
- Cargas: autorización real y AAL2, límites de tamaño/dimensiones, inspección
  de formato y píxeles; prefijos UUID/hash inmutables. Extensión o MIME del
  cliente no bastan para publicar un archivo.
- Una carga fallida, respuesta perdida o conflicto conserva el borrador y
  reutiliza operaciones confirmadas. La limpieza solo actúa sobre prefijos
  reclamados y no borra imágenes asociadas por un despliegue o lista estática.
- Solicitudes de subida/formulario y respuestas del proveedor tienen límites
  separados. El lector no se bloquea esperando una cancelación que nunca
  resuelve. Errores de proveedor se traducen sin exponer cuerpos privados.
- La prueba HTTP nativa demuestra el cambio de señal de desconexión. No se
  afirma que todas las tareas se cancelen automáticamente: solo los caminos
  que observan la señal; se conservan los presupuestos temporales explícitos.
- El Service Worker administrativo no cachea respuestas privadas ni tokens.
  Push exige opt-in, rol vigente y destino validado; fallos de envío no
  convierten un pedido en pagado ni revierten una venta.

El fallo/timeout de un POST puede ocurrir **después** de un commit; por ello no
se debe tratar una desconexión como prueba de que no hubo pedido. La RPC
actual permite conciliar un UUID estable, y S02 identifica dónde aún falta
conservar esa identidad entre documentos antes de integrar dinero real.

## 6. Pagos y reserva: condición previa a Mercado Pago

**Mercado Pago no está implementado ni certificado.** No hay handler de
webhook, conciliación comercial ni liquidación de inventario/cupones listos
para activarse cambiando una bandera. El retorno del navegador no autoriza
pagos; las constraints actuales conservan las simulaciones como pendientes.

La siguiente integración debe resolver como una unidad verificable:

1. Un intento durable asociado al pedido y al usuario/recibo privado, con
   clave de idempotencia estable antes de llamar al proveedor. La recarga
   consulta ese intento, en lugar de crear otro. No persistir direcciones,
   contraseñas o tokens Auth para resolver S02.
2. Reserva PostgreSQL por pedido/presentación, estado y vencimiento. Bloquear
   variantes en orden UUID y reservar solo si el disponible alcanza; checks
   no negativos y transición atómica entre retenido, consumido y liberado.
   **El plazo requiere política aprobada**; no se inventó una duración.
3. Evento de pago validado exclusivamente en servidor: firma, identificador,
   cuenta vendedora, entorno, moneda PEN, importe y referencia externa. Luego
   consultar el recurso de Mercado Pago; no confiar solo en el JSON recibido.
4. Deduplicación del pago/evento y transición que no retrocede por una
   notificación atrasada. Consumo de reserva y uso de cupón una sola vez,
   dentro de la transacción que confirma el estado autorizado del pedido.
5. Vencimiento/liberación idempotentes, conciliación de pendientes y política
   explícita para un pago aprobado después de expirar la reserva. No marcar
   entregado, sustituir stock inexistente ni reembolsar automáticamente sin
   esa política y su implementación.
6. Pruebas sandbox del proveedor: rechazo, pendiente, aprobación, doble
   webhook, retraso, importe/moneda incorrectos y reembolso. Repetir A/B con
   reservas reales: máximo 1 y 5 unidades comprometidas respectivamente.

Referencia del proveedor: [notificaciones y validación de Webhooks](https://www.mercadopago.com.pe/developers/en/docs/your-integrations/notifications/webhooks).
Este diseño de control es una preparación; no se presenta como código de
pagos ya implementado ni como pruebas reales aprobadas.

## 7. Móvil y rendimiento

Se revisaron 36 vistas públicas alojadas en 360/390/768 px y 26 vistas de los
módulos administrativos con Auth/transporte aislados. También se probaron
checkout, selección de cien pedidos, errores parciales, sesiones reemplazadas,
subidas interrumpidas, permisos push y conservación del borrador.

No se encontraron desbordamientos horizontales en las vistas finales. Las
capturas iniciales que coincidían con el skeleton no se aceptaron como
validación del módulo: el harness se corrigió para esperar el encabezado real
y repetir las capturas. Del mismo modo, los tests de selección se adaptaron
a las tarjetas móviles; se añadió una regresión permanente para que el
control de escritorio oculto no reciba foco.

| Medición                                |             Resultado | Límite                                                                               |
| --------------------------------------- | --------------------: | ------------------------------------------------------------------------------------ |
| Home staging, TTFB                      |                561 ms | Una ejecución, Chrome con CPU ×4, RTT 150 ms, descarga 1,6 Mbps y caché desactivada. |
| FCP / LCP observado                     |        2632 / 4656 ms | Laboratorio; no p75 de usuarios ni teléfono físico. **Pendiente mejorar carga.**     |
| CLS observado                           |              0,000019 | No acredita todas las interacciones o dispositivos.                                  |
| Diez lecturas SQL paralelas de catálogo | p50 24 ms / p95 26 ms | Fixture local de dos productos, sin red ni frontend; no capacidad de producción.     |
| Diez cotizaciones SQL paralelas         |   p50 3 ms / p95 4 ms | Misma limitación; no cobro ni bloqueo prolongado de pagos.                           |

Los límites recomendados de campo se consultaron en [Web Vitals](https://web.dev/articles/vitals).
No se compara este LCP directamente con auditorías de otro día/configuración
como si demostrase una mejora causada por los cambios de seguridad.

**Pendiente en teléfonos físicos:** teclado virtual, recortes por notch y safe
areas, instalación PWA, recepción push en segundo plano/cerrada y GPS. Las
emulaciones de táctil y permisos no equivalen a probar hardware Android/iPhone.
Las pruebas locales de 1000 productos confirman las proyecciones existentes,
pero no autorizan una cifra de usuarios simultáneos soportados.

## 8. Relación con OWASP

| Referencia          | Controles revisados / límites                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01; API1/API3/API5 | RLS, propiedad, grants, membership, AAL2, DTO público y privado; SQL nativo y denegaciones alojadas.                                                               |
| A02; API8/API9      | Configuración y aislamiento, superficie de métodos/rutas, fuentes privadas 404, producción cerrada. CSP pendiente como defensa adicional.                          |
| A03                 | Inventario y auditoría npm; 12 entradas moderadas pendientes, sin actualizaciones incompatibles.                                                                   |
| A04                 | Aleatoriedad segura de recibos/códigos, hash de recuperación, criptografía push y secretos fuera del bundle. No auditoría criptográfica independiente completa.    |
| A05                 | Parámetros SQL tipados y allowlists, rechazo de campos de precio, escape de texto React y validación de medios. Sin explotación XSS/SQLi confirmada en el alcance. |
| A06; API6           | S01/S02: reserva y conciliación comercial aún bloqueantes; estados de prueba no autorizan dinero.                                                                  |
| A07; API2           | Auth verificado, MFA, revocación, carreras de sesión y códigos de un solo uso. MFA de producción y validación física pendientes.                                   |
| A08                 | Versiones optimistas, idempotencia, manifiestos verificados y bloqueo ordenado corregido.                                                                          |
| A09                 | Logs/trazas sin queries en staging; producción conserva configuración anterior hasta autorización. No se acreditó un centro externo de alertas 24/7.               |
| A10; API4/API10     | Límites de bytes/tiempo, errores parciales, cancelación, no redirecciones privilegiadas y rechazo de respuestas malformadas.                                       |
| API7                | Orígenes Supabase configurados, destinos push restringidos y rutas de medios verificadas. No se usó una URL arbitraria del comprador como origen privilegiado.     |

## 9. Entrega y archivos

- Nueva migración: `20261107000100_checkout_lock_order.sql`; no se reescribió
  la historia de migraciones. Firma y permisos de la RPC conservados.
- `scripts/sql-commerce-security-audit.mjs`, integrado en el runner SQL:
  escenarios A–E, deadlock reproducible, integridad y medición acotada.
- `worker/media-handler.ts`, `worker/checkout-handler.ts`: límites de proveedor
  y políticas de redirección; limpieza acotada de medios conservada.
- `supabase/functions/_shared/bounded-provider-json.ts` y los handlers de
  recuperación/cambio de correo: mismas operaciones sin correo, respuestas
  acotadas y sin seguir redirecciones.
- `wrangler.jsonc`, preflight y tests: `enable_request_signal`, conservando
  `nodejs_compat` y fecha comprobada 2026-10-08.
- `tests/worker-disconnect.spec.ts`: cliente HTTP y workerd reales.
- CSS de pedidos y regresión de foco: sin cambio en la composición aprobada.

**Desarrollo/staging:** 28 migraciones y Worker
`d16af020-1e88-4e31-b9eb-0458cfcdcea2`; Edge Functions `account-recovery` y
`change-email` actualizadas. La publicación incluye el código anterior de
Contacto que ya estaba presente y validado; no se añadieron perfiles oficiales
ni dominio provisional.

**Producción:** versión `ec8554f6-d47a-4af0-ba60-4623c8125020` conservada,
25 migraciones. Antes del próximo frontend autorizado faltan las dos
migraciones del 5 de noviembre y la nueva del 7. También requieren despliegue
autorizado el flag de desconexión, límites de handlers, Edge Functions y
redacción de queries. No se aplicaron allí durante esta tarea.

## 10. Checklist antes del lanzamiento

| Acción                                                                  | Estado                                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| RPC/Workers/autorización y cambios de robustez en los alcances probados | **APROBADO** técnico; conservar pruebas en CI.                                                                     |
| Migración de bloqueo y publicación en desarrollo/staging                | **APROBADO**; no equivale a producción actualizada.                                                                |
| Reservas, pago comercial, cupón transaccional y expiración              | **BLOQUEANTE**, S01.                                                                                               |
| Identidad del intento persistente y conciliación tras recarga           | **BLOQUEANTE antes de cobros**, S02.                                                                               |
| Sandbox Mercado Pago y webhooks reales duplicados/retrasados/rechazados | **BLOQUEANTE**, no implementados aún.                                                                              |
| Administrador de producción con TOTP propio                             | **BLOQUEANTE operativo**, titular.                                                                                 |
| Dominio HTTPS, CORS/redirects, catálogo y condiciones verdaderas        | **BLOQUEANTE**, decisiones y material del titular.                                                                 |
| Tres migraciones y despliegues de producción revisados/autorizados      | **BLOQUEANTE para actualizar producción**; SQL primero, frontend después.                                          |
| Respaldo fuera del mismo PC y ensayo de recuperación alojada            | **PENDIENTE** de la auditoría de lanzamiento; no repetir un resultado local como aprobación de recuperación total. |
| Teléfonos físicos, teclado, safe areas, PWA/push/GPS                    | **PENDIENTE**.                                                                                                     |
| Arranque frío móvil y paginación completa en grandes historiales        | **PENDIENTE**, sin rediseño.                                                                                       |
| Dependencias moderadas, CSP y monitorización/límites efectivos de Auth  | **PENDIENTE**, revisar con cambios compatibles.                                                                    |
| Analítica/consentimiento y revisión legal si se activan mediciones      | **PENDIENTE** de recursos externos, sin trackers inventados.                                                       |

## Evidencias reproducibles

Directorio `artifacts/security-audit-2026-11-07/`, fuera del bundle web.

- `sql-before-result.json`, `sql-final-result.json`: fallos/corrección y A–E.
- `sql-final.log`: ejecución completa de 28 migraciones y 684 aserciones.
- `endpoints-final-confirmed.log`, `endpoints-final-result.json`: 223 casos.
- `endpoints-disconnect-http.json`: diferencia observada antes/después.
- `checkout-reload-result.json`: limitación S02 reproducida, no aprobada.
- `mobile-resilience-verified.log`, `mobile-session.log`,
  `mobile-focus-final.log`, `mobile-admin-final-confirmed.log` y capturas.
- `mobile-hosted-result.json`: 36 vistas, tres interacciones y muestra 4G.
- `infra-hosted-before-result.json`, `infra-hosted-result.json`,
  `checkout-hosted-readonly-result.json`, `infra-admin-mfa-result.json`.
- `anonymous-api-final.log`, `client-boundary-result.json`,
  `source-secrets-result.json`, `dependency-audit-all.json`.
- Logs de tipo/lint/build/dry-run y publicación **solo staging**.

Reproducción local principal:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:supabase:sql
npx.cmd playwright test --config artifacts/security-audit-2026-11-07/endpoints.config.mts
```

Las pruebas de navegador con servidor externo tienen sus configuraciones y
puertos en esa carpeta. No apuntarlas a un entorno con datos reales ni cambiar
los mocks de permisos por credenciales privilegiadas del negocio.
