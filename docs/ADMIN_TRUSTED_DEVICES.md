# Dispositivos administrativos de confianza

11 de noviembre de 2026. Implementación de una autorización recordada durante
60 días, complementaria a Supabase Auth. No cambia el aspecto del acceso ni
convierte artificialmente una sesión AAL1 en AAL2.

## Funcionamiento

1. Cada persona tiene su propia cuenta de Supabase Auth y una membresía activa
   protegida en `private.admin_memberships`. Registrarse como cliente o cambiar
   metadatos no concede administración.
2. El primer acceso configura un autenticador TOTP. El QR solo aparece mientras
   no existe un factor verificado; los accesos posteriores utilizan ese factor.
3. Después de verificar un TOTP real, el Worker genera 32 bytes aleatorios y
   registra exclusivamente su SHA-256 en la base. La cookie
   `__Host-aroma-admin-device` es `HttpOnly; Secure; SameSite=Strict; Path=/`,
   sin `Domain`, y vence a los 5 184 000 segundos. El token nunca se devuelve
   en JSON, se registra en logs ni se copia a localStorage.
4. Cerrar sesión conserva esa cookie y termina únicamente la sesión actual
   mediante `signOut({ scope: 'local' })`. El siguiente acceso vuelve a requerir
   correo y contraseña.
5. El Worker utiliza la cookie, junto con el bearer recién autenticado, para
   solicitar una autorización ligada al `session_id` real de Supabase. La base
   comprueba propietario, sesión existente, autenticación por contraseña,
   membresía activa, factor TOTP y credenciales vigentes.
6. Cada operación administrativa vuelve a comprobar esa autorización en SQL.
   La concesión también exige la huella de los claims del JWT verificado;
   otro token de la misma sesión no hereda acceso. Renovar el JWT requiere
   comprobar de nuevo la cookie, sin pedir TOTP mientras siga vigente.
   La fecha original no se prolonga al entrar, renovar el JWT o navegar. Después
   del vencimiento, una nueva verificación TOTP puede recordar de nuevo el navegador.

`current_actor` conserva el `aal` auténtico del proveedor y comunica por separado
`trusted_device` y `trusted_until`. RLS y los endpoints de fotografías y push
utilizan la misma decisión del servidor. La cookie por sí sola no inicia sesión.
El almacenamiento habitual del SDK conserva sus protecciones existentes y no
se utiliza como prueba de confianza del dispositivo.

Registrar la cookie solo crea un vínculo informativo con el navegador actual;
no autoriza tokens AAL1 emitidos antes de completar el TOTP. La autorización
recordada se crea únicamente al presentar la cookie en una reanudación válida.

## Revocación y protección

En **Configuración → Dispositivos de confianza** se consultan y revocan los
navegadores de la cuenta actual. No se muestran hashes ni dispositivos de otras
cuentas. Revocar una autorización invalida sus concesiones en el backend; una
sesión que todavía tiene AAL2 real conserva esa verificación independiente.

Cambiar contraseña, correo, factor TOTP, estado de bloqueo o membresía invalida
la confianza anterior. Reactivar posteriormente la cuenta no reactiva cookies
revocadas. Eliminar una sesión Auth elimina su concesión por clave foránea.

Las rutas nuevas solo aceptan HTTPS del mismo origen, un encabezado propio y
los métodos previstos. Las mutaciones exigen `Origin` exacto; una consulta GET
sin `Origin` exige `Sec-Fetch-Site: same-origin`. No se habilita CORS para
credenciales de otros sitios. Las respuestas son `no-store`, los cuerpos y
tiempos están limitados y existen límites de admisión en Worker y SQL. Un fallo
de red no se anuncia como una confianza guardada.

## Cuentas individuales y sesiones de Supabase

Utilizar una cuenta distinta por persona permite atribuir las operaciones al
UUID real de quien las realiza. El inicio o cierre de sesión de una cuenta no
debe revocar las sesiones de otra. Para dar de alta otro administrador:

1. El operador crea su cuenta en **Supabase → Authentication → Users** con una
   contraseña individual; no utiliza el registro público de clientes.
2. Revisa el proyecto y los UUID de la cuenta nueva y del administrador responsable.
3. Revisa y ejecuta `supabase/admin/manage-admin-membership.sql` como operador
   de base de datos. El script exige una cuenta responsable ya autorizada y
   permite revocar sin retirar al último administrador.
4. La persona entra en `/admin/login` y configura su propio TOTP.

**Limitación del proveedor:** GoTrue elimina otras sesiones AAL1 de la misma
cuenta al verificar un TOTP nuevo. Una sesión recordada mantiene AAL1 real y
puede quedar afectada por esa política. No se falsifica AAL2, se bloquean esos
borrados ni se resucitan sesiones eliminadas para ocultarlo. El funcionamiento
simultáneo de personas distintas requiere cuentas individuales. Las pruebas de
transporte aislado no certifican que una cuenta compartida sobreviva a esa
revocación del servicio alojado.

Al activar el entorno se debe verificar también que Supabase no tenga habilitado
«una única sesión por usuario». Una política de duración reducida de AAL1 puede
exigir una nueva contraseña aunque la confianza del navegador siga vigente;
es una restricción del proveedor, no un motivo para prolongar JWT ni sus permisos.

## Publicación

La migración es `20261111000100_admin_trusted_devices.sql`. Se aplica primero
al proyecto de desarrollo correcto, después de revisar pruebas y respaldo.
Los nuevos campos de `current_actor` son compatibles con el acceso AAL2 anterior.
El frontend y el Worker deben publicarse juntos tras aplicar esa migración.

No hacen falta claves privilegiadas nuevas: las RPC usan el JWT del propietario
y funciones con permisos acotados. El binding `ADMIN_AUTH_RATE_LIMITER` tiene
identificadores distintos para desarrollo y producción. GitHub no ejecuta la
migración automáticamente. Producción sigue requiriendo autorización explícita.

La función se prueba desde el mismo origen HTTPS del panel desplegado. Vite por
HTTP, o una página local que llama a otro origen, no recuerda dispositivos; se
conserva el acceso mediante TOTP. No se debilita la cookie a `SameSite=None` ni
se introduce un token alternativo legible por JavaScript para ese caso.

## Validación

| Comprobación final          | Resultado                                     | Alcance                                                                                                                  |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| SQL                         | 32 migraciones y 801 comprobaciones aprobadas | PostgreSQL 17.10 desechable; 66 comprobaciones nuevas de confianza, sin GoTrue alojado                                   |
| Operación de cuentas        | 17 comprobaciones aprobadas                   | Script de operador real; dos revocaciones concurrentes conservan un administrador                                        |
| Autenticación y cuenta      | 77 pruebas aprobadas                          | SDK y aplicación reales con transporte interceptado, ambos proyectos de Playwright                                       |
| Configuración y QR          | 53 pruebas aprobadas                          | Regresiones existentes de configuración y Contacto                                                                       |
| Worker, push y PWA          | 60 pruebas aprobadas                          | Incluye 14 nuevas pruebas de dispositivos y ejecución nativa de workerd                                                  |
| Medios                      | 116 pruebas aprobadas                         | Contratos completos de fotografías, vídeo, límites y fallos                                                              |
| SEO del Worker              | 26 pruebas aprobadas                          | Integración de rutas sin regresiones                                                                                     |
| Node                        | 152 pruebas aprobadas, sin omisiones          | Suite completa de Node                                                                                                   |
| TypeScript, lint y build    | Aprobados                                     | Código final y tipos regenerados con la CLI oficial sobre SQL local                                                      |
| Paquetes staging/producción | Ambos builds y dry-runs aprobados             | Ningún despliegue realizado                                                                                              |
| Auditoría npm               | Umbral de severidad alta aprobado             | Permanecen dos avisos moderados transitivos de uuid/ExcelJS; no se aplicó un cambio incompatible con `audit fix --force` |

Se verificaron 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844,
sin desbordamiento horizontal. Capturas de MFA y dispositivos:
`artifacts/admin-device-ui/{mfa,devices}-<ancho>.png`.

Pruebas negativas: cookie ausente, duplicada, manipulada, vencida, revocada o
perteneciente a otra cuenta; falta de contraseña; JWT anterior a MFA, renovado
o de otra sesión; usuario cliente; permisos retirados; cambio/restauración de
contraseña, correo, factor o bloqueo; origen ajeno; cuerpo excesivo; límites de
solicitudes; interrupciones y errores del proveedor. Los cambios de estado de
Auth se prueban como filas representativas en SQL y contratos interceptados,
no como verificaciones del servicio GoTrue real.

El diagnóstico paralelo de workerd registró una aserción de cierre de libuv en
Windows, aunque las 60 pruebas terminaron con código 0. Las tres comprobaciones
nativas se ejecutaron después de forma aislada y terminaron con código 0 sin
esa aserción. En las pruebas de navegador, Windows requirió terminar únicamente
los procesos Vite creados por el ensayo, después de finalizar todas las pruebas,
para completar el cierre del runner; se conservan sus PID y el resultado final.
No se añadieron omisiones, reintentos automáticos ni cambios de dependencias.

Resultados y logs: `artifacts/admin-trusted-devices-2026-11-11/`.
SQL final: `artifacts/supabase-sql-tests/run-qN94ob/result.json`.
No se modificaron servicios alojados, usuarios reales ni producción. Quedan
pendientes de la publicación: aplicar la migración en desarrollo, desplegar el
frontend y el Worker, y comprobar el flujo con Auth real en su origen HTTPS.
La actualización de producción conserva su autorización independiente.

Referencias:
[Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp),
[sesiones y límites](https://supabase.com/docs/guides/auth/sessions),
[alcance del cierre de sesión](https://supabase.com/docs/guides/auth/signout),
[revocación de AAL1 al verificar TOTP](https://github.com/supabase/auth/blob/master/internal/api/mfa.go),
[cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie),
[gestión de sesiones de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
