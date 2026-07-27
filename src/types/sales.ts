export type SaleStatus = 'BORRADOR' | 'CONFIRMADA' | 'ANULADA'

export interface Sale {
  id: string
  empresa_id: string
  codigo: string
  cliente_id: string
  vendedor_empresa_id: string
  almacen_id: string
  canal_venta_id: string
  fecha_venta: string
  estado: SaleStatus
  subtotal: number
  descuento_total: number
  tasa_impuesto: number
  impuesto_total: number
  total: number
  moneda: string
  observaciones: string | null
  motivo_anulacion: string | null
  confirmada_at: string | null
  confirmada_por: string | null
  anulada_at: string | null
  anulada_por: string | null
  creado_at: string
  actualizado_at: string
}

export interface SaleDetail {
  id: string
  venta_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  costo_unitario: number
  subtotal_linea: number
  descuento_linea: number
  total_linea: number
  creado_at: string
  actualizado_at: string
}

export interface Warehouse {
  id: string
  empresa_id: string
  nombre: string
  descripcion: string | null
  es_principal: boolean
  activo: boolean
}

export interface SalesChannel {
  id: string
  empresa_id: string
  nombre: string
  descripcion: string | null
  activo: boolean
}

export interface StockItem {
  id: string
  almacen_id: string
  producto_id: string
  stock_actual: number
  stock_minimo: number
}

export interface SaleLineForm {
  key: string
  producto_id: string
  cantidad: string
  precio_unitario: string
  descuento_linea: string
}

export const saleStatusLabels: Record<SaleStatus, string> = {
  BORRADOR: 'Borrador',
  CONFIRMADA: 'Confirmada',
  ANULADA: 'Anulada',
}
