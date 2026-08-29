import {
  useEffect,
  useState,
  type FormEvent,
} from 'react'
import { Link, useNavigate } from 'react-router'

import { supabase } from '../lib/supabase'


type InviteState =
  | 'CHECKING'
  | 'READY'
  | 'INVALID'
  | 'SAVED'


export function AcceptInvitePage() {
  const navigate = useNavigate()

  const [state, setState] = useState<InviteState>('CHECKING')
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)


  useEffect(() => {
    let active = true

    const loadInviteSession = async () => {
      const url = new URL(window.location.href)
      const authError = (
        url.searchParams.get('error_description')
        ?? url.searchParams.get('error')
      )

      if (authError) {
        if (active) {
          setErrorMessage(decodeURIComponent(authError))
          setState('INVALID')
        }
        return
      }

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (!active) return

      if (error || !session) {
        setErrorMessage(
          'La invitación no es válida, ya expiró o fue abierta en un contexto que no pudo recuperar la sesión.',
        )
        setState('INVALID')
        return
      }

      setEmail(session.user.email ?? null)
      setState('READY')
    }

    void loadInviteSession()

    return () => {
      active = false
    }
  }, [])


  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setErrorMessage(null)

    if (password.length < 8) {
      setErrorMessage('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (password !== confirmation) {
      setErrorMessage('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      setState('SAVED')

      window.setTimeout(() => {
        navigate('/', { replace: true })
      }, 900)
    } catch (error) {
      console.error('Error al aceptar invitación:', error)
      setErrorMessage(
        'No se pudo establecer la contraseña. Inténtalo nuevamente desde el enlace de invitación.',
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
          <span className="eyebrow">Invitación empresarial</span>
          <h1>Configura tu acceso a ComercioBI.</h1>
          <p>
            Tu administrador ya definió la empresa y el rol con el que
            participarás. Solo falta establecer una contraseña segura.
          </p>
        </div>

        <div className="login-features">
          <article>
            <strong>Acceso controlado</strong>
            <span>La membresía y el rol ya fueron asignados por un ADMIN.</span>
          </article>
          <article>
            <strong>Permisos por empresa</strong>
            <span>RLS mantiene aislada la información entre organizaciones.</span>
          </article>
          <article>
            <strong>Cuenta personal</strong>
            <span>La contraseña queda gestionada directamente por Supabase Auth.</span>
          </article>
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <div className="login-card-header">
            <span className="eyebrow">Primer acceso</span>
            <h2>Crear contraseña</h2>
            <p>
              {email
                ? `Cuenta: ${email}`
                : 'Validando el enlace de invitación...'}
            </p>
          </div>

          {state === 'CHECKING' ? (
            <div className="alert">
              Validando la invitación con Supabase Auth...
            </div>
          ) : null}

          {errorMessage ? (
            <div className="alert alert-error" role="alert">
              {errorMessage}
            </div>
          ) : null}

          {state === 'INVALID' ? (
            <div className="invite-invalid-actions">
              <p className="login-help">
                Solicita a un administrador que reenvíe la invitación desde
                Usuarios y roles.
              </p>
              <Link
                className="button button-secondary button-full"
                to="/login"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          ) : null}

          {state === 'READY' ? (
            <form onSubmit={handleSubmit}>
              <label className="field">
                <span>Nueva contraseña</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  disabled={submitting}
                />
              </label>

              <label className="field">
                <span>Confirmar contraseña</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Repite la contraseña"
                  disabled={submitting}
                />
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(event) => setShowPassword(event.target.checked)}
                  disabled={submitting}
                />
                <span>Mostrar contraseña</span>
              </label>

              <button
                className="button button-primary button-full"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Guardando...' : 'Activar mi acceso'}
              </button>

              <p className="login-help">
                Al completar este paso podrás ingresar únicamente a los
                módulos permitidos por tu rol empresarial.
              </p>
            </form>
          ) : null}

          {state === 'SAVED' ? (
            <div className="alert alert-success" role="status">
              <span>
                Contraseña creada correctamente. Ingresando a ComercioBI...
              </span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
