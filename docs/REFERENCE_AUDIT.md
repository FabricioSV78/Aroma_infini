# Aroma Infini — Auditoría de referencias

Fecha de consulta: 12 de septiembre de 2026. Estado: **PROPUESTA TEMPORAL**, para revisión del cliente.

Este documento analiza las seis referencias y fundamenta una dirección propia. El plan que desarrolla las decisiones está en [FRONTEND_DESIGN_PLAN.md](FRONTEND_DESIGN_PLAN.md). Esta fase entrega exclusivamente ambos documentos; la implementación requiere la aprobación explícita del plan.

## 1. Alcance y método

Se consultaron las seis portadas y una ficha de producto por referencia mediante lectura web. También se consultaron sus colecciones. Se inspeccionaron visualmente las portadas de Jovoy, Aedes, D.S. & Durga, Vilhelm y Twisted Lily en navegador de escritorio y en una vista móvil emulada de **390 × 844 px**. La vista inicial de escritorio fue de 1889 × 2045 px; el catálogo y el hover de D.S. & Durga se revisaron además a **1440 × 900 px**.

Se observaron el menú móvil y los filtros de Twisted Lily, el buscador móvil de D.S. & Durga, su hover de producto y las fichas móviles de Aedes y Vilhelm. Se contrastó la información de filtros de Jovoy en el navegador.

**Límites de la evidencia:**

- Phlur respondió al lector web, pero el navegador interactivo mostró una verificación de seguridad. Su contenido se analiza; sus colores, tipografía, proporciones, hover y comportamiento móvil quedan **NO VERIFICADOS**.
- Algunas fichas suministradas por el lector web proceden de capturas anteriores: desde días hasta dos meses. Se usan para estudiar estructura, sin validar precios, promociones ni disponibilidad actuales. El estado visible en navegador tiene prioridad sobre una extracción textual.
- El lector de Jovoy devolvió un error 429 al consultar el catálogo; el mismo catálogo sí abrió en navegador. La colección de Twisted Lily apenas exponía productos/filtros al lector; el navegador permitió observarlos.
- No se completaron compras, registros ni suscripciones. No se verificó persistencia de favoritos, carrito con productos, pago, sincronización de stock ni autenticidad de las reseñas de terceros.
- Un control presente en HTML puede estar oculto. Por ejemplo, encontrar simultáneamente un aviso de agotado y un botón de compra en una extracción no demuestra qué estado ve el comprador.
- Es una auditoría cualitativa de diseño y UX, sin mediciones de conversión, tiempos de animación, Core Web Vitals o conformidad integral de accesibilidad. La emulación móvil no sustituye una prueba en dispositivo físico.

Las imágenes se visualizaron exclusivamente para el análisis. No se descargaron assets para Aroma Infini, ni se copiaron código, textos comerciales, logotipos o composiciones exactas.

## 2. Jovoy Paris

**Observado.** Header blanco de varias franjas: buscador explícito, marca central y utilidades; navegación con entradas por marcas, perfumes y selecciones. Hero fotográfico con indicadores de carrusel. Tarjetas con frasco aislado, badge, favorito, marca, precio y notas resumidas. Combina titulares serif con interfaz más contenida. En móvil mantiene una fila propia para buscar. El pie agrupa servicios, información institucional y condiciones. Estas observaciones proceden de la [portada de Jovoy](https://www.jovoyparis.com/en/).

En el [catálogo](https://www.jovoyparis.com/en/5-perfumes-us?order=product.date_add.desc) se observaron familias, cantidad de resultados, orden y filtros de notas, concentración, ocasión, precio, capacidad y marca. La [ficha Talisman](https://www.jovoyparis.com/en/spicy-perfumes/9267-talisman-welton-x-chris-collins.html) distingue presentación, notas de salida/corazón/fondo y un perfil con intensidad y contexto de uso. La interfaz indica que guardar en wishlist requiere cuenta.

- **Qué hace especialmente bien — valoración:** relaciona la exploración comercial con información que ayuda a imaginar el aroma.
- **Idea aprovechable:** acceso claro a marcas y perfil olfativo cerca del producto; describir antes de exigir conocimiento técnico.
- **Qué no copiar:** profundidad de filtros, densidad de badges, tipografía serif ni condiciones comerciales. Aroma Infini tendrá inicialmente tres filtros y favoritos sin login.
- **Combinación propuesta:** organización multimarca de Jovoy, con tarjetas más ligeras y una jerarquía de presentación/precio inspirada en el análisis de D.S. & Durga.

**Pendiente de comprobación:** apertura y teclado del mega menú, hover de tarjeta, búsqueda con resultados, wishlist persistente y carrito completo.

## 3. Aedes Perfumery

**Observado.** La navegación prioriza marcas, agrupadas alfabéticamente. La portada combina un hero de campaña con un mosaico fotográfico de lanzamientos; en escritorio el header puede superponerse al hero. El logotipo es clásico y los rótulos de interfaz usan sans. En móvil el header es blanco, la navegación se compacta a menú/búsqueda/bolsa y el mosaico pasa a una columna. Se mostró una invitación a newsletter que podía cerrarse. El footer reúne información del negocio, contacto, redes y políticas. Fuente: [portada de Aedes](https://www.aedes.com/).

La [colección de novedades](https://www.aedes.com/collections/new-arrival) expone ordenación y precios desde. La [ficha Metal Lavender](https://www.aedes.com/products/metal-lavender-eau-de-parfum) permite distinguir frasco y muestra; en móvil se observaron imagen principal, cuatro indicadores, zoom y selector de presentación. Su imagen ocupa bastante altura antes de llegar al precio. La extracción incluye descripción y notas por etapas; un bloque de aviso de reposición no se toma como prueba de stock vigente.

- **Qué hace especialmente bien — valoración:** convierte el descubrimiento de marcas en una experiencia visual de curaduría.
- **Idea aprovechable:** directorio de marcas fácil de recorrer y un único módulo editorial de marca, con relación clara al catálogo.
- **Qué no copiar:** acumulación de campañas, newsletter emergente, logotipo clásico o textos incrustados en fotografías. Tampoco su política de muestras.
- **Combinación propuesta:** criterio alfabético de Aedes con la orientación por atributos de Jovoy, dentro de una navegación mucho más breve.

**Pendiente de comprobación:** hover, resultados de búsqueda, existencia y comportamiento de wishlist y carrito con productos.

## 4. D.S. & Durga

**Observado.** Header compacto, titulares sans de gran tamaño y fotografía/video de campaña. Utiliza una superficie cálida; el peso visual depende del producto y la tipografía. El hero expone un control de pausa. En móvil se observó un buscador lateral con sugerencias previas a escribir. Apareció un modal de captación, también al pasar a la vista móvil. El footer organiza contenidos en grupos desplegables en móvil. Fuente: [portada de D.S. & Durga](https://www.dsanddurga.com/).

En el [catálogo](https://www.dsanddurga.com/collections/perfume-all), el hover de una tarjeta mostró opciones de **ml con su precio**, mientras la información base indicaba que existían más tamaños. También se observaron una entrada de ordenar/filtrar y navegación por familias. La [ficha I Don't Know What](https://www.dsanddurga.com/products/i-dont-know-what) incluye galería, concentración, descripción breve, intensidad y notas separadas por etapas.

- **Qué hace especialmente bien — valoración:** distingue una marca editorial sin ocultar las opciones de compra.
- **Idea aprovechable:** avisar de múltiples presentaciones y mostrar el precio asociado a cada una.
- **Qué no copiar:** identidad gráfica, base crema dominante, navegación monomarca, captación emergente ni funciones disponibles solamente por hover.
- **Combinación propuesta:** claridad de variantes de D.S. & Durga con el dominio multimarca de Jovoy; galería más corta y blanca para Aroma Infini.

**Pendiente de comprobación:** teclado completo, resultados/no resultados de búsqueda y carrito con productos. Se inició el hover del menú; la captura posterior no terminó, por lo que no se declara validado su despliegue visual.

## 5. Vilhelm Parfumerie

**Observado.** Hero muy inmersivo, con producto y escena ocupando gran parte de la pantalla. Header sobre fotografía en la portada; navegación por perfumes, descubrimiento y marca. El menú expuesto al lector separa fragancias, familias y formatos. En móvil el encuadre del hero se recompone en vertical y el texto continúa debajo. El footer incluye enlaces institucionales y redes. Fuente: [portada de Vilhelm](https://vilhelmparfumerie.com/).

La [colección general](https://vilhelmparfumerie.com/collections/all) permite explorar el surtido, aunque el lector no permitió confirmar sus controles de ordenación. En la [ficha Dear Lord](https://vilhelmparfumerie.com/collections/home-page/products/dear-lord) se observaron en móvil una imagen principal, miniaturas y opciones de tamaño ilustradas. La presentación visual exige bastante espacio antes del bloque transaccional.

- **Qué hace especialmente bien — valoración:** mantiene una identidad consistente entre producto, campaña y relato de marca.
- **Idea aprovechable:** encuadres preparados para móvil y escritorio, con una fotografía editorial puntual que dé ritmo al recorrido.
- **Qué no copiar:** paleta de sus envases, acentos amarillos/verdes como identidad de Aroma Infini, tipografía propia o hero tan alto que retrase comprar.
- **Combinación propuesta:** disciplina de fotografía de Vilhelm con la claridad comercial de D.S. & Durga y una superficie blanca constante.

**Pendiente de comprobación:** mega menú abierto, hover, resultados de búsqueda, favoritos, carrito completo y reseñas. La ausencia de un control en el texto extraído no demuestra ausencia de la función.

## 6. Twisted Lily

**Observado.** Header con búsqueda muy visible, cuenta, favoritos y carrito. Portada blanca con campañas, productos y módulos de descubrimiento; se observaron tarjetas con precios desde, reseñas y un producto agotado todavía visible. En móvil la búsqueda conserva su propia fila. Su menú abierto mostró categorías con desplegables, buscador y redes. El sitio presenta varias franjas promocionales y elementos flotantes. Fuente: [portada de Twisted Lily](https://twistedlily.com/).

En el [catálogo](https://twistedlily.com/collections/fragrance), el navegador mostró resultados, paginación, ordenación y un panel de filtros por precio, marcas, concentración, género y familia. La [ficha Ambre Latte](https://twistedlily.com/collections/new-arrivals/products/ambre-latte) distingue tamaños, cantidad, descripción y autenticidad; su texto de reserva pendiente de stock pertenece a esa referencia, no a una política aprobada para Aroma Infini.

- **Qué hace especialmente bien — valoración:** sostiene el recorrido de exploración con búsqueda, filtros y señales de disponibilidad visibles.
- **Idea aprovechable:** menú móvil jerarquizado, favoritos accesibles y estado agotado que conserva el producto.
- **Qué no copiar:** cantidad de promociones simultáneas, widgets flotantes, cinco filtros iniciales, backorders, estrellas o testimonios ajenos.
- **Combinación propuesta:** utilidad comercial de Twisted Lily con espacios y jerarquía editorial más contenidos.

**Pendiente de comprobación:** hover de producto, resultados del buscador, persistencia de favoritos y carrito completo. Las estrellas observadas no se consideran reseñas auditadas ni autorizan fabricar reseñas para una tienda nueva.

## 7. Phlur

**Observado mediante lector web, no mediante inspección visual.** La estructura de portada expone categorías, novedades, selecciones, búsquedas populares y productos sugeridos. Sus entradas de producto incluyen presentación, precio y acciones de compra, además de estados agotados. El footer separa colecciones, atención, información institucional y contenido sobre perfumería. Fuente: [portada de Phlur](https://phlur.com/).

La [colección de perfumes](https://phlur.com/collections/perfumes) fue legible, pero no se verificaron filtros interactivos. La [ficha Missing Person](https://phlur.com/products/missing-person-100ml) separa descripción, notas e ingredientes e incluye recomendaciones de otros productos. No se deducen de esta extracción el layout, el número visible de columnas, la tipografía ni las transiciones.

- **Qué hace especialmente bien — valoración del contenido:** organiza ayudas para empezar a buscar y para seguir explorando desde una ficha.
- **Idea aprovechable:** abrir el buscador con sugerencias editoriales claramente identificadas; complementar una ficha con recomendaciones relacionadas.
- **Qué no copiar:** lenguaje de marca, promociones, membresía, surtido ni una supuesta apariencia que no pudo verificarse.
- **Combinación propuesta:** estructura de sugerencias de Phlur con el patrón de búsqueda móvil observado en D.S. & Durga, sin llamar «popular» a información todavía simulada.

**Pendiente de comprobación:** toda la experiencia visual e interactiva, incluyendo hero, mega menú, hover, móvil, wishlist, carrito y animaciones.

## 8. Comparación de patrones y cobertura

Esta tabla distingue observación y propuesta. Ninguna semejanza constituye una instrucción para copiar una interfaz.

| Área solicitada | Evidencia disponible | Decisión propuesta para Aroma Infini |
| --- | --- | --- |
| Header y navegación | Cinco portadas inspeccionadas visualmente; Phlur por texto | Marca, catálogo y acciones de compra reconocibles; superficie blanca estable |
| Mega menú | Jerarquías expuestas en Jovoy, Aedes, D.S. & Durga y Vilhelm; despliegue completo no validado | Desplegable breve para catálogo/marcas; crecer solamente cuando el surtido lo justifique |
| Home y hero | Carruseles visibles en Jovoy, Aedes y Twisted Lily; multimedia en D.S. & Durga; escena inmersiva en Vilhelm | Módulo flexible, una imagen inicial y control manual si hay varias |
| Fotografía y proporciones | Frascos aislados frente a escenas editoriales en las cinco vistas | Fotografía de producto consistente; campañas con encuadre móvil independiente |
| Tipografía, jerarquía y espacio | Combinaciones distintas; alta dependencia de fotografía en Aedes/Vilhelm | Una familia sans recta y una retícula original; evitar heredar serif o paletas |
| Tarjetas y hover | Tarjetas observadas; opciones de compra reveladas al hover en D.S. & Durga | Datos críticos siempre visibles; hover complementario, accesible también al foco |
| Variantes y ficha | Seis fichas consultadas; dos revisadas visualmente en móvil | Un perfume con variantes; ml/precio/disponibilidad juntos |
| Buscador | Campo visible en tiendas multimarca; panel de sugerencias abierto en D.S. & Durga; estructura textual en Phlur | Panel desktop, pantalla móvil y ruta de resultados; sugerencias editoriales al inicio |
| Filtros y orden | Jovoy y Twisted Lily en navegador; controles de D.S. & Durga y orden de Aedes por texto | Solo marca, género y precio; ocasión como orientación editorial |
| Favoritos y carrito | Accesos visibles en Jovoy/Twisted Lily; estados vacíos expuestos en otras extracciones | Favoritos locales sin login y carrito por variante; no inferir persistencia de las referencias |
| Confianza y reseñas | Módulos institucionales/servicio; reseñas visibles en Twisted Lily | Condiciones confirmadas y futuras reseñas reales; ningún sello o volumen de ventas inventado |
| Móvil y footer | Cinco portadas móviles; menú de Twisted Lily y footer desplegable de D.S. & Durga | Navegación dedicada, pies agrupados, controles táctiles cómodos |
| Microinteracciones y animaciones | Rotación de campañas, pausa multimedia, modal, drawer y hover observados | Movimiento corto y opcional; sin reproducción agresiva ni contenido esencial oculto |

**Lo no demostrado:** que algún patrón aumente ventas, que los sitios cumplan íntegramente accesibilidad o que sus efectos sean rápidos. Estas son hipótesis de diseño que Aroma Infini deberá validar con recorridos de uso y pruebas propias.

## 9. Direcciones descartadas

- Una tienda de fondo oscuro o predominantemente crema: el blanco está confirmado.
- «Lujo» basado en dorado, serif ornamental, sombras o animación constante.
- Repetir un gran mosaico de campañas antes de permitir encontrar productos.
- Reproducir todas las funciones de una tienda consolidada: muestras, fidelización, membresías, reservas, FAQ o captación de correos no están aprobadas para esta fase.
- Presentar selecciones editoriales como ventas comprobadas o completar bloques de reseñas con contenido ficticio.
- Incorporar la estética o navegación monomarca como si Aroma Infini tuviera un único fabricante.

## 10. Dirección visual sintetizada para Aroma Infini

**PROPUESTA TEMPORAL: una perfumería editorial blanca, clara para explorar y precisa al comprar.**

La composición se construirá con fotografía protagonista, tipografía sans recta, alineaciones consistentes y pausas entre secciones. El rasgo propio será una **franja editorial de lectura**: un título breve y un descriptor olfativo alineados con la imagen. Aparecerá en hero, módulo de marca y perfil olfativo, sin convertir todas las secciones en tarjetas idénticas.

La utilidad comercial tomará prioridad cuando el visitante elija una presentación o revise el total. El blanco será constante; el acento provisional podrá ser el propio charcoal. Las fotografías aportarán variación sin convertir sus colores en una paleta secundaria rígida.

Se propone un Home con cuatro bloques principales a validar: **marcas, exploración por género, más vendidos y destacados**. Hero, contenido editorial, confianza y acceso a Nosotros acompañarán esos bloques. La arquitectura distinguirá una selección editorial de una señal de popularidad; las reseñas permanecerán vacías hasta contar con clientes reales.

La dirección combina aprendizajes de las referencias, pero sus proporciones, tokens, navegación y lenguaje se definirán para Aroma Infini. El detalle, las decisiones pendientes y el orden de implementación están en [el plan de diseño](FRONTEND_DESIGN_PLAN.md).
