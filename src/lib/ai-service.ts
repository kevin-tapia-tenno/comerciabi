import {
  apiGet,
  type ApiAuthContext,
} from './api-client'

import type {
  components,
  paths,
} from '../types/api.generated'


// ============================================================
// Contratos generados desde FastAPI / OpenAPI
// ============================================================


export type AIExecutiveSummary =
  components['schemas']['AIExecutiveSummary']

export type AIInsight =
  components['schemas']['AIInsight']

export type AISalesForecast =
  components['schemas']['AISalesForecast']

export type AIDemandForecast =
  components['schemas']['AIDemandForecast']

export type AIInventoryRecommendation =
  components['schemas']['AIInventoryRecommendation']


export type AISummaryResponse =
  components['schemas']['AISummaryResponse']

export type AIInsightsResponse =
  components['schemas']['AIInsightsResponse']

export type AISalesForecastResponse =
  components['schemas']['AISalesForecastResponse']

export type AIDemandForecastResponse =
  components['schemas']['AIDemandForecastResponse']

export type AIInventoryRecommendationsResponse =
  components['schemas']['AIInventoryRecommendationsResponse']

export type AIDashboardResponse =
  components['schemas']['AIDashboardResponse']


export type AIInsightSeverity =
  AIInsight['severidad']

export type AIInsightType =
  AIInsight['tipo']

export type AIInventoryRisk =
  AIInventoryRecommendation['riesgo']


// ============================================================
// Rutas
//
// "satisfies" hace que TypeScript compruebe que las rutas
// realmente existen en el OpenAPI generado.
// ============================================================


const AI_PATHS = {
  summary:
    '/api/v1/ai/summary',

  insights:
    '/api/v1/ai/insights',

  sales:
    '/api/v1/ai/forecasts/sales',

  demand:
    '/api/v1/ai/forecasts/demand',

  inventory:
    '/api/v1/ai/inventory/recommendations',

  dashboard:
    '/api/v1/ai/dashboard',
} as const satisfies Record<
  string,
  keyof paths
>


// ============================================================
// Filtros
// ============================================================


export interface AIInsightsFilters {
  severidad?: AIInsightSeverity
  tipo?: AIInsightType
  limit?: number
  offset?: number
}


export interface AIForecastFilters {
  productoKey?: number
  limit?: number
  offset?: number
}


export interface AIInventoryFilters {
  riesgo?: AIInventoryRisk
  limit?: number
  offset?: number
}


// ============================================================
// Servicio
// ============================================================


export function createAIService(
  auth: ApiAuthContext,
) {
  async function getSummary(
    signal?: AbortSignal,
  ): Promise<AISummaryResponse> {
    return apiGet<AISummaryResponse>(
      auth,
      AI_PATHS.summary,
      {
        signal,
      },
    )
  }


  async function getInsights(
    filters: AIInsightsFilters = {},
    signal?: AbortSignal,
  ): Promise<AIInsightsResponse> {
    return apiGet<AIInsightsResponse>(
      auth,
      AI_PATHS.insights,
      {
        query: {
          severidad:
            filters.severidad,

          tipo:
            filters.tipo,

          limit:
            filters.limit ?? 100,

          offset:
            filters.offset ?? 0,
        },

        signal,
      },
    )
  }


  async function getSalesForecast(
    filters: AIForecastFilters = {},
    signal?: AbortSignal,
  ): Promise<AISalesForecastResponse> {
    return apiGet<AISalesForecastResponse>(
      auth,
      AI_PATHS.sales,
      {
        query: {
          producto_key:
            filters.productoKey,

          limit:
            filters.limit ?? 100,

          offset:
            filters.offset ?? 0,
        },

        signal,
      },
    )
  }


  async function getDemandForecast(
    filters: AIForecastFilters = {},
    signal?: AbortSignal,
  ): Promise<AIDemandForecastResponse> {
    return apiGet<AIDemandForecastResponse>(
      auth,
      AI_PATHS.demand,
      {
        query: {
          producto_key:
            filters.productoKey,

          limit:
            filters.limit ?? 200,

          offset:
            filters.offset ?? 0,
        },

        signal,
      },
    )
  }


  async function getInventoryRecommendations(
    filters: AIInventoryFilters = {},
    signal?: AbortSignal,
  ): Promise<AIInventoryRecommendationsResponse> {
    return apiGet<AIInventoryRecommendationsResponse>(
      auth,
      AI_PATHS.inventory,
      {
        query: {
          riesgo:
            filters.riesgo,

          limit:
            filters.limit ?? 100,

          offset:
            filters.offset ?? 0,
        },

        signal,
      },
    )
  }


  async function getDashboard(
    signal?: AbortSignal,
  ): Promise<AIDashboardResponse> {
    return apiGet<AIDashboardResponse>(
      auth,
      AI_PATHS.dashboard,
      {
        signal,
      },
    )
  }


  return {
    getSummary,
    getInsights,
    getSalesForecast,
    getDemandForecast,
    getInventoryRecommendations,
    getDashboard,
  }
}