import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  size?: 'medium' | 'large'
}

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = 'medium',
}: ModalProps) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className={`modal-card modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Cerrar ventana"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="modal-body">{children}</div>

        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  )
}
