import {
  lazy,
  Suspense,
} from 'react'

import {
  Navigate,
  Route,
  Routes,
} from 'react-router'

import { LoadingScreen } from './components/LoadingScreen'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PublicOnlyRoute } from './components/PublicOnlyRoute'
import { RoleRoute } from './components/RoleRoute'
import { useAuth } from './hooks/useAuth'
import { AppLayout } from './layouts/AppLayout'
import { AccessDeniedPage } from './pages/AccessDeniedPage'
import { AccountContextErrorPage } from './pages/AccountContextErrorPage'
import { ClientsPage } from './pages/ClientsPage'
import { DashboardPage } from './pages/DashboardPage'
import { InventoryPage } from './pages/InventoryPage'
import ImportsPage from './pages/ImportsPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ProductsPage } from './pages/ProductsPage'
import { ReportsPage } from './pages/ReportsPage'
import { PurchasesPage } from './pages/PurchasesPage'
import { SuppliersPage } from './pages/SuppliersPage'
import { SalesPage } from './pages/SalesPage'


const IntelligencePage = lazy(
  () => import('./pages/IntelligencePage'),
)


function AuthenticatedApplication() {
  const {
    contextError,
    profile,
    membership,
    company,
  } = useAuth()

  if (
    contextError ||
    !profile ||
    !membership ||
    !company
  ) {
    return <AccountContextErrorPage />
  }

  return <AppLayout />
}


export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />


      <Route
        element={
          <ProtectedRoute>
            <AuthenticatedApplication />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={<DashboardPage />}
        />


        <Route
          path="clientes"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
                'VENDEDOR',
                'ANALISTA',
              ]}
            >
              <ClientsPage />
            </RoleRoute>
          }
        />


        <Route
          path="productos"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
                'GERENTE',
                'VENDEDOR',
                'ALMACEN',
                'ANALISTA',
              ]}
            >
              <ProductsPage />
            </RoleRoute>
          }
        />


        <Route
          path="ventas"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
                'GERENTE',
                'VENDEDOR',
              ]}
            >
              <SalesPage />
            </RoleRoute>
          }
        />


        <Route
          path="inventario"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
                'GERENTE',
                'ALMACEN',
              ]}
            >
              <InventoryPage />
            </RoleRoute>
          }
        />


        <Route
          path="proveedores"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
                'GERENTE',
                'ALMACEN',
                'ANALISTA',
              ]}
            >
              <SuppliersPage />
            </RoleRoute>
          }
        />


        <Route
          path="compras"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
                'GERENTE',
                'ALMACEN',
                'ANALISTA',
              ]}
            >
              <PurchasesPage />
            </RoleRoute>
          }
        />


        <Route
          path="cargas"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
                'ANALISTA',
              ]}
            >
              <ImportsPage />
            </RoleRoute>
          }
        />


        <Route
          path="reportes"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
                'GERENTE',
                'ANALISTA',
              ]}
            >
              <ReportsPage />
            </RoleRoute>
          }
        />


        <Route
          path="inteligencia"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
                'GERENTE',
                'ANALISTA',
              ]}
            >
              <Suspense
                fallback={<LoadingScreen />}
              >
                <IntelligencePage />
              </Suspense>
            </RoleRoute>
          }
        />


        <Route
          path="usuarios"
          element={
            <RoleRoute
              allowedRoles={[
                'ADMIN',
              ]}
            >
              <PlaceholderPage
                title="Usuarios y roles"
                description="Administración de miembros y permisos."
                phase="Ampliación de seguridad"
              />
            </RoleRoute>
          }
        />


        <Route
          path="sin-acceso"
          element={<AccessDeniedPage />}
        />

        <Route
          path="inicio"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />

        <Route
          path="dashboard"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Route>


      <Route
        path="*"
        element={<NotFoundPage />}
      />
    </Routes>
  )
}