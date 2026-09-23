# Ubigeo, avisos comerciales y reseñas de demostración

## Ubigeo del Perú

El checkout, las direcciones de cuenta y la configuración de envíos comparten
una única fuente tipada. La jerarquía es **departamento → provincia → distrito**,
que corresponde a la división administrativa oficial disponible en el conjunto
de datos de INEI. La versión incluida contiene 25 departamentos, 196 provincias
y 1,891 distritos.

La fuente es `UBIGEOS_2022_1891_distritos.csv`, publicada por el Instituto
Nacional de Estadística e Informática en la Plataforma Nacional de Datos
Abiertos bajo ODbL. `scripts/generate-peru-ubigeo.mjs` transforma el CSV oficial
en `src/data/peru-ubigeo.json`; el resultado se versiona para que el checkout no
dependa de una petición externa durante la compra.

Una ubicación seleccionable no implica cobertura comercial. El panel debe
activar una regla con tarifa y plazo confirmados. El resolvedor prioriza distrito,
luego provincia y finalmente departamento. Así se pueden definir excepciones sin
duplicar la lógica entre tienda y administración.

## Avisos comerciales de muestra

El Home incluye una vista previa cerrable con tres estados: popularidad, novedad
y stock bajo. Cada mensaje contiene la palabra “ejemplo”, no inventa compradores,
ciudades ni contadores y aparece una sola vez por sesión. No mueve el foco y
respeta `prefers-reduced-motion`.

La dirección visual toma la brevedad de las etiquetas de catálogo vistas en
Jovoy, D.S. & Durga y Phlur, manteniendo el tono sobrio de Aroma Infini. En
producción cada estado deberá proceder de un dato real: ventas, fecha de alta o
stock de variante.

Las fichas disponibles muestran además un aviso compacto “Entre los más
vendidos”. Aparece una sola vez por producto y sesión, no mueve el foco y explica
que la señal solo podría publicarse como real cuando exista historial de ventas
confirmado.

## Reseñas de muestra

La ficha incluye un bloque visual con tres opiniones ficticias. El encabezado y
cada registro indican que son una vista previa. No se añaden datos estructurados,
identidades reales ni afirmaciones de compra verificada. El patrón de puntuación
y conteo se inspira en la claridad comercial observada en Twisted Lily, con una
composición más editorial y aireada para Aroma Infini.

Antes de publicar reseñas reales se necesitan: identidad o alias autorizado,
relación con una compra, política de moderación, mecanismo de denuncia y reglas
para cálculo de promedio.
