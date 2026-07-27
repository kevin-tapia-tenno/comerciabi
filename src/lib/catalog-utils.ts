import type { PostgrestError } from '@supabase/supabase-js'

export function cleanOptionalText(value: string): string | null {
  const cleaned = value.trim()
  return cleaned.length > 0 ? cleaned : null
}

export function sanitizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[(),"'\\%_]/g, ' ')
    .replace(/\s+/g, ' ')
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function formatMoney(value: number, currency = 'PEN'): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

export function getCatalogErrorMessage(
  error: PostgrestError,
  entity: 'cliente' | 'categoría' | 'producto',
): string {
  if (error.code === '23505') {
    if (entity === 'cliente') {
      return 'Ya existe un cliente con ese tipo y número de documento.'
    }

    if (entity === 'categoría') {
      return 'Ya existe una categoría con ese nombre.'
    }

    return 'Ya existe un producto con ese SKU.'
  }

  if (error.code === '23514') {
    return 'Uno o más valores no cumplen las reglas definidas en la base de datos.'
  }

  if (error.code === '23503') {
    return 'El registro seleccionado está relacionado con información que ya no está disponible.'
  }

  if (error.code === '42501' || error.code === 'PGRST301') {
    return 'Tu rol no tiene permiso para realizar esta operación.'
  }

  return error.message || 'No se pudo completar la operación.'
}
