# Más vendidos

La sección del Home y el orden «Más vendidos» de Tienda utilizan unidades
compradas, sumadas entre todas las presentaciones de cada producto.

## Criterio

- Se cuenta el histórico completo de pedidos comerciales con
  `simulation = false`, `payment_status = 'approved'` y
  `payment_verified_at` establecido por el servidor.
- Se suman las cantidades de las líneas por `product_id`. Un perfume comprado
  en 50 ml y 100 ml participa como un mismo producto.
- Pedidos simulados, pagos pendientes/rechazados, datos sin verificación y
  pedidos reembolsados no aportan unidades. Cambiar la preparación de un
  pedido no lo convierte en una venta.
- No hay un contador incremental: repetir una notificación de pago no vuelve
  a sumar las mismas líneas. Un cambio del estado de pago se refleja en la
  siguiente consulta.
- Mayor cantidad primero. Los empates conservan el orden inicial y el UUID
  como desempate estable.

El Home muestra hasta cuatro **perfumes publicados y disponibles**. Si hay
pocas ventas, completa las posiciones con los perfumes disponibles del orden
inicial. Sin ventas confirmadas, utiliza únicamente esa selección inicial.
Los complementos nunca ocupan estas posiciones; Tienda conserva sus filtros
y puede ordenarlos dentro de su propio catálogo cuando se habiliten.

## Implementación

`private.catalog_sales_units()` calcula una sola agregación por consulta de
ventas. Solo el ejecutor público interno puede invocarla; los navegadores no
obtienen acceso a pedidos, identidades ni cantidades vendidas.

`catalog_products`, `catalog_browse` y `catalog_home_context` comparten ese
criterio. El Home remoto respeta el orden que entrega SQL. `popularity` y
`display_rank` mantienen su función de orden inicial, sin hacerse pasar por
cantidades vendidas. Los órdenes por precio no ejecutan la agregación.

Se conservó la caché pública existente de cinco segundos. El ranking se renueva
en posteriores cargas/navegaciones; no se reordena una página abierta mediante
sondeo ni se añaden consultas privadas al navegador.

## Estado y validación del 10 de noviembre de 2026

- Migración: `20261110000300_sales_bestsellers.sql`, aplicada en desarrollo.
- Frontend actualizado en staging; producción no se modificó.
- 735 comprobaciones SQL y siete pruebas de proyección/navegador aprobadas.
- Verificados variantes, unidades frente a importe/número de pedidos,
  selección inicial, empates, agotados, reembolsos, repetición de eventos,
  paginación, precios y permisos.
- La prueba nativa mide cero agregaciones al ordenar por precio y una al
  consultar «Más vendidos».
- Tipos regenerados con el generador oficial contra PostgreSQL desechable.
- TypeScript, lint y builds de producción/staging aprobados.

Evidencias: `artifacts/sales-bestsellers-2026-11-10/`.

**Mercado Pago continúa simulado.** Se preservaron las restricciones que
impiden registrar pagos comerciales aprobados en esta etapa. Hasta conectar
la pasarela y su verificación de servidor, aparecerá la selección inicial;
los pedidos de prueba no generarán supuestas ventas. Los escenarios de pagos
aprobados se comprobaron exclusivamente en PostgreSQL desechable, con
preparación de fixture transaccional que se revierte, sin crear ventas alojadas.
La futura integración de pagos deberá registrar ese estado verificado después
de validar el proveedor y completar las reglas de inventario correspondientes.

Referencias: [agregaciones de PostgreSQL](https://www.postgresql.org/docs/17/functions-aggregate.html)
y [seguridad por filas de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
