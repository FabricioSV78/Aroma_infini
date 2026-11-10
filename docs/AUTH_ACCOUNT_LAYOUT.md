# Acceso: selección personal y formulario centrado

La composición conserva el selector superior, la superficie cálida, las medidas responsive y la transición de opacidad de 180 ms. La imagen y el selector permanecen estables. Los campos y la información legal se centran como un conjunto en el área disponible del panel; las etiquetas siguen alineadas a la izquierda para facilitar la lectura. El contenido puede crecer si aparecen errores, sin recorte ni scroll interno.

Se retiran los títulos visibles «Inicia sesión» y «Crea tu cuenta», que repetían el selector. Se conserva un único H1 «Mi cuenta» mediante `sr-only`, disponible para tecnologías de asistencia. Los enlaces señalan la opción actual con `aria-current`; los botones conservan su acción explícita. Acceso administrativo, recuperación, campos de registro y validaciones no cambian.

La nueva fotografía conceptual muestra una mano escogiendo una fragancia entre tres frascos. Se utiliza una toma vertical en escritorio/tablet y una panorámica en móvil, para conservar completa la acción sin forzar el recorte. No representa clientes, productos ni instalaciones reales de Aroma Infini. Se generó con el modo integrado de la skill `imagegen`; no se utilizó CLI ni API externa configurada por el proyecto.

Archivos finales:

- `public/images/account-selection-v1-portrait-{480,780,1024}.webp` — original de 1024 × 1536 px.
- `public/images/account-selection-v1-wide-{960,1536}.webp` — original de 2172 × 724 px.

Los originales PNG se copiaron al workspace. Los [prompts completos y la proveniencia](../artifacts/auth-centered-2026-10-26/image-provenance.json) se conservan junto a las capturas. Sharp solo redimensiona y codifica WebP, sin ampliar ni recomponer las fotografías. Los activos anteriores no se eliminan porque continúan utilizados por el Home.

No se conecta Supabase ni se crean cuentas reales. Las pruebas de respuestas del proveedor utilizan los adaptadores aislados ya existentes.

## Avisos generales sin desplazar el formulario

Los resultados generales del acceso, registro y recuperación del cliente se muestran en un modal compacto fuera del formulario. Añadir el aviso como una fila del grid cambiaba el centro y desplazaba todos los campos; el diálogo nativo evita ese cambio de geometría. Los errores específicos siguen junto al input correspondiente, con sus etiquetas y mensajes asociados.

Se reutiliza `Dialog`, con título y descripción accesibles, bloqueo del fondo, navegación de Tab dentro del modal, Escape, cierre explícito y devolución del foco al botón de envío sin desplazar la página. Se conservan datos y posición de scroll. Cerrar un aviso contextual no lo vuelve a abrir al editar; un nuevo intento con el mismo error sí vuelve a informarlo. El acceso administrativo también utiliza este diálogo, adaptado a los colores del panel, para los errores generales; sus validaciones permanecen debajo de cada campo.

Validación de avisos completada: 88 pruebas seleccionadas de autenticación, cuenta, checkout y navegación aprobadas. La suite específica de modales se amplió a nueve casos y volvió a pasar, incluyendo confirmación de registro y cierre de un aviso contextual sin reapertura al editar. Un nuevo envío con el mismo error sí informa nuevamente.

Se midieron diez escenarios (acceso y registro en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844), antes, durante y después de abrir el modal: desplazamiento máximo de 0 px en conjunto, panel, foto, selector, inputs, botón y footer; scroll conservado. Se verificaron datos, foco, Tab/Shift+Tab, Escape, X y Enter. Los errores de validación siguen inline y no abren un modal general. Build, typecheck, lint, formato y comprobación de producción correctos.

Evidencias: `artifacts/auth-feedback-2026-10-26/`, en particular `tests.log`, `final-modal-tests.log` y las mediciones JSON de `screens/`. Capturas: [modal de escritorio](../artifacts/auth-feedback-2026-10-26/screens/register-desktop-modal.png), [antes del aviso](../artifacts/auth-feedback-2026-10-26/screens/register-desktop-before.png), [después de cerrarlo](../artifacts/auth-feedback-2026-10-26/screens/register-desktop-after.png), [modal móvil](../artifacts/auth-feedback-2026-10-26/screens/register-mobile-modal.png).

Validación completada:

- 93 pruebas seleccionadas de autenticación, registro, cuenta, checkout, navegación y consistencia aprobadas. Tras ajustar el ancho de imagen en tablet se repitieron las cinco pruebas de interfaces responsive y las nueve de alternancia/centrado: todas pasaron.
- Capturas reales revisadas en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844. Las pruebas comprueban que el centro horizontal y vertical del bloque formado por campos y texto legal coincide con el de su área (tolerancia de 1 px), tanto en acceso como registro. Los controles se comprobaron también a 320 px y con errores desplegados, sin recorte ni desbordamiento.
- Tres alternancias repetidas conservan foto, selector, área del formulario, footer y scroll. La revisión fotograma a fotograma en escritorio y móvil registra 0 px de desplazamiento del conjunto, imagen, selector y footer; la imagen permanece decodificada. Se respeta movimiento reducido. El selector está por encima de la capa de fundido para evitar que esta intercepte clics.
- Contraste mínimo de texto 5,22:1 y de bordes 3,01:1; controles de al menos 44 px. Foco, hover y errores conservan su diferenciación y asociación a los campos. El H1 semántico y las etiquetas se mantienen.
- Nitidez comprobada mediante los archivos realmente descargados en escritorio/tablet a 2× y móvil a 3×. `sizes` contempla el ancho de la fotografía escalada antes de recortarla; no se amplían archivos insuficientes.
- Build, typecheck, lint, formato y comprobación de producción correctos. El acceso administrativo conserva 0 píxeles modificados respecto a la captura anterior.

Evidencias: `artifacts/auth-centered-2026-10-26/`, especialmente `final-tests.log`, `final-responsive.log`, `final-selector.log`, `motion-check.json`, `image-quality-check.json` e `interactions/results.json`. Capturas: [acceso](../artifacts/auth-centered-2026-10-26/after/login-desktop-viewport.png), [registro](../artifacts/auth-centered-2026-10-26/after/register-desktop-viewport.png), [tablet](../artifacts/auth-centered-2026-10-26/after/register-tablet-viewport.png), [móvil](../artifacts/auth-centered-2026-10-26/after/register-mobile-viewport.png).
