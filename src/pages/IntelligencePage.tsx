import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useAuth } from '../hooks/useAuth'
import {
  createAIService,
  type AIDashboardResponse,
} from '../lib/ai-service'
import { ApiClientError } from '../lib/api-client'


function formatNumber(
  value: number | null | undefined,
  maximumFractionDigits = 0,
): string {
  if (value === null || value === undefined) {
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
  if (value === null || value === undefined) {
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
  if (value === null || value === undefined) {
    return 'No disponible'
  }

  return new Intl.NumberFormat(
    'es-PE',
    {
      maximumFractionDigits: 1,
    },
  ).format(value) + '%'
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


export default function IntelligencePage() {
  const {
    session,
    company,
  } = useAuth()

  const [
    dashboard,
    setDashboard,
  ] = useState<AIDashboardResponse | null>(
    null,
  )

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState<string | null>(null)

  const [
    refreshVersion,
    setRefreshVersion,
  ] = useState(0)


  const aiService = useMemo(() => {
    if (
      !session?.access_token ||
      !company?.id
    ) {
      return null
    }

    return createAIService({
      accessToken: session.access_token,
      empresaId: company.id,
    })
  }, [
    session,
    company,
  ])


  useEffect(() => {
    if (!aiService) {
      setLoading(false)
      setError(
        'No existe una sesión empresarial disponible para consultar la IA.',
      )
      return
    }

    const controller = new AbortController()

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
          setError(requestError.message)
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


  const summary =
    dashboard?.summary ?? null


  const priorityInsight = useMemo(() => {
    if (!dashboard) {
      return null
    }

    return (
      dashboard.insights.find(
        (insight) =>
          insight.severidad === 'CRITICA',
      )
      ??
      dashboard.insights.find(
        (insight) =>
          insight.severidad === 'ALTA',
      )
      ??
      dashboard.insights[0]
      ??
      null
    )
  }, [dashboard])


  const criticalInsights =
    dashboard?.insights.filter(
      (insight) =>
        insight.severidad === 'CRITICA',
    ).length ?? 0


  const criticalInventory =
    dashboard?.inventory_recommendations.filter(
      (recommendation) =>
        recommendation.riesgo === 'CRITICO',
    ).length ?? 0


  const currency =
    company?.moneda ?? 'PEN'


  return (
    <div className="page-stack">
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">
            Serving layer predictiva
          </span>

          <h2>
            Inteligencia comercial
          </h2>

          <p>
            Pronósticos, insights y recomendaciones generados
            por la capa analítica de ComercioBI.
          </p>
        </div>

        <div>
          <span className="status-pill">
            {loading
              ? 'Consultando IA'
              : error
                ? 'Con observaciones'
                : 'IA conectada'}
          </span>

          <button
            type="button"
            className="button button-secondary"
            disabled={loading}
            onClick={() =>
              setRefreshVersion(
                (value) => value + 1,
              )
            }
          >
            Actualizar
          </button>
        </div>
      </section>


      {error ? (
        <section className="alert alert-error">
          <strong>
            No se pudo consultar la capa de inteligencia.
          </strong>

          <span>{error}</span>
        </section>
      ) : null}


      <section className="metric-grid">
        <article className="metric-card">
          <span>
            Insights
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : dashboard?.insights.length ?? 0}
          </strong>

          <small>
            Hallazgos generados por reglas de negocio
          </small>
        </article>


        <article className="metric-card metric-card-danger">
          <span>
            Insights críticos
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : criticalInsights}
          </strong>

          <small>
            Requieren atención prioritaria
          </small>
        </article>


        <article className="metric-card">
          <span>
            Pronósticos de ventas
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : dashboard?.sales_forecast.length ?? 0}
          </strong>

          <small>
            Producto y periodo
          </small>
        </article>


        <article className="metric-card">
          <span>
            Pronósticos de demanda
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : dashboard?.demand_forecast.length ?? 0}
          </strong>

          <small>
            Producto y horizonte diario
          </small>
        </article>


        <article className="metric-card metric-card-warning">
          <span>
            Inventario crítico
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : criticalInventory}
          </strong>

          <small>
            Recomendaciones con riesgo crítico
          </small>
        </article>


        <article className="metric-card">
          <span>
            Recomendaciones
          </span>

          <strong>
            {loading && !dashboard
              ? '...'
              : dashboard
                  ?.inventory_recommendations
                  .length ?? 0}
          </strong>

          <small>
            Acciones sugeridas de reposición
          </small>
        </article>
      </section>


      {!loading && !summary ? (
        <section className="alert">
          <strong>
            Todavía no existe un resumen IA disponible.
          </strong>

          <span>
            Ejecuta el pipeline predictivo para generar
            resultados para esta empresa.
          </span>
        </section>
      ) : null}


      {summary ? (
        <section className="dashboard-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  Resumen ejecutivo
                </span>

                <h3>
                  Última ejecución IA
                </h3>
              </div>
            </div>

            <dl className="detail-list">
              <div>
                <dt>
                  Origen de datos
                </dt>

                <dd>
                  {summary.origen_datos
                    ?? 'No disponible'}
                </dd>
              </div>

              <div>
                <dt>
                  Versión del modelo
                </dt>

                <dd>
                  {summary.version_modelo
                    ?? 'No disponible'}
                </dd>
              </div>

              <div>
                <dt>
                  Algoritmo de ventas
                </dt>

                <dd>
                  {summary.algoritmo_ventas
                    ?? 'No disponible'}
                </dd>
              </div>

              <div>
                <dt>
                  Algoritmo de demanda
                </dt>

                <dd>
                  {summary.algoritmo_demanda
                    ?? 'No disponible'}
                </dd>
              </div>

              <div>
                <dt>
                  Mejora ventas
                </dt>

                <dd>
                  {formatPercentage(
                    summary.mejora_ventas_pct,
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Mejora demanda
                </dt>

                <dd>
                  {formatPercentage(
                    summary.mejora_demanda_pct,
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Última actualización
                </dt>

                <dd>
                  {formatDateTime(
                    summary.ultima_actualizacion_modelo,
                  )}
                </dd>
              </div>
            </dl>
          </article>


          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  Proyección
                </span>

                <h3>
                  Indicadores predictivos
                </h3>
              </div>
            </div>

            <dl className="detail-list">
              <div>
                <dt>
                  Venta pronosticada
                </dt>

                <dd>
                  {formatCurrency(
                    summary.venta_pronosticada_total,
                    currency,
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Demanda pronosticada
                </dt>

                <dd>
                  {formatNumber(
                    summary.demanda_pronosticada_total,
                    1,
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Productos a reponer
                </dt>

                <dd>
                  {formatNumber(
                    summary.productos_a_reponer,
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Unidades sugeridas
                </dt>

                <dd>
                  {formatNumber(
                    summary.unidades_reposicion_sugeridas,
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Cobertura promedio
                </dt>

                <dd>
                  {summary.cobertura_promedio_dias
                    === null ||
                  summary.cobertura_promedio_dias
                    === undefined
                    ? 'No disponible'
                    : `${formatNumber(
                        summary.cobertura_promedio_dias,
                        1,
                      )} días`}
                </dd>
              </div>
            </dl>
          </article>


          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  Insight prioritario
                </span>

                <h3>
                  Principal hallazgo
                </h3>
              </div>
            </div>

            {priorityInsight ? (
              <dl className="detail-list">
                <div>
                  <dt>
                    Prioridad
                  </dt>

                  <dd>
                    {priorityInsight.severidad}
                  </dd>
                </div>

                <div>
                  <dt>
                    Tipo
                  </dt>

                  <dd>
                    {priorityInsight.tipo}
                  </dd>
                </div>

                <div>
                  <dt>
                    Hallazgo
                  </dt>

                  <dd>
                    {priorityInsight.titulo}
                  </dd>
                </div>

                <div>
                  <dt>
                    Descripción
                  </dt>

                  <dd>
                    {priorityInsight.descripcion}
                  </dd>
                </div>

                <div>
                  <dt>
                    Acción recomendada
                  </dt>

                  <dd>
                    {priorityInsight
                      .accion_recomendada
                      ?? 'Sin acción adicional.'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p>
                No existen insights disponibles.
              </p>
            )}
          </article>
        </section>
      ) : null}
    </div>
  )
}