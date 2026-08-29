import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'

import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import { formatDateTime } from '../lib/catalog-utils'
import {
  getAdminUserErrorMessage,
  inviteCompanyUser,
  listCompanyUsers,
  setCompanyUserActive,
  updateCompanyUserRole,
} from '../lib/admin-service'
import {
  roleLabels,
  type UserRole,
} from '../types/auth'
import type {
  AdminCompanyUser,
  InviteCompanyUserPayload,
} from '../types/admin'

import '../styles/users.css'


const PAGE_SIZE = 10

const roleOptions: UserRole[] = [
  'ADMIN',
  'GERENTE',
  'ANALISTA',
  'VENDEDOR',
  'ALMACEN',
]

interface InviteFormState {
  email: string
  nombres: string
  apellidos: string
  rol: UserRole
}

const emptyInviteForm: InviteFormState = {
  email: '',
  nombres: '',
  apellidos: '',
  rol: 'VENDEDOR',
}


function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('es-PE')
}


function validateInviteForm(
  form: InviteFormState,
): string | null {
  const email = form.email.trim()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Ingresa un correo electrónico válido.'
  }

  if (form.nombres.trim().length < 2) {
    return 'Ingresa los nombres del usuario.'
  }

  if (form.apellidos.trim().length < 2) {
    return 'Ingresa los apellidos del usuario.'
  }

  return null
}


export function UsersPage() {
  const {
    company,
    membership,
    profile,
    session,
  } = useAuth()

  const [users, setUsers] = useState<AdminCompanyUser[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'TODOS' | 'ACTIVOS' | 'INACTIVOS'
  >('TODOS')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'TODOS'>('TODOS')
  const [page, setPage] = useState(1)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState<InviteFormState>(emptyInviteForm)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  const [editingUser, setEditingUser] = useState<AdminCompanyUser | null>(null)
  const [editingRole, setEditingRole] = useState<UserRole>('VENDEDOR')
  const [savingRole, setSavingRole] = useState(false)
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null)


  const canManageUsers = membership?.rol === 'ADMIN'


  const loadUsers = useCallback(async () => {
    if (!company || !canManageUsers) return

    setLoading(true)
    setPageError(null)

    try {
      const rows = await listCompanyUsers(company.id)
      setUsers(rows)
    } catch (error) {
      setUsers([])
      setPageError(getAdminUserErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [canManageUsers, company])


  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadUsers()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadUsers])


  const filteredUsers = useMemo(() => {
    const search = normalizeSearch(searchInput)

    return users.filter((user) => {
      if (
        statusFilter === 'ACTIVOS'
        && !user.membresia_activa
      ) {
        return false
      }

      if (
        statusFilter === 'INACTIVOS'
        && user.membresia_activa
      ) {
        return false
      }

      if (
        roleFilter !== 'TODOS'
        && user.rol !== roleFilter
      ) {
        return false
      }

      if (!search) return true

      const haystack = [
        user.nombres,
        user.apellidos,
        user.email,
        roleLabels[user.rol],
      ]
        .join(' ')
        .toLocaleLowerCase('es-PE')

      return haystack.includes(search)
    })
  }, [roleFilter, searchInput, statusFilter, users])


  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / PAGE_SIZE),
  )

  const paginatedUsers = useMemo(() => {
    const safePage = Math.min(page, totalPages)
    const from = (safePage - 1) * PAGE_SIZE
    return filteredUsers.slice(from, from + PAGE_SIZE)
  }, [filteredUsers, page, totalPages])


  const summary = useMemo(() => {
    const active = users.filter((user) => user.membresia_activa).length
    const admins = users.filter(
      (user) => user.membresia_activa && user.rol === 'ADMIN',
    ).length

    return {
      total: users.length,
      active,
      inactive: users.length - active,
      admins,
    }
  }, [users])


  const openInviteModal = () => {
    setInviteForm(emptyInviteForm)
    setInviteError(null)
    setInviteOpen(true)
  }


  const closeInviteModal = () => {
    if (!inviting) {
      setInviteOpen(false)
    }
  }


  const handleInvite = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (!company || !session || !canManageUsers) return

    const validationError = validateInviteForm(inviteForm)
    if (validationError) {
      setInviteError(validationError)
      return
    }

    setInviting(true)
    setInviteError(null)
    setPageError(null)

    const payload: InviteCompanyUserPayload = {
      email: inviteForm.email.trim().toLowerCase(),
      nombres: inviteForm.nombres.trim(),
      apellidos: inviteForm.apellidos.trim(),
      rol: inviteForm.rol,
    }

    try {
      const result = await inviteCompanyUser(
        {
          accessToken: session.access_token,
          empresaId: company.id,
        },
        payload,
      )

      setSuccessMessage(result.message)
      setInviteOpen(false)
      setPage(1)
      await loadUsers()
    } catch (error) {
      setInviteError(getAdminUserErrorMessage(error))
    } finally {
      setInviting(false)
    }
  }


  const openRoleModal = (user: AdminCompanyUser) => {
    setEditingUser(user)
    setEditingRole(user.rol)
    setPageError(null)
  }


  const closeRoleModal = () => {
    if (!savingRole) {
      setEditingUser(null)
    }
  }


  const handleSaveRole = async () => {
    if (!company || !editingUser || !canManageUsers) return

    if (editingUser.perfil_id === profile?.id) {
      setPageError(
        'Por seguridad, tu propia membresía no se modifica desde esta pantalla.',
      )
      setEditingUser(null)
      return
    }

    setSavingRole(true)
    setPageError(null)

    try {
      await updateCompanyUserRole(
        company.id,
        editingUser.membership_id,
        editingRole,
      )

      setSuccessMessage(
        `Rol actualizado a ${roleLabels[editingRole]}.`,
      )
      setEditingUser(null)
      await loadUsers()
    } catch (error) {
      setPageError(getAdminUserErrorMessage(error))
    } finally {
      setSavingRole(false)
    }
  }


  const handleToggleStatus = async (user: AdminCompanyUser) => {
    if (!company || !canManageUsers) return

    if (user.perfil_id === profile?.id) {
      setPageError(
        'Por seguridad, no puedes desactivar tu propia membresía desde esta pantalla.',
      )
      return
    }

    const nextActive = !user.membresia_activa
    const action = nextActive ? 'reactivar' : 'desactivar'
    const fullName = `${user.nombres} ${user.apellidos}`.trim()

    if (!window.confirm(
      `¿Seguro que deseas ${action} la membresía de ${fullName}?`,
    )) {
      return
    }

    setChangingStatusId(user.membership_id)
    setPageError(null)

    try {
      await setCompanyUserActive(
        company.id,
        user.membership_id,
        nextActive,
      )

      setSuccessMessage(
        nextActive
          ? 'Membresía reactivada correctamente.'
          : 'Membresía desactivada correctamente.',
      )
      await loadUsers()
    } catch (error) {
      setPageError(getAdminUserErrorMessage(error))
    } finally {
      setChangingStatusId(null)
    }
  }


  return (
    <div className="page-stack">
      <section className="panel data-page-panel">
        <div className="data-page-header">
          <div>
            <span className="eyebrow">Seguridad empresarial</span>
            <h2>Usuarios y roles</h2>
            <p>
              Invita usuarios, asigna permisos y controla qué membresías
              pueden acceder a {company?.nombre ?? 'la empresa'}.
            </p>
          </div>

          <button
            type="button"
            className="button button-primary"
            onClick={openInviteModal}
            disabled={!canManageUsers}
          >
            Invitar usuario
          </button>
        </div>


        {successMessage ? (
          <div className="alert alert-success" role="status">
            <span>{successMessage}</span>
            <button
              type="button"
              className="alert-dismiss"
              aria-label="Cerrar mensaje"
              onClick={() => setSuccessMessage(null)}
            >
              ×
            </button>
          </div>
        ) : null}


        {pageError ? (
          <div className="alert alert-error" role="alert">
            <strong>No se pudo completar la operación.</strong>
            <span>{pageError}</span>
          </div>
        ) : null}


        <div className="metric-grid users-metric-grid">
          <article className="metric-card">
            <span>Miembros registrados</span>
            <strong>{loading ? '—' : summary.total}</strong>
            <small>Histórico de membresías de la empresa.</small>
          </article>

          <article className="metric-card">
            <span>Accesos activos</span>
            <strong>{loading ? '—' : summary.active}</strong>
            <small>Pueden iniciar sesión con esta empresa.</small>
          </article>

          <article className="metric-card">
            <span>Accesos inactivos</span>
            <strong>{loading ? '—' : summary.inactive}</strong>
            <small>Conservan historial, pero no tienen acceso.</small>
          </article>

          <article className="metric-card">
            <span>Administradores activos</span>
            <strong>{loading ? '—' : summary.admins}</strong>
            <small>Siempre debe existir al menos uno.</small>
          </article>
        </div>


        <div className="data-toolbar users-toolbar">
          <label className="search-control">
            <span>Buscar</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value)
                setPage(1)
              }}
              placeholder="Nombre, apellido, correo o rol"
            />
          </label>

          <label className="filter-control">
            <span>Estado</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(
                  event.target.value as typeof statusFilter,
                )
                setPage(1)
              }}
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVOS">Activos</option>
              <option value="INACTIVOS">Inactivos</option>
            </select>
          </label>

          <label className="filter-control">
            <span>Rol</span>
            <select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as UserRole | 'TODOS')
                setPage(1)
              }}
            >
              <option value="TODOS">Todos los roles</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>
        </div>


        <div className="data-table-heading">
          <div>
            <strong>Directorio de acceso</strong>
            <span>
              {loading
                ? 'Consultando usuarios...'
                : `${filteredUsers.length} ${filteredUsers.length === 1 ? 'usuario encontrado' : 'usuarios encontrados'}`}
            </span>
          </div>

          <span>
            Los cambios de rol se aplican en el siguiente acceso autorizado.
          </span>
        </div>


        <div className="table-scroll">
          <table className="data-table users-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Acceso</th>
                <th>Alta</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-message">
                      Consultando usuarios y permisos...
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading && paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <strong>No hay usuarios para mostrar.</strong>
                      <span>
                        Ajusta los filtros o invita al primer miembro.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading && paginatedUsers.map((user) => {
                const isCurrentUser = user.perfil_id === profile?.id
                const statusBusy = changingStatusId === user.membership_id

                return (
                  <tr key={user.membership_id}>
                    <td>
                      <div className="primary-cell">
                        <strong>
                          {user.nombres} {user.apellidos}
                        </strong>
                        <span>
                          {isCurrentUser
                            ? 'Tu cuenta actual'
                            : user.perfil_activo
                              ? 'Perfil habilitado'
                              : 'Perfil deshabilitado'}
                        </span>
                      </div>
                    </td>

                    <td>{user.email}</td>

                    <td>
                      <span className={`role-badge role-badge-${user.rol.toLowerCase()}`}>
                        {roleLabels[user.rol]}
                      </span>
                    </td>

                    <td>
                      <StatusBadge active={user.membresia_activa} />
                    </td>

                    <td>{formatDateTime(user.creado_at)}</td>

                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => openRoleModal(user)}
                          disabled={isCurrentUser || statusBusy}
                        >
                          Cambiar rol
                        </button>

                        <button
                          type="button"
                          className={
                            `text-action ${user.membresia_activa ? 'text-action-danger' : ''}`
                          }
                          onClick={() => void handleToggleStatus(user)}
                          disabled={isCurrentUser || statusBusy}
                        >
                          {statusBusy
                            ? 'Procesando...'
                            : user.membresia_activa
                              ? 'Desactivar'
                              : 'Reactivar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>


        <Pagination
          page={Math.min(page, totalPages)}
          totalPages={totalPages}
          totalItems={filteredUsers.length}
          onPageChange={setPage}
        />
      </section>


      <Modal
        open={inviteOpen}
        title="Invitar usuario"
        description="La cuenta quedará vinculada únicamente a la empresa actual."
        onClose={closeInviteModal}
        footer={(
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeInviteModal}
              disabled={inviting}
            >
              Cancelar
            </button>

            <button
              type="submit"
              form="invite-user-form"
              className="button button-primary"
              disabled={inviting}
            >
              {inviting ? 'Procesando...' : 'Enviar invitación'}
            </button>
          </>
        )}
      >
        <form
          id="invite-user-form"
          className="form-grid"
          onSubmit={(event) => void handleInvite(event)}
        >
          {inviteError ? (
            <div className="alert alert-error form-span-full" role="alert">
              {inviteError}
            </div>
          ) : null}

          <label className="field form-span-full">
            <span>Correo electrónico</span>
            <input
              type="email"
              value={inviteForm.email}
              onChange={(event) => setInviteForm((current) => ({
                ...current,
                email: event.target.value,
              }))}
              placeholder="persona@empresa.com"
              autoComplete="email"
              disabled={inviting}
            />
          </label>

          <label className="field form-span-2">
            <span>Nombres</span>
            <input
              type="text"
              value={inviteForm.nombres}
              onChange={(event) => setInviteForm((current) => ({
                ...current,
                nombres: event.target.value,
              }))}
              placeholder="Nombres"
              disabled={inviting}
            />
          </label>

          <label className="field">
            <span>Apellidos</span>
            <input
              type="text"
              value={inviteForm.apellidos}
              onChange={(event) => setInviteForm((current) => ({
                ...current,
                apellidos: event.target.value,
              }))}
              placeholder="Apellidos"
              disabled={inviting}
            />
          </label>

          <label className="field form-span-full">
            <span>Rol inicial</span>
            <select
              value={inviteForm.rol}
              onChange={(event) => setInviteForm((current) => ({
                ...current,
                rol: event.target.value as UserRole,
              }))}
              disabled={inviting}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>

          <p className="form-help form-span-full">
            Si el correo todavía no existe, ComercioBI enviará una invitación
            para definir la contraseña. Si la cuenta ya existe, se vinculará a
            esta empresa sin crear un usuario duplicado.
          </p>
        </form>
      </Modal>


      <Modal
        open={Boolean(editingUser)}
        title="Cambiar rol"
        description={
          editingUser
            ? `${editingUser.nombres} ${editingUser.apellidos} · ${editingUser.email}`
            : undefined
        }
        onClose={closeRoleModal}
        footer={(
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeRoleModal}
              disabled={savingRole}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="button button-primary"
              onClick={() => void handleSaveRole()}
              disabled={savingRole || !editingUser || editingRole === editingUser.rol}
            >
              {savingRole ? 'Guardando...' : 'Guardar rol'}
            </button>
          </>
        )}
      >
        <div className="form-grid form-grid-single">
          <label className="field">
            <span>Rol empresarial</span>
            <select
              value={editingRole}
              onChange={(event) => setEditingRole(event.target.value as UserRole)}
              disabled={savingRole}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>

          <p className="form-help">
            La base de datos impedirá que la empresa se quede sin un
            administrador activo.
          </p>
        </div>
      </Modal>
    </div>
  )
}
