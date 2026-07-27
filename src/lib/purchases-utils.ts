import type { PostgrestError } from '@supabase/supabase-js'

export function getPurchaseErrorMessage(
  error: Pick<PostgrestError, 'code' | 'message' | 'details' | 'hint'>,
): string {
  const message = `${error.message ?? ''} ${error.details ?? ''}`.trim()
  const normalized = message.toLowerCase()

  const knownMessages = [
    'debes iniciar sesión',
    'tu rol no puede',
    'selecciona un proveedor activo',
    'selecciona un almacén activo',
    'la compra debe incluir al menos un producto',
    'no se puede repetir un producto',
    'cantidades, costos o descuentos inválidos',
    'productos inexistentes o inactivos',
    'solo se pueden editar compras en estado borrador',
    'solo se pueden confirmar compras en estado borrador',
    'la compra no tiene productos para confirmar',
    'no existe una configuración de stock',
    'solo un administrador puede anular compras confirmadas',
    'solo se pueden anular compras confirmadas',
    'ingresa el motivo de anulación',
    'no se puede anular: el stock disponible',
  ]

  if (knownMessages.some((candidate) => normalized.includes(candidate))) {
    return message.split(/\n|DETAIL:/i)[0].trim()
  }

  if (error.code === '23505') {
    if (normalized.includes('proveedores')) {
      return 'Ya existe un proveedor con ese documento o razón social.'
    }
    return 'El código de compra ya existe. Inténtalo nuevamente.'
  }

  if (error.code === '23514') {
    return 'Uno o más valores no cumplen las reglas de compras.'
  }

  if (error.code === '23503') {
    return 'Uno de los registros relacionados ya no está disponible.'
  }

  if (error.code === '42501' || error.code === 'PGRST301') {
    return 'Tu rol no tiene permiso para realizar esta operación.'
  }

  return message || 'No se pudo completar la operación de compras.'
}
