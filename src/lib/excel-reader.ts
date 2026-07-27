import * as XLSX from 'xlsx'

import type {
  ImportedCellValue,
  ImportedSpreadsheetRow,
  SpreadsheetExtension,
  SpreadsheetReadResult,
} from '../types/imports'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

const ALLOWED_EXTENSIONS = new Set<SpreadsheetExtension>([
  'xlsx',
  'xls',
  'csv',
])

export type ExcelReaderErrorCode =
  | 'EMPTY_FILE'
  | 'FILE_TOO_LARGE'
  | 'INVALID_EXTENSION'
  | 'NO_SHEETS'
  | 'EMPTY_SHEET'
  | 'NO_HEADERS'
  | 'READ_ERROR'

export class ExcelReaderError extends Error {
  readonly code: ExcelReaderErrorCode

  constructor(code: ExcelReaderErrorCode, message: string) {
    super(message)
    this.name = 'ExcelReaderError'
    this.code = code
  }
}

function getSpreadsheetExtension(fileName: string): SpreadsheetExtension {
  const extension = fileName.split('.').pop()?.trim().toLowerCase()

  if (!extension || !ALLOWED_EXTENSIONS.has(extension as SpreadsheetExtension)) {
    throw new ExcelReaderError(
      'INVALID_EXTENSION',
      'El archivo debe tener extensión .xlsx, .xls o .csv.',
    )
  }

  return extension as SpreadsheetExtension
}

export function normalizeSpreadsheetHeader(header: unknown): string {
  return String(header ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeHeaders(originalHeaders: string[]): string[] {
  const repetitions = new Map<string, number>()

  return originalHeaders.map((originalHeader, index) => {
    const normalizedHeader =
      normalizeSpreadsheetHeader(originalHeader) || `columna_${index + 1}`
    const nextRepetition = (repetitions.get(normalizedHeader) ?? 0) + 1

    repetitions.set(normalizedHeader, nextRepetition)

    return nextRepetition === 1
      ? normalizedHeader
      : `${normalizedHeader}_${nextRepetition}`
  })
}

function normalizeCellValue(value: unknown): ImportedCellValue {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()

  if (typeof value === 'string') {
    const trimmedValue = value.trim()
    return trimmedValue === '' ? null : trimmedValue
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  const stringValue = String(value).trim()
  return stringValue === '' ? null : stringValue
}

function isEmptyRow(row: unknown[]): boolean {
  return row.every((cell) => normalizeCellValue(cell) === null)
}

export async function readSpreadsheetFile(
  file: File,
): Promise<SpreadsheetReadResult> {
  if (file.size === 0) {
    throw new ExcelReaderError('EMPTY_FILE', 'El archivo seleccionado está vacío.')
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ExcelReaderError(
      'FILE_TOO_LARGE',
      'El archivo supera el límite permitido de 5 MB.',
    )
  }

  const extension = getSpreadsheetExtension(file.name)

  try {
    const fileBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(fileBuffer, {
      type: 'array',
      cellDates: true,
    })
    const firstSheetName = workbook.SheetNames[0]

    if (!firstSheetName) {
      throw new ExcelReaderError(
        'NO_SHEETS',
        'El archivo no contiene hojas disponibles.',
      )
    }

    const worksheet = workbook.Sheets[firstSheetName]

    if (!worksheet) {
      throw new ExcelReaderError(
        'NO_SHEETS',
        'No se pudo obtener la primera hoja del archivo.',
      )
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    })

    if (matrix.length === 0) {
      throw new ExcelReaderError(
        'EMPTY_SHEET',
        'La primera hoja del archivo está vacía.',
      )
    }

    const headerRowIndex = matrix.findIndex((row) => !isEmptyRow(row))

    if (headerRowIndex === -1) {
      throw new ExcelReaderError(
        'NO_HEADERS',
        'No se encontraron encabezados en el archivo.',
      )
    }

    const dataMatrix = matrix.slice(headerRowIndex)
    const columnCount = Math.max(...dataMatrix.map((row) => row.length))

    if (columnCount === 0) {
      throw new ExcelReaderError(
        'NO_HEADERS',
        'No se encontraron columnas en el archivo.',
      )
    }

    const headerRow = matrix[headerRowIndex]
    const originalHeaders = Array.from({ length: columnCount }, (_, index) =>
      String(headerRow[index] ?? '').trim(),
    )
    const normalizedHeaders = normalizeHeaders(originalHeaders)

    const rows: ImportedSpreadsheetRow[] = matrix
      .slice(headerRowIndex + 1)
      .map((row, rowIndex) => ({
        rowNumber: headerRowIndex + rowIndex + 2,
        rawRow: row,
      }))
      .filter(({ rawRow }) => !isEmptyRow(rawRow))
      .map(({ rowNumber, rawRow }) => {
        const values: Record<string, ImportedCellValue> = {}

        normalizedHeaders.forEach((header, columnIndex) => {
          values[header] = normalizeCellValue(rawRow[columnIndex])
        })

        return { rowNumber, values }
      })

    return {
      fileName: file.name,
      fileSize: file.size,
      extension,
      sheetName: firstSheetName,
      originalHeaders,
      normalizedHeaders,
      rows,
      totalRows: rows.length,
    }
  } catch (error) {
    if (error instanceof ExcelReaderError) throw error

    console.error('No se pudo interpretar el archivo seleccionado:', error)

    throw new ExcelReaderError(
      'READ_ERROR',
      'No se pudo leer el archivo. Verifica que no esté dañado y que corresponda a un formato Excel o CSV válido.',
    )
  }
}
