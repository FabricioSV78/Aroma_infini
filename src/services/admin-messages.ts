/** Only authored, actionable validation messages may cross the UI boundary. */
export class UserFacingError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'UserFacingError'
    this.code = code
  }
}

export type AdminMessageContext =
  | 'save'
  | 'image'
  | 'video'
  | 'excel'
  | 'import'
  | 'download'
  | 'orders'
  | 'storage'

const titles: Record<AdminMessageContext, string> = {
  save: 'No se pudieron guardar los cambios',
  image: 'No se pudo preparar la imagen',
  video: 'No se pudo preparar el video',
  excel: 'No se pudo leer el Excel',
  import: 'No se pudieron importar los productos',
  download: 'No se pudo descargar la plantilla',
  orders: 'No se pudo completar la operación',
  storage: 'No se pudieron guardar los cambios',
}

const suggestions: Record<AdminMessageContext, string> = {
  save: 'La operación no pudo completarse. Conserva tus cambios y vuelve a intentarlo.',
  image:
    'No se pudo procesar este archivo. Prueba con otra imagen JPG, PNG, WebP o AVIF.',
  video: 'No se pudo procesar este archivo. Prueba con otro video MP4.',
  excel:
    'No se pudo leer el archivo. Usa la plantilla de productos y vuelve a cargarla.',
  import:
    'La importación no pudo completarse. Revisa la vista previa y vuelve a confirmar cuando estés listo.',
  download: 'La descarga no pudo completarse. Vuelve a intentarlo.',
  orders:
    'La operación no pudo completarse. Revisa los pedidos antes de volver a intentarlo.',
  storage:
    'El cambio está aplicado en esta sesión, pero no se pudo guardar en este navegador. Reintenta antes de salir.',
}

/** Adapt backend error codes here when a remote repository is connected. Never render raw messages. */
export function getAdminErrorMessage(
  error: unknown,
  context: AdminMessageContext = 'save',
) {
  let description = suggestions[context]
  if (error instanceof UserFacingError) description = error.message
  else {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined
    const name = error instanceof Error ? error.name : undefined
    if (name === 'QuotaExceededError') {
      description =
        'El navegador no tiene espacio suficiente para guardar los cambios. Libera espacio o utiliza imágenes más ligeras y reintenta antes de salir.'
    } else if (name === 'NotAllowedError' || name === 'SecurityError') {
      description =
        'El navegador está impidiendo guardar los cambios. Revisa los permisos de almacenamiento del sitio y vuelve a intentarlo.'
    } else if (code === '23505') {
      description =
        'Ya existe un registro con esos datos. Revisa el nombre o código antes de guardar.'
    } else if (code === '42501') {
      description =
        'Tu cuenta no tiene permiso para realizar esta acción. Solicita acceso a un administrador.'
    } else if (code === 'PGRST301' || code === 'JWT_EXPIRED') {
      description =
        'Tu sesión ha vencido. Vuelve a iniciar sesión antes de continuar.'
    } else if (name === 'AbortError') {
      description =
        'La operación se interrumpió antes de completarse. Vuelve a intentarlo cuando estés listo.'
    }
  }
  return { kind: 'error' as const, title: titles[context], description }
}
