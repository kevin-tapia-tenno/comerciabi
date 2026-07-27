import type { PostgrestError } from '@supabase/supabase-js'

export function toDateTimeLocal(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

export function dateStartToIso(value: string): string | null {
  if (!value) return null
  return new Date(`${value}T00:00:00`).toISOString()
}

export function dateEndExclusiveToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return date.toISOString()
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export function getSaleErrorMessage(
  error: Pick<PostgrestError, 'code' | 'message' | 'details' | 'hint'>,
): string {
  const message = `${error.message ?? ''} ${error.details ?? ''}`.trim()
  const normalized = message.toLowerCase()

  const knownMessages = [
    'la venta debe incluir al menos un producto',
    'no se puede repetir un producto',
    'cantidades, precios o descuentos inválidos',
    'productos inexistentes o inactivos',
    'selecciona un cliente activo',
    'selecciona un almacén activo',
    'selecciona un canal de venta activo',
    'solo se pueden editar ventas en estado borrador',
    'solo puedes editar tus propias ventas',
    'solo puedes confirmar tus propias ventas',
    'stock insuficiente o no configurado',
    'solo un administrador puede anular',
    'ingresa el motivo de anulación',
    'solo se pueden anular ventas confirmadas',
  ]

  const matched = knownMessages.find((item) => normalized.includes(item))
  if (matched) {
    const sentence = message.split(/\n|DETAIL:/i)[0].trim()
    return sentence || 'No se pudo completar la operación.'
  }

  if (error.code === '23505') {
    return 'El código de venta ya existe. Inténtalo nuevamente.'
  }

  if (error.code === '23514') {
    return 'La venta contiene valores que no cumplen las reglas del negocio.'
  }

  if (error.code === '23503') {
    return 'Uno de los registros relacionados ya no está disponible.'
  }

  if (error.code === '42501' || error.code === 'PGRST301') {
    return 'Tu rol no tiene permiso para realizar esta operación.'
  }

  return message || 'No se pudo completar la operación de venta.'
}
