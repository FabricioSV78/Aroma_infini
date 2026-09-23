# Aroma Infini — Entrega de Fase 7

Fecha: 19 de septiembre de 2026.

Esta fase completa la experiencia frontend de **Mi cuenta** prevista en el plan. Permite revisar la navegación, los estados y la relación con el checkout usando únicamente una identidad y pedidos ficticios. No autentica personas, no consulta un backend y no conserva datos personales.

## Recorrido

- `/cuenta` presenta primero un acceso de demostración. Google y correo/contraseña aparecen como alternativas futuras claramente inactivas; no existen campos de contraseña ni una falsa sesión segura.
- Al activar la demostración, el resumen reúne pedidos, dirección y favoritos. En escritorio usa una navegación lateral; en móvil se convierte en un listado de secciones legible y táctil.
- `/cuenta/datos` permite probar la edición de una identidad ficticia. `/cuenta/direcciones` permite editar, eliminar y restaurar una dirección de ejemplo.
- `/cuenta/pedidos` muestra código, fecha, cantidad, total y estado. `/cuenta/pedidos/:reference` añade productos, totales, entrega y una línea de estado: recibido, en preparación, en camino y entregado.
- `/cuenta/pagos` identifica Mercado Pago como proveedor previsto y muestra referencias de transacciones simuladas. No solicita ni representa números de tarjeta, CVV o credenciales bancarias.
- Un checkout realizado con la opción «Cuenta de demostración» se incorpora al historial durante la misma sesión. Un checkout como invitado continúa por `/seguir-pedido` y no se atribuye a la cuenta.

## Base técnica

- `AccountProvider` concentra el estado efímero y expone operaciones tipadas para perfil, dirección y pedidos. Está situado por encima del shell de tienda y del checkout para que una futura sesión también pueda alimentar el header sin acoplar los componentes a un proveedor de autenticación.
- `account-service.ts` contiene las entidades, estados, fixtures y el adaptador que transforma una orden del checkout en un pedido de cuenta. La vista no depende de la forma interna del checkout.
- Las páginas de cuenta se cargan de manera diferida desde el router. Los estilos están aislados en `styles/account.css` y reutilizan tokens y componentes existentes.
- Perfil, dirección, sesión y pedidos de cuenta viven solo en memoria. Una recarga vuelve al estado visitante. `localStorage` no recibe nombre, correo, teléfono, dirección ni datos de pago.
- La cuenta y sus rutas se mantienen con `noindex` dentro de la política SEO del prototipo.

## Estados revisables

- Visitante y activación de la cuenta ficticia.
- Resumen con y sin favoritos.
- Datos editados y confirmación accesible.
- Dirección existente, eliminada y restaurada.
- Historial, detalle, pedido inexistente y lista vacía mediante `/cuenta/pedidos?demo=empty`.
- Pedido creado por checkout de cuenta frente a pedido de invitado.
- Transacciones simuladas y proveedor de pago pendiente de integración.

## Integración posterior

La integración real deberá sustituir el estado en memoria por contratos de sesión y cliente respaldados por servidor. Supabase tendrá que aplicar autorización y RLS para que cada persona lea solo sus perfiles, direcciones y pedidos. El estado de pago deberá venir de una orden verificada en backend mediante Mercado Pago y sus notificaciones; el frontend no decidirá si un pago fue aprobado.

Siguen pendientes la elección entre Google OAuth y/o correo, recuperación de acceso, validación comercial de direcciones, estados logísticos definitivos, comprobantes y referencias seguras del proveedor de pago. Ninguno de esos puntos se simula como funcionalidad real en esta fase.

## Revisión visual y validación

`node scripts/capture-phase-7.mjs`, con Vite activo en el puerto 5173, genera acceso, resumen, historial, detalle y pagos en 390, 768 y 1440 px. Las mediciones se guardan en `artifacts/phase-7/measurements.json`.

La cobertura automatizada comprueba teclado, ausencia de credenciales, datos solo en memoria, separación invitado/cuenta, estados de pedidos, pagos sin campos sensibles y ausencia de overflow en 360, 375, 390, 430, 768, 1024, 1280 y 1440 px.

- `npm.cmd run typecheck`: aprobado.
- `npm.cmd run lint`: aprobado, sin errores ni advertencias del código.
- `npm.cmd run build`: aprobado; las rutas de cuenta generan chunks diferidos propios.
- `npm.cmd run test:e2e`: 112 pruebas aprobadas.
- Capturas a 390, 768 y 1440 px: sin overflow horizontal, imágenes rotas ni errores de consola.
