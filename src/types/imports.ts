// Valores exactos de modulo_carga_enum en PostgreSQL.
export const IMPORT_MODULES = ['CLIENTES', 'PRODUCTOS', 'VENTAS'] as const

export type ImportModule = (typeof IMPORT_MODULES)[number]

// Valores exactos de estado_carga_enum en PostgreSQL.
export const IMPORT_STATUSES = [
  'PENDIENTE',
  'VALIDANDO',
  'CON_ERRORES',
  'COMPLETADA',
  'CANCELADA',
] as const

export type ImportStatus = (typeof IMPORT_STATUSES)[number]

export type SpreadsheetExtension = 'xlsx' | 'xls' | 'csv'
export type ImportedCellValue = string | number | boolean | null

export interface ImportedSpreadsheetRow {
  rowNumber: number
  values: Record<string, ImportedCellValue>
}

export interface SpreadsheetReadResult {
  fileName: string
  fileSize: number
  extension: SpreadsheetExtension
  sheetName: string
  originalHeaders: string[]
  normalizedHeaders: string[]
  rows: ImportedSpreadsheetRow[]
  totalRows: number
}

export interface ImportValidationError {
  rowNumber: number
  field: string | null
  originalValue: string | null
  errorCode: string
  errorMessage: string
}

export interface ImportValidationResult {
  validRows: ImportedSpreadsheetRow[]
  invalidRows: ImportedSpreadsheetRow[]
  errors: ImportValidationError[]
  recognizedHeaders: string[]
  missingHeaders: string[]
}

export interface ImportProcessingError extends ImportValidationError {
  stage: 'VALIDACION' | 'PROCESAMIENTO'
}

export interface ImportProcessingResult {
  insertedRows: number
  errors: ImportProcessingError[]
}

export interface ImportExecutionResult {
  loadId: string
  storagePath: string
  status: ImportStatus
  totalRows: number
  validRows: number
  invalidRows: number
  insertedRows: number
  errors: ImportProcessingError[]
}

export interface ImportLoadHistoryItem {
  id: string
  modulo: ImportModule
  nombre_archivo: string
  ruta_archivo: string | null
  estado: ImportStatus
  total_filas: number
  filas_validas: number
  filas_invalidas: number
  filas_insertadas: number
  creado_at: string
  finalizado_at: string | null
}

export interface ExecuteImportParams {
  module: ImportModule
  file: File
  readResult: SpreadsheetReadResult
  validationResult: ImportValidationResult
  companyId: string
  membershipId: string
  userRole: string
}
