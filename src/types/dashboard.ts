export interface DashboardPeriod {
  desde: string
  hasta: string
}

export interface DashboardSummary {
  facturacion_total: number
  ventas_confirmadas: number
  ventas_netas: number
  utilidad_bruta: number
  margen_bruto_pct: number
  ticket_promedio: number
  clientes_compradores: number
  productos_vendidos: number
  unidades_vendidas: number
  posiciones_stock_critico: number
  posiciones_agotadas: number
  valor_inventario: number
}

export interface MonthlySalesPoint {
  mes: string
  facturacion: number
  operaciones: number
}

export interface CategorySalesPoint {
  categoria: string
  ventas_netas: number
  unidades: number
}

export interface ChannelSalesPoint {
  canal: string
  facturacion: number
  operaciones: number
}

export interface SellerSalesPoint {
  vendedor_empresa_id: string
  vendedor: string
  facturacion: number
  operaciones: number
}

export interface TopProductPoint {
  producto_id: string
  sku: string
  producto: string
  cantidad: number
  ventas_netas: number
  utilidad_bruta: number
}

export interface CriticalStockRow {
  producto_id: string
  sku: string
  producto: string
  almacen_id: string
  almacen: string
  stock_actual: number
  stock_minimo: number
  agotado: boolean
}

export interface RecentSaleRow {
  id: string
  codigo: string
  fecha_venta: string
  cliente: string
  vendedor: string
  canal: string
  total: number
  moneda: string
}

export interface DashboardData {
  periodo: DashboardPeriod
  resumen: DashboardSummary
  ventas_mensuales: MonthlySalesPoint[]
  ventas_categoria: CategorySalesPoint[]
  ventas_canal: ChannelSalesPoint[]
  ventas_vendedor: SellerSalesPoint[]
  top_productos: TopProductPoint[]
  stock_critico: CriticalStockRow[]
  ultimas_ventas: RecentSaleRow[]
}

export interface DashboardFilters {
  desde: string
  hasta: string
}
