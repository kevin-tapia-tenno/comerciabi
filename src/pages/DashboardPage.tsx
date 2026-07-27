import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { roleLabels, type UserRole } from '../types/auth'

interface DashboardCounts {
  productos: number
  clientes: number
  categorias: number
  almacenes: number
}

interface QuickLink {
  path: string
  title: string
  description: string
  roles: UserRole[]
}

const initialCounts: DashboardCounts = {
  productos: 0,
  clientes: 0,
  categorias: 0,
  almacenes: 0,
}

const quickLinks: QuickLink[] = [
  {
    path: '/clientes',
    title: 'Clientes',
    description: 'Registro y administración del directorio comercial.',
    roles: ['ADMIN', 'VENDEDOR', 'ANALISTA'],
  },
  {
    path: '/productos',
    title: 'Productos',
    description: 'Consulta del catálogo y categorías empresariales.',
    roles: ['ADMIN', 'GERENTE', 'VENDEDOR', 'ALMACEN', 'ANALISTA'],
  },
  {
    path: '/ventas',
    title: 'Ventas',
    description: 'Registro transaccional de la Fase 7.',
    roles: ['ADMIN', 'GERENTE', 'VENDEDOR'],
  },
  {
    path: '/inventario',
    title: 'Inventario',
    description: 'Control de stock de la Fase 8.',
    roles: ['ADMIN', 'GERENTE', 'ALMACEN'],
  },
]

export function DashboardPage() {
  const { user, profile, membership, company } = useAuth()
  const [counts, setCounts] = useState<DashboardCounts>(initialCounts)
  const [loadingCounts, setLoadingCounts] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadCounts = async () => {
      setLoadingCounts(true)
      setDataError(null)

      const [
        productsResult,
        clientsResult,
        categoriesResult,
        warehousesResult,
      ] = await Promise.all([
        supabase
          .from('productos')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('clientes')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('categorias')
          .select('*', { count: 'exact', head: true }),
        supabase
          .from('almacenes')
          .select('*', { count: 'exact', head: true }),
      ])

      if (!active) return

      const firstError = [
        productsResult.error,
        clientsResult.error,
        categoriesResult.error,
        warehousesResult.error,
      ].find(Boolean)

      if (firstError) {
        setDataError(firstError.message)
        setLoadingCounts(false)
        return
      }

      setCounts({
        productos: productsResult.count ?? 0,
        clientes: clientsResult.count ?? 0,
        categorias: categoriesResult.count ?? 0,
        almacenes: warehousesResult.count ?? 0,
      })
      setLoadingCounts(false)
    }

    void loadCounts()

    return () => {
      active = false
    }
  }, [])

  const displayName = profile
    ? `${profile.nombres} ${profile.apellidos}`.trim()
    : user?.email

  const visibleQuickLinks = useMemo(() => {
    if (!membership) return []
    return quickLinks.filter((link) => link.roles.includes(membership.rol))
  }, [membership])

  return (
    <div className="page-stack">
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">Sesión autenticada</span>
          <h2>Bienvenido, {displayName}</h2>
          <p>
            La aplicación está conectada con Supabase y consulta información
            protegida mediante RLS.
          </p>
        </div>
        <span className="status-pill">Conexión activa</span>
      </section>

      {dataError ? (
        <section className="alert alert-error">
          <strong>No se pudo consultar la Data API.</strong>
          <span>{dataError}</span>
        </section>
      ) : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span>Productos</span>
          <strong>{loadingCounts ? '...' : counts.productos}</strong>
          <small>Catálogo registrado</small>
        </article>
        <article className="metric-card">
          <span>Clientes</span>
          <strong>{loadingCounts ? '...' : counts.clientes}</strong>
          <small>Clientes visibles por RLS</small>
        </article>
        <article className="metric-card">
          <span>Categorías</span>
          <strong>{loadingCounts ? '...' : counts.categorias}</strong>
          <small>Clasificación comercial</small>
        </article>
        <article className="metric-card">
          <span>Almacenes</span>
          <strong>{loadingCounts ? '...' : counts.almacenes}</strong>
          <small>Ubicaciones operativas</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Contexto empresarial</span>
              <h3>Información de la sesión</h3>
            </div>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Usuario</dt>
              <dd>{user?.email ?? 'No disponible'}</dd>
            </div>
            <div>
              <dt>Empresa</dt>
              <dd>{company?.nombre ?? 'No disponible'}</dd>
            </div>
            <div>
              <dt>Rol</dt>
              <dd>
                {membership ? roleLabels[membership.rol] : 'No disponible'}
              </dd>
            </div>
            <div>
              <dt>Moneda</dt>
              <dd>{company?.moneda ?? 'No disponible'}</dd>
            </div>
            <div>
              <dt>Zona horaria</dt>
              <dd>{company?.zona_horaria ?? 'No disponible'}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Módulos disponibles</span>
              <h3>Accesos rápidos</h3>
            </div>
          </div>

          <div className="quick-link-grid">
            {visibleQuickLinks.map((link) => (
              <Link key={link.path} to={link.path} className="quick-link">
                <strong>{link.title}</strong>
                <span>{link.description}</span>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
