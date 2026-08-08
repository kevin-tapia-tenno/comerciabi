import { supabase } from './supabase'
import type {
  DashboardData,
  DashboardFilters,
} from '../types/dashboard'

interface LoadDashboardParams {
  companyId: string
  filters: DashboardFilters
}

export async function loadCommercialDashboard({
  companyId,
  filters,
}: LoadDashboardParams): Promise<DashboardData> {
  const { data, error } = await supabase.rpc(
    'obtener_dashboard_comercial',
    {
      p_empresa_id: companyId,
      p_fecha_desde: filters.desde,
      p_fecha_hasta: filters.hasta,
    },
  )

  if (error) {
    throw new Error(
      `No se pudo consultar el dashboard: ${error.message}`,
    )
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(
      'Supabase no devolvió una respuesta válida para el dashboard.',
    )
  }

  return data as unknown as DashboardData
}
