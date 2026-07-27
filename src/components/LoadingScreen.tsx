interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({
  message = 'Cargando ComercioBI...',
}: LoadingScreenProps) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-spinner" />
      <p>{message}</p>
    </div>
  )
}
