import type {
  ImportedCellValue,
  ImportedSpreadsheetRow,
  ImportModule,
  ImportValidationError,
  ImportValidationResult,
  SpreadsheetReadResult,
} from '../types/imports'

interface ModuleSchema {
  requiredHeaders: string[]
  recognizedHeaders: string[]
}

const MODULE_SCHEMAS: Record<ImportModule, ModuleSchema> = {
  CLIENTES: {
    requiredHeaders: ['tipo_cliente', 'nombre_completo'],
    recognizedHeaders: [
      'tipo_cliente',
      'tipo_documento',
      'numero_documento',
      'nombre_completo',
      'email',
      'telefono',
      'segmento',
      'direccion',
      'activo',
    ],
  },
  PRODUCTOS: {
    requiredHeaders: [
      'sku',
      'nombre',
      'categoria',
      'unidad_medida',
      'costo_actual',
      'precio_venta',
    ],
    recognizedHeaders: [
      'sku',
      'nombre',
      'categoria',
      'descripcion',
      'unidad_medida',
      'costo_actual',
      'precio_venta',
      'activo',
    ],
  },
  VENTAS: {
    requiredHeaders: [
      'codigo_externo',
      'almacen',
      'canal',
      'sku',
      'cantidad',
    ],
    recognizedHeaders: [
      'codigo_externo',
      'cliente_documento',
      'cliente_nombre',
      'almacen',
      'canal',
      'fecha_venta',
      'sku',
      'cantidad',
      'precio_unitario',
      'descuento_linea',
      'observaciones',
    ],
  },
}

const CLIENT_TYPES = new Set(['PERSONA', 'EMPRESA'])
const DOCUMENT_TYPES = new Set(['DNI', 'RUC', 'CE', 'PASAPORTE', 'OTRO'])
const CLIENT_SEGMENTS = new Set(['MINORISTA', 'CORPORATIVO', 'MAYORISTA', 'OTRO'])
const UNITS = new Set(['UNIDAD', 'CAJA', 'PAQUETE', 'KILOGRAMO', 'LITRO'])

export type ImportValidatorErrorCode =
  | 'MISSING_HEADERS'
  | 'NO_DATA_ROWS'
  | 'INVALID_MODULE'

export class ImportValidatorError extends Error {
  readonly code: ImportValidatorErrorCode

  constructor(code: ImportValidatorErrorCode, message: string) {
    super(message)
    this.name = 'ImportValidatorError'
    this.code = code
  }
}

function asText(value: ImportedCellValue | undefined): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function normalizedEnum(value: ImportedCellValue | undefined): string | null {
  const text = asText(value)

  return text
    ? text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    : null
}

function asNumber(value: ImportedCellValue | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const text = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/^S\/?/i, '')
    .replace(',', '.')
  const parsed = Number(text)

  return Number.isFinite(parsed) ? parsed : null
}

function asBoolean(value: ImportedCellValue | undefined): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }

  const normalized = normalizedEnum(value)

  if (['SI', 'S', 'TRUE', 'VERDADERO', '1', 'ACTIVO'].includes(normalized ?? '')) {
    return true
  }

  if (['NO', 'N', 'FALSE', 'FALSO', '0', 'INACTIVO'].includes(normalized ?? '')) {
    return false
  }

  return null
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function stringValue(value: ImportedCellValue | undefined): string | null {
  const text = asText(value)
  return text === null ? null : text
}

function addError(
  errors: ImportValidationError[],
  row: ImportedSpreadsheetRow,
  field: string | null,
  code: string,
  message: string,
  originalValue?: ImportedCellValue,
) {
  errors.push({
    rowNumber: row.rowNumber,
    field,
    originalValue:
      originalValue === null || originalValue === undefined
        ? null
        : String(originalValue),
    errorCode: code,
    errorMessage: message,
  })
}

function validateClientRow(
  row: ImportedSpreadsheetRow,
  documentKeys: Set<string>,
): ImportValidationError[] {
  const errors: ImportValidationError[] = []
  const type = normalizedEnum(row.values.tipo_cliente)
  const name = asText(row.values.nombre_completo)
  const documentType = normalizedEnum(row.values.tipo_documento)
  const documentNumber = asText(row.values.numero_documento)
  const segment = normalizedEnum(row.values.segmento)
  const email = asText(row.values.email)
  const activeValue = row.values.activo

  if (!type) {
    addError(
      errors,
      row,
      'tipo_cliente',
      'REQUIRED_FIELD',
      'El tipo de cliente es obligatorio.',
      row.values.tipo_cliente,
    )
  } else if (!CLIENT_TYPES.has(type)) {
    addError(
      errors,
      row,
      'tipo_cliente',
      'INVALID_CLIENT_TYPE',
      'El tipo de cliente debe ser PERSONA o EMPRESA.',
      row.values.tipo_cliente,
    )
  }

  if (!name) {
    addError(
      errors,
      row,
      'nombre_completo',
      'REQUIRED_FIELD',
      'El nombre completo o razón social es obligatorio.',
      row.values.nombre_completo,
    )
  } else if (name.length > 200) {
    addError(
      errors,
      row,
      'nombre_completo',
      'MAX_LENGTH',
      'El nombre completo no puede superar 200 caracteres.',
      row.values.nombre_completo,
    )
  }

  if ((documentType && !documentNumber) || (!documentType && documentNumber)) {
    addError(
      errors,
      row,
      documentType ? 'numero_documento' : 'tipo_documento',
      'INCOMPLETE_DOCUMENT',
      'El tipo y el número de documento deben completarse juntos.',
      documentType ? row.values.numero_documento : row.values.tipo_documento,
    )
  }

  if (documentType && !DOCUMENT_TYPES.has(documentType)) {
    addError(
      errors,
      row,
      'tipo_documento',
      'INVALID_DOCUMENT_TYPE',
      'El tipo de documento debe ser DNI, RUC, CE, PASAPORTE u OTRO.',
      row.values.tipo_documento,
    )
  }

  if (documentNumber && documentNumber.length > 30) {
    addError(
      errors,
      row,
      'numero_documento',
      'MAX_LENGTH',
      'El número de documento no puede superar 30 caracteres.',
      row.values.numero_documento,
    )
  }

  if (documentType && documentNumber) {
    const key = `${documentType}|${documentNumber.toUpperCase()}`

    if (documentKeys.has(key)) {
      addError(
        errors,
        row,
        'numero_documento',
        'DUPLICATE_DOCUMENT_IN_FILE',
        'El documento está repetido dentro del archivo.',
        row.values.numero_documento,
      )
    } else {
      documentKeys.add(key)
    }
  }

  if (email && !isValidEmail(email)) {
    addError(
      errors,
      row,
      'email',
      'INVALID_EMAIL',
      'El correo electrónico no tiene un formato válido.',
      row.values.email,
    )
  }

  if (segment && !CLIENT_SEGMENTS.has(segment)) {
    addError(
      errors,
      row,
      'segmento',
      'INVALID_SEGMENT',
      'El segmento debe ser MINORISTA, CORPORATIVO, MAYORISTA u OTRO.',
      row.values.segmento,
    )
  }

  if (activeValue !== null && activeValue !== undefined && asBoolean(activeValue) === null) {
    addError(
      errors,
      row,
      'activo',
      'INVALID_BOOLEAN',
      'Activo debe indicar Sí/No, verdadero/falso o 1/0.',
      activeValue,
    )
  }

  return errors
}

function validateProductRow(
  row: ImportedSpreadsheetRow,
  skuKeys: Set<string>,
): ImportValidationError[] {
  const errors: ImportValidationError[] = []
  const sku = asText(row.values.sku)
  const name = asText(row.values.nombre)
  const category = asText(row.values.categoria)
  const unit = normalizedEnum(row.values.unidad_medida)
  const cost = asNumber(row.values.costo_actual)
  const price = asNumber(row.values.precio_venta)
  const activeValue = row.values.activo

  if (!sku) {
    addError(errors, row, 'sku', 'REQUIRED_FIELD', 'El SKU es obligatorio.', row.values.sku)
  } else {
    const normalizedSku = sku.toUpperCase()

    if (sku.length > 60) {
      addError(
        errors,
        row,
        'sku',
        'MAX_LENGTH',
        'El SKU no puede superar 60 caracteres.',
        row.values.sku,
      )
    }

    if (skuKeys.has(normalizedSku)) {
      addError(
        errors,
        row,
        'sku',
        'DUPLICATE_SKU_IN_FILE',
        'El SKU está repetido dentro del archivo.',
        row.values.sku,
      )
    } else {
      skuKeys.add(normalizedSku)
    }
  }

  if (!name) {
    addError(
      errors,
      row,
      'nombre',
      'REQUIRED_FIELD',
      'El nombre del producto es obligatorio.',
      row.values.nombre,
    )
  } else if (name.length > 200) {
    addError(
      errors,
      row,
      'nombre',
      'MAX_LENGTH',
      'El nombre no puede superar 200 caracteres.',
      row.values.nombre,
    )
  }

  if (!category) {
    addError(
      errors,
      row,
      'categoria',
      'REQUIRED_FIELD',
      'La categoría es obligatoria.',
      row.values.categoria,
    )
  }

  if (!unit) {
    addError(
      errors,
      row,
      'unidad_medida',
      'REQUIRED_FIELD',
      'La unidad de medida es obligatoria.',
      row.values.unidad_medida,
    )
  } else if (!UNITS.has(unit)) {
    addError(
      errors,
      row,
      'unidad_medida',
      'INVALID_UNIT',
      'La unidad debe ser UNIDAD, CAJA, PAQUETE, KILOGRAMO o LITRO.',
      row.values.unidad_medida,
    )
  }

  if (cost === null) {
    addError(
      errors,
      row,
      'costo_actual',
      'INVALID_NUMBER',
      'El costo actual debe ser un número.',
      row.values.costo_actual,
    )
  } else if (cost < 0) {
    addError(
      errors,
      row,
      'costo_actual',
      'NEGATIVE_NUMBER',
      'El costo actual no puede ser negativo.',
      row.values.costo_actual,
    )
  }

  if (price === null) {
    addError(
      errors,
      row,
      'precio_venta',
      'INVALID_NUMBER',
      'El precio de venta debe ser un número.',
      row.values.precio_venta,
    )
  } else if (price < 0) {
    addError(
      errors,
      row,
      'precio_venta',
      'NEGATIVE_NUMBER',
      'El precio de venta no puede ser negativo.',
      row.values.precio_venta,
    )
  }

  if (activeValue !== null && activeValue !== undefined && asBoolean(activeValue) === null) {
    addError(
      errors,
      row,
      'activo',
      'INVALID_BOOLEAN',
      'Activo debe indicar Sí/No, verdadero/falso o 1/0.',
      activeValue,
    )
  }

  return errors
}

function validateSaleRow(
  row: ImportedSpreadsheetRow,
  groupProducts: Map<string, Set<string>>,
  groupSignatures: Map<string, string>,
): ImportValidationError[] {
  const errors: ImportValidationError[] = []
  const externalCode = asText(row.values.codigo_externo)
  const customerDocument = asText(row.values.cliente_documento)
  const customerName = asText(row.values.cliente_nombre)
  const warehouse = asText(row.values.almacen)
  const channel = asText(row.values.canal)
  const sku = asText(row.values.sku)
  const quantity = asNumber(row.values.cantidad)
  const priceValue = row.values.precio_unitario
  const price = priceValue === null || priceValue === undefined ? null : asNumber(priceValue)
  const discountValue = row.values.descuento_linea
  const discount = discountValue === null || discountValue === undefined ? 0 : asNumber(discountValue)
  const dateValue = asText(row.values.fecha_venta)

  if (!externalCode) {
    addError(
      errors,
      row,
      'codigo_externo',
      'REQUIRED_FIELD',
      'El código externo que agrupa la venta es obligatorio.',
      row.values.codigo_externo,
    )
  }

  if (!customerDocument && !customerName) {
    addError(
      errors,
      row,
      'cliente_documento',
      'CUSTOMER_REQUIRED',
      'Indica cliente_documento o cliente_nombre.',
      row.values.cliente_documento,
    )
  }

  if (!warehouse) {
    addError(
      errors,
      row,
      'almacen',
      'REQUIRED_FIELD',
      'El almacén es obligatorio.',
      row.values.almacen,
    )
  }

  if (!channel) {
    addError(
      errors,
      row,
      'canal',
      'REQUIRED_FIELD',
      'El canal de venta es obligatorio.',
      row.values.canal,
    )
  }

  if (!sku) {
    addError(errors, row, 'sku', 'REQUIRED_FIELD', 'El SKU es obligatorio.', row.values.sku)
  }

  if (quantity === null || quantity <= 0) {
    addError(
      errors,
      row,
      'cantidad',
      'INVALID_QUANTITY',
      'La cantidad debe ser mayor que cero.',
      row.values.cantidad,
    )
  }

  if (priceValue !== null && priceValue !== undefined && (price === null || price < 0)) {
    addError(
      errors,
      row,
      'precio_unitario',
      'INVALID_PRICE',
      'El precio unitario debe ser un número mayor o igual a cero.',
      row.values.precio_unitario,
    )
  }

  if (discount === null || discount < 0) {
    addError(
      errors,
      row,
      'descuento_linea',
      'INVALID_DISCOUNT',
      'El descuento debe ser un número mayor o igual a cero.',
      row.values.descuento_linea,
    )
  } else if (quantity !== null && price !== null && discount > quantity * price) {
    addError(
      errors,
      row,
      'descuento_linea',
      'DISCOUNT_EXCEEDS_SUBTOTAL',
      'El descuento no puede superar el subtotal de la línea.',
      row.values.descuento_linea,
    )
  }

  if (dateValue && Number.isNaN(Date.parse(dateValue))) {
    addError(
      errors,
      row,
      'fecha_venta',
      'INVALID_DATE',
      'La fecha de venta no tiene un formato válido.',
      row.values.fecha_venta,
    )
  }

  if (externalCode) {
    const groupKey = normalizeKeyForGroup(externalCode)
    const signature = [
      normalizeKeyForGroup(customerDocument),
      normalizeKeyForGroup(customerName),
      normalizeKeyForGroup(warehouse),
      normalizeKeyForGroup(channel),
      dateValue ?? '',
    ].join('|')
    const existingSignature = groupSignatures.get(groupKey)

    if (existingSignature && existingSignature !== signature) {
      addError(
        errors,
        row,
        'codigo_externo',
        'INCONSISTENT_SALE_GROUP',
        'Las líneas del mismo código externo deben usar el mismo cliente, almacén, canal y fecha.',
        row.values.codigo_externo,
      )
    } else if (!existingSignature) {
      groupSignatures.set(groupKey, signature)
    }
  }

  if (externalCode && sku) {
    const groupKey = externalCode.toUpperCase()
    const productKey = sku.toUpperCase()
    const products = groupProducts.get(groupKey) ?? new Set<string>()

    if (products.has(productKey)) {
      addError(
        errors,
        row,
        'sku',
        'DUPLICATE_PRODUCT_IN_SALE',
        'El producto está repetido dentro de la misma venta.',
        row.values.sku,
      )
    } else {
      products.add(productKey)
      groupProducts.set(groupKey, products)
    }
  }

  return errors
}

function normalizeKeyForGroup(value: ImportedCellValue | undefined): string {
  return normalizedEnum(value) ?? ''
}

export function validateImportFile(
  module: ImportModule,
  readResult: SpreadsheetReadResult,
): ImportValidationResult {
  const schema = MODULE_SCHEMAS[module]

  if (!schema) {
    throw new ImportValidatorError('INVALID_MODULE', 'El módulo seleccionado no es válido.')
  }

  const headerSet = new Set(readResult.normalizedHeaders)
  const missingHeaders = schema.requiredHeaders.filter((header) => !headerSet.has(header))
  const recognizedHeaders = readResult.normalizedHeaders.filter((header) =>
    schema.recognizedHeaders.includes(header),
  )

  if (missingHeaders.length > 0) {
    throw new ImportValidatorError(
      'MISSING_HEADERS',
      `Faltan columnas obligatorias para ${module.toLowerCase()}: ${missingHeaders.join(', ')}.`,
    )
  }

  if (readResult.rows.length === 0) {
    throw new ImportValidatorError('NO_DATA_ROWS', 'El archivo no contiene filas de datos.')
  }

  const validRows: ImportedSpreadsheetRow[] = []
  const invalidRows: ImportedSpreadsheetRow[] = []
  const errors: ImportValidationError[] = []
  const documentKeys = new Set<string>()
  const skuKeys = new Set<string>()
  const groupProducts = new Map<string, Set<string>>()
  const groupSignatures = new Map<string, string>()

  readResult.rows.forEach((row) => {
    const rowErrors =
      module === 'CLIENTES'
        ? validateClientRow(row, documentKeys)
        : module === 'PRODUCTOS'
          ? validateProductRow(row, skuKeys)
          : validateSaleRow(row, groupProducts, groupSignatures)

    if (rowErrors.length === 0) {
      validRows.push(row)
    } else {
      invalidRows.push(row)
      errors.push(...rowErrors)
    }
  })

  // Una venta se procesa de forma atómica por codigo_externo. Si una de sus
  // líneas es inválida, se bloquean también las demás líneas del mismo grupo
  // para evitar crear un borrador incompleto.
  if (module === 'VENTAS' && invalidRows.length > 0) {
    const invalidSaleCodes = new Set(
      invalidRows
        .map((row) => normalizeKeyForGroup(row.values.codigo_externo))
        .filter(Boolean),
    )

    for (let index = validRows.length - 1; index >= 0; index -= 1) {
      const row = validRows[index]
      const code = normalizeKeyForGroup(row.values.codigo_externo)

      if (code && invalidSaleCodes.has(code)) {
        validRows.splice(index, 1)
        invalidRows.push(row)
        addError(
          errors,
          row,
          'codigo_externo',
          'SALE_GROUP_HAS_ERRORS',
          'Otra línea de la misma venta contiene errores; el grupo completo fue omitido.',
          row.values.codigo_externo,
        )
      }
    }
  }

  invalidRows.sort((a, b) => a.rowNumber - b.rowNumber)

  return {
    validRows,
    invalidRows,
    errors,
    recognizedHeaders,
    missingHeaders,
  }
}

export function importCellAsText(value: ImportedCellValue): string | null {
  return stringValue(value)
}

export function importCellAsEnum(value: ImportedCellValue): string | null {
  return normalizedEnum(value)
}

export function importCellAsNumber(value: ImportedCellValue): number | null {
  return asNumber(value)
}

export function importCellAsBoolean(
  value: ImportedCellValue,
  defaultValue = true,
): boolean {
  return asBoolean(value) ?? defaultValue
}
