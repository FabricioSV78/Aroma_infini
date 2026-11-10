# Auditoría integral de rendimiento — 5 y 6 de noviembre de 2026

Publicación posterior: el frontend se verificó en staging durante la
[auditoría de lanzamiento del 6 de noviembre](LAUNCH_AUDIT_2026_11_06.md).
El estado de entrega de este informe conserva el corte de la auditoría de
rendimiento; producción no se actualizó.

Se midió antes de modificar consultas. Se aplicaron mejoras en React,
proyecciones públicas de Supabase y PostgreSQL, conservando diseño, animaciones,
precios, variantes, stock, reglas de recomendación, RLS y MFA. No se añadieron
dependencias. Las pruebas con volumen utilizaron datos sintéticos aislados;
no se sometieron los servicios alojados a carga masiva.

## Estado de entrega

- Código y pruebas terminados en el proyecto local.
- Migraciones `20261105000100_query_media_lookup.sql` y
  `20261105000200_home_catalog_projection.sql` aplicadas a **desarrollo**,
  después de verificar el enlace del proyecto y un `db push --dry-run` que
  enumeró únicamente esas dos migraciones. No se importaron fixtures allí.
- Verificación anónima alojada: **55 comprobaciones correctas**, incluidas
  las dos RPC nuevas y los rechazos de acceso a información privada.
- Frontend de staging compilado, sellado y empaquetado con `--dry-run`;
  **esta auditoría no publicó el frontend ni modificó producción**.
  El despliegue posterior debe respetar el orden de
  [PERFORMANCE_HOME_ROLLOUT.md](PERFORMANCE_HOME_ROLLOUT.md).

## Método y línea base

Se separaron tres mediciones para no confundir tiempos SQL, transporte y render:

1. Módulos de aplicación y SDK reales en Chrome, todas las solicitudes remotas
   interceptadas, tres rondas con 1 y 1000 productos, 100 ms añadidos por RPC.
2. Compilaciones optimizadas antes/después, servidor local con gzip, 1000
   productos, cinco rutas y tres contextos fríos por ruta y dispositivo:
   **60 navegaciones**. Escritorio 1440 × 900; móvil 390 × 844, DPR 2, CPU ×4,
   recursos estáticos a 150 ms/1,6 Mbps y RPC a 100 ms más 200 kB/s de cuerpo.
3. PostgreSQL 17.10 local desechable: 1000 productos, 3000 medios distintos,
   planes `EXPLAIN (ANALYZE, BUFFERS)` y 1000/10000 pedidos. Se comprobó igualdad
   JSON y conservación de propietarios, permisos y configuración de funciones.

Los bytes de RPC son JSON decodificado, no tráfico comprimido. Tres muestras
no constituyen un percentil de producción. CPU limitada no equivale a probar
un teléfono físico. Los fixtures SQL y HTTP son diferentes; no se mezclan sus
importes ni sus tiempos.

También se tomó una traza pública de staging con Chrome, CPU ×4 y Slow 4G:
TTFB 191 ms, LCP 6534 ms y CLS 0. El retraso de descubrimiento del recurso LCP
fue 5749 ms. Es una muestra de la versión alojada anterior, con catálogo real
pequeño, sin datos de campo; no es una comparación del frontend nuevo.
El ahorro estimado de CSS bloqueante fue 0 ms: no se modificaron estilos por
esa observación. La pestaña de diagnóstico se cerró al terminar.

## Mejoras aplicadas

### Checkout, carrito y favoritos

El loader de checkout descargaba el catálogo completo, incluso con el carrito
vacío. Ahora hidrata únicamente los productos de las variantes seleccionadas,
reutilizando el servicio de selección existente y sus límites por lote.
Las cotizaciones transaccionales siguen calculándose en el servidor; esta
lectura pública no decide el precio definitivo ni reserva existencias.

| Lectura fría aislada                    | RPC antes / después | JSON antes / después | Mediana antes / después |
| --------------------------------------- | ------------------: | -------------------: | ----------------------: |
| 1000 productos, una variante en carrito |              12 / 3 |      857160 / 1313 B |           1116 / 112 ms |
| 1000 productos, carrito vacío           |              12 / 2 |       857160 / 455 B |           1118 / 116 ms |
| Un producto, una variante               |               3 / 3 |        1323 / 1313 B |            117 / 112 ms |

Se solapan las solicitudes de metadatos e IDs, pero se espera el vocabulario
confirmado antes de interpretar familias dinámicas. Un bucle comprueba que ambos
pertenezcan a la generación pública vigente antes de interpretar y publicar,
sin una espera intermedia. Se cubren los dos órdenes de finalización y una o
dos invalidaciones durante la lectura. Dos pruebas nuevas reprodujeron el fallo
antes de la corrección y pasaron después. Los fallos conservan el reintento.

La regresión de compra detectó además una carrera entre pestañas: el montaje
de `CartProvider` y los eventos `storage` volvían a escribir estados recibidos,
pudiendo sobrescribir una cantidad más reciente. Ahora se persisten únicamente
mutaciones locales. Se mantienen la sincronización externa y la conciliación de
unidades compradas; no se cambió el significado de añadir, quitar o comprar.
Dos casos entre pestañas pasaron además cinco repeticiones cada uno.

### Home y Marcas

Home requería todas las galerías, descripciones y variantes para derivar
opciones del recomendador y perfiles de marca. `catalog_home_context` devuelve
los mismos perfiles mínimos en el mismo orden y solo **cuatro fichas completas**.
El Hero hidrata por ID los productos públicos que utiliza.

Se conserva el código JavaScript de normalización, etiquetas, desempates y
orden. No se limita el universo del recomendador a las cuatro cards. El
cuestionario completo sigue leyendo los candidatos al interactuar y recomendar.

Marcas utiliza `catalog_brand_previews`: marcas activas, portada del primer
producto público en el orden anterior y sus manifiestos. Evita tanto el
snapshot completo como una solicitud de detalle por cada marca.

Comparación de la aplicación completa con el fixture HTTP de 1000 productos:

| Página | RPC antes / después | JSON antes / después | Escritorio listo antes / después | Móvil limitado listo antes / después |
| ------ | ------------------: | -------------------: | -------------------------------: | -----------------------------------: |
| Home   |              15 / 4 |    858101 / 167708 B |                    1443 / 463 ms |                       9732 / 5825 ms |
| Marcas |              14 / 5 |      858043 / 1506 B |                    1520 / 371 ms |                       9202 / 4172 ms |

Incluye las lecturas del layout; el número de RPC puede variar si el Hero
apunta a productos o si otros metadatos ya están confirmados.

En el fixture SQL de 1000 productos, la lectura completa produjo 2053963 B
y 1000 DTO, frente a 197893 B y cuatro DTO más perfiles mínimos. Sus medianas
SQL fueron 11202 y 647 ms, respectivamente. Es otra medición, sin transporte;
los perfiles siguen creciendo con N y mantienen el límite explícito de 10000.

### PostgreSQL: medios y pedidos

La construcción de cada DTO buscaba sus medios con un `OR / EXISTS` que
recorría todos los assets listos. Ahora selecciona primero los IDs asociados
y utiliza la clave primaria. Conserva orden, deduplicación, rendiciones,
exclusión de medios no públicos y respuesta JSON exacta.

| Medición SQL local                            |     Antes |   Después |
| --------------------------------------------- | --------: | --------: |
| Lookup de tres medios entre 3000: bloques hit |       310 |        18 |
| Lookup: tiempo observado                      |  0,777 ms |  0,038 ms |
| Browse de doce productos: mediana             | 53,566 ms | 45,867 ms |
| Página admin de cien productos: bloques hit   |     42208 |     13005 |
| Selección de página entre 10000 pedidos       |  3,262 ms |  0,094 ms |

El índice nuevo `orders_placed_idx (placed_at DESC, id)` evita el recorrido y
ordenamiento global de la selección administrativa. La RPC completa de 10000
pedidos tuvo medianas 17,676 y 16,995 ms; los fixtures de pedidos no tienen
líneas ni historial. El ahorro de la selección no se presenta como ahorro
equivalente de toda la RPC.

La latencia total de la página admin fue variable: una ejecución dio
545 → 575 ms y otra 663 → 575 ms. Se conservaron ambas, sin prometer una mejora
uniforme. Se probó un índice de orden de catálogo, pero **no se implementó**:
su ahorro observado de selección fue solo 0,405 ms y no justificó otro índice.

### Panel, Workers y R2

Se conservan las mejoras medidas en las doce opciones administrativas de
[PERFORMANCE_QUERY_AUDIT.md](PERFORMANCE_QUERY_AUDIT.md): verificación de identidad
en vuelo compartida, lecturas protegidas concurrentes con guard fresco,
deduplicación de reclamaciones/notificaciones, catálogo del finder diferido
en el editor y precarga de código por intención sin leer registros privados.

La entrega de R2 ya utiliza manifiesto autorizado → un GET condicional → stream;
HEAD utiliza un HEAD. Se verificaron imágenes, vídeo GET/HEAD/Range/ETag,
límites y runtime nativo. El decodificador sigue cargándose solo para cargas.
No se añadieron cachés de permisos, manifiestos o respuestas privadas ni se
convirtieron imágenes/vídeos completos a buffers para entregarlos.
No hubo motivo medido para cambiar este flujo; su optimización anterior se
documenta en [PERFORMANCE_MEDIA_AUDIT.md](PERFORMANCE_MEDIA_AUDIT.md).

## Validación final

- **259 casos únicos** de contratos y aplicación verificados entre las suites:
  112 de medios/Worker/caché, 127 de catálogo/favoritos/checkout/dominio/carrito,
  menos siete casos de caché compartidos; trece de pedidos con CPU ×4 y catorce
  de equivalencia Home/matching/perfiles. No fue una única ejecución monolítica.
- **684 comprobaciones SQL**, 27 migraciones, concurrencia y tipos generados
  por la CLI idénticos al fuente. Clusters detenidos y fixtures revertidos.
- **55 comprobaciones anónimas alojadas**: lectura pública, RLS y rechazos de
  acceso administrativo, perfiles, pedidos, favoritos y tablas privadas.
- **60 navegaciones comparadas**, veinte capturas individuales y una lámina
  comparativa inspeccionada. Cero desbordamientos o errores JavaScript en esa
  muestra. Los **16 CSS compilados son idénticos** antes y después.
- Pedidos con cien registros, selección masiva, error parcial, historial y
  cambio de propietario, en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024
  y 390 × 844, con CPU ×4. La evidencia de las doce pantallas del panel permanece
  en el informe específico previo.
- TypeScript, ESLint completo, formato de archivos afectados, build de staging,
  manifiesto de **347 archivos** y empaquetado Wrangler `--dry-run` correctos.
  Dos pruebas nativas requirieron repetición fuera del sandbox por acceso de
  esbuild/workerd; pasaron sin alterar sus aserciones.
- `npm audit --omit=dev --audit-level=high`: cero avisos altos o críticos;
  dos moderados en la cadena ExcelJS/uuid. No se aplicó `audit fix --force`,
  que propone una versión incompatible de ExcelJS.

La comparación completa también conserva los resultados sin mejora específica:
Tienda pasó de 317 a 334 ms en escritorio y 4136 a 4851 ms en móvil; ficha,
de 490 a 340 ms y 4207 a 4236 ms. No cambiaron sus solicitudes ni bytes.
Esas variaciones no prueban una mejora o regresión causal con tres muestras
y contención local. La matriz visual de checkout ya tenía el loader acotado
en ambas compilaciones: su ahorro debe leerse en la medición de loaders,
no atribuirse a esas capturas.

## Límites y trabajo posterior identificado

1. **Paginación administrativa realmente remota.** Catálogo y pedidos todavía
   hidratan páginas secuenciales de cien hasta el límite de 10000 para el estado
   compartido. La tabla muestra una página, pero no limita toda la descarga.
   Cambiarlo requiere coordinar búsqueda, inventario, clientes, importación,
   selección de todos los filtrados, PDFs y ediciones pendientes. No se eliminó
   información ni se sustituyó por una página parcial como atajo. Es la principal
   tarea estructural pendiente para volúmenes comerciales grandes.
2. **Recomendador completo.** Sigue obteniendo todos los candidatos al abrirse
   y enviar respuestas. Trasladarlo a una RPC requiere reproducir puntuación,
   presupuestos, disponibilidad y desempates con equivalencia demostrada.
3. **Arranque móvil frío.** La mejora de Home es considerable, pero el LCP móvil
   limitado de laboratorio sigue por encima de 2,5 s. Persisten código compartido,
   CSS, fuentes y cadenas de descubrimiento; PDF/Excel no se descargan durante
   las cinco rutas públicas observadas. No se promete una puntuación perfecta.
4. **Ciclo de ofertas y búsquedas.** El refresco visible espera metadatos antes
   de revalidar la ruta. Las búsquedas descartan respuestas obsoletas, pero no
   cancelan una RPC pública que puede estar compartida con otro consumidor.
   Cambiarlo exige conservar frescura e invalidación, sin cachear cotizaciones.
5. **Campo y lanzamiento.** Faltan percentiles de usuarios reales, dispositivo
   físico y verificación tras publicar el nuevo frontend. Producción conserva
   el esquema anterior: aplicar migraciones antes del cliente al autorizar su
   despliegue. Dominio, pagos y condiciones comerciales no se alteraron aquí.

## Evidencia y reproducción

- `artifacts/network-audit-2026-11-05/{before,after}.json`, `query-review.md`:
  loaders/SDK, fallos y carrera entre pestañas.
- `artifacts/performance-2026-11-05/browser-{before,after}.json`,
  `browser-comparison.json`, `screenshots/comparison-overview.png`: interfaz.
- Mismo directorio: `sql-query-summary.json`, `sql-query-repeat-summary.json`,
  `sql-query-benchmark.md`, `sql-regression-summary.json`: planes y límites.
- `artifacts/supabase-sql-tests/run-E1g9Il/result.json`: suite SQL final.
- Pruebas permanentes: `supabase/tests/019_query_media_lookup.sql`,
  `020_home_catalog_projection.sql`, `tests/home-catalog-projection.spec.ts`,
  casos añadidos en `supabase-catalog.spec.ts`, `catalog-remote-domain.spec.ts`
  y `checkout-supabase.spec.ts`.

Comandos de comprobación, sin despliegue:

```powershell
npm.cmd --ignore-scripts run typecheck
npm.cmd run lint
npm.cmd --ignore-scripts run build:staging
npm.cmd run postbuild:staging
node --experimental-strip-types scripts/worker-build.mjs check staging
npm.cmd run test:media:worker
npm.cmd run test:catalog:supabase
npm.cmd run test:checkout:supabase
npm.cmd run test:favorites:supabase
npm.cmd run test:orders:supabase
npm.cmd run test:supabase:sql
npm.cmd run test:supabase:public
npm.cmd run security:audit
```

El `--ignore-scripts` evita regenerar tipos del Worker mediante un prehook
que invoca la guarda de build sin entorno; no omite TypeScript ni Vite.
Los tipos SQL se verificaron mediante generación real aislada. Los puertos de
prueba deben estar libres; no se debe terminar el Vite del desarrollador.
Los artefactos están excluidos de Git y no contienen credenciales.

Referencias de método: [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html),
[optimización en Supabase](https://supabase.com/docs/guides/database/query-optimization),
[Web Vitals y diferencia entre laboratorio y campo](https://web.dev/articles/vitals).
