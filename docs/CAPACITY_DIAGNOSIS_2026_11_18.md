# Rendimiento y capacidad: diagnóstico del 18/11/2026

Referencia: [último informe de navegación](PUBLIC_NAVIGATION_FLUIDITY_2026_11_18.md)
y [corrección del checkout](CHECKOUT_STABILITY_2026_11_18.md).

## Conclusión

**El cuello dominante observado en la carga fría móvil es la transferencia del
arranque y su dependencia de JavaScript para montar el contenido.** La imagen
del Hero compite con esos recursos y, aunque termine, no puede representarse
antes de que exista su elemento en React. La CPU del Worker y los SQL actuales
no explican esos segundos.

Supabase Nano sí tiene poco margen de memoria comprometida y actividad de swap.
Es una señal de capacidad que merece vigilancia, pero las mediciones no prueban
RAM agotada, CPU saturada, bloqueo sostenido del pool o una relación causal con
el LCP. **Comprar Pro no tiene una aceleración de LCP demostrada.**

Recomendación: **mantener Free para estas pruebas de staging**. Antes de operar
comercialmente recomiendo Pro con cambio explícito a Micro para disponer de
más margen, no como reparación de la carga visual. No se contrató ni modificó
ningún servicio. No existe una prueba A/B con compute de pago que permita
prometer un porcentaje de aceleración.

## Qué se midió realmente

- 60 cargas de navegador: Home, Tienda y Producto; escritorio y móvil lento;
  cinco procesos Chrome nuevos por combinación, cada uno con carga fría y
  recarga caliente. Sin pruebas locales ni builds simultáneos.
- Móvil: 390 × 844, DPR 2, CPU ×4, 1,6 Mbps de bajada, 750 kbps de subida y
  150 ms de latencia emulada. Escritorio: 1440 × 900, DPR 1, sin limitación
  adicional. Mismo equipo, conexión y servicios de staging.
- 24 cargas adicionales alternadas A/B–B/A para comparar decodificación
  `async` y `sync` de la primera fotografía; misma imagen y respuestas reales.
- Diez lecturas aisladas de la misma imagen con el perfil móvil lento, en dos
  cohortes de cinco. La segunda guarda también DNS/conexión/cabeceras.
- 30 lecturas HTTP seriales de documentos y multimedia, con IDs correlacionados
  a eventos reales de CPU/wall de Cloudflare cuando estuvieron disponibles.
- Seis scrapes oficiales de Metrics API durante casi cinco minutos; tres
  estados internos distintos, porque el exportador repitió valores por parejas.
- Tres instantáneas de conexiones y 15 EXPLAIN ANALYZE BUFFERS, en transacciones
  SQL de solo lectura con rol anónimo, cinco por RPC.

La caché fría es la del navegador: no implica CDN vacío. No se purgaron cachés,
modificó DNS/protocolos ni realizaron pruebas agresivas. Son mediciones de
laboratorio con Chrome, no móviles físicos, INP de campo ni pruebas de ventas
concurrentes. El catálogo real contiene un producto activo.

## LCP: recurso exacto y desglose

La traza histórica de 4236 ms no conserva su evento bruto en los artefactos
del informe anterior. No es posible recuperar independientemente su URL exacta
solo de aquella tabla. **Se reprodujo el patrón en nuevas trazas conservadas.**

La nueva traza MCP registra LCP de 3776 ms: documento 564, descubrimiento 61,
carga del recurso 2350 y retraso de representación 801 ms. El elemento es
`.hero-slide.is-active .hero-image img`, primera fotografía del Hero:

```text
/media/public/dynamic/ad4bf6c3-a0ff-447e-a553-8d24269950b4/
75ee2867fe2369f7a1d68a0f6f53b5fcb4adc4f1d37200520b6fe478fd1ec837/780.webp
```

Se verificó contra el archivo/manifiesto importado: corresponde a
`hero-v2-lumiere-mobile-780.webp`, **56.778 bytes**, WebP, **780 × 1170 px**.
El navegador usa la variante adecuada para 390 px y DPR 2. Ya dispone de
precarga responsive coherente con `<picture>`, prioridad alta, dimensiones
reservadas y caché inmutable. No se redujeron resolución, calidad ni encuadre.

**«Carga del recurso» incluye la espera hasta cabeceras, no solo sus bytes.**
En esa traza nueva, unos 701 ms preceden al cuerpo y 1649 ms corresponden al
cuerpo. No es correcto interpretar los antiguos 2328 ms como tiempo puro de R2
o exclusivamente como ejecución de PostgreSQL. Véase el
[desglose oficial de LCP](https://web.dev/articles/optimize-lcp).

Una muestra de la cohorte controlada cuyo LCP coincide con su mediana móvil
permite sumar fases del mismo navegador:

| Fase del Home móvil frío, muestra 2 | Tiempo |
| --- | ---: |
| Documento hasta primeras cabeceras | 476 ms |
| Descubrimiento de la imagen | 41 ms |
| Imagen: solicitud hasta cabeceras | 386 ms |
| Imagen: transferencia del cuerpo | 1421 ms |
| Imagen terminada hasta LCP | 740 ms |
| **LCP de esa muestra** | **3064 ms** |

La imagen terminó en 2324 ms; React/vendor acabó de descargarse en 2575 ms;
el Hero apareció en DOM en 2899 ms y se pintó como LCP en 3064 ms. El HTML
había terminado en 578 ms: retener el final del documento para la proyección
inicial no fue el bloqueo dominante de esta muestra.

En la primera traza móvil fría, el trabajo seleccionado de script, estilos,
layout y pintura suma unos 350 ms por unión de intervalos; unos 346 ms están
después de terminar la imagen. No son 796 ms de CPU: el resto incluye esperas,
planificación y fases no cubiertas por esos intervalos. Hubo una tarea larga
de 92 ms y un layout de unos 92 ms. En escritorio, la primera traza no tuvo
tareas largas y la imagen terminada llegó a LCP en unos 31 ms.

### Prueba de transferencia aislada

Sin otros archivos de la web compitiendo, los mismos 56.778 bytes tardaron
**339 ms de cuerpo, mediana de cinco lecturas**, frente a 1421 ms de la muestra
central del Home. La segunda cohorte aislada obtuvo una mediana de unos 350 ms.
El perfil de red y el recurso son iguales; la página aislada es un experimento
de diagnóstico, no una versión alternativa de la tienda.

Los dos chunks comunes transfieren aproximadamente 169 kB comprimidos y el
CSS principal unos 52,5 kB, además de fuentes, imagen y módulo de Home.
Arrancan a la vez y terminan tarde bajo el límite de 1,6 Mbps. Esto sustenta
la competencia de transferencia; no demuestra que todos esos módulos sean
prescindibles. No se modificaron proveedores, permisos o comportamiento para
reducir artificialmente ese presupuesto.

En la primera cohorte aislada hubo dos esperas hasta cabeceras de 1088 y
1435 ms. No se guardó su desglose de conexión y no se atribuyen a un servicio.
En la segunda, con instrumentación adicional, DNS fue de 4–20 ms y conexión
de 156–316 ms; las cabeceras tardaron 425–788 ms. Esta variabilidad existe,
pero su causa interna exacta no se deduce restando tiempos de solicitudes
distintas. No se declara eliminada.

## Resultados de navegador

Medianas de cinco cargas por celda. **Fría/caliente no significa antes/después
de un parche.** Todo corresponde a la misma versión publicada.

| Página | Escritorio frío / caliente | Móvil lento frío / caliente |
| --- | ---: | ---: |
| Home | 2068 / 492 ms | 3064 / 608 ms |
| Tienda | 1284 / 428 ms | 2708 / 496 ms |
| Producto | 1784 / 520 ms | 2908 / 632 ms |

En Tienda el LCP puede ser el logotipo por ser mayor que la única tarjeta
inicial: no debe confundirse esa métrica con decodificar toda la galería.
La disponibilidad de la foto se registra separadamente en los JSON.

Las 60 cargas terminaron sin errores JS, fotografías principales fallidas ni
desbordamiento horizontal. En móvil no se montaron ni descargaron vídeos.
CLS móvil observado: 0; máximo de escritorio: 0,000566. El exceso mediano
de tareas largas sobre 50 ms en móvil frío fue 50/50/48 ms; caliente, cero.
Esto no es TBT completo de Lighthouse ni INP de usuarios reales.

## Worker, HTTP y R2

Las cifras siguientes son otra cohorte controlada con correlación de IDs,
no tramos que deban sumarse al ejemplo de navegador anterior.

| Medición real | Resultado |
| --- | --- |
| WebP: TTFB / cuerpo, mediana, 16 lecturas | 233,7 / 42,8 ms |
| WebP: manifiesto HTTP / Envoy / caché-almacenamiento, medianas | 30 / 2 / 8 ms |
| Caché de bytes WebP | 15 HIT, 1 MISS |
| MISS: caché-almacenamiento / TTFB | 185 / 413,7 ms |
| CPU Worker WebP correlacionado, 8 eventos | Mediana 1; máximo 4 ms |
| Wall Worker WebP, mismos eventos | Mediana 40; máximo 229 ms |
| CPU de documentos posteriores, 3 eventos | Mediana 7; máximo 15 ms |
| Primer Home correlacionado | CPU 12; wall 316; TTFB cliente 839,9 ms |

En ese Home, las lecturas públicas paralelas tardaron 227–290 ms hasta
cabeceras, con Envoy de 37–97 ms; se solapan y no se suman. La muestra de
Worker enlazó 21 de 46 IDs solicitados, correspondientes a 14 invocaciones:
cobertura parcial, no telemetría completa de todo el tráfico.

`wallTime` puede incluir I/O y `waitUntil`; no es TTFB. `manifest_headers`
incluye todo el fetch HTTP; Envoy tampoco es exclusivamente SQL.
`media_storage` en un HIT mide caché y preparación de respuesta, no una nueva
lectura del objeto R2. Los encabezados reproducidos por caché del navegador
no son una nueva ejecución. CF-Cache-Status/Age por sí solos tampoco separan
la caché de bytes del Worker de toda la cadena de respuesta.

No se encontró saturación de CPU de Workers ni evidencia para abrir R2,
eliminar comprobaciones de publicación o introducir otra caché.

## Supabase: capacidad y consultas

Ventana: 16:38:22.832–16:43:21.689 UTC del 18/11. Seis scrapes oficiales con
tres estados internos distintos; los contadores permiten calcular deltas,
pero no asociar presión de memoria a un request ID concreto.

| Recurso | Observación |
| --- | ---: |
| RAM física expuesta | 431,9 MiB |
| RAM disponible, incluyendo recuperable | 116,9–146,1 MiB |
| Memoria comprometida virtual | 1214,9–1263,7 MiB |
| CommitLimit | 1239,9 MiB |
| Margen mínimo de compromiso | −23,7 MiB / −1,9 % |
| Swap ocupada | 326,1–366,6 MiB de 1024 MiB |
| Swap-in / swap-out | +6969 / +843 páginas; tamaño no verificado |
| CPU media sin iowait | 2,08 % |
| Iowait medio | 1,09 % |
| Nuevos OOM | 0 |
| Pool PostgREST | Máximo 10; disponibles 8–9; esperando 0–2 |
| Timeouts del pool | 0, sin incremento |
| Conexiones SQL | 14 incluyendo auditoría; máximo configurado 60 |
| Bloqueadas / idle-in-transaction / transacciones largas | 0 / 0 / 0 |

El compromiso virtual supera el límite exportado en dos estados distintos.
Es una señal de poco margen, **no equivale a RSS ni prueba un OOM**. Quedaba
RAM recuperable, la swap no estaba llena y no se midió thrashing. La
[guía oficial sobre memoria y swap](https://supabase.com/kb/troubleshooting/memory-and-swap-usage-explained-aPNgm0)
explica por qué swap ocupada y presión sostenida no son lo mismo. No se
modificaron `swappiness`, conexiones, buffers ni configuración interna.

| RPC, cinco planes por consulta | Mediana de ejecución SQL | Rango |
| --- | ---: | ---: |
| `catalog_home_context` | 8,846 ms | 8,606–27,199 ms |
| `catalog_browse` | 9,400 ms | 9,184–12,378 ms |
| `catalog_product_context` | 10,213 ms | 10,102–10,795 ms |

El viaje SQL completo rondó 103–105 ms, distinto de ejecutar la consulta.
No hubo lecturas físicas o temporales en estos planes exteriores; PL/pgSQL
no expone aquí todos los planes internos. Los máximos históricos de
`pg_stat_statements` mezclan versiones y no se usan como latencia actual.
`track_io_timing` apagado impide interpretar un cero como latencia física cero.
Los resultados no justifican nuevos índices ni aumentar conexiones.

### Free frente a Pro/Micro

Según [Compute and Disk de Supabase](https://supabase.com/docs/guides/platform/compute-and-disk),
Nano ofrece hasta 0,5 GB de RAM; Micro, 1 GB; Small, 2 GB. Los tres usan CPU
compartida. Micro aumenta el margen de RAM y los mínimos de disco, pero no
acelera los bytes servidos por R2 ni la CPU del navegador. El máximo de
conexiones SQL documentado de Nano y Micro es el mismo: 60.

Pagar Pro no convierte automáticamente un Nano existente a Micro: se debe
seleccionar el compute. No se hizo ese cambio ni se comparó con infraestructura
pagada. La mejora **concreta conocida es capacidad disponible**, no una reducción
medida de milisegundos. Para staging ligero mantendría Free; para lanzamiento
comercial recomiendo al menos Micro por margen de memoria. No hay evidencia
para recomendar Small, CPU dedicada o porcentajes de aceleración.

## Optimizaciones evaluadas y decisión

1. **Primera imagen `decoding="sync"`: descartado.** Tres pares alternados
   por perfil, con frío/caliente: 24 cargas reales. Home móvil frío:
   LCP async 3024 ms, sync 3016 ms; caliente, 596 frente a 640 ms.
   Tiempo desde DOM del Hero hasta LCP frío: 168 frente a 160 ms.
   Escritorio frío: 1108 frente a 1400 ms; al descontar TTFB, 731 frente
   a 735 ms. No hay una mejora práctica consistente. No se cambia el hint
   ni se presentan las variaciones de red como aceleración.
2. **Más compresión o menor resolución del Hero: sin justificación.** Ya son
   57 kB en WebP con la variante responsive correcta. El diagnóstico aislado
   muestra competencia de transferencia, no un archivo comercial desmedido.
3. **Mover CSS administrativo: no se repite la regresión anterior.** El ahorro
   máximo estimado de retirar todas sus reglas sería unos 7,5 kB comprimidos;
   la revisión anterior documentó cambios en la cascada tipográfica. No se
   sustituyen mejoras medidas por un cambio global de ese riesgo.
4. **Nuevos índices, más conexiones o caché comercial: no justificados.** SQL
   actual pequeño, sin saturación probada ni planes que lo requieran.

**No quedó un nuevo parche de rendimiento justificado por estos ensayos.**
Se conserva la versión activa de staging y se vuelve a comprobar su paquete.
No se realizó un despliegue vacío para aparentar una mejora. La carga fría
móvil sigue pendiente de una mejora estructural demostrada: el contenido
inicial depende de descargar/ejecutar el arranque. Un render inicial de servidor
o una redistribución del grafo necesitarían un prototipo equivalente y medición;
no se recomiendan ni se presentan como implementados sin esa prueba.

## Validación e integridad

TypeScript, ESLint, 215 pruebas Node, build de staging, sello y dry-run de
Wrangler: aprobados. Las suites de 133 casos de checkout/catálogo/carga del
informe de checkout corresponden al mismo código conservado, no se anuncian
como una nueva ejecución en esta auditoría. Se conservaron todos los cambios
locales previos; no hubo commit, push, cambios comerciales ni de diseño,
Auth/MFA, RLS, precios, inventario, pedidos o pagos.

Versión verificada: `e8798e4b-6e93-46af-92d8-8e5994889449`, Worker
`aroma-infini-frontend-staging`, despliegue
`e73db47e-32b6-4c41-9e1e-b7724823241e`.
No hubo migraciones ni cambios de R2. Producción conserva el despliegue
`9baa7c50-262a-4f23-bf52-5742a52ffa0b`.

Los 120 JS/CSS servidos coinciden byte a byte con el build comprobado.
SHA-256 del manifiesto:
`9745e0eb865ab97d4181dea17542f9615482b86e66a1e82c6c852498ef36f240`.
Variables y binding de staging coincidentes; subida administrativa anónima
401 y namespace interno de caché 404. La versión y el paquete son los mismos
que al comenzar, no una nueva entrega con una mejora atribuida sin pruebas.

## Evidencias y límites pendientes

`artifacts/capacity-diagnosis-2026-11-18/` conserva `result.json`, las 60
cargas, 12 trazas CPU/red, capturas, el experimento alternado, dos cohortes
de imagen aislada, eventos correlacionados del Worker, scrapes oficiales,
planes y resúmenes SQL, scripts y logs de validación. Está ignorado por Git.

Faltan spans internos por petición de pool/PostgREST/PostgreSQL y DNS/TLS
interno del fetch del Worker; el proveedor no los expone en esta captura.
No se puede asignarles el remanente de HTTP por descarte. Tampoco se ha
demostrado que desaparecieran los picos históricos de upstream o conexión.
No hay comparación con compute pagado, tráfico comercial concurrente ni
datos de campo suficientes para prometer capacidad de producción o INP.
