# Contacto: redes sociales y QR

7 de noviembre de 2026.

## Configuración

En **Configuración → Datos de la tienda → Redes sociales**, el administrador
puede guardar Instagram, Facebook y TikTok. Dejar un campo vacío oculta ese
botón. Contacto y footer conservan la misma configuración persistente existente,
sin otro modelo, migración ni permisos nuevos.

Se aceptan URLs HTTPS de los dominios exactos de cada plataforma. Se rechazan
protocolos inseguros, credenciales, puertos, fragmentos y dominios que imitan a
la red social. Contacto comprueba también el enlace antes de mostrarlo.
Los botones conservan el verde de marca, nombres visibles, iconos vectoriales
reconocibles, foco de teclado, aviso de nueva pestaña y superficie táctil de
al menos 44 px. No cargan widgets ni scripts de las redes sociales.

Los perfiles de las capturas automatizadas son fixtures aislados. **No se han
guardado ni inventado perfiles oficiales en los servicios alojados.**

## QR para tarjetas

El bloque **QR de Contacto**, en la misma configuración administrativa, permite
descargar SVG y PNG. Usa exclusivamente `VITE_SITE_URL` y la ruta `/contacto`;
nunca toma el origen del navegador. La descarga se bloquea si falta el dominio
o corresponde a localhost, una IP, staging, un marcador o un hosting temporal.

La dirección definitiva será **`https://<dominio-definitivo>/contacto`**.
El dominio todavía no fue proporcionado ni conectado, por lo que **no existe
un QR definitivo listo para imprenta**. Configurar el dominio es parte del
despliegue existente; no se duplica como dato editable de negocio en Supabase.
Validar su formato no acredita su propiedad ni que ya esté publicado.

La generación es local, sin API externa, acortador ni redirección de terceros.
El codificador `qrcode-generator` 2.0.4 no tiene dependencias propias y se carga
solo al pulsar la descarga administrativa: 7.98 kB gzip en un chunk separado.
No se añade al recorrido de Contacto para compradores.

- **SVG:** vectorial, tamaño inicial 30 × 30 mm, módulos cuadrados.
- **PNG:** píxeles enteros por módulo y más de 1000 px por lado; sin escalado
  borroso ni transparencia. Su tamaño físico debe fijarse en la maquetación.
- Blanco y negro, corrección M, margen blanco de cuatro módulos y sin logo.
- Usar inicialmente al menos 25 × 25 mm, respetando el margen. La prueba
  impresa real decide si el tamaño funciona en el material elegido.

Antes de imprimir el lote: confirmar la URL y HTTPS públicos, comprobar que
Contacto carga directamente y escanear una tarjeta de prueba con iPhone y
Android. No recortar el margen ni colocar el código sobre una fotografía.
Cambiar los perfiles sociales posteriormente no requiere reimprimir el QR
mientras se conserve la dirección de Contacto.

## Validación y límites

- TypeScript, ESLint y build de producción: correctos.
- 53 pruebas del contrato, configuración y navegador: correctas. Incluyen
  guardado compartido, errores, conflictos, protección del borrador, botones,
  teclado, descargas y rechazo de destinos provisionales.
- Capturas reales de Chrome en 1920 × 1080, 1440 × 900, 1366 × 768,
  768 × 1024 y 390 × 844. Sin desbordamientos ni controles comprimidos.
- Un decodificador independiente leyó cuatro variantes de prueba en memoria:
  SVG rasterizado, PNG original, PNG reducido y PNG reducido girado. No se
  entregan imágenes QR de prueba que pudieran confundirse con material final.
- Las pruebas de Supabase de esta entrega usan transporte aislado y la
  aplicación real. No se presentan como escrituras reales de producción.
- **Pendiente:** URLs oficiales, dominio definitivo público y escaneo con
  cámaras de teléfonos físicos. La emulación móvil no sustituye esa prueba.
- Sin cambios en diseño de otras páginas, RLS, MFA o datos alojados. No se
  desplegó esta entrega en producción.

Evidencias: `artifacts/contact-social-qr-2026-11-07/`. La configuración de prueba
de esa carpeta evita una demora de cierre de procesos Vite en Windows; las
53 pruebas y sus aserciones son las de la suite del proyecto.

Referencias: [margen QR de DENSO WAVE](https://www.qrcode.com/en/howto/code.html),
[codificador QR](https://github.com/kazuhikoarase/qrcode-generator/blob/master/js/README.md)
y [Bootstrap Icons](https://github.com/twbs/icons/tree/v1.13.1) (glifos de marca,
licencia MIT incluida en el componente).
