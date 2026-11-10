# Analítica y consentimiento — auditoría y plan

Actualización del 6 de noviembre: la incidencia del prehook de generación de
tipos se corrigió sin quitar las guardas de despliegue. Build y typecheck
completos pasan. Analítica/consentimiento siguen pendientes de los recursos
del titular; ver [auditoría de lanzamiento](LAUNCH_AUDIT_2026_11_06.md).

5 de noviembre de 2026. **Fase actual: auditoría inicial y verificación de recursos.**
Esta página describe decisiones propuestas; no declara instalados GTM, GA4,
Meta ni el banner. La implementación y su validación continuarán después de
identificar los recursos de Google, como solicita el encargo.

## Estado comprobado

| Área                                    | Resultado                                                                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Código frontend, Worker, HTML y scripts | No se encontraron GTM, GA4, `dataLayer`, Meta Pixel ni beacon de Cloudflare                                                                   |
| Entornos locales y ejemplos             | No hay variables de analítica configuradas en los cinco archivos revisados; no se registraron sus valores privados                            |
| Navegador real de staging               | Home HTTP 200 y navegación interna a Tienda: cero scripts o solicitudes de Google, Meta o Cloudflare Web Analytics; sin `dataLayer` ni `gtag` |
| Cloudflare Web Analytics                | No confirmado: la consulta de sitios RUM con la sesión actual respondió HTTP 403, código 10000                                                |
| Google Analytics / Tag Manager          | No hay sesión o conector de cuenta disponible para inventariarlos; pendiente de verificación del propietario                                  |
| Consentimiento                          | No existe banner ni almacenamiento de preferencias                                                                                            |
| Privacidad                              | Documento editable desde el panel, persistido en Supabase; modificar solo el texto predeterminado no actualizaría la política guardada        |
| Checkout                                | Simulado en staging; bloqueado comercialmente en producción. Ningún flujo actual acredita una compra real                                     |

La ausencia de un beacon en el repositorio **no demuestra** que no exista
inyección automática en Cloudflare. Tampoco la observabilidad de Workers
equivale a Cloudflare Web Analytics. No se crearon sitios, propiedades o
contenedores para suplir esta incertidumbre.

Evidencia de lectura:
`artifacts/analytics-initial-audit-2026-11-05/existing.json`.
El comprobador no escribe en Cloudflare, Supabase o Google y no conserva tokens.

Comprobaciones de base: ESLint y `tsc -b` correctos. El comando completo
`npm run typecheck` detectó un problema preexistente del generador de tipos:
Wrangler ejecuta el `build.command` raíz (`worker-build.mjs check`) sin indicar
staging/production, y el guard de compilación lo rechaza. El compilador
TypeScript directo sí terminó con código 0. No se desactivó el guard ni se
modificaron los despliegues para sortearlo. Corregir el aislamiento de generación
de tipos antes de validar los builds de la integración. No se presentan como
realizadas las pruebas de consentimiento o eventos, que aún no existen.

## Riesgos encontrados y puntos de integración

- `src/components/layout/StoreLayout.tsx`: montaje común de la tienda y
  navegación React Router. Permite integrar consentimiento y páginas virtuales
  sin instalar scripts en componentes individuales. Las rutas admin son distintas.
- `src/features/product/ProductPage.tsx`: medir la ficha cuando sus datos estén
  listos. Excluir explícitamente la vista previa administrativa. Las revalidaciones
  periódicas de ofertas no deben volver a contar la misma visualización.
- `src/features/cart/CartProvider.tsx`: `addItem` puede rechazar la acción por
  stock. El clic no acredita éxito. No emitir efectos dentro de actualizadores
  de estado, que React puede ejecutar más de una vez. Procesar operaciones
  confirmadas después del commit, excluyendo hidratación, sincronización entre
  pestañas y conciliación de un checkout.
- `src/services/commerce-service.ts`: `resolveCart` ya relaciona productos,
  marcas, variantes, cantidades y precios finales en céntimos. Reutilizar esta
  fuente y `getVariantPrice`; no crear cálculos de descuentos alternativos.
- `src/features/checkout/CheckoutPage.tsx`: medir inicio únicamente con una
  selección válida y un checkout disponible, excluyendo pantallas vacías o
  bloqueadas. Deduplicar el intento ante recargas y cambios de paso.
- `src/services/customer-favorites-service.ts`: una petición de favorito puede
  fallar. Un evento futuro debe depender de su confirmación, no del clic.
- `src/components/layout/Footer.tsx`: acceso permanente a preferencias junto
  a Privacidad. Reutilizar el `Dialog` accesible existente para personalizarlas.

Hay URLs sensibles: `/auth/callback`, recuperación, cuenta, pedidos y
`/seguir-pedido?codigo=…#acceso=…`. El fragmento de seguimiento puede contener un
acceso privado. Las búsquedas también pueden contener datos personales.
No utilizar `location.href`, títulos privados o el referrer sin sanear como
parámetros automáticos de analítica.

## Arquitectura propuesta

1. **Consentimiento propio y ligero**: categorías Necesarias, Analítica y
   Marketing; las opcionales inicialmente desactivadas. Aceptar y rechazar con
   facilidad equivalente; personalización con controles semánticos y teclado.
2. **Consent Mode v2 básico**: bloquear GTM/etiquetas de Google hasta una
   elección apropiada. No cargar pings sin consentimiento. Usar las APIs de
   consentimiento de plantillas GTM, conforme a la documentación oficial,
   antes de las etiquetas de medición.
3. **Preferencias versionadas**: guardar únicamente categorías, versión y fecha,
   con vencimiento explícito. Cambios de finalidades requieren revisar la
   versión. Sin vincularlas a Auth ni escribir datos personales en Supabase.
4. **Servicio central**: allowlist de eventos y parámetros, precios en soles
   derivados de céntimos, control de consentimiento, entorno y deduplicación.
   No reproducir acciones anteriores a aceptar. Fallos de analítica aislados
   del carrito, favoritos y checkout.
5. **GTM como único gestor de Google**: sin `gtag.js` paralelo, sin fallback
   `noscript` que eluda la elección. Carga única y sin preconexiones a terceros
   antes de aceptar.
6. **GA4 manual para SPA**: desactivar medición mejorada automática no
   controlada, vistas de historial y `send_page_view`. Emitir una sola vista
   saneada por navegación pública. Rutas privadas y vistas previas excluidas.
7. **Cloudflare independiente de GTM**: conservar el sitio existente si se
   confirma. Revisar modo automático/manual antes de añadir un beacon. No
   clasificarlo como necesario por ser gratuito o no utilizar cookies; definir
   y documentar su relación con la preferencia de analítica antes de activarlo.
8. **Meta apagado**: ningún Pixel ID, SDK, evento de red o Conversions API.
   Preparar únicamente el mapeo futuro y las condiciones de marketing.

La retirada debe detener nuevos eventos, actualizar las categorías de Google y
limpiar el almacenamiento propio de medición cuando proceda. El diseño debe
probar también etiquetas ya cargadas: borrar un elemento `script` por sí solo
no desactiva el código que ejecutó. Validar la estrategia de retirada en red,
sin descartar datos del checkout ni de los formularios del usuario.

## Contrato de eventos propuesto

| Evento             | Condición                                                             | Datos permitidos                                                         |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `page_view`        | Ruta pública finalizada, permitida y consentida                       | URL pública saneada, título comercial controlado, referrer saneado       |
| `view_item`        | Ficha pública realmente lista                                         | `currency: PEN`, `value`, `items`                                        |
| `add_to_cart`      | Unidades añadidas correctamente                                       | `currency`, valor de las unidades añadidas, `items` con cantidad         |
| `begin_checkout`   | Inicio efectivo con selección válida                                  | `currency`, suma comercial de artículos, `items`                         |
| `view_cart`        | Carrito resuelto visible                                              | `currency`, valor de artículos, `items`                                  |
| `remove_from_cart` | Unidades retiradas por el cliente                                     | `currency`, valor retirado, `items`                                      |
| `add_to_wishlist`  | Favorito confirmado                                                   | Producto/variante comercial disponible, sin identidad de la cuenta       |
| `purchase`         | **Sin conexión actual**; futura confirmación verificable del servidor | Transacción comercial única, valores definitivos y artículos confirmados |

Cada artículo usará `item_id` estable de variante, `item_name`, `item_brand`,
`item_category` (Perfume/Complemento), `item_variant`, `price` y `quantity`,
cuando existan. El `sku` interno heredado de producto no representa el SKU
de su presentación. Precio final y descuento deben corresponder a la
presentación elegida y a su oferta vigente. Sin inventar familias ni marcas.

Los eventos de listas y selección se evaluarán después de los prioritarios:
solo aportan valor con impresiones visibles reales y contexto de lista fiable.
No se incluyen datos libres de formularios ni códigos de cupón introducidos
por clientes sin una necesidad y revisión específicas.

### Compra real y atribución posterior

La confirmación simulada, el retorno del navegador, un estado pendiente o un
intento rechazado nunca deben emitir `purchase`. No habrá un evento activable
simplemente visitando `/checkout/confirmacion`.

Con Mercado Pago habrá que verificar pago, importe, moneda y pedido en el
servidor, y registrar de forma idempotente una única conversión por transacción
y destino. La asociación de atribución a ese pedido se recogería solo con el
consentimiento correspondiente; sin correo, dirección, token de acceso o GPS.
El navegador no debe fabricar el comprobante de venta ni repetirlo por recarga.
Una emisión desde servidor necesitará un contrato y persistencia aprobados en
esa fase; no se afirma entrega exactamente una vez sin implementarlos y probarlos.

### Mapeo futuro de Meta

`page_view → PageView`, `view_item → ViewContent`, `add_to_cart → AddToCart`,
`begin_checkout → InitiateCheckout`, compra real verificada → `Purchase`.
Activación independiente, Pixel ID real y consentimiento de marketing.
No publicar una etiqueta Meta por preparar este contrato.

## Verificar recursos existentes primero

Usar una cuenta de Google controlada por el negocio, sin compartir contraseñas,
tokens ni códigos de acceso.

1. Abrir [Google Analytics](https://analytics.google.com/). Revisar el selector
   de cuenta/propiedad antes de crear nada. Si existe Aroma Infini, entrar a
   Administrar → Flujos de datos → Web y anotar nombre, URL y el ID `G-…`.
2. Abrir [Google Tag Manager](https://tagmanager.google.com/). Revisar cuentas
   y contenedores existentes. Anotar el nombre y el ID `GTM-…` del contenedor Web.
3. Indicar si son recursos de pruebas o de producción. Un recurso de otro
   negocio no debe reutilizarse.
4. En Cloudflare, seleccionar la cuenta del proyecto y abrir Web Analytics.
   Revisar si hay un sitio para Aroma Infini o para el host staging, su estado
   y su instalación automática/manual. No pulsar Añadir sitio todavía.

**Punto de espera actual:** confirmar el inventario anterior. Que no aparezcan
IDs en el repositorio no demuestra que no existan en las cuentas externas.

## Creación únicamente si no existen

Estos pasos son la guía posterior al inventario; todavía no se han ejecutado.

### GA4

1. Crear o reutilizar una cuenta llamada Aroma Infini, propiedad del negocio.
2. Crear la propiedad **Aroma Infini — Pruebas**, moneda Sol peruano (PEN),
   zona horaria Perú / America/Lima. Seleccionar información de empresa real.
3. Crear un flujo **Web — Staging** con la URL
   `https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev`.
4. Anotar el ID de medición `G-…`. No pegar el fragmento de instalación en React.
5. Desactivar la medición mejorada automática para esta integración controlada.
   Revisar Google Signals, datos proporcionados por usuarios y personalización
   publicitaria; no habilitarlos como parte de esta entrega.
6. Mantener una **propiedad comercial independiente** para producción. Crear su
   flujo cuando exista el dominio definitivo. No inventar un dominio para ello.

### GTM

1. Crear/reutilizar la cuenta Aroma Infini y crear, si falta, un contenedor
   **Aroma Infini — Pruebas**, plataforma **Web**.
2. Anotar el ID `GTM-…`; no instalar manualmente otro snippet.
3. Preparar la plantilla de consentimiento con las APIs oficiales y una
   etiqueta Google con el ID del flujo de pruebas. Desactivar la vista automática.
4. Crear activadores y variables solo para el contrato permitido de `dataLayer`.
   Las etiquetas GA4 requieren consentimiento analítico; futuras etiquetas
   publicitarias requieren además las condiciones correspondientes de marketing.
5. Usar un contenedor independiente para producción al llegar a esa fase.
   No publicar etiquetas incompletas ni Meta en el contenedor de pruebas.

Los identificadores son públicos, pero deben mantenerse en configuración
central por entorno. Los nombres finales de variables y los archivos de
configuración se fijarán en la implementación. No se modificaron `.env.local`,
`.env.production.local`, secretos o despliegues por esta auditoría.

## Validación pendiente de la implementación

- Pruebas automatizadas de esquema, saneamiento, céntimos y deduplicación.
- Navegador con interceptación de red: ninguna petición opcional antes de
  aceptar o al rechazar; consentimiento separado; cambio, retirada, vencimiento
  y sincronización; ausencia de envíos en rutas privadas y vistas previas.
- Acciones reales de producto/carrito/checkout; stock agotado, error, reintento,
  StrictMode, recarga, revalidación y navegación SPA. Cero compras simuladas.
- Pantallas 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844;
  teclado, foco, lectura y controles accesibles sin alterar el diseño general.
- TypeScript, ESLint, builds y regresiones relacionadas. Comparar solicitudes
  y coste de carga antes/después; sin una librería de analítica pesada.
- **GTM Preview / Tag Assistant y GA4 DebugView reales**, después de disponer
  del contenedor y flujo. Distinguirlos de los transportes simulados de tests.
- Cloudflare: beacon único y visitas internas SPA, separadas de GA4; comprobar
  métricas recibidas con acceso al panel. No confundir un HTTP 200 con recepción.

Para DebugView: conectar Preview en GTM con staging, aceptar analítica, navegar
por ficha/carrito/checkout y comparar eventos y parámetros en DebugView. Revisar
también las solicitudes en DevTools y probar el rechazo en una sesión limpia.
No activar depuración de forma permanente en producción.

La política de privacidad necesitará explicar herramientas, finalidades,
preferencias, retirada, destinatarios y conservación conforme a lo realmente
configurado. El titular debe aprobar el texto y revisar sus obligaciones;
un banner o Consent Mode no certifican cumplimiento legal.

## Mantenimiento

Cada nueva funcionalidad debe reutilizar el servicio central, añadir solo
parámetros comerciales permitidos y tener una prueba de consentimiento,
duplicación y ausencia de PII. No añadir pushes libres a `dataLayer`, lectura
automática de formularios o etiquetas nuevas sin revisar finalidad y versión
del consentimiento. Las ventas siempre dependerán de la confirmación comercial
del servidor, no de la presentación de la pantalla.

## Fuentes oficiales consultadas

- [Consent Mode: básico y avanzado](https://developers.google.com/tag-platform/security/concepts/consent-mode).
- [Consentimiento y APIs para GTM](https://developers.google.com/tag-platform/security/guides/consent).
- [Capa de datos de GTM](https://developers.google.com/tag-platform/tag-manager/datalayer).
- [Medición SPA en GA4](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications).
- [Eventos de e-commerce](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce).
- [Crear cuenta, propiedad y flujo GA4](https://support.google.com/analytics/answer/9304153).
- [Cuenta y contenedor GTM](https://support.google.com/tagmanager/answer/6103696).
- [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/about/).
- [Navegación SPA en Cloudflare](https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/).
- [Inventario de sitios Web Analytics por API](https://developers.cloudflare.com/api/resources/rum/subresources/site_info/methods/list/).
