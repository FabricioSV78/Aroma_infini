# Acceso y registro de clientes — rediseño del 26/10/2026

**Propuesta anterior conservada como historial.** Esta composición con fotografía fue sustituida por el refinamiento minimalista de una columna, sin imagen, tarjeta ni pestañas. La implementación y las verificaciones vigentes están en [AUTH_REFINEMENT.md](AUTH_REFINEMENT.md). Los resultados y capturas de este documento corresponden exclusivamente a la propuesta anterior; no se reescriben como si describieran la actual.

Estado: interfaces por correo y contraseña; Google OAuth retirado. Supabase Auth todavía no tiene SDK, proveedor ni configuración activa. No se simula un inicio de sesión, una cuenta creada ni un correo enviado.

## Decisión visual

La versión anterior concentraba la composición en 1140 px, con una fotografía atenuada por opacidad/gradiente y un lema más dominante que la tarea. El formulario parecía independiente, y Google añadía un bloque y un separador que el negocio ya no necesita.

Se investigaron páginas específicas de acceso y registro antes de modificar producción. La referencia principal es [COS Tailandia](https://th.cos.com/th_en/customer/account/login), por la alternancia visible y una acción principal. [Glossier](https://www.glossier.com/account/login) aporta una recuperación fácil de encontrar. También se revisaron Byredo, Aesop y Diptyque; las limitaciones de acceso a Sephora y Zara están documentadas en [AUTH_REDESIGN_REFERENCES.md](AUTH_REDESIGN_REFERENCES.md). Las versiones observadas no utilizan fotografía de acceso: la fotografía editorial es una adaptación propia de Aroma Infini.

El nuevo módulo ocupa el contenedor habitual: formulario primero, a la izquierda, y fotografía cálida a la derecha. Una única superficie suave une ambas partes, sin tarjetas anidadas, sombras, lema ni texto sobre la foto. Los campos conservan un ancho de lectura de hasta 480 px; el módulo aprovecha el monitor sin estirar los inputs. La altura responde al contenido del formulario y la foto acompaña mediante `object-fit: cover`; no se fuerza la altura de los campos para ajustarlos a la imagen.

Login y registro comparten estructura, tipografía y espaciados. El registro añade únicamente Nombre; mantiene correo y contraseña. Se abrevia el requisito de contraseña y se mantienen los enlaces legales. Se conserva el verde de marca, los controles de 48 px, foco visible, autocompletado y mostrar/ocultar contraseña.

En tablet y móvil (menos de 1024 px) queda una columna con el formulario holgado. La fotografía se retira también de la descarga: `picture` solo habilita la fuente fotográfica en escritorio y usa un recurso transparente mínimo de código en las pantallas pequeñas. En 390 × 844 los dos botones principales caben en la primera vista.

## Fotografía y limpieza

Se reutiliza `hero-v4-amber-desktop`, ya existente, con WebP de 960/1536/2048 px y sin modificar sus archivos. `srcset` conserva candidatos reales; `sizes` considera la resolución necesaria al recortar con `cover`, para evitar elegir una imagen pequeña solo por el ancho visible del panel. No se amplían archivos para aparentar mayor calidad. La fotografía sigue siendo conceptual/provisional, como en su uso original en Home.

Se retiraron el botón, el icono, el separador y los estilos de Google, así como `startGoogleSignIn` del controlador, servicio, adaptador, contrato y fixture. Tras comprobar que no tenían otros consumidores, se eliminaron exclusivamente:

- `public/brand/google-g.png`.
- `public/fonts/google-sans-medium.ttf`.
- `public/fonts/google-sans-OFL.txt`.

Se conserva Lato y cualquier herramienta o recurso ajeno a la autenticación. No se tocaron Home, Tienda, navegación comercial, diseño del panel, guards, roles ni reglas de propietario.

## Comportamiento y límite actual

Se mantienen validación, bloqueo de envíos repetidos, errores comprensibles, conservación de datos ante fallos, sesión expirada, cierre y retorno interno seguro. La recuperación usa un código de uso único guardado por el cliente; el callback solo limpia y rechaza enlaces antiguos. Cambiar el correo utiliza contraseña actual y no envía confirmaciones. Estado vigente: [Recuperación sin mensajes](AUTH_OFFLINE_RECOVERY.md).

El registro usa Supabase Auth sin confirmación por email: exige una sesión real y verifica el usuario y su actor antes de redirigir. Si el proveedor no devuelve sesión, se informa del error y se conservan los campos; no se muestra un éxito ficticio ni se pide revisar el correo. Véase la política vigente en [Supabase — Fase 3](SUPABASE_PHASE_3.md).

Se corrigió además el registro inmediatamente posterior a cerrar sesión dentro de la misma navegación SPA: una respuesta exitosa del adaptador permite verificar la nueva sesión; si el registro falla, se conserva el bloqueo del cierre anterior. No se cambian los guards, roles ni reglas de propietario.

El mensaje anterior de «próximamente» se sustituye por una nota breve y condicional debajo de la acción: «El acceso a cuentas todavía no está disponible». Se retirará automáticamente al configurar el proveedor. No se elimina para fingir que la autenticación funciona.

Para activar el flujo real faltan: proyecto y variables públicas de Supabase, SDK/adaptador de correo y contraseña, URLs de confirmación/recuperación, correo transaccional y política de confirmación, verificación de sesión/renovación, roles administrativos protegidos, RLS y repositorio de cuenta por propietario. Después deben probarse cuentas y correos reales. No se agregan proveedores sociales.

## Verificación

- `npm.cmd run typecheck`, `npm.cmd run lint` y `npm.cmd run build`: correctos. El build mantiene únicamente el aviso de tamaño ya existente para Excel/PDF; los formularios de acceso no incorporan esas dependencias.
- Suite completa: **821 aprobadas, 0 fallos y 3 capturas administrativas opcionales omitidas**, de 824 casos. Registro: `artifacts/auth-redesign-2026-10-26/full.log`.
- Después del ajuste puntual del registro tras salir y de marcar la fotografía como decorativa, se repitieron los módulos afectados completos: **70/70 aprobados**, incluidos los **26 casos de autenticación**, cuenta, checkout, espaciados, consistencia y rutas del Worker. Registro: `final-tests.log` en la misma carpeta. Los resultados de ejecuciones distintas no se suman como si fueran casos únicos.
- Validaciones de campos, mostrar/ocultar, foco, teclado, carga, doble envío, conservación del borrador ante errores, ausencia de Google, tres respuestas de registro, recuperación, caducidad, cierre con error del proveedor, identidad/propietario y permisos administrativos: comprobados con adaptadores aislados. Esto no acredita cuentas ni correos reales de Supabase.
- Capturas y medidas en los cinco tamaños solicitados: sin desbordamientos, imágenes rotas ni errores de página. En móvil, los botones terminan aproximadamente a 581 px (login) y 657 px (registro), dentro de 844 px; ambos miden 48 px de alto. Formulario móvil: 343 px útiles.
- Lectura visual de contraste y proporciones, además de revisión independiente de capturas. Medidas de texto: mínimo **5,09:1**; bordes de input: **3,06:1**; controles evaluados: mínimo **44 px**. La comprobación automática complementa la revisión visual; no representa una certificación de accesibilidad.
- Comparación del acceso administrativo a 1440 × 900: **0 píxeles diferentes** frente al estado previo. No se rediseñó el panel ni se modificaron sus permisos.
- Fotografía en dispositivos 2×: la variante de 2048 px se solicita en escritorio; móvil y tablet no descargan la foto oculta. Evidencia: `media-check.json`. No se recomprimieron ni ampliaron los originales.
- Compilación de producción comprobada en Vite preview: login/registro correctos, Google y sus tres activos ausentes también de `dist`, cero solicitudes externas de autenticación y cero errores de página. Los formularios sin proveedor muestran indisponibilidad y no anuncian un éxito. `/admin`, `/cuenta` y restablecimiento conservan sus restricciones de interfaz. Evidencia: `production-check.json`.

Los logs finales, medidas y capturas permanecen en `artifacts/auth-redesign-2026-10-26/`, excluidos de Git como el resto de evidencias generadas. No se desplegó ni se conectó Supabase.

Capturas previas y finales, tanto de viewport como de página completa, en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844. Carpeta: `artifacts/auth-redesign-2026-10-26/`; incluye medidas, errores de navegador y comprobaciones de fotografía.

| Vista | Antes | Después |
| --- | --- | --- |
| Login desktop | [1440 × 900](../artifacts/auth-redesign-2026-10-26/before/login-desktop-viewport.png) | [1440 × 900](../artifacts/auth-redesign-2026-10-26/after/login-desktop-viewport.png) |
| Registro desktop | [1440 × 900](../artifacts/auth-redesign-2026-10-26/before/register-desktop-viewport.png) | [1440 × 900](../artifacts/auth-redesign-2026-10-26/after/register-desktop-viewport.png) |
| Login móvil | [390 × 844](../artifacts/auth-redesign-2026-10-26/before/login-mobile-viewport.png) | [390 × 844](../artifacts/auth-redesign-2026-10-26/after/login-mobile-viewport.png) |
| Registro móvil | [390 × 844](../artifacts/auth-redesign-2026-10-26/before/register-mobile-viewport.png) | [390 × 844](../artifacts/auth-redesign-2026-10-26/after/register-mobile-viewport.png) |

El comando `node scripts/capture-phase-7.mjs` vuelve a generar la matriz vigente de 25 pantallas de acceso/registro/recuperación y administración en `artifacts/auth-redesign-2026-10-26/screens/`; las pruebas administrativas usan únicamente adaptadores aislados de Playwright.

Archivos principales: `AuthScreen.tsx` y `auth.css` (composición), `AuthPage.tsx` (registro), contratos/servicios de autenticación (retirada de Google) y `tests/auth-interfaces.spec.ts` / `tests/auth-fixtures.ts` (pruebas aisladas). No se incorporan dependencias nuevas.
