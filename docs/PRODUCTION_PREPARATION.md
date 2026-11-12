# Preparación de producción — Aroma Infini

**Comprobación actual, 12 de noviembre:** consultar la [auditoría de sincronización y limpieza](SUPABASE_SYNC_CLEANUP_2026_11_12.md). Desarrollo tiene 37 migraciones y producción 25; las doce pendientes de producción están preparadas para revisión, sin ejecutar. Los apartados siguientes conservan evidencia histórica y no describen automáticamente el esquema actual. El plan pendiente no autoriza un despliegue o la apertura comercial.

**Última comprobación alojada, 7 de noviembre:** consultar la [auditoría de seguridad y robustez](SECURITY_ROBUSTNESS_AUDIT_2026_11_07.md), además del [checklist de lanzamiento](LAUNCH_AUDIT_2026_11_06.md). Desarrollo tiene 28 migraciones y producción conserva 25. El [mantenimiento del 8 de noviembre](PROJECT_HEALTH_IMPROVEMENTS_2026_11_08.md) es local y no constituye un despliegue ni una autorización de apertura. Los apartados fechados debajo conservan evidencia histórica; sus cifras y afirmaciones no describen automáticamente el estado actual.

**Cierre de auditoría del 4 de noviembre:** véase [auditoría integral vigente](FULL_SITE_AUDIT_2026_11_04.md). Ambas bases tienen 25 migraciones; los respaldos renovados restauraron 68 tablas por entorno. El informe distingue las integraciones de dominio/pagos de la validación del contenido, la transición de respaldos y las pruebas en dispositivos físicos todavía necesarias.

**Decisión posterior de respaldos, 4 de noviembre:** producción utilizará
Supabase Pro para PostgreSQL y un respaldo independiente de R2 en la nube.
La transición está [preparada y documentada](BACKUP_PRO_TRANSITION.md), todavía
sin contratación/activación ni retiro de las protecciones locales. Esa
verificación operativa se añade a las condiciones de apertura comercial.

Estado comprobado el **2 de noviembre de 2026**, hora de Lima.

Revisión adicional del **4 de noviembre de 2026**: véase el cierre al final
de este documento. Conserva dominio y Mercado Pago real sin activar.

La preparación técnica de esta etapa está terminada. El sitio de desarrollo
continúa operativo en staging. Producción tiene recursos propios y permanece
sin ruta pública, indexación ni compras. Las dos integraciones de activación
pendientes son el **dominio definitivo** y **Mercado Pago real**.

## Entornos separados

| Recurso               | Desarrollo / staging                                         | Producción preparada                                                     |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Supabase              | `aroma-infini-dev` · `tkxvexfapszilzhogvgu`                  | `aroma-infini-prod` · `ogpfhhucnaldgxyqajkc`                             |
| Organización Supabase | Organización existente                                       | `aroma-infini-production`, plan gratuito                                 |
| SQL                   | 22 migraciones aplicadas                                     | Las mismas 22 migraciones; sin copiar clientes ni catálogo de desarrollo |
| R2                    | `aroma-infini-media-dev`                                     | `aroma-infini-media-prod`, privado y vacío                               |
| Worker                | `aroma-infini-frontend-staging`                              | `aroma-infini-frontend-production`                                       |
| Acceso público        | URL de staging existente                                     | `workers_dev=false`, `preview_urls=false`, sin dominio/rutas             |
| Compra                | Simulación explícita, sin cobros ni consumo de stock/cupones | Simulación deshabilitada; compra real aún bloqueada                      |

El Worker de producción tiene secretos propios, cron de limpieza, limitadores
separados, logs y trazas. Su ubicación declarada es `aws:sa-east-1`, junto a
Supabase. No se activó un plan de pago. Los buckets no publican una URL `r2.dev`.
La base de producción exige SSL en conexiones externas.

La configuración pública específica está en `.env.production.local`, ignorado
por Git. No contiene claves privilegiadas. `supabase/config.production.toml`
conserva las decisiones reproducibles de API, Auth y SSL; el workspace aislado
de CLI se mantiene en `artifacts/production-bootstrap-2026-11-01/workspace/`.
No eliminar ese workspace ni las herramientas operativas de backups al limpiar
capturas. El enlace de la raíz continúa apuntando a desarrollo.

## Funcionalidades cerradas en esta etapa

- **Reseñas:** lectura pública real, publicación autenticada, una por usuario y
  producto, reintentos sin duplicación y resumen calculado desde registros
  publicados. SQL y navegador rechazan expresiones ofensivas comunes; admiten
  críticas negativas respetuosas. El filtro es léxico y no puede garantizar
  detectar todas las ofensas o insinuaciones. No se presentan compras verificadas
  ni valoraciones ficticias. Productos no permite editar opiniones de clientes.
- **Datos de la tienda:** `/admin/configuracion` centraliza identidad, contacto,
  redes y textos de privacidad, términos y devoluciones. Usa versiones y controla
  conflictos; un fallo no sustituye datos confirmados por ejemplos. Contacto,
  ayuda y footer consumen el mismo documento. Los perfiles sociales vacíos se
  ocultan. Se retiró la configuración estática duplicada que ya no se utilizaba.
- **Libro de reclamaciones:** formulario público, correlativo y constancia PDF;
  registro privado, búsqueda, paginación y atención con historial desde
  `/admin/reclamaciones`. Los reintentos conservan la misma operación. Marcar
  Respondido requiere respuesta escrita y constancia de entrega; no se afirma
  que un correo se envió automáticamente. No se implementó SMTP.
- **SEO:** metadatos del catálogo y sitemap dinámico preparados con una política
  compartida. Staging y producción cerrada mantienen `noindex`. La activación
  futura exige dominio correcto y catálogo confirmado; las rutas privadas y los
  filtros adicionales no se indexan.
- **Rutas:** corregido el acceso directo y la recarga de
  `/admin/productos/:id/fotos`, además de las nuevas vistas administrativas.

Los datos legales, contacto, horarios y políticas permanecen **simulados por
instrucción del propietario**, identificados y editables desde Configuración.
Las tarifas provisionales autorizadas son S/10 courier y S/15 motorizado,
1–2 días hábiles, Lima y Callao, envío gratuito desde **S/330**. Provincias siguen
deshabilitadas. Los datos de demostración no son afirmaciones comerciales
definitivas ni una certificación de cumplimiento legal.

## Administrador y autenticación

La cuenta de producción `aromainfiniweb@gmail.com` se creó directamente mediante
la administración de Supabase, con membresía por UUID. No se copió la contraseña
de desarrollo. La contraseña inicial aleatoria se conserva cifrada mediante
Windows DPAPI en
`artifacts/production-bootstrap-2026-11-01/protected/administrator-password.dpapi`.
No aparece en código, informes ni chat. El propietario puede establecer su
contraseña desde **Authentication → Users** antes de usar el nuevo entorno.

Se comprobó el inicio de sesión y que las consultas administrativas de catálogo,
reclamaciones y comercio se rechazan sin MFA. El primer acceso por el futuro
dominio solicitará activar TOTP mediante la aplicación autenticadora del titular;
no se inscribió un factor que el titular no controle.

El registro de clientes no requiere confirmar correo. Recuperación por código
de un solo uso y cambio de correo con contraseña actual conservan sus funciones
propias, sin SMTP. Las funciones de producción están desplegadas y rechazan
orígenes hasta configurar el dominio definitivo. La contraseña y la clave DPAPI
deben mantenerse fuera de capturas y tickets de soporte.

## Respaldo gratuito y recuperación

Este apartado describe la protección transitoria que sigue activa. El destino
de producción comercial es [Supabase Pro + respaldo R2 independiente](BACKUP_PRO_TRANSITION.md);
la copia local dejará de ser habitual para producción solo tras las cinco
condiciones y la autorización expresa allí documentadas.

La tarea de Windows **Aroma Infini - Respaldos locales protegidos** está habilitada
diariamente a las **02:00 de Lima**. Su primera ejecución terminó con resultado
`0` y aprobó desarrollo y producción.

- SQL de roles, esquema y datos de `api`, `app`, `auth` y `private` desde snapshot
  consistente, con TLS verificado y exportador oficial PostgreSQL.
- Objetos estables R2 del mismo snapshot, incluidos borradores y sus derivados;
  cada archivo se verifica por tamaño y SHA-256.
- Paquetes cifrados AES-256-GCM; clave protegida por DPAPI del usuario de Windows;
  carpetas con ACL privada. No quedan paquetes SQL en claro tras el éxito.
- Restauración en PostgreSQL local aislado: contenido de todas las tablas,
  secuencias, claves foráneas, roles, RLS y lectura pública/privada verificados.
- Desarrollo: cinco activos, quince objetos R2. Producción: cero objetos.
  Ambos respaldos restauraron 64 tablas y aprobaron once comprobaciones.

**Requiere el equipo encendido, sesión iniciada, red y sesiones CLI vigentes.**
No es una copia externa: DPAPI necesita el mismo perfil de Windows; perder ese
perfil/equipo puede impedir recuperar las copias. La restauración prueba SQL de
Auth, no recrea el servicio GoTrue, claves JWT ni secretos alojados. No se
contrató PITR, almacenamiento externo ni alertas de pago. No se habilitó borrado
automático por retención.

Procedimiento y comandos: [operación de respaldos](../supabase/README.md#respaldos-protegidos-operativos--2-de-noviembre-de-2026).
No borrar `artifacts/protected-backups/`, herramientas PostgreSQL o archivos DPAPI
como si fueran capturas temporales. Se retiró el ZIP instalador de PostgreSQL
de 340,7 MB después de comprobar los ejecutables extraídos; las herramientas y
el certificado siguen disponibles.

## Validación y evidencias

| Comprobación                   | Resultado                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL aislado             | 22 migraciones, 542 comprobaciones y carreras de catálogo, medios, Home, pedidos y favoritos aprobadas                             |
| Reseñas                        | 14 pruebas aprobadas                                                                                                               |
| Configuración                  | 16 pruebas aprobadas                                                                                                               |
| Reclamaciones                  | 19 pruebas aprobadas                                                                                                               |
| Metadatos/sitemap en workerd   | 26 pruebas aprobadas                                                                                                               |
| Rutas                          | 4 regresiones aprobadas                                                                                                            |
| Interfaces existentes          | 15 regresiones aprobadas                                                                                                           |
| Auth y cuenta                  | 65 regresiones aprobadas, incluida recuperación sin SMTP                                                                           |
| Navbar y footer                | 9 regresiones aprobadas                                                                                                            |
| Guardas de backup/restauración | 41 pruebas aprobadas                                                                                                               |
| Guardas de producción/staging  | 41 pruebas aprobadas                                                                                                               |
| Acceso público alojado         | 53 comprobaciones aprobadas, sin escrituras                                                                                        |
| HTTP/medios de staging         | 25 contratos; cinco imágenes y quince derivados reales aprobados                                                                   |
| Visual alojado                 | 135 comprobaciones, 15 capturas, cero errores JS ni desbordamientos                                                                |
| Flujo alojado                  | Reseña respetuosa/insulto, reintento, reclamación, MFA, historial y conflicto de versión aprobados; registros temporales retirados |
| Producción cerrada             | API/SSL, configuración independiente, Auth sin confirmación, administrador con MFA obligatorio y URL Worker cerrada comprobados    |

Capturas reales: 1920×1080, 1440×900, 1366×768, 768×1024 y 390×844. Las capturas
administrativas usan transporte SDK aislado; las públicas también se verificaron
contra staging/Supabase/R2 reales. No se presenta la prueba aislada como carga
de producción.

Los resultados sin credenciales están en `artifacts/closure-2026-11-02/`,
`artifacts/closure-hosted-2026-11-02/result.json`,
`artifacts/production-bootstrap-2026-11-01/{services-result,worker-result,closed-validation}.json`
y `artifacts/backup-readiness/latest-scheduled.json`.

## Activación posterior

1. **Dominio:** asociarlo mediante `custom_domain` en `env.production`, actualizar
   `VITE_SITE_URL`, `SEO_SITE_URL`, `MEDIA_ALLOWED_ORIGINS`, URL de Auth y callbacks,
   y `ACCOUNT_ACTION_ALLOWED_ORIGINS`. Reconstruir y desplegar el entorno de
   producción; verificar los mismos flujos por ese dominio. Los enlaces públicos
   no se sustituyen por un dominio inventado.
2. **Mercado Pago:** integrar credenciales propias del servidor, creación de pago,
   notificaciones verificadas, conciliación e inventario/cupones transaccionales.
   Solo entonces habilitar compras reales; activar una bandera no completa la
   integración. Staging continúa simulado.

Antes de abrir comercialmente, el titular revisa los contenidos simulados que
autorizó para esta etapa y carga su catálogo/material definitivo. No se copió
automáticamente el catálogo de desarrollo. El sistema de edición ya está listo.

`npm run production:check` debe continuar bloqueado sin dominio y pago real.
Los bloqueos actuales de dominio, origen de API/cargas y alineación SEO derivan
del mismo dominio faltante. El chequeo es local; nunca declara por sí solo una
publicación comercial lista.

Referencias: [entornos Worker](https://developers.cloudflare.com/workers/wrangler/environments/),
[ubicación Worker](https://developers.cloudflare.com/workers/configuration/placement/),
[SSL en Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement),
[backups Supabase](https://supabase.com/docs/guides/platform/backups) y
[requisitos del Libro de reclamaciones](https://consumidor.gob.pe/wp-content/uploads/2020/07/Preguntas_Respuestas_LR_12.11.2025.pdf).

## Revisión previa a la activación — 4 de noviembre

La revisión adicional corrigió dos fallos de seguimiento y reforzó el proceso
de despliegue, conservando la composición aprobada de las pantallas.

**Seguir pedido:** Atrás y Adelante sincronizan el código visible con la URL;
reconsultar la misma referencia conserva su token privado y cambiar de pedido
lo retira. Los reintentos muestran carga y una respuesta antigua no reemplaza
el resultado de una consulta más reciente. Las cuatro regresiones nuevas y
tres recorridos existentes de checkout aprobaron con datos aislados; no se
consultaron pedidos privados alojados.

**Compilación y despliegue:** Vite identifica el entorno y una huella de su
configuración pública; después del prerender se registra el hash de cada
archivo final. Los comandos de Cloudflare comprueban modo, proyecto Supabase,
clave pública, banderas SEO y archivos antes de llamar a Wrangler. Un `dist`
de staging no sirve para publicar producción, ni se acepta una compilación
modificada o con variables cambiadas sin reconstruir. Los manifiestos contienen
huellas, nunca valores de claves o secretos. Es una guarda frente a errores
operativos, no una firma contra un operador local malicioso.

```powershell
npm.cmd run test:worker-build
npm.cmd run cloudflare:check
npm.cmd run cloudflare:deploy
npm.cmd run cloudflare:check:production
```

`cloudflare:deploy` publica únicamente staging después de reconstruir y
comprobarlo. `cloudflare:check:production` solo compila y empaqueta en seco.
Los hooks `build.command` de Wrangler ejecutan la misma comprobación cuando
se usa directamente `wrangler deploy --env staging` o `--env production`.
El comando sin entorno explícito se rechaza. La publicación comercial de
producción sigue pendiente de las dos integraciones acordadas.

**Regresiones:** 167 casos únicos de catálogo, configuración, pedidos,
favoritos, checkout y contratos aprobados; 26 pruebas nativas de SEO/Worker
y ocho consultas públicas de rutas aprobadas. Se corrigió un contrato que
faltaba en el fixture compartido de reseñas, manteniendo las aserciones de
precios y de ausencia de valoraciones inventadas. Las 14 pruebas nuevas de
la guarda de compilación comprobaron también sustitución, eliminación y
adición de archivos y mezclas de entornos. Las suites usan sus propias
sesiones y puertos locales; no registran productos ni pedidos en los entornos
alojados.

**Dependencias:** `npm run security:audit` conserva la auditoría reproducible
de paquetes de producción. La consulta del 4 de noviembre devuelve cero avisos
altos/críticos y nueve entradas moderadas propagadas desde dos avisos de UUID
y minimatch en la cadena de ExcelJS. Siguen presentes en el árbol; no se declara
una auditoría sin avisos. La revisión del código instalado no encontró un camino
explotable en la web: el Worker no incluye esos paquetes; el navegador no incluye
minimatch y ExcelJS invoca UUID únicamente mediante `v4()` sin buffer externo.
No se aplicó el descenso de versión mayor que propone `audit fix --force`.
Cambiar un override no sustituye el UUID embebido en el bundle de navegador de
ExcelJS. El detalle y las pruebas de alcance están en
`artifacts/dependency-exposure-2026-11-04/`; se debe revisar de nuevo al actualizar
ExcelJS o ampliar su uso.

Fuentes: [aviso UUID del mantenedor](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq),
[aviso minimatch del mantenedor](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)
y [versiones de ExcelJS](https://github.com/exceljs/exceljs/releases).

La tarea local de respaldos se comprobó nuevamente el 4 de noviembre: última
ejecución aprobada, `LastTaskResult=0`, con los requisitos de sesión/equipo
descritos anteriormente. Las evidencias de esta revisión están en
`artifacts/release-review-2026-11-04/` y `artifacts/release-ui-audit/`.
