import type { PostgrestError } from '@supabase/supabase-js'

import type { ApiAuthContext } from './api-client'
import { apiPost } from './api-client'
import { supabase } from './supabase'

import type { UserRole } from '../types/auth'
import type {
  AdminCompanyUser,
  InviteCompanyUserPayload,
  InviteCompanyUserResponse,
} from '../types/admin'


export async function listCompanyUsers(
  empresaId: string,
): Promise<AdminCompanyUser[]> {
  const { data, error } = await supabase.rpc(
    'listar_usuarios_empresa_admin',
    {
      p_empresa_id: empresaId,
    },
  )

  if (error) {
    throw error
  }

  return (data ?? []) as AdminCompanyUser[]
}


export async function inviteCompanyUser(
  auth: ApiAuthContext,
  payload: InviteCompanyUserPayload,
): Promise<InviteCompanyUserResponse> {
  return apiPost<
    InviteCompanyUserResponse,
    InviteCompanyUserPayload
  >(
    auth,
    '/api/v1/admin/users/invite',
    payload,
  )
}


export async function updateCompanyUserRole(
  empresaId: string,
  membershipId: string,
  rol: UserRole,
): Promise<void> {
  const { data, error } = await supabase
    .from('usuarios_empresa')
    .update({ rol })
    .eq('id', membershipId)
    .eq('empresa_id', empresaId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'No se actualizó la membresía o ya no tienes permiso para modificarla.',
    )
  }
}


export async function setCompanyUserActive(
  empresaId: string,
  membershipId: string,
  activo: boolean,
): Promise<void> {
  const { data, error } = await supabase
    .from('usuarios_empresa')
    .update({ activo })
    .eq('id', membershipId)
    .eq('empresa_id', empresaId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'No se actualizó la membresía o ya no tienes permiso para modificarla.',
    )
  }
}


export function getAdminUserErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error && !('code' in error)) {
    return error.message
  }

  const postgrestError = error as Partial<PostgrestError>

  if (
    postgrestError.code === 'P0001' &&
    postgrestError.message?.includes('último administrador')
  ) {
    return (
      'La empresa debe conservar al menos un administrador activo. '
      + 'Asigna primero otro ADMIN antes de realizar este cambio.'
    )
  }

  if (
    postgrestError.code === '42501' ||
    postgrestError.code === 'PGRST301'
  ) {
    return 'Tu sesión no tiene permisos de administrador para esta operación.'
  }

  return (
    postgrestError.message
    || 'No se pudo completar la administración del usuario.'
  )
}
