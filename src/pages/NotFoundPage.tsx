import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="standalone-message">
      <section className="message-card">
        <span className="eyebrow">Error 404</span>
        <h1>Página no encontrada</h1>
        <p>La dirección ingresada no corresponde a una ruta de ComercioBI.</p>
        <Link to="/" className="button button-primary">
          Ir al inicio
        </Link>
      </section>
    </div>
  )
}
