import {
  purchaseStatusLabels,
  type PurchaseStatus,
} from '../types/purchases'

interface PurchaseStatusBadgeProps {
  status: PurchaseStatus
}

export function PurchaseStatusBadge({ status }: PurchaseStatusBadgeProps) {
  return (
    <span className={`purchase-status purchase-status-${status.toLowerCase()}`}>
      {purchaseStatusLabels[status]}
    </span>
  )
}
