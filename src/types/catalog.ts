export type ClientType = 'PERSONA' | 'EMPRESA'

export type DocumentType =
  | 'DNI'
  | 'RUC'
  | 'CE'
  | 'PASAPORTE'
  | 'OTRO'

export type ClientSegment =
  | 'MINORISTA'
  | 'CORPORATIVO'
  | 'MAYORISTA'
  | 'OTRO'

export type UnitOfMeasure =
  | 'UNIDAD'
  | 'CAJA'
  | 'PAQUETE'
  | 'KILOGRAMO'
  | 'LITRO'

export interface Client {
  id: string
  empresa_id: string
  tipo_cliente: ClientType
  tipo_documento: DocumentType | null
  numero_documento: string | null
  nombre_completo: string
  email: string | null
  telefono: string | null
  segmento: ClientSegment | null
  direccion: string | null
  activo: boolean
  creado_at: string
  actualizado_at: string
}

export interface Category {
  id: string
  empresa_id: string
  nombre: string
  descripcion: string | null
  activo: boolean
  creado_at: string
  actualizado_at: string
}

export interface Product {
  id: string
  empresa_id: string
  categoria_id: string
  sku: string
  nombre: string
  descripcion: string | null
  unidad_medida: UnitOfMeasure
  costo_actual: number
  precio_venta: number
  activo: boolean
  creado_at: string
  actualizado_at: string
}

export const clientTypeLabels: Record<ClientType, string> = {
  PERSONA: 'Persona',
  EMPRESA: 'Empresa',
}

export const documentTypeLabels: Record<DocumentType, string> = {
  DNI: 'DNI',
  RUC: 'RUC',
  CE: 'Carné de extranjería',
  PASAPORTE: 'Pasaporte',
  OTRO: 'Otro',
}

export const clientSegmentLabels: Record<ClientSegment, string> = {
  MINORISTA: 'Minorista',
  CORPORATIVO: 'Corporativo',
  MAYORISTA: 'Mayorista',
  OTRO: 'Otro',
}

export const unitOfMeasureLabels: Record<UnitOfMeasure, string> = {
  UNIDAD: 'Unidad',
  CAJA: 'Caja',
  PAQUETE: 'Paquete',
  KILOGRAMO: 'Kilogramo',
  LITRO: 'Litro',
}
