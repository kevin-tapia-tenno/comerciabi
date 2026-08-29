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
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'


const ClientsPage = lazy(
  () =>
    import('./pages/ClientsPage').then(
      ({ ClientsPage }) => ({
        default: ClientsPage,
      }),
    ),
)


const ProductsPage = lazy(
  () =>
    import('./pages/ProductsPage').then(
      ({ ProductsPage }) => ({
        default: ProductsPage,
      }),
    ),
)


const SalesPage = lazy(
  () =>
    import('./pages/SalesPage').then(
      ({ SalesPage }) => ({
        default: SalesPage,
      }),
    ),
)


const InventoryPage = lazy(
  () =>
    import('./pages/InventoryPage').then(
      ({ InventoryPage }) => ({
        default: InventoryPage,
      }),
    ),
)


const SuppliersPage = lazy(
  () =>
    import('./pages/SuppliersPage').then(
      ({ SuppliersPage }) => ({
        default: SuppliersPage,
      }),
    ),
)


const PurchasesPage = lazy(
  () =>
    import('./pages/PurchasesPage').then(
      ({ PurchasesPage }) => ({
        default: PurchasesPage,
      }),
    ),
)


const ImportsPage = lazy(
  () => import('./pages/ImportsPage'),
)


const ReportsPage = lazy(
  () =>
    import('./pages/ReportsPage').then(
      ({ ReportsPage }) => ({
        default: ReportsPage,
      }),
    ),
)


const IntelligencePage = lazy(
  () => import('./pages/IntelligencePage'),
)


const UsersPage = lazy(
  () =>
    import('./pages/UsersPage').then(
      ({ UsersPage }) => ({
        default: UsersPage,
      }),
    ),
)


const AcceptInvitePage = lazy(
  () =>
    import('./pages/AcceptInvitePage').then(
      ({ AcceptInvitePage }) => ({
        default: AcceptInvitePage,
      }),
    ),
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
        path="/aceptar-invitacion"
        element={
          <Suspense fallback={<LoadingScreen />}>
            <AcceptInvitePage />
          </Suspense>
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
              <Suspense fallback={<LoadingScreen />}>
                <ClientsPage />
              </Suspense>
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
              <Suspense fallback={<LoadingScreen />}>
                <ProductsPage />
              </Suspense>
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
              <Suspense fallback={<LoadingScreen />}>
                <SalesPage />
              </Suspense>
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
              <Suspense fallback={<LoadingScreen />}>
                <InventoryPage />
              </Suspense>
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
              <Suspense fallback={<LoadingScreen />}>
                <SuppliersPage />
              </Suspense>
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
              <Suspense fallback={<LoadingScreen />}>
                <PurchasesPage />
              </Suspense>
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
              <Suspense fallback={<LoadingScreen />}>
                <ImportsPage />
              </Suspense>
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
              <Suspense fallback={<LoadingScreen />}>
                <ReportsPage />
              </Suspense>
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
              <Suspense fallback={<LoadingScreen />}>
                <UsersPage />
              </Suspense>
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