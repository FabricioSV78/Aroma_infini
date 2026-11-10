# Acceso y registro: selector e imagen editorial

Historial de composición: el pulido posterior de fotografía, proporciones y controles está en [AUTH_POLISH.md](AUTH_POLISH.md). Los campos, contratos y permisos descritos aquí se conservan.

Estado vigente: 26 de octubre de 2026. Sustituye la propuesta sin imagen de [AUTH_REFINEMENT.md](AUTH_REFINEMENT.md) y ajusta la primera propuesta editorial de imagen pequeña. El cliente pidió conservar la elección superior entre iniciar sesión y crear cuenta, integrar mejor la fotografía y reunir los datos necesarios del registro.

## Decisión

La primera propuesta colocaba una fotografía de 320 × 400 px separada del formulario; el cliente la percibió pequeña y flotante. El ajuste vigente une ambos elementos en un módulo de hasta 976 px sobre una superficie cálida común (`#faf8f4`), sin hueco entre imagen y formulario.

La fotografía existente `olfactory-santal.webp` (960 × 1200 px) ocupa hasta 440 px de ancho y un mínimo de 560 px de alto en escritorio; puede crecer con la altura del registro para evitar una imagen aislada. El formulario mantiene un ancho máximo de 440 px y espaciados interiores de 28 px verticales y 48 px horizontales. En tablet las columnas se ajustan de forma flexible (aproximadamente 317 px para imagen y 340 px para formulario en la vista de 768 px); en móvil la foto pasa a una franja de 96 px y el formulario utiliza 24 × 16 px de relleno. El recorte se realiza con `object-fit: cover`, sin generar activos ni ampliar el archivo original.

«Iniciar sesión» y «Crear cuenta» permanecen encima del formulario. Son enlaces a las rutas existentes; `aria-current` identifica la opción actual. La recuperación de contraseña, las etiquetas y las acciones mantienen su relación con los campos. El acceso administrativo y los permisos conservan su implementación.

## Datos del registro

La alternancia de ambas vistas se ajustó después para conservar altura, encuadre y posición del selector. El panel reserva 42 rem en escritorio/tablet y 41 rem en móvil, sin recortar contenido. Detalles y validación vigente de esa interacción: [AUTH_SWITCH_STABILITY.md](AUTH_SWITCH_STABILITY.md).

Nombres y apellidos comparten una fila; después se solicitan correo, celular de nueve dígitos y contraseña de al menos doce caracteres. Dirección y documento se piden en el checkout cuando corresponden a la compra. No se incorporan programas de fidelidad ni información comercial adicional.

`AuthSignUpInput` reutiliza `AccountProfile` para preparar los datos del perfil sin crear otro modelo. El futuro adaptador deberá registrar el perfil asociado al propietario verificado. Con Supabase sin configurar, esta revisión no crea perfiles reales ni guarda datos personales en almacenamiento local. El autocompletado del checkout no se modifica.

## Referencias y límites

- [COS Tailandia](https://th.cos.com/th_en/customer/account/login) es la referencia principal para la elección superior acceso/registro y una columna clara de campos. Su acceso revisado no incluye fotografía; no se le atribuye nuestra composición editorial.
- [Rituals Singapore](https://www.rituals.com.sg/login) presenta un primer paso de correo y una imagen pequeña de regalo subordinada al contenido de cuenta. No tiene una gran fotografía editorial equivalente: se toma únicamente la prioridad de la tarea sobre la imagen.
- [Sézane, ayuda oficial](https://www.sezane.com/eu-en/help?question=how-do-i-access-my-account) confirma el cambio entre acceso y registro. Su tienda, Anthropologie, & Other Stories y Guerlain limitaron la inspección; no fundamentan decisiones de proporción ni responsive. Clarins USA mostró un logo de membresía, no una fotografía editorial.

La integración y sus dimensiones son una adaptación propia al feedback y a la identidad de Aroma Infini, no una copia atribuida a esas marcas. La observación de la pequeña imagen de Rituals no se presenta como fundamento de nuestro bloque fotográfico de mayor tamaño. Investigación detallada: [referencias verificadas](../artifacts/auth-editorial-2026-10-26/references.md).

## Accesibilidad y funcionamiento

Se conserva la navegación por enlaces reales, con indicación de la ruta actual, foco visible y orden de lectura centrado en el formulario. La fotografía es decorativa y no introduce texto esencial. Etiquetas, errores asociados a campos, mostrar/ocultar contraseña y estados de envío mantienen su comportamiento. No se incorporan animaciones ni autenticación social.

Supabase continúa sin configurar. Los intentos de acceso conservan el error veraz del adaptador: no se simulan cuentas, sesiones ni correos enviados. Esta revisión visual no modifica esa limitación.

## Validación de la revisión vigente

Typecheck, lint, build y formato correctos. Las 75 pruebas seleccionadas de autenticación, registro, cuenta, checkout, navegación y consistencia pasaron. Cuatro pruebas específicas verifican validación y foco de apellidos/celular, payload estructurado y normalizado (sin alterar la contraseña), conservación de los cinco campos ante errores y bloqueo de solicitudes duplicadas. El adaptador de prueba transmite ahora los argumentos reales de registro, sin sustituirlos por un objeto vacío.

Capturas completas y de primera vista revisadas en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844. Sin desbordamientos, imágenes rotas ni errores de JavaScript en esas vistas. La fotografía mide 440 × 560 px en acceso y aproximadamente 440 × 664 px en registro; en móvil el botón de registro termina a unos 840 px y cabe dentro de la pantalla comprobada. El acceso administrativo conserva 0 píxeles modificados respecto al estado anterior.

Contraste comprobado a 390, 768 y 1440 px: mínimo de texto 5,14:1 y bordes de inputs 3,05:1; controles de al menos 44 px de alto. La compilación de producción carga foto y selector, conserva rutas protegidas y falla de forma veraz al intentar registrar con el proveedor sin configurar. Las respuestas exitosas de registro se prueban exclusivamente con el adaptador aislado y no representan cuentas reales.

Evidencias y logs: `artifacts/auth-integrated-2026-10-26/`. Comparación: [antes](../artifacts/auth-integrated-2026-10-26/before/login-desktop-viewport.png), [acceso actual](../artifacts/auth-integrated-2026-10-26/after/login-desktop-viewport.png), [registro actual](../artifacts/auth-integrated-2026-10-26/after/register-desktop.png), [móvil](../artifacts/auth-integrated-2026-10-26/after/register-mobile.png).

## Validación histórica de la imagen pequeña

Los resultados siguientes corresponden a la composición anterior de fotografía de 320 × 400 px y registro de nombre/correo/contraseña. No validan automáticamente la revisión integrada ni los campos nuevos.

Typecheck, lint y build correctos. Las 71 pruebas seleccionadas de autenticación, cuenta, checkout, navegación y consistencia visual pasaron. Incluyen alternancia por teclado conservando el destino de compra, validaciones, envíos pendientes, errores sin pérdida de datos y separación de permisos. Los contratos con respuesta de proveedor se prueban con un adaptador aislado; no constituyen una conexión real a Supabase.

Capturas completas y de primera vista de acceso y registro en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844, revisadas visualmente. Sin desbordamientos horizontales, imágenes rotas ni errores de JavaScript en esas vistas. En móvil, la acción de registro queda a unos 748 px del borde superior, dentro de los 844 px comprobados. La fotografía original permite mostrar 320 × 400 px sin ampliación y mantiene resolución suficiente para pantallas de alta densidad.

Comprobaciones de contraste en 390, 768 y 1440 px: texto mínimo 5,45:1, bordes de inputs 3,05:1 y controles de al menos 44 px de alto. El acceso administrativo conserva una comparación de píxeles idéntica al estado anterior (0 píxeles modificados). La compilación de producción se comprobó con imagen, selector, rutas protegidas y ausencia de solicitudes a proveedores externos.

Se corrigió además la alineación del texto de recuperación para mantenerlo en el eje izquierdo de su título. Las cinco pruebas responsive se repitieron tras ese ajuste y pasaron; se inspeccionó nuevamente la captura de recuperación. Build, lint y comprobación de producción volvieron a pasar con el ajuste final.

Capturas: [antes, acceso en escritorio](../artifacts/auth-editorial-2026-10-26/before/login-desktop-viewport.png), [después, acceso](../artifacts/auth-editorial-2026-10-26/after/login-desktop-viewport.png), [registro en laptop](../artifacts/auth-editorial-2026-10-26/after/register-laptop-viewport.png), [registro en móvil](../artifacts/auth-editorial-2026-10-26/after/register-mobile-viewport.png). Evidencias y logs: `artifacts/auth-editorial-2026-10-26/`.
