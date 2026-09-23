# Aroma Infini — Entrega de Fase 8

Fecha: 20 de septiembre de 2026.

Esta fase completa **Nosotros e institucionales** sin presentar como definitivos datos comerciales, legales o de contacto que el cliente todavía no ha confirmado. Todas las vistas comparten el shell, la jerarquía tipográfica y el espaciado de las páginas interiores ya aprobadas.

## Rutas y contenido

- `/nosotros` propone una estructura editorial para origen, criterio de selección y atención. La historia definitiva permanece identificada como pendiente y usa una imagen conceptual temporal ya registrada en el proyecto.
- `/contacto` no inventa teléfono, correo, redes ni horarios y no muestra un formulario que pueda simular recepción de mensajes.
- `/envios` reúne únicamente cobertura en Perú, envío gratis desde S/450 y los plazos referenciales ya compartidos. Courier, tarifas y restricciones permanecen pendientes.
- `/devoluciones` deja preparada la secuencia de solicitud, evaluación y resolución sin convertirla en una política comercial ficticia.
- `/preguntas-frecuentes` usa controles nativos `details/summary`, operables con teclado, con respuestas breves basadas en datos confirmados.
- `/privacidad`, `/terminos` y `/libro-de-reclamaciones` son estructuras explícitamente pendientes de validación legal. El libro no recopila ni simula el envío de reclamos.

## Decisiones técnicas

- Las ocho rutas sustituyen las pantallas genéricas y se cargan de forma diferida desde `router.tsx`.
- Los estilos viven en `styles/institutional.css`; reutilizan tokens, container, serif editorial, controles y footer existentes.
- Mientras el copy sea provisional, estas rutas permanecen sin canonical y con `noindex`. La navegación puede seguir sus enlaces, pero el sitemap no las publica.
- No se añadieron dependencias, formularios sin destino, datos legales, certificaciones ni canales inventados.

## Revisión

`node scripts/capture-phase-8.mjs`, con Vite activo en el puerto 5173, genera capturas de Nosotros, Preguntas frecuentes y Privacidad en 390, 768 y 1440 px. Las mediciones quedan en `artifacts/phase-8/measurements.json`.

Las pruebas cubren las ocho rutas, jerarquía de encabezados, ausencia de datos de contacto ficticios, FAQ por teclado, imágenes, consola y overflow. La validación final del proyecto se registra junto con la Fase 9.
