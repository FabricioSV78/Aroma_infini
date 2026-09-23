# Aroma Infini — Entrega de Fase 6

Fecha: 16 de septiembre de 2026.

Esta fase añade un checkout **exclusivamente simulado** al carrito existente. Sigue la secuencia acordada en el plan: datos → entrega → revisión y pago → confirmación. No realiza cargos, crea pedidos reales, autentica personas ni envía datos a un servidor.

## Recorrido

- `/checkout` comienza como invitado y permite usar una cuenta de demostración con datos ficticios. Los campos de contacto y dirección se validan antes de avanzar.
- La entrega permite courier y, para el escenario de Lima/Callao, motorizado. La cotización se calcula para **Lima, Callao y Arequipa** como zonas de prueba. Otras zonas quedan sin importe en esta demo; no se infiere una tarifa ni cobertura comercial a partir del mock.
- Se muestran subtotal, descuento, envío y total. El umbral de envío gratis desde S/450 se evalúa sobre el subtotal anterior al descuento **solo en esta simulación**.
- Los códigos `DEMO10` y `MINIMO500` permiten probar un descuento del 10 % y un mínimo de S/500. `INACTIVO`, `PROXIMO`, `VENCIDO`, `LIMITE` y `ERROR` reproducen los otros estados definidos en el plan. Ninguno es una promoción comercial.
- La revisión muestra **Mercado Pago** como único destino de pago futuro. El comprador elegirá el medio de pago allí; la tienda no muestra tarjeta ni transferencia. La vista normal oculta el selector de resultados de prueba. `?demo=1` permite reproducir rechazo y error para QA sin alterar el recorrido limpio del comprador.
- El botón de esta fase abre solo una confirmación local de prueba, sin redirigir ni afirmar que Mercado Pago aprobó un cargo. Rechazo y error de la simulación permiten reintentar sin borrar el carrito.
- `/checkout/confirmacion` presenta un resumen y código aleatorio de ejemplo; el carrito se vacía al completar la simulación. El invitado puede abrir `/seguir-pedido?codigo=…` o introducir el código manualmente. La opción de cuenta de demostración incorpora el pedido en `/cuenta/pedidos` durante esa sesión. Una recarga elimina la cuenta y el resumen con datos personales, pero conserva el seguimiento mínimo en ese navegador.

Las tarifas S/15, S/20 y S/35 son **ilustrativas**. Los plazos mostrados son los proporcionados por el cliente: Lima/Callao hasta 48 horas y provincias hasta 5 días. La forma de calcular tarifas reales, zonas excluidas, operador logístico y políticas de descuento sigue pendiente de confirmación. Mercado Pago está confirmado como proveedor; sus medios disponibles y condiciones operativas se definirán en la integración real.

## Implementación y revisión

- El formulario y el resumen de la orden simulada viven solo en memoria. `localStorage` conserva un registro limitado de seguimiento de prueba (código aleatorio, fecha, estado fijo «recibido» y modalidad invitado/cuenta demo), además del carrito; no guarda nombre, teléfono, correo ni dirección. Un código inválido muestra un estado de no encontrado.
- El enlace de demostración solo funciona en el mismo navegador; no hay correo, autenticación, sincronización entre dispositivos ni actualizaciones logísticas. El seguimiento real requerirá orden verificada en servidor, token de acceso no adivinable para invitados y asociación segura con la cuenta autenticada.
- El checkout se carga por su ruta y reutiliza el diseño, tokens y componentes actuales. Hay foco visible, validación nativa, mensajes de estado y controles táctiles.
- En checkout, la ayuda aparece en una franja al cierre de la página; no hay control flotante sobre el resumen ni el total.
- El código de descuento es opcional y aparece al desplegarlo. El recorrido normal presenta una sola acción principal y una única advertencia breve sobre la demo.
- `node scripts/capture-phase-6.mjs`, con Vite activo en el puerto 5173, genera capturas de datos, revisión, confirmación y seguimiento a 390, 768 y 1440 px, junto con mediciones en `artifacts/phase-6/measurements.json`.

## Validación

- `npm.cmd run typecheck`: aprobado.
- `npm.cmd run lint`: aprobado, sin errores ni warnings del código.
- `npm.cmd run build`: aprobado.
- `npm.cmd run test:e2e -- --workers=1`: 97 pruebas aprobadas, incluidas 14 de checkout/seguimiento y regresión de las fases anteriores.
- Revisión automatizada en 360, 375, 390, 430, 768, 1024, 1280 y 1440 px: sin desbordamiento horizontal, imágenes rotas ni errores de consola.

## Integración posterior con Mercado Pago

La documentación oficial actual recomienda Checkout Pro mediante Orders API para nuevas integraciones. El servidor deberá crear una order con credencial privada e idempotencia, devolver el `checkout_url` al frontend y verificar el estado mediante API/webhooks antes de marcar un pedido como pagado o vaciar el carrito real. Las URL de retorno no bastan como prueba de pago. [Crear order](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/create-order), [retornos](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/web-integration/configure-back-urls), [notificaciones](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro-orders/payment-notifications).

## Fuera de esta fase

La cuenta real, historial sincronizado, pedidos, autenticación, envío de confirmaciones por correo, conexión efectiva a Mercado Pago, facturación, sincronización con Supabase y cálculo logístico real corresponden a fases e integraciones posteriores. No debe presentarse este recorrido como una compra habilitada.
