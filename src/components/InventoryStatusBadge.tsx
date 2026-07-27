import {
  inventoryStockStatusLabels,
  type InventoryStockStatus,
} from '../types/inventory'

interface InventoryStatusBadgeProps {
  status: InventoryStockStatus
}

export function InventoryStatusBadge({ status }: InventoryStatusBadgeProps) {
  return (
    <span className={`inventory-status inventory-status-${status.toLowerCase()}`}>
      {inventoryStockStatusLabels[status]}
    </span>
  )
}
