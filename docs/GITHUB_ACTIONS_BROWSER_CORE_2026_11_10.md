# Correcciones de browser-core

10 de noviembre de 2026. Ejecución
[42927451398](https://github.com/FabricioSV78/Aroma_infini/actions/runs/42927451398),
commit `7cbea4a`. Los cinco trabajos restantes aprobaron sus comprobaciones.
La suite general de browser-core terminó con 1292 casos aprobados, siete fallidos
y tres capturas optativas omitidas que ya estaban configuradas así. Al fallar esa
suite, su runner no continuó con las seis configuraciones siguientes del grupo.

## Causas y cambios

| Área                         | Causa                                                                                                                                                                                 | Corrección                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Marcas: dos casos            | El bucle consultaba si «Siguiente» estaba habilitado antes de que React terminara de cambiar de página. Podía intentar otro clic sobre el botón ya deshabilitado de la última página. | La prueba espera el número de página después de cada clic y verifica el estado deshabilitado al llegar a la última. No cambió la paginación de la aplicación.            |
| Complementos: tablet y móvil | La prueba suponía que «Tienda» se abría automáticamente en el menú; el comportamiento aprobado deja todos los grupos cerrados.                                                        | Verificar el estado cerrado, abrir «Tienda» y comprobar su enlace. No se modificó el navbar.                                                                             |
| Vídeo                        | La prueba intentaba desplazar el nodo de vídeo mientras React lo reemplazaba al cambiar de resolución.                                                                                | Esperar el perfil móvil y desplazar la sección que permanece montada. Se conservan las comprobaciones de fuente, tamaño y duración.                                      |
| Seguimiento                  | Chromium podía restaurar el valor editado de una entrada del historial aunque la URL consultara otra referencia. El campo no controlado conservaba ese valor.                         | Un borrador controlado se ajusta al cambiar el código de la URL y conserva lo escrito durante respuestas asíncronas. El formulario mantiene su nodo, clases y animación. |
| Vigencia de oferta           | El reloj de prueba seguía avanzando durante la recarga; la oferta de tres segundos podía haber expirado antes de simular su inicio.                                                   | Pausar el reloj de prueba tras cargar la página y antes de registrar la oferta. No se modificó el reloj comercial ni el cálculo de descuentos.                           |

El seguimiento conserva normalización, límites del campo, token privado,
reintentos y descarte de respuestas antiguas. No se cambió CSS, diseño, permisos,
precios, inventario, fechas comerciales ni configuración de despliegues.

El formulario utiliza el patrón de
[entrada controlada de React](https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable)
y ajusta su borrador únicamente al cambiar la referencia, sin añadir un efecto
de sincronización ni remontar el formulario completo.

## Validación local

- Marcas: ocho casos aprobados, incluidos lotes de 5, 20, 50 y 100 nombres.
- Complementos y experiencia editorial: 24 casos aprobados.
- Descuentos: siete casos aprobados. Una recarga controlada de cuatro segundos
  reprodujo el fallo original; con el reloj corregido pasó la misma demora.
- Seguimiento: cinco casos aprobados. La regresión con historial y restauración
  nativa del campo reprodujo antes el desacuerdo exacto de CI entre atributo y
  valor visible, y aprobó tras corregir el componente.
- Total: 44 casos únicos de las áreas afectadas, sin omisiones añadidas.
- Las 152 pruebas Node, TypeScript, lint, build y auditoría de dependencias pasaron.

No se ampliaron timeouts ni se añadieron reintentos para ocultar fallos.
No se ejecutó localmente toda la suite general de más de 1300 casos: el siguiente
commit debe completar nuevamente browser-core en GitHub, incluidas las suites
que no llegaron a ejecutarse después del fallo original.

Evidencias: `artifacts/github-actions-core-2026-11-10/` y
`artifacts/ci-responsive-2026-11-10/`. El informe consolidado de esta corrección es
`artifacts/github-actions-core-2026-11-10/result.json`.

## Siguiente paso

Revisar y subir las correcciones a `main`, abrir la ejecución del nuevo commit y
esperar que todos los trabajos pasen antes de crear `develop`. Volver a ejecutar
el commit anterior no incorpora los cambios locales.

Esta corrección no hizo commits, pushes, migraciones remotas ni despliegues.
Las pruebas usaron servidores y datos aislados; no modificaron los servicios
alojados de Supabase, Cloudflare o R2.
