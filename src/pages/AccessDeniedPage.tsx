import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { roleLabels } from '../types/auth'

export function AccessDeniedPage() {
  const { membership } = useAuth()

  return (
    <section className="panel access-denied">
      <span className="eyebrow">Permiso insuficiente</span>
      <h2>No tienes acceso a este módulo</h2>
      <p>
        Tu rol actual es{' '}
        <strong>
          {membership
            ? roleLabels[membership.rol]
            : 'No identificado'}
        </strong>
        . La navegación y las rutas también respetan los permisos
        empresariales.
      </p>
      <Link to="/" className="button button-primary">
        Volver al dashboard
      </Link>
    </section>
  )
}
