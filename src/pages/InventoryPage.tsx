import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { InventoryStatusBadge } from '../components/InventoryStatusBadge'
import { Modal } from '../components/Modal'
import { MovementTypeBadge } from '../components/MovementTypeBadge'
import { Pagination } from '../components/Pagination'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  formatDateTime,
  formatMoney,
  sanitizeSearchTerm,
} from '../lib/catalog-utils'
import {
  formatQuantity,
  getInventoryErrorMessage,
  getInventoryStockStatus,
  movementDirection,
} from '../lib/inventory-utils'
import { dateEndExclusiveToIso, dateStartToIso } from '../lib/sales-utils'
import { supabase } from '../lib/supabase'
import type { Category, Product } from '../types/catalog'
import {
  inventoryMovementLabels,
  type InventoryMovement,
  type InventoryMovementRpcResult,
  type InventoryMovementType,
  type InventoryStock,
  type InventoryStockStatus,
  type ManualInventoryMovementType,
  type StockMinimumRpcResult,
} from '../types/inventory'
import type { Warehouse } from '../types/sales'

const STOCK_PAGE_SIZE = 10
const MOVEMENT_PAGE_SIZE = 12

type InventoryTab = 'STOCK' | 'KARDEX'

interface StockViewRow {
  inventory: InventoryStock
  product: Product
  warehouse: Warehouse
  category: Category | null
  status: InventoryStockStatus
  valuation: number
}

interface MovementFormState {
  almacen_id: string
  producto_id: string
  tipo_movimiento: ManualInventoryMovementType
  cantidad: string
  motivo: string
}

interface MinimumFormState {
  almacen_id: string
  producto_id: string
  stock_minimo: string
}

const emptyMovementForm: MovementFormState = {
  almacen_id: '',
  producto_id: '',
  tipo_movimiento: 'ENTRADA',
  cantidad: '',
  motivo: '',
}

const emptyMinimumForm: MinimumFormState = {
  almacen_id: '',
  producto_id: '',
  stock_minimo: '',
}

export function InventoryPage() {
  const { company, membership } = useAuth()

  const [activeTab, setActiveTab] = useState<InventoryTab>('STOCK')
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [inventory, setInventory] = useState<InventoryStock[]>([])
  const [referencesLoading, setReferencesLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [stockSearch, setStockSearch] = useState('')
  const [stockWarehouseFilter, setStockWarehouseFilter] = useState('')
  const [stockCategoryFilter, setStockCategoryFilter] = useState('')
  const [stockStatusFilter, setStockStatusFilter] =
    useState<InventoryStockStatus | ''>('')
  const [stockPage, setStockPage] = useState(1)

  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [movementTotalItems, setMovementTotalItems] = useState(0)
  const [movementPage, setMovementPage] = useState(1)
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementWarehouseFilter, setMovementWarehouseFilter] = useState('')
  const [movementProductFilter, setMovementProductFilter] = useState('')
  const [movementTypeFilter, setMovementTypeFilter] =
    useState<InventoryMovementType | ''>('')
  const [movementDateFrom, setMovementDateFrom] = useState('')
  const [movementDateTo, setMovementDateTo] = useState('')

  const [movementModalOpen, setMovementModalOpen] = useState(false)
  const [movementForm, setMovementForm] =
    useState<MovementFormState>(emptyMovementForm)
  const [movementFormError, setMovementFormError] = useState<string | null>(null)
  const [savingMovement, setSavingMovement] = useState(false)

  const [minimumModalOpen, setMinimumModalOpen] = useState(false)
  const [minimumForm, setMinimumForm] =
    useState<MinimumFormState>(emptyMinimumForm)
  const [minimumFormError, setMinimumFormError] = useState<string | null>(null)
  const [savingMinimum, setSavingMinimum] = useState(false)

  const debouncedStockSearch = useDebouncedValue(stockSearch, 300)

  const canOperateInventory = Boolean(
    membership && ['ADMIN', 'ALMACEN'].includes(membership.rol),
  )

  const productsMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  )

  const categoriesMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const warehousesMap = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  )

  const inventoryMap = useMemo(
    () => new Map(
      inventory.map((item) => [
        `${item.almacen_id}:${item.producto_id}`,
        item,
      ]),
    ),
    [inventory],
  )

  const loadInventoryData = useCallback(async () => {
    if (!company) return

    setReferencesLoading(true)
    setPageError(null)

    const [productsResult, categoriesResult, warehousesResult, inventoryResult] =
      await Promise.all([
        supabase
          .from('productos')
          .select(
            'id, empresa_id, categoria_id, sku, nombre, descripcion, unidad_medida, costo_actual, precio_venta, activo, creado_at, actualizado_at',
          )
          .eq('empresa_id', company.id)
          .order('nombre', { ascending: true }),
        supabase
          .from('categorias')
          .select(
            'id, empresa_id, nombre, descripcion, activo, creado_at, actualizado_at',
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
          .from('existencias_producto')
          .select(
            'id, almacen_id, producto_id, stock_actual, stock_minimo, actualizado_at',
          ),
      ])

    const firstError = [
      productsResult.error,
      categoriesResult.error,
      warehousesResult.error,
      inventoryResult.error,
    ].find(Boolean)

    if (firstError) {
      setPageError(firstError.message)
      setReferencesLoading(false)
      return
    }

    setProducts((productsResult.data ?? []) as Product[])
    setCategories((categoriesResult.data ?? []) as Category[])
    setWarehouses((warehousesResult.data ?? []) as Warehouse[])
    setInventory((inventoryResult.data ?? []) as InventoryStock[])
    setReferencesLoading(false)
  }, [company])

  const loadMovements = useCallback(async () => {
    if (!company) return

    setMovementsLoading(true)
    setPageError(null)

    let query = supabase
      .from('movimientos_inventario')
      .select(
        'id, empresa_id, almacen_id, producto_id, venta_id, compra_id, usuario_empresa_id, tipo_movimiento, cantidad, stock_anterior, stock_resultante, motivo, fecha_movimiento, creado_at',
        { count: 'exact' },
      )
      .eq('empresa_id', company.id)

    if (movementWarehouseFilter) {
      query = query.eq('almacen_id', movementWarehouseFilter)
    }
    if (movementProductFilter) {
      query = query.eq('producto_id', movementProductFilter)
    }
    if (movementTypeFilter) {
      query = query.eq('tipo_movimiento', movementTypeFilter)
    }

    const fromIso = dateStartToIso(movementDateFrom)
    if (fromIso) query = query.gte('fecha_movimiento', fromIso)

    const toIso = dateEndExclusiveToIso(movementDateTo)
    if (toIso) query = query.lt('fecha_movimiento', toIso)

    const from = (movementPage - 1) * MOVEMENT_PAGE_SIZE
    const to = from + MOVEMENT_PAGE_SIZE - 1

    const { data, error, count } = await query
      .order('fecha_movimiento', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)

    if (error) {
      setPageError(error.message)
      setMovements([])
      setMovementTotalItems(0)
      setMovementsLoading(false)
      return
    }

    const nextTotalItems = count ?? 0
    const nextTotalPages = Math.max(
      1,
      Math.ceil(nextTotalItems / MOVEMENT_PAGE_SIZE),
    )

    if (movementPage > nextTotalPages) {
      setMovementPage(nextTotalPages)
      setMovementsLoading(false)
      return
    }

    setMovements((data ?? []) as InventoryMovement[])
    setMovementTotalItems(nextTotalItems)
    setMovementsLoading(false)
  }, [
    company,
    movementDateFrom,
    movementDateTo,
    movementPage,
    movementProductFilter,
    movementTypeFilter,
    movementWarehouseFilter,
  ])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadInventoryData()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadInventoryData])

  useEffect(() => {
    if (activeTab !== 'KARDEX') return

    const timerId = window.setTimeout(() => {
      void loadMovements()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [activeTab, loadMovements])

  const stockRows = useMemo<StockViewRow[]>(() => {
    const rows: StockViewRow[] = []

    for (const item of inventory) {
      const product = productsMap.get(item.producto_id)
      const warehouse = warehousesMap.get(item.almacen_id)

      if (!product || !warehouse || !product.activo || !warehouse.activo) {
        continue
      }

      rows.push({
        inventory: item,
        product,
        warehouse,
        category: categoriesMap.get(product.categoria_id) ?? null,
        status: getInventoryStockStatus(
          Number(item.stock_actual),
          Number(item.stock_minimo),
        ),
        valuation: Number(item.stock_actual) * Number(product.costo_actual),
      })
    }

    return rows.sort((left, right) =>
      left.product.nombre.localeCompare(right.product.nombre, 'es'),
    )
  }, [categoriesMap, inventory, productsMap, warehousesMap])

  const inventoryMetrics = useMemo(() => {
    return stockRows.reduce(
      (summary, row) => {
        summary.total += 1
        summary.valuation += row.valuation

        if (row.status === 'AGOTADO') summary.outOfStock += 1
        if (row.status === 'CRITICO') summary.critical += 1
        if (row.status === 'NORMAL') summary.normal += 1

        return summary
      },
      {
        total: 0,
        normal: 0,
        critical: 0,
        outOfStock: 0,
        valuation: 0,
      },
    )
  }, [stockRows])

  const filteredStockRows = useMemo(() => {
    const search = sanitizeSearchTerm(debouncedStockSearch).toLowerCase()

    return stockRows.filter((row) => {
      if (
        search
        && !`${row.product.sku} ${row.product.nombre} ${row.category?.nombre ?? ''}`
          .toLowerCase()
          .includes(search)
      ) {
        return false
      }

      if (
        stockWarehouseFilter
        && row.warehouse.id !== stockWarehouseFilter
      ) {
        return false
      }

      if (
        stockCategoryFilter
        && row.product.categoria_id !== stockCategoryFilter
      ) {
        return false
      }

      if (stockStatusFilter && row.status !== stockStatusFilter) {
        return false
      }

      return true
    })
  }, [
    debouncedStockSearch,
    stockCategoryFilter,
    stockRows,
    stockStatusFilter,
    stockWarehouseFilter,
  ])

  const stockTotalPages = Math.max(
    1,
    Math.ceil(filteredStockRows.length / STOCK_PAGE_SIZE),
  )
  const effectiveStockPage = Math.min(stockPage, stockTotalPages)
  const visibleStockRows = filteredStockRows.slice(
    (effectiveStockPage - 1) * STOCK_PAGE_SIZE,
    effectiveStockPage * STOCK_PAGE_SIZE,
  )

  const movementTotalPages = Math.max(
    1,
    Math.ceil(movementTotalItems / MOVEMENT_PAGE_SIZE),
  )

  const resetStockPage = () => setStockPage(1)
  const resetMovementPage = () => setMovementPage(1)

  const openMovementModal = (row?: StockViewRow) => {
    const defaultWarehouseId =
      row?.warehouse.id
      ?? warehouses.find((warehouse) => warehouse.activo && warehouse.es_principal)?.id
      ?? warehouses.find((warehouse) => warehouse.activo)?.id
      ?? ''

    const defaultProductId =
      row?.product.id
      ?? products.find((product) => product.activo)?.id
      ?? ''

    setMovementForm({
      ...emptyMovementForm,
      almacen_id: defaultWarehouseId,
      producto_id: defaultProductId,
    })
    setMovementFormError(null)
    setMovementModalOpen(true)
  }

  const closeMovementModal = () => {
    if (savingMovement) return
    setMovementModalOpen(false)
    setMovementFormError(null)
  }

  const selectedMovementStock = inventoryMap.get(
    `${movementForm.almacen_id}:${movementForm.producto_id}`,
  )

  const movementPreview = useMemo(() => {
    const current = Number(selectedMovementStock?.stock_actual ?? 0)
    const quantity = Number(movementForm.cantidad)

    if (!Number.isFinite(quantity) || quantity <= 0) return current

    return movementDirection(movementForm.tipo_movimiento) === 'DECREASE'
      ? current - quantity
      : current + quantity
  }, [movementForm.cantidad, movementForm.tipo_movimiento, selectedMovementStock])

  const submitMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!company || !canOperateInventory) return

    const quantity = Number(movementForm.cantidad)
    const reason = movementForm.motivo.trim()

    if (!movementForm.almacen_id) {
      setMovementFormError('Selecciona un almacén.')
      return
    }
    if (!movementForm.producto_id) {
      setMovementFormError('Selecciona un producto.')
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMovementFormError('La cantidad debe ser mayor que cero.')
      return
    }
    if (!reason) {
      setMovementFormError('Ingresa el motivo del movimiento.')
      return
    }
    if (
      movementForm.tipo_movimiento === 'AJUSTE_NEGATIVO'
      && quantity > Number(selectedMovementStock?.stock_actual ?? 0)
    ) {
      setMovementFormError('El ajuste negativo supera el stock disponible.')
      return
    }

    setSavingMovement(true)
    setMovementFormError(null)

    const { data, error } = await supabase.rpc(
      'registrar_movimiento_inventario',
      {
        p_empresa_id: company.id,
        p_almacen_id: movementForm.almacen_id,
        p_producto_id: movementForm.producto_id,
        p_tipo_movimiento: movementForm.tipo_movimiento,
        p_cantidad: quantity,
        p_motivo: reason,
      },
    )

    if (error) {
      setMovementFormError(getInventoryErrorMessage(error))
      setSavingMovement(false)
      return
    }

    const result = ((data ?? []) as InventoryMovementRpcResult[])[0]
    const product = productsMap.get(movementForm.producto_id)

    setSuccessMessage(
      `${inventoryMovementLabels[movementForm.tipo_movimiento]} registrada para ${product?.nombre ?? 'el producto'}. Stock resultante: ${formatQuantity(Number(result?.stock_resultante ?? movementPreview))}.`,
    )
    setMovementModalOpen(false)
    setSavingMovement(false)
    await loadInventoryData()

    if (activeTab === 'KARDEX') {
      await loadMovements()
    }
  }

  const openMinimumModal = (row: StockViewRow) => {
    setMinimumForm({
      almacen_id: row.warehouse.id,
      producto_id: row.product.id,
      stock_minimo: String(Number(row.inventory.stock_minimo)),
    })
    setMinimumFormError(null)
    setMinimumModalOpen(true)
  }

  const closeMinimumModal = () => {
    if (savingMinimum) return
    setMinimumModalOpen(false)
    setMinimumFormError(null)
  }

  const submitMinimum = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!company || !canOperateInventory) return

    const minimum = Number(minimumForm.stock_minimo)

    if (!Number.isFinite(minimum) || minimum < 0) {
      setMinimumFormError('El stock mínimo debe ser mayor o igual a cero.')
      return
    }

    setSavingMinimum(true)
    setMinimumFormError(null)

    const { data, error } = await supabase.rpc('actualizar_stock_minimo', {
      p_empresa_id: company.id,
      p_almacen_id: minimumForm.almacen_id,
      p_producto_id: minimumForm.producto_id,
      p_stock_minimo: minimum,
    })

    if (error) {
      setMinimumFormError(getInventoryErrorMessage(error))
      setSavingMinimum(false)
      return
    }

    const result = ((data ?? []) as StockMinimumRpcResult[])[0]
    const product = productsMap.get(minimumForm.producto_id)

    setSuccessMessage(
      `Stock mínimo de ${product?.nombre ?? 'el producto'} actualizado a ${formatQuantity(Number(result?.stock_minimo ?? minimum))}.`,
    )
    setMinimumModalOpen(false)
    setSavingMinimum(false)
    await loadInventoryData()
  }

  const switchTab = (tab: InventoryTab) => {
    setActiveTab(tab)
    setSuccessMessage(null)
  }

  return (
    <div className="page-stack">
      <section className="panel data-page-panel">
        <header className="data-page-header">
          <div>
            <span className="eyebrow">Control operativo</span>
            <h2>Inventario y Kardex</h2>
            <p>
              Consulta existencias, define mínimos y registra entradas o ajustes
              sin alterar el historial generado por ventas.
            </p>
          </div>

          {canOperateInventory ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => openMovementModal()}
              disabled={referencesLoading}
            >
              Registrar movimiento
            </button>
          ) : (
            <span className="read-only-note">Acceso de solo lectura</span>
          )}
        </header>

        {pageError ? (
          <section className="alert alert-error">
            <strong>No se pudo cargar el inventario.</strong>
            <span>{pageError}</span>
          </section>
        ) : null}

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

        <section className="inventory-metric-grid">
          <article className="metric-card">
            <span>Existencias</span>
            <strong>{referencesLoading ? '...' : inventoryMetrics.total}</strong>
            <small>Producto por almacén</small>
          </article>
          <article className="metric-card">
            <span>Stock normal</span>
            <strong>{referencesLoading ? '...' : inventoryMetrics.normal}</strong>
            <small>Por encima del mínimo</small>
          </article>
          <article className="metric-card metric-card-warning">
            <span>Stock crítico</span>
            <strong>{referencesLoading ? '...' : inventoryMetrics.critical}</strong>
            <small>Igual o menor al mínimo</small>
          </article>
          <article className="metric-card metric-card-danger">
            <span>Agotados</span>
            <strong>{referencesLoading ? '...' : inventoryMetrics.outOfStock}</strong>
            <small>Stock actual en cero</small>
          </article>
          <article className="metric-card">
            <span>Valorización</span>
            <strong>
              {referencesLoading
                ? '...'
                : formatMoney(inventoryMetrics.valuation, company?.moneda)}
            </strong>
            <small>Stock × costo actual</small>
          </article>
        </section>

        <div className="data-tabs" role="tablist" aria-label="Inventario">
          <button
            type="button"
            className={`data-tab ${activeTab === 'STOCK' ? 'active' : ''}`}
            onClick={() => switchTab('STOCK')}
          >
            Existencias
          </button>
          <button
            type="button"
            className={`data-tab ${activeTab === 'KARDEX' ? 'active' : ''}`}
            onClick={() => switchTab('KARDEX')}
          >
            Kardex
          </button>
        </div>

        {activeTab === 'STOCK' ? (
          <>
            <section className="inventory-toolbar">
              <label className="filter-control search-control">
                <span>Buscar</span>
                <input
                  type="search"
                  value={stockSearch}
                  placeholder="SKU, producto o categoría"
                  onChange={(event) => {
                    setStockSearch(event.target.value)
                    resetStockPage()
                  }}
                />
              </label>

              <label className="filter-control">
                <span>Almacén</span>
                <select
                  value={stockWarehouseFilter}
                  onChange={(event) => {
                    setStockWarehouseFilter(event.target.value)
                    resetStockPage()
                  }}
                >
                  <option value="">Todos</option>
                  {warehouses.filter((warehouse) => warehouse.activo).map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter-control">
                <span>Categoría</span>
                <select
                  value={stockCategoryFilter}
                  onChange={(event) => {
                    setStockCategoryFilter(event.target.value)
                    resetStockPage()
                  }}
                >
                  <option value="">Todas</option>
                  {categories.filter((category) => category.activo).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter-control">
                <span>Estado</span>
                <select
                  value={stockStatusFilter}
                  onChange={(event) => {
                    setStockStatusFilter(
                      event.target.value as InventoryStockStatus | '',
                    )
                    resetStockPage()
                  }}
                >
                  <option value="">Todos</option>
                  <option value="NORMAL">Normal</option>
                  <option value="CRITICO">Stock crítico</option>
                  <option value="AGOTADO">Agotado</option>
                </select>
              </label>
            </section>

            <div className="data-table-heading">
              <div>
                <h3>Existencias actuales</h3>
                <span>
                  {filteredStockRows.length}{' '}
                  {filteredStockRows.length === 1
                    ? 'existencia encontrada'
                    : 'existencias encontradas'}
                </span>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table inventory-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Almacén</th>
                    <th>Categoría</th>
                    <th>Stock actual</th>
                    <th>Stock mínimo</th>
                    <th>Estado</th>
                    <th>Valorización</th>
                    <th>Actualización</th>
                    {canOperateInventory ? <th>Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {referencesLoading ? (
                    <tr>
                      <td colSpan={canOperateInventory ? 9 : 8}>
                        Cargando existencias...
                      </td>
                    </tr>
                  ) : visibleStockRows.length === 0 ? (
                    <tr>
                      <td colSpan={canOperateInventory ? 9 : 8}>
                        No se encontraron existencias con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    visibleStockRows.map((row) => (
                      <tr key={row.inventory.id}>
                        <td>
                          <strong>{row.product.nombre}</strong>
                          <small>SKU: {row.product.sku}</small>
                        </td>
                        <td>{row.warehouse.nombre}</td>
                        <td>{row.category?.nombre ?? 'Sin categoría'}</td>
                        <td className="quantity-cell">
                          {formatQuantity(Number(row.inventory.stock_actual))}
                          <small>{row.product.unidad_medida}</small>
                        </td>
                        <td>
                          {formatQuantity(Number(row.inventory.stock_minimo))}
                        </td>
                        <td>
                          <InventoryStatusBadge status={row.status} />
                        </td>
                        <td>{formatMoney(row.valuation, company?.moneda)}</td>
                        <td>{formatDateTime(row.inventory.actualizado_at)}</td>
                        {canOperateInventory ? (
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="text-action"
                                onClick={() => openMovementModal(row)}
                              >
                                Movimiento
                              </button>
                              <button
                                type="button"
                                className="text-action"
                                onClick={() => openMinimumModal(row)}
                              >
                                Mínimo
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={effectiveStockPage}
              totalPages={stockTotalPages}
              totalItems={filteredStockRows.length}
              onPageChange={setStockPage}
            />
          </>
        ) : (
          <>
            <section className="kardex-toolbar">
              <label className="filter-control">
                <span>Almacén</span>
                <select
                  value={movementWarehouseFilter}
                  onChange={(event) => {
                    setMovementWarehouseFilter(event.target.value)
                    resetMovementPage()
                  }}
                >
                  <option value="">Todos</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter-control kardex-product-filter">
                <span>Producto</span>
                <select
                  value={movementProductFilter}
                  onChange={(event) => {
                    setMovementProductFilter(event.target.value)
                    resetMovementPage()
                  }}
                >
                  <option value="">Todos</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.sku} · {product.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter-control">
                <span>Movimiento</span>
                <select
                  value={movementTypeFilter}
                  onChange={(event) => {
                    setMovementTypeFilter(
                      event.target.value as InventoryMovementType | '',
                    )
                    resetMovementPage()
                  }}
                >
                  <option value="">Todos</option>
                  {Object.entries(inventoryMovementLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="filter-control">
                <span>Desde</span>
                <input
                  type="date"
                  value={movementDateFrom}
                  onChange={(event) => {
                    setMovementDateFrom(event.target.value)
                    resetMovementPage()
                  }}
                />
              </label>

              <label className="filter-control">
                <span>Hasta</span>
                <input
                  type="date"
                  value={movementDateTo}
                  onChange={(event) => {
                    setMovementDateTo(event.target.value)
                    resetMovementPage()
                  }}
                />
              </label>
            </section>

            <div className="data-table-heading">
              <div>
                <h3>Historial de movimientos</h3>
                <span>
                  {movementTotalItems}{' '}
                  {movementTotalItems === 1
                    ? 'movimiento encontrado'
                    : 'movimientos encontrados'}
                </span>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table kardex-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Almacén</th>
                    <th>Movimiento</th>
                    <th>Cantidad</th>
                    <th>Stock anterior</th>
                    <th>Stock resultante</th>
                    <th>Origen</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {movementsLoading ? (
                    <tr>
                      <td colSpan={9}>Cargando Kardex...</td>
                    </tr>
                  ) : movements.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        No se encontraron movimientos con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    movements.map((movement) => {
                      const product = productsMap.get(movement.producto_id)
                      const warehouse = warehousesMap.get(movement.almacen_id)

                      return (
                        <tr key={movement.id}>
                          <td>{formatDateTime(movement.fecha_movimiento)}</td>
                          <td>
                            <strong>{product?.nombre ?? 'Producto no disponible'}</strong>
                            <small>SKU: {product?.sku ?? '—'}</small>
                          </td>
                          <td>{warehouse?.nombre ?? 'Almacén no disponible'}</td>
                          <td>
                            <MovementTypeBadge type={movement.tipo_movimiento} />
                          </td>
                          <td>{formatQuantity(Number(movement.cantidad))}</td>
                          <td>{formatQuantity(Number(movement.stock_anterior))}</td>
                          <td>{formatQuantity(Number(movement.stock_resultante))}</td>
                          <td>{movement.venta_id ? 'Venta' : movement.compra_id ? 'Compra' : 'Manual'}</td>
                          <td className="reason-cell">{movement.motivo}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={movementPage}
              totalPages={movementTotalPages}
              totalItems={movementTotalItems}
              onPageChange={setMovementPage}
            />
          </>
        )}
      </section>

      <Modal
        open={movementModalOpen}
        title="Registrar movimiento"
        description="Las entradas y ajustes se guardan en PostgreSQL junto con su Kardex."
        onClose={closeMovementModal}
        footer={
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeMovementModal}
              disabled={savingMovement}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="inventory-movement-form"
              className="button button-primary"
              disabled={savingMovement}
            >
              {savingMovement ? 'Registrando...' : 'Registrar movimiento'}
            </button>
          </>
        }
      >
        <form id="inventory-movement-form" onSubmit={(event) => void submitMovement(event)}>
          {movementFormError ? (
            <section className="alert alert-error inventory-form-alert">
              <span>{movementFormError}</span>
            </section>
          ) : null}

          <div className="form-grid form-grid-single">
            <label className="field">
              <span>Almacén *</span>
              <select
                value={movementForm.almacen_id}
                onChange={(event) => setMovementForm((current) => ({
                  ...current,
                  almacen_id: event.target.value,
                }))}
              >
                <option value="">Selecciona un almacén</option>
                {warehouses.filter((warehouse) => warehouse.activo).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Producto *</span>
              <select
                value={movementForm.producto_id}
                onChange={(event) => setMovementForm((current) => ({
                  ...current,
                  producto_id: event.target.value,
                }))}
              >
                <option value="">Selecciona un producto</option>
                {products.filter((product) => product.activo).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} · {product.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Tipo de movimiento *</span>
              <select
                value={movementForm.tipo_movimiento}
                onChange={(event) => setMovementForm((current) => ({
                  ...current,
                  tipo_movimiento:
                    event.target.value as ManualInventoryMovementType,
                }))}
              >
                <option value="ENTRADA">Entrada</option>
                <option value="AJUSTE_POSITIVO">Ajuste positivo</option>
                <option value="AJUSTE_NEGATIVO">Ajuste negativo</option>
              </select>
            </label>

            <label className="field">
              <span>Cantidad *</span>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={movementForm.cantidad}
                onChange={(event) => setMovementForm((current) => ({
                  ...current,
                  cantidad: event.target.value,
                }))}
                placeholder="0.000"
              />
            </label>

            <label className="field">
              <span>Motivo *</span>
              <textarea
                rows={3}
                value={movementForm.motivo}
                onChange={(event) => setMovementForm((current) => ({
                  ...current,
                  motivo: event.target.value,
                }))}
                placeholder="Ej. Recepción de compra OC-001 o corrección por conteo físico"
              />
            </label>
          </div>

          <section className="movement-preview">
            <div>
              <span>Stock actual</span>
              <strong>
                {formatQuantity(Number(selectedMovementStock?.stock_actual ?? 0))}
              </strong>
            </div>
            <div>
              <span>Stock resultante estimado</span>
              <strong className={movementPreview < 0 ? 'stock-warning' : ''}>
                {formatQuantity(movementPreview)}
              </strong>
            </div>
          </section>
        </form>
      </Modal>

      <Modal
        open={minimumModalOpen}
        title="Actualizar stock mínimo"
        description="El mínimo se utiliza para identificar alertas de reposición."
        onClose={closeMinimumModal}
        footer={
          <>
            <button
              type="button"
              className="button button-secondary"
              onClick={closeMinimumModal}
              disabled={savingMinimum}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="minimum-stock-form"
              className="button button-primary"
              disabled={savingMinimum}
            >
              {savingMinimum ? 'Guardando...' : 'Guardar mínimo'}
            </button>
          </>
        }
      >
        <form id="minimum-stock-form" onSubmit={(event) => void submitMinimum(event)}>
          {minimumFormError ? (
            <section className="alert alert-error inventory-form-alert">
              <span>{minimumFormError}</span>
            </section>
          ) : null}

          <div className="form-grid form-grid-single">
            <label className="field">
              <span>Almacén</span>
              <input
                value={warehousesMap.get(minimumForm.almacen_id)?.nombre ?? ''}
                disabled
              />
            </label>

            <label className="field">
              <span>Producto</span>
              <input
                value={productsMap.get(minimumForm.producto_id)?.nombre ?? ''}
                disabled
              />
            </label>

            <label className="field">
              <span>Stock mínimo *</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={minimumForm.stock_minimo}
                onChange={(event) => setMinimumForm((current) => ({
                  ...current,
                  stock_minimo: event.target.value,
                }))}
              />
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}
