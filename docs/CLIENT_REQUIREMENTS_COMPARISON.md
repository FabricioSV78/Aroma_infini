# Comparación del sistema con el cuestionario del cliente

Fecha de revisión: 22 de septiembre de 2026.

Fuente contrastada: `Cuestionario_Diseno_Ecommerce_Perfumeria (1).docx`. Las
respuestas del documento se trataron como requisitos y preferencias del cliente,
no como instrucciones para ejecutar cambios sin validar datos comerciales.

## Alcance de la respuesta

El proyecto actual cubre gran parte de la experiencia y de las reglas como un
**frontend de demostración conectado a un estado en memoria**. Esto permite
recorrer tienda, carrito, checkout, cuenta y panel y comprobar cómo un cambio
administrativo se refleja durante la misma sesión. No equivale todavía a una
tienda operativa: autenticación, base de datos, persistencia, Mercado Pago real,
webhooks, correos y seguridad de servidor siguen pendientes.

Estados usados:

- **Cumple:** la capacidad está implementada en la demostración actual.
- **Cumple como demo:** el flujo existe, pero necesita backend o datos reales para
  operar en producción.
- **Parcial:** solo una parte está resuelta o falta una regla confirmada.
- **Pendiente de contenido:** implementarlo ahora obligaría a inventar información.
- **Revisar con el cliente:** existe una contradicción o el requisito no está cerrado.

El cuestionario no contiene una pregunta 17; la numeración salta de 16 a 18.

## 1. Marca e identidad visual

| N.º | Decisión del cliente                | Estado actual         | Evidencia y decisión                                                                                                                                |
| --- | ----------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Nombre exacto: Aroma Infini         | Cumple                | Metadata y textos institucionales usan “Aroma Infini”. El wordmark visual en minúsculas es un tratamiento tipográfico provisional.                  |
| 2   | Confianza, exclusividad y novedad   | Cumple                | La jerarquía, el producto visible, la información logística y el lenguaje visual siguen esa dirección.                                              |
| 3   | Exclusiva, moderna y minimalista    | Cumple                | Interfaz clara, contenida y sin efectos decorativos ajenos a la marca.                                                                              |
| 4   | Blanco como color dominante         | Cumple                | Es la superficie principal de la tienda.                                                                                                            |
| 5   | Evitar colores que resten pulcritud | Cumple                | La tienda usa una paleta neutra; los colores funcionales se concentran en el panel.                                                                 |
| 6   | Estética clara y limpia             | Cumple                | Aplicada de forma transversal.                                                                                                                      |
| 7   | Logo en desarrollo                  | Parcial deliberado    | Se conserva un wordmark textual accesible. Debe sustituirse cuando exista el activo definitivo; no se inventó un logo.                              |
| 8   | Fuente recta, no circular u ovalada | Cumple                | Toda la web usa IBM Plex Sans mediante tokens compartidos.                                                                                          |
| 9   | Hombres y mujeres NSE B/B+          | Cumple como dirección | La navegación incluye hombre, mujer y unisex y mantiene lectura premium. La segmentación comercial real corresponde a contenido y campañas futuras. |
| 10  | Comunicar confianza y variedad      | Cumple                | Marcas, categorías, catálogo, variantes y soporte de entrega construyen esa percepción sin afirmaciones falsas.                                     |

## 2. Página de inicio

| N.º | Decisión del cliente                          | Estado actual            | Evidencia y decisión                                                                                                                                                  |
| --- | --------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | Carrusel con transiciones suaves o multimedia | Cumple                   | Hero de tres campañas, rotación automática suave, indicador, anuncios accesibles y movimiento reducido.                                                               |
| 12  | Destacar marcas, más vendidos y categorías    | Cumple                   | Los tres módulos están presentes y enlazan al catálogo filtrado.                                                                                                      |
| 13  | Destacados editables desde el panel           | Cumple como demo         | El panel permite definir y ordenar destacados; el Home consume ese orden en la misma sesión.                                                                          |
| 14  | Marcas destacadas en el Home                  | Cumple                   | Galería editorial de marcas y enlace a cada filtro de catálogo.                                                                                                       |
| 15  | Reseñas cuando existan clientes reales        | Cumple como vista previa | La ficha muestra tres ejemplos claramente rotulados como ficticios para aprobar el diseño. La publicación real sigue condicionada a compras verificadas y moderación. |
| 16  | Cuatro elementos indispensables               | Revisar con el cliente   | La respuesta sigue “En desarrollo”; no existe una decisión que implementar.                                                                                           |

## 3. Catálogo y organización

| N.º | Decisión del cliente                                   | Estado actual            | Evidencia y decisión                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | Marca → género → precio → ocasión                      | Parcial / contradictorio | Marca, género y precio sí filtran. Ocasión se muestra en la ficha, pero las respuestas 35 y 36 limitan después los filtros a género, precio y marca. Se conserva la decisión posterior más específica.                                                                                 |
| 19  | Menú: marca, más vendidos, para él, para ella y unisex | Cumple                   | Está distribuido entre Perfumes y Marcas para evitar saturar el navbar.                                                                                                                                                                                                                |
| 20  | Separar hombre, mujer y unisex                         | Cumple                   | Categorías y parámetros de catálogo tipados.                                                                                                                                                                                                                                           |
| 21  | Varias presentaciones por perfume                      | Cumple                   | Cada producto admite variantes en ml.                                                                                                                                                                                                                                                  |
| 22  | Precio y stock por presentación                        | Cumple                   | Modelo, panel, carrito y checkout trabajan por `variantId`.                                                                                                                                                                                                                            |
| 23  | Mantener agotados visibles con “Agotado”               | Cumple                   | Tarjeta, selector de presentación y CTA comunican el agotado.                                                                                                                                                                                                                          |
| 24  | Etiquetas comerciales y aviso de popularidad           | Cumple como vista previa | El Home permite recorrer ejemplos de popularidad, novedad y stock bajo. Cada ficha disponible muestra además cómo se vería “Entre los más vendidos”. Los avisos aparecen una sola vez por sesión y se rotulan como ejemplo; la versión real deberá alimentarse con datos verificables. |
| 25  | Ordenar por precio, novedades y popularidad            | Cumple como demo         | Existen menor/mayor precio, novedades y más vendidos; novedades y popularidad son criterios ilustrativos hasta conectar ventas reales.                                                                                                                                                 |

## 4. Ficha de producto

| N.º | Decisión del cliente                                               | Estado actual                          | Evidencia y decisión                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26  | Ml, descripción y tipo de perfume                                  | Cumple                                 | Se muestran en la zona de compra y en las pestañas informativas.                                                                                                                                                                                |
| 27  | Aproximadamente cuatro fotografías                                 | Cumple                                 | Cada fixture actual contiene cuatro vistas con galería accesible.                                                                                                                                                                               |
| 28  | Marca, presentación, precio, disponibilidad y descripción próximos | Cumple                                 | El primer bloque reúne toda esa información. “Disponible” no se repite visualmente por decisión aprobada; el CTA habilitado lo comunica y el estado agotado sí se explicita.                                                                    |
| 29  | Notas de salida, corazón y fondo                                   | Cumple                                 | Forman parte del perfil olfativo y su evolución.                                                                                                                                                                                                |
| 30  | Familia, intensidad, ocasión y temporada                           | Cumple                                 | Perfil olfativo dedicado.                                                                                                                                                                                                                       |
| 31  | Recomendaciones / también compraron                                | Cumple parcialmente como recomendación | Existe “También te puede gustar”. No se afirma “clientes también compraron” porque no hay historial real.                                                                                                                                       |
| 32  | Favoritos                                                          | Cumple como demo                       | Se pueden alternar y revisar localmente; la sincronización con una cuenta requiere backend.                                                                                                                                                     |
| 33  | Autenticidad u originalidad                                        | Pendiente de contenido                 | Falta el texto y la documentación aprobada. No se añadió una promesa comercial sin evidencia.                                                                                                                                                   |
| 34  | No incluir FAQ de producto ni FAQ general                          | No coincide con una parte actual       | No hay FAQ dentro de la ficha, pero sí existe una ruta general de preguntas frecuentes en soporte. Se informa para decidir su retiro; no se modificó porque el usuario pidió no tocar los elementos que no correspondan sin exponerlos primero. |

## 5. Búsqueda y filtros

| N.º | Decisión del cliente                 | Estado actual | Evidencia y decisión                                                               |
| --- | ------------------------------------ | ------------- | ---------------------------------------------------------------------------------- |
| 35  | Filtros por género, precio y marca   | Cumple        | Panel lateral en escritorio y adaptación móvil.                                    |
| 36  | Mantener solo género, precio y marca | Cumple        | No se añadieron filtros innecesarios.                                              |
| 37  | Buscar por nombre del perfume        | Cumple        | El buscador encuentra por nombre; también admite marca, una ampliación compatible. |

## 6. Carrito y compra

| N.º | Decisión del cliente                                                     | Estado actual    | Evidencia y decisión                                                                                                                         |
| --- | ------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 38  | Productos, cantidades, subtotal, envío, descuento y total antes de pagar | Cumple como demo | Carrito muestra selección y subtotal; checkout calcula zona, promoción, descuento y total definitivo antes de la simulación de Mercado Pago. |

## 7. Cuenta del cliente

| N.º | Decisión del cliente                   | Estado actual    | Evidencia y decisión                                                                                                                                                         |
| --- | -------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 39  | Cuenta, historial, pagos y direcciones | Cumple como demo | Existen las cuatro áreas. “Datos de pago” se interpreta como referencias y método gestionado por Mercado Pago; nunca se deben almacenar tarjetas completas en la aplicación. |
| 40  | Historial de pedidos                   | Cumple como demo | Lista y detalle de pedidos de prueba.                                                                                                                                        |
| 41  | Estado de pedidos actuales             | Cumple como demo | Línea de estado y seguimiento por código.                                                                                                                                    |
| 42  | Favoritos                              | Cumple como demo | Área de favoritos conectada al estado local.                                                                                                                                 |

## 8. Envíos y entregas

| N.º | Decisión del cliente                            | Estado actual                       | Evidencia y decisión                                                                                                                                                                                             |
| --- | ----------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 43  | Cobertura nacional                              | Parcial controlado                  | El checkout y la cuenta contienen los 25 departamentos, 196 provincias y 1,891 distritos del ubigeo oficial INEI. Solo se cotizan las coberturas activadas en el panel; no se promete entrega sin convenio real. |
| 44  | Precio según zona                               | Cumple                              | La cotización resuelve la regla activa más específica entre departamento, provincia y distrito.                                                                                                                  |
| 45  | Precio definido por courier                     | Cumple como configuración           | El panel administra la tarifa; el valor real debe proceder del courier contratado.                                                                                                                               |
| 46  | Envío gratis desde un mínimo                    | Cumple                              | Regla compartida entre tienda y panel.                                                                                                                                                                           |
| 47  | Mínimo S/ 450                                   | Cumple                              | Valor inicial de S/ 450.                                                                                                                                                                                         |
| 48  | Tarifas y mínimo editables desde panel          | Cumple tras esta revisión           | Ahora se pueden agregar, editar, activar y retirar zonas, además de modificar tarifas y umbral.                                                                                                                  |
| 49  | Motorizado / courier                            | Cumple                              | Ambas modalidades están modeladas; motorizado puede deshabilitarse por zona.                                                                                                                                     |
| 50  | Lima/Callao hasta 48 h; provincias hasta 5 días | Cumple en los ejemplos configurados | Los plazos son editables por zona.                                                                                                                                                                               |
| 51  | Zonas excluidas por confirmar                   | Revisar con el cliente              | No existe una lista aprobada. Las zonas inactivas no aparecen en checkout, lo que permite aplicar la decisión cuando exista.                                                                                     |
| 52  | Solo delivery                                   | Cumple                              | No se ofrece recojo.                                                                                                                                                                                             |
| 53  | Envíos fuera de Lima                            | Parcial                             | La capacidad ya existe y Arequipa sirve de ejemplo; falta configurar tarifas reales para el resto del país.                                                                                                      |

### Mejora incorporada en esta revisión

El panel de envíos ya no queda atado a tres filas fijas. Permite configurar
cobertura por departamento, provincia o distrito sobre el ubigeo oficial del
Perú; cambiar el nombre visible; definir courier, motorizado y plazo; activar o
retirar la regla. Una zona nueva nace inactiva para no publicar accidentalmente
una tarifa no confirmada. El servicio impide IDs o coberturas duplicadas y
rechaza ubicaciones, nombres, tarifas o plazos inválidos.

## 9. Promociones y descuentos

| N.º | Decisión del cliente          | Estado actual    | Evidencia y decisión                           |
| --- | ----------------------------- | ---------------- | ---------------------------------------------- |
| 54  | Códigos de descuento          | Cumple como demo | Creación, validación y aplicación en checkout. |
| 55  | Inicio y vencimiento          | Cumple           | Controles de fecha y validación de rango.      |
| 56  | Límite de usos                | Cumple           | Límite opcional y contador.                    |
| 57  | Activar/desactivar sin borrar | Cumple           | Acción disponible en el panel.                 |

## 10. Confianza, atención e institucionales

| N.º | Decisión del cliente               | Estado actual                   | Evidencia y decisión                                                                                                                                     |
| --- | ---------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 58  | Reseñas / valoraciones             | Cumple como vista previa visual | Se presenta una muestra ficticia y explícitamente identificada. La activación comercial requiere clientes reales, asociación a compras y moderación.     |
| 59  | Página Nosotros                    | Cumple                          | Página institucional y acceso desde navegación/footer.                                                                                                   |
| 60  | WhatsApp visible y redes en footer | Parcial deliberado              | Existe un acceso de atención visible, pero no enlaza a WhatsApp; tampoco hay redes inventadas. Faltan número, horario, mensaje inicial y URLs oficiales. |

## Elementos que no conviene añadir todavía

1. **Publicar pop-ups de popularidad o urgencia como datos reales.** La vista
   previa actual se identifica como ejemplo y se limita a una aparición por
   sesión. Producción debe depender de ventas, catálogo o inventario verificados.
2. **Badges comerciales inventados.** “Oferta” necesita precio anterior y
   vigencia; “Más vendido” necesita ventas; “Exclusivo” requiere acuerdo
   comercial; “Últimas unidades” debe proceder del stock por variante.
3. **Texto o sellos de originalidad.** Se necesita definir procedencia,
   documentación y alcance legal de la promesa.
4. **Presentar reseñas ficticias como reales.** Los ejemplos actuales solo sirven
   para aprobar composición y lectura; no alimentan SEO ni datos estructurados.
5. **Cobertura nacional automática.** La capacidad administrativa ya está, pero
   cada zona debe activarse solo con tarifa y plazo confirmados por el courier.
6. **WhatsApp y redes con destinos temporales.** Se necesitan enlaces oficiales.
7. **Filtro de ocasión.** Contradice la selección posterior y explícita de solo
   género, precio y marca; requiere confirmación antes de ampliar el catálogo.

## Decisiones que debe cerrar el cliente

- Logo definitivo y reglas de uso.
- Los cuatro elementos indispensables del Home de la pregunta 16.
- Si se elimina la FAQ general para respetar literalmente la pregunta 34.
- Evidencia y texto aprobado sobre originalidad.
- Qué etiquetas comerciales existirán, quién las administra y qué dato las
  habilita.
- Tarifas, cobertura, exclusiones y plazos reales del operador logístico.
- Número, horario y mensaje de WhatsApp; URLs oficiales de redes.
- Política, origen y moderación de reseñas reales.

## Conclusión

El sistema está relacionado con el cuestionario y su arquitectura cubre el
recorrido principal solicitado. La mayor parte de las diferencias no son fallos
de interfaz: son datos comerciales, contenido legal o integraciones reales que
todavía no han sido entregados. La única carencia funcional cerrada y segura de
resolver en esta revisión —administrar nuevas zonas de envío— quedó incorporada
sin prometer cobertura inexistente.

## Validación

- `npm run typecheck`: correcto.
- `npm run lint`: correcto, sin warnings.
- `npm run build`: correcto.
- `npm run test:e2e`: los 173 casos finalizaron correctamente, incluidos los
  recorridos de tienda, checkout, administración de zonas y responsive de 360 a
  1440 px. En Windows el proceso auxiliar de Vite permaneció abierto después de
  imprimir todos los resultados y se cerró manualmente; el puerto 5173 quedó
  libre.
