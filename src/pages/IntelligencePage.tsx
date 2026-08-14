import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useAuth } from '../hooks/useAuth'
import {
  createAIService,
  type AIDashboardResponse,
  type AIInsight,
  type AIInsightSeverity,
  type AIInsightType,
} from '../lib/ai-service'
import { ApiClientError } from '../lib/api-client'
import { SalesForecastSection } from '../components/ai/SalesForecastSection'
import { DemandForecastSection } from '../components/ai/DemandForecastSection'

import '../styles/intelligence.css'


type SeverityFilter =
  | 'TODAS'
  | AIInsightSeverity

type TypeFilter =
  | 'TODOS'
  | AIInsightType


const severityOptions: Array<{
  value: SeverityFilter
  label: string
}> = [
  {
    value: 'TODAS',
    label: 'Todas',
  },
  {
    value: 'CRITICA',
    label: 'Crítica',
  },
  {
    value: 'ALTA',
    label: 'Alta',
  },
  {
    value: 'MEDIA',
    label: 'Media',
  },
  {
    value: 'BAJA',
    label: 'Baja',
  },
  {
    value: 'INFO',
    label: 'Info',
  },
]


const typeOptions: Array<{
  value: TypeFilter
  label: string
}> = [
  {
    value: 'TODOS',
    label: 'Todos',
  },
  {
    value: 'VENTAS',
    label: 'Ventas',
  },
  {
    value: 'DEMANDA',
    label: 'Demanda',
  },
  {
    value: 'INVENTARIO',
    label: 'Inventario',
  },
  {
    value: 'MODELO',
    label: 'Modelo',
  },
  {
    value: 'OPERACION',
    label: 'Operación',
  },
]


const severityRank: Record<
  AIInsightSeverity,
  number
> = {
  CRITICA: 5,
  ALTA: 4,
  MEDIA: 3,
  BAJA: 2,
  INFO: 1,
}


function formatNumber(
  value: number | null | undefined,
  maximumFractionDigits = 0,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return 'No disponible'
  }

  return new Intl.NumberFormat(
    'es-PE',
    {
      maximumFractionDigits,
    },
  ).format(value)
}


function formatCurrency(
  value: number | null | undefined,
  currency: string,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return 'No disponible'
  }

  return new Intl.NumberFormat(
    'es-PE',
    {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    },
  ).format(value)
}


function formatPercentage(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return 'No disponible'
  }

  return `${new Intl.NumberFormat(
    'es-PE',
    {
      maximumFractionDigits: 1,
    },
  ).format(value)}%`
}


function formatDateTime(
  value: string | null | undefined,
): string {
  if (!value) {
    return 'No disponible'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(
    'es-PE',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  ).format(date)
}


function severityLabel(
  severity: AIInsightSeverity,
): string {
  switch (severity) {
    case 'CRITICA':
      return 'Crítica'

    case 'ALTA':
      return 'Alta'

    case 'MEDIA':
      return 'Media'

    case 'BAJA':
      return 'Baja'

    case 'INFO':
      return 'Info'
  }
}


function typeLabel(
  type: AIInsightType,
): string {
  switch (type) {
    case 'VENTAS':
      return 'Ventas'

    case 'DEMANDA':
      return 'Demanda'

    case 'INVENTARIO':
      return 'Inventario'

    case 'MODELO':
      return 'Modelo'

    case 'OPERACION':
      return 'Operación'
  }
}


function severityClass(
  severity: AIInsightSeverity,
): string {
  switch (severity) {
    case 'CRITICA':
      return 'critical'

    case 'ALTA':
      return 'high'

    case 'MEDIA':
      return 'medium'

    case 'BAJA':
      return 'low'

    case 'INFO':
      return 'info'
  }
}


function insightValue(
  insight: AIInsight,
): string | null {
  if (
    insight.valor === null ||
    insight.valor === undefined
  ) {
    return null
  }

  return formatNumber(
    insight.valor,
    2,
  )
}


export default function IntelligencePage() {
  const {
    session,
    company,
  } = useAuth()


  const accessToken =
    session?.access_token ?? null

  const empresaId =
    company?.id ?? null


  const [
    dashboard,
    setDashboard,
  ] = useState<AIDashboardResponse | null>(
    null,
  )

  const [
    loading,
    setLoading,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState<string | null>(null)

  const [
    refreshVersion,
    setRefreshVersion,
  ] = useState(0)

  const [
    severityFilter,
    setSeverityFilter,
  ] = useState<SeverityFilter>(
    'TODAS',
  )

  const [
    typeFilter,
    setTypeFilter,
  ] = useState<TypeFilter>(
    'TODOS',
  )


  const aiService = useMemo(() => {
    if (
      !accessToken ||
      !empresaId
    ) {
      return null
    }

    return createAIService({
      accessToken,
      empresaId,
    })
  }, [
    accessToken,
    empresaId,
  ])


  useEffect(() => {
    if (!aiService) {
      return
    }

    const controller =
      new AbortController()

    let active = true


    const loadDashboard = async () => {
      setLoading(true)
      setError(null)

      try {
        const result =
          await aiService.getDashboard(
            controller.signal,
          )

        if (!active) {
          return
        }

        setDashboard(result)
      } catch (requestError) {
        if (!active) {
          return
        }

        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return
        }

        if (
          requestError instanceof ApiClientError
        ) {
          setError(
            requestError.message,
          )

          return
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudo cargar la información de inteligencia artificial.',
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }


    void loadDashboard()


    return () => {
      active = false
      controller.abort()
    }
  }, [
    aiService,
    refreshVersion,
  ])


  const contextError =
    !accessToken ||
    !empresaId
      ? 'No existe una sesión empresarial disponible para consultar la IA.'
      : null


  const visibleError =
    contextError ?? error


  const summary =
    dashboard?.summary ?? null


  const severityCounts = useMemo(() => {
    const result: Record<
      AIInsightSeverity,
      number
    > = {
      CRITICA: 0,
      ALTA: 0,
      MEDIA: 0,
      BAJA: 0,
      INFO: 0,
    }

    for (
      const insight
      of dashboard?.insights ?? []
    ) {
      result[
        insight.severidad
      ] += 1
    }

    return result
  }, [dashboard])


  const filteredInsights = useMemo(() => {
    const rows =
      dashboard?.insights ?? []

    return rows
      .filter(
        (insight) =>
          severityFilter === 'TODAS'
          ||
          insight.severidad === severityFilter,
      )
      .filter(
        (insight) =>
          typeFilter === 'TODOS'
          ||
          insight.tipo === typeFilter,
      )
      .slice()
      .sort(
        (
          left,
          right,
        ) => {
          const severityDifference =
            severityRank[
              right.severidad
            ]
            -
            severityRank[
              left.severidad
            ]

          if (
            severityDifference !== 0
          ) {
            return severityDifference
          }

          if (
            left.orden !==
            right.orden
          ) {
            return (
              left.orden -
              right.orden
            )
          }

          return left.id - right.id
        },
      )
  }, [
    dashboard,
    severityFilter,
    typeFilter,
  ])


  const criticalInventory =
    dashboard
      ?.inventory_recommendations
      .filter(
        (recommendation) =>
          recommendation.riesgo ===
          'CRITICO',
      ).length ?? 0


  const highInventory =
    dashboard
      ?.inventory_recommendations
      .filter(
        (recommendation) =>
          recommendation.riesgo ===
          'ALTO',
      ).length ?? 0


  const currency =
    company?.moneda ?? 'PEN'


  const salesImprovement =
    summary?.mejora_ventas_pct

  const demandImprovement =
    summary?.mejora_demanda_pct


  return (
    <div className="ai-page">
      <section className="ai-hero">
        <div className="ai-hero-copy">
          <span className="eyebrow">
            Serving layer predictiva
          </span>

          <h2>
            Inteligencia comercial
          </h2>

          <p>
            Pronósticos, insights y
            recomendaciones generados por
            la capa analítica de ComercioBI
            para apoyar decisiones de
            ventas, demanda e inventario.
          </p>
        </div>


        <div className="ai-hero-actions">
          <span className="status-pill">
            {loading
              ? 'Consultando IA'
              : visibleError
                ? 'Con observaciones'
                : 'IA conectada'}
          </span>

          <button
            type="button"
            className="button button-secondary"
            disabled={loading}
            onClick={() =>
              setRefreshVersion(
                (value) =>
                  value + 1,
              )
            }
          >
            {loading
              ? 'Actualizando...'
              : 'Actualizar'}
          </button>
        </div>
      </section>


      {visibleError ? (
        <section className="alert alert-error">
          <strong>
            No se pudo consultar la capa
            de inteligencia.
          </strong>

          <span>
            {visibleError}
          </span>
        </section>
      ) : null}


      {summary?.origen_datos ===
      'DEMO' ? (
        <section className="ai-demo-banner">
          <div>
            <strong>
              Resultados con datos DEMO
            </strong>

            <span>
              La historia real disponible
              todavía no alcanza el mínimo
              definido para entrenamiento.
              Los resultados predictivos de
              esta ejecución se muestran
              claramente como demostrativos.
            </span>
          </div>

          <span className="ai-demo-badge">
            DEMO
          </span>
        </section>
      ) : null}


      <section className="ai-kpi-grid">
        <article className="ai-kpi-card ai-kpi-primary">
          <span>
            Insights
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : dashboard
                  ?.insights.length
                ?? 0}
          </strong>

          <small>
            Hallazgos de negocio
          </small>
        </article>


        <article className="ai-kpi-card ai-kpi-critical">
          <span>
            Insights críticos
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : severityCounts.CRITICA}
          </strong>

          <small>
            Atención inmediata
          </small>
        </article>


        <article className="ai-kpi-card">
          <span>
            Pronósticos de ventas
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : dashboard
                  ?.sales_forecast
                  .length
                ?? 0}
          </strong>

          <small>
            Producto y periodo
          </small>
        </article>


        <article className="ai-kpi-card">
          <span>
            Pronósticos de demanda
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : dashboard
                  ?.demand_forecast
                  .length
                ?? 0}
          </strong>

          <small>
            Horizonte diario
          </small>
        </article>


        <article className="ai-kpi-card ai-kpi-warning">
          <span>
            Inventario crítico
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : criticalInventory}
          </strong>

          <small>
            Productos con riesgo CRÍTICO
          </small>
        </article>


        <article className="ai-kpi-card">
          <span>
            Unidades sugeridas
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : formatNumber(
                  summary
                    ?.unidades_reposicion_sugeridas,
                )}
          </strong>

          <small>
            Reposición recomendada
          </small>
        </article>
      </section>


      {!loading && !summary ? (
        <section className="alert">
          <strong>
            Todavía no existe un resumen
            IA disponible.
          </strong>

          <span>
            Ejecuta el pipeline predictivo
            para generar resultados para
            esta empresa.
          </span>
        </section>
      ) : null}


      {summary ? (
        <section className="ai-executive-grid">
          <article className="ai-panel">
            <div className="ai-panel-heading">
              <div>
                <span className="eyebrow">
                  Estado del modelo
                </span>

                <h3>
                  Última ejecución IA
                </h3>

                <p>
                  Información técnica
                  resumida para interpretar
                  correctamente los
                  pronósticos vigentes.
                </p>
              </div>
            </div>


            <dl className="ai-summary-list">
              <div className="ai-summary-row">
                <dt>
                  Origen de datos
                </dt>

                <dd>
                  {summary.origen_datos
                    ?? 'No disponible'}
                </dd>
              </div>


              <div className="ai-summary-row">
                <dt>
                  Versión
                </dt>

                <dd>
                  {summary.version_modelo
                    ?? 'No disponible'}
                </dd>
              </div>


              <div className="ai-summary-row">
                <dt>
                  Modelo de ventas
                </dt>

                <dd>
                  {summary
                    .algoritmo_ventas
                    ?? 'No disponible'}
                </dd>
              </div>


              <div className="ai-summary-row">
                <dt>
                  Mejora ventas
                </dt>

                <dd
                  className={
                    salesImprovement !==
                      null &&
                    salesImprovement !==
                      undefined &&
                    salesImprovement > 0
                      ? 'ai-positive'
                      : 'ai-neutral'
                  }
                >
                  {formatPercentage(
                    salesImprovement,
                  )}
                </dd>
              </div>


              <div className="ai-summary-row">
                <dt>
                  Modelo de demanda
                </dt>

                <dd>
                  {summary
                    .algoritmo_demanda
                    ?? 'No disponible'}
                </dd>
              </div>


              <div className="ai-summary-row">
                <dt>
                  Mejora demanda
                </dt>

                <dd
                  className={
                    demandImprovement !==
                      null &&
                    demandImprovement !==
                      undefined &&
                    demandImprovement > 0
                      ? 'ai-positive'
                      : 'ai-neutral'
                  }
                >
                  {formatPercentage(
                    demandImprovement,
                  )}
                </dd>
              </div>


              <div className="ai-summary-row">
                <dt>
                  Última actualización
                </dt>

                <dd>
                  {formatDateTime(
                    summary
                      .ultima_actualizacion_modelo,
                  )}
                </dd>
              </div>
            </dl>
          </article>


          <article className="ai-panel">
            <div className="ai-panel-heading">
              <div>
                <span className="eyebrow">
                  Estado del negocio
                </span>

                <h3>
                  Señales para decidir
                </h3>

                <p>
                  Indicadores agregados de
                  proyección y riesgo para
                  priorizar acciones.
                </p>
              </div>
            </div>


            <div className="ai-business-grid">
              <div className="ai-business-card">
                <span>
                  Venta pronosticada
                </span>

                <strong>
                  {formatCurrency(
                    summary
                      .venta_pronosticada_total,
                    currency,
                  )}
                </strong>

                <small>
                  Horizonte vigente del
                  modelo
                </small>
              </div>


              <div className="ai-business-card">
                <span>
                  Demanda pronosticada
                </span>

                <strong>
                  {formatNumber(
                    summary
                      .demanda_pronosticada_total,
                    1,
                  )}
                </strong>

                <small>
                  Unidades proyectadas
                </small>
              </div>


              <div className="ai-business-card ai-business-card-critical">
                <span>
                  Riesgo crítico
                </span>

                <strong>
                  {criticalInventory}
                </strong>

                <small>
                  Productos en CRÍTICO
                </small>
              </div>


              <div className="ai-business-card ai-business-card-warning">
                <span>
                  Riesgo alto
                </span>

                <strong>
                  {highInventory}
                </strong>

                <small>
                  Productos en ALTO
                </small>
              </div>


              <div className="ai-business-card">
                <span>
                  Productos a reponer
                </span>

                <strong>
                  {formatNumber(
                    summary
                      .productos_a_reponer,
                  )}
                </strong>

                <small>
                  Reposición sugerida
                </small>
              </div>


              <div className="ai-business-card">
                <span>
                  Cobertura promedio
                </span>

                <strong>
                  {summary
                    .cobertura_promedio_dias
                    === null ||
                  summary
                    .cobertura_promedio_dias
                    === undefined
                    ? 'N/D'
                    : `${formatNumber(
                        summary
                          .cobertura_promedio_dias,
                        1,
                      )} d`}
                </strong>

                <small>
                  Días de inventario
                </small>
              </div>
            </div>
          </article>
        </section>
      ) : null}


      <SalesForecastSection
        salesForecast={
          dashboard
            ?.sales_forecast
            ?? []
        }
        currency={currency}
        loading={
          loading &&
          !dashboard
        }
      />


      <DemandForecastSection
        demandForecast={
          dashboard
            ?.demand_forecast
            ?? []
        }
        loading={
          loading &&
          !dashboard
        }
      />


      <section className="ai-panel ai-insights-section">
        <div className="ai-insights-heading">
          <div>
            <span className="eyebrow">
              Business Insights
            </span>

            <h3>
              Hallazgos y acciones
              recomendadas
            </h3>

            <p>
              Los insights se generan a
              partir de los resultados
              vigentes de la capa IA y se
              ordenan por prioridad.
            </p>
          </div>

          <span className="ai-insights-count">
            {filteredInsights.length}
          </span>
        </div>


        <div className="ai-severity-summary">
          <div className="ai-severity-summary-card ai-severity-summary-critical">
            <span>
              Crítica
            </span>

            <strong>
              {severityCounts.CRITICA}
            </strong>
          </div>


          <div className="ai-severity-summary-card ai-severity-summary-high">
            <span>
              Alta
            </span>

            <strong>
              {severityCounts.ALTA}
            </strong>
          </div>


          <div className="ai-severity-summary-card ai-severity-summary-medium">
            <span>
              Media
            </span>

            <strong>
              {severityCounts.MEDIA}
            </strong>
          </div>


          <div className="ai-severity-summary-card ai-severity-summary-low">
            <span>
              Baja
            </span>

            <strong>
              {severityCounts.BAJA}
            </strong>
          </div>


          <div className="ai-severity-summary-card ai-severity-summary-info">
            <span>
              Info
            </span>

            <strong>
              {severityCounts.INFO}
            </strong>
          </div>
        </div>


        <div className="ai-filter-panel">
          <div className="ai-filter-group">
            <span className="ai-filter-label">
              Severidad
            </span>

            <div className="ai-filter-options">
              {severityOptions.map(
                (option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      `ai-filter-chip ${
                        severityFilter ===
                        option.value
                          ? 'ai-filter-chip-active'
                          : ''
                      }`
                    }
                    aria-pressed={
                      severityFilter ===
                      option.value
                    }
                    onClick={() =>
                      setSeverityFilter(
                        option.value,
                      )
                    }
                  >
                    {option.label}
                  </button>
                ),
              )}
            </div>
          </div>


          <div className="ai-filter-group">
            <span className="ai-filter-label">
              Tipo
            </span>

            <div className="ai-filter-options">
              {typeOptions.map(
                (option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      `ai-filter-chip ${
                        typeFilter ===
                        option.value
                          ? 'ai-filter-chip-active'
                          : ''
                      }`
                    }
                    aria-pressed={
                      typeFilter ===
                      option.value
                    }
                    onClick={() =>
                      setTypeFilter(
                        option.value,
                      )
                    }
                  >
                    {option.label}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>


        {loading && !dashboard ? (
          <div className="ai-empty">
            Consultando insights...
          </div>
        ) : filteredInsights.length === 0 ? (
          <div className="ai-empty">
            No existen insights que
            coincidan con los filtros
            seleccionados.
          </div>
        ) : (
          <div className="ai-insight-list">
            {filteredInsights.map(
              (insight) => {
                const severity =
                  severityClass(
                    insight.severidad,
                  )

                const value =
                  insightValue(insight)

                return (
                  <article
                    key={insight.id}
                    className={
                      `ai-insight-card ai-insight-${severity}`
                    }
                  >
                    <div className="ai-insight-header">
                      <div className="ai-insight-badges">
                        <span
                          className={
                            `ai-severity-badge ai-severity-${severity}`
                          }
                        >
                          {severityLabel(
                            insight.severidad,
                          )}
                        </span>

                        <span className="ai-type-badge">
                          {typeLabel(
                            insight.tipo,
                          )}
                        </span>
                      </div>

                      <span className="ai-insight-order">
                        #{insight.orden}
                      </span>
                    </div>


                    <h4>
                      {insight.titulo}
                    </h4>


                    <p className="ai-insight-description">
                      {insight.descripcion}
                    </p>


                    {value ? (
                      <div className="ai-insight-value">
                        <strong>
                          {value}
                        </strong>

                        {insight.unidad ? (
                          <span>
                            {insight.unidad}
                          </span>
                        ) : null}
                      </div>
                    ) : null}


                    <div className="ai-insight-action">
                      <span>
                        Acción recomendada
                      </span>

                      <p>
                        {insight
                          .accion_recomendada
                          ??
                          'Sin acción adicional definida.'}
                      </p>
                    </div>
                  </article>
                )
              },
            )}
          </div>
        )}
      </section>
    </div>
  )
}