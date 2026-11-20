# Checkout: navegación, actualización y composición

18 de noviembre de 2026. Corrección publicada y comprobada exclusivamente en
[staging](https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev).
Complementa [la intervención de navegación pública](PUBLIC_NAVIGATION_FLUIDITY_2026_11_18.md).

## Causas y correcciones

- **Volver desde Revisión:** existían «Editar datos» y «Editar entrega», pero
  faltaba una acción inferior para regresar y el indicador de pasos era
  estático. Se añadió «Volver a entrega» y navegación por teclado/clic a los
  pasos anteriores. Los datos permanecen en el mismo borrador; navegar entre
  pasos no genera nuevas cotizaciones si no cambia su selección. Se conserva
  el bloqueo durante un envío o una confirmación pendiente de recuperación.
- **Importes que desaparecían:** `refreshQuote` vaciaba la cotización al
  actualizarla cada minuto o recuperar visibilidad. El resumen pasaba a
  «Pendiente» y el envío a «Por calcular». La actualización ahora mantiene
  visible únicamente la última cotización verificada de la misma selección,
  identidad y visita, con un indicador discreto junto al total. **Mientras
  se verifica o si falla, no se puede confirmar usando esa cotización.**
  El error conserva los datos y exige actualizar el resumen antes de continuar.
- **Consultas al volver a la pestaña:** se evita repetir una comprobación
  cuando ya hay otra en curso o acaba de iniciarse una hace menos de un minuto.
  Se conservan las verificaciones periódicas y las provocadas por cambios de
  destino, cantidades, descuentos y configuración. No se añade una caché de
  precios ni se modifica SQL. Cada solicitud distingue también volver a una
  selección anterior durante una respuesta pendiente.
- **Composición:** se retira el padding superior que contradecía el criterio
  compartido de breadcrumbs, y se reducen separaciones entre progreso,
  encabezados, campos, modalidades y acciones. Desde 640 px, zona/distrito y
  dirección/referencia forman parejas; en móvil se apilan. Los controles,
  etiquetas, validaciones, modalidades, destinatario alternativo, resumen
  sticky, tipografía y colores existentes se conservan. La cobertura provincial
  desactivada mantiene su rama de formulario para una activación posterior.

No se modificaron Auth/MFA, RLS, RPC, precios, descuentos, inventario, checkout
transaccional, recuperación de respuestas perdidas, reservas, R2 ni dependencias.
No se enviaron pedidos ni pagos alojados. No hubo migraciones, commit ni push.

## Comparación medida en staging

Chrome real con resoluciones emuladas; mismo contenido comercial existente,
sin insertar productos ni pedidos. Las medidas son de geometría de interfaz,
**no una mejora atribuida a latencia SQL, LCP o red**.

| Pantalla | Migaja → título, antes / después | Ancho de zona, antes / después |
| --- | --- | --- |
| 1920 × 1080 | 48 / 12 px | 1053 / 518 px |
| 1440 × 900 | 48 / 12 px | 839 / 411 px |
| 1366 × 768 | 47,5 / 12 px | 793 / 387 px |
| 768 × 1024 | 30 / 8 px | 720 / 351 px |
| 390 × 844 | 30 / 8 px | 358 / 358 px; una columna |

En escritorio, el bloque principal empieza unos 64 px antes y el formulario
de entrega sin destinatario alternativo pasa de unos 955 a 701 px de alto.
Los tres pasos mantienen el mismo eje del contenedor y no tienen desbordamiento
horizontal en las cinco resoluciones.

La actualización periódica se reprodujo antes y después en 1440 y 390 px,
usando respuestas reales de Supabase. Se adelantó un intervalo del reloj del
navegador y se retuvo deliberadamente la respuesta de lectura, sin sustituirla:

| Durante la lectura pendiente | Antes | Después |
| --- | --- | --- |
| Total visible anterior | Desaparece: «Pendiente» | Permanece |
| Mensaje en el encabezado | «Actualizando importes…» | Indicador junto al total |
| Confirmación de pedido | Bloqueada | Bloqueada |
| Consultas de cotización del intervalo | 1 | 1 |
| Pedidos o pagos enviados | 0 | 0 |

El servidor sigue verificando la selección. No se ha ocultado una demora
permitiendo comprar con importes anteriores. Estas pruebas controladas de
interfaz no se presentan como mediciones de duración de red ni como pruebas
en teléfonos físicos.

## Pruebas y despliegue

| Comprobación | Resultado |
| --- | --- |
| Checkout con SDK y transporte aislado | 30 aprobadas |
| Catálogo remoto aislado | 92 aprobadas |
| Estados de carga y navegación | 11 aprobadas |
| Pruebas Node | 215 aprobadas |
| TypeScript, ESLint, build de staging | Aprobados |
| Sello de compilación y empaquetado Wrangler | Aprobados |
| Tres pasos alojados en cinco resoluciones | Aprobados; sin errores JS ni overflow |
| Actualización periódica alojada, escritorio y móvil | Aprobada; importes estables |
| Navegación atrás, campos y selección conservados | Aprobada, también con teclado |

Las pruebas aisladas incluyen errores, cupones, sesión, conflictos,
idempotencia, respuesta perdida, recuperación, cambios de propietario y
confirmación de pedidos simulados con transporte local. No equivalen a un
cobro real ni a una prueba de carga contra Supabase alojado.

- Worker: `aroma-infini-frontend-staging`.
- Versión anterior: `f7c8f472-64e0-41d3-b223-3de2980111dd`.
- Versión activa: `e8798e4b-6e93-46af-92d8-8e5994889449`, al 100 %.
- Despliegue: `e73db47e-32b6-4c41-9e1e-b7724823241e`.
- SHA-256 del manifiesto: `9745e0eb865ab97d4181dea17542f9615482b86e66a1e82c6c852498ef36f240`.
- Los **120 recursos JS/CSS** servidos coinciden byte a byte con el manifiesto.
- Variables de staging y binding `aroma-infini-media-dev` comprobados antes y
  después. Carga administrativa anónima: 401; namespace privado de caché: 404.
- Producción conserva el despliegue `9baa7c50-262a-4f23-bf52-5742a52ffa0b`
  y la versión `ec8554f6-d47a-4af0-ba60-4623c8125020`.

## Capturas y evidencia

| Vista | Antes | Después |
| --- | --- | --- |
| Datos, 1440 px | [Captura](../artifacts/checkout-review-stability-2026-11-18/before/datos-1440.png) | [Captura](../artifacts/checkout-review-stability-2026-11-18/after/datos-1440.png) |
| Entrega, 1920 px | [Captura](../artifacts/checkout-review-stability-2026-11-18/before/entrega-1920.png) | [Captura](../artifacts/checkout-review-stability-2026-11-18/after/entrega-1920.png) |
| Entrega, móvil | [Captura](../artifacts/checkout-review-stability-2026-11-18/before/entrega-390.png) | [Captura](../artifacts/checkout-review-stability-2026-11-18/after/entrega-390.png) |
| Revisión, móvil | [Captura](../artifacts/checkout-review-stability-2026-11-18/before/revision-390.png) | [Captura](../artifacts/checkout-review-stability-2026-11-18/after/revision-390.png) |
| Actualización, móvil | [Captura](../artifacts/checkout-review-stability-2026-11-18/before/refresh-390.png) | [Captura](../artifacts/checkout-review-stability-2026-11-18/after/refresh-390.png) |

Evidencia local ignorada por Git en
`artifacts/checkout-review-stability-2026-11-18/`: resultados de suites,
`hosted-before.json`, `hosted-after.json`, `hosted-refresh-before.json`,
`hosted-refresh-after.json`, `verified.json`, manifiesto de verificación de
hashes, capturas y scripts reproducibles. Las capturas finales cierran por su
botón el aviso temporal de producto añadido para inspeccionar los campos.
