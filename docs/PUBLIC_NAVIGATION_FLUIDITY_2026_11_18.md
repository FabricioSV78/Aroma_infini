# Navegación pública y checkout — 18 de noviembre de 2026

Publicado y comprobado exclusivamente en staging. La intervención se centró en
Home, Tienda, Producto y checkout, según la confirmación del usuario.

## Cambios entregados

- **Carga visible durante la navegación.** El indicador existente ahora muestra
  spinner y texto, además de la línea superior. Conserva el contenido anterior
  mientras llega el destino. No mueve la página, captura el foco ni intercepta
  clics; desaparece al terminar la navegación. Respeta movimiento reducido.
  Los skeletons iniciales y los estados de imágenes existentes se conservan.
- **Primera cotización sin espera artificial.** Se retiró el debounce de 150 ms
  exclusivamente del primer envío al entrar en checkout. Las ediciones
  posteriores siguen agrupándose durante 150 ms. Se mantienen cancelación,
  descarte de respuestas anteriores, validaciones y confirmación transaccional.
- **Cotización propia de cada visita.** Un resumen de una visita anterior ya no
  hace que el checkout parezca verificado antes de recibir la consulta actual.
  Se compara la identidad del objeto de ubicación, que también distingue un
  retorno mediante Atrás aunque se restaure la misma clave del historial.
  Los comprobantes pendientes de recuperación mantienen su flujo independiente.
- **Menos trabajo al escribir.** La derivación del catálogo seleccionado y de
  la configuración de envío se memoriza por sus referencias inmutables. El
  carrito vacío evita recorrer productos y los IDs se consultan mediante Set.
  Se conserva exactamente la clave comercial resultante; no es una caché nueva
  de precios, stock ni autorizaciones.

No se modificaron SQL, migraciones, RPC, Auth/MFA, RLS, inventario, importes,
descuentos, reglas de entrega, recursos comerciales, animaciones existentes ni
dependencias. R2 conserva su frontera privada y las comprobaciones de manifiesto.

## Medición alojada

Chrome real con emulación, tres recorridos por perfil y versión. Hubo nueve
recorridos medidos antes y nueve después, de diez pasos cada uno: **180 pasos
medidos**, más 18 calentamientos completos excluidos. Los recorridos incluyen
Home, Tienda, marca, ordenamiento, filtros, Producto, variante, carrito,
Contacto y checkout. No se enviaron pedidos, reservas ni pagos.

Escritorio: 1440 × 900. Móvil: 390 × 844, CPU ×4 y 9 Mbps/80 ms. Móvil lento:
390 × 844, CPU ×4 y 1,6 Mbps/150 ms. Son muestras de laboratorio con caché de
navegador caliente y cohortes antes/después secuenciales, no datos de campo,
teléfonos físicos ni una comparación AB/BA contemporánea.

### Cotización: tiempo desde el clic, medianas en ms

| Perfil | Inicio de solicitud antes → después | Fin HTTP antes → después |
| --- | ---: | ---: |
| Escritorio | 161 → 9 | 393 → 141 |
| Móvil | 189 → 41 | 363 → 190 |
| Móvil lento | 184 → 41 | 431 → 242 |

El adelanto de aproximadamente 143–153 ms del inicio corresponde a la espera
retirada. **No se atribuye toda la diferencia del fin HTTP al código**: la
duración HTTP también varió entre cohortes. La cotización sigue consultándose
al servidor una vez por entrada, con las mismas reglas comerciales.

La interfaz inicial del checkout siguió apareciendo en unos 7 ms en escritorio
y 26 ms en móvil. El antiguo indicador podía desaparecer usando una cotización
de la visita anterior; por eso ese tiempo no equivale a importes actualmente
verificados. Después, los importes de la visita se confirmaron aproximadamente
en 143/199/247 ms. Los campos continúan disponibles mientras se comprueban.

### Navegación de catálogo: contenido disponible, medianas en ms

| Perfil | Home antes → después | Tienda antes → después | Producto antes → después |
| --- | ---: | ---: | ---: |
| Escritorio | 232 → 177 | 243 → 145 | 234 → 149 |
| Móvil | 220 → 227 | 210 → 215 | 214 → 222 |
| Móvil lento | 283 → 241 | 286 → 250 | 292 → 237 |

Estos destinos conservaron **una consulta por navegación**. Las variaciones,
incluidos los pequeños aumentos móviles, no demuestran una aceleración general
de la red o de PostgreSQL: no se cambiaron esas consultas ni su infraestructura.
La mejora de UX aquí es el feedback visible durante la espera, sin vaciar ni
bloquear la pantalla. No se ampliaron períodos de caché para reducir los números.

En los recorridos finales hubo cero errores JS o HTTP, fallos de descarga no
cancelados, imágenes principales fallidas, recargas completas o desbordamientos.
El CLS observado fue cero. Los recorridos móviles no crearon vídeos ni
solicitudes multimedia de vídeo. Estos resultados no sustituyen INP de campo.

Una traza inicial adicional de Chrome con Slow 4G y CPU ×4 registró LCP de
4236 ms: TTFB 842 ms, descubrimiento 64 ms, descarga 2328 ms y retraso de
representación 1003 ms. Es una muestra fría de diagnóstico, no una mejora
antes/después demostrada. Esta entrega **no declara resuelto el LCP frío** ni
una navegación instantánea independientemente de la conexión.

## Validación

| Comprobación final | Resultado y alcance |
| --- | --- |
| Checkout completo | 27 aprobadas; SDK y transporte aislados |
| Catálogo completo | 92 aprobadas; transporte aislado, también miles de registros |
| Carga y navegación | 11 aprobadas; espera, foco, contenido conservado y ahorro de datos |
| Contratos Node | 215 aprobados |
| TypeScript, ESLint, build, paquete y dry-run | Aprobados |
| Navegación alojada final | 9 recorridos medidos y 9 calentamientos, todos aprobados |
| Loading alojado controlado | 9 casos en 390, 768 y 1440 px; 18 capturas |
| Recursos publicados | 120 JS/CSS con hashes idénticos al paquete local |
| Configuración | Variables y binding R2 de staging coincidentes |
| Seguridad anónima | Subida administrativa 401; namespace interno multimedia 404 |
| Disponibilidad alojada final | Aprobada; 70 solicitudes de lectura, cinco imágenes verificadas |

Las cinco resoluciones de catálogo y checkout —1920, 1440, 1366, 768 y 390 px—
se verificaron con servicios aislados. Las pruebas alojadas de loading retienen
temporalmente la solicitud pública y luego dejan pasar su respuesta real:
prueban la interfaz, **no son muestras de rendimiento ni errores reales de R2**.
Se conservan los datos escritos al terminar la cotización y no se desplazan los
controles de contacto. Las regresiones cubren también retorno por enlaces y
por historial, StrictMode, edición rápida, errores, conflictos, cambios de
identidad y recuperación de respuestas perdidas.

La revisión previa detectó el caso de historial y se corrigió antes de la
validación final. Un dry-run local inicial rechazó una combinación de variables
del CLI; se corrigió la ejecución con el entorno comprobado en memoria y un
archivo de entorno del CLI vacío. No se omitió ni debilitó el guard del paquete.

## Versión y evidencias

- Base: `3169210f-e199-45fa-b52c-01e65286054f`.
- Entregada: `f7c8f472-64e0-41d3-b223-3de2980111dd`, activa al 100 %.
- Deployment: `a2e32abd-6d49-435b-a523-0d711f90dc49`.
- SHA-256 del manifiesto: `276f11a318f21e5435c9521b0bbf37168ce3578e9d8f61cc8e023d1acb3cd426`.
- Worker: `aroma-infini-frontend-staging`; Supabase: `aroma-infini-dev`;
  bucket: `aroma-infini-media-dev`.
- Producción conserva el deployment `9baa7c50-262a-4f23-bf52-5742a52ffa0b`.
  No hubo despliegues ni migraciones productivas, commit o push.

Evidencias locales, ignoradas por Git:
`artifacts/navigation-fluidity-2026-11-18/`. Incluyen `comparison.json`,
`spa-baseline.json`, `spa-candidate.json`, `tests-final.json`, `quality-final.json`,
`verified.json`, `final-state.json`, capturas y logs. El código continúa como
cambios locales pendientes de incorporar al flujo habitual de GitHub.

Capturas de la espera controlada: [navegación móvil](../artifacts/navigation-fluidity-2026-11-18/loading-screens/product-390-loading.png)
y [cotización móvil](../artifacts/navigation-fluidity-2026-11-18/loading-screens/quote-390-loading.png).

## Límites conservados

La carga fría y los picos de red siguen dependiendo de documento, transferencia
y representación. No hay evidencia nueva para abrir R2, quitar comprobaciones
de publicación, cachear datos comerciales más tiempo o cambiar el plan de
Supabase. Tampoco se conservó una propuesta de reutilizar productos del Hero:
no aportaba beneficio al contenido actual y exigía más garantías de frescura.
Se priorizaron los cambios demostrables sin ampliar la arquitectura.
