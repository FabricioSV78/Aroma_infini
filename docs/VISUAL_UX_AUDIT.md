# Auditoría visual y de experiencia

Fecha: 20 de septiembre de 2026

**Actualización del 21 de septiembre de 2026:** el panel fue auditado de nuevo
tras su conversión a dashboard operativo. La revisión actual se documenta en
`ADMIN_VISUAL_FUNCTIONAL_AUDIT.md`: 36 capturas nuevas, cero fallos visuales
automatizados y 160 pruebas completas correctas. La navegación pública vigente
se documenta en `NAVIGATION_REVIEW.md`.

## Alcance

Se revisaron 38 rutas implementadas de la tienda, la cuenta y el panel
administrativo. El barrido final generó 114 capturas en 390, 768 y 1440 px.
Las pruebas responsive cubren además 360, 375, 430, 1024 y 1280 px.

El informe automatizado y las capturas finales están en
`artifacts/visual-ux-audit/final/`. El resultado final fue:

- 0 desbordamientos horizontales;
- 0 imágenes rotas;
- 0 errores o advertencias de consola;
- 0 rutas con una estructura incorrecta de `h1`;
- 0 controles auditados por debajo del objetivo táctil;
- 0 textos realmente recortados.

## Lectura de referencias

Las seis referencias se analizaron por separado y se usaron como criterios, no
como plantillas:

- **Jovoy:** descubrimiento multimarca, filtros claros y jerarquía de producto.
- **Aedes:** curaduría editorial, fotografía protagonista y texto contenido.
- **D.S. & Durga:** identidad fuerte, descriptores breves y narrativa después de
  la decisión de compra.
- **Vilhelm:** escala fotográfica, momentos visuales amplios y poco ruido.
- **Twisted Lily:** utilidad comercial, filtros comprensibles y estados claros.
- **Phlur:** navegación compacta, selección de variantes y llamadas a la acción
  directas.

Para Aroma Infini se conservó la secuencia de impacto, descubrimiento,
producto, pausa editorial, selección y confianza. El panel se evaluó con
criterios propios de operación porque las referencias no exponen sus sistemas
administrativos.

## Problemas encontrados

### Tienda

- La ficha de producto retrasaba demasiado variantes y compra en móvil y tablet.
- El acceso flotante de ayuda podía cubrir contenido en pantallas pequeñas.
- La navegación de cuenta repetía todo el menú antes de cada tarea en móvil.
- El catálogo de escritorio dejaba un cuarto producto aislado en una nueva fila.
- Home, institucionales, checkout y footer acumulaban altura y textos auxiliares.
- Algunos controles de galería, carrito y migas de pan tenían áreas táctiles
  reducidas.

### Panel administrativo

- El menú completo ocupaba más de la mitad de la primera pantalla hasta 768 px.
- Acciones repetidas como «Editar» o «Desactivar» carecían de contexto para
  lectores de pantalla.
- Limpiar la búsqueda recuperaba resultados, pero conservaba el texto anterior.
- Las promociones futuras, vencidas o agotadas se mostraban como activas.
- Editar una promoción actualizaba un formulario fuera de la vista y sin foco.
- Categorías mezclaba guardado inmediato y guardado explícito.
- El límite de dos destacados del Home no explicaba cómo reemplazar uno.
- Varios rótulos estaban formulados para una persona técnica y no para operación
  cotidiana.

## Correcciones realizadas

### Tienda

- Se compactó la galería de producto en móvil y tablet para acercar nombre,
  precio, variantes y botón de compra a la primera impresión.
- Se ampliaron controles de galería, cantidad, eliminación y breadcrumbs.
- La ayuda ahora forma parte del flujo en móvil y deja de tapar contenido. Su
  mensaje no promete un canal de WhatsApp aún no confirmado.
- Mi cuenta usa un selector de sección compacto en móvil y conserva el sidebar en
  escritorio.
- El catálogo usa cuatro columnas en escritorio ancho, alineando la colección
  actual.
- Se redujo altura innecesaria en marcas, destacados, confianza, checkout,
  institucionales y footer sin retirar contenido comercial útil.
- Se simplificaron los textos institucionales repetitivos y se mantuvo un aviso
  honesto cuando una operación real todavía no está habilitada.
- El buscador coloca el foco inicial en el campo principal al abrirse.

### Panel administrativo

- Se sustituyó el sidebar extenso por un menú bajo demanda hasta 1023 px. El
  contenido principal aparece dentro de la primera pantalla.
- Se ampliaron objetivos táctiles y se agregaron nombres accesibles contextuales.
- La búsqueda se sincroniza con la URL también al limpiarse.
- Las promociones muestran estado operativo: aplicable, pausada, programada,
  vencida o con límite alcanzado.
- Editar una promoción lleva el foco al editor y hace visible el resultado de la
  acción.
- Categorías guarda nombre y visibilidad mediante una sola acción explícita.
- Se aclararon campos como URL del producto, categoría, fotografía de
  demostración y tipo de descuento.
- El editor de Home comunica cuántos destacados están seleccionados y cómo
  sustituirlos.
- Se redujeron suscripciones repetidas por fila al derivar los recuentos en el
  componente padre.

### Refinamiento operativo del panel

- El inicio del panel se convirtió en un dashboard empresarial con indicadores
  reales del estado en memoria: pedidos abiertos, productos activos, stock bajo
  y promociones aplicables. No se añadieron ventas ni métricas ficticias.
- La navegación se agrupó en General, Operación, Catálogo, Comercial y
  Configuración. En móvil permanece cerrada hasta que se solicita.
- Se retiró el tratamiento editorial del back office: títulos, formularios,
  tablas y acciones usan una jerarquía sans más compacta y funcional.
- Marcas y promociones muestran primero su lista y abren el formulario solo al
  crear o editar. Esto reduce desplazamiento y elimina espacios vacíos.
- Productos, marcas, pedidos, clientes y promociones quedaron preparados con
  paginación compartida. Los controles solo aparecen al superar el tamaño de
  página y el número de página se conserva en la URL.
- La búsqueda y la página se conservan al entrar y volver de un producto o
  pedido. Parámetros de página inválidos se normalizan sin perder filtros.
- La miga de pan de Mi cuenta quedó centrada en una sola línea en todos los
  anchos revisados.

## Validación

- `npm run typecheck`: correcto.
- `npm run lint`: correcto, sin warnings.
- `npm run build`: correcto, 101 módulos transformados.
- `npm run test:e2e`: 147 pruebas correctas.
- Auditor visual completo previo: 114 capturas correctas en móvil, tablet y
  escritorio.
- Revalidación de esta iteración: 36 capturas del panel y 3 de Mi cuenta, sin
  overflow, imágenes rotas, errores de consola, objetivos táctiles pequeños ni
  texto recortado.

Se reforzaron pruebas de regresión para navegación administrativa y de cuenta,
búsqueda, estados y foco de promociones, ayuda no superpuesta, cercanía del CTA
de producto, carga de imágenes e interacción de marcas bajo concurrencia.

## Archivos modificados

- Componentes: `StoreLayout.tsx`, `AccountLayout.tsx`, `SearchPanel.tsx`,
  `InstitutionalPages.tsx`, `AdminLayout.tsx`, `AdminProducts.tsx`,
  `AdminOperations.tsx`, `AdminDashboardPage.tsx`, `AdminPagination.tsx` y
  `AdminShared.tsx`.
- Utilidades administrativas: `admin-pagination-utils.ts`, `admin-utils.ts` y
  `useAdminPagination.ts`.
- Estilos: `base.css`, `home.css`, `catalog.css`, `product-detail.css`,
  `commerce.css`, `checkout.css`, `account.css`, `institutional.css`,
  `footer.css` y `admin.css`.
- Validación: `audit-visual-ux.mjs`, `account.spec.ts`, `admin.spec.ts`,
  `home.spec.ts`, `home-gallery.spec.ts`, `institutional.spec.ts` y
  `product-detail.spec.ts`.
- Documentación: `VISUAL_UX_AUDIT.md`.

## Decisiones reservadas

- Los canales de contacto, textos legales definitivos, autenticación y datos
  comerciales siguen pendientes de información real. No se inventaron.
- La protección uniforme de cambios sin guardar en todos los formularios largos
  debe resolverse junto con la estrategia de persistencia o autoguardado del
  backend. El editor de producto conserva la protección actual.
- No se convirtieron los formularios de marcas y envíos en asistentes o modales:
  ese cambio de flujo requiere validar primero el volumen y los permisos reales
  de operación.
- No se agregaron funcionalidades, backend ni dependencias nuevas durante esta
  auditoría.
