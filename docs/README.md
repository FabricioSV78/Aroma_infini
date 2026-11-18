# Documentación de Aroma Infini

Las configuraciones y migraciones del repositorio definen el sistema. Las guías
explican su operación y los informes fechados conservan lo comprobado en cada
entrega. Un informe antiguo no acredita el estado actual de producción.

## Desarrollo, validación y despliegue

- [Limpieza del repositorio del 17 de noviembre](REPOSITORY_CLEANUP_2026_11_17.md):
  inventario, exclusiones de Git, pruebas y simulación de archivos pendientes.
- [README del proyecto](../README.md): arquitectura, instalación y comandos.
- [Calidad y pruebas](QUALITY_CHECKS.md): comprobaciones y límites.
- [Flujo de GitHub](GITHUB_DEPLOYMENT.md): ramas, entornos y aprobación de producción.
- [Staging de Cloudflare](CLOUDFLARE_STAGING.md): configuración y comprobación de solo lectura.
- [Supabase](../supabase/README.md): esquema, migraciones y operación.
- [Preparación de producción](PRODUCTION_PREPARATION.md) y
  [transición de respaldos](BACKUP_PRO_TRANSITION.md): condiciones y acciones externas.

## Operación de funcionalidades

- [Medios y R2](R2_MEDIA_OPERATIONS.md): subidas directas, reemplazos y limpieza.
- [Vídeo exclusivo de escritorio](MOBILE_VIDEO_POLICY.md): selección responsive y portadas móviles.
- [Recuperación sin correo ni SMTP](AUTH_OFFLINE_RECOVERY.md) y
  [dispositivos administrativos de confianza](ADMIN_TRUSTED_DEVICES.md).
- [Importación de productos](importacion-productos.md),
  [familias olfativas](OLFACTORY_FAMILY_MANAGEMENT.md) y
  [más vendidos](BESTSELLERS.md).
- [Recomendador](fragrance-finder.md), [pedidos y PDF](pedidos-pdf.md),
  [ubicación de entrega](ACCOUNT_DELIVERY_LOCATION.md) y
  [mensajes del panel](ADMIN_MESSAGES.md).
- [PWA y notificaciones](ADMIN_PUSH_NOTIFICATIONS.md),
  [analítica y consentimiento](ANALYTICS_IMPLEMENTATION.md) y
  [Contacto, redes y QR](CONTACT_SOCIAL_QR.md).

## Evidencias recientes e historial

- [Rendimiento del 17 de noviembre](PRIORITY_PERFORMANCE_2026_11_17.md):
  despliegue de staging, mediciones comparativas y límites pendientes.
- [Intervención del 16 de noviembre](FINAL_MISSION_2026_11_16.md):
  reservas de stock, verificaciones y evidencias de aquella entrega.
- [Auditoría funcional administrativa del 10 de noviembre](ADMIN_FUNCTIONAL_AUDIT_2026_11_10.md).
- [Sincronización y limpieza del 12 de noviembre](SUPABASE_SYNC_CLEANUP_2026_11_12.md):
  registro de esa revisión, no inventario permanente del entorno remoto.

Los documentos `PHASE_*`, `SUPABASE_PHASE_*`, revisiones visuales `HOME_*` y
`AUTH_*`, planes de integración y auditorías fechadas se conservan como historial
de requisitos, decisiones y pruebas. No se mueven para evitar romper sus enlaces.
[Biblioteca multimedia](MEDIA_LIBRARY.md), [Home remoto](R2_HOME_IMPLEMENTATION.md)
y [campañas del Hero](HERO_CAMPAIGNS.md) identifican expresamente sus alcances
históricos y remiten a las guías actuales.

Las capturas y trazas enlazadas suelen vivir en `artifacts/`, ignorado por Git.
Algunos artefactos también son entradas de herramientas o respaldos: no deben
borrarse de forma general por ser resultados locales.
