from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from api.app.models import TenantContext


InsightSeverity = Literal[
    "INFO",
    "BAJA",
    "MEDIA",
    "ALTA",
    "CRITICA",
]

InsightType = Literal[
    "VENTAS",
    "DEMANDA",
    "INVENTARIO",
    "MODELO",
    "OPERACION",
]

InventoryRisk = Literal[
    "BAJO",
    "MEDIO",
    "ALTO",
    "CRITICO",
]


# ============================================================
# Resumen ejecutivo
# ============================================================


class AIExecutiveSummary(BaseModel):
    ai_ejecucion_id: int
    empresa_key: int
    empresa: str

    origen_datos: str | None = None
    version_modelo: str | None = None

    algoritmo_ventas: str | None = None
    algoritmo_demanda: str | None = None

    mae_ventas: float | None = None
    mae_ventas_baseline: float | None = None
    mejora_ventas_pct: float | None = None

    mae_demanda: float | None = None
    mae_demanda_baseline: float | None = None
    mejora_demanda_pct: float | None = None

    filas_entrenamiento_ventas: int | None = None
    filas_entrenamiento_demanda: int | None = None

    venta_pronosticada_total: float | None = None
    venta_pronosticada_inferior: float | None = None
    venta_pronosticada_superior: float | None = None

    productos_ventas_pronosticados: int | None = None

    primer_periodo_ventas: date | None = None
    ultimo_periodo_ventas: date | None = None

    demanda_pronosticada_total: float | None = None
    demanda_pronosticada_inferior: float | None = None
    demanda_pronosticada_superior: float | None = None

    productos_demanda_pronosticados: int | None = None

    primera_fecha_demanda: date | None = None
    ultima_fecha_demanda: date | None = None

    recomendaciones_inventario: int | None = None

    productos_criticos: int | None = None
    productos_riesgo_alto: int | None = None
    productos_riesgo_medio: int | None = None
    productos_riesgo_bajo: int | None = None

    productos_a_reponer: int | None = None
    unidades_reposicion_sugeridas: float | None = None
    cobertura_promedio_dias: float | None = None

    ultima_actualizacion_modelo: datetime | None = None


# ============================================================
# Insights
# ============================================================


class AIInsight(BaseModel):
    id: int
    ai_ejecucion_id: int

    empresa_key: int
    empresa: str

    tipo: InsightType
    severidad: InsightSeverity

    codigo: str
    titulo: str
    descripcion: str

    accion_recomendada: str | None = None

    valor: float | None = None
    unidad: str | None = None

    orden: int
    rule_version: str

    metadata: dict[str, Any] = Field(default_factory=dict)

    generado_en: datetime


# ============================================================
# Pronóstico de ventas
# ============================================================


class AISalesForecast(BaseModel):
    ai_ejecucion_id: int

    empresa_key: int
    empresa: str

    producto_key: int
    sku: str
    producto: str
    categoria: str | None = None

    periodo: date

    venta_neta_pronosticada: float
    limite_inferior: float
    limite_superior: float

    amplitud_intervalo: float
    amplitud_intervalo_pct: float | None = None

    modelo: str
    origen_datos: str

    generado_en: datetime


# ============================================================
# Pronóstico de demanda
# ============================================================


class AIDemandForecast(BaseModel):
    ai_ejecucion_id: int

    empresa_key: int
    empresa: str

    producto_key: int
    sku: str
    producto: str
    categoria: str | None = None

    fecha_inicio: date
    fecha_fin: date
    horizonte_dias: int

    unidades_pronosticadas: float
    limite_inferior: float
    limite_superior: float

    amplitud_intervalo: float
    amplitud_intervalo_pct: float | None = None

    modelo: str
    origen_datos: str

    generado_en: datetime


# ============================================================
# Recomendaciones de inventario
# ============================================================


class AIInventoryRecommendation(BaseModel):
    ai_ejecucion_id: int

    empresa_key: int
    empresa: str

    producto_key: int
    sku: str
    producto: str
    categoria: str | None = None

    almacen_key: int
    almacen: str

    fecha_referencia: date

    stock_actual: float
    stock_minimo: float

    demanda_30d: float

    stock_objetivo: float
    cantidad_sugerida: float

    cobertura_dias: float | None = None

    riesgo: InventoryRisk
    riesgo_orden: int

    requiere_reposicion: bool

    motivo: str

    generado_en: datetime


# ============================================================
# Responses HTTP
# ============================================================


class AISummaryResponse(BaseModel):
    tenant: TenantContext
    data: AIExecutiveSummary | None = None


class AIInsightsResponse(BaseModel):
    tenant: TenantContext
    count: int
    data: list[AIInsight]


class AISalesForecastResponse(BaseModel):
    tenant: TenantContext
    count: int
    data: list[AISalesForecast]


class AIDemandForecastResponse(BaseModel):
    tenant: TenantContext
    count: int
    data: list[AIDemandForecast]


class AIInventoryRecommendationsResponse(BaseModel):
    tenant: TenantContext
    count: int
    data: list[AIInventoryRecommendation]


class AIDashboardResponse(BaseModel):
    tenant: TenantContext

    summary: AIExecutiveSummary | None = None

    insights: list[AIInsight]

    sales_forecast: list[AISalesForecast]

    demand_forecast: list[AIDemandForecast]

    inventory_recommendations: list[AIInventoryRecommendation]