import type { UserRole } from './auth'

export interface AdminCompanyUser {
  membership_id: string
  perfil_id: string
  email: string
  nombres: string
  apellidos: string
  rol: UserRole
  membresia_activa: boolean
  perfil_activo: boolean
  creado_at: string
  actualizado_at: string
}

export interface InviteCompanyUserPayload {
  email: string
  nombres: string
  apellidos: string
  rol: UserRole
}

export type InviteCompanyUserAction =
  | 'INVITED'
  | 'RESENT_INVITE'
  | 'LINKED_EXISTING'

export interface InviteCompanyUserResponse {
  user_id: string
  membership_id: string
  email: string
  rol: UserRole
  action: InviteCompanyUserAction
  message: string
}
