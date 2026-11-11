# Inventario de medios del sitio

Auditoría de `src` y `public`, 11 de noviembre de 2026. El catálogo legible por
máquina es [`public/media-default-inventory.json`](../public/media-default-inventory.json).
Contiene una entrada por archivo activo, incluso derivados calculados por código:
**162 archivos: 159 WebP, 2 MP4 y 1 SVG**. Cada entrada conserva ruta pública,
tipo, sección, etiqueta y dimensiones reales. Un mismo archivo reutilizado en
varias ubicaciones aparece una sola vez.

`src/content/media-default-inventory.json` es la copia compilada para el navegador;
Vite no permite importar módulos de `public`. Una prueba compara ambos archivos
para impedir que se separen sus rutas, dimensiones o etiquetas.

El inventario identifica los recursos que deben importarse; su presencia en este
repositorio no acredita una subida a R2. La centralización debe ejecutarse contra
el entorno autorizado y comprobar las asociaciones resultantes antes de afirmar
que todos los recursos están alojados en R2. La importación de los recursos
actuales conserva los bytes originales: no vuelve a recortar ni codificar.

## Recursos comerciales activos

| Familia                         | Archivos distintos | Variantes y composición                                                                                                                                                                       | Configuración y usos                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | -----------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Campañas del inicio             |                 30 | `hero-v2-lumiere`, `hero-v5-silence`, `hero-v3-petale`, `hero-v4-amber`, `hero-v4-citrus`. Por campaña: escritorio 960/1536/2048 y móvil 480/780/1024. Escritorio 16:9 aproximado, móvil 2:3. | `src/content/home.ts`, `src/services/hero-image-source.ts`, `Hero.tsx`. Campañas, imágenes, videos, portadas, publicación y ALT administrables.                                                                                                                                                                                |
| Categorías                      |                 34 | Doce originales `discovery-bois`, `discovery-petale`, `discovery-libre`, `discovery-complements-v1`; 22 derivados `*-category-*`, 4:5, anchos 320/480/640/800 y los mayores disponibles.      | `home.ts`, `category-images.ts`, `HomeSections.tsx`. Los originales también sirven a la vista previa administrativa y a la composición de tres categorías. Reemplazos administrables. ALT decorativo.                                                                                                                          |
| Perfil olfativo y recomendador  |                 18 | Ocho imágenes `olfactory-{ambre,cedre,figue,iris,neroli,petale,santal,sillage}.webp`, 960×1200. Cinco familias poseen miniaturas 160×200 y 320×400: ambre, cedre, neroli, petale, sillage.    | `mocks/product-details.ts`, `content/fragrance-finder.ts`, `content/image-variants.ts`, `PerfumeFinder.tsx`, `FragranceQuiz.tsx`, `OlfactoryProfile.tsx`. Cedre también es fondo del recomendador; santal también ilustra Nosotros. Reemplazos por producto y por opción del recomendador ya administrables.                   |
| Fotografías de productos        |                 64 | Ocho productos base: ambre, cedre, figue, iris, neroli, petale, santal, sillage. Cada uno tiene frente, `alternate`, `detail`, `back`, a 480×600 y 960×1200.                                  | `mocks/home.ts`, `mocks/product-details.ts`, `content/catalog-products.ts`. Ocho registros adicionales reutilizan los originales. Galería, tarjeta y alternativa al pasar el cursor, búsqueda, favoritos, resultados del recomendador, carrito, checkout y pedidos usan las mismas referencias. Administrables en Fotografías. |
| Portada de Nosotros             |                  5 | `editorial-essential-v3-{480,960,1536}.webp`, 16:9; `editorial-essential-v3-mobile-{480,780}.webp`, 480×528 y 780×858.                                                                        | Registro `site-media-defaults.ts`, ubicaciones `about.hero.desktop` y `about.hero.mobile`; `AboutPage.tsx`. El cambio a móvil se mantiene en 767 px.                                                                                                                                                                           |
| Acceso de clientes              |                  5 | `account-selection-v1-portrait-{480,780,1024}.webp`, 2:3; `account-selection-v1-wide-{960,1536}.webp`, 3:1.                                                                                   | Ubicaciones `auth.customer.desktop` y `auth.customer.mobile`; `AuthScreen.tsx`. La imagen móvil panorámica se selecciona a 760 px. Figura y ALT decorativos.                                                                                                                                                                   |
| Imagen exclusiva para compartir |                  1 | `featured-duo-v3-1536.webp`: dimensiones reales **1448×1086**.                                                                                                                                | Ubicación `seo.catalog`. Las imágenes sociales de inicio y marcas reutilizan archivos contabilizados en campañas y categorías.                                                                                                                                                                                                 |
| Video editorial y portadas      |                  4 | Escritorio MP4 1920×926, 6 381 008 bytes; móvil MP4 720×900, 3 243 161 bytes. WebP de apertura correspondientes 1920×926 y 720×900. Clips H.264 silenciosos de unos 12 segundos.              | `content/editorial-film.ts`, `EditorialFilm.tsx`, `public/videos/README.md`. Video, variante móvil y portadas administrables. Conservar siempre la pareja correcta entre clip y portada.                                                                                                                                       |
| Identidad de la tienda          |                  1 | `brand/logo-on-light.svg`, lienzo 774×374.                                                                                                                                                    | Ubicación `identity.logo`. Cabecera, pie, acceso administrativo y Organization JSON-LD reutilizan la misma identidad. Conservar el vector original al importarlo.                                                                                                                                                              |

`src` no contiene archivos independientes de imagen rasterizada o video. Sus
componentes obtienen estos recursos mediante el catálogo y los servicios de
imágenes. Las rutas originales son datos de arranque; los componentes de las
nuevas ubicaciones no incluyen rutas de archivos.

### Dimensiones que no deben normalizarse durante la importación

- Los derivados de escritorio de 2048 px de lumiere, amber y citrus miden
  **2048×1153**; petale y v5-silence miden 2048×1152.
- `featured-duo-v3-1536.webp` no mide 1536 px: mide **1448×1086**.
- La portada móvil de Nosotros es **10:11**, no 2:3.
- El acceso móvil es **3:1**, distinto del retrato de escritorio 2:3.
- El fondo predeterminado del recomendador es 960×1200; el CSS conserva su
  composición aunque las nuevas imágenes de escritorio se preparen a 16:9.
- La historia de Nosotros reutiliza santal 960×1200. El CSS existente recorta a
  1:1,06 en escritorio y a 4:3 en móvil.

## Ubicaciones administradas del sitio

`src/domain/site-media-slots.ts` define el contrato. Los valores de arranque y los
ALT originales están en `src/content/site-media-defaults.ts`.

| Ubicación estable       | Uso y alternativa original                                                   |
| ----------------------- | ---------------------------------------------------------------------------- |
| `about.hero.desktop`    | Portada de Nosotros y sus candidatos 480/960/1536.                           |
| `about.hero.mobile`     | Portada de Nosotros, 480/780, punto de cambio 767 px.                        |
| `about.story`           | Imagen de Nuestra esencia, olfactory-santal.                                 |
| `auth.customer.desktop` | Retrato del acceso de clientes, 480/780/1024.                                |
| `auth.customer.mobile`  | Panorama del acceso de clientes, 960/1536, punto de cambio 760 px.           |
| `identity.logo`         | Un único logotipo reutilizado en los tres componentes y datos estructurados. |
| `seo.home`              | Imagen social inicial de lumiere, 1536×864.                                  |
| `seo.catalog`           | Imagen social de la tienda, featured-duo.                                    |
| `seo.brands`            | Imagen social del directorio de marcas, discovery-bois, 1536×2304.           |

Home y productos conservan sus asociaciones existentes: campañas, categorías,
recomendador, opciones de familia, película, galerías y perfiles olfativos.
Las marcas no tienen actualmente logotipos comerciales subidos: el carrusel usa
monogramas SVG/textuales generados y el directorio toma una fotografía de un
producto publicado. Esta integración conserva esa presentación.

Contacto no contiene fotografías ni videos comerciales; sus iconos son parte
del código. No se añade una sección visual nueva.

## Archivos históricos excluidos de la importación activa

No se eliminan del repositorio. Estos **18 archivos comerciales históricos** no
están seleccionados por el sitio actual:

- `images/hero-{480,960,1536}.webp`: tres imágenes anteriores.
- Los seis `images/hero-v2-silence-*`: sustituidos por v5-silence.
- `images/brand-ambre-editorial-{480,960}.webp`: dos imágenes sin consumidor actual.
- `images/featured-duo-v3-{480,960}.webp`: dos derivados sin consumidor actual.
- `images/sillage-1536.webp`: un derivado sin consumidor actual.
- `images/complementos-provisional.svg`: ilustración provisional sin consumidor.
- `videos/perfume-ritual.mp4` y `videos/perfume-ritual.webp`: captura histórica;
  `public/videos/README.md` explica por qué no se usan como variante móvil.
- `brand/logo-on-dark.svg`: variante sin consumidor actual.

El total original auditado de `public` era 174 WebP, 3 MP4, 4 SVG, 5 PNG y 8
WOFF2. Los 162 recursos activos más estos 18 históricos explican los 180
archivos comerciales. Los 14 restantes son activos de aplicación y tipografía.

## Activos de aplicación excluidos

- `favicon.svg`: identidad técnica del navegador.
- Cinco PNG en `admin/icons`: apple-touch-icon 180×180, badge 96×96, icon-192
  192×192, icon-512 512×512 y maskable 512×512. Están vinculados al manifiesto
  PWA, al service worker y a notificaciones.
- Ocho WOFF2 y sus licencias: tipografía de la aplicación.
- SVG incluidos en `Icon.tsx`, `NoteBottleIcon.tsx`, `ContactSocialIcon.tsx` y
  `BrandMonogram.tsx`: controles y presentación producidos por código.
- Teselas rasterizadas de OpenStreetMap de 256 px en `DeliveryLocationMap.tsx`:
  recurso del servicio cartográfico, solicitado según la ubicación visible.
- QR generado de contacto y QR de configuración MFA: salida operacional, sin
  incorporación a una biblioteca comercial.
- `robots.txt`, páginas de error, manifiestos, service workers y cabeceras:
  configuración de la aplicación.

## Referencias, reutilización y limpieza

R2 contiene los archivos; Supabase conserva identidades, dimensiones,
derivados, metadatos y asociaciones verificadas. La carga de una proyección
registra los manifiestos antes de comunicar el cambio a los componentes.
Los candidatos de `srcset` deben proceder de las dimensiones reales del
manifiesto, sin adivinar rutas ni ampliar archivos.

La cuenta de referencias debe incluir galerías, perfil olfativo, Home, ubicaciones
del sitio, asociaciones de importación y fotografías de líneas de pedidos. Una
campaña sin publicar o una categoría oculta sigue siendo una referencia. Los
iconos técnicos y las fuentes no participan en esta limpieza comercial.

La política solicitada es borrar únicamente archivos gestionados que lleven
24 horas sin ninguna referencia. El nuevo plazo empieza al retirar la última
asociación; volver a utilizar el recurso cancela su retirada. La comprobación,
la asociación y la reclamación para borrar deben bloquear la misma identidad.
Los archivos heredados de siete días necesitan la migración de retención; no
basta con cambiar la etiqueta de la interfaz. El Worker elimina únicamente los
prefijos UUID reclamados y confirma el resultado en Supabase.
