from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..config import OUTPUT_DIR

AI_OUTPUT_DIR: Path = OUTPUT_DIR / "ai"


@dataclass(frozen=True)
class AISettings:
    """Parámetros centrales de la Fase 14."""

    min_real_sales_rows: int = 60
    min_real_sales_months: int = 12
    demo_months: int = 24
    random_seed: int = 42
    sales_horizon_months: int = 3
    demand_horizon_days: int = 30
    model_version: str = "fase14-v1"


def ensure_ai_directories() -> None:
    """Crea los directorios de salida necesarios para la capa de IA."""

    AI_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
