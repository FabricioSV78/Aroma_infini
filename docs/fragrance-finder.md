# Encuentra tu perfume ideal

## Referencias y decisiones (12 de octubre de 2026)

- [Àerre](https://aerre.co/pages/quiz): recorrido observado en navegador, con selección fotográfica de familias, opción sin preferencia, progreso y regreso. Se adapta la selección sensorial a cuatro preguntas y una sola elección por paso. No se copian sus colores ni se obliga a elegir varias respuestas.
- [Scentbird](https://www.scentbird.com/blog/find-your-perfect-scent-with-the-new-scentbird-quiz/): su explicación oficial relaciona preferencias y resultados. El cuestionario en vivo bloqueó el acceso automatizado, por lo que no se atribuyen observaciones de sus pantallas de resultados.
- [Sephora](https://www.sephora.com/beauty/fragrance-finder): acceso denegado; no se presupone cómo funciona actualmente.
- [Lancôme](https://www.lancome.co.uk/product-finder/fragrance-finder/): contenido oficial indexado con familias sensoriales, intensidad, avance/regreso y reinicio. Aroma Infini no pregunta por rasgos emocionales que su catálogo no clasifica ni pide correo para ver resultados.
- [Penhaligon’s](https://www.penhaligons.com/uk/en/fragranceprofilerquiz): una escena fotográfica amplia reúne producto y titular. La entrada del Home utiliza una sola escena de ingredientes con el mensaje superpuesto.
- [BYREDO](https://www.byredo.com/us_en/future-memories-campaign): el acceso al recomendador se incorpora al relato editorial. La aplicación a Aroma Infini de una primera pregunta visible es una decisión de diseño propia, no una réplica de su interfaz.

La entrada editorial reemplaza la guía oculta, después de Más vendidos y antes de Firmas. La primera pregunta se presenta en el Home; al elegir una familia, el diálogo continúa en el paso dos y permite regresar para cambiarla. El acceso general abre el paso uno con todas las familias disponibles. El cuestionario completo no alarga el Home. Las fotos de ingredientes ilustran familias y no atribuyen ingredientes a productos. Todos los demás bloques se conservan.

Los resultados usan las fotografías existentes en su proporción original. Se muestran primero identidad, precio y presentación; las razones visibles omiten el perfil o presupuesto ya indicados junto al producto. La puntuación y el orden de resultados no cambian por esta presentación.

## Datos y reglas

Una sola fuente: `StorefrontRepository.readSnapshot()`, la misma que usa la tienda. Solo llegan productos publicados y marcas activas. El servicio vuelve a leerla al enviar respuestas; no mantiene una segunda colección de productos.

1. **Aroma**: opciones obtenidas de la primera familia de cada producto disponible. La coincidencia acepta etiquetas completas del perfil, normalizadas por acentos y mayúsculas. Si se elige un aroma, es obligatorio respetarlo.
2. **Momento**: etiquetas reales de `detail.occasion`. No se deducen ocasiones por notas o por personalidad.
3. **Intensidad**: `detail.intensity`. No implica una promesa de duración.
4. **Presupuesto**: techo en céntimos aplicado a cada variante activa con stock. Se muestra la presentación disponible de menor precio que cumple ese techo. Nunca se rebasa para completar resultados.

Cada pregunta permite no tener preferencia. Pesos de coincidencia: aroma 5, momento 3, intensidad 2. Se priorizan coincidencias completas; solo si no existen, se muestran hasta tres parciales, explicando sus diferencias. Desempates: menor precio disponible, nombre y luego ID. No hay aleatoriedad, porcentajes de afinidad inventados ni IA.

Si solo se indica presupuesto, se muestra una selección por precio, explícitamente identificada como tal. Si no se indica nada, se pide una pista. Si no hay stock o coincidencias, se ofrece revisar respuestas o visitar la tienda; no se sustituye silenciosamente el criterio.

Las variantes inactivas, agotadas o con precio/tamaño inválido quedan fuera. La disponibilidad se verifica al consultar, no se reserva; carrito y checkout conservan sus propias validaciones. El enlace abre la ficha con su selector existente, donde el comprador elige la presentación.

## Gestión y futuras consultas remotas

El panel ya administra familia, ocasión, intensidad, precio, stock, publicación y estado de variantes. Se añadió ayuda junto a los campos actuales. Familia principal primero, calificadores después; momentos separados con `·`. También se aceptan coma, punto y coma, barra y `|`. Etiquetas como «Por definir» o «Pendiente» no se ofrecen como preferencias.

No se añaden campos de personalidad ni se inventan características. Antes de usar comercialmente los productos de demostración, el administrador debe verificar esos atributos. Futuros productos con categorías nuevas aparecen automáticamente; las imágenes ilustrativas tienen un fallback tipográfico.

La interfaz consume `FragranceFinderService`; el algoritmo puro no conoce IndexedDB, React, mocks ni Supabase. Para conectar Supabase, implementar `StorefrontRepository` y conservar los tipos compartidos. Conviene convertir familia y ocasión en vocabularios controlados relacionados con productos, para evitar sinónimos o erratas del texto libre. Mantener intensidad validada y stock/precio en variantes. No hay nuevas tablas, autenticación, claves ni llamadas remotas ahora.

El estado del cuestionario es temporal: cerrar o reiniciar elimina las respuestas. No se envía información personal ni se guardan preferencias. Se contemplan carga, error recuperable, catálogo vacío y falta de coincidencias; navegación por teclado, foco confinado/restaurado, Escape, radios nativos y movimiento reducido.
