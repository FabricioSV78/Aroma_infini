# Cobertura funcional del panel — 10 de noviembre de 2026

Esta matriz inventaría la interfaz existente y registra la parte **aislada**
de la auditoría. La aplicación se ejecuta en Chrome real, con datos locales
o SDK Supabase y transporte controlado. **No acredita por sí sola escrituras
en Supabase alojado ni almacenamiento en R2 alojado.** Las pruebas operativas
de staging, inventario inicial y limpieza se documentan por separado en el
informe principal de esta auditoría.

## Superficie existente

Hay doce entradas de navegación, dieciséis rutas de trabajo y tres rutas de
acceso/recuperación. Inventario no es una sección independiente: está integrado
en Productos. Los tipos de producto y géneros son opciones del dominio;
Familias olfativas sí tiene mantenimiento propio.

| Ruta | Operaciones reales y subsecciones |
| --- | --- |
| `/admin` | Indicadores de preparación, stock y envíos; accesos a trabajo pendiente; unidades; inventario por reponer; pedidos recientes; estados y accesos rápidos. |
| `/admin/productos` | Búsqueda por producto/marca/SKU; filtros de stock y visibilidad; alertas/agotados; paginación; importar Excel; crear; editar; abrir fotografías; activar/desactivar. |
| `/admin/productos/nuevo` | Nombre, slug, marca, tipo, género, datos propios de perfume, familias múltiples, textos, notas, intensidad, ocasión, temporada, imágenes, variantes, SKU, precio, inventario, umbral, visibilidad, guardar/cancelar/vista previa. |
| `/admin/productos/:id` | Edición completa por versión; conservación de borrador ante error; protección al salir; vista previa antes de guardar; mismas validaciones de creación. |
| `/admin/productos/:id/fotos` | Cuatro posiciones comerciales y fotografía olfativa independiente para perfumes; cuatro para complementos; selección múltiple; orden/reemplazo/retiro; vista previa; guardar y continuar por cola; cancelar. |
| `/admin/marcas` | Lista, búsqueda/paginación; registrar nombres por línea; revisión de duplicados/existentes/errores; guardar válidas; editar nombre/slug; activar/desactivar. |
| `/admin/familias-olfativas` | Buscar, agregar, editar nombre/estado, activar/desactivar y eliminar una definición sin asociaciones; proteger familias utilizadas; selector de productos y plantilla. |
| `/admin/pedidos` | Búsqueda; estado/preparación; rango de fechas; cliente; paginación de veinte; selección de página o todos los filtrados; cambio masivo con confirmación; resultados parciales; exportación de fichas y resúmenes PDF. |
| `/admin/pedidos/:reference` | Cliente, productos y totales históricos; estado de pago informativo; preparación individual con transiciones válidas; confirmación de entrega; datos de entrega/destinatario; ficha; historial de cambios. |
| `/admin/clientes` | Lista derivada de pedidos comerciales, búsqueda, paginación y acceso a pedidos del cliente. No es un editor de identidades Auth. |
| `/admin/promociones` | Dos pestañas: cupones y ofertas de productos; crear/editar/activar/desactivar; porcentaje/importe; fechas; límites/cupón; precios por presentación; guardar y crear otra; eliminación directa con confirmación. |
| `/admin/envios` | Tarifas/plazos base de Lima y Callao; motorizado/courier; envío gratuito; excepciones por distrito; provincias ocultas y activación futura; guardado versionado y validaciones. |
| `/admin/home` | Carrusel (imagen/video, orientación, portada, orden, hasta diez campañas, textos/CTA/destinos); franja; categorías; marca destacada del menú; video editorial; recomendador, preguntas/opciones/resultados; vistas previas; guardar por versión. |
| `/admin/configuracion` | Identidad, contacto, horario, redes, políticas y datos simulados autorizados; documento versionado; QR de Contacto condicionado a dominio definitivo. |
| `/admin/reclamaciones` | Buscar/filtrar/paginar; detalle; revisión; respuesta escrita, canal, fecha y evidencia; no marcar Respondido sin constancia; historial y constancia PDF. |
| `/admin/notificaciones` | Estado del dispositivo y permiso; activación voluntaria; desactivar; prueba; instrucciones de instalación/PWA; estados de error/reintento. Campana de notificaciones y marcar leídas en el encabezado. |
| `/admin/login`, `/admin/recuperar`, `/admin/restablecer` | Login administrativo separado; identidad por UUID y membresía; MFA/TOTP; recuperación mediante código guardado, sin SMTP. |

El encabezado común incluye «Ver tienda», campana y cierre de sesión. En tablet
y móvil el menú funciona como diálogo con Escape y devolución de foco. La
precarga por hover/focus prepara código, sin adelantar lecturas privadas.

## Funciones que no deben confundirse ni reintroducirse

- **Productos destacados:** no existe esa selección comercial en la interfaz
  actual. Sí existe una **marca destacada** del menú, administrada desde Home.
- **Lotes y responsables manuales de pedidos:** retirados. La selección masiva
  opera directamente; el responsable verificado procede de la sesión real.
- **Eliminar productos o marcas desde la interfaz:** actualmente se ofrecen
  activar/desactivar, no un botón de eliminación. Hay RPC de eliminación en
  SQL, pero no un comando expuesto en `catalog-admin-service` ni control de UI.
  Una RPC probada no equivale a una opción disponible al administrador.
- **Moderación editable de reseñas:** no existe un módulo administrativo para
  editar o aprobar comentarios. La política actual aplica rechazo léxico de
  ofensas desde la publicación y SQL; las opiniones respetuosas, incluidas las
  negativas, se admiten. Productos no edita valoraciones comerciales.
- **Gestión de usuarios/roles:** el panel no ofrece CRUD de cuentas ni altas
  administrativas. Las identidades se crean en Supabase Auth, y los permisos
  dependen de membresía y MFA. Clientes no sustituye ese sistema.
- **Actualizar inventario o datos de muchos productos:** no hay una selección
  masiva de productos para editar stock o reemplazar fichas existentes. El
  formulario mantiene varias presentaciones de un perfume; Excel registra
  grupos nuevos y detecta los existentes. No se debe describir esa importación
  como un editor masivo de inventario ya registrado.
- **Dashboard y clientes:** excluyen pedidos `simulation=true`. Los ensayos de
  checkout no deben incrementar estadísticas comerciales ni fingir cobros.
- **Publicación y agotados:** stock cero desactiva automáticamente; activar
  requiere las condiciones de publicación. Reponer stock no autoriza por sí
  solo publicar material incompleto.

## Pruebas aisladas seleccionadas

Se utiliza un worker y tres servidores exclusivamente locales, puertos 5402,
5404 y 5405. No se reutiliza el servidor del desarrollador ni se heredan sus claves
de Supabase/medios. Cada test tiene contexto y datos propios; no toca registros
comerciales. Los `.xlsx`, fotografías y operaciones alojadas tienen suites
específicas separadas.

| Área | Pruebas de interfaz/contrato seleccionadas |
| --- | --- |
| Dashboard, catálogo administrativo, variantes y stock | `admin.spec.ts`; recorridos propios de superficies. |
| Registro múltiple de marcas | `admin-brand-batch.spec.ts`: 5/20/50/100 nombres, duplicados, caracteres, cambios concurrentes y fallos de guardado. |
| Ofertas consecutivas y cupones | `admin-product-offers-consecutive.spec.ts`, `admin-promotion-fast-actions.spec.ts`, `commerce-settings-browser.spec.ts`. |
| Familias | `olfactory-family-management.spec.ts`: asignación, renombre, desactivación, borrado sin asociaciones, teclado y conflicto. |
| Pedidos y cambios masivos | `order-workflow-ui.spec.ts`, `orders-supabase.spec.ts`, `order-retired-batches.spec.ts`: cien pedidos, filtros, selección entre páginas, transiciones, errores parciales e identidad. |
| Documentos PDF | `order-pdf-export.spec.ts`: 1/3/5/10/50/100 seleccionados, ambas modalidades, datos extensos, exclusión explícita de entregas incompletas, carga de fuente fallida y doble envío. |
| Carga/errores y navegación | `admin-route-loading.spec.ts`, `ui-states-admin.spec.ts`: carga real diferida, permisos, rechazo de almacenamiento, reintento y bloqueo de acciones duplicadas. |
| Recomendador | `admin-finder-options.spec.ts`: agregar/quitar opciones e importes, sin alterar valores estables. |
| Configuración y Contacto | `site-settings.spec.ts`: guardado por versión, conflictos, datos compartidos con Contacto/footer, enlaces seguros y QR condicionado. |
| Reclamaciones | `complaints-browser.spec.ts`: listado, filtros, respuesta, evidencia, privacidad, errores y constancia PDF. |
| Notificaciones | `admin-notifications.spec.ts`: permiso voluntario, alta/baja, errores, estados de dispositivo, sesión cambiada y cache privado. La entrega física push no se simula como aprobada. |
| Responsive y controles abiertos | `surfaces.spec.ts`: dieciséis rutas en 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844; búsquedas vacías, revisión de marcas, modal completo de producto/PDF y menú por teclado. |

Ejecución y artefactos: `artifacts/admin-functional-audit-2026-11-10/panel/`.
Los tests con transporte aislado no pueden elevar el estado de una operación
alojada a APROBADA.

## Evidencia aislada verificada

| Grupo | Casos distintos aprobados | Evidencia y límites |
| --- | ---: | --- |
| Panel con persistencia local | 122 | `panel/run-initial.log`: 121 aprobados y un fallo de foco del menú móvil. Tras la corrección de `AdminLayout`, el caso restante pasó tres repeticiones consecutivas en `panel/menu-after-fix.log`. Las repeticiones cuentan como un único caso. |
| Superficies y controles abiertos | 10 | Cinco recorridos por las dieciséis rutas y cinco recorridos de controles: búsqueda vacía, revisión de marcas, vista previa completa de producto, modal PDF y menú móvil/tablet. |
| Panel con SDK y transporte aislado | 76 | `panel/run-sdk-corrected.log`: sesenta casos SDK y dieciséis de notificaciones, sin fallos. La configuración inicial asociaba las notificaciones con un catálogo remoto incompatible con su fixture; sus dieciséis fallos iniciales fueron del montaje de pruebas. |
| Excel oficial y datos locales | 19 | `excel/local-first.log`, `excel/responsive-500.log` y `excel/unexpected-formats-final.log`: archivos reales, vista previa, confirmación, persistencia IndexedDB, recarga, reimportación, entradas vacías/corruptas/incompatibles, formatos inesperados y vista previa de 500 en cuatro pantallas. |
| Catálogo con SDK aislado | 41 | `excel/remote-full.log` y `excel/remote-500-final.log`: comandos y formularios remotos, conflictos, validación de respuestas, recuperación tras respuesta perdida y 500 productos/1000 variantes en una RPC. No son escrituras alojadas. |
| Fotografías con SDK y transporte aislado | 14 | `media/result.json`: catorce casos distintos aprobados entre ejecuciones. El primer fallo fue una coincidencia demasiado amplia de URL en una prueba nueva. Un caso laptop agotó su espera de arranque de cinco segundos y pasó al repetirlo de forma controlada; se conserva la evidencia de ambos intentos. |

Hay **208 casos distintos del panel** y **74 de Excel/catálogo/fotografías** en
estos grupos: **282 casos distintos aprobados**. Este total excluye los ensayos
alojados, las repeticiones del menú y cualquier prueba nueva agregada después
de esas ejecuciones. No significa que todas las operaciones posibles hayan
sido acreditadas en servicios reales.

### Excel local: productos y variantes

Cada perfume contiene dos presentaciones. En el archivo mixto se introducen
seis productos inválidos, correspondientes a doce filas, y se guardan únicamente
los productos que la vista previa reconoce como válidos.

| Productos candidatos | Archivo válido: productos / variantes | Archivo mixto: productos / variantes | Productos rechazados en mixto |
| ---: | ---: | ---: | ---: |
| 10 | 10 / 20 | 4 / 8 | 6 |
| 50 | 50 / 100 | 44 / 88 | 6 |
| 100 | 100 / 200 | 94 / 188 | 6 |
| 500 | 500 / 1000 | 494 / 988 | 6 |

En los ocho escenarios, la reimportación añadió cero productos, los registros
originales permanecieron intactos y ninguna celda contenía imágenes ni URLs.
Las mediciones de IndexedDB no representan la latencia de Supabase alojado.
Los resultados individuales y hashes de cada `.xlsx` están en
`excel/result-<cantidad>-<valid|mixed>.json`.

### Inspección visual y accesibilidad

`panel/surface-measurements.json` contiene ochenta observaciones, dieciséis
rutas por cinco tamaños. Ninguna presentó desbordamiento horizontal. Los
recorridos también comprobaron errores de JavaScript, finalización de cargas,
apertura/cierre de diálogos y Escape/devolución de foco.

Se generaron capturas de las superficies y controles abiertos. Se inspeccionaron
además la creación de producto en laptop y móvil y el modal PDF en móvil:
controles legibles, acciones identificables y composición conservada. Las
capturas de página completa muy largas no sustituyen las capturas de viewport;
para revisar móvil conviene consultar `390-product-create-top.png` y
`390-pdf-dialog-top.png`.

El único fallo confirmado de la aplicación en este grupo fue el foco inicial
del menú: el botón todavía estaba oculto durante el primer frame. La corrección
espera su visibilidad antes de enfocarlo y cancela el frame al desmontar, sin
modificar los estilos ni la animación. La captura por sí sola no acredita una
auditoría completa con lector de pantalla ni pruebas en teléfonos físicos.

### Cierre de acreditación alojada

El [informe principal final](ADMIN_FUNCTIONAL_AUDIT_2026_11_10.md) consolida
veintidós comprobaciones funcionales compuestas distintas en staging real,
además de seis rechazos HTTP anónimos. Incluyen las importaciones reales de
10/50/100/500, imágenes R2, publicación, SKU, edición manual, agotados,
reconciliación de un commit con respuesta perdida, marcas, familias,
ofertas/cupones, pedidos, ambos PDF y reclamación. No se suman a los 282 casos
Playwright de esta matriz.

`hosted/postflight.json` verificó las siete ejecuciones: retirados catorce
usuarios, 1021 productos y 35 marcas propios; sin filas comerciales QA
restantes, 24 tumbas de auditoría de medios `deleted` sin referencias y
72 objetos R2 comprobados ausentes. Las huellas originales coincidieron en
todas las ejecuciones. El resultado inicial del formulario incompleto se
conserva como fallo del montaje; la repetición corregida pasó.

Los documentos globales de Home, configuración y tarifas ya pertenecían a la
tienda. No debe modificarse su contenido original solo para acreditar una prueba
de guardado: sus escrituras se verifican en aislamiento y las lecturas alojadas
se identifican como tales. La entrega push en teléfonos físicos, la creación de
roles desde Supabase y cualquier control que no exista en la interfaz deben
mantener su observación explícita; no se deducen como aprobados por un mock.
