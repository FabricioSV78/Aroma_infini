# Acceso y registro: composición sobria

> **Documento histórico.** Esta iteración sin imagen ni selector superior fue sustituida por [AUTH_EDITORIAL.md](AUTH_EDITORIAL.md), que documenta el estado vigente. Las pruebas y capturas siguientes corresponden exclusivamente a esta propuesta anterior.

26 de octubre de 2026. Esta revisión sustituye la composición fotográfica de [AUTH_REDESIGN.md](AUTH_REDESIGN.md), que permanece como historial.

## Decisión

Se retiró la fotografía por completo. Reducirla a una miniatura habría conservado una segunda zona de contenido que no ayuda a completar el acceso. La propuesta anterior seguía dependiendo de dos mitades grandes y de una superficie que ocupaba más espacio del que necesitaban los campos.

La nueva disposición concentra la tarea en una columna de hasta **440 px**, sin tarjeta exterior, fotografía, fondo coloreado ni altura artificial de pantalla completa. El título tiene una escala moderada, los campos comparten eje y el botón verde queda próximo a la tarea. La identidad proviene de Lato, del verde de Aroma Infini y de proporciones consistentes.

Se elimina la repetición de pestaña/título y se mantiene un enlace alternativo bajo el formulario: «Crear cuenta» o «Iniciar sesión». Solo quedan título, campos, mostrar/ocultar, recuperación, acción principal, requisitos breves y enlaces legales necesarios para el registro. La recuperación conserva su instrucción útil y el retorno al acceso.

## Referencias

Se revisaron rutas específicas de [Byredo UK](https://www.byredo.com/uk_en/login), [COS Tailandia](https://th.cos.com/th_en/customer/account/login), [Diptyque](https://www.diptyqueparis.com/en_us/login/), [Glossier](https://www.glossier.com/account/login) y Aesop KSA. Sus flujos permiten concentrar el acceso en campos y acciones sin fotografía principal. No se copian sus registros extensos, requisitos regionales ni el acceso OTP de Diptyque.

La investigación y sus límites están en `artifacts/auth-refinement-2026-10-26/references.md`; distingue la lectura web/árbol accesible actual de las capturas visuales de la investigación anterior. No se afirma haber inspeccionado píxeles de una captura de referencia que no llegó a completarse.

## Alcance funcional

- Se conservan las validaciones, mostrar/ocultar, autocompletado, carga, prevención de duplicados y borradores ante errores.
- Se conservan registro, confirmación, recuperación y retornos internos existentes, así como los guards, roles y reglas de propietario.
- El aviso pasivo «El acceso a cuentas todavía no está disponible» ya no aparece en el formulario de clientes. **Supabase sigue sin configurar**: al intentar una operación, el adaptador devuelve un error real de indisponibilidad. No se simulan sesiones, cuentas ni correos enviados. El retiro de un texto visual no activa el backend.
- Google continúa retirado. La administración conserva su composición y su aviso; esta revisión es de clientes.
- Se retira únicamente el uso fotográfico del acceso. Las imágenes `hero-v4-amber-*` se conservan porque Home las utiliza. No se crean recursos ni dependencias nuevas.

## Validación

- Typecheck, lint y build correctos. Vite conserva el aviso previo sobre el tamaño de los módulos Excel/PDF, ajenos al acceso.
- **70/70 pruebas aprobadas**: autenticación (26), cuenta, checkout, espaciados, consistencia y clasificación de rutas. Incluyen navegación con teclado, validación, error sin pérdida de datos, carga, doble envío, registro/confirmación, recuperación, expiración, roles y propietario. Se repitieron los módulos afectados; esta ejecución no se presenta como una nueva suite completa del proyecto.
- Cinco tamaños reales: 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844; capturas de login, registro y recuperación, más administración para verificar consistencia. Sin desbordamientos ni errores de página. Los botones de login y registro permanecen dentro de la primera vista móvil.
- Contraste medido en el formulario: texto mínimo **5,46:1** y bordes de campos **3,06:1**; controles evaluados de al menos **44 px**. Esta revisión complementa la inspección visual y el teclado; no constituye una certificación integral.
- Inspección visual independiente: formulario como único foco, registro completo en laptop/móvil y espacios laterales destinados a concentrar la lectura, sin una altura de página estirada artificialmente. Evidencia: `visual-review.md` en la carpeta de artefactos.
- Comparación antes/después de `/admin/login` en 1440 × 900: **0 píxeles modificados**. El diseño y los permisos administrativos se conservan.
- Prueba adicional de la compilación de producción: acceso y registro sin fotografía ni aviso pasivo; cero solicitudes de imágenes de autenticación, cero solicitudes externas y cero errores de página. Enviar sin proveedor devuelve indisponibilidad, conserva el borrador y no guarda contraseña/correo en almacenamiento. Las rutas de cuenta y administración siguen redirigiendo a sus accesos.

Evidencia: `tests.log`, `typecheck.log`, `lint.log`, `build.log`, `accessibility-check.json`, `admin-comparison.json`, `production-check.json` y `after/measurements.json`, dentro de `artifacts/auth-refinement-2026-10-26/`. Se utilizó un servidor de revisión aislado en el puerto 5174, sin detener el servidor que ya ocupaba 5173. No se conectó ni se desplegó un backend.

Capturas comparativas reales en 1920 × 1080, 1440 × 900, 1366 × 768, 768 × 1024 y 390 × 844. Archivos completos, viewports y medidas en `artifacts/auth-refinement-2026-10-26/`.

| Vista | Antes | Después |
| --- | --- | --- |
| Iniciar sesión, escritorio | [1440 × 900](../artifacts/auth-refinement-2026-10-26/before/login-desktop-viewport.png) | [1440 × 900](../artifacts/auth-refinement-2026-10-26/after/login-desktop-viewport.png) |
| Crear cuenta, escritorio | [1440 × 900](../artifacts/auth-refinement-2026-10-26/before/register-desktop-viewport.png) | [1440 × 900](../artifacts/auth-refinement-2026-10-26/after/register-desktop-viewport.png) |
| Iniciar sesión, móvil | [390 × 844](../artifacts/auth-refinement-2026-10-26/before/login-mobile-viewport.png) | [390 × 844](../artifacts/auth-refinement-2026-10-26/after/login-mobile-viewport.png) |
| Crear cuenta, móvil | [390 × 844](../artifacts/auth-refinement-2026-10-26/before/register-mobile-viewport.png) | [390 × 844](../artifacts/auth-refinement-2026-10-26/after/register-mobile-viewport.png) |

Los archivos de aplicación modificados son `src/features/auth/AuthScreen.tsx` y `auth.css`. Se actualiza la prueba de composición en `tests/auth-interfaces.spec.ts`. Los servicios de autenticación, cuenta, catálogo, checkout y los permisos no se cambian en esta revisión.
