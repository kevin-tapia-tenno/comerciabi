from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

from sqlalchemy import create_engine, text

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from config import OUTPUT_DIR, load_database_config  # noqa: E402

ARTIFACT = OUTPUT_DIR / "ai" / "business_insights.json"

REQUIRED_CODES = {
    "ORIGEN_DATOS",
    "VENTAS_PRONOSTICO_TOTAL",
    "VENTAS_INCERTIDUMBRE",
    "MODELO_VENTAS",
    "DEMANDA_PRONOSTICO_30D",
    "MODELO_DEMANDA",
    "INVENTARIO_RIESGO",
    "INVENTARIO_REPOSICION",
}
VALID_TYPES = {"VENTAS", "DEMANDA", "INVENTARIO", "MODELO", "OPERACION"}
VALID_SEVERITIES = {"INFO", "BAJA", "MEDIA", "ALTA", "CRITICA"}


def main() -> None:
    print("=== ComercioBI - Verificacion Fase 14.13 / Business Insights ===")

    if not ARTIFACT.exists():
        raise RuntimeError(f"No existe {ARTIFACT}. Ejecuta primero generate_business_insights.py.")

    local_payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    local_rows = local_payload.get("insights", [])
    if not local_rows:
        raise RuntimeError("El artefacto local no contiene insights.")

    engine = create_engine(load_database_config().sqlalchemy_url(), pool_pre_ping=True)

    with engine.connect() as conn:
        db_rows = [dict(r) for r in conn.execute(text("""
            select *
            from analytics.vw_ai_insights_actual
            order by empresa_key, orden, id
        """)).mappings()]

        summaries = [dict(r) for r in conn.execute(text("""
            select *
            from analytics.vw_ai_resumen_actual
            order by empresa_key
        """)).mappings()]

    if not db_rows:
        raise RuntimeError("vw_ai_insights_actual no devuelve filas.")

    if len(local_rows) != len(db_rows):
        raise RuntimeError(
            f"Cantidad local ({len(local_rows)}) distinta a PostgreSQL ({len(db_rows)})."
        )

    identities = [(int(r["ai_ejecucion_id"]), r["codigo"]) for r in db_rows]
    if len(identities) != len(set(identities)):
        raise RuntimeError("Se detectaron codigos duplicados dentro de una misma ejecucion.")

    for r in db_rows:
        if r["tipo"] not in VALID_TYPES:
            raise RuntimeError(f"Tipo invalido: {r['tipo']}")
        if r["severidad"] not in VALID_SEVERITIES:
            raise RuntimeError(f"Severidad invalida: {r['severidad']}")
        if not str(r["titulo"]).strip():
            raise RuntimeError(f"Insight {r['codigo']} sin titulo.")
        if not str(r["descripcion"]).strip():
            raise RuntimeError(f"Insight {r['codigo']} sin descripcion.")

    by_company = {}
    for r in db_rows:
        by_company.setdefault(int(r["empresa_key"]), []).append(r)

    for s in summaries:
        company = int(s["empresa_key"])
        company_rows = by_company.get(company, [])
        if not company_rows:
            raise RuntimeError(f"Empresa {company}: no tiene insights.")

        company_codes = {r["codigo"] for r in company_rows}
        missing = REQUIRED_CODES - company_codes
        if missing:
            raise RuntimeError(
                f"Empresa {company}: faltan insights obligatorios: " + ", ".join(sorted(missing))
            )

        if str(s.get("origen_datos", "")).upper() == "DEMO":
            origin_row = next((r for r in company_rows if r["codigo"] == "ORIGEN_DATOS"), None)
            if not origin_row or origin_row["severidad"] != "MEDIA":
                raise RuntimeError(f"Empresa {company}: el origen DEMO no esta marcado correctamente.")

        if int(s.get("productos_criticos") or 0) > 0:
            risk_row = next((r for r in company_rows if r["codigo"] == "INVENTARIO_RIESGO"), None)
            if not risk_row or risk_row["severidad"] != "CRITICA":
                raise RuntimeError(f"Empresa {company}: hay productos criticos pero el insight no es CRITICA.")

    severity_counts = Counter(r["severidad"] for r in db_rows)
    type_counts = Counter(r["tipo"] for r in db_rows)

    print(f"Artefacto local: {len(local_rows)} insights")
    print(f"PostgreSQL actual: {len(db_rows)} insights")
    print("")
    print("Por severidad:")
    for key in ["CRITICA", "ALTA", "MEDIA", "BAJA", "INFO"]:
        print(f"- {key}: {severity_counts.get(key, 0)}")
    print("")
    print("Por tipo:")
    for key in ["VENTAS", "DEMANDA", "INVENTARIO", "MODELO", "OPERACION"]:
        print(f"- {key}: {type_counts.get(key, 0)}")

    print("")
    print("Fase 14.13 validada correctamente.")


if __name__ == "__main__":
    main()
