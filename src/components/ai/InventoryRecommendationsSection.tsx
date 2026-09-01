import {
  useMemo,
  useState,
} from 'react'

import type {
  AIInventoryRecommendation,
} from '../../lib/ai-service'

import '../../styles/inventory-recommendations.css'


interface InventoryRecommendationsSectionProps {
  recommendations: AIInventoryRecommendation[]
  loading?: boolean
}


type RiskFilter =
  | 'TODOS'
  | 'CRITICO'
  | 'ALTO'
  | 'MEDIO'
  | 'BAJO'


const riskFilters: Array<{
  value: RiskFilter
  label: string
}> = [
  {
    value: 'TODOS',
    label: 'Todos',
  },
  {
    value: 'CRITICO',
    label: 'Crítico',
  },
  {
    value: 'ALTO',
    label: 'Alto',
  },
  {
    value: 'MEDIO',
    label: 'Medio',
  },
  {
    value: 'BAJO',
    label: 'Bajo',
  },
]


const riskOrder: Record<
  Exclude<RiskFilter, 'TODOS'>,
  number
> = {
  CRITICO: 4,
  ALTO: 3,
  MEDIO: 2,
  BAJO: 1,
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


function formatDate(
  value: string | null | undefined,
): string {
  if (!value) {
    return 'No disponible'
  }

  const date = new Date(
    `${value}T00:00:00`,
  )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value
  }

  return new Intl.DateTimeFormat(
    'es-PE',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )
    .format(date)
    .replace('.', '')
}


function riskLabel(
  risk: string,
): string {
  switch (risk) {
    case 'CRITICO':
      return 'Crítico'

    case 'ALTO':
      return 'Alto'

    case 'MEDIO':
      return 'Medio'

    case 'BAJO':
      return 'Bajo'

    default:
      return risk
  }
}


function riskClass(
  risk: string,
): string {
  switch (risk) {
    case 'CRITICO':
      return 'critical'

    case 'ALTO':
      return 'high'

    case 'MEDIO':
      return 'medium'

    case 'BAJO':
      return 'low'

    default:
      return 'neutral'
  }
}


export function InventoryRecommendationsSection({
  recommendations,
  loading = false,
}: InventoryRecommendationsSectionProps) {
  const [
    riskFilter,
    setRiskFilter,
  ] = useState<RiskFilter>(
    'TODOS',
  )


  const metrics =
    useMemo(() => {
      const result = {
        total: recommendations.length,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        requiringReplenishment: 0,
        suggestedUnits: 0,
        averageCoverage: null as number | null,
      }

      let coverageTotal = 0
      let coverageCount = 0

      for (
        const recommendation
        of recommendations
      ) {
        switch (
          recommendation.riesgo
        ) {
          case 'CRITICO':
            result.critical += 1
            break

          case 'ALTO':
            result.high += 1
            break

          case 'MEDIO':
            result.medium += 1
            break

          case 'BAJO':
            result.low += 1
            break
        }

        if (
          recommendation
            .requiere_reposicion
        ) {
          result
            .requiringReplenishment += 1
        }

        result.suggestedUnits +=
          recommendation
            .cantidad_sugerida

        if (
          recommendation
            .cobertura_dias !== null &&
          recommendation
            .cobertura_dias !== undefined
        ) {
          coverageTotal +=
            recommendation
              .cobertura_dias

          coverageCount += 1
        }
      }

      result.averageCoverage =
        coverageCount > 0
          ? (
              coverageTotal
              /
              coverageCount
            )
          : null

      return result
    }, [recommendations])


  const filteredRecommendations =
    useMemo(() => {
      return recommendations
        .slice()
        .sort(
          (
            left,
            right,
          ) => {
            const leftRisk =
              riskOrder[
                left.riesgo as
                  keyof typeof riskOrder
              ] ?? 0

            const rightRisk =
              riskOrder[
                right.riesgo as
                  keyof typeof riskOrder
              ] ?? 0

            if (
              leftRisk !== rightRisk
            ) {
              return (
                rightRisk -
                leftRisk
              )
            }

            if (
              left.cantidad_sugerida !==
              right.cantidad_sugerida
            ) {
              return (
                right.cantidad_sugerida
                -
                left.cantidad_sugerida
              )
            }

            const leftCoverage =
              left.cobertura_dias
              ?? Number.POSITIVE_INFINITY

            const rightCoverage =
              right.cobertura_dias
              ?? Number.POSITIVE_INFINITY

            return (
              leftCoverage -
              rightCoverage
            )
          },
        )
        .map(
          (
            recommendation,
            index,
          ) => ({
            ...recommendation,
            globalRank: index + 1,
          }),
        )
        .filter(
          (recommendation) =>
            riskFilter === 'TODOS'
            ||
            recommendation.riesgo ===
              riskFilter,
        )
    }, [
      recommendations,
      riskFilter,
    ])


  if (
    loading &&
    recommendations.length === 0
  ) {
    return (
      <section className="ai-panel inventory-ai-section">
        <div className="inventory-ai-empty">
          Cargando recomendaciones
          de inventario...
        </div>
      </section>
    )
  }


  return (
    <section className="ai-panel inventory-ai-section">
      <div className="inventory-ai-heading">
        <div>
          <span className="eyebrow">
            Recomendaciones de inventario
          </span>

          <h3>
            Prioridades de reposición
          </h3>

          <p>
            Acciones sugeridas a partir del
            pronóstico de demanda, stock
            disponible y cobertura estimada.
          </p>
        </div>


        <div className="inventory-ai-heading-summary">
          <span>
            Productos evaluados
          </span>

          <strong>
            {metrics.total}
          </strong>

          <small>
            {metrics.requiringReplenishment}
            {' '}
            requieren reposición
          </small>
        </div>
      </div>


      {recommendations.length === 0 ? (
        <div className="inventory-ai-empty">
          No existen recomendaciones de
          inventario para la ejecución actual.
        </div>
      ) : (
        <>
          <div className="inventory-ai-kpis">
            <article className="inventory-ai-kpi inventory-ai-kpi-critical">
              <span>
                Riesgo crítico
              </span>

              <strong>
                {metrics.critical}
              </strong>

              <small>
                Prioridad inmediata
              </small>
            </article>


            <article className="inventory-ai-kpi inventory-ai-kpi-high">
              <span>
                Riesgo alto
              </span>

              <strong>
                {metrics.high}
              </strong>

              <small>
                Atención prioritaria
              </small>
            </article>


            <article className="inventory-ai-kpi inventory-ai-kpi-medium">
              <span>
                Riesgo medio
              </span>

              <strong>
                {metrics.medium}
              </strong>

              <small>
                Seguimiento recomendado
              </small>
            </article>


            <article className="inventory-ai-kpi">
              <span>
                Productos a reponer
              </span>

              <strong>
                {metrics.requiringReplenishment}
              </strong>

              <small>
                Con cantidad sugerida
              </small>
            </article>


            <article className="inventory-ai-kpi inventory-ai-kpi-primary">
              <span>
                Unidades sugeridas
              </span>

              <strong>
                {formatNumber(
                  metrics.suggestedUnits,
                )}
              </strong>

              <small>
                Reposición total
              </small>
            </article>


            <article className="inventory-ai-kpi">
              <span>
                Cobertura promedio
              </span>

              <strong>
                {metrics.averageCoverage ===
                null
                  ? 'N/D'
                  : `${formatNumber(
                      metrics.averageCoverage,
                      1,
                    )} d`}
              </strong>

              <small>
                Antes de reposición
              </small>
            </article>
          </div>


          <div className="inventory-ai-toolbar">
            <div className="inventory-ai-filter-group">
              <span>
                Filtrar por riesgo
              </span>

              <div className="inventory-ai-filter-options">
                {riskFilters.map(
                  (filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={
                        riskFilter ===
                        filter.value
                      }
                      className={
                        `inventory-ai-filter ${
                          riskFilter ===
                          filter.value
                            ? 'inventory-ai-filter-active'
                            : ''
                        }`
                      }
                      onClick={() =>
                        setRiskFilter(
                          filter.value,
                        )
                      }
                    >
                      {filter.label}
                    </button>
                  ),
                )}
              </div>
            </div>


            <div className="inventory-ai-result-count">
              <span>
                Resultados
              </span>

              <strong>
                {
                  filteredRecommendations
                    .length
                }
              </strong>
            </div>
          </div>


          {filteredRecommendations.length === 0 ? (
            <div className="inventory-ai-empty">
              No existen recomendaciones
              para el riesgo seleccionado.
            </div>
          ) : (
            <div className="inventory-ai-list">
              {filteredRecommendations.map(
                (
                  recommendation,
                ) => {
                  const risk =
                    riskClass(
                      recommendation.riesgo,
                    )

                  return (
                    <article
                      key={
                        `${recommendation.producto_key}-${recommendation.almacen_key}`
                      }
                      className={
                        `inventory-ai-card inventory-ai-card-${risk}`
                      }
                    >
                      <div className="inventory-ai-card-header">
                        <div className="inventory-ai-card-title">
                          <div className="inventory-ai-badges">
                            <span
                              className={
                                `inventory-ai-risk inventory-ai-risk-${risk}`
                              }
                            >
                              {riskLabel(
                                recommendation.riesgo,
                              )}
                            </span>

                            {recommendation
                              .requiere_reposicion ? (
                              <span className="inventory-ai-replenishment-badge">
                                Reponer
                              </span>
                            ) : (
                              <span className="inventory-ai-no-replenishment-badge">
                                Sin reposición
                              </span>
                            )}
                          </div>


                          <h4>
                            {
                              recommendation
                                .producto
                            }
                          </h4>

                          <p>
                            {recommendation.sku}
                            {' · '}
                            {
                              recommendation
                                .categoria
                              ?? 'Sin categoría'
                            }
                          </p>
                        </div>


                        <div className="inventory-ai-priority">
                          <span>
                            Prioridad
                          </span>

                          <strong>
                            #{recommendation.globalRank}
                          </strong>
                        </div>
                      </div>


                      <div className="inventory-ai-location">
                        <div>
                          <span>
                            Almacén
                          </span>

                          <strong>
                            {
                              recommendation
                                .almacen
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Fecha de referencia
                          </span>

                          <strong>
                            {formatDate(
                              recommendation
                                .fecha_referencia,
                            )}
                          </strong>
                        </div>
                      </div>


                      <div className="inventory-ai-stock-grid">
                        <div>
                          <span>
                            Stock actual
                          </span>

                          <strong>
                            {formatNumber(
                              recommendation
                                .stock_actual,
                            )}
                          </strong>
                        </div>


                        <div>
                          <span>
                            Stock mínimo
                          </span>

                          <strong>
                            {formatNumber(
                              recommendation
                                .stock_minimo,
                            )}
                          </strong>
                        </div>


                        <div>
                          <span>
                            Demanda 30d
                          </span>

                          <strong>
                            {formatNumber(
                              recommendation
                                .demanda_30d,
                              1,
                            )}
                          </strong>
                        </div>


                        <div>
                          <span>
                            Stock objetivo
                          </span>

                          <strong>
                            {formatNumber(
                              recommendation
                                .stock_objetivo,
                            )}
                          </strong>
                        </div>
                      </div>


                      <div className="inventory-ai-action-grid">
                        <div className="inventory-ai-suggested">
                          <span>
                            Reposición sugerida
                          </span>

                          <strong>
                            {formatNumber(
                              recommendation
                                .cantidad_sugerida,
                            )}
                          </strong>

                          <small>
                            unidades
                          </small>
                        </div>


                        <div className="inventory-ai-coverage">
                          <span>
                            Cobertura actual
                          </span>

                          <strong>
                            {
                              recommendation
                                .cobertura_dias ===
                                null ||
                              recommendation
                                .cobertura_dias ===
                                undefined
                                ? 'N/D'
                                : `${formatNumber(
                                    recommendation
                                      .cobertura_dias,
                                    1,
                                  )} d`
                            }
                          </strong>

                          <small>
                            estimados
                          </small>
                        </div>
                      </div>


                      <div className="inventory-ai-reason">
                        <span>
                          Motivo de la recomendación
                        </span>

                        <p>
                          {
                            recommendation
                              .motivo
                          }
                        </p>
                      </div>
                    </article>
                  )
                },
              )}
            </div>
          )}


          <div className="inventory-ai-footnote">
            <strong>
              Criterio de prioridad
            </strong>

            <span>
              Las recomendaciones se ordenan
              primero por nivel de riesgo,
              luego por cantidad sugerida y
              finalmente por menor cobertura.
            </span>
          </div>
        </>
      )}
    </section>
  )
}
