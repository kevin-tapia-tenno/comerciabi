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
  sanitizeSearchTerm,
} from '../lib/catalog-utils'
import { getPurchaseErrorMessage } from '../lib/purchases-utils'
import { supabase } from '../lib/supabase'
import {
  documentTypeLabels,
  type DocumentType,
} from '../types/catalog'
import type { Supplier } from '../types/purchases'

const PAGE_SIZE = 10

interface SupplierFormState {
  tipo_documento: DocumentType | ''
  numero_documento: string
  razon_social: string
  nombre_comercial: string
  email: string
  telefono: string
  contacto_nombre: string
  direccion: string
}

interface SupplierFormErrors {
  razon_social?: string
  documento?: string
  email?: string
}

const emptySupplierForm: SupplierFormState = {
  tipo_documento: 'RUC',
  numero_documento: '',
  razon_social: '',
  nombre_comercial: '',
  email: '',
  telefono: '',
  contacto_nombre: '',
  direccion: '',
}

function supplierToForm(supplier: Supplier): SupplierFormState {
  return {
    tipo_documento: supplier.tipo_documento ?? '',
    numero_documento: supplier.numero_documento ?? '',
    razon_social: supplier.razon_social,
    nombre_comercial: supplier.nombre_comercial ?? '',
    email: supplier.email ?? '',
    telefono: supplier.telefono ?? '',
    contacto_nombre: supplier.contacto_nombre ?? '',
    direccion: supplier.direccion ?? '',
  }
}

function validateSupplierForm(
  form: SupplierFormState,
): SupplierFormErrors {
  const errors: SupplierFormErrors = {}

  if (form.razon_social.trim().length < 2) {
    errors.razon_social = 'Ingresa una razón social válida.'
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

  if (
    form.tipo_documento === 'RUC'
    && form.numero_documento.trim()
    && !/^\d{11}$/.test(form.numero_documento.trim())
  ) {
    errors.documento = 'El RUC debe contener exactamente 11 dígitos.'
  }

  const email = form.email.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Ingresa un correo electrónico válido.'
  }

  return errors
}

export function SuppliersPage() {
  const { company, membership } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'TODOS' | 'ACTIVOS' | 'INACTIVOS'
  >('TODOS')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [form, setForm] = useState<SupplierFormState>(emptySupplierForm)
  const [formErrors, setFormErrors] = useState<SupplierFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null)

  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  const canManageSuppliers = Boolean(
    membership && ['ADMIN', 'ALMACEN'].includes(membership.rol),
  )

  const loadSuppliers = useCallback(async () => {
    if (!company) return

    setLoading(true)
    setPageError(null)

    let query = supabase
      .from('proveedores')
      .select(
        'id, empresa_id, tipo_documento, numero_documento, razon_social, nombre_comercial, email, telefono, contacto_nombre, direccion, activo, creado_at, actualizado_at',
        { count: 'exact' },
      )
      .eq('empresa_id', company.id)

    const search = sanitizeSearchTerm(debouncedSearch)
    if (search) {
      query = query.or(
        [
          `razon_social.ilike.%${search}%`,
          `nombre_comercial.ilike.%${search}%`,
          `numero_documento.ilike.%${search}%`,
          `email.ilike.%${search}%`,
          `telefono.ilike.%${search}%`,
          `contacto_nombre.ilike.%${search}%`,
        ].join(','),
      )
    }

    if (statusFilter === 'ACTIVOS') query = query.eq('activo', true)
    if (statusFilter === 'INACTIVOS') query = query.eq('activo', false)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error, count } = await query
      .order('razon_social', { ascending: true })
      .range(from, to)

    if (error) {
      setPageError(error.message)
      setSuppliers([])
      setTotalItems(0)
      setLoading(false)
      return
    }

    const nextTotalItems = count ?? 0
    const nextTotalPages = Math.max(1, Math.ceil(nextTotalItems / PAGE_SIZE))

    if (page > nextTotalPages) {
      setPage(nextTotalPages)
      setLoading(false)
      return
    }

    setSuppliers((data ?? []) as Supplier[])
    setTotalItems(nextTotalItems)
    setLoading(false)
  }, [company, debouncedSearch, page, statusFilter])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSuppliers()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadSuppliers])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    setPage(1)
  }

  const handleStatusFilterChange = (
    value: 'TODOS' | 'ACTIVOS' | 'INACTIVOS',
  ) => {
    setStatusFilter(value)
    setPage(1)
  }

  const openCreateModal = () => {
    setEditingSupplier(null)
    setForm(emptySupplierForm)
    setFormErrors({})
    setFormError(null)
    setModalOpen(true)
  }

  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setForm(supplierToForm(supplier))
    setFormErrors({})
    setFormError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (!saving) setModalOpen(false)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!company || !canManageSuppliers) return

    const validationErrors = validateSupplierForm(form)
    setFormErrors(validationErrors)
    setFormError(null)
    if (Object.keys(validationErrors).length > 0) return

    setSaving(true)

    const payload = {
      tipo_documento: form.tipo_documento || null,
      numero_documento: cleanOptionalText(form.numero_documento),
      razon_social: form.razon_social.trim(),
      nombre_comercial: cleanOptionalText(form.nombre_comercial),
      email: cleanOptionalText(form.email)?.toLowerCase() ?? null,
      telefono: cleanOptionalText(form.telefono),
      contacto_nombre: cleanOptionalText(form.contacto_nombre),
      direccion: cleanOptionalText(form.direccion),
    }

    if (editingSupplier) {
      const { data, error } = await supabase
        .from('proveedores')
        .update(payload)
        .eq('id', editingSupplier.id)
        .eq('empresa_id', company.id)
        .select('id')
        .maybeSingle()

      if (error) {
        setFormError(getPurchaseErrorMessage(error))
        setSaving(false)
        return
      }

      if (!data) {
        setFormError('No se pudo actualizar el proveedor o no tienes permiso.')
        setSaving(false)
        return
      }

      setSuccessMessage('Proveedor actualizado correctamente.')
    } else {
      const { error } = await supabase.from('proveedores').insert({
        empresa_id: company.id,
        activo: true,
        ...payload,
      })

      if (error) {
        setFormError(getPurchaseErrorMessage(error))
        setSaving(false)
        return
      }

      setSuccessMessage('Proveedor registrado correctamente.')
    }

    setSaving(false)
    setModalOpen(false)
    await loadSuppliers()
  }

  const handleToggleStatus = async (supplier: Supplier) => {
    if (!company || !canManageSuppliers) return

    const nextActive = !supplier.activo
    const action = nextActive ? 'reactivar' : 'desactivar'
    if (!window.confirm(
      `¿Seguro que deseas ${action} a ${supplier.razon_social}?`,
    )) return

    setChangingStatusId(supplier.id)
    setPageError(null)

    const { data, error } = await supabase
      .from('proveedores')
      .update({ activo: nextActive })
      .eq('id', supplier.id)
      .eq('empresa_id', company.id)
      .select('id')
      .maybeSingle()

    if (error) {
      setPageError(getPurchaseErrorMessage(error))
      setChangingStatusId(null)
      return
    }

    if (!data) {
      setPageError('No se actualizó el estado del proveedor.')
      setChangingStatusId(null)
      return
    }

    setSuccessMessage(
      nextActive
        ? 'Proveedor reactivado correctamente.'
        : 'Proveedor desactivado correctamente.',
    )
    setChangingStatusId(null)
    await loadSuppliers()
  }

  const statusSummary = useMemo(() => {
    if (loading) return 'Consultando proveedores...'
    return `${totalItems} ${totalItems === 1 ? 'proveedor encontrado' : 'proveedores encontrados'}`
  }, [loading, totalItems])

  return (
    <div className="page-stack">
      <section className="panel data-page-panel">
        <div className="data-page-header">
          <div>
            <span className="eyebrow">Abastecimiento</span>
            <h2>Proveedores</h2>
            <p>
              Administra los proveedores utilizados por las compras sin borrar
              su historial empresarial.
            </p>
          </div>

          {canManageSuppliers ? (
            <button
              type="button"
              className="button button-primary"
              onClick={openCreateModal}
            >
              Nuevo proveedor
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

        <div className="data-toolbar supplier-toolbar">
          <label className="search-control">
            <span>Buscar</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Razón social, RUC, contacto o correo"
            />
          </label>

          <label className="filter-control">
            <span>Estado</span>
            <select
              value={statusFilter}
              onChange={(event) => handleStatusFilterChange(
                event.target.value as typeof statusFilter,
              )}
            >
              <option value="TODOS">Todos</option>
              <option value="ACTIVOS">Activos</option>
              <option value="INACTIVOS">Inactivos</option>
            </select>
          </label>
        </div>

        <div className="data-table-heading">
          <strong>Directorio de proveedores</strong>
          <span>{statusSummary}</span>
        </div>

        <div className="table-scroll">
          <table className="data-table suppliers-table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Documento</th>
                <th>Contacto</th>
                <th>Estado</th>
                <th>Actualización</th>
                {canManageSuppliers ? <th>Acciones</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canManageSuppliers ? 6 : 5}>Cargando proveedores...</td></tr>
              ) : suppliers.length === 0 ? (
                <tr><td colSpan={canManageSuppliers ? 6 : 5}>No se encontraron proveedores.</td></tr>
              ) : suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>
                    <strong>{supplier.razon_social}</strong>
                    <small>{supplier.nombre_comercial ?? 'Sin nombre comercial'}</small>
                  </td>
                  <td>
                    {supplier.tipo_documento && supplier.numero_documento
                      ? `${documentTypeLabels[supplier.tipo_documento]} ${supplier.numero_documento}`
                      : 'Sin documento'}
                  </td>
                  <td>
                    <span>{supplier.contacto_nombre ?? 'Sin contacto'}</span>
                    <small>{supplier.email ?? supplier.telefono ?? 'Sin datos de contacto'}</small>
                  </td>
                  <td><StatusBadge active={supplier.activo} /></td>
                  <td>{formatDateTime(supplier.actualizado_at)}</td>
                  {canManageSuppliers ? (
                    <td>
                      <div className="action-row">
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => openEditModal(supplier)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={supplier.activo
                            ? 'text-action text-action-danger'
                            : 'text-action'}
                          disabled={changingStatusId === supplier.id}
                          onClick={() => void handleToggleStatus(supplier)}
                        >
                          {supplier.activo ? 'Desactivar' : 'Reactivar'}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
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
        title={editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}
        description="El documento es opcional, pero el tipo y número deben completarse juntos."
        onClose={closeModal}
        footer={(
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeModal}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="supplier-form"
              className="button button-primary"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar proveedor'}
            </button>
          </>
        )}
      >
        <form id="supplier-form" className="form-grid" onSubmit={handleSubmit}>
          {formError ? <div className="alert alert-error form-span-full">{formError}</div> : null}

          <label className="field">
            Tipo de documento
            <select
              value={form.tipo_documento}
              onChange={(event) => setForm((current) => ({
                ...current,
                tipo_documento: event.target.value as DocumentType | '',
              }))}
            >
              <option value="">Sin documento</option>
              {Object.entries(documentTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            Número de documento
            <input
              value={form.numero_documento}
              onChange={(event) => setForm((current) => ({
                ...current,
                numero_documento: event.target.value,
              }))}
              maxLength={30}
            />
            {formErrors.documento ? <span className="field-error">{formErrors.documento}</span> : null}
          </label>

          <label className="field form-span-full">
            Razón social *
            <input
              value={form.razon_social}
              onChange={(event) => setForm((current) => ({
                ...current,
                razon_social: event.target.value,
              }))}
              maxLength={200}
            />
            {formErrors.razon_social ? <span className="field-error">{formErrors.razon_social}</span> : null}
          </label>

          <label className="field">
            Nombre comercial
            <input
              value={form.nombre_comercial}
              onChange={(event) => setForm((current) => ({
                ...current,
                nombre_comercial: event.target.value,
              }))}
              maxLength={200}
            />
          </label>

          <label className="field">
            Persona de contacto
            <input
              value={form.contacto_nombre}
              onChange={(event) => setForm((current) => ({
                ...current,
                contacto_nombre: event.target.value,
              }))}
              maxLength={150}
            />
          </label>

          <label className="field">
            Correo electrónico
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({
                ...current,
                email: event.target.value,
              }))}
            />
            {formErrors.email ? <span className="field-error">{formErrors.email}</span> : null}
          </label>

          <label className="field">
            Teléfono
            <input
              value={form.telefono}
              onChange={(event) => setForm((current) => ({
                ...current,
                telefono: event.target.value,
              }))}
              maxLength={30}
            />
          </label>

          <label className="field form-span-full">
            Dirección
            <textarea
              rows={3}
              value={form.direccion}
              onChange={(event) => setForm((current) => ({
                ...current,
                direccion: event.target.value,
              }))}
            />
          </label>
        </form>
      </Modal>
    </div>
  )
}
