# Arranque y renderizado del frontend

12 de noviembre de 2026, Lima. Continuación de la
[auditoría anterior](PUBLIC_RENDER_PATH_OPTIMIZATION_2026_11_12.md), después
de aplicar la [política móvil sin vídeos](MOBILE_VIDEO_POLICY.md).

## Resultado y alcance

Se corrigieron dos inicializaciones innecesarias y se publicó el resultado
**solo en staging**. Hay menos trabajo bloqueante y una mejora observada en
la navegación Tienda → ficha y en Home con el perfil móvil habitual.
**La carga fría con la red más limitada todavía no cumple el objetivo de
una mejora uniforme**: Home y Tienda empeoraron ligeramente en esa serie.
No se presenta una reducción del bundle como prueba suficiente de rapidez.

| Referencia | Versión del Worker |
| --- | --- |
| Antes | `a0476236-8dc3-4569-8056-588849bcdf67` |
| Final de esta entrega | `3c5debe7-abc0-40f8-b54c-26e4a991265a` |

Staging: <https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev>.
Paquete SHA-256:
`31ea138e08e0cb9d0b417496e17a1455e157024f952251b5d897ce44c27291bb`.
Supabase utilizado: `aroma-infini-dev`, `tkxvexfapszilzhogvgu`.

No se modificaron producción, SQL, índices, RLS, MFA, permisos, reglas de
precios, inventario, checkout, recursos comerciales ni dependencias.
Tampoco se añadieron precargas, capas de caché ni seguimiento de usuarios.

## Qué estaba consumiendo tiempo

La entrada pública importaba `admin-service.ts` mediante varios caminos:
la hidratación local de `main`, el adaptador del catálogo, la configuración
comercial, los servicios locales del checkout y el seguimiento de pedidos.
Esto descargaba y evaluaba el almacén administrativo aunque el comprador
solo estuviera viendo productos remotos.

Ahora `admin-runtime.ts` separa esa carga. La tienda remota utiliza un canal
de notificación que no contiene registros ni inicializa el almacén. Los
módulos administrativos se importan cuando realmente se necesitan. El
adaptador local conserva su inicialización y persistencia anteriores; un
fallo remoto nunca activa datos locales como sustitución.

Se mantiene el reinicio de datos comerciales al cambiar la identidad o
cerrar sesión. Si Auth resuelve antes de cargar el módulo, únicamente se
conserva el marcador vacío de reinicio, sin registros privados. Las lecturas
administrativas vuelven a comprobar el administrador después de la carga
asíncrona. Las suscripciones siguen utilizando el mismo conjunto de avisos
y las mismas revisiones de datos.

También se movió `resolveShippingZone` a su módulo puro de tarifas, sin
cambiar su cuerpo ni las reglas de cobertura. En Envíos se conserva el
despacho directo del loader autorizado de configuración comercial: evita
una segunda lectura en frío al diferir los demás loaders administrativos.

El perfil de CPU identificó además `new Intl.NumberFormat` durante la
evaluación del módulo de moneda: alrededor de 30 ms de tiempo propio en
las muestras intermedias. Ahora se crea al mostrar el primer precio y se
reutiliza. El coste se difiere, no desaparece; se mantienen `es-PE`, PEN,
centavos y las mismas opciones de redondeo y presentación.

La aplicación utiliza `createRoot`, no `hydrateRoot`. Esta fase trata de
evaluación de módulos y primer montaje de React, no de corregir una
hidratación SSR. No se añadieron memorias de componentes sin evidencia ni
se alteraron los proveedores del carrito, cuenta o checkout.

## Método de medición

Comparativa final: **27 cargas antes y 27 después**, seriales, contra los
servicios reales de staging. Tres muestras por página y perfil: Home,
Tienda y `/producto/kamrha`. Cada carga utiliza un contexto nuevo y limpia
la caché HTTP de Chrome. No purga CDN, DNS o conexiones del proveedor.

| Perfil | Pantalla / DPR | CPU | Red emulada |
| --- | --- | --- | --- |
| Escritorio | 1440 × 900 / 1 | Sin limitación adicional | Sin limitación adicional |
| Móvil | 390 × 844 / 2 | ×4 | 9 Mbps bajada, 1,5 Mbps subida, 80 ms |
| Móvil lento | 390 × 844 / 2 | ×4 | 1,6 Mbps bajada, 750 kbps subida, 150 ms |

Se observa durante cinco segundos después de encontrar el contenido; en
Home también se espera su imagen principal. Se guardan solicitudes,
errores, LCP, desplazamientos, tareas largas, heap y capturas. Hay seis
recorridos Tienda → ficha por versión y perfiles nativos de CPU/CSS.
Las pruebas locales se detuvieron durante las mediciones finales.

Una versión intermedia también recibió 27 cargas. Sus resultados quedan
separados en `runtime-only/`; no se mezclan con los del paquete final.
Los perfiles instrumentados iniciales coincidieron con otras pruebas
locales: sirven para localizar funciones y observar costes, pero no para
atribuir causalmente toda diferencia de CPU al cambio de código.

Son mediciones de laboratorio con Chrome, no teléfonos físicos ni
percentiles de usuarios reales. El catálogo público disponible tenía un
producto; esta entrega no acredita por sí sola miles de productos remotos.

## Resultados de carga inicial

Medianas de tres muestras, milisegundos. Se incluyen las regresiones.

| Página | LCP escritorio antes → después | LCP móvil antes → después | LCP móvil lento antes → después |
| --- | ---: | ---: | ---: |
| Home | 1304 → 1204 | 1648 → 1492 | 3860 → 4020 |
| Tienda | 1364 → 1460 | 1700 → 1740 | 4036 → 4156 |
| Ficha | 1120 → 1176 | 1424 → 1344 | 3800 → 3772 |

Home móvil mejora aproximadamente 9,5 % en esta serie. Home móvil lento
empeora 4,1 % y Tienda móvil lento 3 %. La diferencia pequeña de la ficha
lenta no demuestra una mejora importante. Su LCP móvil es el logotipo,
no la fotografía: no debe confundirse con la carga completa de la galería.
Las muestras tienen variabilidad de red y servidor; tres observaciones
no establecen un percentil ni significación estadística.

| Página, móvil lento | Contenido localizado en DOM antes → después | Tiempo bloqueante observado antes → después | Heap aproximado antes → después |
| --- | ---: | ---: | ---: |
| Home | 3883 → 4279 ms | 70 → 56 ms | 7,6 → 7,5 MiB |
| Tienda | 3480 → 3853 ms | 77 → 61 ms | 6,4 → 6,3 MiB |
| Ficha | 3818 → 3800 ms | 91 → 60 ms | 6,4 → 6,3 MiB |

El contenido localizado es un indicador de DOM, no una medición de píxeles
visibles al terminar las animaciones. El tiempo bloqueante suma el exceso
sobre 50 ms de cada tarea observada en esa ventana; no es el TBT completo
de Lighthouse. Las tres páginas conservaron una tarea larga mediana en
móvil lento, de 120 → 106, 127 → 111 y 141 → 110 ms respectivamente.
El heap es una instantánea aproximada, sin GC forzado: no prueba ausencia
de fugas a largo plazo. CLS se mantuvo en 0,00 y no hubo errores JavaScript
ni desbordamientos horizontales en estas cargas.

## Navegación y trazas de Chrome

| Recorrido Tienda → ficha | Escritorio antes → después | Móvil lento antes → después |
| --- | ---: | ---: |
| Clic hasta localizar el título | 233 → 213 ms | 403 → 349 ms |
| Ejecución de script durante la ventana | 26 → 14 ms | 106 → 74 ms |
| Mayor duración Event Timing registrada, mediana | Sin muestra útil | 32 → 24 ms |

El título aparece aproximadamente 13 % antes en el recorrido móvil lento
medido. Es un indicador de navegación, no tiempo de descarga de todas las
fotos ni INP de campo. No hay datos CrUX para staging; no se inventó un INP
de usuarios reales ni se activó analítica para obtenerlo.

Como contraste independiente se usó el preset **Slow 4G** de Chrome
DevTools, CPU ×4 y 390 × 844 / DPR 2. Es otra configuración de red y una
sola traza larga por página y versión; no se mezcla con las medianas:

| Traza | LCP antes → después | Retraso de renderizado del LCP antes → después |
| --- | ---: | ---: |
| Home | 5431 → 5327 ms | 1292 → 1247 ms |
| Tienda | 4983 → 4822 ms | 2533 → 2342 ms |

El LCP de Tienda en estas trazas es el logotipo, mientras que en la serie
repetida es la imagen de producto. Las trazas muestran una reducción
modesta del retraso, no que la carga inicial esté resuelta. Home conserva
unos 3451 ms de carga del recurso LCP y 1247 ms de espera para pintarlo.

Los perfiles de CPU separados observaron estos tiempos acumulados:

| Página | Script antes → después | Layout antes → después | Recalcular estilos antes → después |
| --- | ---: | ---: | ---: |
| Home | 425 → 199 ms | 189 → 88 ms | 177 → 103 ms |
| Tienda | 442 → 164 ms | 125 → 52 ms | 154 → 78 ms |
| Ficha | 251 → 182 ms | 60 → 55 ms | 109 → 93 ms |

Son muestras instrumentadas individuales con las limitaciones de CPU del
host indicadas arriba; no justifican anunciar esos porcentajes como una
mejora reproducible de la experiencia. Los `.cpuprofile` y timelines se
conservan para inspección, sin sumar eventos anidados como si fueran tareas
independientes.

## CSS, transferencia y decisiones conservadas

No se dividió CSS. El recurso común sigue siendo exactamente
`index-Bht3K7yb.css`, 260136 bytes sin comprimir. Home conserva también sus
dos hojas específicas con los mismos hashes. Las trazas estimaron **0 ms
de ahorro de FCP/LCP** para RenderBlocking antes y después. Separar estilos
por cobertura de una sola pantalla no justificaría alterar la cascada:
[Chrome describe ese diagnóstico y sus límites](https://developer.chrome.com/docs/performance/insights/render-blocking).
La cobertura se utilizó para localizar reglas, no para declarar obsoleto
todo lo que no se ejecutó en la captura.

| Página, móvil lento | JavaScript transferido antes → después | Solicitudes totales antes → después | RPC del navegador |
| --- | ---: | ---: | ---: |
| Home | 329,6 → 318,8 kB | 83 → 87 | 2 → 2 |
| Tienda | 319,2 → 308,4 kB | 70 → 74 | 2 → 2 |
| Ficha | 326,8 → 316,0 kB | 71 → 75 | 2 → 2 |

Son bytes HTTP observados por CDP, incluidas cabeceras, en la ventana de la
prueba. La transferencia total pasa de 1367,8 → 1357,1 kB en Home,
541,9 → 531,2 kB en Tienda y 676,6 → 665,8 kB en ficha. Las fotografías,
vídeos, fuentes y tamaños responsive no se recomprimieron ni cambiaron.
La imagen principal de Home continúa descubriéndose desde el parser HTML.

El corte de dependencias elimina `admin-service` de las solicitudes
públicas, pero la partición automática produce cuatro fragmentos más.
Por tanto, **no se afirma haber reducido el número de peticiones** ni
resuelto toda la fragmentación. No se agruparon arbitrariamente módulos:
la [documentación de Rolldown](https://rolldown.rs/in-depth/manual-code-splitting)
explica que la captura recursiva de dependencias puede modificar qué código
termina junto y cuándo se necesita.

## Validación funcional y visual

| Comprobación | Resultado |
| --- | --- |
| TypeScript, lint, build de staging y paquete Wrangler | Aprobados |
| Node, incluida inicialización diferida y equivalencia de moneda | 186 aprobadas |
| Catálogo con SDK y transporte aislado | 76 aprobadas |
| Configuración comercial, identidad, cierre de sesión y lectura única | 18 aprobadas |
| UI de administración, carrito, checkout, descuentos, stock y cargas | 88 aprobadas |
| Checkout con SDK/Worker y transporte aislado | 24 aprobadas |
| Home con SDK/R2 aislados | 8 aprobadas |
| SEO, HTML, bootstrap y Worker local | 47 aprobadas |
| Política móvil sin descarga de vídeos | 15 aprobadas |

Las suites finales no tuvieron fallos, casos omitidos ni reintentos
necesarios. Una repetición local quedó detenida por restricciones del
entorno; se detuvieron únicamente sus procesos y se repitió con Chrome
habilitado: las 88 pruebas terminaron aprobadas. No se cuenta esa ejecución
incompleta como éxito.

Estas suites usan transportes aislados y no se presentan como compras o
cambios administrativos reales contra servicios alojados. Las mediciones
de navegación sí utilizaron staging, Supabase y las imágenes de R2 reales,
sin escrituras de catálogo, pedidos ni datos de clientes.

La prueba nueva de catálogo recorre Home, Tienda y ficha remotos y comprueba
que el almacén no se inicializa, no se descarga `admin-service.ts` y no hay
RPC administrativas. Los escenarios de cambio de propietario conservan
el reinicio de datos privados, incluidos los cargados después de Auth.

Se inspeccionaron capturas de escritorio y móvil. Las de Tienda escritorio
y Home/Tienda/ficha móvil son idénticas byte a byte en las muestras
comparadas; la ficha de escritorio conserva composición y estilo, con
diferencias de estado de carga de sus miniaturas. No se eliminaron efectos,
animaciones ni contenido.

## Evidencias y pendientes

Carpeta local: `artifacts/frontend-render-2026-11-12/`.

Capturas seleccionadas:
[Home móvil antes](../artifacts/frontend-render-2026-11-12/screens/before-mobile-home.png)
→ [después](../artifacts/frontend-render-2026-11-12/screens/after-mobile-home.png);
[Tienda escritorio antes](../artifacts/frontend-render-2026-11-12/screens/before-desktop-store.png)
→ [después](../artifacts/frontend-render-2026-11-12/screens/after-desktop-store.png);
[ficha móvil antes](../artifacts/frontend-render-2026-11-12/screens/before-mobile-product.png)
→ [después](../artifacts/frontend-render-2026-11-12/screens/after-mobile-product.png).

- `comparison.json`, `steps.json`: medianas y descubrimiento de recursos.
- `before-browser.json`, `after-browser.json`: las 54 cargas finales comparadas.
- `before-journey.json`, `after-journey.json`, `traces/`: recorridos y timelines.
- `profiles/`, `*-startup-profile.json`: perfiles nativos y datos CPU/CSS.
- `devtools-before.json`, `devtools-after.json`: trazas largas y desglose LCP.
- `screens/before-*.png`, `screens/after-*.png`: capturas.
- `*-tests.json`, `optimized-build/check/deploy.json`: validaciones y versión.
- `runtime-only/`: candidato intermedio, separado de la entrega final.

La siguiente prioridad sigue siendo la **carga fría móvil lenta**: persisten
la transferencia del Hero y la espera hasta el primer montaje completo.
También queda evaluar la fragmentación de módulos comunes con un
experimento controlado que demuestre mejoría antes de adoptarlo. No se
aplicó una agrupación general que pudiera adelantar código de otras rutas
o cambiar la inicialización de Auth.

No hay evidencia para declarar navegación instantánea, INP de campo
aprobado, ausencia de fugas a largo plazo ni capacidad del frontend con
miles de productos reales en esta fase. Las mejoras entregadas reducen
trabajo innecesario y conservan comportamiento y diseño; los resultados
mixtos de carga inicial permanecen documentados.
