interface PaginationProps {
  page: number
  totalPages: number
  totalItems: number
  onPageChange: (page: number) => void
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) {
    return (
      <div className="pagination-summary">
        {totalItems} {totalItems === 1 ? 'registro' : 'registros'}
      </div>
    )
  }

  return (
    <div className="pagination-bar">
      <span>
        Página {page} de {totalPages} · {totalItems} registros
      </span>
      <div className="pagination-actions">
        <button
          type="button"
          className="button button-secondary button-compact"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="button button-secondary button-compact"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}
