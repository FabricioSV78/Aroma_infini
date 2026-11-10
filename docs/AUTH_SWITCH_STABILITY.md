# Alternancia estable entre acceso y registro

El pulido posterior mantiene esta interacción y ajusta las alturas mínimas por composición responsive. El estado y las pruebas vigentes se documentan en [AUTH_POLISH.md](AUTH_POLISH.md).

La altura distinta de los formularios cambiaba el recorte de la fotografía, la posición del selector y la del footer. Además, la navegación general reiniciaba el scroll al cambiar de opción.

Se reserva la altura del registro en ambas vistas (mínimo de 42 rem en escritorio/tablet y 41 rem para el panel móvil). El selector y el encabezado se alinean arriba. Son alturas mínimas: errores, textos ampliados o contenido adicional pueden crecer sin quedar recortados. La imagen mantiene su encuadre durante la alternancia normal.

Solo el contenido cambia de opacidad durante 180 ms. Imagen y selector no se animan. La preferencia de movimiento reducido desactiva ese fundido. Los enlaces mantienen el mismo peso y espacio de borde para que el indicador activo no desplace el texto.

La navegación conserva scroll y enfoca la nueva opción con `preventScroll` exclusivamente entre `/iniciar-sesion` y `/crear-cuenta`. Las demás páginas mantienen su navegación habitual. Se conserva el desmontaje del formulario: limpia contraseñas/errores y evita aplicar respuestas tardías a otro formulario.

Validación: las nueve pruebas específicas pasaron, junto con los 84 casos complementarios seleccionados de autenticación, registro, cuenta, checkout, navegación y consistencia. La medición espera al montaje de la ruta antes de consultar su geometría. Las pruebas repiten tres alternancias en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844, conservando conjunto, foto, selector, título y footer. También comprueban scroll a 40/80 px, foco, destino de compra, limpieza de contraseñas y movimiento reducido.

Una revisión fotograma a fotograma en escritorio y móvil midió 0 px de desplazamiento de foto, conjunto, selector y footer. La imagen permaneció decodificada en todos los fotogramas y solo cambió la opacidad del contenido. Build, typecheck, lint, formato y comprobación de producción correctos; contraste de texto mínimo 5,14:1 y controles de al menos 44 px. La comparación del acceso administrativo conserva 0 píxeles modificados.

Evidencias: `artifacts/auth-stable-switch-2026-10-26/`, en particular `final-switch-tests.log`, `motion-check.json` y las capturas de `after/`. Comparación: [acceso](../artifacts/auth-stable-switch-2026-10-26/after/login-desktop-viewport.png) y [registro](../artifacts/auth-stable-switch-2026-10-26/after/register-desktop-viewport.png).
