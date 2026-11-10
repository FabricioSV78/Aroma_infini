# Gestión de familias olfativas

Implementación del 29 de octubre de 2026. Disponible en **Panel → Tienda →
Familias olfativas**, ruta `/admin/familias-olfativas`.

## Uso

1. Pulsa **Nueva familia**, escribe su nombre y guarda. No necesitas introducir
   códigos ni editar archivos.
2. Abre un producto y selecciónala en **Familias olfativas**. Puedes asignar
   varias al mismo perfume; los complementos no requieren estos datos.
3. El filtro público la ofrece cuando existe un producto publicado que la
   utiliza. Crear una familia no clasifica automáticamente ningún perfume.

Se conservan Amaderada, Floral, Verde, Ámbar, Cítrica, Aromática, Fresca y
Gourmand. Puedes incorporar otras con información confirmada del producto.
El buscador y la paginación facilitan administrar el listado.

**Editar** cambia el nombre visible manteniendo un identificador estable.
Los nombres anteriores quedan como alias para reconocer Excel antiguos y
evitar duplicados. No se cambian las asociaciones de los productos.

**Desactivar** conserva la familia en perfumes que ya la tienen, pero la
retira de nuevas asignaciones, de las opciones activas del filtro y del
recomendador. Puedes reactivarla. Al editar un perfume que conserva una
familia desactivada, esta sigue visible y seleccionada con su estado indicado.

**Eliminar** aparece únicamente cuando no hay productos asociados y requiere
confirmación. Supabase también comprueba esa condición: ocultar el botón no
es la única protección. Si está en uso, utiliza Desactivar.

## Integración

- **Productos:** selector múltiple con el vocabulario compartido.
- **Excel:** descarga una plantilla nueva después de modificar el listado;
  sus desplegables incluyen las familias activas en ese momento. Para varias,
  escribe sus nombres separados por comas. El importador valida los valores;
  una plantilla ya descargada no se actualiza por sí sola.
  Si no hay familias activas, la plantilla omite ese desplegable en lugar de
  generar un rango inválido; no inventa opciones para rellenarlo.
- **Tienda y ficha:** utilizan los mismos códigos y etiquetas. No se inventan
  familias según el nombre comercial ni se modifica el perfil aromático libre.
- **Recomendador:** utiliza las familias activas y las asociaciones reales;
  conserva sus reglas de puntuación y la configuración editorial existente.

## Persistencia y protección

En modo Supabase las operaciones se guardan en el proyecto de desarrollo
`aroma-infini-dev`. La pantalla no sustituye un error remoto por un guardado
local. Los modos local y remoto son explícitos.

La migración `20261029000600_olfactory_families.sql` mantiene RLS, permisos
acotados, administrador activo y MFA AAL2. Los nombres se normalizan para
detectar diferencias de mayúsculas, tildes y espacios; el formulario limita
los nombres a 80 caracteres y no admite comas. Las ediciones y eliminaciones
comprueban la versión para no sobrescribir cambios de otro administrador.

El formulario conserva sus datos si falla, bloquea clics repetidos durante el
guardado y advierte al salir con cambios pendientes. Los errores del campo
aparecen junto a él y las confirmaciones utilizan el sistema del panel.

## Validación

- Siete pruebas de dominio, formulario, recarga, eliminación y teclado.
- Flujo con SDK remoto aislado: crear → asignar a producto → filtrar →
  renombrar → desactivar sin perder la asociación.
- SQL: duplicados concurrentes, renombres con versión y asignación concurrente
  con desactivación, además de las comprobaciones de permisos.
- Supabase alojado: **17 comprobaciones**, con identidad temporal y TOTP reales.
  Se eliminaron esa identidad y la familia temporal al terminar. El fingerprint
  del producto existente coincide antes y después: precios, presentaciones,
  SKU e imágenes intactos.
- Capturas en monitor, laptop, tablet y móvil:
  `artifacts/olfactory-management-2026-10-29/list-*.png` y `form-*.png`.

El informe seguro de la prueba alojada es
`artifacts/olfactory-management-2026-10-29/hosted-result.json`.
