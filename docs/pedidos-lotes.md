# Pedidos y filtro por lotes

## Gestión de pedidos

En **Pedidos**, filtra por estado, fecha, cliente o lote. La tabla muestra 20 pedidos por página. Los estados de preparación siguen siendo **Nuevo → En preparación → Enviado → Entregado**; el estado de pago se muestra por separado.

El **responsable de los cambios** se indica dentro de los diálogos **Crear lote** y **Cambiar estado**; ya no ocupa espacio en el listado. Se conserva durante la sesión para evitar escribirlo de nuevo. En el detalle individual sigue junto al cambio de estado. El panel registra un nombre declarado, sin presentarlo como una identidad autenticada.

- **Individual:** abre el detalle o utiliza la acción de la fila.
- **Masiva:** selecciona pedidos con los checkboxes y elige **Cambiar estado**. La selección de la cabecera corresponde a la página visible; **Seleccionar los N pedidos filtrados** incluye también los resultados de las demás páginas.
- La selección se conserva al cambiar de página, pero se limpia al cambiar los filtros o regresar a otra consulta para evitar modificar pedidos que ya no se están revisando.
- El diálogo muestra la cantidad exacta y solicita confirmación. Marcar como enviado o entregado requiere además confirmar que ese hecho ya ocurrió.
- El resultado separa actualizados, pedidos que ya estaban en ese estado y errores con su motivo. Los errores no impiden actualizar los pedidos válidos.

Solo se permiten cambios entre pasos contiguos. Un pago no aprobado impide modificar la preparación; enviar requiere contacto y dirección completos. Repetir el mismo estado no crea otro movimiento. Si el estado cambió desde que se abrió la confirmación, el pedido se excluye y debe revisarse de nuevo.

## Lotes como filtro opcional

Selecciona pedidos en el listado y elige **Crear lote**. Escribe el nombre del lote y su responsable para conservar la agrupación con un código generado. Crear un lote no cambia estados ni pagos. Las acciones masivas también funcionan sin lotes.

Para consultar la agrupación, selecciona su nombre y código en **Lote de trabajo** y pulsa **Aplicar filtros**. El listado muestra únicamente esos pedidos, conserva el filtro al recargar y permite combinarlo con estado, fechas o cliente. El filtro «Requiere atención» y su ayuda se han retirado; los enlaces antiguos con `?atencion=1` no aplican un filtro oculto. Las validaciones de pago y datos de entrega se conservan. La selección y las acciones masivas se limitan a los resultados de esa consulta; **Limpiar filtros** vuelve al listado general.

No hay una pestaña ni un panel independiente de lotes, tarjetas de progreso o acciones de edición y archivo. Los lotes existentes se conservan y siguen disponibles en el selector; los enlaces antiguos con `?vista=lotes` abren ahora el listado habitual de pedidos. Los enlaces de lote en el detalle del pedido también conducen a ese filtro.

Un pedido pertenece como máximo a un lote activo para evitar asignaciones duplicadas. Esta regla y los contratos de almacenamiento existentes se mantienen sin alterar pedidos ni agrupaciones guardadas.

Para eliminar una agrupación, aplica su filtro y utiliza el enlace discreto **Eliminar lote**, junto a las acciones de filtros. La confirmación muestra su nombre y aclara que los pedidos se conservan. Solo se elimina el lote: no cambian pedidos, pagos, estados, historial ni inventario. Sus pedidos quedan disponibles para crear otra agrupación. Al confirmar, se retiran el filtro de ese lote y la página seleccionada; los demás filtros permanecen. Cancelar o cerrar el diálogo no modifica nada.

## Historial y almacenamiento

Cada cambio registra pedido, fecha, estado anterior y nuevo, responsable, origen individual o masivo e identificador de operación. El detalle del pedido muestra ese historial y sus lotes.

Los pedidos, lotes e historial utilizan el repositorio local existente del panel (**IndexedDB de este navegador**). No hay sincronización entre administradores, autenticación de responsables, automatismos de envío ni conexión nueva con Supabase. Los contratos tipados separan estos datos de la interfaz para una futura persistencia remota. Conectar un backend requerirá aplicar también allí las validaciones, autorización y transacciones.

Si falla el almacenamiento, el panel avisa que los cambios siguen en memoria y ofrece **Reintentar guardado**. Esa acción vuelve a guardar el mismo resultado, sin cambiar otra vez los estados ni duplicar el historial. Debe resolverse antes de salir de la página.

## Verificación

Las pruebas utilizan pedidos sintéticos aislados del navegador, sin crear pedidos remotos. Cubren grupos de 10, 50 y 100, selección global, confirmación y cancelación, errores parciales, estados obsoletos, historial, repetición sin duplicados y conservación de pagos e inventario. La interfaz verifica la creación de varios lotes, su selección como filtro, recarga, combinación con estados y acciones masivas limitadas a esos resultados. Las pruebas del servicio conservan la cobertura de datos y reglas anteriores, incluido el archivo de agrupaciones existentes.

Las capturas de la interfaz se guardan en `artifacts/order-workflow/` para 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844.

Capturas actuales: `orders-top-monitor.png`, `orders-mobile.png`, `update-laptop.png`, `create-batch-laptop.png`, `create-batch-mobile.png`, `filtered-batch-desktop.png`, `filtered-batch-mobile.png`, `partial-errors.png` y `persistence-error.png`. Las capturas `batches-*` y `edit-batch-*` pertenecen a la interfaz retirada y no representan el diseño actual.

La cobertura comprueba que el responsable solo aparezca en los diálogos del listado, que crear un lote valide y conserve ese dato, y que retirar «Requiere atención» no deje filtros invisibles en enlaces antiguos. Las capturas de ambos diálogos se generan en los cinco tamaños indicados.

`tests/order-batch-deletion.spec.ts` comprueba la eliminación aislada entre varios lotes, la conservación de pedidos, historial e inventario, los identificadores inexistentes y la repetición sin guardar otra vez. También cubre recarga, reutilización de pedidos en otro lote, cancelación, teclado, conservación de filtros y reintento tras un fallo de almacenamiento. Las capturas de esta acción y su confirmación se guardan como `delete-batch-action-{desktop,mobile}.png` y `delete-batch-confirm-{desktop,mobile}.png` dentro de `artifacts/order-workflow/`.
