# Primera ejecución de GitHub Actions

10 de noviembre de 2026. Revisión de la ejecución
[42923860749](https://github.com/FabricioSV78/Aroma_infini/actions/runs/42923860749)
del commit `ffb2e39`. El push se completó; esta ejecución corresponde a las
comprobaciones de `main` y no desplegó staging ni producción.

## Fallos comprobados y correcciones

| Trabajo                       | Causa comprobada                                                                                                                                                                  | Corrección                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`                     | Una prueba esperaba la validación del perfil de respaldo, pero Linux recibía primero el rechazo por plataforma.                                                                   | Validar confirmación y perfil antes de Windows. Todos los guardas siguen precediendo a cualquier acceso a credenciales o archivos privados; el exportador sigue siendo exclusivo de Windows. |
| `sql-local`                   | El checkout Windows convertía SQL a CRLF. Una sustitución literal de una migración anterior no encontraba su fragmento LF y otra comprobación detectaba la definición incompleta. | `.gitattributes` conserva LF en todos los archivos SQL. No se modificaron migraciones históricas, permisos ni comprobaciones de seguridad.                                                   |
| `isolated (browser-commerce)` | La respuesta de cotización retiraba un mensaje de carga durante el clic y desplazaba el botón de contacto 24 píxeles.                                                             | Ubicar el mensaje en el espacio existente del encabezado, sin modificar la altura de la composición en reposo, y añadir una regresión con respuesta de red controlada.                       |

El aviso sobre la actualización de `ubuntu-latest` es informativo; no explica
ninguno de estos tres fallos. Los registros originales y las trazas se conservan
en `artifacts/github-actions-first-run-2026-11-10/`.

## Validación

- La reproducción SQL con CRLF falló exactamente como GitHub tras 25 migraciones.
  Con LF pasaron las 31 migraciones y 735 comprobaciones en PostgreSQL nativo
  desechable, con rollback confirmado al finalizar las pruebas.
- La nueva regresión de checkout falló antes de corregir el componente en sus
  tres tamaños, mostrando el desplazamiento de 24 píxeles. Tras el cambio pasaron
  los 24 casos únicos de la suite, incluidas las tres regresiones. No se ampliaron
  tiempos de espera ni se añadieron reintentos.
- Se comprobaron las capturas de carga y reposo en 1440, 768 y 390 píxeles. El
  contenido de checkout en reposo conserva las mismas dimensiones y píxeles; la
  comparación móvil del encabezado global refleja distinto historial de scroll.
- Las pruebas Node incluyen la validación de los guardas en procesos aislados
  que representan Windows, Linux y macOS, y la política real de Git para SQL.
- Los resultados globales de Node, TypeScript, lint, build y auditoría de
  dependencias se registran en `result.json` de esa carpeta de evidencias.

Estas pruebas locales no convierten en verde una ejecución alojada del commit
anterior. Para verificar las correcciones en GitHub hay que subir un nuevo commit
a `main` y comprobar su nueva ejecución. Crear `develop` corresponde después de
que esas comprobaciones pasen y de configurar el entorno de staging.

No se hicieron commits, pushes, migraciones remotas ni despliegues durante esta
corrección. Los datos y secretos alojados permanecen intactos.
