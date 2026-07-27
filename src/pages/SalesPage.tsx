import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Modal } from '../components/Modal'
import { Pagination } from '../components/Pagination'
import { SaleStatusBadge } from '../components/SaleStatusBadge'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  cleanOptionalText,
  formatDateTime,
  formatMoney,
  sanitizeSearchTerm,
} from '../lib/catalog-utils'
import {
  dateEndExclusiveToIso,
  dateStartToIso,
  getSaleErrorMessage,
  roundMoney,
  roundQuantity,
  toDateTimeLocal,
} from '../lib/sales-utils'
import { supabase } from '../lib/supabase'
import type { Client, Product } from '../types/catalog'
import {
  type Sale,
  type SaleDetail,
  type SaleLineForm,
  type SalesChannel,
  type SaleStatus,
  type StockItem,
  type Warehouse,
} from '../types/sales'

const PAGE_SIZE = 10

type SaleModalMode = 'CREATE' | 'EDIT' | 'VIEW'

interface SaleFormState {
  cliente_id: string
  almacen_id: string
  canal_venta_id: string
  fecha_venta: string
  observaciones: string
  lines: SaleLineForm[]
}

interface SaleFormErrors {
  cliente_id?: string
  almacen_id?: string
  canal_venta_id?: string
  fecha_venta?: string
  lines?: string
}

interface SaleModalState {
  open: boolean
  mode: SaleModalMode
  sale: Sale | null
}

const emptySaleForm: SaleFormState = {
  cliente_id: '',
  almacen_id: '',
  canal_venta_id: '',
  fecha_venta: toDateTimeLocal(new Date()),
  observaciones: '',
  lines: [],
}

function newLineKey(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function validateSaleForm(form: SaleFormState): SaleFormErrors {
  const errors: SaleFormErrors = {}

  if (!form.cliente_id) errors.cliente_id = 'Selecciona un cliente.'
  if (!form.almacen_id) errors.almacen_id = 'Selecciona un almacén.'
  if (!form.canal_venta_id) {
    errors.canal_venta_id = 'Selecciona un canal de venta.'
  }
  if (!form.fecha_venta || Number.isNaN(new Date(form.fecha_venta).getTime())) {
    errors.fecha_venta = 'Ingresa una fecha de venta válida.'
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
    const price = Number(line.precio_unitario)
    const discount = Number(line.descuento_linea || 0)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.lines = 'Las cantidades deben ser mayores que cero.'
      break
    }

    if (!Number.isFinite(price) || price < 0) {
      errors.lines = 'Los precios deben ser mayores o iguales a cero.'
      break
    }

    if (
      !Number.isFinite(discount)
      || discount < 0
      || discount > quantity * price
    ) {
      errors.lines = 'Revisa los descuentos de las líneas.'
      break
    }
  }

  return errors
}

export function SalesPage() {
  const { company, membership } = useAuth()

  const [sales, setSales] = useState<Sale[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<SaleStatus | ''>('')
  const [clientFilter, setClientFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [channels, setChannels] = useState<SalesChannel[]>([])
  const [stocks, setStocks] = useState<StockItem[]>([])
  const [taxRate, setTaxRate] = useState(0.18)
  const [referencesLoading, setReferencesLoading] = useState(true)

  const [saleModal, setSaleModal] = useState<SaleModalState>({
    open: false,
    mode: 'CREATE',
    sale: null,
  })
  const [saleForm, setSaleForm] = useState<SaleFormState>(emptySaleForm)
  const [saleFormErrors, setSaleFormErrors] = useState<SaleFormErrors>({})
  const [saleFormError, setSaleFormError] = useState<string | null>(null)
  const [saleDetailsLoading, setSaleDetailsLoading] = useState(false)
  const [savingSale, setSavingSale] = useState(false)
  const [processingSaleId, setProcessingSaleId] = useState<string | null>(null)

  const [annullingSale, setAnnullingSale] = useState<Sale | null>(null)
  const [annulReason, setAnnulReason] = useState('')
  const [annulError, setAnnulError] = useState<string | null>(null)
  const [annulSaving, setAnnulSaving] = useState(false)

  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  const canCreateSales = Boolean(
    membership && ['ADMIN', 'VENDEDOR'].includes(membership.rol),
  )

  const clientsMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  )

  const productsMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )

  const warehousesMap = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  )

  const channelsMap = useMemo(
    () => new Map(channels.map((channel) => [channel.id, channel])),
    [channels],
  )

  const stockMap = useMemo(
    () => new Map(
      stocks.map((stock) => [
        `${stock.almacen_id}:${stock.producto_id}`,
        stock,
      ]),
    ),
    [stocks],
  )

  const loadReferences = useCallback(async () => {
    if (!company) return

    setReferencesLoading(true)
    setPageError(null)

    const [
      clientsResult,
      productsResult,
      warehousesResult,
      channelsResult,
      stocksResult,
      companyResult,
    ] = await Promise.all([
      supabase
        .from('clientes')
        .select(
          'id, empresa_id, tipo_cliente, tipo_documento, numero_documento, nombre_completo, email, telefono, segmento, direccion, activo, creado_at, actualizado_at',
        )
        .eq('empresa_id', company.id)
        .order('nombre_completo', { ascending: true }),
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
        .from('canales_venta')
        .select('id, empresa_id, nombre, descripcion, activo')
        .eq('empresa_id', company.id)
        .order('nombre', { ascending: true }),
      supabase
        .from('existencias_producto')
        .select('id, almacen_id, producto_id, stock_actual, stock_minimo'),
      supabase
        .from('empresas')
        .select('tasa_impuesto')
        .eq('id', company.id)
        .maybeSingle(),
    ])

    const firstError = [
      clientsResult.error,
      productsResult.error,
      warehousesResult.error,
      channelsResult.error,
      stocksResult.error,
      companyResult.error,
    ].find(Boolean)

    if (firstError) {
      setPageError(firstError.message)
      setReferencesLoading(false)
      return
    }

    setClients((clientsResult.data ?? []) as Client[])
    setProducts((productsResult.data ?? []) as Product[])
    setWarehouses((warehousesResult.data ?? []) as Warehouse[])
    setChannels((channelsResult.data ?? []) as SalesChannel[])
    setStocks((stocksResult.data ?? []) as StockItem[])
    setTaxRate(Number(companyResult.data?.tasa_impuesto ?? 0.18))
    setReferencesLoading(false)
  }, [company])

  const loadSales = useCallback(async () => {
    if (!company) return

    setLoading(true)
    setPageError(null)

    let query = supabase
      .from('ventas')
      .select(
        'id, empresa_id, codigo, cliente_id, vendedor_empresa_id, almacen_id, canal_venta_id, fecha_venta, estado, subtotal, descuento_total, tasa_impuesto, impuesto_total, total, moneda, observaciones, motivo_anulacion, confirmada_at, confirmada_por, anulada_at, anulada_por, creado_at, actualizado_at',
        { count: 'exact' },
      )
      .eq('empresa_id', company.id)

    const search = sanitizeSearchTerm(debouncedSearch)
    if (search) query = query.ilike('codigo', `%${search}%`)
    if (statusFilter) query = query.eq('estado', statusFilter)
    if (clientFilter) query = query.eq('cliente_id', clientFilter)

    const fromIso = dateStartToIso(dateFrom)
    if (fromIso) query = query.gte('fecha_venta', fromIso)

    const toIso = dateEndExclusiveToIso(dateTo)
    if (toIso) query = query.lt('fecha_venta', toIso)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error, count } = await query
      .order('fecha_venta', { ascending: false })
      .range(from, to)

    if (error) {
      setPageError(error.message)
      setSales([])
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

    setSales((data ?? []) as Sale[])
    setTotalItems(nextTotalItems)
    setLoading(false)
  }, [clientFilter, company, dateFrom, dateTo, debouncedSearch, page, statusFilter])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadReferences()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadReferences])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSales()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadSales])

  const resetPage = () => setPage(1)

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    resetPage()
  }

  const handleStatusFilterChange = (value: SaleStatus | '') => {
    setStatusFilter(value)
    resetPage()
  }

  const handleClientFilterChange = (value: string) => {
    setClientFilter(value)
    resetPage()
  }

  const handleDateFromChange = (value: string) => {
    setDateFrom(value)
    resetPage()
  }

  const handleDateToChange = (value: string) => {
    setDateTo(value)
    resetPage()
  }

  const buildDefaultForm = (): SaleFormState => ({
    cliente_id:
      clients.find((client) => client.activo && client.nombre_completo === 'Público general')?.id
      ?? clients.find((client) => client.activo)?.id
      ?? '',
    almacen_id:
      warehouses.find((warehouse) => warehouse.activo && warehouse.es_principal)?.id
      ?? warehouses.find((warehouse) => warehouse.activo)?.id
      ?? '',
    canal_venta_id:
      channels.find((channel) => channel.activo && channel.nombre === 'Tienda')?.id
      ?? channels.find((channel) => channel.activo)?.id
      ?? '',
    fecha_venta: toDateTimeLocal(new Date()),
    observaciones: '',
    lines: [],
  })

  const openCreateSale = () => {
    setSaleForm(buildDefaultForm())
    setSaleFormErrors({})
    setSaleFormError(null)
    setSaleModal({ open: true, mode: 'CREATE', sale: null })
  }

  const openExistingSale = async (sale: Sale, mode: 'EDIT' | 'VIEW') => {
    setSaleModal({ open: true, mode, sale })
    setSaleDetailsLoading(true)
    setSaleFormErrors({})
    setSaleFormError(null)

    const { data, error } = await supabase
      .from('detalle_venta')
      .select(
        'id, venta_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal_linea, descuento_linea, total_linea, creado_at, actualizado_at',
      )
      .eq('venta_id', sale.id)
      .order('creado_at', { ascending: true })

    if (error) {
      setSaleFormError(error.message)
      setSaleDetailsLoading(false)
      return
    }

    const details = (data ?? []) as SaleDetail[]
    setSaleForm({
      cliente_id: sale.cliente_id,
      almacen_id: sale.almacen_id,
      canal_venta_id: sale.canal_venta_id,
      fecha_venta: toDateTimeLocal(sale.fecha_venta),
      observaciones: sale.observaciones ?? '',
      lines: details.map((detail) => ({
        key: detail.id,
        producto_id: detail.producto_id,
        cantidad: String(detail.cantidad),
        precio_unitario: String(detail.precio_unitario),
        descuento_linea: String(detail.descuento_linea),
      })),
    })
    setSaleDetailsLoading(false)
  }

  const closeSaleModal = () => {
    if (savingSale) return
    setSaleModal((current) => ({ ...current, open: false }))
  }

  const activeProducts = useMemo(
    () => products.filter((product) => product.activo),
    [products],
  )

  const addProductLine = () => {
    const used = new Set(saleForm.lines.map((line) => line.producto_id))
    const product = activeProducts.find((item) => !used.has(item.id))

    if (!product) {
      setSaleFormError('No quedan productos activos disponibles para agregar.')
      return
    }

    setSaleForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          key: newLineKey(),
          producto_id: product.id,
          cantidad: '1',
          precio_unitario: String(product.precio_venta),
          descuento_linea: '0',
        },
      ],
    }))
    setSaleFormError(null)
    setSaleFormErrors((current) => ({ ...current, lines: undefined }))
  }

  const updateLine = (
    key: string,
    field: keyof Omit<SaleLineForm, 'key'>,
    value: string,
  ) => {
    setSaleForm((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        if (line.key !== key) return line

        if (field === 'producto_id') {
          const product = productsMap.get(value)
          return {
            ...line,
            producto_id: value,
            precio_unitario: product
              ? String(product.precio_venta)
              : line.precio_unitario,
          }
        }

        return { ...line, [field]: value }
      }),
    }))
  }

  const removeLine = (key: string) => {
    setSaleForm((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.key !== key),
    }))
  }

  const effectiveTaxRate = saleModal.sale?.tasa_impuesto ?? taxRate

  const calculatedTotals = useMemo(() => {
    const subtotal = roundMoney(
      saleForm.lines.reduce((sum, line) => {
        const quantity = Number(line.cantidad) || 0
        const price = Number(line.precio_unitario) || 0
        return sum + quantity * price
      }, 0),
    )
    const discount = roundMoney(
      saleForm.lines.reduce(
        (sum, line) => sum + (Number(line.descuento_linea) || 0),
        0,
      ),
    )
    const taxable = Math.max(0, subtotal - discount)
    const tax = roundMoney(taxable * effectiveTaxRate)
    const total = roundMoney(taxable + tax)

    return { subtotal, discount, tax, total }
  }, [effectiveTaxRate, saleForm.lines])

  const handleSaveSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!company) return

    const errors = validateSaleForm(saleForm)
    setSaleFormErrors(errors)
    setSaleFormError(null)

    if (Object.keys(errors).length > 0) return

    setSavingSale(true)

    const details = saleForm.lines.map((line) => ({
      producto_id: line.producto_id,
      cantidad: roundQuantity(Number(line.cantidad)),
      precio_unitario: roundMoney(Number(line.precio_unitario)),
      descuento_linea: roundMoney(Number(line.descuento_linea || 0)),
    }))

    const { data, error } = await supabase.rpc('guardar_venta_borrador', {
      p_venta_id: saleModal.sale?.id ?? null,
      p_empresa_id: company.id,
      p_cliente_id: saleForm.cliente_id,
      p_almacen_id: saleForm.almacen_id,
      p_canal_venta_id: saleForm.canal_venta_id,
      p_fecha_venta: new Date(saleForm.fecha_venta).toISOString(),
      p_observaciones: cleanOptionalText(saleForm.observaciones),
      p_detalles: details,
    })

    if (error) {
      setSaleFormError(getSaleErrorMessage(error))
      setSavingSale(false)
      return
    }

    const result = Array.isArray(data) ? data[0] : data
    const saleCode = result?.codigo ?? saleModal.sale?.codigo ?? 'Venta'

    setSuccessMessage(
      saleModal.mode === 'CREATE'
        ? `${saleCode} guardada como borrador.`
        : `${saleCode} actualizada correctamente.`,
    )
    setSavingSale(false)
    setSaleModal((current) => ({ ...current, open: false }))
    await Promise.all([loadSales(), loadReferences()])
  }

  const canEditSale = (sale: Sale): boolean => {
    if (!membership || sale.estado !== 'BORRADOR') return false
    return membership.rol === 'ADMIN'
      || (
        membership.rol === 'VENDEDOR'
        && sale.vendedor_empresa_id === membership.id
      )
  }

  const handleConfirmSale = async (sale: Sale) => {
    if (!window.confirm(`¿Confirmar la venta ${sale.codigo}? Esta operación descontará stock.`)) {
      return
    }

    setProcessingSaleId(sale.id)
    setPageError(null)

    const { error } = await supabase.rpc('confirmar_venta', {
      p_venta_id: sale.id,
    })

    if (error) {
      setPageError(getSaleErrorMessage(error))
      setProcessingSaleId(null)
      return
    }

    setSuccessMessage(`${sale.codigo} confirmada y stock descontado.`)
    setProcessingSaleId(null)
    await Promise.all([loadSales(), loadReferences()])
  }

  const handleDeleteDraft = async (sale: Sale) => {
    if (!window.confirm(`¿Eliminar definitivamente el borrador ${sale.codigo}?`)) {
      return
    }

    setProcessingSaleId(sale.id)
    setPageError(null)

    const { error } = await supabase
      .from('ventas')
      .delete()
      .eq('id', sale.id)

    if (error) {
      setPageError(getSaleErrorMessage(error))
      setProcessingSaleId(null)
      return
    }

    setSuccessMessage(`${sale.codigo} eliminada.`)
    setProcessingSaleId(null)
    await loadSales()
  }

  const openAnnulModal = (sale: Sale) => {
    setAnnullingSale(sale)
    setAnnulReason('')
    setAnnulError(null)
  }

  const closeAnnulModal = () => {
    if (annulSaving) return
    setAnnullingSale(null)
  }

  const handleAnnulSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!annullingSale) return

    if (annulReason.trim().length < 5) {
      setAnnulError('Describe el motivo con al menos 5 caracteres.')
      return
    }

    setAnnulSaving(true)
    setAnnulError(null)

    const { error } = await supabase.rpc('anular_venta', {
      p_venta_id: annullingSale.id,
      p_motivo: annulReason.trim(),
    })

    if (error) {
      setAnnulError(getSaleErrorMessage(error))
      setAnnulSaving(false)
      return
    }

    setSuccessMessage(
      `${annullingSale.codigo} anulada y stock devuelto.`,
    )
    setAnnulSaving(false)
    setAnnullingSale(null)
    await Promise.all([loadSales(), loadReferences()])
  }

  const stockForProduct = (productId: string): number => (
    stockMap.get(`${saleForm.almacen_id}:${productId}`)?.stock_actual ?? 0
  )

  const modalReadOnly = saleModal.mode === 'VIEW'
  const modalTitle = saleModal.mode === 'CREATE'
    ? 'Nueva venta'
    : saleModal.mode === 'EDIT'
      ? `Editar ${saleModal.sale?.codigo ?? 'venta'}`
      : `Detalle de ${saleModal.sale?.codigo ?? 'venta'}`

  return (
    <div className="page-stack">
      <section className="panel data-page-panel">
        <header className="data-page-header">
          <div>
            <span className="eyebrow">Gestión comercial</span>
            <h2>Ventas</h2>
            <p>
              Registra borradores, confirma operaciones con control de stock y
              conserva el historial de anulaciones.
            </p>
          </div>

          {canCreateSales ? (
            <button
              type="button"
              className="button button-primary"
              disabled={referencesLoading}
              onClick={openCreateSale}
            >
              Nueva venta
            </button>
          ) : (
            <span className="read-only-note">Consulta gerencial</span>
          )}
        </header>

        {successMessage ? (
          <section className="alert alert-success">
            <span>{successMessage}</span>
            <button
              type="button"
              className="alert-dismiss"
              aria-label="Cerrar mensaje"
              onClick={() => setSuccessMessage(null)}
            >
              ×
            </button>
          </section>
        ) : null}

        {pageError ? (
          <section className="alert alert-error">
            <strong>No se pudo completar la operación.</strong>
            <span>{pageError}</span>
          </section>
        ) : null}

        <div className="sales-toolbar">
          <label className="search-control">
            <span>Buscar código</span>
            <input
              value={searchInput}
              placeholder="Ej. V-20260727-0001"
              onChange={(event) => handleSearchChange(event.target.value)}
            />
          </label>

          <label className="filter-control">
            <span>Estado</span>
            <select
              value={statusFilter}
              onChange={(event) => (
                handleStatusFilterChange(event.target.value as SaleStatus | '')
              )}
            >
              <option value="">Todos</option>
              <option value="BORRADOR">Borrador</option>
              <option value="CONFIRMADA">Confirmada</option>
              <option value="ANULADA">Anulada</option>
            </select>
          </label>

          <label className="filter-control">
            <span>Cliente</span>
            <select
              value={clientFilter}
              onChange={(event) => handleClientFilterChange(event.target.value)}
            >
              <option value="">Todos</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nombre_completo}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-control">
            <span>Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => handleDateFromChange(event.target.value)}
            />
          </label>

          <label className="filter-control">
            <span>Hasta</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => handleDateToChange(event.target.value)}
            />
          </label>
        </div>

        <div className="data-table-heading">
          <strong>Registro de ventas</strong>
          <span>
            {totalItems} {totalItems === 1 ? 'venta encontrada' : 'ventas encontradas'}
          </span>
        </div>

        <div className="table-scroll">
          {loading ? (
            <div className="table-message">Cargando ventas...</div>
          ) : sales.length === 0 ? (
            <div className="empty-state">
              <strong>No se encontraron ventas</strong>
              <span>Cambia los filtros o registra una nueva venta.</span>
            </div>
          ) : (
            <table className="data-table sales-table">
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Cliente</th>
                  <th>Canal / almacén</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Actualización</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const processing = processingSaleId === sale.id
                  const editable = canEditSale(sale)

                  return (
                    <tr key={sale.id}>
                      <td>
                        <div className="primary-cell">
                          <strong>{sale.codigo}</strong>
                          <span>{formatDateTime(sale.fecha_venta)}</span>
                        </div>
                      </td>
                      <td>{clientsMap.get(sale.cliente_id)?.nombre_completo ?? 'Cliente no disponible'}</td>
                      <td>
                        <div className="secondary-lines">
                          <span>{channelsMap.get(sale.canal_venta_id)?.nombre ?? 'Sin canal'}</span>
                          <span>{warehousesMap.get(sale.almacen_id)?.nombre ?? 'Sin almacén'}</span>
                        </div>
                      </td>
                      <td><SaleStatusBadge status={sale.estado} /></td>
                      <td><strong>{formatMoney(sale.total, sale.moneda)}</strong></td>
                      <td>{formatDateTime(sale.actualizado_at)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="text-action"
                            disabled={processing}
                            onClick={() => void openExistingSale(sale, 'VIEW')}
                          >
                            Ver
                          </button>

                          {editable ? (
                            <>
                              <button
                                type="button"
                                className="text-action"
                                disabled={processing}
                                onClick={() => void openExistingSale(sale, 'EDIT')}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="text-action"
                                disabled={processing}
                                onClick={() => void handleConfirmSale(sale)}
                              >
                                {processing ? 'Procesando...' : 'Confirmar'}
                              </button>
                              <button
                                type="button"
                                className="text-action text-action-danger"
                                disabled={processing}
                                onClick={() => void handleDeleteDraft(sale)}
                              >
                                Eliminar
                              </button>
                            </>
                          ) : null}

                          {membership?.rol === 'ADMIN' && sale.estado === 'CONFIRMADA' ? (
                            <button
                              type="button"
                              className="text-action text-action-danger"
                              disabled={processing}
                              onClick={() => openAnnulModal(sale)}
                            >
                              Anular
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </section>

      <Modal
        open={saleModal.open}
        size="large"
        title={modalTitle}
        description={
          modalReadOnly
            ? 'La venta confirmada o anulada se conserva como historial.'
            : 'Los importes se recalculan en PostgreSQL al guardar los detalles.'
        }
        onClose={closeSaleModal}
        footer={
          modalReadOnly ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={closeSaleModal}
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button button-secondary"
                disabled={savingSale}
                onClick={closeSaleModal}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="sale-form"
                className="button button-primary"
                disabled={savingSale || saleDetailsLoading}
              >
                {savingSale ? 'Guardando...' : 'Guardar borrador'}
              </button>
            </>
          )
        }
      >
        {saleDetailsLoading ? (
          <div className="table-message">Cargando detalle de venta...</div>
        ) : (
          <form id="sale-form" onSubmit={(event) => void handleSaveSale(event)}>
            {saleFormError ? (
              <section className="alert alert-error">{saleFormError}</section>
            ) : null}

            <div className="form-grid sale-header-grid">
              <label className="field form-span-2">
                Cliente *
                <select
                  value={saleForm.cliente_id}
                  disabled={modalReadOnly}
                  onChange={(event) => setSaleForm((current) => ({
                    ...current,
                    cliente_id: event.target.value,
                  }))}
                >
                  <option value="">Selecciona</option>
                  {clients
                    .filter((client) => client.activo || client.id === saleForm.cliente_id)
                    .map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.nombre_completo}
                      </option>
                    ))}
                </select>
                {saleFormErrors.cliente_id ? (
                  <span className="field-error">{saleFormErrors.cliente_id}</span>
                ) : null}
              </label>

              <label className="field">
                Fecha *
                <input
                  type="datetime-local"
                  value={saleForm.fecha_venta}
                  disabled={modalReadOnly}
                  onChange={(event) => setSaleForm((current) => ({
                    ...current,
                    fecha_venta: event.target.value,
                  }))}
                />
                {saleFormErrors.fecha_venta ? (
                  <span className="field-error">{saleFormErrors.fecha_venta}</span>
                ) : null}
              </label>

              <label className="field">
                Almacén *
                <select
                  value={saleForm.almacen_id}
                  disabled={modalReadOnly}
                  onChange={(event) => setSaleForm((current) => ({
                    ...current,
                    almacen_id: event.target.value,
                  }))}
                >
                  <option value="">Selecciona</option>
                  {warehouses
                    .filter((warehouse) => warehouse.activo || warehouse.id === saleForm.almacen_id)
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.nombre}
                      </option>
                    ))}
                </select>
                {saleFormErrors.almacen_id ? (
                  <span className="field-error">{saleFormErrors.almacen_id}</span>
                ) : null}
              </label>

              <label className="field">
                Canal *
                <select
                  value={saleForm.canal_venta_id}
                  disabled={modalReadOnly}
                  onChange={(event) => setSaleForm((current) => ({
                    ...current,
                    canal_venta_id: event.target.value,
                  }))}
                >
                  <option value="">Selecciona</option>
                  {channels
                    .filter((channel) => channel.activo || channel.id === saleForm.canal_venta_id)
                    .map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.nombre}
                      </option>
                    ))}
                </select>
                {saleFormErrors.canal_venta_id ? (
                  <span className="field-error">{saleFormErrors.canal_venta_id}</span>
                ) : null}
              </label>

              <label className="field form-span-full">
                Observaciones
                <textarea
                  rows={2}
                  value={saleForm.observaciones}
                  disabled={modalReadOnly}
                  onChange={(event) => setSaleForm((current) => ({
                    ...current,
                    observaciones: event.target.value,
                  }))}
                />
              </label>
            </div>

            <div className="sale-lines-heading">
              <div>
                <strong>Productos de la venta</strong>
                <span>El costo se captura automáticamente desde el catálogo.</span>
              </div>
              {!modalReadOnly ? (
                <button
                  type="button"
                  className="button button-secondary button-compact"
                  onClick={addProductLine}
                >
                  Agregar producto
                </button>
              ) : null}
            </div>

            {saleFormErrors.lines ? (
              <section className="alert alert-error">{saleFormErrors.lines}</section>
            ) : null}

            {saleForm.lines.length === 0 ? (
              <div className="empty-state sale-lines-empty">
                <strong>Sin productos</strong>
                <span>Agrega al menos una línea para guardar la venta.</span>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table sale-lines-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Stock</th>
                      <th>Cantidad</th>
                      <th>Precio</th>
                      <th>Descuento</th>
                      <th>Total línea</th>
                      {!modalReadOnly ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {saleForm.lines.map((line) => {
                      const product = productsMap.get(line.producto_id)
                      const quantity = Number(line.cantidad) || 0
                      const price = Number(line.precio_unitario) || 0
                      const discount = Number(line.descuento_linea) || 0
                      const lineTotal = Math.max(
                        0,
                        roundMoney(quantity * price - discount),
                      )

                      return (
                        <tr key={line.key}>
                          <td>
                            <select
                              className="table-input product-select"
                              value={line.producto_id}
                              disabled={modalReadOnly}
                              onChange={(event) => updateLine(
                                line.key,
                                'producto_id',
                                event.target.value,
                              )}
                            >
                              <option value="">Selecciona</option>
                              {products
                                .filter((item) => (
                                  item.activo
                                  || item.id === line.producto_id
                                ))
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.sku} · {item.nombre}
                                  </option>
                                ))}
                            </select>
                            {product ? (
                              <small>{product.unidad_medida}</small>
                            ) : null}
                          </td>
                          <td>
                            <span className={
                              quantity > stockForProduct(line.producto_id)
                                ? 'stock-warning'
                                : ''
                            }>
                              {stockForProduct(line.producto_id)}
                            </span>
                          </td>
                          <td>
                            <input
                              className="table-input number-input"
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={line.cantidad}
                              disabled={modalReadOnly}
                              onChange={(event) => updateLine(
                                line.key,
                                'cantidad',
                                event.target.value,
                              )}
                            />
                          </td>
                          <td>
                            <input
                              className="table-input number-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.precio_unitario}
                              disabled={modalReadOnly}
                              onChange={(event) => updateLine(
                                line.key,
                                'precio_unitario',
                                event.target.value,
                              )}
                            />
                          </td>
                          <td>
                            <input
                              className="table-input number-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.descuento_linea}
                              disabled={modalReadOnly}
                              onChange={(event) => updateLine(
                                line.key,
                                'descuento_linea',
                                event.target.value,
                              )}
                            />
                          </td>
                          <td>{formatMoney(lineTotal, company?.moneda)}</td>
                          {!modalReadOnly ? (
                            <td>
                              <button
                                type="button"
                                className="text-action text-action-danger"
                                onClick={() => removeLine(line.key)}
                              >
                                Quitar
                              </button>
                            </td>
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
              <div><span>IGV ({(effectiveTaxRate * 100).toFixed(0)}%)</span><strong>{formatMoney(calculatedTotals.tax, company?.moneda)}</strong></div>
              <div className="sale-grand-total"><span>Total</span><strong>{formatMoney(calculatedTotals.total, company?.moneda)}</strong></div>
            </div>

            {saleModal.sale?.estado === 'ANULADA' && saleModal.sale.motivo_anulacion ? (
              <section className="alert alert-error sale-annul-note">
                <strong>Motivo de anulación</strong>
                <span>{saleModal.sale.motivo_anulacion}</span>
              </section>
            ) : null}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(annullingSale)}
        title={`Anular ${annullingSale?.codigo ?? 'venta'}`}
        description="La anulación devolverá automáticamente el stock de todos los productos."
        onClose={closeAnnulModal}
        footer={
          <>
            <button
              type="button"
              className="button button-secondary"
              disabled={annulSaving}
              onClick={closeAnnulModal}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="annul-sale-form"
              className="button button-primary"
              disabled={annulSaving}
            >
              {annulSaving ? 'Anulando...' : 'Confirmar anulación'}
            </button>
          </>
        }
      >
        <form id="annul-sale-form" onSubmit={(event) => void handleAnnulSale(event)}>
          {annulError ? (
            <section className="alert alert-error">{annulError}</section>
          ) : null}
          <label className="field">
            Motivo de anulación *
            <textarea
              rows={4}
              value={annulReason}
              placeholder="Ej. Pedido cancelado por el cliente"
              onChange={(event) => setAnnulReason(event.target.value)}
            />
          </label>
        </form>
      </Modal>
    </div>
  )
}
