# Revisión tipográfica — Aroma Infini

Fecha: 21 de septiembre de 2026

## Dirección vigente

Toda la experiencia usa **IBM Plex Sans**: tienda, navegación, catálogo, ficha,
cuenta, checkout y administración. La jerarquía se construye con escala, peso,
interlineado, longitud de línea y espacio; no con una segunda familia.

La decisión mejora la continuidad entre áreas, evita cambios de voz en un mismo
recorrido y mantiene buena legibilidad en controles, precios y textos en
español. Los titulares usan pesos ligeros y tracking contenido para conservar la
presencia premium sin sacrificar claridad.

## Implementación

- `--font-body`, `--font-display` y `--font-sans` resuelven a IBM Plex Sans.
- Se cargan localmente los pesos 300, 400, 500 y 600 mediante Fontsource.
- Newsreader se retiró de imports, dependencias y bundle.
- Botones, inputs, selects y textareas heredan la misma familia.
- Identificadores técnicos del panel también usan la fuente global.

## Comprobación

`tests/store-consistency.spec.ts` recorre Home, catálogo, producto y panel,
consulta la fuente calculada de cada elemento de texto visible y exige una sola
familia. La auditoría visual final se genera en 390, 768 y 1440 px.
