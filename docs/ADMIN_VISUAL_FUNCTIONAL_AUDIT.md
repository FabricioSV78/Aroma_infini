# Auditoría visual y funcional del panel administrativo

Fecha: 21 de septiembre de 2026

## Iteración visual basada en la referencia de cochera

Se revisó `demo-cochera.html` como referencia de lenguaje visual, sin ejecutar
ni trasladar su lógica de negocio. Del archivo se tomaron criterios de densidad,
navegación y jerarquía: sidebar azul noche, iconos visibles, acento lima
contenido, fondo gris azulado, tarjetas blancas con radios suaves y estados
semánticos.

La adaptación de Aroma Infini conserva exclusivamente funciones del e-commerce:
pedidos, clientes, productos, inventario por presentación, marcas, promociones,
contenido del Home y envíos. La tienda pública no fue modificada.

En escritorio, el sidebar permanece visible y la barra superior identifica el
módulo actual. En tablet y móvil se convierte en un drawer que bloquea el
scroll de fondo, recibe el foco al abrirse, se cierra con Escape y devuelve el
foco al botón que lo abrió.

## Objetivo y alcance

Se revisaron las vistas administrativas como si fueran utilizadas por el equipo
de Aroma Infini: resumen, productos, editores de producto, marcas, pedidos,
detalle de pedido, clientes, promociones, envíos y contenido del Home.

El panel adopta una dirección propia de dashboard: tipografía funcional,
jerarquía compacta, iconos coherentes, superficies claras y colores reservados
para estados. No replica el lenguaje editorial de la tienda.

## Problemas encontrados y resueltos

- El resumen anterior no priorizaba decisiones operativas. Ahora muestra
  pedidos pagados por preparar, unidades disponibles, alertas por presentación
  y pagos pendientes. No se inventaron ingresos ni tendencias.
- El stock no permitía detectar con rapidez la presentación afectada. Ahora
  muestra cantidad y estado para 50 ml, 75 ml, 100 ml o la presentación que
  corresponda, con umbral configurable por producto.
- Pago y preparación se mezclaban conceptualmente. Pedidos los presenta como
  estados separados y solo permite avanzar la preparación de pagos aprobados.
- El panel acumulaba formularios y acciones antes de las listas. Marcas y
  promociones muestran primero la información y abren el editor al solicitarlo.
- Búsqueda, filtros y paginación no conservaban siempre el contexto. Productos,
  pedidos, marcas, clientes y promociones usan una paginación compartida y
  parámetros de URL normalizados.
- El dashboard podía desbordar unos píxeles exactamente a 768 px por una regla
  dependiente de la posición de los badges. Se sustituyó por variantes
  semánticas explícitas.
- Las notas olfativas perdían la coma mientras se escribía. El editor conserva
  el texto crudo y normaliza la lista al perder foco o guardar.
- El detalle del pedido repetía el estado de pago. Ahora el encabezado comunica
  la preparación y la sección Pago conserva el dato informativo una sola vez.
- Se reforzaron validaciones para stock, precios, variantes, marcas activas,
  promociones, fechas, límites y tarifas de envío.

## Experiencia resultante

- Navegación agrupada en General, Operación, Catálogo, Comercial y
  Configuración, con menú bajo demanda hasta 1023 px.
- Tablas compactas en escritorio y fichas legibles en móvil.
- Acciones rápidas para preparar, enviar y entregar pedidos.
- Formularios con rótulos comprensibles, estados visibles, foco gestionado y
  protección ante cambios sin guardar en el editor de producto.
- Datos simulados identificados en una banda discreta y persistencia limitada a
  la sesión.

## Validación visual y técnica

La auditoría generó 36 capturas en 390, 768 y 1440 px dentro de
`artifacts/visual-ux-audit/admin-cochera-final/`, además de dos capturas del
drawer abierto en 390 y 768 px.

Resultado automatizado:

- 0 desbordamientos horizontales;
- 0 imágenes rotas;
- 0 errores o advertencias de consola;
- 0 controles auditados menores de 44 px;
- 0 textos recortados;
- una estructura `h1` correcta en todas las vistas.

Validación del proyecto:

- `npm run typecheck`: correcto;
- `npm run lint`: correcto, sin warnings;
- `npm run build`: correcto, 101 módulos transformados;
- `npm run test:e2e -- --workers=1`: 160 pruebas correctas.

## Límites deliberados

El panel sigue siendo una demostración frontend. Autenticación, permisos,
persistencia, paginación de servidor, inventario transaccional, Mercado Pago,
Supabase y webhooks deben conectarse en la fase de backend. La interfaz y los
tipos quedan preparados sin fingir que esas operaciones ya existen.
