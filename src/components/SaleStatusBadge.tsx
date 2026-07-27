import {
  saleStatusLabels,
  type SaleStatus,
} from '../types/sales'

interface SaleStatusBadgeProps {
  status: SaleStatus
}

export function SaleStatusBadge({ status }: SaleStatusBadgeProps) {
  return (
    <span className={`sale-status sale-status-${status.toLowerCase()}`}>
      {saleStatusLabels[status]}
    </span>
  )
}
