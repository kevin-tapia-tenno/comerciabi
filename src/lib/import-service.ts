import type { PostgrestError } from '@supabase/supabase-js'

import { supabase } from './supabase'
import {
  importCellAsBoolean,
  importCellAsEnum,
  importCellAsNumber,
  importCellAsText,
} from './import-validator'
import type {
  ExecuteImportParams,
  ImportedSpreadsheetRow,
  ImportExecutionResult,
  ImportLoadHistoryItem,
  ImportModule,
  ImportProcessingError,
  ImportProcessingResult,
  ImportStatus,
} from '../types/imports'

const STORAGE_BUCKET = 'archivos-carga'

interface ReferenceRow {
  id: string
  nombre?: string
  nombre_completo?: string
  numero_documento?: string | null
  sku?: string
  precio_venta?: number
  activo?: boolean
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
}

function safeFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? 'xlsx'
  const baseName = fileName.replace(/\.[^.]+$/, '')
  const safeBase = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)

  return `${safeBase || 'archivo'}.${extension}`
}

function getContentType(file: File): string {
  if (file.type) return file.type

  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }

  if (extension === 'xls') return 'application/vnd.ms-excel'
  return 'text/csv'
}

function dbErrorMessage(error: PostgrestError): string {
  if (error.code === '23505') {
    return 'El registro ya existe y entra en conflicto con una restricción única.'
  }

  if (error.code === '23503') {
    return 'Una referencia requerida no existe o no pertenece a la empresa.'
  }

  if (error.code === '23514') {
    return 'Los datos incumplen una regla de negocio de la base de datos.'
  }

  return error.message || 'No se pudo insertar el registro.'
}

function processingError(
  rowNumber: number,
  field: string | null,
  originalValue: string | null,
  errorCode: string,
  errorMessage: string,
): ImportProcessingError {
  return {
    rowNumber,
    field,
    originalValue,
    errorCode,
    errorMessage,
    stage: 'PROCESAMIENTO',
  }
}

async function insertLoadErrors(
  loadId: string,
  errors: ImportProcessingError[],
): Promise<void> {
  if (errors.length === 0) return

  const payload = errors.map((error) => ({
    carga_archivo_id: loadId,
    numero_fila: error.rowNumber,
    campo: error.field,
    valor_original: error.originalValue,
    codigo_error: error.errorCode,
    mensaje_error: error.errorMessage,
  }))

  for (let index = 0; index < payload.length; index += 200) {
    const { error } = await supabase
      .from('errores_carga')
      .insert(payload.slice(index, index + 200))

    if (error) {
      throw new Error(`No se pudieron registrar los errores de carga: ${error.message}`)
    }
  }
}

async function processClients(
  rows: ImportedSpreadsheetRow[],
  companyId: string,
): Promise<ImportProcessingResult> {
  const errors: ImportProcessingError[] = []
  let insertedRows = 0

  for (const row of rows) {
    const values = row.values
    const payload = {
      empresa_id: companyId,
      tipo_cliente: importCellAsEnum(values.tipo_cliente),
      tipo_documento: importCellAsEnum(values.tipo_documento),
      numero_documento: importCellAsText(values.numero_documento),
      nombre_completo: importCellAsText(values.nombre_completo),
      email: importCellAsText(values.email),
      telefono: importCellAsText(values.telefono),
      segmento: importCellAsEnum(values.segmento),
      direccion: importCellAsText(values.direccion),
      activo: importCellAsBoolean(values.activo, true),
    }

    const { error } = await supabase.from('clientes').insert(payload)

    if (error) {
      errors.push(
        processingError(
          row.rowNumber,
          error.code === '23505' ? 'numero_documento' : null,
          importCellAsText(values.numero_documento),
          error.code === '23505' ? 'DUPLICATE_CLIENT' : `DATABASE_${error.code}`,
          dbErrorMessage(error),
        ),
      )
    } else {
      insertedRows += 1
    }
  }

  return { insertedRows, errors }
}

async function processProducts(
  rows: ImportedSpreadsheetRow[],
  companyId: string,
): Promise<ImportProcessingResult> {
  const errors: ImportProcessingError[] = []
  let insertedRows = 0

  const { data: categories, error: categoriesError } = await supabase
    .from('categorias')
    .select('id, nombre, activo')
    .eq('empresa_id', companyId)
    .eq('activo', true)

  if (categoriesError) {
    throw new Error(`No se pudieron consultar las categorías: ${categoriesError.message}`)
  }

  const categoryMap = new Map(
    ((categories ?? []) as ReferenceRow[]).map((category) => [
      normalizeKey(category.nombre),
      category.id,
    ]),
  )

  for (const row of rows) {
    const values = row.values
    const categoryName = importCellAsText(values.categoria)
    const categoryId = categoryMap.get(normalizeKey(categoryName))

    if (!categoryId) {
      errors.push(
        processingError(
          row.rowNumber,
          'categoria',
          categoryName,
          'CATEGORY_NOT_FOUND',
          'La categoría no existe o está inactiva en la empresa.',
        ),
      )
      continue
    }

    const payload = {
      empresa_id: companyId,
      categoria_id: categoryId,
      sku: importCellAsText(values.sku)?.toUpperCase(),
      nombre: importCellAsText(values.nombre),
      descripcion: importCellAsText(values.descripcion),
      unidad_medida: importCellAsEnum(values.unidad_medida),
      costo_actual: importCellAsNumber(values.costo_actual),
      precio_venta: importCellAsNumber(values.precio_venta),
      activo: importCellAsBoolean(values.activo, true),
    }

    const { error } = await supabase.from('productos').insert(payload)

    if (error) {
      errors.push(
        processingError(
          row.rowNumber,
          error.code === '23505' ? 'sku' : null,
          importCellAsText(values.sku),
          error.code === '23505' ? 'DUPLICATE_SKU' : `DATABASE_${error.code}`,
          dbErrorMessage(error),
        ),
      )
    } else {
      insertedRows += 1
    }
  }

  return { insertedRows, errors }
}

interface SaleGroup {
  code: string
  rows: ImportedSpreadsheetRow[]
}

async function processSales(
  rows: ImportedSpreadsheetRow[],
  companyId: string,
  userRole: string,
): Promise<ImportProcessingResult> {
  if (userRole !== 'ADMIN') {
    return {
      insertedRows: 0,
      errors: rows.map((row) =>
        processingError(
          row.rowNumber,
          null,
          null,
          'ROLE_NOT_ALLOWED',
          'Solo un administrador puede ejecutar importaciones masivas de ventas.',
        ),
      ),
    }
  }

  const [clientsResponse, productsResponse, warehousesResponse, channelsResponse] =
    await Promise.all([
      supabase
        .from('clientes')
        .select('id, nombre_completo, numero_documento, activo')
        .eq('empresa_id', companyId)
        .eq('activo', true),
      supabase
        .from('productos')
        .select('id, sku, precio_venta, activo')
        .eq('empresa_id', companyId)
        .eq('activo', true),
      supabase
        .from('almacenes')
        .select('id, nombre, activo')
        .eq('empresa_id', companyId)
        .eq('activo', true),
      supabase
        .from('canales_venta')
        .select('id, nombre, activo')
        .eq('empresa_id', companyId)
        .eq('activo', true),
    ])

  const referenceError =
    clientsResponse.error ??
    productsResponse.error ??
    warehousesResponse.error ??
    channelsResponse.error

  if (referenceError) {
    throw new Error(`No se pudieron consultar las referencias de ventas: ${referenceError.message}`)
  }

  const clients = (clientsResponse.data ?? []) as ReferenceRow[]
  const products = (productsResponse.data ?? []) as ReferenceRow[]
  const warehouses = (warehousesResponse.data ?? []) as ReferenceRow[]
  const channels = (channelsResponse.data ?? []) as ReferenceRow[]

  const clientByDocument = new Map(
    clients
      .filter((client) => client.numero_documento)
      .map((client) => [normalizeKey(client.numero_documento), client.id]),
  )
  const clientByName = new Map(
    clients.map((client) => [normalizeKey(client.nombre_completo), client.id]),
  )
  const productBySku = new Map(
    products.map((product) => [normalizeKey(product.sku), product]),
  )
  const warehouseByName = new Map(
    warehouses.map((warehouse) => [normalizeKey(warehouse.nombre), warehouse.id]),
  )
  const channelByName = new Map(
    channels.map((channel) => [normalizeKey(channel.nombre), channel.id]),
  )

  const groupsMap = new Map<string, SaleGroup>()

  rows.forEach((row) => {
    const code = importCellAsText(row.values.codigo_externo) ?? `FILA-${row.rowNumber}`
    const key = normalizeKey(code)
    const group = groupsMap.get(key) ?? { code, rows: [] }
    group.rows.push(row)
    groupsMap.set(key, group)
  })

  const errors: ImportProcessingError[] = []
  let insertedRows = 0

  for (const group of groupsMap.values()) {
    const firstRow = group.rows[0]
    const customerDocument = importCellAsText(firstRow.values.cliente_documento)
    const customerName = importCellAsText(firstRow.values.cliente_nombre)
    const warehouseName = importCellAsText(firstRow.values.almacen)
    const channelName = importCellAsText(firstRow.values.canal)
    const customerId = customerDocument
      ? clientByDocument.get(normalizeKey(customerDocument))
      : clientByName.get(normalizeKey(customerName))
    const warehouseId = warehouseByName.get(normalizeKey(warehouseName))
    const channelId = channelByName.get(normalizeKey(channelName))

    const groupReferenceError =
      !customerId
        ? 'No se encontró un cliente activo con el documento o nombre indicado.'
        : !warehouseId
          ? 'No se encontró el almacén activo indicado.'
          : !channelId
            ? 'No se encontró el canal de venta activo indicado.'
            : null

    if (groupReferenceError) {
      group.rows.forEach((row) =>
        errors.push(
          processingError(
            row.rowNumber,
            null,
            null,
            'SALE_REFERENCE_NOT_FOUND',
            `${groupReferenceError} Venta externa: ${group.code}.`,
          ),
        ),
      )
      continue
    }

    const details: Array<{
      producto_id: string
      cantidad: number
      precio_unitario: number
      descuento_linea: number
    }> = []
    let detailError = false

    for (const row of group.rows) {
      const product = productBySku.get(normalizeKey(importCellAsText(row.values.sku)))

      if (!product) {
        errors.push(
          processingError(
            row.rowNumber,
            'sku',
            importCellAsText(row.values.sku),
            'PRODUCT_NOT_FOUND',
            'El SKU no corresponde a un producto activo de la empresa.',
          ),
        )
        detailError = true
        continue
      }

      details.push({
        producto_id: product.id,
        cantidad: importCellAsNumber(row.values.cantidad) ?? 0,
        precio_unitario:
          importCellAsNumber(row.values.precio_unitario) ??
          Number(product.precio_venta ?? 0),
        descuento_linea: importCellAsNumber(row.values.descuento_linea) ?? 0,
      })
    }

    if (detailError) continue

    const rawDate = importCellAsText(firstRow.values.fecha_venta)
    const date = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString()
    const observation = [
      importCellAsText(firstRow.values.observaciones),
      `Importación masiva. Código externo: ${group.code}.`,
    ]
      .filter(Boolean)
      .join(' ')

    const { error } = await supabase.rpc('guardar_venta_borrador', {
      p_venta_id: null,
      p_empresa_id: companyId,
      p_cliente_id: customerId,
      p_almacen_id: warehouseId,
      p_canal_venta_id: channelId,
      p_fecha_venta: date,
      p_observaciones: observation,
      p_detalles: details,
    })

    if (error) {
      group.rows.forEach((row) =>
        errors.push(
          processingError(
            row.rowNumber,
            null,
            null,
            `SALE_${error.code ?? 'ERROR'}`,
            error.message,
          ),
        ),
      )
    } else {
      insertedRows += group.rows.length
    }
  }

  return { insertedRows, errors }
}

async function processModuleRows(
  module: ImportModule,
  rows: ImportedSpreadsheetRow[],
  companyId: string,
  userRole: string,
): Promise<ImportProcessingResult> {
  if (module === 'CLIENTES') return processClients(rows, companyId)
  if (module === 'PRODUCTOS') return processProducts(rows, companyId)
  return processSales(rows, companyId, userRole)
}

export async function executeImport({
  module,
  file,
  readResult,
  validationResult,
  companyId,
  membershipId,
  userRole,
}: ExecuteImportParams): Promise<ImportExecutionResult> {
  const localErrors: ImportProcessingError[] = validationResult.errors.map((error) => ({
    ...error,
    stage: 'VALIDACION',
  }))

  const { data: load, error: loadError } = await supabase
    .from('cargas_archivo')
    .insert({
      empresa_id: companyId,
      usuario_empresa_id: membershipId,
      modulo: module,
      nombre_archivo: file.name,
      estado: 'VALIDANDO',
      total_filas: readResult.totalRows,
      filas_validas: validationResult.validRows.length,
      filas_invalidas: validationResult.invalidRows.length,
      filas_insertadas: 0,
    })
    .select('id')
    .single()

  if (loadError || !load) {
    throw new Error(`No se pudo iniciar la carga: ${loadError?.message ?? 'sin identificador'}`)
  }

  const loadId = load.id as string
  const storagePath = `${companyId}/${loadId}/${Date.now()}-${safeFileName(file.name)}`

  try {
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        contentType: getContentType(file),
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`No se pudo subir el archivo al almacenamiento privado: ${uploadError.message}`)
    }

    const { error: pathError } = await supabase
      .from('cargas_archivo')
      .update({ ruta_archivo: storagePath })
      .eq('id', loadId)

    if (pathError) {
      throw new Error(`No se pudo guardar la ruta del archivo: ${pathError.message}`)
    }

    await insertLoadErrors(loadId, localErrors)

    const processingResult = await processModuleRows(
      module,
      validationResult.validRows,
      companyId,
      userRole,
    )

    await insertLoadErrors(loadId, processingResult.errors)

    const allErrors = [...localErrors, ...processingResult.errors]
    const insertedRows = processingResult.insertedRows
    const invalidRows = Math.max(0, readResult.totalRows - insertedRows)
    const validRows = insertedRows
    const status: ImportStatus = invalidRows === 0 ? 'COMPLETADA' : 'CON_ERRORES'

    const { error: finalizeError } = await supabase
      .from('cargas_archivo')
      .update({
        estado: status,
        filas_validas: validRows,
        filas_invalidas: invalidRows,
        filas_insertadas: insertedRows,
        finalizado_at: new Date().toISOString(),
        ruta_archivo: storagePath,
      })
      .eq('id', loadId)

    if (finalizeError) {
      throw new Error(`No se pudo finalizar la carga: ${finalizeError.message}`)
    }

    return {
      loadId,
      storagePath,
      status,
      totalRows: readResult.totalRows,
      validRows,
      invalidRows,
      insertedRows,
      errors: allErrors,
    }
  } catch (error) {
    await supabase
      .from('cargas_archivo')
      .update({
        estado: 'CANCELADA',
        finalizado_at: new Date().toISOString(),
      })
      .eq('id', loadId)

    throw error
  }
}

export async function listImportHistory(
  companyId: string,
): Promise<ImportLoadHistoryItem[]> {
  const { data, error } = await supabase
    .from('cargas_archivo')
    .select(
      'id, modulo, nombre_archivo, ruta_archivo, estado, total_filas, filas_validas, filas_invalidas, filas_insertadas, creado_at, finalizado_at',
    )
    .eq('empresa_id', companyId)
    .order('creado_at', { ascending: false })
    .limit(15)

  if (error) {
    throw new Error(`No se pudo cargar el historial: ${error.message}`)
  }

  return (data ?? []) as ImportLoadHistoryItem[]
}

export async function downloadImportFile(item: ImportLoadHistoryItem): Promise<void> {
  if (!item.ruta_archivo) {
    throw new Error('La carga no tiene un archivo asociado.')
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(item.ruta_archivo)

  if (error || !data) {
    throw new Error(`No se pudo descargar el archivo: ${error?.message ?? 'sin contenido'}`)
  }

  const url = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = item.nombre_archivo
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
