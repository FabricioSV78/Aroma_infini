# Recuperación de acceso sin correos ni SMTP

Estado vigente: 29 de octubre de 2026. No usa SMTP, Resend, correos automáticos,
SMS ni otro proveedor de mensajería.

## Uso del cliente

1. Entrar en «Mi cuenta → Mis datos → Recuperación de acceso».
2. Crear un código confirmando la contraseña actual.
3. Guardarlo o descargarlo fuera de esta web. Se muestra una sola vez.

Al olvidar la contraseña, introducir correo, código guardado y contraseña nueva
en «¿Olvidaste tu contraseña?». Tras el cambio aparece un código nuevo que debe
guardarse; el utilizado queda invalidado. No hay inicio automático de sesión.
Reemplazar el código desde la cuenta también invalida el anterior.

Es necesario crear el código antes de perder el acceso. Quien no tenga uno debe
solicitar asistencia para revisar su caso; no se promete restablecer la cuenta
sin comprobar titularidad. Conocer correo, celular o datos de pedidos no basta.

## Protección

- Código de 256 bits aleatorios. El servidor conserva únicamente SHA-256.
- Consumo atómico, nonce de operación y reemplazo tras recuperación correcta.
- Límites persistentes por identificador HMAC y límite global que impide crear
  contadores ilimitados. No se guardan correos ni IP en esos identificadores.
- Tablas privadas con RLS. Las RPC solo permiten ejecución a `service_role`;
  ni visitantes ni clientes pueden consultar o modificar hashes directamente.
- Generación y reemplazo exigen sesión verificada y contraseña actual.
- El navegador nunca elige el UUID que se restablecerá.
- Fallos anteriores a cambiar la contraseña solo pueden liberar su nonce exacto.
  Un resultado ambiguo posterior no reactiva el código ni informa éxito falso.
- Auth Admin API revoca las sesiones de refresh tras cambiar la contraseña.
  Los JWT de acceso emitidos pueden durar hasta su vencimiento normal.
- Códigos y contraseñas no se guardan en logs, URLs ni almacenamiento web.
  Copia y descarga requieren una acción expresa del cliente.

Los administradores quedan excluidos tanto en UI como en servidor y SQL. Su
acceso debe recuperarse con el operador autorizado de Supabase. No se elimina
TOTP ni se reduce la exigencia de MFA del panel.

## Configuración y despliegue

Funciones de desarrollo operativas: `account-recovery` y `change-email`.
La función `auth-email`, su handler y sus pruebas fueron retirados. Send Email
está desactivado. Registro y cambio de correo no envían confirmaciones.

`ACCOUNT_ACTION_ALLOWED_ORIGINS` contiene los orígenes exactos permitidos.
Para publicar, configurar los orígenes HTTPS reales en lugar de los locales.
`RECOVERY_RATE_LIMIT_SECRET` es un secreto aleatorio exclusivo del servidor
guardado en Supabase Secrets. No se publica como variable `VITE_`.

El cambio de correo sigue solicitando la contraseña actual y utiliza su acción
privada de servidor. El guardado general del perfil no modifica el correo.

## Pruebas

Se verificaron emisión, recuperación, código repetido, código de reemplazo,
contraseña anterior/nueva y revocación del refresh contra Supabase real con
una cuenta temporal eliminada al terminar. Las suites aisladas comprueban
errores, doble envío, permisos y responsive; PostgreSQL local prueba consumo
atómico, RLS y límites.

La prueba real detectó formatos de error Auth con `code` numérico y
`error_code` textual. El handler acepta ambos y fija la versión de la API.
No se cambiaron políticas ni permisos por ese ajuste.

El patrón sigue prácticas de credenciales aleatorias, hash y uso único de
[OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
No se declara certificación NIST: sin un canal independiente no existe la
notificación externa que exige ese estándar para estas operaciones.
