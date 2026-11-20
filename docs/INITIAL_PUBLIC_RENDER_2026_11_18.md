# Arranque público: contenido inicial antes de React

18 de noviembre de 2026. Continuación del
[diagnóstico de capacidad](CAPACITY_DIAGNOSIS_2026_11_18.md).

## Resultado y alcance

Se implementó y activó **exclusivamente en staging** un renderizado inicial
híbrido de Home, Tienda y Producto. El documento incluye el primer contenido
visual usando las mismas consultas anónimas y los mismos manifiestos que el
Worker ya recuperaba. El navegador puede representar ese contenido antes de
terminar de descargar y montar React.

No es una migración a otro framework ni una hidratación SSR completa. React
continúa siendo la aplicación interactiva y reemplaza el contenido inicial
cuando sus módulos y loaders están preparados. Se preservan el foco y el
progreso de las animaciones durante ese relevo.

**La mejora de carga fría está demostrada; no se eliminaron todas las esperas.**
Persisten variaciones DNS/TLS/HTTP, una regresión puntual de Tienda en escritorio,
otra de Producto en móvil caliente y tareas largas de JavaScript. No se presenta
esta intervención como una mejora uniforme de CPU, INP o todas las navegaciones.

Producción, Supabase, RLS, Auth/MFA, stock, precios, pagos y R2 no se modificaron.
No se crearon pedidos, reservas ni pagos reales durante las pruebas alojadas.
Los recorridos de checkout terminaron en revisión y regresaron a entrega.

## Alternativas y decisión

| Alternativa | Evaluación y decisión |
| --- | --- |
| CSR anterior con precargas | Base real de comparación. Descubre recursos pronto, pero necesita montar React para crear sus elementos visibles. |
| Más fragmentación de bundles | No se aplicó: las intervenciones anteriores no demostraron que otra división mejorara este cuello. Se conservó el grafo de rutas y sus cargas diferidas. |
| Prerenderizado estático de catálogo | No se implementó: una copia generada en build no representa publicación, precios y disponibilidad de cada solicitud. No se introdujo caché comercial adicional. |
| SSR React completo e hidratación | Se revisaron sus requisitos: árbol compartido, datos iniciales compatibles y separación de proveedores dependientes del navegador. No se construyó ni midió una aplicación SSR completa, por lo que no se afirma que haya perdido un benchmark. Su alcance excede el cambio mínimo necesario para este prototipo. |
| HTML inicial público por solicitud + React | Alternativa implementada y medida. Reutiliza los DTO existentes, mantiene las transacciones en el cliente/backend actual y permite comprobar el beneficio sin migrar Auth, carrito o administración. |

La documentación de [React `createRoot`](https://react.dev/reference/react-dom/client/createRoot)
y [`hydrateRoot`](https://react.dev/reference/react-dom/client/hydrateRoot)
distingue reemplazo e hidratación. Este proyecto utiliza el primero; no se
intentó hidratar un árbol parcial como si fuera el árbol React completo.
La [guía SSR de Vite](https://vite.dev/guide/ssr.html) sirvió para evaluar el
alcance de una futura implementación con entradas cliente/servidor compartidas.

## Implementación

- `worker/public-initial-context.ts` conserva el valor de sus proyecciones
  públicas para reutilizarlo dentro de la misma solicitud. No añade RPC.
- `worker/catalog-seo.ts` y `worker/seo-router.ts` entregan al compositor el
  contexto público de la ficha que ya se consultó para SEO.
- `worker/public-initial-visual.ts` valida los datos antes de generar el primer
  Hero, la página visible del catálogo o la galería/compra de la ficha. Usa los
  cálculos compartidos de precios, variantes, destinos y recursos responsive.
- `worker/public-initial-header.ts` reproduce el encabezado con enlaces nativos,
  sin inventar identidad, favoritos ni cantidades privadas de carrito.
- `worker/site-media-seo.ts` integra el contenido y conserva el envío temprano
  del encabezado, CSS y precargas. La función nueva está limitada a
  `APP_ENVIRONMENT === 'staging'`.
- `src/main.tsx` conserva el HTML inicial hasta que el router está preparado.
  No lo sustituye por un skeleton intermedio. El primer render de React retoma
  la aplicación normal y restaura el foco dentro de la región correspondiente.
- `src/domain/public-initial-motion.ts` identifica las superficies de animación
  compartidas. `src/services/public-initial-motion.ts` transfiere únicamente
  números y firmas visuales en memoria, una sola vez y para la URL exacta.
  `useStoreReveal` reanuda las animaciones antes del paint; no cambia duraciones,
  CSS, observadores ni animaciones de posteriores navegaciones SPA.

Las imágenes conservan las variantes reales, `sizes`, dimensiones y calidad.
El CSS principal desplegado sigue siendo `index-C2pMwgJO.css`. No se agregaron
fuentes, precargas indiscriminadas, dependencias ni una nueva caché.

El prototipo inicial detectó un defecto real: React volvía a ocultar contenido
ya visible al reiniciar su entrada. En cuatro casos de Tienda/Producto, escritorio
y móvil, la opacidad llegó a cero. Después de corregir la continuidad, la
opacidad mínima fue **1**, sin fotogramas por debajo de 0,95 durante el relevo.
Se conservaron las dos series de diagnóstico.

### Límites deliberados

El HTML inicial no es toda la web sin JavaScript: Home anticipa su primer Hero;
el resto de secciones e interacciones siguen siendo React. Los filtros, variantes,
favoritos y compra permanecen inertes hasta el montaje para no aceptar acciones
que después se pierdan. Los enlaces nativos permiten navegar mientras tanto.

Las rutas con consultas/filtros, búsquedas y estados no reconocidos mantienen
su recorrido cliente habitual. Los datos ausentes, no disponibles o no verificados
también usan ese fallback. No se inventan productos ni se reviven originales
retirados. La política de vídeos exclusivos de escritorio se conserva; el HTML
inicial de una campaña de vídeo utiliza su imagen de portada.

## Método de medición

Serie principal: `artifacts/initial-visual-2026-11-18/final-clean.json`.

- **120 cargas reales**: tres rutas, dos perfiles, dos versiones, cinco muestras
  por combinación y carga fría/caliente en cada proceso.
- Versiones alternadas A/B y B/A por muestra. Chrome 157.0.8103.79, mismo equipo
  y conexión. Sin builds, pruebas locales ni otras mediciones simultáneas.
- Escritorio: 1440 × 900, DPR 1. Móvil: 390 × 844, DPR 2, CPU ×4,
  1,6 Mbps de descarga, 750 kbps de subida y 150 ms de latencia emulada.
- Proceso/contexto nuevos por ruta/muestra/versión; después recarga caliente.
  Caché fría significa **caché del navegador**, no un MISS forzado en Cloudflare.
- Respuestas y recursos reales de staging. La selección de versión no sustituye
  respuestas. Se verifica el hash/nombre del entry y se bloquean escrituras.
- Observadores pasivos de LCP/CLS/tareas largas y métricas CDP. Se espera el
  relevo interactivo y un segundo adicional: no se recorta el LCP al primer HTML.
- Se conservaron trazas de Chrome, solicitudes, CF-Ray, Server-Timing,
  identificadores upstream y capturas. La hoja de resultados es `summary.json`.

Otras series, **separadas de la principal**:

- `paired.json`: 120 cargas del prototipo anterior a la continuidad de movimiento.
- `connection-control.json`: 120 cargas adicionales del prototipo, con conexión
  abierta previamente mediante `robots.txt`, para distinguir transporte y recursos.
- `final-cold.json`: 120 cargas de la candidata final con sondeo de visibilidad
  mediante rAF. Ese sondeo puede forzar cálculo de estilo; sirve para diagnosticar
  la fotografía visible, no para reemplazar las cifras oficiales pasivas.
- `active-browser.json`: doce cargas posteriores a la activación, sin selector
  de versión. Confirman el tráfico ordinario; no son otra cohorte A/B.
- Pilotos y pruebas reteniendo JavaScript se conservan como experimentos, no se
  mezclan con los resultados de la versión final.

Son pruebas de laboratorio, no dispositivos físicos ni INP de campo. El catálogo
alojado tenía un producto activo; estas pruebas no afirman medir miles de fichas
reales concurrentes. La suite aislada sí comprueba contratos de miles de registros.

## Comparativa final

Medianas en milisegundos, cinco muestras por celda. Base
`e8798e4b-6e93-46af-92d8-8e5994889449`; candidata
`01146265-aa5a-4469-959d-6d0788844eba`.

| Perfil / página | LCP frío antes → después | LCP caliente antes → después | TTFB frío antes → después |
| --- | --- | --- | --- |
| Escritorio / Home | 1604 → 1168 | 432 → 340 | 536 → 433 |
| Escritorio / Tienda | 1320 → 1416 | 508 → 452 | 450 → 485 |
| Escritorio / Producto | 1560 → 1132 | 512 → 460 | 444 → 449 |
| Móvil lento / Home | 3160 → 2308 | 648 → 648 | 545 → 452 |
| Móvil lento / Tienda | 2868 → 2596 | 688 → 600 | 504 → 363 |
| Móvil lento / Producto | 3700 → 2544 | 656 → 852 | 1212 → 655 |

Home móvil mejora un **27 %** en frío. Tienda registra un **9,5 %** y Producto
un **31 %**, pero no debe atribuirse todo al renderizado: el TTFB también varió.
En Producto hubo más demora DNS en la base. Comparando el intervalo posterior
a cabeceras de cada muestra, las medianas móviles fueron:

| Página | LCP menos TTFB antes → después | Elemento de primera imagen presente antes → después |
| --- | --- | --- |
| Home | 2574 → 1889 | 3003 → 667 |
| Tienda | 2244 → 2178 | 2802 → 677 |
| Producto | 2489 → 1926 | 3617 → 775 |

**Advertencia metodológica:** Tienda base registra frecuentemente el logotipo
como LCP; la candidata registra la fotografía del producto. En móvil Producto
también cambió de logotipo a foto en esta serie. No son el mismo elemento.
Las trazas y la prueba independiente de fotografía visible respaldan el cambio
percibido, pero no permiten interpretar toda diferencia LCP como ahorro de
descarga de esa misma fotografía.

En la serie rAF separada, la fotografía móvil alcanzó carga y opacidad compuesta
≥ 0,95 en medianas de Home **2893 → 2433**, Tienda **3167 → 2609** y Producto
**3446 → 2784** ms. Es una medida visual instrumentada, no una Core Web Vital.

### CPU, transferencia y memoria

No se redujo artificialmente la aplicación. El JavaScript comprimido observado
crece aproximadamente **1,3 KiB** por el relevo visual; el HTML comprimido crece
aproximadamente **1,4 / 2,0 / 2,5 KiB** para Home/Tienda/Producto. Fuentes y CSS
son los mismos. Las medianas de solicitudes móviles se mantienen en
**26 / 16 / 17**, respectivamente. No aparecen consultas adicionales por imagen.

La memoria JS móvil fría es comparable: Home 6,61 → 6,57 MiB; Tienda 7,13 →
7,05 MiB; Producto 6,39 → 6,36 MiB. No es una prueba de ausencia de fugas a largo
plazo ni representa todo el proceso Chrome.

La suma del exceso de duración sobre 50 ms de las tareas observadas aumentó en
móvil frío: **52 → 110**, **49 → 125**, **48 → 104** ms. Esta ventana incluye el
arranque y el periodo de observación posterior; **no es TBT de Lighthouse ni INP**.
El trabajo interactivo de React sigue existiendo y el navegador también procesa
el contenido inicial. No se declara una mejora de bloqueo JavaScript. El beneficio
demostrado es que el contenido puede aparecer antes de ese montaje.

### Regresiones y demoras que permanecen

- Tienda de escritorio fría: +96 ms de LCP en la serie principal; cambia el
  elemento LCP. En la serie visual separada, su foto aparece antes (1824 → 1685 ms).
  No se declara una mejora universal de LCP de escritorio para esa página.
- Producto móvil caliente: +196 ms de LCP; TTFB +64 ms. La serie rAF separada
  registró otra distribución (644 → 744 ms). Se conserva como regresión observada,
  no se oculta mediante selección de muestras.
- La candidata conserva un outlier de Producto de **7092 ms**. La traza muestra
  DNS **1081 ms**, conexión **951 ms**, TTFB **2390 ms**, imagen inicial decodificada
  a **3847 ms** y montaje interactivo a **7049 ms**. Al superar el límite existente
  de cinco segundos del contexto inicial, el cliente volvió a consultar el
  contexto público. No se amplió esa vigencia para esconder la demora.
- En ese outlier, las lecturas del Worker registran 38 ms (`site_settings`),
  87 ms (`catalog_product_context`), 41 ms (`site_media_document`) y 67 ms
  (`public_media_aliases`). Los recursos JS compartieron esperas HTTP cercanas
  a 806 ms y transferencias posteriores. El CF-Ray del documento es
  `a5c9ed01bb5664bb-GIG`. Estos datos no identifican por sí solos al responsable
  de DNS/TLS o transporte. No se atribuye a PostgreSQL ni se cambia la red.
- Tras activar, una comprobación ordinaria de Home móvil dio LCP 3528 ms con
  TTFB 1078 ms. Es evidencia de que las variaciones siguen existiendo, no una
  mejora A/B nueva ni una causa ya eliminada.

No se alteraron protocolos, DNS, timeouts, reintentos, precios ni vigencias para
mejorar las métricas. La entrada sigue descargando React y módulos compartidos;
una hidratación SSR completa con componentes compartidos podría investigarse
si se necesita reducir CPU/transferencia adicional. No se afirma que esa futura
migración ya esté implementada o que garantice mejores resultados.

## Validación funcional, visual y de seguridad

| Comprobación | Resultado |
| --- | --- |
| Contratos de Worker, HTML, SEO y sitemap | 79 aprobados |
| Catálogo remoto con SDK y transporte aislado | 92 aprobados |
| Checkout con SDK y transporte aislado | 30 aprobados |
| Navegación, Hero, móvil, recomendador y relevo | 59 aprobados |
| Contratos Node | 215 aprobados |
| TypeScript, ESLint, build staging, sello y Wrangler dry-run | Aprobados |
| Serie pasiva final alojada | 120 cargas, cero errores JS, fotos fallidas o desbordamientos |
| Comparación inicial/interactiva alojada | 21 casos, 42 capturas, siete resoluciones |
| Geometría de título/foto en el relevo final | Diferencia máxima 0 px en x/y/ancho/alto |
| Foco y datos comerciales en el relevo | Coinciden en los 21 casos |
| Vídeos móviles en las series finales | Cero elementos o solicitudes de vídeo |
| Rutas alojadas | 24 destinos × escritorio/móvil: 48 comprobaciones |
| Recorrido alojado | Tienda → ficha → carrito → checkout → entrega → revisión → volver; dos tamaños, sin crear pedido |
| Acceso anónimo a cuenta y administración | Redirección al login correspondiente comprobada |
| Carga administrativa anónima / prefijo interno de caché | 401 / 404 |
| CLS | Máximo de toda la serie principal 0,000566; móvil 0 |

Resoluciones visuales: 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024,
430 × 932, 390 × 844 y 360 × 800. Las capturas están en
`artifacts/initial-visual-2026-11-18/handoff-screens/`.

Las pruebas aisladas no equivalen a operaciones alojadas reales. No se presenta
un pago real, una sesión administrativa autenticada completa o una prueba física
de teléfono como aprobados por esta intervención. Esas funciones conservaron
sus contratos y código; el smoke alojado comprueba sus fronteras anónimas.

Durante el desarrollo fallaron pruebas nuevas por selectores ambiguos de logo,
selección de un enlace oculto del navbar y el tipo opcional de un progreso de
animación. Se corrigieron las causas; no se aumentaron timeouts ni reintentos.
Los fallos y ejecuciones finales permanecen en los artefactos.

## Despliegue verificado

| Dato | Valor |
| --- | --- |
| Worker | `aroma-infini-frontend-staging` |
| Versión activa al 100 % | `01146265-aa5a-4469-959d-6d0788844eba` |
| Deployment | `8c892126-183b-4243-98a6-8f8503ac7d78` |
| SHA-256 del manifiesto sellado | `f28dba24d9199b72de24e9ce99b3fcf7f127c4be2632a27949117900035d5ad6` |
| Recursos JS/CSS cotejados byte a byte | 120 |
| Supabase existente | `aroma-infini-dev`, sin migraciones nuevas |
| Binding R2 | `aroma-infini-media-dev`, sin cambios de acceso |
| Producción, deployment sin cambios | `9baa7c50-262a-4f23-bf52-5742a52ffa0b` |
| Producción, versión sin cambios | `ec8554f6-d47a-4af0-ba60-4623c8125020` |

Hashes de recursos principales:

```text
assets/index-BV1FUcRS.js
d74310b2ec529a81830a2c77479bb814b47774ae4dc5f33276c5990fe86ce3f1
assets/index-C2pMwgJO.css
503dcd778b0e07cfdd2f115d73d26bff9413d03f0a0ade3198afd6893aa8f313
assets/react-vendor-DYloAdPz.js
07b77461c235dbb1c8f93d868b5d5bc9ea7482495cdc1d5b98945b791284f2df
assets/startup-common-CMpJU3IC.js
c151ff25f7db3cf7a083761c7b2048f3654820b60174cf8320ae7bd4f38cb572
```

La candidata se comparó mediante despliegue de staging con base 100 %/candidata
0 % y selección explícita de versión. Tras validar se activó la candidata al
100 %. Se comprobaron bindings y hashes antes y después, además de documentos
ordinarios sin selector de versión. Producción se consultó de solo lectura.

La documentación oficial de
[despliegues graduales de Cloudflare](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/)
describe la separación entre cargar una versión y activarla. Un piloto temprano
detectó que una candidata cargada, pero ajena al deployment activo, no recibía el
override esperado. Se corrigió la preparación y se verificó el entry servido
antes de aceptar las series finales; aquellas cargas no se usaron como mejora.

`develop` y HEAD `7b76fedf125b9d61e17ee26958e0c7646544e821` permanecen iguales.
No se hizo commit, push, reset ni limpieza destructiva. Se conservaron los
cambios previos de checkout y navegación. Los artefactos son locales ignorados;
el código y este informe quedan listos para revisión.

## Evidencia principal

Carpeta: `artifacts/initial-visual-2026-11-18/`.

- `summary.json`, `final-clean.json`, `render-breakdown.json`: cifras oficiales,
  filas por muestra y separación de representación/TTFB.
- `traces/clean-*.json`, `screens/clean-*.png`: trazas y capturas de esa serie.
- `handoff-results.json`, `handoff-screens/`, `handoff-opacity-before.json` y
  `handoff-opacity-after.json`: paridad y corrección del destello.
- `smoke-results.json`, `flow-screens/`: rutas y revisión de checkout reales.
- `premeasure-verified.json`, `verified.json`, `activation.json`,
  `ordinary-active.json`, `active-browser.json`: versión, hashes y tráfico activo.
- `tests-final.json`, `worker-checks.json`, `quality-final.json` y sus logs:
  pruebas reproducibles y controles finales.

La intervención queda completada para **el prototipo medido y su activación en
staging**. Los picos externos y las regresiones indicadas siguen siendo límites
reales; no están declarados resueltos. Una eventual activación en producción
requiere una revisión y autorización propias; la función nueva está desactivada
en el camino de producción.
