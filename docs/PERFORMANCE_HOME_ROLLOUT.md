# Home y marcas: despliegue de las proyecciones públicas

La migración `20261105000200_home_catalog_projection.sql` y el cliente que usa
`catalog_home_context` y `catalog_brand_previews` están preparados. Las dos
migraciones de rendimiento del 5 de noviembre se aplicaron al proyecto de
desarrollo con la CLI y el enlace de proyecto verificado. Las RPC nuevas ya
existen allí. El 6 de noviembre se publicó y verificó el nuevo frontend en
staging durante la [auditoría de lanzamiento](LAUNCH_AUDIT_2026_11_06.md), versión
final `4f8de15c-b72b-4a0b-b93d-ce26851a52c5`. Producción conserva su esquema y
frontend anteriores; requiere autorización y el orden siguiente.

Orden de despliegue requerido:

1. Aplicar primero la migración SQL en el entorno autorizado y esperar la
   recarga del esquema de PostgREST. Las funciones existentes siguen disponibles.
2. Verificar que ambas nuevas RPC sean legibles por `anon` y `authenticated`,
   con el propietario `aro_api_executor`, sin cambios en las políticas RLS.
3. Publicar después el frontend asociado. Un retroceso del frontend puede
   conservar las nuevas funciones: no cambian tablas, datos ni contratos previos.

Si una RPC falta o falla, el cliente muestra el error de lectura existente.
No descarga silenciosamente el catálogo completo ni utiliza datos locales como
sustitución. Por ello, el nuevo frontend requiere que la migración ya esté activa.

Home conserva los perfiles públicos mínimos en el mismo orden `display_rank,id`
que el snapshot anterior, las cuatro fichas más vendidas y las fichas publicadas
referenciadas por el Hero. Las opciones siguen usando el mismo código JavaScript
de etiquetas, normalización y orden. El recomendador completo mantiene su lectura
en la interacción y sus reglas comerciales. Los perfiles siguen siendo O(N), con
el mismo límite explícito de 10000 productos; no se recortan opciones ni se agrupan
etiquetas de forma que cambie cuál prevalece en un valor normalizado repetido.

Marcas obtiene la portada del primer producto público de cada firma con el mismo
orden del catálogo y conserva los manifiestos de imagen que utiliza esa portada.
