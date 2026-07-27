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
  formatMoney,
  getCatalogErrorMessage,
  sanitizeSearchTerm,
} from '../lib/catalog-utils'
import { supabase } from '../lib/supabase'
import {
  unitOfMeasureLabels,
  type Category,
  type Product,
  type UnitOfMeasure,
} from '../types/catalog'

const PAGE_SIZE = 10

type CatalogTab = 'PRODUCTOS' | 'CATEGORIAS'

interface ProductFormState {
  categoria_id: string
  sku: string
  nombre: string
  descripcion: string
  unidad_medida: UnitOfMeasure
  costo_actual: string
  precio_venta: string
}

interface ProductFormErrors {
  categoria_id?: string
  sku?: string
  nombre?: string
  costo_actual?: string
  precio_venta?: string
}

interface CategoryFormState {
  nombre: string
  descripcion: string
}

interface CategoryFormErrors {
  nombre?: string
}

const emptyProductForm: ProductFormState = {
  categoria_id: '',
  sku: '',
  nombre: '',
  descripcion: '',
  unidad_medida: 'UNIDAD',
  costo_actual: '0.00',
  precio_venta: '0.00',
}

const emptyCategoryForm: CategoryFormState = {
  nombre: '',
  descripcion: '',
}

function productToForm(product: Product): ProductFormState {
  return {
    categoria_id: product.categoria_id,
    sku: product.sku,
    nombre: product.nombre,
    descripcion: product.descripcion ?? '',
    unidad_medida: product.unidad_medida,
    costo_actual: String(product.costo_actual),
    precio_venta: String(product.precio_venta),
  }
}

function validateProductForm(form: ProductFormState): ProductFormErrors {
  const errors: ProductFormErrors = {}

  if (!form.categoria_id) {
    errors.categoria_id = 'Selecciona una categoría.'
  }

  if (!form.sku.trim()) {
    errors.sku = 'Ingresa el SKU del producto.'
  }

  if (!form.nombre.trim()) {
    errors.nombre = 'Ingresa el nombre del producto.'
  }

  const cost = Number(form.costo_actual)
  if (!Number.isFinite(cost) || cost < 0) {
    errors.costo_actual = 'Ingresa un costo mayor o igual a cero.'
  }

  const price = Number(form.precio_venta)
  if (!Number.isFinite(price) || price < 0) {
    errors.precio_venta = 'Ingresa un precio mayor o igual a cero.'
  }

  return errors
}

function validateCategoryForm(form: CategoryFormState): CategoryFormErrors {
  const errors: CategoryFormErrors = {}

  if (form.nombre.trim().length < 2) {
    errors.nombre = 'Ingresa un nombre de categoría válido.'
  }

  return errors
}

export function ProductsPage() {
  const { company, membership } = useAuth()
  const [activeTab, setActiveTab] = useState<CatalogTab>('PRODUCTOS')

  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  const [products, setProducts] = useState<Product[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'TODOS' | 'ACTIVOS' | 'INACTIVOS'
  >('TODOS')
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null)

  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] =
    useState<ProductFormState>(emptyProductForm)
  const [productFormErrors, setProductFormErrors] =
    useState<ProductFormErrors>({})
  const [productFormError, setProductFormError] = useState<string | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [categoryForm, setCategoryForm] =
    useState<CategoryFormState>(emptyCategoryForm)
  const [categoryFormErrors, setCategoryFormErrors] =
    useState<CategoryFormErrors>({})
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null)
  const [savingCategory, setSavingCategory] = useState(false)

  const debouncedSearch = useDebouncedValue(searchInput, 350)
  const canManageCatalog = membership?.rol === 'ADMIN'
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const loadCategories = useCallback(async () => {
    if (!company) return

    setCategoriesLoading(true)

    const { data, error } = await supabase
      .from('categorias')
      .select(
        'id, empresa_id, nombre, descripcion, activo, creado_at, actualizado_at',
      )
      .eq('empresa_id', company.id)
      .order('nombre', { ascending: true })

    if (error) {
      setPageError(error.message)
      setCategories([])
      setCategoriesLoading(false)
      return
    }

    setCategories((data ?? []) as Category[])
    setCategoriesLoading(false)
  }, [company])

  const loadProducts = useCallback(async () => {
    if (!company) return

    setLoading(true)
    setPageError(null)

    let query = supabase
      .from('productos')
      .select(
        'id, empresa_id, categoria_id, sku, nombre, descripcion, unidad_medida, costo_actual, precio_venta, activo, creado_at, actualizado_at',
        { count: 'exact' },
      )
      .eq('empresa_id', company.id)

    const search = sanitizeSearchTerm(debouncedSearch)
    if (search) {
      query = query.or(
        [
          `sku.ilike.%${search}%`,
          `nombre.ilike.%${search}%`,
          `descripcion.ilike.%${search}%`,
        ].join(','),
      )
    }

    if (categoryFilter) {
      query = query.eq('categoria_id', categoryFilter)
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
      .order('nombre', { ascending: true })
      .range(from, to)

    if (error) {
      setPageError(error.message)
      setProducts([])
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

    setProducts((data ?? []) as Product[])
    setTotalItems(nextTotalItems)
    setLoading(false)
  }, [categoryFilter, company, debouncedSearch, page, statusFilter])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadCategories()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadCategories])

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadProducts()
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [loadProducts])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    setPage(1)
  }

  const handleCategoryFilterChange = (value: string) => {
    setCategoryFilter(value)
    setPage(1)
  }

  const handleStatusFilterChange = (
    value: 'TODOS' | 'ACTIVOS' | 'INACTIVOS',
  ) => {
    setStatusFilter(value)
    setPage(1)
  }

  const openCreateProduct = () => {
    setEditingProduct(null)
    setProductForm({
      ...emptyProductForm,
      categoria_id:
        categories.find((category) => category.activo)?.id ?? '',
    })
    setProductFormErrors({})
    setProductFormError(null)
    setProductModalOpen(true)
  }

  const openEditProduct = (product: Product) => {
    setEditingProduct(product)
    setProductForm(productToForm(product))
    setProductFormErrors({})
    setProductFormError(null)
    setProductModalOpen(true)
  }

  const closeProductModal = () => {
    if (savingProduct) return
    setProductModalOpen(false)
  }

  const handleProductSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (!company || !canManageCatalog) return

    const validationErrors = validateProductForm(productForm)
    setProductFormErrors(validationErrors)
    setProductFormError(null)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setSavingProduct(true)

    const payload = {
      categoria_id: productForm.categoria_id,
      sku: productForm.sku.trim(),
      nombre: productForm.nombre.trim(),
      descripcion: cleanOptionalText(productForm.descripcion),
      unidad_medida: productForm.unidad_medida,
      costo_actual: Number(productForm.costo_actual),
      precio_venta: Number(productForm.precio_venta),
    }

    if (editingProduct) {
      const { data, error } = await supabase
        .from('productos')
        .update(payload)
        .eq('id', editingProduct.id)
        .eq('empresa_id', company.id)
        .select('id')
        .maybeSingle()

      if (error) {
        setProductFormError(getCatalogErrorMessage(error, 'producto'))
        setSavingProduct(false)
        return
      }

      if (!data) {
        setProductFormError('No se pudo actualizar el producto.')
        setSavingProduct(false)
        return
      }

      setSuccessMessage('Producto actualizado correctamente.')
    } else {
      const { error } = await supabase.from('productos').insert({
        empresa_id: company.id,
        activo: true,
        ...payload,
      })

      if (error) {
        setProductFormError(getCatalogErrorMessage(error, 'producto'))
        setSavingProduct(false)
        return
      }

      setSuccessMessage('Producto registrado correctamente.')
    }

    setSavingProduct(false)
    setProductModalOpen(false)
    await loadProducts()
  }

  const handleProductStatus = async (product: Product) => {
    if (!company || !canManageCatalog) return

    const nextActive = !product.activo
    const confirmed = window.confirm(
      `¿Seguro que deseas ${nextActive ? 'reactivar' : 'desactivar'} ${product.nombre}?`,
    )

    if (!confirmed) return

    setChangingStatusId(product.id)
    setPageError(null)

    const { data, error } = await supabase
      .from('productos')
      .update({ activo: nextActive })
      .eq('id', product.id)
      .eq('empresa_id', company.id)
      .select('id')
      .maybeSingle()

    if (error) {
      setPageError(getCatalogErrorMessage(error, 'producto'))
      setChangingStatusId(null)
      return
    }

    if (!data) {
      setPageError('No se actualizó el estado del producto.')
      setChangingStatusId(null)
      return
    }

    setSuccessMessage(
      nextActive
        ? 'Producto reactivado correctamente.'
        : 'Producto desactivado correctamente.',
    )
    setChangingStatusId(null)
    await loadProducts()
  }

  const openCreateCategory = () => {
    setEditingCategory(null)
    setCategoryForm(emptyCategoryForm)
    setCategoryFormErrors({})
    setCategoryFormError(null)
    setCategoryModalOpen(true)
  }

  const openEditCategory = (category: Category) => {
    setEditingCategory(category)
    setCategoryForm({
      nombre: category.nombre,
      descripcion: category.descripcion ?? '',
    })
    setCategoryFormErrors({})
    setCategoryFormError(null)
    setCategoryModalOpen(true)
  }

  const closeCategoryModal = () => {
    if (savingCategory) return
    setCategoryModalOpen(false)
  }

  const handleCategorySubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    if (!company || !canManageCatalog) return

    const validationErrors = validateCategoryForm(categoryForm)
    setCategoryFormErrors(validationErrors)
    setCategoryFormError(null)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setSavingCategory(true)

    const payload = {
      nombre: categoryForm.nombre.trim(),
      descripcion: cleanOptionalText(categoryForm.descripcion),
    }

    if (editingCategory) {
      const { data, error } = await supabase
        .from('categorias')
        .update(payload)
        .eq('id', editingCategory.id)
        .eq('empresa_id', company.id)
        .select('id')
        .maybeSingle()

      if (error) {
        setCategoryFormError(getCatalogErrorMessage(error, 'categoría'))
        setSavingCategory(false)
        return
      }

      if (!data) {
        setCategoryFormError('No se pudo actualizar la categoría.')
        setSavingCategory(false)
        return
      }

      setSuccessMessage('Categoría actualizada correctamente.')
    } else {
      const { error } = await supabase.from('categorias').insert({
        empresa_id: company.id,
        activo: true,
        ...payload,
      })

      if (error) {
        setCategoryFormError(getCatalogErrorMessage(error, 'categoría'))
        setSavingCategory(false)
        return
      }

      setSuccessMessage('Categoría registrada correctamente.')
    }

    setSavingCategory(false)
    setCategoryModalOpen(false)
    await loadCategories()
    await loadProducts()
  }

  const handleCategoryStatus = async (category: Category) => {
    if (!company || !canManageCatalog) return

    const nextActive = !category.activo
    const confirmed = window.confirm(
      `¿Seguro que deseas ${nextActive ? 'reactivar' : 'desactivar'} la categoría ${category.nombre}?`,
    )

    if (!confirmed) return

    setChangingStatusId(category.id)
    setPageError(null)

    const { data, error } = await supabase
      .from('categorias')
      .update({ activo: nextActive })
      .eq('id', category.id)
      .eq('empresa_id', company.id)
      .select('id')
      .maybeSingle()

    if (error) {
      setPageError(getCatalogErrorMessage(error, 'categoría'))
      setChangingStatusId(null)
      return
    }

    if (!data) {
      setPageError('No se actualizó el estado de la categoría.')
      setChangingStatusId(null)
      return
    }

    setSuccessMessage(
      nextActive
        ? 'Categoría reactivada correctamente.'
        : 'Categoría desactivada correctamente.',
    )
    setChangingStatusId(null)
    await loadCategories()
  }

  const statusSummary = useMemo(() => {
    if (loading) return 'Consultando productos...'
    return `${totalItems} ${totalItems === 1 ? 'producto encontrado' : 'productos encontrados'}`
  }, [loading, totalItems])

  return (
    <div className="page-stack">
      <section className="panel data-page-panel">
        <div className="data-page-header">
          <div>
            <span className="eyebrow">Catálogo comercial</span>
            <h2>Productos y categorías</h2>
            <p>
              Consulta el catálogo. Solo el administrador puede crear,
              modificar o cambiar estados.
            </p>
          </div>

          {canManageCatalog ? (
            <div className="button-row">
              {activeTab === 'PRODUCTOS' ? (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={openCreateProduct}
                >
                  Nuevo producto
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={openCreateCategory}
                >
                  Nueva categoría
                </button>
              )}
            </div>
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

        <div className="data-tabs" role="tablist" aria-label="Catálogo">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'PRODUCTOS'}
            className={activeTab === 'PRODUCTOS' ? 'data-tab active' : 'data-tab'}
            onClick={() => setActiveTab('PRODUCTOS')}
          >
            Productos
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'CATEGORIAS'}
            className={activeTab === 'CATEGORIAS' ? 'data-tab active' : 'data-tab'}
            onClick={() => setActiveTab('CATEGORIAS')}
          >
            Categorías
          </button>
        </div>

        {activeTab === 'PRODUCTOS' ? (
          <>
            <div className="data-toolbar">
              <label className="search-control">
                <span>Buscar</span>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="SKU, nombre o descripción"
                />
              </label>

              <label className="filter-control filter-wide">
                <span>Categoría</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => handleCategoryFilterChange(event.target.value)}
                  disabled={categoriesLoading}
                >
                  <option value="">Todas</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nombre}
                      {category.activo ? '' : ' (inactiva)'}
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
                      event.target.value as
                        | 'TODOS'
                        | 'ACTIVOS'
                        | 'INACTIVOS',
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
              <strong>Catálogo de productos</strong>
              <span>{statusSummary}</span>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Unidad</th>
                    <th>Costo</th>
                    <th>Precio</th>
                    <th>Estado</th>
                    <th>Actualización</th>
                    {canManageCatalog ? <th>Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={canManageCatalog ? 8 : 7}>
                        <div className="table-message">Cargando productos...</div>
                      </td>
                    </tr>
                  ) : null}

                  {!loading && products.length === 0 ? (
                    <tr>
                      <td colSpan={canManageCatalog ? 8 : 7}>
                        <div className="empty-state">
                          <strong>No se encontraron productos</strong>
                          <span>
                            Ajusta los filtros o registra el primer producto.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {!loading
                    ? products.map((product) => {
                        const category = categoryMap.get(product.categoria_id)

                        return (
                          <tr key={product.id}>
                            <td>
                              <div className="primary-cell">
                                <strong>{product.nombre}</strong>
                                <span>SKU: {product.sku}</span>
                              </div>
                            </td>
                            <td>{category?.nombre ?? 'Sin categoría'}</td>
                            <td>{unitOfMeasureLabels[product.unidad_medida]}</td>
                            <td>{formatMoney(product.costo_actual, company?.moneda)}</td>
                            <td>{formatMoney(product.precio_venta, company?.moneda)}</td>
                            <td>
                              <StatusBadge active={product.activo} />
                            </td>
                            <td>{formatDateTime(product.actualizado_at)}</td>
                            {canManageCatalog ? (
                              <td>
                                <div className="row-actions">
                                  <button
                                    type="button"
                                    className="text-action"
                                    onClick={() => openEditProduct(product)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      product.activo
                                        ? 'text-action text-action-danger'
                                        : 'text-action'
                                    }
                                    disabled={changingStatusId === product.id}
                                    onClick={() => void handleProductStatus(product)}
                                  >
                                    {changingStatusId === product.id
                                      ? 'Procesando...'
                                      : product.activo
                                        ? 'Desactivar'
                                        : 'Reactivar'}
                                  </button>
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        )
                      })
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
          </>
        ) : (
          <>
            <div className="data-table-heading category-heading">
              <div>
                <strong>Categorías comerciales</strong>
                <span>
                  {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'}
                </span>
              </div>
              {!canManageCatalog ? (
                <span className="read-only-note">Vista de solo lectura</span>
              ) : null}
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th>Estado</th>
                    <th>Actualización</th>
                    {canManageCatalog ? <th>Acciones</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {categoriesLoading ? (
                    <tr>
                      <td colSpan={canManageCatalog ? 5 : 4}>
                        <div className="table-message">Cargando categorías...</div>
                      </td>
                    </tr>
                  ) : null}

                  {!categoriesLoading && categories.length === 0 ? (
                    <tr>
                      <td colSpan={canManageCatalog ? 5 : 4}>
                        <div className="empty-state">
                          <strong>No hay categorías registradas</strong>
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {!categoriesLoading
                    ? categories.map((category) => (
                        <tr key={category.id}>
                          <td>
                            <div className="primary-cell">
                              <strong>{category.nombre}</strong>
                            </div>
                          </td>
                          <td>{category.descripcion ?? 'Sin descripción'}</td>
                          <td>
                            <StatusBadge active={category.activo} />
                          </td>
                          <td>{formatDateTime(category.actualizado_at)}</td>
                          {canManageCatalog ? (
                            <td>
                              <div className="row-actions">
                                <button
                                  type="button"
                                  className="text-action"
                                  onClick={() => openEditCategory(category)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className={
                                    category.activo
                                      ? 'text-action text-action-danger'
                                      : 'text-action'
                                  }
                                  disabled={changingStatusId === category.id}
                                  onClick={() => void handleCategoryStatus(category)}
                                >
                                  {changingStatusId === category.id
                                    ? 'Procesando...'
                                    : category.activo
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
          </>
        )}
      </section>

      <Modal
        open={productModalOpen}
        title={editingProduct ? 'Editar producto' : 'Nuevo producto'}
        description="Los precios y costos se guardan con dos decimales."
        size="large"
        onClose={closeProductModal}
        footer={
          <>
            <button
              type="button"
              className="button button-secondary"
              disabled={savingProduct}
              onClick={closeProductModal}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="product-form"
              className="button button-primary"
              disabled={savingProduct}
            >
              {savingProduct ? 'Guardando...' : 'Guardar producto'}
            </button>
          </>
        }
      >
        <form id="product-form" onSubmit={handleProductSubmit}>
          {productFormError ? (
            <div className="alert alert-error" role="alert">
              {productFormError}
            </div>
          ) : null}

          <div className="form-grid">
            <label className="field form-span-2">
              <span>Nombre del producto *</span>
              <input
                type="text"
                value={productForm.nombre}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    nombre: event.target.value,
                  }))
                }
                maxLength={200}
                disabled={savingProduct}
              />
              {productFormErrors.nombre ? (
                <small className="field-error">{productFormErrors.nombre}</small>
              ) : null}
            </label>

            <label className="field">
              <span>SKU *</span>
              <input
                type="text"
                value={productForm.sku}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    sku: event.target.value,
                  }))
                }
                maxLength={60}
                disabled={savingProduct}
              />
              {productFormErrors.sku ? (
                <small className="field-error">{productFormErrors.sku}</small>
              ) : null}
            </label>

            <label className="field">
              <span>Categoría *</span>
              <select
                value={productForm.categoria_id}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    categoria_id: event.target.value,
                  }))
                }
                disabled={savingProduct || categoriesLoading}
              >
                <option value="">Selecciona una categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nombre}
                    {category.activo ? '' : ' (inactiva)'}
                  </option>
                ))}
              </select>
              {productFormErrors.categoria_id ? (
                <small className="field-error">
                  {productFormErrors.categoria_id}
                </small>
              ) : null}
            </label>

            <label className="field">
              <span>Unidad de medida *</span>
              <select
                value={productForm.unidad_medida}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    unidad_medida: event.target.value as UnitOfMeasure,
                  }))
                }
                disabled={savingProduct}
              >
                {Object.entries(unitOfMeasureLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Costo actual *</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={productForm.costo_actual}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    costo_actual: event.target.value,
                  }))
                }
                disabled={savingProduct}
              />
              {productFormErrors.costo_actual ? (
                <small className="field-error">
                  {productFormErrors.costo_actual}
                </small>
              ) : null}
            </label>

            <label className="field">
              <span>Precio de venta *</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={productForm.precio_venta}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    precio_venta: event.target.value,
                  }))
                }
                disabled={savingProduct}
              />
              {productFormErrors.precio_venta ? (
                <small className="field-error">
                  {productFormErrors.precio_venta}
                </small>
              ) : null}
            </label>

            <label className="field form-span-full">
              <span>Descripción</span>
              <textarea
                rows={3}
                value={productForm.descripcion}
                onChange={(event) =>
                  setProductForm((current) => ({
                    ...current,
                    descripcion: event.target.value,
                  }))
                }
                disabled={savingProduct}
              />
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        open={categoryModalOpen}
        title={editingCategory ? 'Editar categoría' : 'Nueva categoría'}
        description="El nombre no puede repetirse dentro de la empresa."
        onClose={closeCategoryModal}
        footer={
          <>
            <button
              type="button"
              className="button button-secondary"
              disabled={savingCategory}
              onClick={closeCategoryModal}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="category-form"
              className="button button-primary"
              disabled={savingCategory}
            >
              {savingCategory ? 'Guardando...' : 'Guardar categoría'}
            </button>
          </>
        }
      >
        <form id="category-form" onSubmit={handleCategorySubmit}>
          {categoryFormError ? (
            <div className="alert alert-error" role="alert">
              {categoryFormError}
            </div>
          ) : null}

          <div className="form-grid form-grid-single">
            <label className="field">
              <span>Nombre *</span>
              <input
                type="text"
                value={categoryForm.nombre}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    nombre: event.target.value,
                  }))
                }
                maxLength={120}
                disabled={savingCategory}
              />
              {categoryFormErrors.nombre ? (
                <small className="field-error">{categoryFormErrors.nombre}</small>
              ) : null}
            </label>

            <label className="field">
              <span>Descripción</span>
              <textarea
                rows={4}
                value={categoryForm.descripcion}
                onChange={(event) =>
                  setCategoryForm((current) => ({
                    ...current,
                    descripcion: event.target.value,
                  }))
                }
                disabled={savingCategory}
              />
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}
