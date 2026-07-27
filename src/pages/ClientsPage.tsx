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
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  cleanOptionalText,
  formatDateTime,
  getCatalogErrorMessage,
  sanitizeSearchTerm,
} from '../lib/catalog-utils'
import { supabase } from '../lib/supabase'
import {
  clientSegmentLabels,
  clientTypeLabels,
  documentTypeLabels,
  type Client,
  type ClientSegment,
  type ClientType,
  type DocumentType,
} from '../types/catalog'

const PAGE_SIZE = 10

interface ClientFormState {
  tipo_cliente: ClientType
  tipo_documento: DocumentType | ''
  numero_documento: string
  nombre_completo: string
  email: string
  telefono: string
  segmento: ClientSegment | ''
  direccion: string
}

interface ClientFormErrors {
  nombre_completo?: string
  documento?: string
  email?: string
}

const emptyClientForm: ClientFormState = {
  tipo_cliente: 'PERSONA',
  tipo_documento: '',
  numero_documento: '',
  nombre_completo: '',
  email: '',
  telefono: '',
  segmento: '',
  direccion: '',
}

function clientToForm(client: Client): ClientFormState {
  return {
    tipo_cliente: client.tipo_cliente,
    tipo_documento: client.tipo_documento ?? '',
    numero_documento: client.numero_documento ?? '',
    nombre_completo: client.nombre_completo,
    email: client.email ?? '',
    telefono: client.telefono ?? '',
    segmento: client.segmento ?? '',
    direccion: client.direccion ?? '',
  }
}

function validateClientForm(form: ClientFormState): ClientFormErrors {
  const errors: ClientFormErrors = {}

  if (form.nombre_completo.trim().length < 2) {
    errors.nombre_completo = 'Ingresa un nombre o razón social válido.'
  }

  const hasDocumentType = Boolean(form.tipo_documento)
  const hasDocumentNumber = Boolean(form.numero_documento.trim())

  if (hasDocumentType !== hasDocumentNumber) {
    errors.documento =
      'El tipo y el número de documento deben completarse juntos.'
  }

  if (form.numero_documento.trim().length > 30) {
    errors.documento = 'El documento no puede superar 30 caracteres.'
  }

  const email = form.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Ingresa un correo electrónico válido.'
  }

  return errors
}

export function ClientsPage() {
  const { company, membership } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [typeFilter, setTypeFilter] = useState<ClientType | ''>('')
  const [segmentFilter, setSegmentFilter] =
    useState<ClientSegment | ''>('')
  const [statusFilter, setStatusFilter] = useState<
    'TODOS' | 'ACTIVOS' | 'INACTIVOS'
  >('TODOS')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [form, setForm] = useState<ClientFormState>(emptyClientForm)
  const [formErrors, setFormErrors] = useState<ClientFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null)

  const debouncedSearch = useDebouncedValue(searchInput, 350)

  const canManageClients = Boolean(
    membership &&
      ['ADMIN', 'VENDEDOR', 'ANALISTA'].includes(membership.rol),
  )

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  const loadClients = useCallback(async () => {
    if (!company) return

    setLoading(true)
    setPageError(null)

    let query = supabase
      .from('clientes')
      .select(
        'id, empresa_id, tipo_cliente, tipo_documento, numero_documento, nombre_completo, email, telefono, segmento, direccion, activo, creado_at, actualizado_at',
        { count: 'exact' },
      )
      .eq('empresa_id', company.id)

    const search = sanitizeSearchTerm(debouncedSearch)
    if (search) {
      query = query.or(
        [
          `nombre_completo.ilike.%${search}%`,
          `numero_documento.ilike.%${search}%`,
          `email.ilike.%${search}%`,
          `telefono.ilike.%${search}%`,
        ].join(','),
      )
    }

    if (typeFilter) {
      query = query.eq('tipo_cliente', typeFilter)
    }

    if (segmentFilter) {
      query = query.eq('segmento', segmentFilter)
    }

    if (statusFilter === 'ACTIVOS') {
      query = query.eq('activo', true)
    }

    if (statusFilter === 'INACTIVOS') {
      query = query.eq('activo', false)
    }

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error, count } = await query
      .order('nombre_completo', { ascending: true })
      .range(from, to)

    if (error) {
      setPageError(error.message)
      setClients([])
      setTotalItems(0)
      setLoading(false)
      return
    }

    const nextTotalItems = count ?? 0
    const nextTotalPages = Math.max(
      1,
      Math.ceil(nextTotalItems / PAGE_SIZE),
    )

    if (page > nextTotalPages) {
      setPage(nextTotalPages)
      setLoading(false)
      return
    }

    setClients((data ?? []) as Client[])
    setTotalItems(nextTotalItems)
    setLoading(false)
  }, [company, debouncedSearch, page, segmentFilter, statusFilter, typeFilter])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadClients()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadClients])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    setPage(1)
  }

  const handleTypeFilterChange = (value: ClientType | '') => {
    setTypeFilter(value)
    setPage(1)
  }

  const handleSegmentFilterChange = (value: ClientSegment | '') => {
    setSegmentFilter(value)
    setPage(1)
  }

  const handleStatusFilterChange = (
    value: 'TODOS' | 'ACTIVOS' | 'INACTIVOS',
  ) => {
    setStatusFilter(value)
    setPage(1)
  }

  const openCreateModal = () => {
    setEditingClient(null)
    setForm(emptyClientForm)
    setFormErrors({})
    setFormError(null)
    setModalOpen(true)
  }

  const openEditModal = (client: Client) => {
    setEditingClient(client)
    setForm(clientToForm(client))
    setFormErrors({})
    setFormError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (saving) return
    setModalOpen(false)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!company || !canManageClients) return

    const validationErrors = validateClientForm(form)
    setFormErrors(validationErrors)
    setFormError(null)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setSaving(true)

    const payload = {
      tipo_cliente: form.tipo_cliente,
      tipo_documento: form.tipo_documento || null,
      numero_documento: cleanOptionalText(form.numero_documento),
      nombre_completo: form.nombre_completo.trim(),
      email: cleanOptionalText(form.email)?.toLowerCase() ?? null,
      telefono: cleanOptionalText(form.telefono),
      segmento: form.segmento || null,
      direccion: cleanOptionalText(form.direccion),
    }

    if (editingClient) {
      const { data, error } = await supabase
        .from('clientes')
        .update(payload)
        .eq('id', editingClient.id)
        .eq('empresa_id', company.id)
        .select('id')
        .maybeSingle()

      if (error) {
        setFormError(getCatalogErrorMessage(error, 'cliente'))
        setSaving(false)
        return
      }

      if (!data) {
        setFormError('No se pudo actualizar el cliente o no tienes permiso.')
        setSaving(false)
        return
      }

      setSuccessMessage('Cliente actualizado correctamente.')
    } else {
      const { error } = await supabase
        .from('clientes')
        .insert({
          empresa_id: company.id,
          activo: true,
          ...payload,
        })

      if (error) {
        setFormError(getCatalogErrorMessage(error, 'cliente'))
        setSaving(false)
        return
      }

      setSuccessMessage('Cliente registrado correctamente.')
    }

    setSaving(false)
    setModalOpen(false)
    await loadClients()
  }

  const handleToggleStatus = async (client: Client) => {
    if (!company || !canManageClients) return

    const nextActive = !client.activo
    const action = nextActive ? 'reactivar' : 'desactivar'

    const confirmed = window.confirm(
      `¿Seguro que deseas ${action} a ${client.nombre_completo}?`,
    )

    if (!confirmed) return

    setChangingStatusId(client.id)
    setPageError(null)

    const { data, error } = await supabase
      .from('clientes')
      .update({ activo: nextActive })
      .eq('id', client.id)
      .eq('empresa_id', company.id)
      .select('id')
      .maybeSingle()

    if (error) {
      setPageError(getCatalogErrorMessage(error, 'cliente'))
      setChangingStatusId(null)
      return
    }

    if (!data) {
      setPageError('No se actualizó el estado del cliente.')
      setChangingStatusId(null)
      return
    }

    setSuccessMessage(
      nextActive
        ? 'Cliente reactivado correctamente.'
        : 'Cliente desactivado correctamente.',
    )
    setChangingStatusId(null)
    await loadClients()
  }

  const statusSummary = useMemo(() => {
    if (loading) return 'Consultando clientes...'
    return `${totalItems} ${totalItems === 1 ? 'cliente encontrado' : 'clientes encontrados'}`
  }, [loading, totalItems])

  return (
    <div className="page-stack">
      <section className="panel data-page-panel">
        <div className="data-page-header">
          <div>
            <span className="eyebrow">Gestión comercial</span>
            <h2>Clientes</h2>
            <p>
              Registra, consulta, actualiza y desactiva clientes sin eliminar
              su historial.
            </p>
          </div>

          {canManageClients ? (
            <button
              type="button"
              className="button button-primary"
              onClick={openCreateModal}
            >
              Nuevo cliente
            </button>
          ) : null}
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

        <div className="data-toolbar">
          <label className="search-control">
            <span>Buscar</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Nombre, documento, correo o teléfono"
            />
          </label>

          <label className="filter-control">
            <span>Tipo</span>
            <select
              value={typeFilter}
              onChange={(event) =>
                handleTypeFilterChange(event.target.value as ClientType | '')
              }
            >
              <option value="">Todos</option>
              {Object.entries(clientTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span>Segmento</span>
            <select
              value={segmentFilter}
              onChange={(event) =>
                handleSegmentFilterChange(
                  event.target.value as ClientSegment | '',
                )
              }
            >
              <option value="">Todos</option>
              {Object.entries(clientSegmentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span>Estado</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                handleStatusFilterChange(
                  event.target.value as 'TODOS' | 'ACTIVOS' | 'INACTIVOS',
                )
              }
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVOS">Activos</option>
              <option value="INACTIVOS">Inactivos</option>
            </select>
          </label>
        </div>

        <div className="data-table-heading">
          <strong>Directorio de clientes</strong>
          <span>{statusSummary}</span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Documento</th>
                <th>Contacto</th>
                <th>Segmento</th>
                <th>Estado</th>
                <th>Actualización</th>
                {canManageClients ? <th>Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManageClients ? 7 : 6}>
                    <div className="table-message">Cargando clientes...</div>
                  </td>
                </tr>
              ) : null}

              {!loading && clients.length === 0 ? (
                <tr>
                  <td colSpan={canManageClients ? 7 : 6}>
                    <div className="empty-state">
                      <strong>No se encontraron clientes</strong>
                      <span>
                        Ajusta los filtros o registra el primer cliente.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading
                ? clients.map((client) => (
                    <tr key={client.id}>
                      <td>
                        <div className="primary-cell">
                          <strong>{client.nombre_completo}</strong>
                          <span>{clientTypeLabels[client.tipo_cliente]}</span>
                        </div>
                      </td>
                      <td>
                        {client.tipo_documento && client.numero_documento
                          ? `${documentTypeLabels[client.tipo_documento]} ${client.numero_documento}`
                          : 'Sin documento'}
                      </td>
                      <td>
                        <div className="secondary-lines">
                          <span>{client.email ?? 'Sin correo'}</span>
                          <span>{client.telefono ?? 'Sin teléfono'}</span>
                        </div>
                      </td>
                      <td>
                        {client.segmento
                          ? clientSegmentLabels[client.segmento]
                          : 'Sin segmento'}
                      </td>
                      <td>
                        <StatusBadge active={client.activo} />
                      </td>
                      <td>{formatDateTime(client.actualizado_at)}</td>
                      {canManageClients ? (
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="text-action"
                              onClick={() => openEditModal(client)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className={
                                client.activo
                                  ? 'text-action text-action-danger'
                                  : 'text-action'
                              }
                              disabled={changingStatusId === client.id}
                              onClick={() => void handleToggleStatus(client)}
                            >
                              {changingStatusId === client.id
                                ? 'Procesando...'
                                : client.activo
                                  ? 'Desactivar'
                                  : 'Reactivar'}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </section>

      <Modal
        open={modalOpen}
        title={editingClient ? 'Editar cliente' : 'Nuevo cliente'}
        description="Los campos de documento son opcionales, pero deben completarse juntos."
        size="large"
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              className="button button-secondary"
              disabled={saving}
              onClick={closeModal}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="client-form"
              className="button button-primary"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar cliente'}
            </button>
          </>
        }
      >
        <form id="client-form" onSubmit={handleSubmit}>
          {formError ? (
            <div className="alert alert-error" role="alert">
              {formError}
            </div>
          ) : null}

          <div className="form-grid">
            <label className="field">
              <span>Tipo de cliente *</span>
              <select
                value={form.tipo_cliente}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tipo_cliente: event.target.value as ClientType,
                  }))
                }
                disabled={saving}
              >
                {Object.entries(clientTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field form-span-2">
              <span>Nombre completo o razón social *</span>
              <input
                type="text"
                value={form.nombre_completo}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    nombre_completo: event.target.value,
                  }))
                }
                maxLength={200}
                disabled={saving}
              />
              {formErrors.nombre_completo ? (
                <small className="field-error">
                  {formErrors.nombre_completo}
                </small>
              ) : null}
            </label>

            <label className="field">
              <span>Tipo de documento</span>
              <select
                value={form.tipo_documento}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tipo_documento: event.target.value as DocumentType | '',
                  }))
                }
                disabled={saving}
              >
                <option value="">Sin documento</option>
                {Object.entries(documentTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Número de documento</span>
              <input
                type="text"
                value={form.numero_documento}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    numero_documento: event.target.value,
                  }))
                }
                maxLength={30}
                disabled={saving}
              />
              {formErrors.documento ? (
                <small className="field-error">{formErrors.documento}</small>
              ) : null}
            </label>

            <label className="field">
              <span>Segmento</span>
              <select
                value={form.segmento}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    segmento: event.target.value as ClientSegment | '',
                  }))
                }
                disabled={saving}
              >
                <option value="">Sin segmento</option>
                {Object.entries(clientSegmentLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Correo electrónico</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                maxLength={254}
                disabled={saving}
              />
              {formErrors.email ? (
                <small className="field-error">{formErrors.email}</small>
              ) : null}
            </label>

            <label className="field">
              <span>Teléfono</span>
              <input
                type="tel"
                value={form.telefono}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    telefono: event.target.value,
                  }))
                }
                maxLength={30}
                disabled={saving}
              />
            </label>

            <label className="field form-span-full">
              <span>Dirección</span>
              <textarea
                rows={3}
                value={form.direccion}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    direccion: event.target.value,
                  }))
                }
                disabled={saving}
              />
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}
