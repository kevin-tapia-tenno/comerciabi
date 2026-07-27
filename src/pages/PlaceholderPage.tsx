interface PlaceholderPageProps {
  title: string
  description: string
  phase: string
}

export function PlaceholderPage({
  title,
  description,
  phase,
}: PlaceholderPageProps) {
  return (
    <section className="panel placeholder-panel">
      <span className="eyebrow">{phase}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="placeholder-box">
        <strong>Módulo protegido y navegación funcionando</strong>
        <span>
          La funcionalidad operativa se implementará en su fase
          correspondiente.
        </span>
      </div>
    </section>
  )
}
