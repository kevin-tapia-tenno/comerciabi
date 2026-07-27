import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'

interface LocationState {
  from?: string
}

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const destination =
    (location.state as LocationState | null)?.from ?? '/'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    if (!email.trim() || !password) {
      setErrorMessage('Ingresa el correo y la contraseña.')
      return
    }

    setSubmitting(true)

    try {
      const result = await signIn(email, password)

      if (result.error) {
        setErrorMessage(result.error)
        return
      }

      navigate(destination, { replace: true })
    } catch (error) {
      console.error('Error inesperado durante el login:', error)

      setErrorMessage(
        'Ocurrió un error inesperado. Inténtalo nuevamente.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-presentation">
        <div className="login-brand">
          <div className="brand-mark brand-mark-large">CB</div>
          <div>
            <strong>ComercioBI</strong>
            <span>Plataforma de inteligencia comercial</span>
          </div>
        </div>

        <div className="login-copy">
          <span className="eyebrow">Gestión basada en datos</span>
          <h1>Ventas, inventario y análisis en un solo lugar.</h1>
          <p>
            Accede a la plataforma empresarial de Distribuidora Nova.
            La información se protege mediante autenticación y políticas
            de seguridad a nivel de fila.
          </p>
        </div>

        <div className="login-features">
          <article>
            <strong>Información centralizada</strong>
            <span>Clientes, productos, ventas e inventario.</span>
          </article>
          <article>
            <strong>Acceso por roles</strong>
            <span>Cada usuario recibe solamente los permisos necesarios.</span>
          </article>
          <article>
            <strong>Indicadores confiables</strong>
            <span>Datos preparados para dashboards y Power BI.</span>
          </article>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card-header">
            <span className="eyebrow">Acceso empresarial</span>
            <h2>Iniciar sesión</h2>
            <p>Utiliza el usuario creado en Supabase Authentication.</p>
          </div>

          {errorMessage ? (
            <div className="alert alert-error" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <label className="field">
            <span>Correo electrónico</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@empresa.com"
              autoComplete="email"
              disabled={submitting}
            />
          </label>

          <label className="field">
            <span>Contraseña</span>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Ingresa tu contraseña"
              autoComplete="current-password"
              disabled={submitting}
            />
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            <span>Mostrar contraseña</span>
          </label>

          <button
            className="button button-primary button-full"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </button>

          <p className="login-help">
            El registro público está deshabilitado. Los usuarios son
            creados por un administrador.
          </p>
        </form>
      </section>
    </div>
  )
}
