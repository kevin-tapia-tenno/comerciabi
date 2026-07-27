import { useAuth } from '../hooks/useAuth'

export function AccountContextErrorPage() {
  const { user, contextError, signOut, refreshUserContext } = useAuth()

  return (
    <div className="standalone-message">
      <section className="message-card">
        <span className="eyebrow">Cuenta sin acceso operativo</span>
        <h1>No se pudo cargar tu contexto empresarial</h1>
        <p>
          Usuario autenticado: <strong>{user?.email}</strong>
        </p>
        <div className="alert alert-error">
          {contextError ?? 'No se encontró un perfil o membresía activa.'}
        </div>
        <div className="button-row">
          <button
            type="button"
            className="button button-primary"
            onClick={() => void refreshUserContext()}
          >
            Reintentar
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void signOut()}
          >
            Cerrar sesión
          </button>
        </div>
      </section>
    </div>
  )
}
