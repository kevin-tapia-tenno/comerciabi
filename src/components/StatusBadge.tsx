interface StatusBadgeProps {
  active: boolean
}

export function StatusBadge({ active }: StatusBadgeProps) {
  return (
    <span className={`data-badge ${active ? 'data-badge-active' : 'data-badge-inactive'}`}>
      {active ? 'Activo' : 'Inactivo'}
    </span>
  )
}
