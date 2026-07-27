import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { PurchaseStatusBadge } from '../components/PurchaseStatusBadge'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  cleanOptionalText,
  formatDateTime,
  formatMoney,
  sanitizeSearchTerm,
} from '../lib/catalog-utils'
import { getPurchaseErrorMessage } from '../lib/purchases-utils'
import {
  dateEndExclusiveToIso,
  dateStartToIso,
  roundMoney,
  roundQuantity,
  toDateTimeLocal,
} from '../lib/sales-utils'
import { supabase } from '../lib/supabase'
import type { Product } from '../types/catalog'
import {
  purchaseStatusLabels,
  type Purchase,
  type PurchaseDetail,
  type PurchaseLineForm,
  type PurchaseRpcResult,
  type PurchaseStatus,
  type Supplier,
} from '../types/purchases'
import type { Warehouse } from '../types/sales'

const PAGE_SIZE = 10

type PurchaseModalMode = 'CREATE' | 'EDIT' | 'VIEW'

interface PurchaseFormState {
  proveedor_id: string
  almacen_id: string
  fecha_compra: string
  numero_comprobante: string
  observaciones: string
  lines: PurchaseLineForm[]
}

interface PurchaseFormErrors {
  proveedor_id?: string
  almacen_id?: string
  fecha_compra?: string
  lines?: string
}

interface PurchaseModalState {
  open: boolean
  mode: PurchaseModalMode
  purchase: Purchase | null
}

const emptyPurchaseForm: PurchaseFormState = {
  proveedor_id: '',
  almacen_id: '',
  fecha_compra: toDateTimeLocal(new Date()),
  numero_comprobante: '',
  observaciones: '',
  lines: [],
}

function newLineKey(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function validatePurchaseForm(
  form: PurchaseFormState,
): PurchaseFormErrors {
  const errors: PurchaseFormErrors = {}

  if (!form.proveedor_id) errors.proveedor_id = 'Selecciona un proveedor.'
  if (!form.almacen_id) errors.almacen_id = 'Selecciona un almacén.'
  if (
    !form.fecha_compra
    || Number.isNaN(new Date(form.fecha_compra).getTime())
  ) {
    errors.fecha_compra = 'Ingresa una fecha de compra válida.'
  }

  if (form.lines.length === 0) {
    errors.lines = 'Agrega al menos un producto.'
    return errors
  }

  const productIds = new Set<string>()

  for (const line of form.lines) {
    if (!line.producto_id) {
      errors.lines = 'Todos los detalles deben tener un producto.'
      break
    }

    if (productIds.has(line.producto_id)) {
      errors.lines = 'No se puede repetir un producto.'
      break
    }
    productIds.add(line.producto_id)

    const quantity = Number(line.cantidad)
    const cost = Number(line.costo_unitario)
    const discount = Number(line.descuento_linea || 0)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.lines = 'Las cantidades deben ser mayores que cero.'
      break
    }

    if (!Number.isFinite(cost) || cost < 0) {
      errors.lines = 'Los costos deben ser mayores o iguales a cero.'
      break
    }

    if (
      !Number.isFinite(discount)
      || discount < 0
      || discount > quantity * cost
    ) {
      errors.lines = 'Revisa los descuentos de las líneas.'
      break
    }
  }

  return errors
}

export function PurchasesPage() {
  const { company, membership } = useAuth()

  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | ''>('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [taxRate, setTaxRate] = useState(0.18)
  const [referencesLoading, setReferencesLoading] = useState(true)

  const [purchaseModal, setPurchaseModal] = useState<PurchaseModalState>({
    open: false,
    mode: 'CREATE',
    purchase: null,
  })
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(
    emptyPurchaseForm,
  )
  const [purchaseFormErrors, setPurchaseFormErrors] =
    useState<PurchaseFormErrors>({})
  const [purchaseFormError, setPurchaseFormError] = useState<string | null>(null)
  const [purchaseDetailsLoading, setPurchaseDetailsLoading] = useState(false)
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [processingPurchaseId, setProcessingPurchaseId] = useState<string | null>(null)

  const [annullingPurchase, setAnnullingPurchase] = useState<Purchase | null>(null)
  const [annulReason, setAnnulReason] = useState('')
  const [annulError, setAnnulError] = useState<string | null>(null)
  const [annulSaving, setAnnulSaving] = useState(false)

  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  const canOperatePurchases = Boolean(
    membership && ['ADMIN', 'ALMACEN'].includes(membership.rol),
  )
  const canAnnulPurchases = membership?.rol === 'ADMIN'

  const suppliersMap = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  )
  const productsMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )
  const warehousesMap = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  )

  const loadReferences = useCallback(async () => {
    if (!company) return

    setReferencesLoading(true)
    setPageError(null)

    const [suppliersResult, productsResult, warehousesResult, companyResult] =
      await Promise.all([
        supabase
          .from('proveedores')
          .select(
            'id, empresa_id, tipo_documento, numero_documento, razon_social, nombre_comercial, email, telefono, contacto_nombre, direccion, activo, creado_at, actualizado_at',
          )
          .eq('empresa_id', company.id)
          .order('razon_social', { ascending: true }),
        supabase
          .from('productos')
          .select(
            'id, empresa_id, categoria_id, sku, nombre, descripcion, unidad_medida, costo_actual, precio_venta, activo, creado_at, actualizado_at',
          )
          .eq('empresa_id', company.id)
          .order('nombre', { ascending: true }),
        supabase
          .from('almacenes')
          .select('id, empresa_id, nombre, descripcion, es_principal, activo')
          .eq('empresa_id', company.id)
          .order('es_principal', { ascending: false })
          .order('nombre', { ascending: true }),
        supabase
          .from('empresas')
          .select('tasa_impuesto')
          .eq('id', company.id)
          .maybeSingle(),
      ])

    const firstError = [
      suppliersResult.error,
      productsResult.error,
      warehousesResult.error,
      companyResult.error,
    ].find(Boolean)

    if (firstError) {
      setPageError(firstError.message)
      setReferencesLoading(false)
      return
    }

    setSuppliers((suppliersResult.data ?? []) as Supplier[])
    setProducts((productsResult.data ?? []) as Product[])
    setWarehouses((warehousesResult.data ?? []) as Warehouse[])
    setTaxRate(Number(companyResult.data?.tasa_impuesto ?? 0.18))
    setReferencesLoading(false)
  }, [company])

  const loadPurchases = useCallback(async () => {
    if (!company) return

    setLoading(true)
    setPageError(null)

    let query = supabase
      .from('compras')
      .select(
        'id, empresa_id, codigo, proveedor_id, comprador_empresa_id, almacen_id, fecha_compra, estado, subtotal, descuento_total, tasa_impuesto, impuesto_total, total, moneda, numero_comprobante, observaciones, motivo_anulacion, confirmada_at, confirmada_por, anulada_at, anulada_por, creado_at, actualizado_at',
        { count: 'exact' },
      )
      .eq('empresa_id', company.id)

    const search = sanitizeSearchTerm(debouncedSearch)
    if (search) {
      query = query.or(
        `codigo.ilike.%${search}%,numero_comprobante.ilike.%${search}%`,
      )
    }
    if (statusFilter) query = query.eq('estado', statusFilter)
    if (supplierFilter) query = query.eq('proveedor_id', supplierFilter)

    const fromIso = dateStartToIso(dateFrom)
    if (fromIso) query = query.gte('fecha_compra', fromIso)

    const toIso = dateEndExclusiveToIso(dateTo)
    if (toIso) query = query.lt('fecha_compra', toIso)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error, count } = await query
      .order('fecha_compra', { ascending: false })
      .range(from, to)

    if (error) {
      setPageError(error.message)
      setPurchases([])
      setTotalItems(0)
      setLoading(false)
      return
    }

    const nextTotal = count ?? 0
    const nextPages = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE))
    if (page > nextPages) {
      setPage(nextPages)
      setLoading(false)
      return
    }

    setPurchases((data ?? []) as Purchase[])
    setTotalItems(nextTotal)
    setLoading(false)
  }, [company, dateFrom, dateTo, debouncedSearch, page, statusFilter, supplierFilter])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadReferences()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadReferences])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadPurchases()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadPurchases])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    setPage(1)
  }

  const handleStatusFilterChange = (value: PurchaseStatus | '') => {
    setStatusFilter(value)
    setPage(1)
  }

  const handleSupplierFilterChange = (value: string) => {
    setSupplierFilter(value)
    setPage(1)
  }

  const handleDateFromChange = (value: string) => {
    setDateFrom(value)
    setPage(1)
  }

  const handleDateToChange = (value: string) => {
    setDateTo(value)
    setPage(1)
  }

  const calculatedTotals = useMemo(() => {
    const subtotal = roundMoney(purchaseForm.lines.reduce(
      (sum, line) => sum
        + (Number(line.cantidad) || 0) * (Number(line.costo_unitario) || 0),
      0,
    ))
    const discount = roundMoney(purchaseForm.lines.reduce(
      (sum, line) => sum + (Number(line.descuento_linea) || 0),
      0,
    ))
    const taxable = Math.max(0, subtotal - discount)
    const tax = roundMoney(taxable * taxRate)
    return {
      subtotal,
      discount,
      tax,
      total: roundMoney(taxable + tax),
    }
  }, [purchaseForm.lines, taxRate])

  const modalReadOnly = purchaseModal.mode === 'VIEW'

  const resetPurchaseForm = () => {
    const principal = warehouses.find((warehouse) => warehouse.es_principal && warehouse.activo)
      ?? warehouses.find((warehouse) => warehouse.activo)

    setPurchaseForm({
      ...emptyPurchaseForm,
      almacen_id: principal?.id ?? '',
      proveedor_id: suppliers.find((supplier) => supplier.activo)?.id ?? '',
      fecha_compra: toDateTimeLocal(new Date()),
    })
    setPurchaseFormErrors({})
    setPurchaseFormError(null)
  }

  const openCreateModal = () => {
    resetPurchaseForm()
    setPurchaseModal({ open: true, mode: 'CREATE', purchase: null })
  }

  const loadPurchaseForModal = async (
    purchase: Purchase,
    mode: PurchaseModalMode,
  ) => {
    setPurchaseModal({ open: true, mode, purchase })
    setPurchaseDetailsLoading(true)
    setPurchaseFormError(null)
    setPurchaseFormErrors({})

    const { data, error } = await supabase
      .from('detalle_compra')
      .select(
        'id, compra_id, producto_id, cantidad, costo_unitario, subtotal_linea, descuento_linea, total_linea, creado_at, actualizado_at',
      )
      .eq('compra_id', purchase.id)
      .order('creado_at', { ascending: true })

    if (error) {
      setPurchaseFormError(error.message)
      setPurchaseDetailsLoading(false)
      return
    }

    setPurchaseForm({
      proveedor_id: purchase.proveedor_id,
      almacen_id: purchase.almacen_id,
      fecha_compra: toDateTimeLocal(purchase.fecha_compra),
      numero_comprobante: purchase.numero_comprobante ?? '',
      observaciones: purchase.observaciones ?? '',
      lines: ((data ?? []) as PurchaseDetail[]).map((detail) => ({
        key: detail.id,
        producto_id: detail.producto_id,
        cantidad: String(detail.cantidad),
        costo_unitario: String(detail.costo_unitario),
        descuento_linea: String(detail.descuento_linea),
      })),
    })
    setPurchaseDetailsLoading(false)
  }

  const closePurchaseModal = () => {
    if (savingPurchase) return
    setPurchaseModal({ open: false, mode: 'CREATE', purchase: null })
  }

  const addProductLine = () => {
    const selected = new Set(purchaseForm.lines.map((line) => line.producto_id))
    const product = products.find((item) => item.activo && !selected.has(item.id))

    setPurchaseForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          key: newLineKey(),
          producto_id: product?.id ?? '',
          cantidad: '1',
          costo_unitario: String(product?.costo_actual ?? 0),
          descuento_linea: '0',
        },
      ],
    }))
  }

  const updateLine = (
    key: string,
    field: keyof Omit<PurchaseLineForm, 'key'>,
    value: string,
  ) => {
    setPurchaseForm((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        if (line.key !== key) return line
        if (field === 'producto_id') {
          const product = productsMap.get(value)
          return {
            ...line,
            producto_id: value,
            costo_unitario: String(product?.costo_actual ?? 0),
          }
        }
        return { ...line, [field]: value }
      }),
    }))
  }

  const removeLine = (key: string) => {
    setPurchaseForm((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.key !== key),
    }))
  }

  const handleSavePurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!company || !canOperatePurchases || modalReadOnly) return

    const errors = validatePurchaseForm(purchaseForm)
    setPurchaseFormErrors(errors)
    setPurchaseFormError(null)
    if (Object.keys(errors).length > 0) return

    setSavingPurchase(true)

    const details = purchaseForm.lines.map((line) => ({
      producto_id: line.producto_id,
      cantidad: roundQuantity(Number(line.cantidad)),
      costo_unitario: roundMoney(Number(line.costo_unitario)),
      descuento_linea: roundMoney(Number(line.descuento_linea || 0)),
    }))

    const { data, error } = await supabase.rpc('guardar_compra_borrador', {
      p_compra_id: purchaseModal.purchase?.id ?? null,
      p_empresa_id: company.id,
      p_proveedor_id: purchaseForm.proveedor_id,
      p_almacen_id: purchaseForm.almacen_id,
      p_fecha_compra: new Date(purchaseForm.fecha_compra).toISOString(),
      p_numero_comprobante: cleanOptionalText(purchaseForm.numero_comprobante),
      p_observaciones: cleanOptionalText(purchaseForm.observaciones),
      p_detalles: details,
    })

    if (error) {
      setPurchaseFormError(getPurchaseErrorMessage(error))
      setSavingPurchase(false)
      return
    }

    const result = (data?.[0] ?? null) as PurchaseRpcResult | null
    setSuccessMessage(
      `${result?.codigo ?? 'La compra'} ${purchaseModal.purchase ? 'actualizada' : 'guardada como borrador'}.`,
    )
    setSavingPurchase(false)
    closePurchaseModal()
    await Promise.all([loadPurchases(), loadReferences()])
  }

  const handleConfirmPurchase = async (purchase: Purchase) => {
    if (!canOperatePurchases) return
    if (!window.confirm(
      `¿Confirmar la compra ${purchase.codigo}? Esta operación aumentará el stock.`,
    )) return

    setProcessingPurchaseId(purchase.id)
    setPageError(null)

    const { data, error } = await supabase.rpc('confirmar_compra', {
      p_compra_id: purchase.id,
    })

    if (error) {
      setPageError(getPurchaseErrorMessage(error))
      setProcessingPurchaseId(null)
      return
    }

    const result = (data?.[0] ?? null) as PurchaseRpcResult | null
    setSuccessMessage(`${result?.codigo ?? purchase.codigo} confirmada y stock recibido.`)
    setProcessingPurchaseId(null)
    await loadPurchases()
  }

  const handleDeleteDraft = async (purchase: Purchase) => {
    if (!canOperatePurchases) return
    if (!window.confirm(`¿Eliminar el borrador ${purchase.codigo}?`)) return

    setProcessingPurchaseId(purchase.id)
    setPageError(null)
    setSuccessMessage(null)

    const { error } = await supabase.rpc('eliminar_compra_borrador', {
      p_compra_id: purchase.id,
    })

    if (error) {
      setPageError(getPurchaseErrorMessage(error))
      setProcessingPurchaseId(null)
      return
    }

    setSuccessMessage(`${purchase.codigo} eliminada.`)
    setProcessingPurchaseId(null)
    await loadPurchases()
  }

  const openAnnulModal = (purchase: Purchase) => {
    setAnnullingPurchase(purchase)
    setAnnulReason('')
    setAnnulError(null)
  }

  const closeAnnulModal = () => {
    if (!annulSaving) setAnnullingPurchase(null)
  }

  const handleAnnulPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!annullingPurchase || !canAnnulPurchases) return

    if (!annulReason.trim()) {
      setAnnulError('Ingresa el motivo de anulación.')
      return
    }

    setAnnulSaving(true)
    const { data, error } = await supabase.rpc('anular_compra', {
      p_compra_id: annullingPurchase.id,
      p_motivo: annulReason.trim(),
    })

    if (error) {
      setAnnulError(getPurchaseErrorMessage(error))
      setAnnulSaving(false)
      return
    }

    const result = (data?.[0] ?? null) as PurchaseRpcResult | null
    setSuccessMessage(`${result?.codigo ?? annullingPurchase.codigo} anulada y stock revertido.`)
    setAnnulSaving(false)
    setAnnullingPurchase(null)
    await loadPurchases()
  }

  const totalSummary = loading
    ? 'Consultando compras...'
    : `${totalItems} ${totalItems === 1 ? 'compra encontrada' : 'compras encontradas'}`

  return (
    <div className="page-stack">
      <section className="panel data-page-panel">
        <div className="data-page-header">
          <div>
            <span className="eyebrow">Abastecimiento</span>
            <h2>Compras</h2>
            <p>
              Registra borradores, confirma recepciones y aumenta el stock
              conservando el Kardex.
            </p>
          </div>

          {canOperatePurchases ? (
            <button
              type="button"
              className="button button-primary"
              onClick={openCreateModal}
              disabled={referencesLoading}
            >
              Nueva compra
            </button>
          ) : null}
        </div>

        {!canOperatePurchases ? (
          <div className="alert alert-info">
            Acceso de solo lectura. Las operaciones requieren el rol Administrador o Almacén.
          </div>
        ) : null}

        {successMessage ? (
          <div className="alert alert-success" role="status">
            <span>{successMessage}</span>
            <button
              type="button"
              className="alert-dismiss"
              aria-label="Cerrar mensaje"
              onClick={() => setSuccessMessage(null)}
            >×</button>
          </div>
        ) : null}

        {pageError ? (
          <div className="alert alert-error" role="alert">
            <strong>No se pudo completar la operación.</strong>
            <span>{pageError}</span>
          </div>
        ) : null}

        <div className="data-toolbar purchases-toolbar">
          <label className="search-control">
            <span>Buscar código o comprobante</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Ej. C-20260727-0001"
            />
          </label>

          <label className="filter-control">
            <span>Estado</span>
            <select
              value={statusFilter}
              onChange={(event) => handleStatusFilterChange(
                event.target.value as PurchaseStatus | '',
              )}
            >
              <option value="">Todos</option>
              {Object.entries(purchaseStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span>Proveedor</span>
            <select
              value={supplierFilter}
              onChange={(event) => handleSupplierFilterChange(event.target.value)}
            >
              <option value="">Todos</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.razon_social}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span>Desde</span>
            <input type="date" value={dateFrom} onChange={(event) => handleDateFromChange(event.target.value)} />
          </label>

          <label className="filter-control">
            <span>Hasta</span>
            <input type="date" value={dateTo} onChange={(event) => handleDateToChange(event.target.value)} />
          </label>
        </div>

        <div className="data-table-heading">
          <strong>Registro de compras</strong>
          <span>{totalSummary}</span>
        </div>

        <div className="table-scroll">
          <table className="data-table purchases-table">
            <thead>
              <tr>
                <th>Compra</th>
                <th>Proveedor</th>
                <th>Almacén</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Actualización</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Cargando compras...</td></tr>
              ) : purchases.length === 0 ? (
                <tr><td colSpan={7}>No se encontraron compras.</td></tr>
              ) : purchases.map((purchase) => {
                const supplier = suppliersMap.get(purchase.proveedor_id)
                const warehouse = warehousesMap.get(purchase.almacen_id)
                const processing = processingPurchaseId === purchase.id

                return (
                  <tr key={purchase.id}>
                    <td>
                      <strong>{purchase.codigo}</strong>
                      <small>{formatDateTime(purchase.fecha_compra)}</small>
                    </td>
                    <td>
                      {supplier?.razon_social ?? 'Proveedor no disponible'}
                      <small>{purchase.numero_comprobante ?? 'Sin comprobante'}</small>
                    </td>
                    <td>{warehouse?.nombre ?? 'Almacén no disponible'}</td>
                    <td><PurchaseStatusBadge status={purchase.estado} /></td>
                    <td><strong>{formatMoney(Number(purchase.total), purchase.moneda)}</strong></td>
                    <td>{formatDateTime(purchase.actualizado_at)}</td>
                    <td>
                      <div className="action-row">
                        <button
                          type="button"
                          className="text-action"
                          onClick={() => void loadPurchaseForModal(purchase, 'VIEW')}
                        >Ver</button>

                        {canOperatePurchases && purchase.estado === 'BORRADOR' ? (
                          <>
                            <button
                              type="button"
                              className="text-action"
                              disabled={processing}
                              onClick={() => void loadPurchaseForModal(purchase, 'EDIT')}
                            >Editar</button>
                            <button
                              type="button"
                              className="text-action"
                              disabled={processing}
                              onClick={() => void handleConfirmPurchase(purchase)}
                            >Confirmar</button>
                            <button
                              type="button"
                              className="text-action text-action-danger"
                              disabled={processing}
                              onClick={() => void handleDeleteDraft(purchase)}
                            >Eliminar</button>
                          </>
                        ) : null}

                        {canAnnulPurchases && purchase.estado === 'CONFIRMADA' ? (
                          <button
                            type="button"
                            className="text-action text-action-danger"
                            disabled={processing}
                            onClick={() => openAnnulModal(purchase)}
                          >Anular</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
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
        open={purchaseModal.open}
        title={purchaseModal.mode === 'CREATE'
          ? 'Nueva compra'
          : purchaseModal.mode === 'EDIT'
            ? `Editar ${purchaseModal.purchase?.codigo ?? 'compra'}`
            : purchaseModal.purchase?.codigo ?? 'Detalle de compra'}
        description={modalReadOnly
          ? 'Consulta del encabezado, detalle e importes registrados.'
          : 'Los importes se recalculan en PostgreSQL al guardar los detalles.'}
        onClose={closePurchaseModal}
        footer={modalReadOnly ? (
          <button type="button" className="button button-secondary" onClick={closePurchaseModal}>Cerrar</button>
        ) : (
          <>
            <button type="button" className="button button-secondary" onClick={closePurchaseModal} disabled={savingPurchase}>Cancelar</button>
            <button type="submit" form="purchase-form" className="button button-primary" disabled={savingPurchase || purchaseDetailsLoading}>
              {savingPurchase ? 'Guardando...' : 'Guardar borrador'}
            </button>
          </>
        )}
      >
        {purchaseDetailsLoading ? (
          <div className="table-message">Cargando detalle de la compra...</div>
        ) : (
          <form id="purchase-form" className="sale-form" onSubmit={handleSavePurchase}>
            {purchaseFormError ? <div className="alert alert-error">{purchaseFormError}</div> : null}

            <div className="form-grid">
              <label className="field form-span-full">
                Proveedor *
                <select
                  value={purchaseForm.proveedor_id}
                  disabled={modalReadOnly}
                  onChange={(event) => setPurchaseForm((current) => ({ ...current, proveedor_id: event.target.value }))}
                >
                  <option value="">Selecciona</option>
                  {suppliers
                    .filter((supplier) => supplier.activo || supplier.id === purchaseForm.proveedor_id)
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.razon_social}</option>
                    ))}
                </select>
                {purchaseFormErrors.proveedor_id ? <span className="field-error">{purchaseFormErrors.proveedor_id}</span> : null}
              </label>

              <label className="field">
                Fecha y hora *
                <input
                  type="datetime-local"
                  value={purchaseForm.fecha_compra}
                  disabled={modalReadOnly}
                  onChange={(event) => setPurchaseForm((current) => ({ ...current, fecha_compra: event.target.value }))}
                />
                {purchaseFormErrors.fecha_compra ? <span className="field-error">{purchaseFormErrors.fecha_compra}</span> : null}
              </label>

              <label className="field">
                Almacén *
                <select
                  value={purchaseForm.almacen_id}
                  disabled={modalReadOnly}
                  onChange={(event) => setPurchaseForm((current) => ({ ...current, almacen_id: event.target.value }))}
                >
                  <option value="">Selecciona</option>
                  {warehouses
                    .filter((warehouse) => warehouse.activo || warehouse.id === purchaseForm.almacen_id)
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>{warehouse.nombre}</option>
                    ))}
                </select>
                {purchaseFormErrors.almacen_id ? <span className="field-error">{purchaseFormErrors.almacen_id}</span> : null}
              </label>

              <label className="field form-span-full">
                Número de comprobante
                <input
                  value={purchaseForm.numero_comprobante}
                  disabled={modalReadOnly}
                  maxLength={60}
                  placeholder="Factura, boleta o guía"
                  onChange={(event) => setPurchaseForm((current) => ({ ...current, numero_comprobante: event.target.value }))}
                />
              </label>

              <label className="field form-span-full">
                Observaciones
                <textarea
                  rows={2}
                  value={purchaseForm.observaciones}
                  disabled={modalReadOnly}
                  onChange={(event) => setPurchaseForm((current) => ({ ...current, observaciones: event.target.value }))}
                />
              </label>
            </div>

            <div className="sale-lines-heading">
              <div>
                <strong>Productos de la compra</strong>
                <span>La confirmación incrementará el stock del almacén seleccionado.</span>
              </div>
              {!modalReadOnly ? (
                <button type="button" className="button button-secondary button-compact" onClick={addProductLine}>Agregar producto</button>
              ) : null}
            </div>

            {purchaseFormErrors.lines ? <div className="alert alert-error">{purchaseFormErrors.lines}</div> : null}

            {purchaseForm.lines.length === 0 ? (
              <div className="empty-state sale-lines-empty">
                <strong>Sin productos</strong>
                <span>Agrega al menos una línea para guardar la compra.</span>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table sale-lines-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Costo unitario</th>
                      <th>Descuento</th>
                      <th>Total línea</th>
                      {!modalReadOnly ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseForm.lines.map((line) => {
                      const product = productsMap.get(line.producto_id)
                      const quantity = Number(line.cantidad) || 0
                      const cost = Number(line.costo_unitario) || 0
                      const discount = Number(line.descuento_linea) || 0
                      const lineTotal = Math.max(0, roundMoney(quantity * cost - discount))

                      return (
                        <tr key={line.key}>
                          <td>
                            <select
                              className="table-input product-select"
                              value={line.producto_id}
                              disabled={modalReadOnly}
                              onChange={(event) => updateLine(line.key, 'producto_id', event.target.value)}
                            >
                              <option value="">Selecciona</option>
                              {products
                                .filter((item) => item.activo || item.id === line.producto_id)
                                .map((item) => (
                                  <option key={item.id} value={item.id}>{item.sku} · {item.nombre}</option>
                                ))}
                            </select>
                            {product ? <small>{product.unidad_medida}</small> : null}
                          </td>
                          <td>
                            <input className="table-input number-input" type="number" min="0.001" step="0.001" value={line.cantidad} disabled={modalReadOnly} onChange={(event) => updateLine(line.key, 'cantidad', event.target.value)} />
                          </td>
                          <td>
                            <input className="table-input number-input" type="number" min="0" step="0.01" value={line.costo_unitario} disabled={modalReadOnly} onChange={(event) => updateLine(line.key, 'costo_unitario', event.target.value)} />
                          </td>
                          <td>
                            <input className="table-input number-input" type="number" min="0" step="0.01" value={line.descuento_linea} disabled={modalReadOnly} onChange={(event) => updateLine(line.key, 'descuento_linea', event.target.value)} />
                          </td>
                          <td>{formatMoney(lineTotal, company?.moneda)}</td>
                          {!modalReadOnly ? (
                            <td><button type="button" className="text-action text-action-danger" onClick={() => removeLine(line.key)}>Quitar</button></td>
                          ) : null}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="sale-total-panel">
              <div><span>Subtotal</span><strong>{formatMoney(calculatedTotals.subtotal, company?.moneda)}</strong></div>
              <div><span>Descuento</span><strong>- {formatMoney(calculatedTotals.discount, company?.moneda)}</strong></div>
              <div><span>IGV ({(taxRate * 100).toFixed(0)}%)</span><strong>{formatMoney(calculatedTotals.tax, company?.moneda)}</strong></div>
              <div className="sale-grand-total"><span>Total</span><strong>{formatMoney(calculatedTotals.total, company?.moneda)}</strong></div>
            </div>

            {purchaseModal.purchase?.estado === 'ANULADA' && purchaseModal.purchase.motivo_anulacion ? (
              <div className="alert alert-error sale-annul-note">
                <strong>Motivo de anulación</strong>
                <span>{purchaseModal.purchase.motivo_anulacion}</span>
              </div>
            ) : null}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(annullingPurchase)}
        title={`Anular ${annullingPurchase?.codigo ?? 'compra'}`}
        description="La anulación descontará las cantidades recibidas. Será rechazada si el stock ya fue consumido."
        onClose={closeAnnulModal}
        footer={(
          <>
            <button type="button" className="button button-secondary" disabled={annulSaving} onClick={closeAnnulModal}>Cancelar</button>
            <button type="submit" form="purchase-annul-form" className="button button-danger" disabled={annulSaving}>{annulSaving ? 'Anulando...' : 'Confirmar anulación'}</button>
          </>
        )}
      >
        <form id="purchase-annul-form" onSubmit={handleAnnulPurchase}>
          {annulError ? <div className="alert alert-error">{annulError}</div> : null}
          <label className="field">
            Motivo de anulación *
            <textarea rows={4} value={annulReason} onChange={(event) => setAnnulReason(event.target.value)} />
          </label>
        </form>
      </Modal>
    </div>
  )
}
