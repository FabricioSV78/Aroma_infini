# Auditoría de medios — 23 de octubre de 2026

## Alcance y evidencia

Se inventariaron todos los archivos de `public`, sus bytes y hash SHA-256. Las imágenes se decodificaron con Sharp para verificar dimensiones, formato y duplicados de píxeles. Se buscaron referencias en `src`, `scripts`, `tests`, `docs`, `worker`, HTML y configuración de la raíz. También se expandieron las rutas construidas desde las campañas, categorías y galerías actuales.

No se considera que un archivo esté abandonado solo porque no aparezca una URL literal: existen claves de imagen, variantes por ancho, documentación histórica, fixtures y datos que el administrador puede haber guardado localmente.

Evidencias reproducibles:

- `artifacts/technical-audit/2026-10-23/analyze-assets.mjs`.
- `artifacts/technical-audit/2026-10-23/asset-audit-before-thumbnails.json`: inventario antes de añadir miniaturas.
- `artifacts/technical-audit/2026-10-23/asset-audit.json`: inventario con miniaturas.

## Inventario

| Medida                         |        Antes |      Después |
| ------------------------------ | -----------: | -----------: |
| Archivos públicos              |          161 |          171 |
| Peso público total             | 19 366 773 B | 19 676 327 B |
| Imágenes, incluidos SVG        |          140 |          150 |
| Peso de imágenes               |  9 269 200 B |  9 578 754 B |
| Vídeos                         |  9 836 543 B |  Sin cambios |
| Fuentes WOFF2 públicas         |    225 804 B |  Sin cambios |
| Duplicados por bytes o píxeles |            0 |            0 |

Los derivados aumentan el almacenamiento estático en 309 554 B para reducir la descarga de fotografías pequeñas. El navegador elige una variante, no todas. No se borró ni se recomprimió ningún original.

La comprobación actual encontró **39 rutas literales y 106 rutas de variantes dinámicas válidas**, sin archivos faltantes. El análisis conservador incluye rutas históricas cuando siguen documentadas.

## Optimización aplicada al recomendador

Los círculos de familias del Home miden 36, 40 o 48 píxeles CSS, pero antes descargaban fotografías de 960 × 1200. Esas mismas fotografías ilustran opciones mayores en el cuestionario y el perfil olfativo del producto.

Se generaron variantes de 160 × 200 y 320 × 400 para las cinco fotografías utilizadas por el recomendador. El proceso conserva toda la composición, emplea WebP con calidad 92 y no modifica el encuadre. El recorte sigue siendo responsabilidad del CSS existente.

| Fotografía |      Original |       160 px |        320 px |
| ---------- | ------------: | -----------: | ------------: |
| Ámbar      |     198 806 B |     15 542 B |      53 180 B |
| Amaderada  |     188 658 B |     15 522 B |      52 756 B |
| Cítrica    |     125 870 B |     13 708 B |      41 412 B |
| Floral     |      96 080 B |     11 050 B |      34 818 B |
| Verde      |     194 188 B |     15 854 B |      55 712 B |
| **Total**  | **803 602 B** | **71 676 B** | **237 878 B** |

Las variantes de 160 px reducen el peso conjunto en **91,08 %**; las de 320 px, en **70,40 %**, respecto de esos originales. Estas cifras describen las imágenes concretas, no el rendimiento total del sitio.

En las cuatro familias iniciales del Home, las miniaturas de 160 px suman 56 134 B frente a 604 796 B de sus originales. Como la escena principal también utiliza la fotografía amaderada y puede compartir su caché, la reducción neta conservadora de ese conjunto más la escena es 360 004 B, aproximadamente 59,52 %, al seleccionar miniaturas de 160 px. Las mediciones reales dependen del DPR, caché y opciones configuradas.

El Home declara tamaños de 36/40/48 px, suficientes con 160 px incluso a DPR 3. El cuestionario conserva además el candidato original de 960 px: sus tarjetas pueden superar 320 píxeles en tablet y necesitan mayor resolución en pantallas densas. No se fuerza una miniatura pequeña en fotografías grandes.

El manifiesto `src/content/image-variants.ts` centraliza las variantes disponibles. Solo reconoce las rutas locales exactas registradas; imágenes cargadas por el administrador, URLs remotas y otras fotografías conservan su comportamiento. La ficha olfativa, el catálogo y la galería no cambiaron.

Regeneración:

```powershell
node scripts/prepare-finder-thumbnails.mjs
```

El script toma las fotografías locales de la configuración vigente del recomendador, verifica los destinos para impedir sobrescribir originales, impide ampliarlos, comprueba su SHA-256 y genera el manifiesto. No accede a servicios externos.

## Recursos conservados y decisiones

- **Fotografías históricas:** las variantes antiguas de `hero`, `hero-v2-silence`, `featured-duo-v3` y `brand-ambre-editorial` conservan referencias de documentación, generación o posibles claves guardadas. No existe una eliminación de imagen completamente justificada con la evidencia disponible; se mantienen.
- **Imagen social de Marcas:** `featured-duo-v3-1536.webp` sigue en la configuración SEO. Su nombre incluye 1536, pero el archivo tiene 1448 × 1086 píxeles nativos. Esta diferencia ya está documentada; renombrarla rompería la URL social existente y no mejora su descarga.
- **Fotografía de Complementos:** aunque la función esté oculta, sus imágenes pueden utilizarse al activarla desde el panel. La ilustración provisional también es una fixture de pruebas y se conserva.
- **Fuentes:** las familias alternativas pertenecen a la selección tipográfica existente del panel. No se borran por no ser la opción predeterminada. Las licencias acompañan a las fuentes y se conservan.
- **Logo sobre fondo oscuro:** es una salida oficial del script que extrae el logotipo del manual del cliente. Se conserva aunque el layout actual utilice el logo sobre fondo claro.
- **Vídeos:** representan aproximadamente la mitad de los bytes públicos. El componente ya utiliza `preload="none"`, carga al entrar en pantalla y respeta visibilidad, movimiento reducido y ahorro de datos. No se vuelve a codificar sin validar perceptualmente un resultado equivalente.
- **Documentación dentro de `public`:** las notas de fotografía y vídeo suman 5146 B y conservan procedencia y condiciones de uso. Retirarlas aporta un ahorro de almacenamiento mínimo y exigiría actualizar enlaces y fixtures; no se eliminaron.

## Oportunidades adicionales sin cambiar la presentación

1. **Rutas de hero y vista previa:** `Hero.tsx` y `AdminHomePage.tsx` construyen los mismos nombres por campaña, orientación y ancho. Un único resolvedor evita divergencias al usar un CDN o R2, manteniendo todas las URLs predeterminadas actuales.
2. **`sizes` de categorías:** la composición de tres categorías es un mosaico distinto según altura y ancho de pantalla. La regla común de 760 px / 55vw / 100vw puede sobreestimar las imágenes pequeñas o subestimar la mayor. Debe medirse cada celda en los breakpoints reales antes de tocarla; sustituirla por una proporción global también sería incorrecto.
3. **Originales futuros:** algunos scripts históricos permiten ampliar una fuente por encima de su resolución nativa. Las futuras preparaciones deberían evitar ampliaciones y declarar anchos reales, sin regenerar automáticamente las imágenes ya aprobadas.

## Preparación para R2

Las rutas públicas forman una sola colección de activos estáticos, copiada a `dist` por el build. Esa copia de salida no es una duplicación de fuentes que deba eliminarse. No hay duplicados por contenido dentro de la colección auditada.

Para una futura migración, conviene conservar claves relativas estables (`images/...`, `videos/...`, `brand/...`) y resolver el origen en una frontera común. El manifiesto de variantes guarda rutas relativas al sitio y sus anchos reales; no almacena un dominio ni incorpora credenciales. Las imágenes `data:` y las URLs remotas ya válidas deben permanecer intactas. Esta auditoría no conectó R2, Supabase ni otro almacenamiento externo.

## Límites de validación de esta revisión

La auditoría de archivos y los hashes prueban integridad y referencias estáticas, no sustituyen una revisión visual. Las capturas y los flujos funcionales se coordinan desde la auditoría principal para evitar ejecutar navegadores concurrentes sobre un mismo estado local. No se modificaron recortes, CSS, textos comerciales, imágenes originales ni reglas de recomendación.
