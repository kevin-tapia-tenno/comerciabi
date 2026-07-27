export type InventoryMovementType =
  | 'ENTRADA'
  | 'SALIDA'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'REVERSA'
  | 'REVERSA_COMPRA'

export type ManualInventoryMovementType =
  | 'ENTRADA'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'

export type InventoryStockStatus = 'AGOTADO' | 'CRITICO' | 'NORMAL'

export interface InventoryStock {
  id: string
  almacen_id: string
  producto_id: string
  stock_actual: number
  stock_minimo: number
  actualizado_at: string
}

export interface InventoryMovement {
  id: string
  empresa_id: string
  almacen_id: string
  producto_id: string
  venta_id: string | null
  compra_id: string | null
  usuario_empresa_id: string
  tipo_movimiento: InventoryMovementType
  cantidad: number
  stock_anterior: number
  stock_resultante: number
  motivo: string
  fecha_movimiento: string
  creado_at: string
}

export interface InventoryMovementRpcResult {
  movimiento_id: string
  stock_anterior: number
  stock_resultante: number
  tipo_movimiento: InventoryMovementType
  fecha_movimiento: string
}

export interface StockMinimumRpcResult {
  existencia_id: string
  stock_actual: number
  stock_minimo: number
  actualizado_at: string
}

export const inventoryMovementLabels: Record<InventoryMovementType, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida por venta',
  AJUSTE_POSITIVO: 'Ajuste positivo',
  AJUSTE_NEGATIVO: 'Ajuste negativo',
  REVERSA: 'Reversa de venta',
  REVERSA_COMPRA: 'Reversa de compra',
}

export const inventoryStockStatusLabels: Record<InventoryStockStatus, string> = {
  AGOTADO: 'Agotado',
  CRITICO: 'Stock crítico',
  NORMAL: 'Normal',
}
