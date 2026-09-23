# Aroma Infini — revisión de experiencia del Home

Fecha: 14 de septiembre de 2026.

## Criterio aplicado

El Home conserva una base blanca y una interfaz sobria. El impacto se concentra en la fotografía, la escala tipográfica y el contraste entre secciones contenidas y campañas a todo el ancho. La secuencia responde a un recorrido de cliente: **impacto → orientación → producto → curaduría de firmas → campaña → selección editorial → confianza**.

## Lectura de las referencias

- [Jovoy](https://www.jovoyparis.com/en/): producto y marca aparecen pronto; Aroma Infini toma su claridad multimarca sin trasladar la densidad de su navegación.
- [Aedes](https://www.aedes.com/): las firmas se descubren visualmente. Se traduce en un índice fotográfico de cuatro casas, con una sola familia tipográfica y cambio de imagen por foco o puntero.
- [D.S. & Durga](https://www.dsanddurga.com/): una imagen con personalidad puede sostener un bloque completo. Se conserva esa decisión para las campañas, con una identidad más neutra y multimarca.
- [Vilhelm](https://vilhelmparfumerie.com/): escala fotográfica y encuadres de producto fuertes. Se aplica al hero y a la pausa editorial sin importar su paleta ni su identidad.
- [Twisted Lily](https://twistedlily.com/): producto, precio y acceso al catálogo permanecen claros. Se conserva esa utilidad en Más vendidos, favoritos y destacados.
- [Phlur](https://phlur.com/): el contenido organiza entradas simples y continuidad de descubrimiento. Su apariencia no se toma como evidencia porque la inspección visual en navegador quedó bloqueada por verificación de seguridad.

## Decisiones del Home

1. **Hero:** tres campañas automáticas, fundido suave, encuadres estables y progreso visible. El control accesible de pausa y selección sigue disponible por teclado.
2. **Elige por dónde empezar:** mantiene la composición aprobada y suma una etiqueta breve que explica la función del bloque.
3. **Más vendidos:** permanece sobre blanco, con las cuatro fotografías alineadas y el cambio de imagen al pasar el puntero o enfocar.
4. **Marcas:** pasa de lista estática a índice numerado. En escritorio, el foco cambia una fotografía grande; en móvil, cada firma conserva imagen y destino propios.
5. **Marca destacada:** funciona como pausa de campaña a todo el ancho, con texto breve y un único destino.
6. **Encuentro editorial:** presenta dos productos con una composición distinta al grid comercial y el titular “Dos aromas. Dos formas de dejar huella.”
7. **Entregas y atención:** cierra el recorrido en un bloque compacto y escaneable antes del footer.

## Movimiento

El carrusel usa un fundido de 700 ms y una aproximación fotográfica casi imperceptible. Las imágenes entran con una escala corta; enlaces, categorías y firmas responden con desplazamientos mínimos. Todo se desactiva con `prefers-reduced-motion`.

## Validación

La revisión automatizada cubre 360, 375, 390, 430, 768, 1024, 1280, 1440 y 1920 px. Comprueba overflow horizontal, texto recortado, imágenes, consola y recorrido de enlaces. Los resultados finales se registran con la entrega de esta iteración.
