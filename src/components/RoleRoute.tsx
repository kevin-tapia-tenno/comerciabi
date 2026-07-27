import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import type { UserRole } from '../types/auth'
import { LoadingScreen } from './LoadingScreen'

interface RoleRouteProps {
  allowedRoles: UserRole[]
  children: ReactNode
}

export function RoleRoute({
  allowedRoles,
  children,
}: RoleRouteProps) {
  const { membership, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  if (!membership || !allowedRoles.includes(membership.rol)) {
    return <Navigate to="/sin-acceso" replace />
  }

  return children
}
