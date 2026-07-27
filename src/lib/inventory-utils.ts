import type { PostgrestError } from '@supabase/supabase-js'
import type {
  InventoryStockStatus,
  ManualInventoryMovementType,
} from '../types/inventory'

export function getInventoryStockStatus(
  stockActual: number,
  stockMinimo: number,
): InventoryStockStatus {
  if (stockActual <= 0) return 'AGOTADO'
  if (stockMinimo > 0 && stockActual <= stockMinimo) return 'CRITICO'
  return 'NORMAL'
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value)
}

export function movementDirection(
  type: ManualInventoryMovementType,
): 'INCREASE' | 'DECREASE' {
  return type === 'AJUSTE_NEGATIVO' ? 'DECREASE' : 'INCREASE'
}

export function getInventoryErrorMessage(
  error: Pick<PostgrestError, 'code' | 'message'>,
): string {
  const message = error.message || ''
  const normalized = message.toLowerCase()

  const knownMessages = [
    'debes iniciar sesión',
    'tu rol no puede',
    'tipo de movimiento manual',
    'cantidad debe ser mayor',
    'ingresa un motivo',
    'almacén no existe',
    'producto no existe',
    'no existe una configuración',
    'movimiento dejaría el stock en negativo',
    'stock mínimo debe ser',
  ]

  if (knownMessages.some((candidate) => normalized.includes(candidate))) {
    return message
  }

  if (error.code === '42501' || error.code === 'PGRST301') {
    return 'Tu rol no tiene permiso para realizar esta operación.'
  }

  if (error.code === '23514') {
    return 'Uno o más valores no cumplen las reglas de inventario.'
  }

  if (error.code === '23503') {
    return 'El producto o almacén seleccionado ya no está disponible.'
  }

  return message || 'No se pudo completar la operación de inventario.'
}
