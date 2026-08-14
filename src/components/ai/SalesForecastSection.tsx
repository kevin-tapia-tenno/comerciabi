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
  AISalesForecast,
} from '../../lib/ai-service'

import '../../styles/sales-forecast.css'


interface SalesForecastSectionProps {
  salesForecast: AISalesForecast[]
  currency: string
  loading?: boolean
}


interface ProductOption {
  productoKey: number
  sku: string
  producto: string
  categoria: string | null
}


interface SalesChartRow {
  periodo: string
  label: string
  pronostico: number
  inferior: number
  superior: number
}


function formatCurrency(
  value: number | null | undefined,
  currency: string,
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
      style: 'currency',
      currency,
      maximumFractionDigits,
    },
  ).format(value)
}


function formatCompactCurrency(
  value: number,
  currency: string,
): string {
  return new Intl.NumberFormat(
    'es-PE',
    {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
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


function formatMonth(
  value: string,
): string {
  const date = new Date(
    `${value}T00:00:00`,
  )

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const formatted =
    new Intl.DateTimeFormat(
      'es-PE',
      {
        month: 'short',
        year: 'numeric',
      },
    ).format(date)

  return formatted
    .replace('.', '')
    .replace(/^./, (character) =>
      character.toUpperCase(),
    )
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


export function SalesForecastSection({
  salesForecast,
  currency,
  loading = false,
}: SalesForecastSectionProps) {
  const [
    selectedProduct,
    setSelectedProduct,
  ] = useState('ALL')


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
      of salesForecast
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

            categoria:
              row.categoria ?? null,
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
  }, [salesForecast])


  const filteredRows =
    useMemo(() => {
      if (
        selectedProduct === 'ALL'
      ) {
        return salesForecast
          .slice()
          .sort(
            (
              left,
              right,
            ) => {
              const period =
                left.periodo.localeCompare(
                  right.periodo,
                )

              if (period !== 0) {
                return period
              }

              return left.producto.localeCompare(
                right.producto,
                'es',
              )
            },
          )
      }

      const productKey =
        Number(selectedProduct)

      return salesForecast
        .filter(
          (row) =>
            row.producto_key ===
            productKey,
        )
        .slice()
        .sort(
          (
            left,
            right,
          ) =>
            left.periodo.localeCompare(
              right.periodo,
            ),
        )
    }, [
      salesForecast,
      selectedProduct,
    ])


  const chartRows =
    useMemo<SalesChartRow[]>(
      () => {
        if (
          selectedProduct !== 'ALL'
        ) {
          return filteredRows.map(
            (row) => ({
              periodo:
                row.periodo,

              label:
                formatMonth(
                  row.periodo,
                ),

              pronostico:
                row.venta_neta_pronosticada,

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
              row.periodo,
            ) ?? {
              pronostico: 0,
              inferior: 0,
              superior: 0,
            }

          current.pronostico +=
            row.venta_neta_pronosticada

          current.inferior +=
            row.limite_inferior

          current.superior +=
            row.limite_superior

          grouped.set(
            row.periodo,
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
                periodo,
                values,
              ],
            ) => ({
              periodo,

              label:
                formatMonth(
                  periodo,
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


  const metrics = useMemo(
    () => {
      const central = sum(
        filteredRows.map(
          (row) =>
            row.venta_neta_pronosticada,
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

      const uncertainty =
        central > 0
          ? (
              (
                upper -
                lower
              )
              /
              central
            ) * 100
          : null

      const periods =
        Array.from(
          new Set(
            filteredRows.map(
              (row) =>
                row.periodo,
            ),
          ),
        ).sort()

      const productCount =
        new Set(
          filteredRows.map(
            (row) =>
              row.producto_key,
          ),
        ).size

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
        central,
        lower,
        upper,
        uncertainty,
        productCount,
        firstPeriod:
          periods[0] ?? null,
        lastPeriod:
          periods[
            periods.length - 1
          ] ?? null,
        modelLabel:
          models.join(', '),
      }
    },
    [filteredRows],
  )


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


  if (
    loading &&
    salesForecast.length === 0
  ) {
    return (
      <section className="ai-panel sales-forecast-section">
        <div className="sales-forecast-empty">
          Cargando pronóstico de ventas...
        </div>
      </section>
    )
  }


  return (
    <section className="ai-panel sales-forecast-section">
      <div className="sales-forecast-heading">
        <div>
          <span className="eyebrow">
            Forecast de ventas
          </span>

          <h3>
            Pronóstico comercial
          </h3>

          <p>
            Proyección de venta neta por
            producto y periodo, incluyendo
            los límites inferior y superior
            de incertidumbre.
          </p>
        </div>


        <div className="sales-forecast-model">
          <span>
            Modelo vigente
          </span>

          <strong>
            {metrics.modelLabel
              || 'No disponible'}
          </strong>
        </div>
      </div>


      {salesForecast.length === 0 ? (
        <div className="sales-forecast-empty">
          No existen pronósticos de ventas
          disponibles para la ejecución
          actual.
        </div>
      ) : (
        <>
          <div className="sales-forecast-toolbar">
            <label className="sales-forecast-filter">
              <span>
                Producto
              </span>

              <select
                value={selectedProduct}
                onChange={
                  (event) =>
                    setSelectedProduct(
                      event.target.value,
                    )
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


            <div className="sales-forecast-selection">
              <span>
                Vista actual
              </span>

              <strong>
                {selectedProductLabel}
              </strong>
            </div>
          </div>


          <div className="sales-forecast-kpis">
            <article className="sales-forecast-kpi sales-forecast-kpi-primary">
              <span>
                Venta pronosticada
              </span>

              <strong>
                {formatCurrency(
                  metrics.central,
                  currency,
                )}
              </strong>

              <small>
                Total del horizonte
              </small>
            </article>


            <article className="sales-forecast-kpi">
              <span>
                Escenario inferior
              </span>

              <strong>
                {formatCurrency(
                  metrics.lower,
                  currency,
                )}
              </strong>

              <small>
                Límite agregado
              </small>
            </article>


            <article className="sales-forecast-kpi">
              <span>
                Escenario superior
              </span>

              <strong>
                {formatCurrency(
                  metrics.upper,
                  currency,
                )}
              </strong>

              <small>
                Límite agregado
              </small>
            </article>


            <article className="sales-forecast-kpi sales-forecast-kpi-warning">
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


            <article className="sales-forecast-kpi">
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


          <div className="sales-forecast-content-grid">
            <article className="sales-forecast-chart-card">
              <div className="sales-forecast-subheading">
                <div>
                  <strong>
                    Evolución del pronóstico
                  </strong>

                  <span>
                    Pronóstico central y
                    límites de incertidumbre.
                  </span>
                </div>

                {metrics.firstPeriod &&
                metrics.lastPeriod ? (
                  <small>
                    {formatMonth(
                      metrics.firstPeriod,
                    )}
                    {' — '}
                    {formatMonth(
                      metrics.lastPeriod,
                    )}
                  </small>
                ) : null}
              </div>


              <div className="sales-forecast-chart">
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
                    />

                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={82}
                      tickFormatter={
                        (value) =>
                          formatCompactCurrency(
                            Number(value),
                            currency,
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
                      name="Pronóstico"
                      stroke="#176b5b"
                      strokeWidth={3}
                      activeDot={{
                        r: 5,
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="superior"
                      name="Límite superior"
                      stroke="#f79009"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>


            <article className="sales-forecast-context-card">
              <span className="eyebrow">
                Lectura ejecutiva
              </span>

              <h4>
                Cómo interpretar esta vista
              </h4>

              <div className="sales-forecast-context-list">
                <div>
                  <span>
                    Central
                  </span>

                  <strong>
                    {formatCurrency(
                      metrics.central,
                      currency,
                    )}
                  </strong>

                  <small>
                    Escenario esperado del
                    modelo.
                  </small>
                </div>


                <div>
                  <span>
                    Rango operativo
                  </span>

                  <strong>
                    {formatCurrency(
                      metrics.lower,
                      currency,
                    )}
                    {' — '}
                    {formatCurrency(
                      metrics.upper,
                      currency,
                    )}
                  </strong>

                  <small>
                    Banda de incertidumbre
                    disponible.
                  </small>
                </div>


                <div>
                  <span>
                    Cobertura
                  </span>

                  <strong>
                    {metrics.productCount}
                    {' '}
                    {metrics.productCount === 1
                      ? 'producto'
                      : 'productos'}
                  </strong>

                  <small>
                    Según el filtro
                    seleccionado.
                  </small>
                </div>
              </div>


              <p className="sales-forecast-note">
                Cuando el origen de datos sea
                DEMO, esta proyección debe
                interpretarse como referencia
                demostrativa y no como
                garantía estadística.
              </p>
            </article>
          </div>


          <div className="sales-forecast-table-section">
            <div className="sales-forecast-subheading">
              <div>
                <strong>
                  Detalle del horizonte
                </strong>

                <span>
                  {filteredRows.length}
                  {' '}
                  registros en la vista
                  seleccionada.
                </span>
              </div>
            </div>


            <div className="sales-forecast-table-wrapper">
              <table className="sales-forecast-table">
                <thead>
                  <tr>
                    <th>
                      Periodo
                    </th>

                    <th>
                      Producto
                    </th>

                    <th>
                      Categoría
                    </th>

                    <th className="sales-number-column">
                      Pronóstico
                    </th>

                    <th className="sales-number-column">
                      Inferior
                    </th>

                    <th className="sales-number-column">
                      Superior
                    </th>

                    <th className="sales-number-column">
                      Amplitud
                    </th>
                  </tr>
                </thead>


                <tbody>
                  {filteredRows.map(
                    (row) => (
                      <tr
                        key={
                          `${row.producto_key}-${row.periodo}`
                        }
                      >
                        <td>
                          {formatMonth(
                            row.periodo,
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

                        <td className="sales-number-column">
                          {formatCurrency(
                            row.venta_neta_pronosticada,
                            currency,
                            2,
                          )}
                        </td>

                        <td className="sales-number-column">
                          {formatCurrency(
                            row.limite_inferior,
                            currency,
                            2,
                          )}
                        </td>

                        <td className="sales-number-column">
                          {formatCurrency(
                            row.limite_superior,
                            currency,
                            2,
                          )}
                        </td>

                        <td className="sales-number-column">
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
          </div>
        </>
      )}
    </section>
  )
}