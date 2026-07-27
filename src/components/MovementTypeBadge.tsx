import {
  inventoryMovementLabels,
  type InventoryMovementType,
} from '../types/inventory'

interface MovementTypeBadgeProps {
  type: InventoryMovementType
}

export function MovementTypeBadge({ type }: MovementTypeBadgeProps) {
  return (
    <span className={`movement-type movement-type-${type.toLowerCase()}`}>
      {inventoryMovementLabels[type]}
    </span>
  )
}
