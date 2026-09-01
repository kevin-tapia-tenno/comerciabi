from __future__ import annotations

from api.index import app


AI_ENDPOINTS = (
    "/api/v1/ai/summary",
    "/api/v1/ai/insights",
    "/api/v1/ai/forecasts/sales",
    "/api/v1/ai/forecasts/demand",
    "/api/v1/ai/inventory/recommendations",
    "/api/v1/ai/dashboard",
)


EXPECTED_MODELS = {
    "AIExecutiveSummary",
    "AIInsight",
    "AISalesForecast",
    "AIDemandForecast",
    "AIInventoryRecommendation",
    "AISummaryResponse",
    "AIInsightsResponse",
    "AISalesForecastResponse",
    "AIDemandForecastResponse",
    "AIInventoryRecommendationsResponse",
    "AIDashboardResponse",
}


def test_ai_endpoints_have_typed_response_models() -> None:
    schema = app.openapi()

    for path in AI_ENDPOINTS:
        operation = schema["paths"][path]["get"]

        response_schema = operation[
            "responses"
        ]["200"]["content"]["application/json"]["schema"]

        assert "$ref" in response_schema, (
            f"{path} no expone un response_model tipado."
        )

        assert response_schema["$ref"].startswith(
            "#/components/schemas/"
        )


def test_ai_models_are_exposed_in_openapi() -> None:
    schema = app.openapi()

    schemas = set(
        schema["components"]["schemas"].keys()
    )

    missing = EXPECTED_MODELS - schemas

    assert not missing, (
        "Faltan modelos IA en OpenAPI: "
        + ", ".join(sorted(missing))
    )


def test_ai_endpoints_require_bearer_auth() -> None:
    schema = app.openapi()

    for path in AI_ENDPOINTS:
        operation = schema["paths"][path]["get"]

        security = operation.get("security", [])

        assert {"HTTPBearer": []} in security, (
            f"{path} no declara HTTPBearer en OpenAPI."
        )