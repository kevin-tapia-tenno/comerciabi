import { useState } from 'react'
import {
  NavLink,
  Outlet,
  useLocation,
} from 'react-router'

import { useAuth } from '../hooks/useAuth'
import {
  roleLabels,
  type UserRole,
} from '../types/auth'


interface MenuItem {
  label: string
  path: string
  short: string
  roles: UserRole[]
}


const menuItems: MenuItem[] = [
  {
    label: 'Dashboard',
    path: '/',
    short: 'DB',
    roles: [
      'ADMIN',
      'GERENTE',
      'VENDEDOR',
      'ALMACEN',
      'ANALISTA',
    ],
  },
  {
    label: 'Clientes',
    path: '/clientes',
    short: 'CL',
    roles: [
      'ADMIN',
      'VENDEDOR',
      'ANALISTA',
    ],
  },
  {
    label: 'Productos',
    path: '/productos',
    short: 'PR',
    roles: [
      'ADMIN',
      'GERENTE',
      'VENDEDOR',
      'ALMACEN',
      'ANALISTA',
    ],
  },
  {
    label: 'Ventas',
    path: '/ventas',
    short: 'VT',
    roles: [
      'ADMIN',
      'GERENTE',
      'VENDEDOR',
    ],
  },
  {
    label: 'Inventario',
    path: '/inventario',
    short: 'IN',
    roles: [
      'ADMIN',
      'GERENTE',
      'ALMACEN',
    ],
  },
  {
    label: 'Proveedores',
    path: '/proveedores',
    short: 'PV',
    roles: [
      'ADMIN',
      'GERENTE',
      'ALMACEN',
      'ANALISTA',
    ],
  },
  {
    label: 'Compras',
    path: '/compras',
    short: 'CP',
    roles: [
      'ADMIN',
      'GERENTE',
      'ALMACEN',
      'ANALISTA',
    ],
  },
  {
    label: 'Cargas de archivos',
    path: '/cargas',
    short: 'CA',
    roles: [
      'ADMIN',
      'ANALISTA',
    ],
  },
  {
    label: 'Reportes',
    path: '/reportes',
    short: 'RP',
    roles: [
      'ADMIN',
      'GERENTE',
      'ANALISTA',
    ],
  },
  {
    label: 'Inteligencia IA',
    path: '/inteligencia',
    short: 'IA',
    roles: [
      'ADMIN',
      'GERENTE',
      'ANALISTA',
    ],
  },
  {
    label: 'Usuarios y roles',
    path: '/usuarios',
    short: 'US',
    roles: [
      'ADMIN',
    ],
  },
]


const pageTitles: Record<
  string,
  string
> = {
  '/': 'Dashboard',
  '/dashboard': 'Dashboard',
  '/clientes': 'Clientes',
  '/productos': 'Productos',
  '/ventas': 'Ventas',
  '/inventario': 'Inventario',
  '/proveedores': 'Proveedores',
  '/compras': 'Compras',
  '/cargas': 'Cargas de archivos',
  '/reportes': 'Reportes',
  '/inteligencia': 'Inteligencia IA',
  '/usuarios': 'Usuarios y roles',
  '/sin-acceso': 'Acceso restringido',
}


export function AppLayout() {
  const {
    profile,
    membership,
    company,
    user,
    contextError,
    signOut,
  } = useAuth()

  const location = useLocation()

  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false)


  const visibleItems = membership
    ? menuItems.filter(
        (item) =>
          item.roles.includes(
            membership.rol,
          ),
      )
    : []


  const fullName = profile
    ? `${profile.nombres} ${profile.apellidos}`.trim()
    : user?.email ?? 'Usuario'


  const initials = profile
    ? `${profile.nombres.charAt(0)}${profile.apellidos.charAt(0)}`.toUpperCase()
    : 'US'


  const currentTitle =
    pageTitles[location.pathname]
    ?? 'ComercioBI'


  return (
    <div className="app-shell">
      <aside
        className={
          `sidebar ${
            mobileMenuOpen
              ? 'sidebar-open'
              : ''
          }`
        }
      >
        <div className="brand">
          <div className="brand-mark">
            CB
          </div>

          <div>
            <strong>
              ComercioBI
            </strong>

            <span>
              Inteligencia comercial
            </span>
          </div>
        </div>


        <nav
          className="sidebar-nav"
          aria-label="Navegación principal"
        >
          {visibleItems.map(
            (item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() =>
                  setMobileMenuOpen(false)
                }
                className={
                  ({ isActive }) =>
                    `nav-item ${
                      isActive
                        ? 'nav-item-active'
                        : ''
                    }`
                }
              >
                <span className="nav-short">
                  {item.short}
                </span>

                <span>
                  {item.label}
                </span>
              </NavLink>
            ),
          )}
        </nav>


        <div className="sidebar-account">
          <div className="avatar">
            {initials}
          </div>

          <div className="account-copy">
            <strong>
              {fullName}
            </strong>

            <span>
              {membership
                ? roleLabels[
                    membership.rol
                  ]
                : 'Sin rol activo'}
            </span>
          </div>
        </div>
      </aside>


      {mobileMenuOpen ? (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Cerrar menú"
          onClick={() =>
            setMobileMenuOpen(false)
          }
        />
      ) : null}


      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              type="button"
              onClick={() =>
                setMobileMenuOpen(
                  (value) => !value,
                )
              }
              aria-label="Abrir menú"
            >
              Menú
            </button>

            <div>
              <h1>
                {currentTitle}
              </h1>

              <p>
                {company?.nombre
                  ?? 'Empresa no disponible'}
              </p>
            </div>
          </div>


          <div className="topbar-actions">
            <span className="session-email">
              {user?.email}
            </span>

            <button
              type="button"
              className="button button-secondary"
              onClick={() =>
                void signOut()
              }
            >
              Cerrar sesión
            </button>
          </div>
        </header>


        <main className="content-area">
          {contextError ? (
            <section className="alert alert-error">
              <strong>
                No se pudo cargar todo el
                contexto del usuario.
              </strong>

              <span>
                {contextError}
              </span>
            </section>
          ) : null}

          <Outlet />
        </main>
      </div>
    </div>
  )
}