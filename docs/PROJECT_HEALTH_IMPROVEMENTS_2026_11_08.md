# Consolidación técnica — 8 de noviembre de 2026

Cierre y comprobación de evidencia: **9 de noviembre de 2026**, Lima.

Esta entrega corrige problemas comprobados de estructura, continuidad del
checkout y validación del proyecto. Es una entrega **local**: no publica el
Worker, Edge Functions ni migraciones en staging o producción. No cambia
hojas de estilo, composiciones, animaciones, opciones comerciales ni precios.

## Cambios

| Antes                                                                                                                               | Después                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog-service` y `remote-catalog-queries` se importaban entre sí.                                                                | El contrato, constantes y parseo compartidos viven en `domain/catalog-query.ts`. El servicio conserva sus exports y valores por defecto.                                                 |
| Preparar una foto desde servicios requería importar un módulo de la interfaz administrativa.                                        | La preparación vive en `services/prepare-image-file.ts`; la entrada anterior reexporta la misma implementación. No se alteran calidad, encuadre ni límites.                              |
| El cargador del catálogo importaba persistencia desde los componentes del carrito y favoritos.                                      | Ambos adaptadores de almacenamiento viven en `services`. Las claves, versiones, límites, eventos y exports anteriores se conservan. No se migra ni elimina almacenamiento del usuario.   |
| La cuenta del cliente importaba validadores desde el servicio de pedidos administrativos, que inicializa estado y suscripciones.    | Los parseadores compartidos viven en `services/order-response.ts`, sin inicializar el panel. Conservan validación de propietario, totales, precios históricos y estados.                 |
| Una recarga después de una respuesta incierta perdía el identificador del intento de compra.                                        | Un recibo de reintento privado conserva la operación en la misma pestaña y permite reconstruir exactamente el comando original al reintroducir los mismos datos.                         |
| TypeScript revisaba solamente dos configuraciones raíz.                                                                             | `tsconfig.node.json` incluye Vite y todas las configuraciones Playwright.                                                                                                                |
| No había un workflow versionado que reuniese las suites dedicadas.                                                                  | CI preparado con calidad, cuatro grupos aislados y PostgreSQL local desechable; sin secretos, consultas alojadas ni despliegues.                                                         |
| El ensayo SQL podía reutilizar estadísticas antiguas dentro de una transacción y limpiar fixtures con consultas todavía pendientes. | Se renueva el snapshot de estadísticas en cada sondeo y se esperan las consultas antes de limpiar. El clúster desechable tiene límites de espera; las reglas SQL comerciales no cambian. |
| El test de paginación consideraba terminada la navegación al ver veinte filas, aunque seguían siendo las de la página anterior.     | Espera el indicador de página antes de leer referencias. Sigue exigiendo cincuenta pedidos distintos y conservar la selección.                                                           |
| Los puntos de entrada de documentación presentaban informes históricos como estado vigente.                                         | README, Supabase y preparación de producción distinguen la fecha del último inventario alojado y las mejoras locales posteriores.                                                        |

Se ignoran además los exports locales `AROMAINFINI.xml` y `ECCOMERCE.xml`
para evitar incorporarlos accidentalmente a Git. Se conservan en disco;
la exclusión no afecta XML genéricos ni recursos de la aplicación.

Las nuevas guardas comprueban que no reaparezcan ciclos estáticos de runtime,
que dominio no importe capas superiores y que servicios no dependan de UI.
No cuentan los imports de tipos ni las cargas diferidas como ciclos de
inicialización. También se verifica que ninguna configuración de pruebas
quede fuera del plan y que las variables públicas estén aisladas.

## Recuperación del checkout: alcance y privacidad

`sessionStorage` guarda únicamente un UUID, una huella SHA-256 de la intención,
la capacidad limitada de seguimiento, la cotización original y su fecha.
No guarda el formulario, direcciones o contacto en claro, contraseñas ni
tokens de autenticación. Es información privada de reintento, no una caché
pública ni una garantía de anonimato.

El recibo vence a las 24 horas y los reintentos no prolongan indefinidamente
ese plazo. Se retira al confirmar el pedido, cambiar identidad o recibir un
error definitivo. Una finalización antigua no elimina un intento posterior.
Una compra legítima posterior genera otra operación.

La verificación inicial lenta o temporalmente fallida de Auth no se confunde
con un cambio de propietario. Al recuperarse la misma cuenta, su recibo sigue
disponible. Si la identidad ya estaba verificada y se pierde, se retira el
recibo privado; el error no concede acceso a la cuenta.

Para recuperar el intento tras recargar hay que introducir los mismos datos
en la misma pestaña y origen, con almacenamiento disponible. Cerrar la pestaña,
borrar su almacenamiento o cambiar los datos queda fuera de esa recuperación.
Se mantienen los reintentos en memoria cuando el navegador bloquea el storage.
**No sustituye la conciliación durable de pagos ni implementa Mercado Pago.**

## Comprobaciones

Los comandos reproducibles están en [QUALITY_CHECKS.md](QUALITY_CHECKS.md).
Los resultados nuevos de esta entrega se conservan en
`artifacts/project-health-2026-11-08/` y en las carpetas de las suites.
Las pruebas con SDK utilizan transporte aislado; las pruebas SQL emplean
PostgreSQL nativo desechable. No son nuevas pruebas sobre servicios alojados.

| Comprobación                       | Resultado y alcance                                                                                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                         | Correcto, incluyendo todas las configuraciones Playwright.                                                                                                                                                                                      |
| ESLint                             | Correcto, sin advertencias.                                                                                                                                                                                                                     |
| Pruebas Node                       | **137/137** correctas; incluye guardas de arquitectura, entornos, build, respaldos y recibos de reintento.                                                                                                                                      |
| SQL                                | **685 comprobaciones**, 28 migraciones, PostgreSQL 17.10 local. Datos propios retirados y clúster detenido.                                                                                                                                     |
| Handlers y runtime                 | **234 ejecuciones** correctas en las cinco configuraciones de contratos; hay casos compartidos entre configuraciones, no se presentan como 234 casos únicos.                                                                                    |
| Suite general                      | **1287 casos distintos** aprobados entre la ejecución inicial y las repeticiones controladas; **3 capturas optativas** no ejecutadas.                                                                                                           |
| Cuenta, Auth y configuración       | **151 casos distintos** aprobados entre ejecuciones aisladas; incluye MFA, permisos, favoritos, notificaciones y QR.                                                                                                                            |
| Checkout                           | **21/21** correctas, incluyendo recarga, Auth lento, error inicial recuperable, retiro del recibo al perder una identidad verificada y cinco tamaños de pantalla. Las 12 pruebas Node del recibo también están incluidas en las 137 anteriores. |
| Catálogo, pedidos y medios remotos | **73/73** correctas: catálogo 36, pedidos 17, fotografías 12 y Home 8; SDK real con transporte aislado.                                                                                                                                         |
| Hero                               | **30/30** correctas; además, tres repeticiones del caso reparado. Es un subconjunto de la suite general.                                                                                                                                        |
| Build                              | Producción y build con entorno CI sin credenciales correctos; paquete de 349 archivos verificado.                                                                                                                                               |
| Worker                             | Empaquetado `--dry-run` correcto. No hubo subida ni despliegue.                                                                                                                                                                                 |

El CSS principal compilado pasa de **310.153 a 308.342 bytes** al dejar de
analizar Tailwind el export local `AROMAINFINI.xml`. Una compilación aislada
reproduce exactamente los **1.811 bytes** de diferencia y el mismo cambio
de declaraciones generadas. No cambia ninguna declaración de los estilos
propios fuera de las capas de Tailwind; las clases retiradas no aparecen en
las fuentes activas. La comprobación está en `css-comparison/result.json`
dentro de los artefactos de esta entrega. No se presenta como una medición
de velocidad de usuarios ni como una comparación completa de píxeles.

En el primer recorrido general, ocho workers concurrentes provocaron numerosos
timeouts de preparación. Se conservaron los 31 fallos iniciales. Treinta
pasaron con dos workers; el restante era el test del Hero que instalaba el
reloj simulado después de crear un temporizador nativo. Se corrigió el orden
del test, no los intervalos ni las animaciones. Los nuevos recorridos generales
del runner se limitan a dos workers.

El primer ensayo SQL también se conserva como fallido. La regresión nueva
demuestra con dos conexiones el snapshot de estadísticas obsoleto dentro de
una transacción y su actualización explícita. La repetición completa pasó;
no se omitieron controles de RLS o concurrencia para conseguir ese resultado.

Los grupos se solapan y sus cantidades **no deben sumarse** como un total
único. Los resultados, logs y hashes se consolidan en
`artifacts/project-health-2026-11-08/result.json` y
`quality-pipeline-results.json` de esa misma carpeta.

El workflow de GitHub está preparado, pero **no se ha ejecutado en GitHub**:
eso requiere incorporar los archivos al repositorio remoto. Las dependencias
y el lockfile no se han actualizado ni se han forzado versiones para ocultar
avisos de seguridad.

## Límites y pendientes

- Git conserva cambios anteriores sin consolidar. No se mezclan ni se
  convierten automáticamente en un commit dentro de esta entrega.
- Los componentes administrativos grandes y las capas CSS históricas siguen
  siendo deuda de mantenimiento. No se hace una reescritura general para
  reducir líneas sin una mejora funcional comprobada.
- La paginación administrativa de extremo a extremo y la carga fría móvil
  necesitan otra implementación medida, conservando selección masiva,
  consistencia de totales y apariencia.
- La auditoría npm actual devuelve **12 entradas moderadas, cero altas y cero
  críticas**. Los arreglos propuestos incluyen cambios mayores/downgrades;
  no se aplican `audit fix --force` ni overrides incompatibles.
- Antes de ventas reales siguen haciendo falta reserva/liquidación de stock,
  conciliación de pagos y protección durable ante reintentos fuera de una
  pestaña. El simulador permanece sin consumir stock o usos de cupón.
- Dominio, MFA del administrador de producción, despliegues autorizados,
  contenido comercial y recuperación independiente conservan los pendientes
  de la [auditoría de seguridad](SECURITY_ROBUSTNESS_AUDIT_2026_11_07.md).

No se borraron fotografías, medios R2, datos locales persistentes, respaldos,
migraciones aplicadas, documentación histórica ni configuraciones de entorno.
