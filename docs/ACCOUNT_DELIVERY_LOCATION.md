# Ubicación precisa de direcciones

4 de noviembre de 2026. Alcance: **Mi cuenta → Direcciones**.

## Uso y comportamiento

1. Completar la dirección y pulsar **Usar mi ubicación**.
2. Aceptar el permiso del navegador. Se solicita alta precisión y se muestra
   la precisión aproximada recibida, sin prometer exactitud del GPS.
3. Revisar el pin y ajustarlo tocando o arrastrando el mapa. También es posible
   entrar con **Elegir en el mapa**, sin conceder permiso de ubicación.
4. Pulsar **Usar este punto** y después **Guardar dirección**.

El punto es opcional. Cancelar/Escape descartan los cambios del modal; confirmar
el punto modifica solo el formulario. Es posible ajustarlo, verlo en Google
Maps o quitarlo. Cambiar calle, distrito, provincia o zona retira el pin anterior
con un aviso; cambiar destinatario o referencia lo conserva.

La ubicación suplementa calle, número y distrito. No se inventa la dirección
mediante geocodificación ni cambian cobertura/tarifas. Esta entrega no añade
precarga de direcciones al checkout ni modifica los snapshots de pedidos:
el punto se administra en el perfil.

## Privacidad y persistencia

- `app.addresses.latitude/longitude` son privadas y opcionales. La migración
  `20261104000100_address_location.sql` conserva las direcciones existentes
  y sus políticas RLS. Se aplicó con dry-run previo en ambos proyectos separados.
- `api.get_address()` y `api.save_address()` verifican al propietario. La firma
  nueva conserva llamadas anteriores mediante argumentos opcionales y evita
  sobrecargas ambiguas; el formulario no decide el identificador del propietario.
- SQL y cliente validan pares completos, números finitos y rangos. DTO:
  `location: { latitude, longitude } | null`. Al retirar el punto se omiten
  los argumentos opcionales; sus valores por defecto SQL son `NULL`.
- No se guardan coordenadas en localStorage, analítica o URLs del sitio.
  El enlace Google Maps se abre solo cuando el cliente lo solicita.
- No se pide ubicación al entrar ni hay seguimiento continuo. Los callbacks
  tardíos se descartan al cancelar, seleccionar manualmente o salir.
- `Permissions-Policy` permite `geolocation=(self)`; cámara/micrófono siguen
  cerrados. Se necesita HTTPS (o loopback de desarrollo) y permiso explícito.
  [API de geolocalización](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).

## Mapa

Visor raster ligero y cargado bajo demanda, sin nuevas dependencias. Con teclado:
flechas para ajustar, Shift para desplazamiento mayor, +/− para zoom y Enter
para elegir el centro. El modal mantiene el foco y lo devuelve al control inicial.

OpenStreetMap es el proveedor predeterminado: crédito visible, HTTPS, Referer,
caché normal y solo teselas de la vista actual. No se descargan mapas offline
ni se precargan zonas. Abrirlo contacta al proveedor y revela el área consultada.
Su disponibilidad es razonable, **sin SLA**; si falla se conserva la dirección
y el punto. Para otro volumen/SLA se puede configurar un proveedor compatible
con `VITE_ADDRESS_MAP_TILE_URL` y crédito `VITE_ADDRESS_MAP_ATTRIBUTION`,
respetando sus condiciones. No se contrataron servicios ni se incluyeron secretos.
[Política oficial de teselas](https://operations.osmfoundation.org/policies/tiles/).

## Validación y despliegue

| Comprobación | Resultado |
| --- | --- |
| PostgreSQL local aislado | 23 migraciones, 569 aserciones, incluida la nueva suite de ubicación |
| UI con navegador real y servicios aislados | 16 casos únicos aprobados |
| Adaptador Supabase con SDK real y transporte aislado | 7 casos únicos aprobados |
| Comprobaciones públicas alojadas | 53 aprobadas; `get_address` anónimo denegado |
| Comprobador de staging aislado | 16 pruebas aprobadas |
| Tipos, lint y compilaciones | TypeScript, ESLint, staging y producción correctos |
| Esquema alojado | Columnas y firma RPC verificadas en desarrollo y producción cerrada |
| HTTP de staging | `/cuenta/direcciones`: 200 y `geolocation=(self)` |

Casos: GPS exitoso/denegado/timeout/no disponible, solicitud solo tras pulsar,
selección manual/arrastre/teclado, guardado/recarga/retirada, cancelación, callback
tardío, fallo de mapa/guardado y cambio de domicilio. Los ensayos usan ubicaciones
ficticias; no certifican precisión de hardware físico.

Hay 15 capturas de formulario, selector y punto seleccionado en 1920×1080,
1440×900, 1366×768, 768×1024 y 390×844, sin desbordamiento horizontal:
`artifacts/address-location-2026-11-04/screenshots/`.
Las teselas de pruebas son fixtures; no se automatiza tráfico al proveedor.

Comandos reproducibles:

```powershell
npx.cmd playwright test --config=playwright.address-location.config.ts
npx.cmd playwright test supabase-account.spec.ts --config=playwright.supabase.config.ts --project=sdk-and-offline-recovery
npm.cmd run test:supabase:sql
npm.cmd run test:supabase:public
npm.cmd run test:staging
npx.cmd tsc -b
npm.cmd run lint
npm.cmd run build:staging
npm.cmd run build
```

Staging publicado: versión `1ec8ad1a-6dc4-4c01-be33-905cdf4b4893`.
Producción cerrada actualizada, tras la autorización explícita del propietario:
versión `9c3891a6-786c-4e03-9f9c-07f64dec272e`. Se validó la identidad de la
cuenta y el manifiesto de los 327 archivos del build de producción antes de
desplegar. Se conservan `workers_dev=false`, vistas previas deshabilitadas,
sin rutas públicas, `noindex` y compras/pagos deshabilitados. Supabase y R2
mantienen sus recursos propios de producción y la migración SQL ya aplicada.

La comprobación alojada por API confirmó acceso `workers.dev` y previews
deshabilitados, cero dominios personalizados/rutas, compras simuladas e
indexación deshabilitadas y los bindings de Supabase/R2 correctos. Evidencia
sin credenciales: `artifacts/address-location-2026-11-04/production-closed.json`.

No se crearon usuarios de prueba alojados ni se modificaron direcciones reales,
pedidos, fotografías, tarifas o respaldos. No se activaron planes de pago.
