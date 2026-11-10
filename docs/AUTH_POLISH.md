# Pulido de acceso y registro — 26/10/2026

El ajuste posterior de imagen, encabezados y centrado del formulario está en [AUTH_ACCOUNT_LAYOUT.md](AUTH_ACCOUNT_LAYOUT.md). Este informe conserva el historial de estilos y comprobaciones anteriores.

Se conserva el selector superior, el cambio de opacidad de 180 ms, la posición del scroll y el foco al alternar. No se cambian campos, validaciones, contratos de autenticación ni permisos. Supabase continúa sin conectar; no se crean cuentas reales ni se guarda información personal en el navegador.

La fotografía utiliza las variantes existentes Lumière: un frasco sobre piedra clara y luz suave. El módulo mide hasta 960 px, con 408 px de imagen y un formulario de lectura de 440 px. El encuadre vertical se utiliza en escritorio/tablet; `picture` elige una toma horizontal en móvil para mostrar el frasco completo en 120 px. `srcset` y `sizes` conservan resolución sin ampliar archivos.

El formulario utiliza títulos de menor peso, inputs de 46 px, superficies cálidas, esquinas de 4 px y bordes neutros. Hover y foco se distinguen sin alterar medidas. El botón de mostrar contraseña conserva 44 px de alto; el foco verde sigue visible. Movimiento reducido desactiva fundido y transiciones de inputs.

Crear cuenta agrupa nombres/apellidos en una fila y correo/celular en otra cuando el ancho lo permite. La contraseña conserva su fila completa. En tablet/móvil se apilan correo y celular para facilitar la escritura; no se añaden pasos ni textos. La altura mínima común evita saltos al alternar y deja crecer los mensajes de error: 40 rem en escritorio, 43 rem en tablet y 42 rem para el panel móvil.

Validación completada:

- 93 pruebas seleccionadas de autenticación, registro, cuenta, checkout, navegación y consistencia aprobadas. Tras ajustar `sizes`, las 40 pruebas de autenticación se repitieron y pasaron. La prueba de recuperación espera al encabezado de la nueva ruta antes de escribir para evitar interactuar con el formulario anterior.
- Capturas reales revisadas en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844. Sin imágenes rotas, solapamientos ni desbordamientos horizontales; se revisaron además foco y errores a 320 px. En 390 × 844, el botón de registro termina aproximadamente a 841 px.
- Las tres alternancias repetidas conservan geometría, foco y scroll. El muestreo fotograma a fotograma en escritorio y móvil conserva 0 px de desplazamiento de conjunto, foto, selector y footer; la preferencia de movimiento reducido evita el fundido.
- Texto con contraste mínimo de 5,22:1 y bordes de inputs de 3,01:1. Inputs de 46 px y botones de contraseña de 44 px. Hover, foco y errores comprobados; pasar el cursor no elimina el borde de error.
- Calidad de imágenes comprobada con píxeles reales de los archivos descargados: escritorio y tablet a 2×, móvil a 3×. `sizes` contempla la anchura completa del retrato al escalarlo por altura antes del recorte de `object-fit: cover`, evitando elegir una variante insuficiente en tablet. No se crean activos ni se amplían archivos.
- Build, typecheck, lint, formato y comprobación de producción correctos. El acceso administrativo conserva 0 píxeles modificados respecto al estado anterior. Las respuestas exitosas de registro se prueban mediante adaptadores aislados; la autenticación real continúa pendiente.

Capturas y logs: `artifacts/auth-polish-2026-10-26/`. Comparación: [antes](../artifacts/auth-polish-2026-10-26/before/register-desktop-viewport.png), [registro actual](../artifacts/auth-polish-2026-10-26/after/register-desktop-viewport.png), [acceso actual](../artifacts/auth-polish-2026-10-26/after/login-desktop-viewport.png), [móvil](../artifacts/auth-polish-2026-10-26/after/register-mobile-viewport.png). Resultados principales: `final-tests.log`, `final-image-tests.log`, `image-quality-check.json`, `motion-check.json` e `interactions/results.json`.
