# Códigos públicos cortos de pedidos — 20 de noviembre de 2026

Implementado y validado exclusivamente en staging. Los pedidos nuevos reciben
códigos como `AI-000001`. Los pedidos anteriores conservan su código y sus
enlaces; no se renumeraron filas ni se modificaron UUID.

## Funcionamiento

- Se reutiliza `app.orders.reference`, que ya tiene una restricción única.
- Una secuencia privada de PostgreSQL asigna números de forma atómica entre
  conexiones. Seis dígitos es el mínimo: después de `AI-999999` continúa
  `AI-1000000`, sin truncamientos ni reciclaje.
- La asignación ocurre después de las comprobaciones existentes de reintento,
  identidad, cotización y bloqueo. Repetir una operación devuelve el mismo
  UUID y código. Una operación con datos distintos conserva su rechazo actual.
- Se omiten códigos históricos que ya ocupen el mismo espacio de nombres.
- Puede haber saltos por operaciones revertidas o pruebas retiradas. Los números
  consumidos no se reinician ni se reutilizan. No es una numeración fiscal.
- El código es una referencia visible, nunca una credencial. El seguimiento
  sigue requiriendo la sesión propietaria o el token privado independiente.
- Se mantienen los importes, reservas de 15 minutos, estados, permisos, MFA y RLS.

## Archivos y alcance

| Archivo | Cambio |
| --- | --- |
| `supabase/migrations/20261120000100_short_order_references.sql` | Secuencia y asignador privados; sustitución verificada de una sola expresión del generador actual |
| `src/domain/order-reference.ts` | Validación compartida de referencias nuevas e históricas; sin autorización implícita |
| `src/services/checkout-server.ts` | Acepta la referencia corta en la confirmación del servidor |
| `src/services/order-tracking-service.ts` | Guarda y consulta ambos formatos, manteniendo el token privado |
| `src/services/admin-service.ts` | Compatibilidad de la validación del adaptador local |
| `supabase/tests/041_short_order_references.sql` | Privilegios, colisiones históricas, límite de seis dígitos y acceso al seguimiento |
| `scripts/test-supabase-sql.mjs` | Concurrencia e idempotencia de los códigos; aislamiento de ajustes de las migraciones |

Las vistas, notificaciones y documentos ya consumían `reference`; no se
duplicó el modelo ni se cambió su diseño. Los tipos públicos de Supabase no
cambiaron: se verificaron las firmas, propietarios y permisos de las RPC.
El generador local de datos de demostración conserva su formato anterior;
los pedidos persistentes de staging utilizan el asignador SQL nuevo.

## Validación

| Prueba | Resultado |
| --- | --- |
| PostgreSQL aislado | 50 migraciones y 1.137 comprobaciones aprobadas |
| Concurrencia SQL aislada | 100 pedidos distintos sobre 10 conexiones, 100 códigos únicos; reintentos conservan UUID y código |
| Contratos de checkout/Worker | 40 pruebas aprobadas |
| Pedidos con SDK y transporte aislado | 44 pruebas aprobadas, incluidos códigos históricos, búsquedas y permisos |
| Checkout con SDK y transporte aislado | 30 pruebas aprobadas: confirmación, cuenta, administración, PDF y seguimiento |
| Regresiones de navegador y documentos | 38 pruebas aprobadas; incluyen PDFs, navegación y responsive |
| Worker de notificaciones | 67 pruebas aprobadas; incluye payload y enlace con `AI-004827` |
| Calidad y empaquetado | TypeScript, ESLint, build de staging y Wrangler dry-run aprobados |
| Servicios alojados y Chrome | Ocho comprobaciones agrupadas aprobadas con Auth/MFA, RPC y aplicación desplegados |

La primera ejecución SQL encontró un límite de sesión heredado de una
migración histórica. El ejecutor ahora restaura sus límites originales al
terminar las migraciones, sin modificar el historial ni ampliar los límites
configurados. La migración nueva usa `SET LOCAL`. La suite final completa
aprobó. También se actualizó una expectativa del fixture de checkout que
todavía esperaba el código largo; la suite completa se volvió a ejecutar.

### Prueba alojada

Se crearon tres pedidos simulados identificados: `AI-000001`, `AI-000002` y
`AI-000003`. Dos se crearon concurrentemente sobre conexiones independientes.
El reintento del primero mantuvo su UUID, código, reserva y único evento de
notificación. Se comprobaron:

- Listado y detalle del cliente en Chrome de escritorio y móvil de 390 px.
- Otro cliente sin acceso a esos pedidos; administrador AAL1 rechazado.
- Administrador AAL2: búsqueda, selección y descarga de resumen PDF.
- Búsqueda de una referencia histórica existente, sin modificar ese pedido.
- Seguimiento anónimo rechazado con solo el código y autorizado con su enlace privado.
- Reservas de 15 minutos e importes canónicos, sin pagos ni duplicaciones.

La creación alojada se realizó mediante la RPC real dentro de transacciones
controladas. Antes de confirmar cada transacción se restringió únicamente el
evento del fixture para no alertar a administradores reales. No se cambiaron
suscripciones ni políticas globales. El contrato HTTP del Worker y la
confirmación de checkout se validaron con transporte aislado; no se presenta
esa parte como una compra HTTP alojada. No se repitió una recepción física
Android con estos códigos ni se hicieron cobros.

Se retiraron los tres pedidos, el producto y la marca temporales y las tres
identidades Auth creadas para la prueba. Se conservó el activo R2 original y
su asociación comercial. La comprobación final encontró cero cuentas de esta
prueba y el mismo único administrador activo que antes de la intervención.

## Despliegue comprobado

- Worker: `aroma-infini-frontend-staging`.
- Versión activa al 100 %: `c7a2934e-43d3-4cac-b22c-a4c448470a15`.
- Supabase de desarrollo: `tkxvexfapszilzhogvgu`; 50 migraciones aplicadas,
  cero pendientes y hashes del historial coincidentes.
- Migración nueva SHA-256:
  `e17538ba47485a1c79b2ed7ef0b7d56d3b29630d47133c72ce88e80690a17607`.
- Configuración sellada SHA-256:
  `8a6abbd76b16ecc042bfac4848ba88e9c2a5a3004546632397991c36f77fdc39`.
- Se descargaron y compararon los 126 recursos JS, CSS y PWA del paquete;
  todos los hashes coincidieron. El documento utiliza siete recursos verificados.
- R2 mantiene el binding privado `aroma-infini-media-dev`. No se modificaron objetos.
- Historial de despliegues de producción idéntico antes y después. Esta migración
  no se aplicó a ningún destino de producción.
- Rama `develop`, HEAD `f603491b784595cf57295eb2dbc52297c48f5ba4`.
  Se conservaron los cambios anteriores. No se hizo commit ni push.

Las evidencias locales, ignoradas por Git, están en
`artifacts/short-order-codes-2026-11-20/`: `migration-result.json`,
`final-schema.json`, `hosted-result.json`, `staging-assets-verified.json`,
`deployment-verification.json`, logs de cada suite y `screenshots/`.
El informe SQL final está en `artifacts/supabase-sql-tests/run-nERCnv/result.json`.

Referencia técnica: [secuencias de PostgreSQL](https://www.postgresql.org/docs/17/functions-sequence.html).
