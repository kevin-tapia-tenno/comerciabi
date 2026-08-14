from __future__ import annotations

import csv
import json
import re
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from config import OUTPUT_DIR, load_database_config  # noqa: E402

RULE_VERSION = "fase14-insights-v1"
AI_OUTPUT_DIR = OUTPUT_DIR / "ai"
JSON_OUTPUT = AI_OUTPUT_DIR / "business_insights.json"
CSV_OUTPUT = AI_OUTPUT_DIR / "business_insights.csv"

SEVERITY_RANK = {"CRITICA": 1, "ALTA": 2, "MEDIA": 3, "BAJA": 4, "INFO": 5}


def num(v: Any, default: float = 0.0) -> float:
    if v is None:
        return default
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def integer(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def txt(v: Any, default: str = "") -> str:
    return default if v is None else str(v)


def money(v: float) -> str:
    return f"S/ {v:,.2f}"


def slug(v: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", v.strip().upper()).strip("_") or "SIN_NOMBRE"


def insight(
    execution_id: int,
    empresa_key: int,
    tipo: str,
    severidad: str,
    codigo: str,
    titulo: str,
    descripcion: str,
    accion: str | None,
    valor: float | int | None,
    unidad: str | None,
    orden: int,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "ai_ejecucion_id": execution_id,
        "empresa_key": empresa_key,
        "tipo": tipo,
        "severidad": severidad,
        "codigo": codigo,
        "titulo": titulo,
        "descripcion": descripcion,
        "accion_recomendada": accion,
        "valor": valor,
        "unidad": unidad,
        "orden": orden,
        "rule_version": RULE_VERSION,
        "metadata": metadata or {},
    }


def build_summary_insights(s: dict[str, Any]) -> list[dict[str, Any]]:
    eid = integer(s["ai_ejecucion_id"])
    company = integer(s["empresa_key"])
    empresa = txt(s.get("empresa"), f"Empresa {company}")
    origin = txt(s.get("origen_datos"), "DESCONOCIDO").upper()

    sales_total = num(s.get("venta_pronosticada_total"))
    sales_low = num(s.get("venta_pronosticada_inferior"))
    sales_high = num(s.get("venta_pronosticada_superior"))
    sales_products = integer(s.get("productos_ventas_pronosticados"))
    sales_start = txt(s.get("primer_periodo_ventas"))
    sales_end = txt(s.get("ultimo_periodo_ventas"))
    sales_algo = txt(s.get("algoritmo_ventas"))
    sales_mae = num(s.get("mae_ventas"))
    sales_base_mae = num(s.get("mae_ventas_baseline"))
    sales_improvement = num(s.get("mejora_ventas_pct"))

    demand_total = num(s.get("demanda_pronosticada_total"))
    demand_low = num(s.get("demanda_pronosticada_inferior"))
    demand_high = num(s.get("demanda_pronosticada_superior"))
    demand_products = integer(s.get("productos_demanda_pronosticados"))
    demand_start = txt(s.get("primera_fecha_demanda"))
    demand_end = txt(s.get("ultima_fecha_demanda"))
    demand_algo = txt(s.get("algoritmo_demanda"))
    demand_mae = num(s.get("mae_demanda"))
    demand_base_mae = num(s.get("mae_demanda_baseline"))
    demand_improvement = num(s.get("mejora_demanda_pct"))

    critical = integer(s.get("productos_criticos"))
    high = integer(s.get("productos_riesgo_alto"))
    medium = integer(s.get("productos_riesgo_medio"))
    low = integer(s.get("productos_riesgo_bajo"))
    restock_products = integer(s.get("productos_a_reponer"))
    restock_units = num(s.get("unidades_reposicion_sugeridas"))
    coverage = num(s.get("cobertura_promedio_dias"))

    out: list[dict[str, Any]] = []

    out.append(insight(
        eid, company, "OPERACION", "MEDIA" if origin == "DEMO" else "INFO",
        "ORIGEN_DATOS", f"Resultados generados con datos {origin}",
        f"La ejecucion actual de {empresa} usa origen {origin}. La trazabilidad del origen evita confundir resultados de demostracion con informacion productiva.",
        "Usar solo para demostracion y validacion hasta disponer de historial REAL suficiente." if origin == "DEMO" else
        "Mantener controles de calidad y trazabilidad del origen.",
        None, None, 5, {"origen_datos": origin}
    ))

    out.append(insight(
        eid, company, "VENTAS", "INFO", "VENTAS_PRONOSTICO_TOTAL",
        "Venta pronosticada para el horizonte comercial",
        f"Se proyectan {money(sales_total)} de venta neta entre {sales_start} y {sales_end}, cubriendo {sales_products} productos.",
        "Usar el pronostico como referencia para metas, compras y flujo de caja; no sustituye la revision del responsable de negocio.",
        sales_total, "PEN", 10,
        {"limite_inferior_agregado": sales_low, "limite_superior_agregado": sales_high,
         "productos": sales_products, "periodo_inicio": sales_start, "periodo_fin": sales_end}
    ))

    width_ratio = (max(0.0, sales_high - sales_low) / sales_total) if sales_total > 0 else 0.0
    sev_unc = "ALTA" if width_ratio >= 1.0 else "MEDIA" if width_ratio >= 0.5 else "INFO"
    out.append(insight(
        eid, company, "VENTAS", sev_unc, "VENTAS_INCERTIDUMBRE",
        "Incertidumbre del pronostico de ventas",
        f"La amplitud agregada de las bandas operativas equivale a {width_ratio * 100:.1f}% del pronostico central. Es una referencia operacional, no una garantia estadistica conjunta.",
        "Trabajar con escenarios conservador, central y superior; evitar decisiones irreversibles cuando la banda sea amplia.",
        width_ratio * 100, "%", 20,
        {"pronostico_central": sales_total, "limite_inferior_agregado": sales_low,
         "limite_superior_agregado": sales_high, "amplitud_relativa_pct": width_ratio * 100}
    ))

    if sales_improvement > 0.01:
        stitle = "Modelo de ventas mejora al baseline"
        sdesc = f"El modelo {sales_algo} reduce el MAE en {sales_improvement:.2f}% frente al baseline ({sales_mae:.4f} vs {sales_base_mae:.4f})."
        saction = "Mantener el modelo campeon y monitorear degradacion."
    else:
        stitle = "Baseline conservado como campeon de ventas"
        sdesc = f"El algoritmo {sales_algo} permanece como campeon. MAE actual {sales_mae:.4f} frente a {sales_base_mae:.4f} del baseline; mejora relativa {sales_improvement:.2f}%."
        saction = "No forzar mayor complejidad sin mejora fuera de muestra; recolectar mas historia y reevaluar."

    out.append(insight(
        eid, company, "MODELO", "INFO", "MODELO_VENTAS", stitle, sdesc, saction,
        sales_improvement, "%", 30,
        {"algoritmo": sales_algo, "mae_modelo": sales_mae, "mae_baseline": sales_base_mae,
         "mejora_pct": sales_improvement}
    ))

    out.append(insight(
        eid, company, "DEMANDA", "INFO", "DEMANDA_PRONOSTICO_30D",
        "Demanda pronosticada para los proximos 30 dias",
        f"Se esperan aproximadamente {demand_total:,.0f} unidades entre {demand_start} y {demand_end}, para {demand_products} productos.",
        "Usar el pronostico para planificar reposicion, capacidad y disponibilidad.",
        demand_total, "unidades", 40,
        {"limite_inferior_agregado": demand_low, "limite_superior_agregado": demand_high,
         "productos": demand_products, "fecha_inicio": demand_start, "fecha_fin": demand_end}
    ))

    out.append(insight(
        eid, company, "MODELO", "INFO" if demand_improvement > 0 else "MEDIA",
        "MODELO_DEMANDA",
        "XGBoost mejora el pronostico de demanda" if demand_improvement > 0 else "El modelo de demanda no mejora el baseline",
        f"El algoritmo {demand_algo} obtiene MAE {demand_mae:.4f} frente a {demand_base_mae:.4f} del baseline, equivalente a una mejora de {demand_improvement:.2f}%.",
        "Mantener el modelo campeon y vigilar MAE, sesgo y cobertura." if demand_improvement > 0 else
        "Mantener el baseline hasta demostrar mejora fuera de muestra.",
        demand_improvement, "%", 50,
        {"algoritmo": demand_algo, "mae_modelo": demand_mae, "mae_baseline": demand_base_mae,
         "mejora_pct": demand_improvement}
    ))

    total_risk = critical + high + medium + low
    if critical > 0:
        rsev, rtitle = "CRITICA", "Riesgo critico de inventario"
    elif high > 0:
        rsev, rtitle = "ALTA", "Riesgo alto de inventario"
    elif medium > 0:
        rsev, rtitle = "MEDIA", "Riesgo moderado de inventario"
    else:
        rsev, rtitle = "INFO", "Inventario sin alertas relevantes"

    out.append(insight(
        eid, company, "INVENTARIO", rsev, "INVENTARIO_RIESGO", rtitle,
        f"De {total_risk} productos evaluados, {critical} estan en CRITICO, {high} en ALTO, {medium} en MEDIO y {low} en BAJO.",
        "Priorizar productos CRITICO y ALTO." if critical + high > 0 else "Mantener monitoreo periodico.",
        critical, "productos", 60,
        {"critico": critical, "alto": high, "medio": medium, "bajo": low}
    ))

    out.append(insight(
        eid, company, "INVENTARIO", "ALTA" if restock_products > 0 else "INFO",
        "INVENTARIO_REPOSICION", "Plan sugerido de reposicion",
        f"El motor recomienda reponer {restock_units:,.0f} unidades entre {restock_products} productos. Cobertura promedio estimada: {coverage:.1f} dias.",
        "Validar cantidades contra presupuesto, lead time, lotes minimos y capacidad antes de emitir ordenes de compra.",
        restock_units, "unidades", 70,
        {"productos_a_reponer": restock_products, "unidades_sugeridas": restock_units,
         "cobertura_promedio_dias": coverage}
    ))

    return out


def build_inventory_items(eid: int, company: int, rows: list[dict[str, Any]], max_items: int = 5) -> list[dict[str, Any]]:
    sev_map = {"CRITICO": "CRITICA", "ALTO": "ALTA", "MEDIO": "MEDIA", "BAJO": "BAJA"}

    def key(r: dict[str, Any]) -> tuple[int, float]:
        sev = sev_map.get(txt(r.get("riesgo")).upper(), "INFO")
        return (SEVERITY_RANK.get(sev, 99), -num(r.get("cantidad_sugerida")))

    out = []
    for i, row in enumerate(sorted(rows, key=key)[:max_items], start=1):
        producto = txt(row.get("producto"), "Producto")
        almacen = txt(row.get("almacen"), "Almacen")
        riesgo = txt(row.get("riesgo"), "BAJO").upper()
        sev = sev_map.get(riesgo, "INFO")
        stock = num(row.get("stock_actual"))
        objetivo = num(row.get("stock_objetivo"))
        cantidad = num(row.get("cantidad_sugerida"))
        cobertura = num(row.get("cobertura_dias"))

        out.append(insight(
            eid, company, "INVENTARIO", sev,
            f"ITEM_REPOSICION_{i:02d}_{slug(producto)[:40]}",
            f"Prioridad de reposicion: {producto}",
            f"{producto} en {almacen} presenta riesgo {riesgo}. Stock actual: {stock:,.0f}; stock objetivo: {objetivo:,.0f}; cobertura estimada: {cobertura:.1f} dias.",
            f"Revisar y, si se confirman las condiciones operativas, reponer aproximadamente {cantidad:,.0f} unidades.",
            cantidad, "unidades", 80 + i,
            {"producto": producto, "almacen": almacen, "riesgo": riesgo, "stock_actual": stock,
             "stock_objetivo": objetivo, "cantidad_sugerida": cantidad, "cobertura_dias": cobertura}
        ))
    return out


def persist(conn, rows: list[dict[str, Any]]) -> None:
    for eid in sorted({r["ai_ejecucion_id"] for r in rows}):
        conn.execute(text("delete from analytics.ai_insights where ai_ejecucion_id = :eid"), {"eid": eid})

    sql = text("""
        insert into analytics.ai_insights (
            ai_ejecucion_id, empresa_key, tipo, severidad, codigo, titulo, descripcion,
            accion_recomendada, valor, unidad, orden, rule_version, metadata
        ) values (
            :ai_ejecucion_id, :empresa_key, :tipo, :severidad, :codigo, :titulo, :descripcion,
            :accion_recomendada, :valor, :unidad, :orden, :rule_version, cast(:metadata as jsonb)
        )
    """)
    payload = []
    for r in rows:
        x = dict(r)
        x["metadata"] = json.dumps(x["metadata"], ensure_ascii=False, default=str)
        payload.append(x)
    conn.execute(sql, payload)


def write_artifacts(rows: list[dict[str, Any]]) -> None:
    AI_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(json.dumps(
        {"generated_at_utc": datetime.now(timezone.utc).isoformat(), "rule_version": RULE_VERSION,
         "rows": len(rows), "insights": rows},
        ensure_ascii=False, indent=2, default=str
    ), encoding="utf-8")

    fields = ["ai_ejecucion_id","empresa_key","tipo","severidad","codigo","titulo","descripcion",
              "accion_recomendada","valor","unidad","orden","rule_version","metadata"]
    with CSV_OUTPUT.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            x = dict(r)
            x["metadata"] = json.dumps(x["metadata"], ensure_ascii=False, default=str)
            w.writerow(x)


def main() -> None:
    print("=== ComercioBI - Fase 14.13 / Motor de Business Insights ===")
    engine = create_engine(load_database_config().sqlalchemy_url(), pool_pre_ping=True)

    with engine.begin() as conn:
        summaries = [dict(r) for r in conn.execute(text(
            "select * from analytics.vw_ai_resumen_actual order by empresa_key"
        )).mappings()]
        if not summaries:
            raise RuntimeError("vw_ai_resumen_actual no devuelve filas. Ejecuta persistencia y recomendaciones primero.")

        all_rows: list[dict[str, Any]] = []
        for s in summaries:
            eid = integer(s["ai_ejecucion_id"])
            company = integer(s["empresa_key"])
            recs = [dict(r) for r in conn.execute(text("""
                select *
                from analytics.vw_ai_recomendacion_inventario_actual
                where ai_ejecucion_id = :eid
                  and empresa_key = :company
                  and requiere_reposicion = true
            """), {"eid": eid, "company": company}).mappings()]
            company_rows = build_summary_insights(s) + build_inventory_items(eid, company, recs)
            all_rows.extend(company_rows)
            print(f"Empresa {company}: ejecucion={eid} | insights={len(company_rows)}")

        persist(conn, all_rows)

    write_artifacts(all_rows)
    print(f"Insights generados: {len(all_rows)}")
    print(f"JSON: {JSON_OUTPUT}")
    print(f"CSV: {CSV_OUTPUT}")
    print("Fase 14.13 - generacion completada correctamente.")


if __name__ == "__main__":
    main()
