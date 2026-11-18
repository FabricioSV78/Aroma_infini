# Navegación pública y recorrido HTTP — 12 de noviembre de 2026

Las mejoras están publicadas **solo en staging**. Se reutiliza el contenido
público que el Worker ya consulta para la ficha, se elimina la repetición de
metadatos multimedia en el navegador y se adelanta el descubrimiento de recursos.
La transición móvil Tienda → ficha mejora claramente. La carga fría todavía
presenta variación y no cumple uniformemente los objetivos de Core Web Vitals.
No se afirma que todas las páginas sean ahora más rápidas en todas las condiciones.

## Entorno y límites de la comparación

| Elemento                                    | Comprobado                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| Sitio medido                                | `https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev` |
| Supabase                                    | Desarrollo, `tkxvexfapszilzhogvgu`                                         |
| R2                                          | Bucket privado `aroma-infini-media-dev`                                    |
| Versión inicial alojada                     | `1eb8f109-f944-45f3-87a8-3dbd6a223a6a`                                     |
| Versión final alojada                       | `15928de0-f4e3-44e2-ab83-8cb1bab4aac3`                                     |
| Identidad SHA-256 del manifiesto desplegado | `19b5b7ab7eb568811b4c188ba21955c924e51cffcca9e771c611a5942ecb65f4`         |
| Producción                                  | No consultada, modificada ni desplegada                                    |
| SQL, índices y dependencias                 | Sin cambios nuevos en esta entrega                                         |

El punto inicial es la versión alojada del 10 de noviembre. El paquete final
incluye también mejoras locales previas de arranque y consultas paralelas y
la infraestructura multimedia que aún no estaba en aquella versión. Por ello
la diferencia de bundle no representa exclusivamente estas optimizaciones.
Las optimizaciones SQL de la auditoría anterior ya estaban aplicadas al medir
ambas versiones; no se atribuyen estos resultados a índices nuevos.

Se utilizaron únicamente lecturas públicas, secuenciales y acotadas de servicios
alojados. No se crearon productos, cuentas, pedidos o pagos para estas mediciones.
Había **un producto publicado** en staging. El crecimiento a miles de productos
se comprobó por separado con transporte aislado, sin introducir ese volumen
en la base remota.

### Método

- **54 cargas frías reales:** Home, Tienda y `/producto/kamrha`, tres muestras
  por ruta y perfil, antes y después. Cada una usa un contexto nuevo de Chrome
  y caché HTTP vaciada. Escritorio 1440 × 900; móvil 390 × 844, DPR 2, CPU ×4.
  Perfil móvil: 80 ms, 9 Mbps de bajada y 1,5 Mbps de subida. Perfil móvil lento:
  150 ms, 1,6 Mbps y 750 kbps. Capturas en los nueve pares ruta/perfil.
- **12 recorridos reales Tienda → ficha:** tres por dispositivo y versión.
  Escritorio con intención de hover durante 300 ms; móvil con pointerdown
  durante 50 ms antes de activar el enlace. Tramas de Chrome, métricas de
  tareas/JavaScript y Event Timing; sin compras ni escrituras.
- **54 lecturas HTTP reales:** tres páginas y tres imágenes, tres muestras,
  en las fases inicial, instrumentada y final. Incluyen cuerpo completo y hashes.
- **Chrome DevTools MCP:** trazas de aproximadamente nueve segundos de Home
  y Tienda, antes y después, con su preset Slow 4G y CPU ×4. Este preset es
  distinto de la limitación personalizada anterior: sus valores no se mezclan.
- Dos visitas reales adicionales verifican el vídeo editorial en escritorio
  y móvil. Comprobación alojada general de staging y contratos públicos de acceso.
- Doce recorridos de volumen aislado verifican 1.000 candidatos del recomendador
  y 500 favoritos, comparando la compilación local anterior a esta tarea con la
  nueva. No son pruebas de capacidad de Supabase alojado.

Tres muestras no son un percentil de producción. La CPU y las redes se emularon;
no se certificaron teléfonos físicos. El observador del ensayo de 54 cargas
termina un segundo después del contenido esperado —en Home espera además la
imagen inicial—; su LCP es una observación acotada, no un LCP de campo completo.
Los cambios de candidato LCP, especialmente logo frente a galería en móvil,
impiden interpretar algunas diferencias como una mejora visual equivalente.
Las trazas largas se presentan por separado. No hay datos CrUX ni INP de campo.

## Dónde se consume el tiempo

### Navegador → HTML → JavaScript → RPC

Antes, Home encadenaba `catalog_home_context`, `home_document` y luego
`site_settings`. Tienda esperaba su código y cargador antes de consultar el
catálogo. En una entrada directa a la ficha, el Worker consultaba
`catalog_product_context` para los metadatos y el navegador repetía la misma RPC.

Las cascadas de arranque y el descubrimiento tardío son más relevantes que
el coste SQL residual de las lecturas medidas. En la traza móvil lenta final
del Home, de 5.481 ms de LCP, 563 ms corresponden al TTFB, 4.320 ms al retraso
en descubrir la imagen, 586 ms a su carga y 12 ms a su representación. La imagen
ya tiene prioridad alta y no usa lazy loading; todavía la descubre React.

En dos muestras finales móviles de Tienda el HTML tardó 1.252 y 1.510 ms en
completarse aunque la espera de cabeceras fue 134 y 166 ms. La muestra inicial
también incluía una entrega HTML de 1.277 ms. Es una demora real de entrega/
transporte observada; sin una traza distribuida equivalente del servidor no
se atribuye de forma concluyente a un método del Worker ni a PostgreSQL.

### Worker → Supabase → R2

`Server-Timing` se habilitó **solo en staging** para separar la lectura del
manifiesto público de la preparación de la respuesta de almacenamiento.

| Etapa                                                 | Fase instrumentada |                          Fase final |
| ----------------------------------------------------- | -----------------: | ----------------------------------: |
| Manifiesto público de imagen, RPC desde Worker        |           15–26 ms |                            12–27 ms |
| Binding R2 y preparación de respuesta de imagen       |         150–167 ms |                          138–149 ms |
| Contexto de ficha desde Worker, lecturas calientes    |         39 y 53 ms |                            44–50 ms |
| Contexto de ficha, primera lectura instrumentada fría |             553 ms | No se compara como lectura caliente |

Son tiempos de pared, **no CPU del Worker ni tiempos SQL puros**. La etapa
de almacenamiento termina al preparar la respuesta en streaming, antes de
consumir necesariamente todo el cuerpo. No se demuestra que la variación de
R2 entre fases provenga de un cambio de código: no se alteró su almacenamiento.
Las solicitudes instrumentadas llegaron a GRU; no había evidencia para cambiar
la ubicación del Worker ni añadir otro proxy delante de Supabase.

Las lecturas HTTP finales completas, sin limitación artificial de red, fueron:

| Recurso             | Mediana inicial → final |
| ------------------- | ----------------------: |
| HTML Home           |            140 → 120 ms |
| HTML Tienda         |            141 → 135 ms |
| HTML ficha          |            237 → 167 ms |
| Imagen 27.666 bytes |            318 → 298 ms |
| Imagen 52.006 bytes |            321 → 289 ms |
| Imagen 63.730 bytes |            331 → 315 ms |

Estas lecturas HTTP no equivalen a una página utilizable ni a un percentil
estable. Las tres imágenes mantienen tamaño y **SHA-256 idénticos** antes y
después. No se redujo su calidad ni se cambiaron los archivos comerciales.

## Implementación

1. **Ficha inicial sin consulta duplicada.** El Worker incorpora en el HTML
   `no-store` el mismo DTO anónimo que acaba de verificar para el SEO. El
   navegador lo consume una sola vez, valida proyecto, ruta, versión, tamaño
   y el contrato completo, incluida la familia olfativa personalizada. Si
   supera cinco segundos desde el inicio de navegación, se invalida o falla
   la validación, utiliza la RPC normal. No entra en caché persistente.
2. **Metadatos multimedia iniciales compartidos.** Se reutiliza el documento
   público de medios y aliases validados de la capa existente del Worker.
   El HTML entrega ambas partes en JSON inerte acotado; cada consumidor las
   utiliza una vez. Se conserva el TTL existente de 30 segundos para estos
   metadatos públicos, sin precios, inventario o información de usuarios.
   Las solicitudes opcionales tienen un límite de un segundo y un fallo
   conserva la carga normal desde Supabase. Las lecturas forzadas y las
   invalidaciones no usan ese dato inicial.
3. **Descubrimiento temprano.** Se añade preconnect al origen Supabase
   validado, preload del logo SVG configurado y de la portada verificada de
   la ficha cuando coincide con la primera imagen de la galería. El hint
   comparte exactamente `sizes` y los candidatos verificados de la galería;
   no inventa resoluciones ni utiliza URLs externas o temporales.
4. **Precarga por intención del código público.** Hover, foco o pointerdown
   pueden cargar el módulo de Tienda, Marcas o ficha mediante las mismas
   funciones lazy del router. No ejecutan loaders ni consultan datos.
   Se omiten con Save-Data o 2G. No se precargan módulos administrativos.
5. **Reglas existentes conservadas.** El arranque paralelo previo mantiene
   las comprobaciones de autenticación en rutas protegidas. No se cambiaron
   estilos, composición, animaciones, temporizadores, opciones comerciales,
   cálculo de precios, favoritos, pagos, inventario ni lógica de pedidos.

El JSON inicial escapa etiquetas y separadores de línea, comprueba el tamaño
UTF-8 y no contiene secretos de servidor. La publicación de familias se realiza
después de validar todo el DTO, evitando depender de una visita previa a Tienda.

### Responsabilidad de cada servicio

| Operación                                   | Camino conservado                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| Buscar, filtrar, ordenar y paginar catálogo | Navegador → RPC pública de Supabase con contrato acotado                        |
| Entrada directa a ficha                     | Worker → RPC anónima para SEO; reutilización del mismo resultado al arrancar    |
| Transición interna a otra ficha             | RPC normal desde navegador, con invalidación existente                          |
| Carrito/favoritos                           | Consultas por IDs y comprobaciones de usuario existentes                        |
| Cotizar y confirmar checkout                | Backend autoritativo existente; sin reutilizar el DTO inicial como autorización |
| Imágenes y vídeos dinámicos                 | Worker → manifiesto válido → binding privado R2 → streaming                     |
| Recursos locales no migrados                | Assets existentes de Cloudflare con sus rutas actuales                          |

No se convirtió el Worker en un proxy general del catálogo. Cada GET/HEAD o
petición condicional de medios conserva la comprobación del manifiesto antes
de servir bytes; se preservan ETag, Range, MIME y límites. R2 sigue privado.
No se añadió otra caché de cuerpos ni se eliminó esta comprobación para ganar
milisegundos. Una posible caché edge requiere demostrar sus hits y su modelo
de invalidación con el dominio definitivo antes de activarla; no se presenta
como una mejora ya probada. Cloudflare documenta la localidad de Cache API y
las condiciones de uso en su [referencia oficial](https://developers.cloudflare.com/workers/runtime-apis/cache/).

## Comparación de navegador

Medianas en milisegundos hasta el contenido esperado de la ruta, con las mismas
condiciones y animaciones. No representan un checkout completo ni el LCP.

| Ruta   | Escritorio antes → después | Móvil antes → después | Móvil lento antes → después |
| ------ | -------------------------: | --------------------: | --------------------------: |
| Home   |              1.603 → 1.956 |         1.813 → 1.555 |               4.142 → 3.660 |
| Tienda |              1.642 → 1.880 |         1.857 → 2.407 |               3.649 → 3.622 |
| Ficha  |              1.428 → 1.173 |         1.751 → 1.401 |               3.701 → 3.871 |

Home mejora en móvil; la ficha en escritorio y móvil rápido. Tienda no demuestra
una mejora general de carga fría y la ficha lenta tampoco mejora en este
indicador. Los resultados mixtos y el crecimiento del paquete no se ocultan.

### Transición Tienda → ficha

| Métrica                                                     | Escritorio antes → después | Móvil lento antes → después |
| ----------------------------------------------------------- | -------------------------: | --------------------------: |
| Contenido de ficha desde el clic                            |               234 → 304 ms |            **847 → 349 ms** |
| Tiempo de JavaScript durante transición y ventana posterior |             18,8 → 14,4 ms |             114,7 → 73,6 ms |
| Tiempo de tareas en esa ventana                             |             68,1 → 52,0 ms |            387,1 → 224,7 ms |
| Mayor interacción observada, mediana                        |         Sin eventos ≥16 ms |                  40 → 24 ms |

La mejora móvil de esta transición es del 58,7 %. En escritorio el tiempo
hasta contenido empeora 70 ms aunque disminuye el trabajo de CPU. Event Timing
es evidencia de esas interacciones, **no una certificación de INP de usuarios**.

### Trazas móviles largas de Chrome DevTools

Una muestra por versión, preset Slow 4G, CPU ×4:

| Métrica                             | Home antes → después | Tienda antes → después |
| ----------------------------------- | -------------------: | ---------------------: |
| LCP observado                       |     6.942 → 5.481 ms |       5.940 → 4.993 ms |
| Retraso en descubrir el recurso LCP |     5.780 → 4.320 ms |          4.762 → 59 ms |
| TTFB                                |         563 → 563 ms |           564 → 563 ms |

En Tienda el recurso LCP de ambas trazas es el logo SVG. El preload adelanta
su descarga, pero todavía espera 2.505 ms para representarse mientras arranca
la aplicación. En Home sigue siendo la primera imagen móvil del Hero. No se
ha alcanzado un LCP bueno bajo esta limitación extrema.

### Consultas, transferencia y memoria

| Primera carga                                          | RPC del navegador inicial → final |
| ------------------------------------------------------ | --------------------------------: |
| Home                                                   |                             3 → 3 |
| Tienda                                                 |                             2 → 2 |
| Ficha                                                  |                             3 → 2 |
| `catalog_product_context` duplicada en entrada directa |                             1 → 0 |

Una versión intermedia con las funcionalidades multimedia locales pendientes
hacía cinco RPC en Home y cuatro en Tienda/ficha. La versión final elimina las
dos de metadatos multimedia del arranque del navegador reutilizando el HTML.
No se confunde esa comparación intermedia con el punto inicial alojado.

La mediana de JavaScript transferido en escritorio aumenta aproximadamente
13 kB por ruta frente al despliegue antiguo: Home 324.520 → 337.482 bytes;
Tienda 329.619 → 342.724; ficha 337.182 → 350.320. Las solicitudes totales de
Home pasan de 79 a 83, Tienda de 69 a 73 y ficha de 78 a 80. Se conservan y
registran estas diferencias del paquete completo; no se anuncia una reducción
global de solicitudes o bundle que los datos no sostienen.

En móvil CPU ×4, las tareas largas de arranque se mantienen aproximadamente
entre 124 y 145 ms en la fase final; no desaparecen. El heap utilizado en las
cargas muestreadas está entre 6,5 y 7,7 MiB. No equivale a un ensayo prolongado
de fugas de memoria ni demuestra capacidad ilimitada del DOM.

## Imágenes, banners, galería y vídeo

Se revisaron los recursos reales solicitados por Home, Tienda y ficha, sus
`srcset`, dimensiones, prioridades, carga diferida, cuerpos, ETag y cabeceras.
La comprobación general verificó cinco activos R2 y sus **15 variantes**.
No se cambiaron fotografías, encuadres ni archivos de vídeo.

El vídeo editorial realizó cero solicitudes MP4 antes de entrar en pantalla.
Al desplazarse hasta él, escritorio utilizó 1920 × 926 y móvil 720 × 900,
con el póster correspondiente, `preload="none"`, petición Range y pausa al
salir de vista. Son los archivos ya existentes; no se inventaron transcodes.
La muestra de vídeo es estática: el comprobador general no encontró vídeos
dinámicos R2 publicados, por lo que no declara haberlos certificado alojados.

Chrome encontró ahorro potencial de bytes en dos imágenes posteriores del
carrusel, pero estimó cero ahorro de LCP/FCP en aquella traza. No se recomprimieron
ni se alteró la calidad visual para reducir un indicador sin impacto demostrado.

## Volumen, pruebas y seguridad

El recomendador con 1.000 productos conserva diez lecturas de página y un máximo
de cuatro simultáneas; mediana aislada 845 → 845 ms. Favoritos con 500 IDs
conserva cinco lotes y máximo cuatro simultáneos; 1.020 → 1.032 ms. No se
demuestra otra mejora de volumen en esta fase: se verifica ausencia de regresión
estructural y de una consulta por producto, con latencia RPC local de 150 ms.
Las dos compilaciones tienen las optimizaciones de lotes previas. No es una
prueba real de miles de clientes ni de miles de objetos R2.

| Validación ejecutada                                  | Resultado                                           |
| ----------------------------------------------------- | --------------------------------------------------- |
| TypeScript y lint                                     | Aprobados                                           |
| Build real staging y comprobación Wrangler/identidad  | Aprobados                                           |
| Build de producción con configuración pública aislada | Aprobado; no desplegado                             |
| Node: contratos, guardas y serialización              | 183 aprobadas                                       |
| Catálogo, SDK y navegador aislados                    | 71 aprobadas                                        |
| HTML/SEO en workerd nativo                            | 33 aprobadas                                        |
| Worker de medios y contratos de seguridad/entrega     | 140 aprobadas                                       |
| Navegación pública, estados, Hero y autenticación     | 86 aprobadas                                        |
| Home                                                  | 8 aprobadas                                         |
| Favoritos                                             | 15 aprobadas                                        |
| Checkout aislado                                      | 24 aprobadas                                        |
| API anónima alojada y rechazos privados               | 55 comprobaciones aprobadas                         |
| Staging alojado, assets y muestra de medios           | 25 comprobaciones, 68 solicitudes, aprobadas        |
| Navegaciones comparadas y recorridos alojados         | Sin errores JavaScript ni desbordamiento horizontal |

Son **377 pruebas de Playwright/workerd más 183 de Node**, sin skips ni reintentos
en estas suites seleccionadas. No se afirma haber repetido la suite completa
del repositorio. Las pruebas de catálogo, favoritos y checkout utilizan
transporte aislado: sus compras simuladas no son compras reales alojadas.

Las regresiones incluyen DTO inicial inválido, otro proyecto/ruta, caducidad,
invalidación, familias personalizadas, escape HTML, fallos de medios y lecturas
forzadas. Se conservan las validaciones administrativas, RLS, MFA, manifiestos
por petición y autoridad del servidor sobre precios y disponibilidad.
No se cambiaron funciones SQL ni políticas; no fue necesario migrar la base.

## Pendientes y recomendaciones verificables

1. **Descubrimiento del Hero:** sigue ligado al arranque React y a la lectura
   del Home publicado. La siguiente mejora de mayor impacto requiere un contrato
   inicial de Home coherente con la configuración administrativa y su selección
   responsive; no debe insertar un preload fijo que muestre o descargue otra
   campaña cuando el administrador la cambie.
2. **Carga fría de Tienda y paquete común:** aún hay variación de entrega HTML
   y trabajo de CSS/JavaScript. La traza final tiene una cadena CSS → fuente
   de hasta 5.653 ms. Separar código común local/administrativo y CSS crítico
   necesita otra comparación de compilaciones y pruebas de todas sus rutas;
   no se eliminaron funciones ni se cambió tipografía para maquillarla.
3. **R2 y dominio definitivo:** medir cuerpo caliente/frío y, si procede, una
   caché edge demostrada manteniendo la autorización del manifiesto. No servir
   todo el bucket públicamente ni cachear precios/stock para ese fin.
4. **Observabilidad:** `Server-Timing` da etapas de pared. El tail acotado a tres
   solicitudes propias no capturó eventos coincidentes; la CPU por petición del
   Worker **no se verificó**. No se presenta el tiempo de R2 como CPU ni se usaron
   logs privados de clientes. Para aislar la entrega HTML faltan trazas distribuidas
   de una muestra equivalente, no una prueba de carga agresiva.
5. **Validación de campo:** cuando exista tráfico y dominio final, medir p75 de
   LCP, INP y CLS por dispositivo con el consentimiento previsto. Estas muestras
   de laboratorio no sustituyen datos de clientes ni una prueba física en iOS/Android.

No hay evidencia suficiente para atribuir el problema principal al plan Free
de Supabase. Las lecturas calientes desde el Worker son pequeñas frente a la
espera por descubrimiento, transporte y arranque de la interfaz.

## Evidencias y reproducción

Artefactos locales en `artifacts/request-path-audit-2026-11-12/`, ignorados por Git:

- `before-browser.json`, `after-browser.json`, `comparison.json`: solicitudes,
  cabeceras públicas seleccionadas, tiempos, tareas y memoria.
- `before-journey.json`, `after-journey.json`, `traces/*.json`: recorridos y
  perfiles reales de Chrome sin cabeceras Auth.
- `baseline-http.json`, `instrumented-http.json`, `optimized-http.json`: hashes
  y tiempos HTTP, incluidas etapas del Worker.
- `devtools-insights.json`: resultados de las trazas largas. El archivo bruto
  de esas trazas MCP no pudo guardarse por la restricción de ruta del proveedor;
  los perfiles de recorridos CDP sí están guardados íntegros en `traces/`.
- `hosted-video.json`, `hosted-checks.json`, `hosted-security.json` y los informes
  de las suites seleccionadas: alcance y resultados.
- `batch-benchmark.json`: volumen exclusivamente aislado.
- `optimized-deploy.json`: identidad de la versión final, con producción intacta.

Capturas comparativas, sin cambiar las animaciones del producto: el ensayo
desactiva animaciones únicamente al capturar y no es una comparación de píxeles
congelados en el mismo instante de una transición.

| Vista             | Antes                                                                                   | Después                                                                                |
| ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Home móvil        | [Captura](../artifacts/request-path-audit-2026-11-12/screens/before-mobile-home.png)    | [Captura](../artifacts/request-path-audit-2026-11-12/screens/after-mobile-home.png)    |
| Tienda escritorio | [Captura](../artifacts/request-path-audit-2026-11-12/screens/before-desktop-store.png)  | [Captura](../artifacts/request-path-audit-2026-11-12/screens/after-desktop-store.png)  |
| Ficha móvil       | [Captura](../artifacts/request-path-audit-2026-11-12/screens/before-mobile-product.png) | [Captura](../artifacts/request-path-audit-2026-11-12/screens/after-mobile-product.png) |

Comandos reproducibles de las regresiones versionadas:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:node
npm.cmd run test:catalog:supabase
npm.cmd run test:media:worker
npx.cmd playwright test --config playwright.seo-worker.config.ts
npx.cmd playwright test --config playwright.home.config.ts
npx.cmd playwright test --config playwright.favorites.config.ts
npx.cmd playwright test --config playwright.checkout.config.ts
```

El build/despliegue de staging se hizo con el entorno real validado y su
comprobación de identidad. El build de producción de esta auditoría usó una
clave pública aislada: no debe desplegarse. Las pruebas alojadas exigen el
entorno de desarrollo correcto; no deben apuntarse a producción por defecto.
