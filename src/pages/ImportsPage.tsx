import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import { useAuth } from '../hooks/useAuth'
import {
  ExcelReaderError,
  readSpreadsheetFile,
} from '../lib/excel-reader'
import {
  executeImport,
  downloadImportFile,
  listImportHistory,
} from '../lib/import-service'
import {
  ImportValidatorError,
  validateImportFile,
} from '../lib/import-validator'
import {
  IMPORT_MODULES,
  type ImportedCellValue,
  type ImportExecutionResult,
  type ImportLoadHistoryItem,
  type ImportModule,
  type ImportValidationResult,
  type SpreadsheetReadResult,
} from '../types/imports'

const MODULE_LABELS: Record<ImportModule, string> = {
  CLIENTES: 'Clientes',
  PRODUCTOS: 'Productos',
  VENTAS: 'Ventas',
}

const MODULE_TEMPLATE_PATHS: Record<ImportModule, string> = {
  CLIENTES: '/plantillas/plantilla_clientes.xlsx',
  PRODUCTOS: '/plantillas/plantilla_productos.xlsx',
  VENTAS: '/plantillas/plantilla_ventas.xlsx',
}

const STATUS_LABELS: Record<ImportLoadHistoryItem['estado'], string> = {
  PENDIENTE: 'Pendiente',
  VALIDANDO: 'Validando',
  CON_ERRORES: 'Con errores',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
}

const PREVIEW_ROW_LIMIT = 10

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatCellValue(value: ImportedCellValue): string {
  if (value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  return String(value)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ExcelReaderError || error instanceof ImportValidatorError) {
    return error.message
  }

  if (error instanceof Error) return error.message
  return 'No se pudo completar la operación.'
}

function formatDate(value: string | null): string {
  if (!value) return '—'

  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function ImportsPage() {
  const { company, membership } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [selectedModule, setSelectedModule] = useState<ImportModule | ''>('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [readResult, setReadResult] = useState<SpreadsheetReadResult | null>(null)
  const [validationResult, setValidationResult] =
    useState<ImportValidationResult | null>(null)
  const [executionResult, setExecutionResult] =
    useState<ImportExecutionResult | null>(null)
  const [history, setHistory] = useState<ImportLoadHistoryItem[]>([])
  const [isReading, setIsReading] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    if (!company) return

    setIsLoadingHistory(true)
    setHistoryError(null)

    try {
      setHistory(await listImportHistory(company.id))
    } catch (error) {
      setHistoryError(getErrorMessage(error))
    } finally {
      setIsLoadingHistory(false)
    }
  }, [company])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHistory()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadHistory])

  const resetAnalysis = useCallback(() => {
    setReadResult(null)
    setValidationResult(null)
    setExecutionResult(null)
    setErrorMessage(null)
  }, [])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null)
    resetAnalysis()
  }

  const handleModuleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedModule(event.target.value as ImportModule | '')
    resetAnalysis()
  }

  const handleAnalyzeFile = async () => {
    if (!selectedModule) {
      setErrorMessage('Selecciona el módulo al que corresponde el archivo.')
      return
    }

    if (!selectedFile) {
      setErrorMessage('Selecciona un archivo Excel o CSV.')
      return
    }

    setIsReading(true)
    setErrorMessage(null)
    setExecutionResult(null)

    try {
      const result = await readSpreadsheetFile(selectedFile)
      const validation = validateImportFile(selectedModule, result)
      setReadResult(result)
      setValidationResult(validation)
    } catch (error) {
      setReadResult(null)
      setValidationResult(null)
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsReading(false)
    }
  }

  const handleExecuteImport = async () => {
    if (
      !selectedModule ||
      !selectedFile ||
      !readResult ||
      !validationResult ||
      !company ||
      !membership
    ) {
      setErrorMessage('Primero analiza correctamente un archivo.')
      return
    }

    const moduleNeedsAdmin = selectedModule !== 'CLIENTES'

    if (moduleNeedsAdmin && membership.rol !== 'ADMIN') {
      setErrorMessage(
        'Por seguridad, las cargas de Productos y Ventas solo pueden ser ejecutadas por un administrador.',
      )
      return
    }

    setIsExecuting(true)
    setErrorMessage(null)
    setExecutionResult(null)

    try {
      const result = await executeImport({
        module: selectedModule,
        file: selectedFile,
        readResult,
        validationResult,
        companyId: company.id,
        membershipId: membership.id,
        userRole: membership.rol,
      })

      setExecutionResult(result)
      await loadHistory()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
      await loadHistory()
    } finally {
      setIsExecuting(false)
    }
  }

  const handleClear = () => {
    setSelectedModule('')
    setSelectedFile(null)
    setReadResult(null)
    setValidationResult(null)
    setExecutionResult(null)
    setErrorMessage(null)
    setIsReading(false)
    setIsExecuting(false)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = async (item: ImportLoadHistoryItem) => {
    setDownloadingId(item.id)
    setHistoryError(null)

    try {
      await downloadImportFile(item)
    } catch (error) {
      setHistoryError(getErrorMessage(error))
    } finally {
      setDownloadingId(null)
    }
  }

  const previewRows = readResult?.rows.slice(0, PREVIEW_ROW_LIMIT) ?? []
  const canExecuteModule =
    selectedModule === 'CLIENTES' || membership?.rol === 'ADMIN'
  const templatePath = selectedModule
    ? MODULE_TEMPLATE_PATHS[selectedModule]
    : null

  const validationMetrics = useMemo(() => {
    if (!readResult || !validationResult) return null

    return [
      { label: 'Filas encontradas', value: readResult.totalRows, tone: 'neutral' },
      { label: 'Filas válidas', value: validationResult.validRows.length, tone: 'success' },
      { label: 'Filas inválidas', value: validationResult.invalidRows.length, tone: 'warning' },
      { label: 'Errores detectados', value: validationResult.errors.length, tone: 'danger' },
    ]
  }, [readResult, validationResult])

  return (
    <section className="imports-page">
      <div className="imports-main-card">
        <header className="imports-page-header">
          <div>
            <p className="imports-eyebrow">IMPORTACIÓN DE DATOS</p>
            <h1>Cargas de archivos</h1>
            <p className="imports-description">
              Analiza, valida e importa información desde Excel o CSV con
              trazabilidad completa y aislamiento por empresa.
            </p>
          </div>
        </header>

        <div className="imports-information-banner">
          <strong>Flujo seguro de importación</strong>
          <span>
            Primero se valida localmente. Solo al presionar “Ejecutar carga” se
            sube el archivo al bucket privado, se registran los errores y se
            insertan únicamente las filas válidas.
          </span>
        </div>

        {errorMessage && (
          <div className="imports-alert imports-alert-error" role="alert">
            <strong>No se pudo completar la operación.</strong>
            <span>{errorMessage}</span>
          </div>
        )}

        {readResult && validationResult && !executionResult && (
          <div className="imports-alert imports-alert-success" role="status">
            <strong>Archivo leído y validado.</strong>
            <span>
              Se encontraron {readResult.totalRows} filas:{' '}
              {validationResult.validRows.length} válidas y{' '}
              {validationResult.invalidRows.length} inválidas.
            </span>
          </div>
        )}

        {executionResult && (
          <div
            className={`imports-alert ${
              executionResult.status === 'COMPLETADA'
                ? 'imports-alert-success'
                : 'imports-alert-warning'
            }`}
            role="status"
          >
            <strong>
              {executionResult.status === 'COMPLETADA'
                ? 'Carga completada correctamente.'
                : 'Carga finalizada con observaciones.'}
            </strong>
            <span>
              Se insertaron {executionResult.insertedRows} de{' '}
              {executionResult.totalRows} filas. Código de carga:{' '}
              {executionResult.loadId}.
            </span>
          </div>
        )}

        <div className="imports-selection-panel">
          <div className="imports-form-field">
            <label htmlFor="import-module">Módulo de destino *</label>
            <select
              id="import-module"
              value={selectedModule}
              onChange={handleModuleChange}
              disabled={isReading || isExecuting}
            >
              <option value="">Selecciona un módulo</option>
              {IMPORT_MODULES.map((module) => (
                <option key={module} value={module}>
                  {MODULE_LABELS[module]}
                </option>
              ))}
            </select>
          </div>

          <div className="imports-form-field">
            <label htmlFor="import-file">Archivo *</label>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              disabled={isReading || isExecuting}
            />
            <small>Formatos permitidos: XLSX, XLS y CSV. Máximo: 5 MB.</small>
          </div>
        </div>

        <div className="imports-toolbar">
          <div className="imports-template-area">
            {templatePath ? (
              <a className="imports-template-link" href={templatePath} download>
                Descargar plantilla de {MODULE_LABELS[selectedModule as ImportModule]}
              </a>
            ) : (
              <span>Selecciona un módulo para descargar su plantilla.</span>
            )}
          </div>

          <div className="imports-actions">
            <button
              type="button"
              className="imports-button imports-button-secondary"
              onClick={handleClear}
              disabled={isReading || isExecuting}
            >
              Limpiar
            </button>
            <button
              type="button"
              className="imports-button imports-button-primary"
              onClick={() => void handleAnalyzeFile()}
              disabled={isReading || isExecuting || !selectedModule || !selectedFile}
            >
              {isReading ? 'Analizando...' : 'Analizar archivo'}
            </button>
          </div>
        </div>

        {selectedFile && !readResult && (
          <div className="imports-selected-file">
            <div>
              <span>Archivo seleccionado</span>
              <strong>{selectedFile.name}</strong>
            </div>
            <div>
              <span>Tamaño</span>
              <strong>{formatFileSize(selectedFile.size)}</strong>
            </div>
          </div>
        )}

        {readResult && validationResult && (
          <>
            <section className="imports-result-section">
              <div className="imports-section-heading">
                <div>
                  <p className="imports-eyebrow">RESUMEN DEL ARCHIVO</p>
                  <h2>Información detectada</h2>
                  <p>
                    El archivo fue leído y validado localmente. Aún no se ha
                    modificado la base de datos.
                  </p>
                </div>
              </div>

              <div className="imports-summary-grid">
                <article className="imports-summary-card">
                  <span>Módulo</span>
                  <strong>{MODULE_LABELS[selectedModule as ImportModule]}</strong>
                </article>
                <article className="imports-summary-card">
                  <span>Archivo</span>
                  <strong>{readResult.fileName}</strong>
                </article>
                <article className="imports-summary-card">
                  <span>Formato</span>
                  <strong>{readResult.extension.toUpperCase()}</strong>
                </article>
                <article className="imports-summary-card">
                  <span>Hoja leída</span>
                  <strong>{readResult.sheetName}</strong>
                </article>
                <article className="imports-summary-card">
                  <span>Filas</span>
                  <strong>{readResult.totalRows}</strong>
                </article>
                <article className="imports-summary-card">
                  <span>Columnas</span>
                  <strong>{readResult.normalizedHeaders.length}</strong>
                </article>
                <article className="imports-summary-card">
                  <span>Tamaño</span>
                  <strong>{formatFileSize(readResult.fileSize)}</strong>
                </article>
              </div>
            </section>

            <section className="imports-result-section">
              <div className="imports-section-heading">
                <div>
                  <p className="imports-eyebrow">RESULTADO DE LA VALIDACIÓN</p>
                  <h2>Calidad de los datos</h2>
                  <p>
                    Las filas fueron evaluadas aplicando las reglas del módulo{' '}
                    {MODULE_LABELS[selectedModule as ImportModule]}.
                  </p>
                </div>
              </div>

              <div className="imports-validation-grid">
                {validationMetrics?.map((metric) => (
                  <article
                    key={metric.label}
                    className={`imports-validation-card imports-validation-${metric.tone}`}
                  >
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </article>
                ))}
              </div>

              <div className="imports-recognized-block">
                <h3>Columnas reconocidas</h3>
                <div className="imports-tags">
                  {validationResult.recognizedHeaders.map((header) => (
                    <span key={header} className="imports-tag">
                      {header}
                    </span>
                  ))}
                </div>
              </div>

              {validationResult.errors.length > 0 ? (
                <div className="imports-errors-block">
                  <div className="imports-errors-heading">
                    <div>
                      <h3>Errores encontrados</h3>
                      <p>
                        Las filas inválidas se omitirán. Corrige el archivo para
                        importarlas posteriormente.
                      </p>
                    </div>
                    <strong>{validationResult.errors.length} errores</strong>
                  </div>

                  <div className="imports-table-wrapper">
                    <table className="imports-errors-table">
                      <thead>
                        <tr>
                          <th>Fila</th>
                          <th>Campo</th>
                          <th>Valor original</th>
                          <th>Código</th>
                          <th>Descripción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validationResult.errors.map((error, index) => (
                          <tr key={`${error.rowNumber}-${error.errorCode}-${index}`}>
                            <td>{error.rowNumber}</td>
                            <td>{error.field ?? '—'}</td>
                            <td>{error.originalValue ?? 'Vacío'}</td>
                            <td>
                              <code>{error.errorCode}</code>
                            </td>
                            <td>{error.errorMessage}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="imports-no-errors">
                  <strong>El archivo no presenta errores de validación.</strong>
                  <span>Todas las filas están listas para ejecutarse.</span>
                </div>
              )}

              {!canExecuteModule && (
                <div className="imports-permission-note">
                  La validación está disponible, pero tu rol no puede ejecutar
                  importaciones de este módulo. Solicita la ejecución a un
                  administrador.
                </div>
              )}

              <div className="imports-execute-panel">
                <div>
                  <strong>Ejecutar carga auditada</strong>
                  <span>
                    Se guardará el archivo privado, el resultado y cada error en
                    Supabase. Las filas inválidas no serán insertadas.
                  </span>
                </div>
                <button
                  type="button"
                  className="imports-button imports-button-primary"
                  onClick={() => void handleExecuteImport()}
                  disabled={
                    isExecuting ||
                    isReading ||
                    validationResult.validRows.length === 0 ||
                    !canExecuteModule ||
                    Boolean(executionResult)
                  }
                >
                  {isExecuting
                    ? 'Ejecutando carga...'
                    : executionResult
                      ? 'Carga registrada'
                      : `Ejecutar ${validationResult.validRows.length} filas válidas`}
                </button>
              </div>
            </section>

            <section className="imports-result-section">
              <div className="imports-section-heading">
                <div>
                  <p className="imports-eyebrow">VISTA PREVIA</p>
                  <h2>Primeras filas detectadas</h2>
                  <p>Se muestran como máximo las primeras {PREVIEW_ROW_LIMIT} filas.</p>
                </div>
              </div>

              <div className="imports-table-wrapper">
                <table className="imports-preview-table">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      {readResult.normalizedHeaders.map((header, index) => (
                        <th key={`${header}-${index}`}>
                          {readResult.originalHeaders[index] || `Columna ${index + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        {readResult.normalizedHeaders.map((header, index) => (
                          <td key={`${row.rowNumber}-${header}-${index}`}>
                            {formatCellValue(row.values[header])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {readResult.totalRows > PREVIEW_ROW_LIMIT && (
                <p className="imports-preview-note">
                  Existen {readResult.totalRows - PREVIEW_ROW_LIMIT} filas
                  adicionales que no se muestran en esta vista previa.
                </p>
              )}
            </section>
          </>
        )}
      </div>

      <section className="imports-history-card">
        <div className="imports-section-heading imports-history-heading">
          <div>
            <p className="imports-eyebrow">TRAZABILIDAD</p>
            <h2>Historial de cargas</h2>
            <p>Últimas cargas registradas para {company?.nombre ?? 'la empresa'}.</p>
          </div>
          <button
            type="button"
            className="imports-button imports-button-secondary"
            onClick={() => void loadHistory()}
            disabled={isLoadingHistory}
          >
            {isLoadingHistory ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>

        {historyError && (
          <div className="imports-alert imports-alert-error" role="alert">
            <strong>No se pudo cargar el historial.</strong>
            <span>{historyError}</span>
          </div>
        )}

        {history.length === 0 && !isLoadingHistory ? (
          <div className="imports-empty-history">
            Todavía no existen cargas registradas para esta empresa.
          </div>
        ) : (
          <div className="imports-table-wrapper">
            <table className="imports-history-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Módulo</th>
                  <th>Archivo</th>
                  <th>Estado</th>
                  <th>Filas</th>
                  <th>Insertadas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.creado_at)}</td>
                    <td>{MODULE_LABELS[item.modulo]}</td>
                    <td>{item.nombre_archivo}</td>
                    <td>
                      <span className={`imports-status imports-status-${item.estado.toLowerCase()}`}>
                        {STATUS_LABELS[item.estado]}
                      </span>
                    </td>
                    <td>
                      {item.total_filas}{' '}
                      <small>({item.filas_invalidas} inválidas)</small>
                    </td>
                    <td>{item.filas_insertadas}</td>
                    <td>
                      <button
                        type="button"
                        className="imports-inline-action"
                        onClick={() => void handleDownload(item)}
                        disabled={!item.ruta_archivo || downloadingId === item.id}
                      >
                        {downloadingId === item.id ? 'Descargando...' : 'Descargar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
