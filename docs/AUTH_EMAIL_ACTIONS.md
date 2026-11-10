# Acciones de cuenta sin mensajes

La implementación vigente está documentada en [Recuperación sin correos ni SMTP](AUTH_OFFLINE_RECOVERY.md).

El registro no exige confirmar el correo. Cambiar el correo requiere la contraseña actual.
La recuperación utiliza un código guardado de un solo uso. La integración de Resend fue retirada;
no hay un proveedor de correo, remitente ni clave de envío pendientes para este flujo.
