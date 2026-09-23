# Fase 3 — Catálogo, marcas y búsqueda

## Ajuste del 14 de septiembre: filtros laterales

A petición del usuario, los filtros permanecen visibles a la izquierda desde 1024 px. La columna mide 220 px y los productos se distribuyen en tres columnas para conservar escala fotográfica. En móvil y tablet se mantiene el diálogo. El mismo formulario sirve a ambas presentaciones; aplicar conserva URL, limpiar modifica el borrador y los cambios de URL actualizan sus campos. Al ampliar la ventana con el diálogo abierto, este se cierra y devuelve el foco al título lateral.

Se revisó [Jovoy](https://www.jovoyparis.com/en/) como referencia de jerarquía multimarca; su listado devolvió HTTP 429 y Twisted Lily no pudo cargarse, por lo que no se atribuye a esas páginas una composición lateral verificada. Se mantiene una interpretación propia con líneas sutiles y controles existentes. Capturas actualizadas en `artifacts/phase-3/`.

Validación de este ajuste: typecheck, lint y build correctos; 14 pruebas de catálogo finalizadas correctamente. La suite completa se ejecutó con seis y después dos workers: mostró resultados correctos pero el proceso no finalizó y fue interrumpido. No se considera esa ejecución completa como un éxito confirmado. El resultado de 43 pruebas indicado más abajo corresponde a la entrega original del 13 de septiembre.

Fecha: 13 de septiembre de 2026. Autorización: «por el momento deja el inicio ahi y continua con la fase 3». Alcance: fase 3 de FRONTEND_DESIGN_PLAN.md, apartado 38. La composición de Home queda congelada; su buscador compartido ahora presenta resultados de muestra.

## Entrega

- `/catalogo`: cuatro productos existentes, fotografías alineadas, foto alternativa, precio disponible, referencia de agotados y favoritos locales.
- Filtros por marca, género y rango de precio. OR entre opciones de una misma faceta; AND entre facetas. El precio comprueba variantes disponibles; para productos completamente agotados utiliza precios de referencia.
- Selección en borrador dentro del diálogo. Aplicar confirma; Escape, cerrar o pulsar fuera descartan cambios. Limpiar selección modifica solo el borrador. Precio máximo inferior al mínimo muestra validación nativa.
- Chips eliminables, limpieza general, contador anunciado y orden por precio, novedades o selección ilustrativa de más vendidos.
- URL conserva `marca`, `genero`, `min`, `max`, `orden`, `q`, `seleccion` y `pagina`; filtros reinician página. Recarga y navegación atrás recuperan criterios. Cambiar filtros no desplaza el foco al inicio.
- Paginación de 12 productos. Con los cuatro productos actuales no aparecen controles innecesarios. Prueba con 13 elementos verifica segunda página y página fuera de rango.
- `/marcas` y `/marcas/:slug`: directorio y selección de cada firma, con estado de marca inexistente.
- `/buscar`: consulta por nombre de perfume o marca, insensible a mayúsculas y acentos; estados inicial y sin coincidencias.
- Header: sugerencias hasta cinco, debounce de 200 ms, descarte de respuestas antiguas y reintento ante fallo. No se amplió la navegación visual.
- Servicios y loaders con estados de error recuperables; sin API ni backend.

## Diseño y accesibilidad

Blanco, tipografía existente, nombres de marca uniformes, controles rectos y fotografías sin nuevas tarjetas decorativas. Dos columnas de producto en móvil y cuatro desde tablet, conservando el tratamiento aprobado de ProductCard. Filtros a pantalla completa en móvil y diálogo compacto en desktop. Inputs con etiquetas, selección de orden con nombre accesible explícito, controles táctiles, Escape, contención y retorno del foco. Se hereda reduced motion.

## Validación

- `npm.cmd run typecheck`: correcto.
- `npm.cmd run lint`: correcto, cero warnings.
- `npm.cmd run build`: correcto, sin warnings.
- `npm.cmd run test:e2e`: 43 pruebas correctas, incluidas 13 de fase 3 y las regresiones de Home, hero, navegación y ProductCard.
- Catálogo comprobado en 360, 375, 390, 430, 768, 1024, 1280 y 1440 px: sin overflow horizontal, imágenes rotas, errores ni avisos de consola.
- Revisión visual de capturas a 390, 768 y 1440 px. Archivo reproducible: `node scripts/capture-phase-3.mjs`. Genera catálogo, directorio, marca, búsqueda, vacío, filtros y sugerencias en `artifacts/phase-3/`.
- Probados filtros combinados, cancelación de borrador, Escape/retorno de foco, recarga, ordenación, historial, normalización de búsqueda, precios con stock, paginación y errores de loaders.

## Archivos

Nuevos: `src/services/catalog-service.ts`, `src/features/catalog/CatalogPage.tsx`, `BrandsPage.tsx`, `SearchPanel.tsx`, `catalog-loaders.ts`, `src/styles/catalog.css`, `tests/catalog.spec.ts`, `scripts/capture-phase-3.mjs` y este documento.

Actualizados: `src/app/router.tsx`, `src/components/layout/Header.tsx`, `StoreLayout.tsx`, `src/components/ui/Dialog.tsx`, `src/styles/global.css`, `tests/home.spec.ts` y `README.md`.

## Límites y siguientes fases

Las cuatro marcas, productos, clasificación de género y rankings siguen siendo ilustrativos. No se inventaron firmas comerciales ni ventas. Se conserva la advertencia global de prototipo. La clasificación definitiva depende del catálogo proporcionado por el cliente.

Los enlaces de producto conservan la vista informativa: ficha, galería y perfil olfativo corresponden a fase 4. Favoritos persistentes y carrito son fase 5; los corazones actuales solo alternan estado local por vista. No se implementaron cuenta, checkout, pagos, administración, Supabase ni publicación. La búsqueda avanzada por notas sigue pendiente de definición.
