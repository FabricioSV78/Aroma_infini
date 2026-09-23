# Entrega — fases 1 y 2

> Registro de la primera entrega. La revisión posterior del header, hero y transición se documenta en [PHASE_2_VISUAL_REVIEW.md](PHASE_2_VISUAL_REVIEW.md); sus decisiones sustituyen únicamente esos apartados visuales. La Fase 2 continúa pendiente de aprobación.

Fecha de entrega: 13 de septiembre de 2026. Alcance: base mínima, header, navegación y Home. Implementación basada en `FRONTEND_DESIGN_PLAN.md` y `REFERENCE_AUDIT.md`, aprobados expresamente por el cliente. Las decisiones temporales no pasan a definitivas con esta entrega.

## 1. Implementado

React, TypeScript estricto, Vite, Tailwind CSS 4 y React Router. Tokens, estilos globales y fuente IBM Plex Sans servida localmente. Componentes usados: Button, IconButton, Icon, SectionHeading y Dialog. No se creó un NavigationLink adicional porque Link de React Router ya resuelve los accesos de esta etapa.

StoreLayout compone header, contenido, footer y acceso de atención. Announcement con los datos de envío confirmados. Header fijo sobre blanco, dos filas en escritorio y menú modal en móvil; búsqueda inicial, favoritos, cuenta y carrito como accesos visuales. Menú y diálogos con Escape, ciclo de Tab/Shift+Tab y devolución del foco. En cambios de ruta se actualizan título, posición y foco del contenido.

Home contiene los nueve módulos de contenido acordados, más footer: hero manual de dos diapositivas, marcas, categorías por género, más vendidos, editorial de marca, destacados, confianza, reseñas vacías y Nosotros. El orden se modifica en una lista de identificadores; las secciones son componentes independientes.

Tipos mínimos Product, ProductVariant y Brand. Cuatro marcas y cuatro productos conceptuales permiten mostrar tamaños, precio desde y agotado. HomeService es el único contrato/servicio: devuelve los datos de la Home desde fixtures locales. Sin servicios, hooks, carpetas vacías ni SDK de fases futuras.

Los enlaces futuros conducen a una vista informativa común. Buscar permite escribir/enviar una consulta y verla reflejada; no busca en un catálogo. No se implementaron catálogo, ficha completa, favoritos funcionales, carrito, checkout, cuenta, administración, autenticación, pagos ni backend.

## 2. Árbol de archivos creados

Se omiten las dependencias instaladas y los archivos generados dentro de `dist/` y `artifacts/`. Los documentos de auditoría y plan ya existían; se actualizó el estado del plan para registrar la aprobación limitada.

```text
Eccomerce/
├── .gitignore
├── .prettierrc.json
├── README.md
├── index.html
├── package.json
├── package-lock.json
├── eslint.config.js
├── playwright.config.ts
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── docs/
│   ├── ASSETS.md
│   └── PHASE_1_2_DELIVERY.md
├── public/
│   ├── favicon.svg
│   └── images/
│       ├── hero-480.webp
│       ├── hero-960.webp
│       ├── hero-1536.webp
│       ├── cedre-480.webp
│       ├── cedre-960.webp
│       ├── petale-480.webp
│       ├── petale-960.webp
│       ├── sillage-480.webp
│       ├── sillage-960.webp
│       ├── sillage-1536.webp
│       ├── ambre-480.webp
│       └── ambre-960.webp
├── scripts/
│   └── prepare-images.mjs
├── src/
│   ├── main.tsx
│   ├── app/router.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── StoreLayout.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── IconButton.tsx
│   │       ├── Icon.tsx
│   │       ├── SectionHeading.tsx
│   │       └── Dialog.tsx
│   ├── content/
│   │   ├── home.ts
│   │   └── navigation.ts
│   ├── features/home/
│   │   ├── HomePage.tsx
│   │   ├── HomeSections.tsx
│   │   ├── Hero.tsx
│   │   └── ProductCard.tsx
│   ├── mocks/home.ts
│   ├── pages/PendingPage.tsx
│   ├── services/home-service.ts
│   ├── styles/
│   │   ├── tokens.css
│   │   └── global.css
│   └── types/catalog.ts
└── tests/home.spec.ts
```

## 3. Decisiones visuales

Blanco dominante, tinta #202020, secundarios #5C5C5C, líneas #DEDEDA y superficies #F6F6F4. La calidez procede de la fotografía, no de controles dorados. IBM Plex Sans con titulares ligeros y composición asimétrica; controles rectos, sin sombras decorativas, gradientes ni esquinas redondeadas en las imágenes.

Hero con lectura sobre blanco y fotografía independiente: aproximadamente 42/58 en escritorio; imagen primero en móvil. Los controles son manuales y no existe rotación automática. Los pies de imagen y líneas finas funcionan como recurso editorial común. Las fotos de producto siguen proporción 4:5, con tamaños y precios próximos entre sí.

Contenedor máximo de 1320 px y hero de hasta 1440 px. Dos productos por fila en móvil y cuatro en escritorio. Categorías apiladas en móvil y en tres columnas desde tablet. Header sin cambios de altura al desplazarse; el anuncio no queda fijo. Se reservó espacio junto a los controles del hero móvil para el acceso flotante de atención.

## 4. Decisiones temporales

- Orden y prominencia de los módulos, tipografía, wordmark tipográfico, favicon y paleta de superficies.
- Todos los textos editoriales nuevos; se indican como propuesta tanto al inicio como al final de la página.
- Marcas, productos, familias olfativas, precios, variantes y stock de muestra. “Más vendidos” se etiqueta como selección simulada, sin afirmar ventas reales.
- Cinco imágenes originales generadas para esta propuesta; no se descargaron imágenes de las referencias. Prompts exactos, archivos y transformación a WebP en [ASSETS.md](ASSETS.md). Los originales permanecen intactos.
- Redes sociales y número de WhatsApp pendientes. El acceso de atención informa de ello; no hay números ni enlaces externos inventados.
- Se muestran únicamente los hechos de envío aportados: cobertura Perú, gratuidad desde S/ 450, Lima/Callao hasta 48 horas y provincias hasta 5 días.
- Reseñas vacías: ningún testimonio, estrella, métrica o certificación inventados.

## 5. Ajustes respecto al plan y justificación

| Ajuste | Motivo |
| --- | --- |
| Arquitectura limitada a HomeService y tres tipos | Instrucción explícita posterior: YAGNI y solo fases 1–2. La estructura futura del plan se conserva como dirección. |
| Header de escritorio desde 768 px, no desde la propuesta de 1280 px | Los seis enlaces caben con sus áreas de interacción en tablet; verificado a 768 y 1024. Permite acceder directamente a las categorías. Sigue sujeto a revisión visual. |
| Footer con grupos visibles también en móvil | La cantidad actual de enlaces es pequeña; evita ocultar destinos tras aperturas adicionales. No se implementó todavía el acordeón propuesto. |
| Navegación por enlaces directos, sin desplegable de marcas o megamenú | Cuatro marcas de muestra y seis entradas no justifican aún esa interacción. Las marcas ya se exploran desde su módulo de Home. |
| Diálogo HTML nativo con control de los extremos de Tab | Resuelve las tres superficies actuales sin añadir una biblioteca general de UI. Se comprobó Escape, foco contenido y retorno. |
| Destinos futuros agrupados en PendingPage | Permite revisar enlaces y navegación sin empezar a implementar catálogo, cuenta, ficha, carrito o contenido legal. |
| Hero solo con imágenes y dos diapositivas manuales | No hay video autorizado; no se crea anticipadamente su reproductor. El contenido de slides se mantiene separado. |
| Reutilización del bodegón en el editorial y de productos en categorías | Mantiene coherencia y evita producir una colección ficticia mayor. Se documenta la reutilización; los assets finales podrán sustituirse por sección. |
| CSS de componentes para la composición y Tailwind para utilidades | Se conserva el stack solicitado con tokens legibles y estilos localizables, sin una dependencia de componentes prefabricados. |

## 6. Validación

| Comprobación | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Correcto, sin errores |
| `npm.cmd run lint` | Correcto, cero warnings permitidos |
| `npm.cmd run build` | Correcto, sin warnings de compilación |
| `npm.cmd run test:e2e` | 11 pruebas correctas en Chrome local |
| Responsive | 360, 375, 390, 430, 768, 1024, 1280 y 1440 px: sin overflow horizontal al recorrer cada módulo |
| Imágenes | Todas cargan; todas declaran dimensiones; tarjetas/hero reservan proporciones; imágenes secundarias con carga diferida |
| CLS observado | Menor de 0,002 en cada ancho durante la comprobación local; no equivale a medición de campo ni auditoría de rendimiento en producción |
| Teclado | Skip link, menú, recorrido de Tab, Escape, devolución de foco y foco tras navegación comprobados |
| Movimiento reducido | Emulación real de `prefers-reduced-motion: reduce`: scroll inmediato y transiciones prácticamente anuladas |
| Interacciones | Slides, consulta de búsqueda, destinos informativos, recarga de ruta y diálogo de contacto comprobados |
| Consola | Sin errores ni warnings de aplicación en los ocho recorridos |
| Versión compilada | Home y acceso directo a `/carrito` comprobados con Vite preview en el puerto 4173; sin errores ni warnings |

La revisión visual incluyó capturas completas de móvil y escritorio y detalle de tablet, cabecera móvil y menú. Se corrigieron un favicon ausente, el ciclo de foco del diálogo y el espacio junto a los controles móviles. El aviso inicial por ESLint 9 se resolvió actualizando a ESLint 10; el aviso de colores del ejecutor se eliminó quitando `NO_COLOR` solo en la sesión de pruebas. No hay cambios globales en la configuración del equipo.

Las pruebas se ejecutaron en Chrome de escritorio con viewport y preferencias emulados. No se presenta esta revisión como certificación WCAG, prueba con lector de pantalla o validación en Safari/iOS físico. No se ha desplegado la aplicación ni medido Core Web Vitals de usuarios reales.

## 7. Evaluación visual solicitada

1. Peso del hero: tamaño del titular, proporción foto/texto y altura en móvil.
2. Personalidad de la tipografía y wordmark; sensación de marca propia y de perfumería multimarca.
3. Orden de categorías, más vendidos, editorial y destacados; cantidad de aire entre módulos.
4. Tamaño de las fotos y legibilidad de marca, nombre, precio y ml en las tarjetas móviles.
5. Header fijo y navegación desde tablet; footer abierto frente al acordeón inicialmente propuesto.
6. Dirección de fotografía conceptual como guía para producir o seleccionar los assets finales.

**Punto de parada:** fases 1 y 2 entregadas para revisión. No se avanza a fase 3 sin aprobación del cliente.
