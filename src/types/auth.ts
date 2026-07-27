export type UserRole =
  | 'ADMIN'
  | 'GERENTE'
  | 'VENDEDOR'
  | 'ALMACEN'
  | 'ANALISTA'

export interface UserProfile {
  id: string
  nombres: string
  apellidos: string
  telefono: string | null
  avatar_url: string | null
  activo: boolean
}

export interface CompanyMembership {
  id: string
  empresa_id: string
  perfil_id: string
  rol: UserRole
  activo: boolean
}

export interface Company {
  id: string
  nombre: string
  razon_social: string | null
  ruc: string | null
  moneda: string
  zona_horaria: string
  activo: boolean
}

export const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  GERENTE: 'Gerente',
  VENDEDOR: 'Vendedor',
  ALMACEN: 'Encargado de almacén',
  ANALISTA: 'Analista',
}
