import type { DocumentType } from './catalog'

export type PurchaseStatus = 'BORRADOR' | 'CONFIRMADA' | 'ANULADA'

export interface Supplier {
  id: string
  empresa_id: string
  tipo_documento: DocumentType | null
  numero_documento: string | null
  razon_social: string
  nombre_comercial: string | null
  email: string | null
  telefono: string | null
  contacto_nombre: string | null
  direccion: string | null
  activo: boolean
  creado_at: string
  actualizado_at: string
}

export interface Purchase {
  id: string
  empresa_id: string
  codigo: string
  proveedor_id: string
  comprador_empresa_id: string
  almacen_id: string
  fecha_compra: string
  estado: PurchaseStatus
  subtotal: number
  descuento_total: number
  tasa_impuesto: number
  impuesto_total: number
  total: number
  moneda: string
  numero_comprobante: string | null
  observaciones: string | null
  motivo_anulacion: string | null
  confirmada_at: string | null
  confirmada_por: string | null
  anulada_at: string | null
  anulada_por: string | null
  creado_at: string
  actualizado_at: string
}

export interface PurchaseDetail {
  id: string
  compra_id: string
  producto_id: string
  cantidad: number
  costo_unitario: number
  subtotal_linea: number
  descuento_linea: number
  total_linea: number
  creado_at: string
  actualizado_at: string
}

export interface PurchaseLineForm {
  key: string
  producto_id: string
  cantidad: string
  costo_unitario: string
  descuento_linea: string
}

export interface PurchaseRpcResult {
  compra_id: string
  codigo: string
  subtotal: number
  descuento_total: number
  impuesto_total: number
  total: number
  estado?: PurchaseStatus
  confirmada_at?: string
  anulada_at?: string
}

export const purchaseStatusLabels: Record<PurchaseStatus, string> = {
  BORRADOR: 'Borrador',
  CONFIRMADA: 'Confirmada',
  ANULADA: 'Anulada',
}
