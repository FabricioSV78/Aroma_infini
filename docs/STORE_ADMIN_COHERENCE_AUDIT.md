# Auditoría de coherencia tienda–administración

Fecha: 22 de septiembre de 2026

## Alcance comprobado

Se recorrió el flujo completo disponible en la propuesta frontend:

1. producto y presentación activa;
2. carrito y control de cantidad;
3. datos de contacto y zona de entrega;
4. promoción y cálculo final;
5. resultado simulado de Mercado Pago;
6. creación del pedido únicamente con pago aprobado;
7. descuento de stock por variante;
8. alta o actualización del cliente;
9. preparación, despacho y entrega en administración;
10. consulta del estado como invitado y desde la cuenta de demostración.

La revisión no presupone que Supabase, Mercado Pago, correo o el operador logístico estén conectados. Los datos administrativos continúan en memoria y los códigos de seguimiento locales siguen siendo demostrativos.

## Reglas que quedan coherentes en la propuesta

- Mercado Pago es el único proveedor mostrado. No existe transferencia manual.
- Un intento rechazado o con error no crea pedido, cliente ni movimiento de stock.
- Una aprobación crea un solo pedido con estado de pago `approved` y estado operativo inicial `received`.
- El registro vuelve a comprobar producto, marca, variante activa, precio, cantidad, stock, promoción, zona, tarifa y total antes de modificar el estado compartido.
- La misma referencia funciona como clave de idempotencia en la demostración: repetir el registro no descuenta stock otra vez.
- El stock se descuenta por `variantId`, no por producto general.
- El uso de la promoción aumenta junto con el pedido y el inventario, en una sola actualización del store frontend.
- El estado operativo avanza un paso a la vez: recibido → en preparación → enviado → entregado. Se permite retroceder solo al paso adyacente con la confirmación existente.
- El seguimiento de invitado y “Mis pedidos” leen el estado administrativo de la misma sesión.
- Zonas, umbral de envío gratis y plazos configurados alimentan las vistas públicas relacionadas.

## Inconsistencias corregidas

### Alta prioridad

- La confirmación de checkout no creaba un pedido administrativo.
- El stock no disminuía después de una aprobación, por lo que se podían repetir compras contra las mismas existencias.
- Promociones aplicadas no incrementaban su contador de usos.
- El seguimiento y la cuenta siempre mostraban “Recibido”, aunque administración cambiara el pedido.
- Existía un pedido “Pago pendiente” aunque la tienda solo crea pedidos después de una aprobación.
- La administración permitía saltar directamente entre estados no consecutivos.

### Prioridad media

- El departamento era texto libre pese a existir zonas configuradas; ahora es un selector de zonas activas.
- Las rutas públicas de descubrimiento por género se mantienen como contenido estable de la tienda y cada producto conserva su clasificación desde su propio editor.
- El orden del catálogo seguía metadatos duplicados en vez de los registros administrativos.
- El Home, la cabecera, la página de envíos y las preguntas frecuentes repetían umbrales y plazos estáticos.
- El detalle administrativo no mostraba descuento, código promocional ni proveedor de pago.

## Elementos eliminados o simplificados

- Se eliminó la métrica “Pagos pendientes”, porque ningún recorrido vigente crea pedidos antes de aprobar Mercado Pago.
- Se eliminó el filtro de pagos de la lista de pedidos. Con el flujo actual todos los pedidos creados tienen pago aprobado; el filtro no ayudaba a operar.
- Se eliminó el pedido y cliente ficticios que solo existían para sostener el estado pendiente.
- “Pagados” en el resumen se reemplazó por “Entregados”, para que el bloque represente el avance operativo y no repita una condición común a todos los pedidos.
- “Envíos en curso” reemplaza la métrica pendiente y conduce directamente a los pedidos despachados.

Se conservó el estado de pago dentro del contrato y del detalle. Será necesario para reembolsos, contracargos o eventos tardíos de Mercado Pago, aunque esas operaciones todavía no están implementadas.

## Controles revisados

- Zona de entrega: selector derivado de configuración.
- Marca, género, intensidad, tipo de promoción, fechas y estados: controles cerrados ya existentes.
- Departamento, provincia y distrito: selectores encadenados sobre el ubigeo
  oficial de INEI, compartidos por checkout, cuenta y panel. La dirección exacta
  permanece como texto porque corresponde al domicilio escrito por el cliente.
- Familia olfativa, ocasión, temporada y notas: permanecen abiertas porque todavía no existe una taxonomía comercial aprobada. Convertirlas ahora en listas cerradas inventaría reglas.

## Decisiones pendientes de aprobación

Estas decisiones afectan el modelo de backend o las reglas comerciales y no se implementaron:

1. **Separar tres máquinas de estado.** Recomendación: `paymentStatus` para Mercado Pago; `orderStatus` para confirmado/cancelado/completado; `shipmentStatus` para pendiente/preparando/despachado/entregado/incidencia. La interfaz actual usa un estado operativo unificado porque todavía no hay transportista ni contrato de despacho.
2. **Momento de reservar stock.** La demo descuenta después de la aprobación. En producción debe decidirse entre reserva temporal al iniciar pago o validación y descuento transaccional al recibir el webhook aprobado.
3. **Cancelaciones, reembolsos y reposición.** Falta definir quién puede cancelar, hasta qué estado, cuándo se repone stock y cómo se representa un reembolso parcial.
4. **Fuente de verdad del pago.** La creación productiva debe ocurrir en backend desde un webhook verificado e idempotente de Mercado Pago; nunca desde la respuesta confiada por el navegador.
5. **Vinculación invitado–cuenta.** Falta decidir si un pedido invitado se incorpora automáticamente al crear una cuenta con el mismo correo y qué verificación se exige.
6. **Seguimiento logístico.** Falta elegir operador, eventos disponibles, código externo y reglas para incidencias o devoluciones.
7. **Taxonomía comercial.** Familia olfativa, ocasión, temporada y notas necesitan un vocabulario aprobado antes de reemplazar texto libre por comboboxes gestionados.

## Riesgos que requieren backend

La actualización frontend es coherente dentro de una sola sesión, pero no puede garantizar concurrencia entre clientes, persistencia, autorización administrativa ni seguridad de precios. Supabase o el backend elegido deberá ejecutar en una transacción la validación del webhook, la idempotencia, el descuento de inventario, el consumo de promociones, la creación del pedido y el vínculo con el cliente.

## Validación

- TypeScript: sin errores.
- ESLint: sin errores ni advertencias relevantes.
- Playwright: 171 pruebas aprobadas.
- Auditoría visual: 114 capturas en 390, 768 y 1440 px.
- Auditoría visual automatizada: cero overflow horizontal, imágenes rotas, errores de consola, encabezados duplicados, controles táctiles pequeños o textos recortados.
