import {
  useMemo,
  useState,
} from 'react'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type {
  AIDemandForecast,
} from '../../lib/ai-service'

import '../../styles/demand-forecast.css'


interface DemandForecastSectionProps {
  demandForecast: AIDemandForecast[]
  loading?: boolean
}


interface ProductOption {
  productoKey: number
  sku: string
  producto: string
}


interface DemandChartRow {
  fecha: string
  label: string
  pronostico: number
  inferior: number
  superior: number
}


const PAGE_SIZE = 30


function formatNumber(
  value: number | null | undefined,
  maximumFractionDigits = 1,
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


function formatPercentage(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return 'N/D'
  }

  return `${new Intl.NumberFormat(
    'es-PE',
    {
      maximumFractionDigits: 1,
    },
  ).format(value)}%`
}


function parseDate(
  value: string,
): Date {
  return new Date(
    `${value}T00:00:00`,
  )
}


function formatDate(
  value: string,
): string {
  const date = parseDate(value)

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


function formatChartDate(
  value: string,
): string {
  const date = parseDate(value)

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
    },
  )
    .format(date)
    .replace('.', '')
}


function sum(
  values: number[],
): number {
  return values.reduce(
    (
      total,
      value,
    ) => total + value,
    0,
  )
}


export function DemandForecastSection({
  demandForecast,
  loading = false,
}: DemandForecastSectionProps) {
  const [
    selectedProduct,
    setSelectedProduct,
  ] = useState('ALL')

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1)


  const products = useMemo<
    ProductOption[]
  >(() => {
    const map =
      new Map<
        number,
        ProductOption
      >()

    for (
      const row
      of demandForecast
    ) {
      if (
        !map.has(
          row.producto_key,
        )
      ) {
        map.set(
          row.producto_key,
          {
            productoKey:
              row.producto_key,

            sku:
              row.sku,

            producto:
              row.producto,
          },
        )
      }
    }

    return Array
      .from(
        map.values(),
      )
      .sort(
        (
          left,
          right,
        ) =>
          left.producto.localeCompare(
            right.producto,
            'es',
          ),
      )
  }, [demandForecast])


  const filteredRows =
    useMemo(() => {
      const rows =
        selectedProduct === 'ALL'
          ? demandForecast
          : demandForecast.filter(
              (row) =>
                row.producto_key ===
                Number(
                  selectedProduct,
                ),
            )

      return rows
        .slice()
        .sort(
          (
            left,
            right,
          ) => {
            const dateDifference =
              left.fecha_inicio.localeCompare(
                right.fecha_inicio,
              )

            if (
              dateDifference !== 0
            ) {
              return dateDifference
            }

            return left.producto.localeCompare(
              right.producto,
              'es',
            )
          },
        )
    }, [
      demandForecast,
      selectedProduct,
    ])


  const chartRows =
    useMemo<DemandChartRow[]>(
      () => {
        if (
          selectedProduct !== 'ALL'
        ) {
          return filteredRows.map(
            (row) => ({
              fecha:
                row.fecha_inicio,

              label:
                formatChartDate(
                  row.fecha_inicio,
                ),

              pronostico:
                row.unidades_pronosticadas,

              inferior:
                row.limite_inferior,

              superior:
                row.limite_superior,
            }),
          )
        }

        const grouped =
          new Map<
            string,
            {
              pronostico: number
              inferior: number
              superior: number
            }
          >()

        for (
          const row
          of filteredRows
        ) {
          const current =
            grouped.get(
              row.fecha_inicio,
            ) ?? {
              pronostico: 0,
              inferior: 0,
              superior: 0,
            }

          current.pronostico +=
            row.unidades_pronosticadas

          current.inferior +=
            row.limite_inferior

          current.superior +=
            row.limite_superior

          grouped.set(
            row.fecha_inicio,
            current,
          )
        }

        return Array
          .from(
            grouped.entries(),
          )
          .sort(
            (
              [left],
              [right],
            ) =>
              left.localeCompare(
                right,
              ),
          )
          .map(
            (
              [
                fecha,
                values,
              ],
            ) => ({
              fecha,

              label:
                formatChartDate(
                  fecha,
                ),

              pronostico:
                values.pronostico,

              inferior:
                values.inferior,

              superior:
                values.superior,
            }),
          )
      },
      [
        filteredRows,
        selectedProduct,
      ],
    )


  const metrics =
    useMemo(() => {
      const total = sum(
        filteredRows.map(
          (row) =>
            row.unidades_pronosticadas,
        ),
      )

      const lower = sum(
        filteredRows.map(
          (row) =>
            row.limite_inferior,
        ),
      )

      const upper = sum(
        filteredRows.map(
          (row) =>
            row.limite_superior,
        ),
      )

      const dates =
        Array.from(
          new Set(
            filteredRows.map(
              (row) =>
                row.fecha_inicio,
            ),
          ),
        ).sort()

      const days =
        dates.length

      const averageDaily =
        days > 0
          ? total / days
          : 0

      const productCount =
        new Set(
          filteredRows.map(
            (row) =>
              row.producto_key,
          ),
        ).size

      const uncertainty =
        total > 0
          ? (
              (
                upper -
                lower
              )
              /
              total
            ) * 100
          : null

      const models =
        Array.from(
          new Set(
            filteredRows.map(
              (row) =>
                row.modelo,
            ),
          ),
        )

      return {
        total,
        lower,
        upper,
        days,
        averageDaily,
        productCount,
        uncertainty,

        firstDate:
          dates[0] ?? null,

        lastDate:
          dates[
            dates.length - 1
          ] ?? null,

        modelLabel:
          models.join(', '),
      }
    }, [filteredRows])


  const selectedProductLabel =
    useMemo(() => {
      if (
        selectedProduct === 'ALL'
      ) {
        return 'Todos los productos'
      }

      const product =
        products.find(
          (item) =>
            String(
              item.productoKey,
            ) ===
            selectedProduct,
        )

      if (!product) {
        return 'Producto'
      }

      return `${product.producto} · ${product.sku}`
    }, [
      products,
      selectedProduct,
    ])


  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredRows.length
        /
        PAGE_SIZE,
      ),
    )


  const safePage =
    Math.min(
      currentPage,
      totalPages,
    )


  const paginatedRows =
    useMemo(() => {
      const start =
        (
          safePage - 1
        )
        *
        PAGE_SIZE

      return filteredRows.slice(
        start,
        start + PAGE_SIZE,
      )
    }, [
      filteredRows,
      safePage,
    ])


  const firstVisibleRow =
    filteredRows.length === 0
      ? 0
      : (
          (
            safePage - 1
          )
          *
          PAGE_SIZE
        ) + 1


  const lastVisibleRow =
    Math.min(
      safePage * PAGE_SIZE,
      filteredRows.length,
    )


  if (
    loading &&
    demandForecast.length === 0
  ) {
    return (
      <section className="ai-panel demand-forecast-section">
        <div className="demand-forecast-empty">
          Cargando pronóstico de demanda...
        </div>
      </section>
    )
  }


  return (
    <section className="ai-panel demand-forecast-section">
      <div className="demand-forecast-heading">
        <div>
          <span className="eyebrow">
            Forecast de demanda
          </span>

          <h3>
            Demanda diaria proyectada
          </h3>

          <p>
            Pronóstico diario de unidades por
            producto, con límites de incertidumbre
            y horizonte operativo.
          </p>
        </div>


        <div className="demand-forecast-model">
          <span>
            Modelo vigente
          </span>

          <strong>
            {metrics.modelLabel
              || 'No disponible'}
          </strong>

          <small>
            {metrics.days} días
          </small>
        </div>
      </div>


      {demandForecast.length === 0 ? (
        <div className="demand-forecast-empty">
          No existen pronósticos de demanda
          disponibles para la ejecución actual.
        </div>
      ) : (
        <>
          <div className="demand-forecast-toolbar">
            <label className="demand-forecast-filter">
              <span>
                Producto
              </span>

              <select
                value={selectedProduct}
                onChange={
                  (event) => {
                    setSelectedProduct(
                      event.target.value,
                    )

                    setCurrentPage(1)
                  }
                }
              >
                <option value="ALL">
                  Todos los productos
                </option>

                {products.map(
                  (product) => (
                    <option
                      key={
                        product.productoKey
                      }
                      value={
                        product.productoKey
                      }
                    >
                      {product.producto}
                      {' · '}
                      {product.sku}
                    </option>
                  ),
                )}
              </select>
            </label>


            <div className="demand-forecast-selection">
              <span>
                Vista actual
              </span>

              <strong>
                {selectedProductLabel}
              </strong>
            </div>
          </div>


          <div className="demand-forecast-kpis">
            <article className="demand-forecast-kpi demand-forecast-kpi-primary">
              <span>
                Demanda proyectada
              </span>

              <strong>
                {formatNumber(
                  metrics.total,
                  1,
                )}
              </strong>

              <small>
                Unidades del horizonte
              </small>
            </article>


            <article className="demand-forecast-kpi">
              <span>
                Escenario inferior
              </span>

              <strong>
                {formatNumber(
                  metrics.lower,
                  1,
                )}
              </strong>

              <small>
                Límite agregado
              </small>
            </article>


            <article className="demand-forecast-kpi">
              <span>
                Escenario superior
              </span>

              <strong>
                {formatNumber(
                  metrics.upper,
                  1,
                )}
              </strong>

              <small>
                Límite agregado
              </small>
            </article>


            <article className="demand-forecast-kpi demand-forecast-kpi-warning">
              <span>
                Amplitud relativa
              </span>

              <strong>
                {formatPercentage(
                  metrics.uncertainty,
                )}
              </strong>

              <small>
                Superior menos inferior
              </small>
            </article>


            <article className="demand-forecast-kpi">
              <span>
                Promedio diario
              </span>

              <strong>
                {formatNumber(
                  metrics.averageDaily,
                  1,
                )}
              </strong>

              <small>
                Unidades por día
              </small>
            </article>


            <article className="demand-forecast-kpi">
              <span>
                Productos
              </span>

              <strong>
                {metrics.productCount}
              </strong>

              <small>
                Incluidos en la vista
              </small>
            </article>
          </div>


          <div className="demand-forecast-content-grid">
            <article className="demand-forecast-chart-card">
              <div className="demand-forecast-subheading">
                <div>
                  <strong>
                    Evolución diaria
                  </strong>

                  <span>
                    Pronóstico central y banda
                    operativa de incertidumbre.
                  </span>
                </div>

                {metrics.firstDate &&
                metrics.lastDate ? (
                  <small>
                    {formatDate(
                      metrics.firstDate,
                    )}
                    {' — '}
                    {formatDate(
                      metrics.lastDate,
                    )}
                  </small>
                ) : null}
              </div>


              <div className="demand-forecast-chart">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <LineChart
                    data={chartRows}
                    margin={{
                      top: 12,
                      right: 18,
                      left: 4,
                      bottom: 4,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 4"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={26}
                    />

                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={58}
                      tickFormatter={
                        (value) =>
                          formatNumber(
                            Number(value),
                            0,
                          )
                      }
                    />

                    <Tooltip />

                    <Legend />

                    <Line
                      type="monotone"
                      dataKey="inferior"
                      name="Límite inferior"
                      stroke="#98a2b3"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                    />

                    <Line
                      type="monotone"
                      dataKey="pronostico"
                      name="Demanda"
                      stroke="#176b5b"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{
                        r: 5,
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="superior"
                      name="Límite superior"
                      stroke="#1570ef"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>


            <article className="demand-forecast-context-card">
              <span className="eyebrow">
                Lectura ejecutiva
              </span>

              <h4>
                Capacidad y abastecimiento
              </h4>

              <div className="demand-forecast-context-list">
                <div>
                  <span>
                    Demanda central
                  </span>

                  <strong>
                    {formatNumber(
                      metrics.total,
                      1,
                    )} uds.
                  </strong>
                </div>


                <div>
                  <span>
                    Promedio diario
                  </span>

                  <strong>
                    {formatNumber(
                      metrics.averageDaily,
                      1,
                    )} uds.
                  </strong>
                </div>


                <div>
                  <span>
                    Cobertura temporal
                  </span>

                  <strong>
                    {metrics.days} días
                  </strong>
                </div>


                <div>
                  <span>
                    Productos
                  </span>

                  <strong>
                    {metrics.productCount}
                  </strong>
                </div>
              </div>


              <p className="demand-forecast-note">
                Utiliza esta proyección como
                referencia de planificación.
                Si el origen es DEMO, no debe
                interpretarse como garantía de
                demanda real futura.
              </p>
            </article>
          </div>


          <div className="demand-forecast-table-section">
            <div className="demand-forecast-subheading">
              <div>
                <strong>
                  Detalle diario
                </strong>

                <span>
                  {filteredRows.length}
                  {' '}
                  registros en la vista.
                </span>
              </div>

              <small>
                {firstVisibleRow}
                {'–'}
                {lastVisibleRow}
                {' de '}
                {filteredRows.length}
              </small>
            </div>


            <div className="demand-forecast-table-wrapper">
              <table className="demand-forecast-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Categoría</th>

                    <th className="demand-number-column">
                      Demanda
                    </th>

                    <th className="demand-number-column">
                      Inferior
                    </th>

                    <th className="demand-number-column">
                      Superior
                    </th>

                    <th className="demand-number-column">
                      Amplitud
                    </th>
                  </tr>
                </thead>


                <tbody>
                  {paginatedRows.map(
                    (row) => (
                      <tr
                        key={
                          `${row.producto_key}-${row.fecha_inicio}`
                        }
                      >
                        <td>
                          {formatDate(
                            row.fecha_inicio,
                          )}
                        </td>

                        <td>
                          <strong>
                            {row.producto}
                          </strong>

                          <span>
                            {row.sku}
                          </span>
                        </td>

                        <td>
                          {row.categoria
                            ?? 'Sin categoría'}
                        </td>

                        <td className="demand-number-column">
                          {formatNumber(
                            row.unidades_pronosticadas,
                            2,
                          )}
                        </td>

                        <td className="demand-number-column">
                          {formatNumber(
                            row.limite_inferior,
                            2,
                          )}
                        </td>

                        <td className="demand-number-column">
                          {formatNumber(
                            row.limite_superior,
                            2,
                          )}
                        </td>

                        <td className="demand-number-column">
                          {formatPercentage(
                            row.amplitud_intervalo_pct,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>


            {totalPages > 1 ? (
              <div className="demand-pagination">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={
                    safePage <= 1
                  }
                  onClick={() =>
                    setCurrentPage(
                      Math.max(
                        1,
                        safePage - 1,
                      ),
                    )
                  }
                >
                  Anterior
                </button>

                <span>
                  Página {safePage}
                  {' de '}
                  {totalPages}
                </span>

                <button
                  type="button"
                  className="button button-secondary"
                  disabled={
                    safePage >=
                    totalPages
                  }
                  onClick={() =>
                    setCurrentPage(
                      Math.min(
                        totalPages,
                        safePage + 1,
                      ),
                    )
                  }
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}
