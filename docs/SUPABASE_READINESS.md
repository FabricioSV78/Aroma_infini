# Preparación para Supabase (sin conexión activa)

## Estado actual y punto de sustitución

El proyecto sigue funcionando con datos de muestra. `admin-service.ts` concentra las reglas de validación y las operaciones del panel; `admin-persistence.ts` conserva un único snapshot en IndexedDB del navegador. El checkout simula el pago, registra el pedido en ese snapshot y mantiene el resumen del comprador en memoria. Carrito, favoritos y seguimiento de prueba usan `localStorage`; las reseñas publicadas proceden de una fixture y las reseñas nuevas permanecen en el navegador.

La UI de catálogo y Home consume `catalogService` y `homeService`, ambos con lecturas asíncronas. Estos leen `StorefrontRepository` (`storefront-repository.ts`), cuya implementación local filtra solo productos y marcas activos desde el mismo estado que edita el panel. `AdminStateRepository` encapsula la persistencia local. Los tipos compartidos de producto/variante, compra, cliente, dirección y reseña están en `src/types/`. La galería de la tarjeta se obtiene mediante `getCatalogProductGallery`; la lectura de reseñas de muestra pasa por `getPublishedReviews`. `shippingService` y `orderStatusService` evitan que páginas públicas lean directamente el estado administrativo. `persistDemoCheckout` concentra la escritura del pedido de prueba.

Estos contratos son puntos de reemplazo, no implementaciones remotas. No hay SDK, credenciales, tablas, autenticación ni peticiones a Supabase. Las lecturas sincrónicas `peekSnapshot()`, `getBestsellingProducts()` y `getCatalogProductGallery()` sirven al modo local; al conectar una fuente remota deberán incluirse en datos de loader/proveedor o caché de consulta, sin hacer consultas sincrónicas de red. El panel aún usa `useSyncExternalStore` y mutaciones locales; su adaptación a loading/error y escritura remota formará parte de la integración.

El HTML público prerenderizado usa el catálogo incluido en la compilación. Los cambios hechos en el panel local se ven al abrir la web en ese navegador, pero no cambian ese HTML estático. Antes de publicar datos desde Supabase habrá que definir cómo se regenera el HTML y el sitemap al publicar productos, marcas o contenido del Home, o servir esas rutas desde un renderizado de servidor. Mantener la misma fuente de datos para la ficha visible y sus metadatos evita resultados de búsqueda desactualizados.

## Datos que migrarán

| Datos actuales         | Entidades previstas                                                        | Relación o regla importante                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Marcas y productos     | `brands`, `products`                                                       | Slug único, visibilidad y marca activa.                                                                                                          |
| Fotografías y video    | `product_images`, referencias de Home; archivos en Storage                 | Orden, alt text, URL/ruta y permiso de subida. Evitar base64 en filas.                                                                           |
| Presentaciones y stock | `product_variants`                                                         | SKU/ID único, tamaño, precio en céntimos y stock no negativo.                                                                                    |
| Perfil olfativo        | Campos de detalle de producto o tabla `product_notes`                      | Salida, corazón, fondo, intensidad y texto humano con orden estable.                                                                             |
| Pedidos y líneas       | `orders`, `order_items`                                                    | Precios y nombres comprados como snapshot histórico; no derivarlos del catálogo actual.                                                          |
| Clientes y entrega     | `customers`/perfil, `addresses` si se guardan, datos de entrega del pedido | Provincia, distrito, contacto y receptor alternativo pertenecen al pedido; el panel puede mostrar la última ubicación sin sobrescribir historia. |
| Promociones y uso      | `promotions`, registros de redención                                       | Aplicación y límite de uso deben verificarse al confirmar el pago.                                                                               |
| Envíos                 | `shipping_settings`, `shipping_zones`                                      | Cotización centralizada y reglas por ubicación.                                                                                                  |
| Home                   | `home_content`, `home_media`, selección/orden de destacados                | Publicación de cinco slides, categorías y video sin tocar código.                                                                                |
| Reseñas                | `product_reviews`                                                          | Autor, producto, tamaño, fecha, valoración y estado de moderación por definir.                                                                   |

El diseño exacto de tablas, claves foráneas, constraints y políticas se decidirá antes de crear la base de datos; esta lista no es una migración SQL. Las fixtures, los pedidos de demostración y las reseñas ficticias (incluidas las generadas para visualización) **no** deben importarse como registros reales ni utilizarse para valoraciones estructuradas. Los datos personales guardados en navegadores de prueba no deben migrarse sin una decisión explícita de privacidad y consentimiento.

## Secuencia de integración recomendada

1. Confirmar catálogo real, nombres/IDs/SKU, dominio, contenido publicable y roles operativos. Mantener `VITE_ALLOW_INDEXING=false` mientras el catálogo sea ilustrativo.
2. Crear esquema y políticas de acceso; restringir escritura administrativa y lectura pública al contenido publicado. Separar archivos de Storage de sus metadatos.
3. Sustituir primero la lectura de catálogo/Home en los repositorios asíncronos. Mantener estados de carga, error, no encontrado y catálogo vacío en las rutas. Pasar galería y destacados desde el loader cuando se retire `peekSnapshot()`.
4. Migrar las mutaciones del panel, con feedback de guardado y errores recuperables. El Excel debe seguir validando y mostrando vista previa; su confirmación debe ser una operación controlada del servidor, no inserciones parciales desde el navegador.
5. Implementar identidad/autorización y checkout real. La creación del pedido, reserva/descuento de stock, uso de promociones y aprobación de pago requieren coordinación transaccional y confirmación verificada del proveedor, nunca solo el estado del cliente.
6. Sustituir cuentas, seguimiento y reseñas locales por consultas con permisos. Probar acceso entre usuarios, errores de red, reintentos, paginación, estados vacíos y datos históricos.

## Variables y seguridad

`.env.example` documenta las futuras variables **públicas** `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, comentadas hasta la integración. Vite incluye cualquier variable con prefijo `VITE_` en el bundle: la clave publicable identifica la aplicación, no concede privilegios administrativos por sí sola. Las claves secretas y de servicio jamás deben tener prefijo `VITE_`, aparecer en el frontend o registrarse en Git. Configurar Row Level Security y políticas mínimas antes de habilitar acceso desde el navegador. Las credenciales sensibles, pagos y tareas administrativas privilegiadas pertenecen a un entorno de servidor bajo control del proyecto. Véanse las [claves de API](https://supabase.com/docs/guides/getting-started/api-keys) y la [seguridad de datos](https://supabase.com/docs/guides/database/secure-data) de Supabase.

## Decisiones pendientes

- ¿Los clientes comprarán como invitados, con cuenta, o ambos? ¿Cómo se relacionará una compra invitada con una cuenta creada después?
- ¿Qué usuarios tendrán rol de administración y quién podrá publicar productos, cambiar pedidos, importar Excel y subir medios?
- ¿Qué proveedor de pagos se usará realmente y qué evento verificado autorizará crear/confirmar el pedido?
- ¿Dónde residirán imágenes y video; qué límites de tamaño, formatos y permisos se aplicarán?
- ¿Qué catálogo, reseñas y contenido son reales y están aprobados para publicación e indexación?
- ¿Qué evento de publicación regenerará las páginas SEO y el sitemap cuando cambien productos, marcas o Home?
- ¿La dirección de cliente será una libreta reutilizable o solo un dato histórico de cada pedido? ¿Cuál es la política de retención y acceso a DNI del receptor?
- ¿Cómo se asignarán SKU, inventario, precios y disponibilidad por presentación? ¿Se permiten pedidos con stock agotado o reservas temporales?
- ¿Se moderarán reseñas antes de publicarlas? ¿Se mostrarán reseñas de compradores verificados solamente?
