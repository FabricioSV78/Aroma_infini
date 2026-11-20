# Preparación inicial y rendimiento público — Aroma Infini

Cierre del 20 de noviembre de 2026, America/Lima. Trabajo exclusivo en staging.
Referencias: [Rendimiento integral](INTEGRAL_PERFORMANCE_2026_11_19.md),
[Auditoría de caché](CACHE_STRATEGY_2026_11_19.md) y
[Seguimiento de rendimiento](PUBLIC_PERFORMANCE_FOLLOWUP_2026_11_19.md).
Las evidencias se conservaron en `artifacts/advanced-public-2026-11-19/`; el nombre de carpeta corresponde
al inicio de la intervención. Las nuevas cohortes finales no sobrescriben las
mediciones terminadas antes de la interrupción entre turnos.

## Resultado y alcance

**Se corrigió la pérdida de preparación pública causada por un fallo auxiliar de
medios.** La versión corregida está activa en staging y se comprobó el despliegue
ordinario, los bindings, el paquete, los hashes de recursos y Supabase. Producción
permanece intacta. No hubo commit, push, reset, migraciones, nuevos índices,
dependencias, cambios de DNS/protocolo ni apertura de R2.

La mejora demostrada es de resiliencia y aprovechamiento de lecturas válidas:
en 12 escenarios parciales controlados el contenido inicial pasó de 0/12 a 12/12;
el contexto inicial válido también pasó de 0/12 a 12/12. **No son mediciones de
LCP alojado.** La tabla de navegador conserva todos los resultados reales,
incluidas variaciones y regresiones. No se declara eliminado el upstream lento
del proveedor ni garantizada una primera carga inmediata.

No se modificaron diseño, fuentes, estilos, animaciones, calidad de imágenes,
reglas comerciales, cotizaciones, stock, reservas, pedidos, pagos, Auth/MFA o RLS.
El catálogo alojado sigue teniendo 1 producto(s)
activo(s): los tiempos alojados no prueban rendimiento con miles de productos.

## 1. Causa estructural y corrección del fallback

El código anterior iniciaba las lecturas públicas en paralelo, pero agrupaba
`site_media_document` y `public_media_aliases` dentro de un único bloque.
Cualquier error de HTTP, lectura o validación terminaba en `return response`.
Así se descartaban además Home, catálogo y contexto de ficha válidos, aunque
sus solicitudes hubieran terminado bien. El navegador recibía un shell sin
bootstrap y repetía esas consultas después de descargar y ejecutar React.

Las dos lecturas ahora se resuelven independientemente. Cada fragmento pasa los
mismos validadores y permanece ligado a esa petición. Solo el par completo se
guarda en la caché editorial existente de 30 segundos. Un resultado parcial no
se cachea como par completo ni se sustituye por un documento vacío ficticio.
El bootstrap omite la parte fallida; los consumidores actuales ya validan y
consumen documento y alias de manera independiente.

Un par cacheado conserva su edad original. Un fragmento parcial procede de la
lectura nueva de la petición, no de datos caducados. Se conservan el TTL comercial
de cinco segundos, las invalidaciones, la caché de bytes de R2 y la comprobación
del manifiesto publicado en cada solicitud que llega al Worker.

La representación inicial requiere identidad y fotografías verificables. Si
no quedan recursos suficientes, mantiene el cliente como fallback y conserva
los DTO válidos que sí existen. No resucita defaults retirados, no inventa una
foto y no se salta el manifiesto. El timeout de preparación permanece en 1000 ms;
no se añadieron reintentos.

Solo en staging, `X-Aroma-Public-Fallback` identifica la operación y su fase
`read` o `validation`; `read` incluye HTTP/cuerpo/JSON, no significa por sí
sola fallo de red. Se conservan los identificadores de las lecturas públicas para
correlacionar el próximo incidente. No se publican mensajes internos, credenciales,
datos privados ni sesiones.

Archivos funcionales: `worker/site-media-seo.ts`. Cobertura:
`tests/site-media-seo-worker.spec.ts`, `tests/public-initial-visual-worker.spec.ts`
y `tests/supabase-catalog.spec.ts`. El frontend no necesitó otro contrato ni
fragmentación de módulos.

### Comparación controlada nativa

Se ejecutó el módulo anterior exacto conservado antes de editar frente al nuevo,
en workerd y con los mismos fixtures públicos. Fueron 42 casos: siete estados
por tres rutas, en dos versiones. HTTP 503, JSON inválido y el timeout real de
1000 ms se inyectaron únicamente en el entorno aislado. No se provocaron fallos
en Supabase alojado ni se presentan estos datos como una prueba real del proveedor.

| Resultado en fallos parciales | Base | Candidata |
| --- | ---: | ---: |
| Visual inicial verificable, cuatro fallos × tres rutas | 0/12 | 12/12 |
| Contexto inicial preservado | 0/12 | 12/12 |
| Lecturas duplicadas dentro de la petición corregida | — | 0 |
| Errores privados filtrados | 0 | 0 |

También se probaron caída completa, falta de ambos metadatos, recuperación tras
un fallo, no cachear pares incompletos, conservar edad y pedir únicamente la
parte omitida en el navegador. Los resultados negativos iniciales de la prueba
se conservaron: un caso utilizaba un ID de bootstrap incorrecto y se corrigió
para usar su constante real; no se alteró el producto para hacerlo pasar.

## 2. Incidente histórico de Home y telemetría de Supabase

El incidente de LCP 7012 ms ocurrió a 2026-11-20T04:00:20.759Z; CF-Ray del
documento `a5d48c149ed20c61-GIG`, TTFB 1337,5 ms, 1715 bytes, sin identificadores
de preparación en la respuesta. La imagen empezó a ~4891 ms y terminó a ~6986 ms.
Eso demuestra descubrimiento tardío después del arranque, no siete segundos
de ejecución SQL ni siete segundos de almacenamiento R2.

La consulta oficial del intervalo de siete segundos localizó una lectura Worker
`site_media_document`, Request ID `01a1f71c-c8f4-7330-ace5-54549490a89a`,
Trace ID `7f544fc5421249c68f78036626b92025`, POST 200, origin_time 590 ms y Envoy
559 ms. Es temporalmente cercana y de nuestro cliente público, pero el documento
perdió la asociación exacta con sus subconsultas. **No basta para afirmar que esa
lectura concreta falló.** Los otros tres eventos rápidos sin client_info fueron
OPTIONS, no consultas SQL instantáneas: se comprobó el método HTTP explícitamente.

La rama que causa la pérdida se reprodujo y corrigió. No se inventa cuál de los
dos metadatos falló en aquel evento ni si el motivo fue timeout, cuerpo o parseo.
Evidencia: `upstream/incident-home-detailed.json`, fuentes conservadas y
`resilience-comparison.json`.

### Los picos upstream no se declaran resueltos

Se conservan los IDs históricos de Home/Browse con upstream de 920/831 ms y el
evento posterior de 923 ms: `01a1f714-e9a9-742c-a27d-60d717912a4a`.
El último usó H3 reutilizado y no pasó por nuestro Worker: no es explicable
solamente por DNS o R2. Gateway, Envoy y SQL son tramos distintos y solapados;
sus tiempos no deben sumarse ni etiquetarse todos como PostgreSQL.

Nuevos recorridos SPA y correlación oficial:

| Fase | Operación | HTTP ms | origin_time ms | Envoy ms | Request ID | CF-Ray |
| --- | --- | ---: | ---: | ---: | --- | --- |
| candidate | catalog_browse | 2,289.2 | 118 | 12 | 01a1f947-9716-79e6-9480-c954e306116f | a5d803b78813c2c1-LIM |
| candidate | catalog_browse | 2,391.5 | 111 | 11 | 01a1f94a-88f9-7286-9d3e-05ffa32f854b | a5d8086d3ea4953a-LIM |

Los dos nuevos picos fueron 2289 y 2392 ms, pero el gateway registró origin_time
118 y 111 ms, con Envoy 12 y 11 ms, un intento y H3 reutilizado sin nuevo DNS/TLS.
**La mayor espera no está dentro del tramo upstream publicado en esos eventos.**
Son diferentes de los picos históricos de 920/831/923 ms de Envoy. No se atribuyen
a SQL ni a nuestro Worker; tampoco se identifica al ISP, Chrome o Cloudflare como
culpable sin el tramo de transporte. Los relojes cliente/proveedor no están
calibrados: en controles rápidos hay desfases de ~90–110 ms; no se interpreta su
diferencia temporal como una medida exacta de una cola interna.

Se añadieron 50 lecturas diagnósticas con NetLog: 25 con guard CDP instrumentado
y 25 sin intercepción. HTTP p50/p95 fue 144/207 y 140/207 ms; el guard tardó
como máximo 0,7 ms y no hubo otra espera >750 ms. Esa cohorte no reproduce los
eventos anteriores: no prueba que desaparecieran ni descarta todo efecto raro
del entorno de medición. Los NetLog de cargas iniciales no contienen aquellas
dos peticiones SPA. El nuevo estudio no aumentó timeouts, no forzó protocolos,
no cambió DNS y conserva sus muestras y el error inicial del preflight del runner.

La consulta oficial de logs terminó correctamente.
El soporte necesita spans de recepción/despacho gateway/PostgREST, adquisición
de conexión, inicio/fin SQL, serialización y envío, ligados al mismo request/trace,
además de las series de pool/CPU/memoria de ese instante. Esos spans no están
disponibles en los registros exportados. Se preparó un paquete técnico, sin
enviar un ticket ni mensajes a terceros.

Se hicieron otras 50 RPC HTTP secuenciales, cada una rodeada de estadísticas SQL
de solo lectura. 50/50 tuvieron un único incremento atribuible;
las demás, si existen, permanecen ambiguas. HTTP p50/p95 143 / 218 ms;
Envoy 11 / 45 ms; SQL atribuible 10 / 40 ms, máximo
78.5 ms. Son otras peticiones: no sustituyen el tiempo SQL
desconocido de los picos históricos. No se reseteó ninguna estadística.

El informe `upstream/database.json` conserva EXPLAIN y una instantánea de
capacidad/pool. SQL Home fue 97,1/8,4/7,8 ms y Browse 13,3/8,3/8,4 ms. Hubo cero
bloqueos y transacciones abandonadas; no se equipara el primer plan más caro
con los picos de otro momento.

La métrica gauge pool_waiting llegó a 3 y available a 3, con máximo 10 y cero
timeouts; una lectura posterior dio waiting 0/available 6. Se verificó su HELP/TYPE
para no confundir la cola con un contador acumulado. MemAvailable fue ~121,5 MiB,
swap usado ~393,9 MiB, load1 0,06 y OOM 0. Committed_AS superaba CommitLimit en
~7,8 MiB: es memoria virtual comprometida, no RAM física consumida ni evidencia
de una pausa concreta. Es una señal para vigilar, sin serie correlacionada con
los IDs lentos. No se recomienda cambiar de plan como solución demostrada de
estos eventos ni se añadieron índices.

## 3. Navegador real: antes y después

Después de terminar calidad se repitió la base antes de activar la candidata.
Son 90 cargas por versión: cinco procesos Chrome nuevos por perfil/ruta,
cada uno con recarga caliente. Se conservaron además las 90 cargas y 15 recorridos
base del turno anterior como una cohorte separada; no se sustituyeron muestras.

Escritorio: 1440 × 900, CPU normal. Móvil 4G: 390 × 844, DPR 2, CPU×4,
9 Mbps/80 ms. Móvil lento: mismas dimensiones/CPU, 1,6 Mbps/150 ms. Se usaron
servicios reales y respuestas ordinarias, sin sustitución de datos. Las cargas
iniciales no utilizan override de versión. En los recorridos SPA, el runner
heredado fija por cabecera la misma versión que comprobó activa al 100 %; no
compara una versión inactiva como si fuera el despliegue vigente. Esa diferencia
de instrumentación queda explícita, sin presentarla como tráfico de producción.
El guard rechazó escrituras ajenas a las RPC públicas de lectura. No hubo pedidos
ni pagos reales. Caché fría significa navegador, no MISS forzado de CDN o R2.

Valores temporales p50 / p95, ms. Con cinco muestras por celda, p95 es el máximo;
no es una estimación robusta de la cola de producción. Bytes y solicitudes son
medianas de la ventana registrada. React indica el relevo interactivo, no el
primer HTML visual ni una hidratación completa de React.

| Perfil | Ruta | Caché | LCP antes → después | TTFB antes → después | React antes → después | Bytes antes → después | Solicitudes antes → después |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Escritorio | Home | Fría | 804 / 1,000 → 864 / 1,012 | 356 / 556 → 368 / 491 | 728 / 910 → 764 / 950 | 1,459,734 → 1,459,300 | 30 → 30 |
| Escritorio | Home | Caliente | 208 / 256 → 208 / 220 | 141 / 165 → 140 / 147 | 183 / 231 → 185 / 199 | 15,765 → 15,895 | 30 → 30 |
| Escritorio | Tienda | Fría | 732 / 836 → 632 / 840 | 340 / 411 → 228 / 384 | 771 / 799 → 592 / 807 | 476,263 → 476,472 | 17 → 17 |
| Escritorio | Tienda | Caliente | 220 / 236 → 196 / 208 | 126 / 146 → 117 / 120 | 202 / 220 → 176 / 188 | 16,045 → 16,136 | 17 → 17 |
| Escritorio | Producto | Fría | 616 / 812 → 680 / 740 | 288 / 351 → 285 / 382 | 626 / 784 → 645 / 711 | 840,433 → 840,398 | 20 → 20 |
| Escritorio | Producto | Caliente | 216 / 228 → 212 / 232 | 146 / 158 → 150 / 162 | 196 / 209 → 191 / 217 | 15,677 → 15,896 | 20 → 20 |
| Móvil 4G | Home | Fría | 860 / 916 → 836 / 976 | 276 / 297 → 265 / 366 | 1,068 / 1,135 → 1,103 / 1,479 | 1,257,258 → 1,257,250 | 29 → 29 |
| Móvil 4G | Home | Caliente | 348 / 376 → 236 / 292 | 140 / 160 → 144 / 159 | 349 / 458 → 366 / 416 | 16,033 → 15,954 | 29 → 29 |
| Móvil 4G | Tienda | Fría | 1,080 / 1,124 → 1,072 / 1,132 | 295 / 310 → 308 / 340 | 1,052 / 1,091 → 1,046 / 1,131 | 452,842 → 452,571 | 16 → 16 |
| Móvil 4G | Tienda | Caliente | 364 / 400 → 352 / 432 | 116 / 129 → 121 / 144 | 345 / 384 → 336 / 413 | 16,135 → 16,036 | 16 → 16 |
| Móvil 4G | Producto | Fría | 1,144 / 1,204 → 1,148 / 1,448 | 296 / 347 → 298 / 562 | 1,093 / 1,163 → 1,099 / 1,412 | 587,415 → 587,517 | 17 → 17 |
| Móvil 4G | Producto | Caliente | 396 / 488 → 400 / 476 | 153 / 187 → 147 / 157 | 373 / 457 → 375 / 447 | 15,692 → 15,864 | 17 → 17 |
| Móvil lento | Home | Fría | 2,152 / 2,284 → 2,224 / 2,636 | 269 / 413 → 349 / 702 | 2,645 / 2,777 → 2,695 / 3,116 | 465,121 → 465,198 | 26 → 26 |
| Móvil lento | Home | Caliente | 344 / 476 → 468 / 476 | 161 / 308 → 153 / 173 | 469 / 599 → 594 / 610 | 15,843 → 15,734 | 26 → 26 |
| Móvil lento | Tienda | Fría | 2,496 / 2,548 → 2,524 / 3,540 | 272 / 354 → 261 / 354 | 2,464 / 2,517 → 2,496 / 3,511 | 452,633 → 452,984 | 16 → 16 |
| Móvil lento | Tienda | Caliente | 572 / 792 → 464 / 612 | 152 / 256 → 156 / 181 | 556 / 770 → 448 / 591 | 15,985 → 16,142 | 16 → 16 |
| Móvil lento | Producto | Fría | 2,208 / 2,300 → 2,212 / 2,260 | 322 / 421 → 333 / 349 | 2,708 / 2,781 → 2,691 / 2,750 | 587,474 → 587,365 | 17 → 17 |
| Móvil lento | Producto | Caliente | 444 / 520 → 448 / 504 | 160 / 176 → 157 / 207 | 417 / 492 → 420 / 474 | 15,680 → 15,889 | 17 → 17 |

| Fase | CLS máximo inicial | Errores JS | Grupos con overflow | Documentos con fallback/diagnóstico |
| --- | ---: | ---: | ---: | ---: |
| Base | 0 | 0 | 0 | 0 |
| Candidata | 0 | 0 | 0 | 0 |

Se comprobó que las URLs de las fotografías principales sean las mismas en ambas
versiones. La tabla conserva regresiones y variaciones de red: no se convierte
una mediana menor en prueba causal de que el CSS, R2 o Supabase fueron optimizados.
No se implementaron nuevos gates de módulos, cambios de fuentes o fragmentaciones:
los experimentos previos descartados mantienen sus resultados negativos.

El CSS compartido y el relevo de React siguen contribuyendo a la primera carga.
Las lecturas editoriales que vencen a los 30 segundos deben renovarse; retirarlas
para hacer desaparecer una espera rompería la frescura. Bloqueo observado, heap,
descubrimiento y decodificación se incluyen en comparison.json y las trazas;
no se confunden con INP de campo o una medición física de teléfonos.

Se investigó el peor caso nuevo de Tienda móvil lenta: LCP 3540 ms, TTFB 261 ms,
imagen descargada a ~1424 ms y decodificada a ~1429 ms, CSS terminado a ~1803 ms,
React a ~3511 ms. Hubo una sola descarga de la foto; el segundo load es otra
instancia DOM. Una renovación public_media_aliases de ~716 ms precede y bloquea
el relevo según la barrera existente de main.tsx. La edad exacta de aquel
bootstrap no se guardó; la caducidad editorial es una explicación compatible,
no una marca temporal inventada. No se quitó la renovación ni se amplió su TTL
para mejorar el percentil. Tampoco se atribuyeron esos 3,5 s a R2: el manifiesto
de esa foto tardó 23 ms y almacenamiento/caché 5 ms. Las animaciones conservadas
y la sustitución progresiva pueden separar decodificación y LCP final.

### SPA y filtros

Cinco recorridos por perfil/version y el mismo calentamiento completo previo:
150 pasos medidos por versión, más 150 de calentamiento excluidos. Se verificaron
Home/Tienda, marcas, filtros, ordenamiento, ficha, variantes, carrito, Contacto y
entrada en checkout. No se enviaron pedidos. Tiempos p50 / p95 en ms:

| Perfil | Paso | Datos/interfaz antes → después | RPC HTTP antes → después | Número mediano RPC antes → después |
| --- | --- | ---: | ---: | ---: |
| Escritorio | Home | 172 / 191 → 178 / 244 | 163 / 182 → 178 / 234 | 1 → 1 |
| Escritorio | Tienda | 148 / 204 → 146 / 153 | 141 / 197 → 139 / 146 | 1 → 1 |
| Escritorio | brand-lattafa | 148 / 263 → 150 / 163 | 142 / 256 → 144 / 157 | 1 → 1 |
| Escritorio | sort-price | 159 / 177 → 164 / 2,295 | 154 / 171 → 159 / 2,289 | 1 → 1 |
| Escritorio | remove-brand-filter | 145 / 185 → 152 / 185 | 139 / 180 → 146 / 179 | 1 → 1 |
| Escritorio | Producto | 165 / 200 → 157 / 172 | 158 / 192 → 150 / 164 | 1 → 1 |
| Escritorio | add-local-cart | 2 / 2 → 2 / 2 | 149 / 171 → 139 / 164 | 1 → 1 |
| Escritorio | contact | 7 / 7 → 8 / 9 | — / — → — / — | 0 → 0 |
| Escritorio | cart | 6 / 7 → 7 / 7 | — / — → — / — | 0 → 0 |
| Escritorio | checkout | 146 / 212 → 194 / 234 | 135 / 201 → 184 / 224 | 1 → 1 |
| Móvil 4G | Home | 218 / 233 → 207 / 220 | 169 / 181 → 157 / 171 | 1 → 1 |
| Móvil 4G | Tienda | 218 / 233 → 221 / 245 | 173 / 189 → 176 / 199 | 1 → 1 |
| Móvil 4G | brand-lattafa | 205 / 211 → 211 / 229 | 169 / 173 → 174 / 188 | 1 → 1 |
| Móvil 4G | sort-price | 199 / 217 → 199 / 245 | 173 / 190 → 174 / 219 | 1 → 1 |
| Móvil 4G | remove-brand-filter | 198 / 201 → 186 / 199 | 172 / 175 → 159 / 174 | 1 → 1 |
| Móvil 4G | Producto | 202 / 203 → 203 / 205 | 164 / 166 → 164 / 165 | 1 → 1 |
| Móvil 4G | add-local-cart | 11 / 13 → 12 / 13 | 167 / 180 → 147 / 174 | 1 → 1 |
| Móvil 4G | contact | 38 / 38 → 37 / 39 | — / — → — / — | 0 → 0 |
| Móvil 4G | cart | 36 / 37 → 35 / 38 | — / — → — / — | 0 → 0 |
| Móvil 4G | checkout | 208 / 230 → 224 / 280 | 161 / 184 → 175 / 218 | 1 → 1 |
| Móvil lento | Home | 237 / 248 → 245 / 265 | 191 / 200 → 197 / 216 | 1 → 1 |
| Móvil lento | Tienda | 247 / 261 → 250 / 264 | 201 / 217 → 205 / 218 | 1 → 1 |
| Móvil lento | brand-lattafa | 225 / 363 → 235 / 2,428 | 187 / 327 → 199 / 2,392 | 1 → 1 |
| Móvil lento | sort-price | 216 / 232 → 218 / 234 | 188 / 205 → 191 / 207 | 1 → 1 |
| Móvil lento | remove-brand-filter | 225 / 231 → 227 / 230 | 198 / 206 → 200 / 204 | 1 → 1 |
| Móvil lento | Producto | 229 / 282 → 234 / 246 | 188 / 193 → 192 / 205 | 1 → 1 |
| Móvil lento | add-local-cart | 11 / 12 → 12 / 16 | 191 / 199 → 189 / 201 | 1 → 1 |
| Móvil lento | contact | 38 / 39 → 37 / 39 | — / — → — / — | 0 → 0 |
| Móvil lento | cart | 35 / 36 → 36 / 37 | — / — → — / — | 0 → 0 |
| Móvil lento | checkout | 241 / 251 → 240 / 242 | 192 / 198 → 189 / 196 | 1 → 1 |

### DNS con NetLog

Se registró NetLog Default en los 90 procesos nuevos, con los mismos argumentos
en ambas versiones. No se cambió resolver, DNS del sistema, HTTP/2 o HTTP/3.
Los spans exportados se limitan al hostname de staging, sin direcciones ni
credenciales. Los logs crudos permanecen locales e ignorados por Git.

| Fase | DNS frío p50 / p95, ms | DNS >750 ms | Fallback/diagnóstico en frío |
| --- | ---: | ---: | ---: |
| Base | 7 / 66 | 0/45 | 0/45 |
| Candidata | 7 / 44 | 0/45 | 0/45 |

Si no se reproduce el retraso, no se considera solucionado. Un span de resolución
identifica una etapa del navegador, no al ISP, Cloudflare o Supabase como culpable.
Los episodios previos y su variación permanecen en los tres informes de referencia.

## 4. Worker y R2

Se realizaron 60 lecturas acotadas por versión: descubrimiento, 50 recursos
multimedia y nueve documentos. No hubo purge, cache bust, subida o cambio de
permisos. La política de medios y su código no se modificaron. Tiempos p50/p95, ms:

| Tipo | n/fase | Cabeceras antes → después | Cuerpo antes → después | Manifiesto HTTP antes → después | Upstream Envoy antes → después | Almacenamiento/caché antes → después | HIT antes → después |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| webp | 20 | 150 / 164 → 146 / 156 | 32 / 40 → 30 / 42 | 20 / 31 → 19 / 24 | 2 / 5 → 2 / 4 | 4 / 6 → 4 / 5 | 20/20 → 20/20 |
| svg | 5 | 162 / 164 → 142 / 153 | 0 / 3 → 1 / 6 | 22 / 26 → 22 / 23 | 4 / 6 → 2 / 3 | 4 / 13 → 4 / 14 | 5/5 → 5/5 |
| conditional | 25 | 143 / 165 → 140 / 146 | 0 / 0 → 0 / 0 | 19 / 41 → 20 / 25 | 2 / 4 → 2 / 3 | 4 / 7 → 4 / 5 | 25/25 → 25/25 |
| document | 9 | 149 / 184 → 144 / 196 | 24 / 57 → 10 / 36 | — / — → — / — | — / — → — / — | — / — → — / — | 0/9 → 0/9 |

| Fase | CPU Worker p50/p95, ms | Wall p50/p95, ms | IDs correlacionados/solicitados |
| --- | ---: | ---: | ---: |
| Base | 1 / 3 | 26 / 57 | 26/76 |
| Candidata | 1 / 7 | 26 / 72 | 26/76 |

Wall incluye I/O y waitUntil; no equivale a TTFB. Se indican solo IDs realmente
recibidos por Tail. La caché sigue siendo de bytes inmutables; no se cachea una
decisión de publicación. El bucket no tiene acceso público directo. Diferencias
de estos tiempos no se presentan como una mejora del almacenamiento implementada.

## 5. Pruebas, integraciones y despliegue

| Suite | Resultado final |
| --- | --- |
| catalog | 109 aprobadas, 0 fallidas |
| seo | 86 aprobadas, 0 fallidas |
| media-worker | 169 aprobadas, 0 fallidas |
| home | 8 aprobadas, 0 fallidas |
| checkout | 30 aprobadas, 0 fallidas |
| account | 97 aprobadas, 0 fallidas |
| favorites | 19 aprobadas, 0 fallidas |
| navigation | 48 aprobadas, 0 fallidas |
| Consumidores de fragmentos omitidos | 2 aprobadas |
| Node | 216 aprobadas |
| TypeScript, ESLint, build, paquete sellado y Wrangler dry-run | Aprobados |

Son 568 ejecuciones Playwright
aprobadas en las suites afectadas y casos adicionales, no todas las pruebas
históricas del repositorio. Se volvieron a ejecutar las 86 pruebas SEO después
del último ajuste del Worker. No se ampliaron timeouts ni reintentos.

En staging se completaron 24 vistas públicas de cuatro rutas en 360, 390, 430,
768, 1024 y 1440 px; Datos/Entrega/Revisión/volver en seis tamaños sin enviar
pedido; aislamiento con dos clientes y un administrador AAL2 temporales y
retirada de sus fixtures; 56 verificaciones HTTP de permisos, privacidad y CORS.
Las fotografías y el vídeo exclusivo de escritorio conservan sus verificaciones.

| Elemento | Estado verificado |
| --- | --- |
| Staging | aroma-infini-frontend-staging |
| Versión activa al 100 % | 2cc50b35-6d4c-4a79-9487-6084f9087a33 |
| Deployment | bb1ad82f-a865-4ee4-8d0c-16d2c895dd5e |
| Entrada JS | /assets/index-DOahbtc2.js |
| SHA-256 entrada | 47cea1b10ee236aae906e8a1a661c66b4556897d01ff0086458fd8266f4a1530 |
| SHA-256 paquete | d6c2b915881e66158ed3e3b3a3655297d263be9955ba7003d3d557a7ed78c54b |
| Worker ETag | 6ba3f99f0d8f090bb9dac3a64235bd9dabcf946c0a37e88bbf478c9c01c56296 |
| Recursos JS/CSS/fuentes/PWA | 140 hashes verificados |
| Estilos/fuentes | 42 archivos idénticos a la base |
| Supabase | 49 migraciones, 0 pendientes; hashes coincidentes |
| Tipos oficiales | 021857a7c45356d3764d86c8302cdaf5c7fd06d3e6952f6d180d85015ccae891 |
| RLS/roles/permisos | Fundamentos verificados, sin cambios |
| R2 | aroma-infini-media-dev privado, r2.dev y dominio directo desactivados |
| Producción | Intacta: ec8554f6-d47a-4af0-ba60-4623c8125020; deployment 9baa7c50-262a-4f23-bf52-5742a52ffa0b |

Se mantuvieron los cambios locales anteriores y la rama develop. No se hizo
commit, push, reset ni limpieza. La simulación de fallos no tocó datos comerciales.
El build solo retiró copias generadas redundantes de dist según su proceso
existente, conservando fuentes y archivos de R2.

## Límites y evidencias reproducibles

La pérdida colectiva de datos ante un fallo auxiliar está corregida y cubierta.
No se afirma que el proveedor haya dejado de tener picos, que cualquier caída
permita pintar una foto sin referencia verificable o que todo LCP frío haya
mejorado. La telemetría interna pendiente está descrita en el paquete para soporte.
No se recomienda pagar más compute sin una comparación causal de capacidad.

Los errores del propio runner permanecen registrados: una expectativa nueva usó
un ID de bootstrap equivocado; el primer intento de NetLog tuvo una variable
path que ocultaba al módulo de Node y falló antes de abrir Chrome. Ambos se
corrigieron conservando logs, sin descartar una medición negativa de la web.
El primer guard del diagnóstico de transporte bloqueó OPTIONS antes de su
primera RPC; se conservó su NetLog y se corrigió el preflight del runner.

Reproducción: tests.mjs, extra-tests.mjs y resilience-comparison.mjs para entornos
aislados; release.mjs con acción quality para build/calidad; browser-final.mjs,
spa-final.mjs y worker-final.mjs para lecturas públicas; compare.mjs,
netlog-analysis.mjs y upstream/new-requests.mjs para los resultados. No ejecutar
activate.mjs como una comprobación: ese script sí publica una versión de staging.
Los scripts de identidades temporales deben ejecutarse únicamente con su ámbito
de prueba y limpieza propios.

Evidencias principales: comparison.json; browser-before-final.json; browser-after-final.json;
spa-final-baseline/candidate.json; worker-before/after.json; resilience-comparison.json;
netlog-analysis.json; upstream/incident-home-detailed.json; upstream/new-requests.json;
upstream/paired-sql-http.json; upstream/transport-probe.json; upstream/database.json;
upstream/pool-metric-definition.json; upstream/support-packet.md;
tests.json; catalog-partials.json; quality-final.json; runtime-verified.json;
schema-final.json; environments-final.json; style-proof.json; final-checks.json;
preservation-final.json; traces/, netlogs/, screens/ y spa-final-screens/.

Capturas: [Home móvil](../artifacts/advanced-public-2026-11-19/screens/after-final-slowMobile-home-cold.png),
[Tienda móvil](../artifacts/advanced-public-2026-11-19/screens/after-final-slowMobile-store-cold.png),
[Producto móvil](../artifacts/advanced-public-2026-11-19/screens/after-final-slowMobile-product-cold.png),
[Checkout](../artifacts/advanced-public-2026-11-19/checkout-after/revision-390.png).

Referencias oficiales: [streaming en Workers](https://developers.cloudflare.com/workers/runtime-apis/streams/),
[observabilidad y fuentes de Supabase](https://supabase.com/docs/guides/observability/logs),
[campos de correlación](https://supabase.com/docs/guides/observability/log-field-reference).
