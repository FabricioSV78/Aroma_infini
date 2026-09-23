interface AdminPaginationProps {
  label: string
  page: number
  totalPages: number
  totalItems: number
  from: number
  to: number
  onPageChange: (page: number) => void
}

export function AdminPagination({
  label,
  page,
  totalPages,
  totalItems,
  from,
  to,
  onPageChange,
}: AdminPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav className="admin-pagination" aria-label={`Paginación de ${label}`}>
      <p aria-live="polite">
        Mostrando {from}–{to} de {totalItems} {label}
      </p>
      <div>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
        >
          Anterior
        </button>
        <span aria-current="page">
          Página {page} de {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
        >
          Siguiente
        </button>
      </div>
    </nav>
  )
}
