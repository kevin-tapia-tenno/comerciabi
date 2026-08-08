import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { loadCommercialDashboard } from '../lib/dashboard-service'
import type {
  DashboardData,
  DashboardFilters,
} from '../types/dashboard'

function getDatePartsInTimeZone(
  date: Date,
  timeZone: string,
): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = new Map(
    parts.map((part) => [part.type, part.value]),
  )

  return {
    year: values.get('year') ?? '1970',
    month: values.get('month') ?? '01',
    day: values.get('day') ?? '01',
  }
}

function getTodayIso(timeZone: string): string {
  const { year, month, day } = getDatePartsInTimeZone(
    new Date(),
    timeZone,
  )

  return `${year}-${month}-${day}`
}

function getYearStartIso(todayIso: string): string {
  return `${todayIso.slice(0, 4)}-01-01`
}

function getMonthStartIso(todayIso: string): string {
  return `${todayIso.slice(0, 7)}-01`
}

function getMonthStartWithOffset(
  todayIso: string,
  offsetMonths: number,
): string {
  const [year, month] = todayIso
    .split('-')
    .slice(0, 2)
    .map(Number)

  const date = new Date(
    Date.UTC(year, month - 1 + offsetMonths, 1),
  )

  return date.toISOString().slice(0, 10)
}

function formatMonthLabel(monthIso: string): string {
  const date = new Date(`${monthIso}T12:00:00Z`)

  return new Intl.DateTimeFormat('es-PE', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
    .format(date)
    .replace('.', '')
}

function formatDateTime(
  value: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value))
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('es-PE', {
    maximumFractionDigits: 3,
  }).format(value)
}

interface EmptyChartProps {
  message: string
}

function EmptyChart({ message }: EmptyChartProps) {
  return (
    <div className="reports-empty-chart">
      <strong>Sin datos para mostrar</strong>
      <span>{message}</span>
    </div>
  )
}

export function ReportsPage() {
  const { company } = useAuth()
  const timeZone = company?.zona_horaria ?? 'America/Lima'
  const todayIso = useMemo(
    () => getTodayIso(timeZone),
    [timeZone],
  )

  const initialFilters = useMemo<DashboardFilters>(
    () => ({
      desde: getYearStartIso(todayIso),
      hasta: todayIso,
    }),
    [todayIso],
  )

  const [draftFilters, setDraftFilters] =
    useState<DashboardFilters>(initialFilters)
  const [appliedFilters, setAppliedFilters] =
    useState<DashboardFilters>(initialFilters)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [filterError, setFilterError] = useState<string | null>(null)

  useEffect(() => {
    if (!company?.id) {
      return
    }

    let active = true

    const load = async () => {
      setLoading(true)
      setErrorMessage(null)

      try {
        const result = await loadCommercialDashboard({
          companyId: company.id,
          filters: appliedFilters,
        })

        if (!active) return

        setData(result)
      } catch (error) {
        if (!active) return

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'No se pudo consultar el dashboard.',
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [appliedFilters, company?.id])

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: company?.moneda ?? 'PEN',
      maximumFractionDigits: 2,
    }),
    [company?.moneda],
  )

  const compactCurrencyFormatter = useMemo(
    () => new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: company?.moneda ?? 'PEN',
      notation: 'compact',
      maximumFractionDigits: 1,
    }),
    [company?.moneda],
  )

  const percentFormatter = useMemo(
    () => new Intl.NumberFormat('es-PE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }),
    [],
  )

  const monthlyChartData = useMemo(
    () => (data?.ventas_mensuales ?? []).map((item) => ({
      ...item,
      etiqueta: formatMonthLabel(item.mes),
    })),
    [data?.ventas_mensuales],
  )

  const topProductChartData = useMemo(
    () => [...(data?.top_productos ?? [])]
      .slice(0, 8)
      .reverse(),
    [data?.top_productos],
  )

  const applyFilters = () => {
    if (!draftFilters.desde || !draftFilters.hasta) {
      setFilterError('Debes seleccionar ambas fechas.')
      return
    }

    if (draftFilters.desde > draftFilters.hasta) {
      setFilterError(
        'La fecha inicial no puede ser posterior a la fecha final.',
      )
      return
    }

    if (draftFilters.hasta > todayIso) {
      setFilterError(
        'La fecha final no puede ser posterior al día de hoy.',
      )
      return
    }

    setFilterError(null)
    setAppliedFilters({ ...draftFilters })
  }

  const applyPreset = (
    preset: 'MONTH' | 'THREE_MONTHS' | 'YEAR',
  ) => {
    let nextFilters: DashboardFilters

    if (preset === 'MONTH') {
      nextFilters = {
        desde: getMonthStartIso(todayIso),
        hasta: todayIso,
      }
    } else if (preset === 'THREE_MONTHS') {
      nextFilters = {
        desde: getMonthStartWithOffset(todayIso, -2),
        hasta: todayIso,
      }
    } else {
      nextFilters = {
        desde: getYearStartIso(todayIso),
        hasta: todayIso,
      }
    }

    setDraftFilters(nextFilters)
    setAppliedFilters(nextFilters)
    setFilterError(null)
  }

  const summary = data?.resumen

  return (
    <div className="page-stack reports-page">
      <section className="reports-hero">
        <div>
          <span className="eyebrow">Fase 11 · Analítica comercial</span>
          <h2>Reportes e indicadores</h2>
          <p>
            Analiza ventas confirmadas, rentabilidad, clientes, productos e
            inventario usando información protegida de {company?.nombre}.
          </p>
        </div>

        <div className="reports-hero-status">
          <span>{loading ? 'Actualizando datos' : 'Datos actualizados'}</span>
          <strong>
            {appliedFilters.desde} → {appliedFilters.hasta}
          </strong>
        </div>
      </section>

      <section className="panel reports-filter-panel">
        <div className="reports-filter-heading">
          <div>
            <span className="eyebrow">Periodo de análisis</span>
            <h3>Filtrar dashboard</h3>
          </div>

          <div className="reports-presets" aria-label="Periodos rápidos">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => applyPreset('MONTH')}
              disabled={loading}
            >
              Este mes
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => applyPreset('THREE_MONTHS')}
              disabled={loading}
            >
              Últimos 3 meses
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => applyPreset('YEAR')}
              disabled={loading}
            >
              Este año
            </button>
          </div>
        </div>

        <div className="reports-filter-grid">
          <label className="reports-field">
            <span>Fecha inicial</span>
            <input
              type="date"
              value={draftFilters.desde}
              max={todayIso}
              onChange={(event) => {
                setDraftFilters((current) => ({
                  ...current,
                  desde: event.target.value,
                }))
                setFilterError(null)
              }}
            />
          </label>

          <label className="reports-field">
            <span>Fecha final</span>
            <input
              type="date"
              value={draftFilters.hasta}
              max={todayIso}
              onChange={(event) => {
                setDraftFilters((current) => ({
                  ...current,
                  hasta: event.target.value,
                }))
                setFilterError(null)
              }}
            />
          </label>

          <button
            type="button"
            className="button button-primary reports-apply-button"
            onClick={applyFilters}
            disabled={loading}
          >
            {loading ? 'Consultando...' : 'Aplicar periodo'}
          </button>
        </div>

        {filterError ? (
          <div className="alert alert-error reports-filter-alert">
            <strong>Revisa el periodo seleccionado.</strong>
            <span>{filterError}</span>
          </div>
        ) : null}
      </section>

      {errorMessage ? (
        <section className="alert alert-error">
          <strong>No se pudieron cargar los reportes.</strong>
          <span>{errorMessage}</span>
        </section>
      ) : null}

      {!data && loading ? (
        <section className="panel reports-loading-panel">
          <div className="loading-spinner" aria-hidden="true" />
          <div>
            <strong>Construyendo indicadores</strong>
            <span>Consultando ventas, utilidad e inventario...</span>
          </div>
        </section>
      ) : null}

      {data && summary ? (
        <>
          <section className="reports-kpi-grid">
            <article className="reports-kpi-card reports-kpi-primary">
              <span>Facturación del periodo</span>
              <strong>
                {currencyFormatter.format(summary.facturacion_total)}
              </strong>
              <small>Solo ventas confirmadas, incluido impuesto</small>
            </article>

            <article className="reports-kpi-card">
              <span>Ventas confirmadas</span>
              <strong>{summary.ventas_confirmadas}</strong>
              <small>Operaciones del periodo seleccionado</small>
            </article>

            <article className="reports-kpi-card">
              <span>Utilidad bruta</span>
              <strong>
                {currencyFormatter.format(summary.utilidad_bruta)}
              </strong>
              <small>Venta neta menos costo histórico</small>
            </article>

            <article className="reports-kpi-card">
              <span>Margen bruto</span>
              <strong>
                {percentFormatter.format(summary.margen_bruto_pct)}%
              </strong>
              <small>Utilidad bruta / venta neta</small>
            </article>

            <article className="reports-kpi-card">
              <span>Ticket promedio</span>
              <strong>
                {currencyFormatter.format(summary.ticket_promedio)}
              </strong>
              <small>Facturación / ventas confirmadas</small>
            </article>

            <article className="reports-kpi-card">
              <span>Clientes compradores</span>
              <strong>{summary.clientes_compradores}</strong>
              <small>Clientes únicos con compra confirmada</small>
            </article>

            <article className="reports-kpi-card">
              <span>Productos vendidos</span>
              <strong>{summary.productos_vendidos}</strong>
              <small>
                {formatQuantity(summary.unidades_vendidas)} unidades vendidas
              </small>
            </article>

            <article className="reports-kpi-card reports-kpi-warning">
              <span>Stock crítico</span>
              <strong>{summary.posiciones_stock_critico}</strong>
              <small>Posiciones de almacén en o bajo su mínimo</small>
            </article>

            <article className="reports-kpi-card reports-kpi-danger">
              <span>Agotados</span>
              <strong>{summary.posiciones_agotadas}</strong>
              <small>Posiciones de almacén con stock en cero</small>
            </article>

            <article className="reports-kpi-card">
              <span>Valor de inventario</span>
              <strong>
                {currencyFormatter.format(summary.valor_inventario)}
              </strong>
              <small>Stock actual valorizado al costo vigente</small>
            </article>
          </section>

          <section className="reports-chart-grid reports-chart-grid-wide">
            <article className="panel reports-chart-card reports-chart-span-2">
              <div className="reports-section-heading">
                <div>
                  <span className="eyebrow">Tendencia</span>
                  <h3>Facturación mensual</h3>
                  <p>Incluye impuesto y solo ventas confirmadas.</p>
                </div>
              </div>

              <div className="reports-chart-area">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={monthlyChartData}
                    margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="etiqueta" />
                    <YAxis
                      width={86}
                      tickFormatter={(value) =>
                        compactCurrencyFormatter.format(Number(value))
                      }
                    />
                    <Tooltip
                      formatter={(value) => [
                        currencyFormatter.format(Number(value)),
                        'Facturación',
                      ]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="facturacion"
                      name="Facturación"
                      stroke="var(--primary)"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="panel reports-chart-card">
              <div className="reports-section-heading">
                <div>
                  <span className="eyebrow">Mix comercial</span>
                  <h3>Ventas por categoría</h3>
                  <p>Importe neto antes de impuesto.</p>
                </div>
              </div>

              {data.ventas_categoria.length === 0 ? (
                <EmptyChart message="No existen productos vendidos en el periodo." />
              ) : (
                <div className="reports-chart-area">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.ventas_categoria}
                      margin={{ top: 8, right: 12, left: 0, bottom: 36 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="categoria"
                        angle={-25}
                        textAnchor="end"
                        interval={0}
                        height={62}
                      />
                      <YAxis
                        width={78}
                        tickFormatter={(value) =>
                          compactCurrencyFormatter.format(Number(value))
                        }
                      />
                      <Tooltip
                        formatter={(value) => [
                          currencyFormatter.format(Number(value)),
                          'Venta neta',
                        ]}
                      />
                      <Bar
                        dataKey="ventas_netas"
                        name="Venta neta"
                        fill="var(--primary)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="panel reports-chart-card">
              <div className="reports-section-heading">
                <div>
                  <span className="eyebrow">Canales</span>
                  <h3>Facturación por canal</h3>
                  <p>Distribución del total facturado.</p>
                </div>
              </div>

              {data.ventas_canal.length === 0 ? (
                <EmptyChart message="No existen ventas confirmadas por canal." />
              ) : (
                <div className="reports-chart-area">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.ventas_canal}
                      margin={{ top: 8, right: 12, left: 0, bottom: 36 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="canal"
                        angle={-25}
                        textAnchor="end"
                        interval={0}
                        height={62}
                      />
                      <YAxis
                        width={78}
                        tickFormatter={(value) =>
                          compactCurrencyFormatter.format(Number(value))
                        }
                      />
                      <Tooltip
                        formatter={(value) => [
                          currencyFormatter.format(Number(value)),
                          'Facturación',
                        ]}
                      />
                      <Bar
                        dataKey="facturacion"
                        name="Facturación"
                        fill="var(--primary-dark)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="panel reports-chart-card">
              <div className="reports-section-heading">
                <div>
                  <span className="eyebrow">Equipo comercial</span>
                  <h3>Facturación por vendedor</h3>
                  <p>Ventas confirmadas atribuidas al vendedor.</p>
                </div>
              </div>

              {data.ventas_vendedor.length === 0 ? (
                <EmptyChart message="No existen ventas confirmadas por vendedor." />
              ) : (
                <div className="reports-chart-area">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.ventas_vendedor}
                      margin={{ top: 8, right: 12, left: 0, bottom: 44 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="vendedor"
                        angle={-25}
                        textAnchor="end"
                        interval={0}
                        height={70}
                      />
                      <YAxis
                        width={78}
                        tickFormatter={(value) =>
                          compactCurrencyFormatter.format(Number(value))
                        }
                      />
                      <Tooltip
                        formatter={(value) => [
                          currencyFormatter.format(Number(value)),
                          'Facturación',
                        ]}
                      />
                      <Bar
                        dataKey="facturacion"
                        name="Facturación"
                        fill="var(--primary)"
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>

            <article className="panel reports-chart-card">
              <div className="reports-section-heading">
                <div>
                  <span className="eyebrow">Productos</span>
                  <h3>Productos con mayor venta neta</h3>
                  <p>Top 8 del periodo seleccionado.</p>
                </div>
              </div>

              {topProductChartData.length === 0 ? (
                <EmptyChart message="No existen productos vendidos en el periodo." />
              ) : (
                <div className="reports-chart-area reports-chart-area-tall">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topProductChartData}
                      layout="vertical"
                      margin={{ top: 8, right: 18, left: 10, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(value) =>
                          compactCurrencyFormatter.format(Number(value))
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="producto"
                        width={130}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip
                        formatter={(value) => [
                          currencyFormatter.format(Number(value)),
                          'Venta neta',
                        ]}
                      />
                      <Bar
                        dataKey="ventas_netas"
                        name="Venta neta"
                        fill="var(--primary)"
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </article>
          </section>

          <section className="reports-table-grid">
            <article className="panel reports-table-card">
              <div className="reports-section-heading">
                <div>
                  <span className="eyebrow">Inventario</span>
                  <h3>Stock crítico</h3>
                  <p>Hasta 10 posiciones que requieren atención.</p>
                </div>
                <span className="reports-count-pill">
                  {summary.posiciones_stock_critico}
                </span>
              </div>

              {data.stock_critico.length === 0 ? (
                <div className="reports-empty-table">
                  No hay posiciones en stock crítico actualmente.
                </div>
              ) : (
                <div className="reports-table-wrapper">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Almacén</th>
                        <th>Actual</th>
                        <th>Mínimo</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.stock_critico.map((item) => (
                        <tr key={`${item.almacen_id}-${item.producto_id}`}>
                          <td>
                            <strong>{item.producto}</strong>
                            <span>{item.sku}</span>
                          </td>
                          <td>{item.almacen}</td>
                          <td>{formatQuantity(item.stock_actual)}</td>
                          <td>{formatQuantity(item.stock_minimo)}</td>
                          <td>
                            <span
                              className={
                                item.agotado
                                  ? 'reports-stock-pill reports-stock-pill-danger'
                                  : 'reports-stock-pill reports-stock-pill-warning'
                              }
                            >
                              {item.agotado ? 'Agotado' : 'Crítico'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="panel reports-table-card">
              <div className="reports-section-heading">
                <div>
                  <span className="eyebrow">Actividad</span>
                  <h3>Últimas ventas confirmadas</h3>
                  <p>Hasta 10 operaciones dentro del periodo.</p>
                </div>
              </div>

              {data.ultimas_ventas.length === 0 ? (
                <div className="reports-empty-table">
                  No existen ventas confirmadas para el periodo seleccionado.
                </div>
              ) : (
                <div className="reports-table-wrapper">
                  <table className="reports-table reports-sales-table">
                    <thead>
                      <tr>
                        <th>Venta</th>
                        <th>Fecha</th>
                        <th>Cliente</th>
                        <th>Vendedor</th>
                        <th>Canal</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ultimas_ventas.map((sale) => (
                        <tr key={sale.id}>
                          <td>
                            <strong>{sale.codigo}</strong>
                          </td>
                          <td>
                            {formatDateTime(sale.fecha_venta, timeZone)}
                          </td>
                          <td>{sale.cliente}</td>
                          <td>{sale.vendedor}</td>
                          <td>{sale.canal}</td>
                          <td>
                            <strong>
                              {new Intl.NumberFormat('es-PE', {
                                style: 'currency',
                                currency: sale.moneda,
                                maximumFractionDigits: 2,
                              }).format(sale.total)}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>

          <section className="panel reports-methodology">
            <span className="eyebrow">Criterios de cálculo</span>
            <h3>Cómo se construyen los indicadores</h3>
            <div className="reports-methodology-grid">
              <div>
                <strong>Ventas</strong>
                <span>
                  Solo se consideran ventas con estado CONFIRMADA. Borradores y
                  ventas anuladas quedan fuera del análisis.
                </span>
              </div>
              <div>
                <strong>Utilidad</strong>
                <span>
                  Se usa el costo unitario histórico guardado en cada detalle de
                  venta, no el costo actual del producto.
                </span>
              </div>
              <div>
                <strong>Inventario</strong>
                <span>
                  El stock crítico es una fotografía actual y no depende del
                  periodo comercial seleccionado.
                </span>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
