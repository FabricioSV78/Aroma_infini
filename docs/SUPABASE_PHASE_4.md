# Supabase — Fase 4: catálogo y administración comercial

29 de octubre de 2026. Entorno verificado: **aroma-infini-dev**.

Productos, marcas, presentaciones, inventario y ofertas de producto utilizan
Supabase desde la tienda y el panel. También se guardan remotamente la
activación de Complementos y la marca destacada. Se mantienen el diseño y
los flujos aprobados. Esta entrega corresponde al entorno de desarrollo;
no declara terminado el checkout real ni el despliegue de producción.

## Alcance conectado

| Apartado             | Comportamiento vigente                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tienda y Home        | Leen los productos y marcas publicados desde las RPC públicas. Los filtros, ordenamiento, galerías, recomendaciones y recomendador usan ese catálogo compartido.        |
| Productos            | Registro de borradores, edición, presentaciones, clasificación olfativa, textos, stock y referencias de imágenes mediante comandos autorizados.                         |
| Marcas               | Registro individual y por lista, edición y activación, con normalización de nombres y restricciones de unicidad del servidor.                                           |
| Inventario           | Stock por presentación, validado en servidor. La falta de stock en todas las presentaciones disponibles desactiva el producto; reponerlo no lo publica automáticamente. |
| Ofertas de producto  | Porcentaje o importe fijo, fechas y activación; el precio habitual permanece separado. Una oferta por producto, aplicada a cada presentación según su precio.           |
| Excel                | Conserva revisión y validación. La confirmación envía un comando de importación y registra borradores pendientes de fotografías.                                        |
| Ajustes del catálogo | Complementos y marca destacada se leen y guardan en Supabase, incluso desde la gestión del Home.                                                                        |

Los importes usan céntimos enteros. La lectura pública incluye el precio final
calculado en SQL y la web conserva esa cotización al presentarlo. La
validación del pago, la creación del pedido y el consumo de inventario aún
no se ejecutan remotamente: no debe confundirse una cotización del catálogo
con una compra confirmada por servidor.

## Datos existentes y catálogo vacío

No se importaron productos, marcas, reseñas, pedidos ni clientes de las
fixtures. El catálogo comercial remoto permanece vacío hasta registrar
datos reales autorizados. Un estado vacío es correcto; no recupera los
quince productos ilustrativos ni crea productos automáticamente.

El historial local del navegador se conserva en IndexedDB y no se migra ni
se elimina por activar el catálogo remoto. Tampoco se mezcla con las marcas
y productos leídos desde Supabase. Un error de red muestra un estado de
error y permite reintentar, sin sustituir silenciosamente la base por datos
locales.

La selección está centralizada en
[catalog-source.ts](../src/services/catalog-source.ts). `supabase` selecciona
el adaptador remoto; `local` es un modo explícito de desarrollo y pruebas.
Si existen variables de conexión, incluso incompletas, la aplicación falla
como conexión remota y no publica fixtures como alternativa.

## Arquitectura y permisos

- [storefront-repository.ts](../src/services/storefront-repository.ts)
  selecciona el repositorio público. El adaptador
  [supabase-storefront.ts](../src/services/supabase-storefront.ts) valida los
  DTO, comparte caché y pagina las lecturas sin exponer el snapshot privado.
- [catalog-admin-service.ts](../src/services/catalog-admin-service.ts)
  conecta los comandos del panel con las RPC. Verifica sesión, propietario y
  respuesta canónica antes de actualizar la interfaz. El cierre de sesión o
  cambio de cuenta invalida respuestas pendientes, incluso al regresar con
  el mismo UUID.
- Los productos, marcas y presentaciones utilizan UUID. El código de
  producto de cinco dígitos se asigna mediante una secuencia SQL; el
  navegador no puede reemplazar un código existente. Ese código interno no
  es el SKU comercial. Cada presentación conserva su propio SKU único; desde
  la corrección `20261029000500`, un SKU vacío se genera desde 1000 o el
  siguiente disponible. Los SKU manuales existentes no se renumeran.
- Cada registro conserva su versión. Editar con una versión anterior
  produce un conflicto; se conserva el borrador y se solicita revisar la
  versión actual, sin reintentar automáticamente una sobrescritura. El
  formulario de ofertas mantiene la versión capturada al iniciar su edición.
- `api` continúa siendo la superficie expuesta. Las tablas operativas de
  `app` y las funciones y membresías internas de `private` no reciben CRUD
  directo del navegador.
- El ejecutor administrativo `aro_catalog_admin_executor` es distinto del
  lector público. No tiene login, superusuario ni `BYPASSRLS`. Sus permisos
  y políticas se limitan al catálogo y cada comando exige membresía
  administrativa vigente y **AAL2**. Declarar un rol en la metadata del
  usuario no concede permisos.
- Las restricciones se comprueban dentro de la transacción antes de
  devolver éxito. Productos, variantes, notas, galería y oferta se guardan
  relacionados; la importación no equivale a insertar filas sueltas desde
  el navegador.

Los comandos administrativos cubren lectura paginada, guardado y eliminación
de producto o marca, stock, ofertas, importación, registro múltiple de marcas
y ajustes del catálogo. Las operaciones disponibles en SQL no añaden por
sí mismas botones nuevos a la interfaz aprobada.

## Migraciones aplicadas

1. [20261029000000_catalog_admin_commands.sql](../supabase/migrations/20261029000000_catalog_admin_commands.sql):
   ejecutor y políticas administrativas, DTO y comandos transaccionales,
   importación, ajustes y proyección pública del catálogo.
2. [20261029000100_catalog_conflict_http.sql](../supabase/migrations/20261029000100_catalog_conflict_http.sql):
   conflictos de versión mediante `PT409` / HTTP 409, conservando firmas,
   propietarios, ACL y requisitos de autorización.

La prueba alojada encontró que `40001` podía provocar reintentos de
PostgREST en lugar de devolver el conflicto. Se aplicó la corrección con
`PT409`, siguiendo la
[explicación oficial de Supabase](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions).
No se ampliaron permisos ni se desactivó RLS para resolverlo. Las migraciones
anteriores aplicadas se conservaron; el historial contiene ocho migraciones.

## Imágenes y contenido del Home

**Cloudflare R2 todavía no está conectado.** PostgreSQL almacena referencias
de medios, no archivos, base64 ni enlaces temporales del navegador. El
comando de producto únicamente acepta referencias ya registradas como
verificadas; no permite declarar una fotografía como disponible desde el
frontend.

Se pueden seleccionar fotografías y revisar su vista previa local. Si el
borrador contiene archivos nuevos sin almacenamiento permanente, el
guardado explica la limitación y conserva los archivos en el formulario.
No envía sus bytes a SQL ni confirma una publicación inexistente. También
se puede guardar un producto sin fotografías como borrador y completar
sus medios cuando se habilite el flujo permanente.

Los textos, carrusel, imágenes, video y cuestionario administrables del
Home mantienen su almacenamiento local durante esta fase. Solo
Complementos y la marca destacada se incluyen en el comando remoto de
ajustes. Los medios y textos editoriales no se vuelcan a una tabla JSON
para simular que todo el Home está conectado.

## Uso desde el panel

1. Entrar con una cuenta administrativa autorizada y completar el segundo
   factor.
2. En **Marcas**, pegar una marca por línea, revisar duplicados y guardar.
   El resultado distingue registros creados, existentes y errores. Las
   marcas nuevas quedan disponibles en el selector de Productos.
3. En **Productos → Nuevo producto**, completar datos y presentaciones.
   Se puede dejar desactivado y sin fotografías como borrador. El código
   del producto se obtiene al guardar correctamente en servidor.
4. Para Excel, descargar la plantilla, completar sus datos y revisar el
   resultado antes de confirmar. Los productos importados permanecen
   fuera de la tienda hasta completar imágenes y publicación válidas.
5. En **Promociones → Ofertas de productos**, configurar descuento y
   vigencia. «Guardar oferta» finaliza y «Guardar y crear otra» reinicia el
   formulario después de un guardado confirmado.
6. En **Contenido del Home**, administrar Complementos y la marca
   destacada. Los demás controles editoriales mantienen el alcance local
   indicado en el panel.

Una petición fallida no muestra éxito ni sustituye la base por un snapshot.
Los errores de validación o conflicto conservan el contenido del formulario
para que el administrador pueda corregirlo o revisar el registro actual.

## Validación comprobada

| Nivel               | Resultado                                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL aislado  | **163 comprobaciones**, ocho migraciones y 100 SKU concurrentes. Diez registros concurrentes de cien marcas terminaron con cien nuevas y novecientas existentes; el stock concurrente comprobó conflicto de versión.        |
| Supabase alojado    | **16/16 comprobaciones aprobadas** con cuentas temporales, cliente sin privilegios, administrador AAL1/AAL2, altas y ediciones de borradores, duplicados, ofertas, stock, versiones, eliminación y revocación de membresía. |
| Limpieza alojada    | Cuentas y datos temporales retirados; `cleanup: true`. No se crearon productos publicados ni medios para estas pruebas.                                                                                                     |
| SDK e interfaces    | **23/23 pruebas aprobadas**, SDK real y HTTP aislado. Incluyen catálogo vacío/error, paginación de 125 productos, filtros, detalle, recomendador, borradores, Excel, marcas, ofertas, ajustes y carreras de sesión.         |
| Regresión final     | **159/159 aprobadas**, código nativo 0, con marcas, ofertas, filtros, carrito, checkout simulado, recomendaciones, fotografías, stock y envíos.                                                                             |
| API pública alojada | **14/14 comprobaciones aprobadas**, exclusivamente con clave publicable: lectura pública y denegación de acceso administrativo, esquemas internos y tablas.                                                                 |
| Permisos remotos    | Diez condiciones de RLS, roles, grants y propietarios aprobadas; ocho migraciones aplicadas y ninguna pendiente.                                                                                                            |
| Responsive          | Veinte capturas de Tienda, Productos, Marcas y editor en 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844, con comprobación de desbordamientos e inspección visual.                                                        |

Las pruebas HTTP aisladas no sustituyen las de permisos alojados: se
presentan como niveles diferentes. Las pruebas privilegiadas del entorno
dev utilizan fixtures identificadas y limpieza controlada, no el catálogo
del cliente.

Typecheck, lint y build finales aprobados, con código nativo 0 registrado.
La ejecución final secuencial aprobó **159/159 escenarios** en 3,1 minutos.
Dos interrupciones de pruebas en una ejecución paralela anterior no se
reprodujeron en el repaso de los archivos afectados ni en esa regresión final.
La suite de Auth tuvo 64/65 aprobados; se corrigió el selector de prueba de la
confirmación de dirección y el archivo de cuenta repitió **6/6 aprobados**.
No se presenta el descubrimiento de 935 pruebas como una ejecución completa.
Los avisos existentes de tamaño de chunks de Excel/PDF continúan; no se
activaron indexación ni despliegue público.

La tienda real se comprobó también en Chrome contra el proyecto alojado:
estado vacío correcto y ningún error o advertencia en consola. La caché
pública conserva los precios calculados por SQL y se refresca al navegar,
volver a la pestaña y, mientras está visible, como máximo cada minuto.
Estos importes son cotizaciones de lectura, no reservas de inventario.

Evidencias ignoradas por Git:

- `artifacts/supabase-phase-4-2026-10-29/`: dry runs, aplicación, pruebas
  alojadas y controles generales.
- `artifacts/supabase-catalog/result.json` y `screenshots/`: resultado del
  SDK y veinte capturas.
- `artifacts/supabase-sql-tests/`: ejecuciones PostgreSQL aisladas.

Para repetir las pruebas sin modificar el proyecto alojado:

```powershell
npm.cmd run test:catalog:supabase
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
# Requiere las herramientas aisladas descritas en la Fase 2:
npm.cmd run test:supabase:sql
```

## Pendientes y siguiente etapa

**Actualización posterior:** esta sección conserva el cierre histórico de Fase 4. Los medios y el contenido editorial ya están conectados según [Home remoto](R2_HOME_IMPLEMENTATION.md); envíos, cupones y pedidos de prueba continúan en la [Fase 5](SUPABASE_PHASE_5.md). Mercado Pago sigue simulado y producción permanece pendiente.

Pedidos, cupones, envíos y contenido editorial del Home siguen en sus
adaptadores locales. Favoritos y carrito aún conservan su persistencia de
navegador. No se migró información personal local ni se fabricó un historial
remoto de pedidos.

Mercado Pago continúa **simulado**, por decisión del cliente. El checkout
actual no consume stock remoto, reserva unidades, valida cobros ni redime
cupones transaccionalmente. No debe utilizarse esa simulación como prueba
de integridad de una compra real.

La próxima etapa debe conectar el contenido editorial y el flujo permanente
de medios, con R2 cuando se autorice y configure, sin almacenar fotografías
en SQL. Después corresponde integrar pedidos y checkout en servidor,
coordinando identidad, precios, stock y pago antes de declarar disponible
una operación comercial de producción.
