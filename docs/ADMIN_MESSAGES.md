# Mensajes y confirmaciones del panel

Implementado el 23 de octubre de 2026. Se conserva el diseño del panel, sus reglas comerciales y la persistencia local; no se conectó Supabase.

## Criterios de presentación

| Situación | Presentación | Recuperación |
| --- | --- | --- |
| Campos obligatorios, formatos, mínimos y máximos | Mensaje junto al campo, asociado mediante `aria-describedby` y `aria-invalid` | Se enfoca el primer campo incorrecto; el error desaparece al corregirlo |
| Reglas comerciales del formulario | Explicación contextual existente; aviso compacto cuando la acción no puede continuar | Volver a editar sin perder el borrador |
| Imagen/video inválido o Excel ilegible | Modal compacto con motivo conocido | Elegir otro archivo o corregir el actual |
| Error inesperado | Modal con explicación segura y acción contextual | Retomar la edición o revisión; nunca se imprime `Error.message` desconocido |
| Escritura local fallida | Modal con reintento y aviso persistente al cerrarlo | Reintentar la escritura del cambio ya aplicado, sin repetir la operación |
| Desactivar, retirar oferta, eliminar promoción o borrar datos | Confirmación explícita | Cancelar/Escape conservan los datos; el fondo no confirma ni cierra la decisión |
| Guardado sencillo confirmado | Aviso discreto temporal | No interrumpe la tarea ni se genera por visitar una URL con `guardado=1` |
| Importación completada | Confirmación importante con cantidad real | Abrir los borradores pendientes de imágenes |
| Actualización masiva parcial | Modal con cifras reales y motivos; detalle consultable en la pantalla | Revisar los pedidos no actualizados, incluso si cambiaron y ya no coinciden con el filtro anterior |

## Integración

- Productos y complementos comparten los mismos avisos de guardado, visibilidad, clasificación y fotografías. Se preserva la preparación atómica de fotos múltiples.
- Excel conserva su revisión por filas, duplicados y columnas. Los errores de archivo usan mensajes propios y comprensibles. La importación confirma el guardado antes de anunciar éxito.
- Marcas, cupones, descuentos, inventario y datos de entrega usan el guardado compartido. Los errores de negocio siguen conservando sus explicaciones específicas.
- Los pedidos individuales y cambios masivos comparten recuperación de persistencia. La exportación PDF no modifica pedidos ni estados.
- Home y Envíos usan los mismos avisos; cambiar la disponibilidad provincial requiere confirmación, sin alterar las tarifas ni las reglas de cobertura.
- Clientes sigue siendo una consulta con sus estados vacíos y filtros; no se añadieron operaciones inexistentes.
- Se reemplazaron las confirmaciones nativas dentro del panel. Al recargar o cerrar una pestaña con cambios, se conserva `beforeunload`: los navegadores exigen su propio aviso en ese caso y no permiten sustituirlo por un modal HTML.
- Los avisos públicos de disponibilidad, carrito y compra mantienen su presentación contextual y sus controles de stock. No se añadieron interrupciones a la compra.

## Componentes y accesibilidad

`AdminNoticeProvider.tsx` centraliza `show`, `confirm`, `error` y `toast`. Usa un diálogo nativo compacto, identificación por título/descripción, iconos semánticos y acciones de al menos 44 px. Las confirmaciones enfocan primero la acción segura. El foco queda dentro de la ventana y vuelve al control de origen; si el formulario permanece protegido por un guardado pendiente, vuelve a su reintento.

Solo se muestra un aviso importante a la vez. Una revisión abierta se suspende mientras aparece un error y se recupera al cerrarlo, conservando sus datos. Los reintentos tienen bloqueo sincrónico contra pulsaciones repetidas. Los éxitos se anuncian después de resolver la escritura y no compiten con un modal activo. No se incorporaron animaciones ni dependencias nuevas.

`AdminFieldValidation.tsx` presenta las restricciones HTML existentes sin cambiar sus reglas. Conserva nombres accesibles, incluyendo selectores cuyas opciones no deben formar parte del nombre del campo.

`useAdminSave.ts` separa la aplicación del cambio de su escritura en IndexedDB. Un fallo de persistencia no se presenta como éxito y reintentar no repite una actualización de stock, un pedido ni una importación.

## Errores y futura integración remota

`src/services/admin-messages.ts` contiene la frontera de errores. `UserFacingError` identifica validaciones redactadas por la aplicación. Las excepciones desconocidas, códigos internos y detalles sensibles no se imprimen en los avisos. Se reconocen causas concretas del navegador como falta de espacio y permisos de almacenamiento.

Existen traducciones preparadas para códigos conocidos de duplicidad, permisos y sesión vencida. Son adaptaciones locales y pruebas controladas; no son respuestas simuladas de un servidor conectado. Al integrar Supabase faltará conectar los errores reales de autenticación, políticas de acceso, base de datos y almacenamiento con esta frontera, implementar registro técnico seguro y verificar sus permisos y reintentos contra el backend real. La autenticación administrativa todavía no existe y no se atribuyen identidades verificadas a estos avisos.

## Validación y capturas

Los escenarios automatizados provocan fallos reales del adaptador local o validaciones de archivos en contextos de navegador aislados. No modifican el catálogo del navegador del cliente.

- Nuevas pruebas: `admin-messages-system.spec.ts` y `admin-messages-content.spec.ts`.
- Regresiones: `ui-states-admin.spec.ts`, `order-workflow-ui.spec.ts`, `order-batch-deletion.spec.ts`, productos, imágenes, Excel, cupones, descuentos, Home y envíos.
- Se comprobaron selecciones de 10, 50 y 100 pedidos, archivos de 10, 50, 100 y 300 productos, errores parciales, duplicados, cancelación, campos incompletos, fotos inválidas y mayores al límite, fallos inesperados y de persistencia, reintentos repetidos, foco y ausencia de datos técnicos en pantalla.
- Capturas reales en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844. Inspeccionadas proporciones, legibilidad, acciones, teclado y desbordamientos.
- Comprobados TypeScript, ESLint y compilación de producción. Permanece el aviso ya existente del tamaño de ExcelJS; su carga sigue separada.
- Se validaron los escenarios de 19 archivos de pruebas en ejecuciones y reejecuciones, corrigiendo las expectativas anteriores de avisos inline y confirmaciones nativas. Se conservaron las comprobaciones de datos, cantidades, historial y ausencia de duplicados.

Ejemplos en `artifacts/admin-messages/`: confirmaciones en cinco tamaños, `unexpected-save.png`, `image-invalido.gif.png`, `excel-file.png`, `orders-partial.png`, `storage-error-mobile.png` e `import-success.png`.

Los logs y trazas de cada ejecución se conservan en `artifacts/admin-notices-*`. Las capturas y los escenarios que provocan errores pertenecen exclusivamente a las pruebas.
