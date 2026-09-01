from __future__ import annotations

from api.index import app


ADMIN_INVITE_PATH = "/api/v1/admin/users/invite"


def test_admin_invite_endpoint_is_typed() -> None:
    schema = app.openapi()
    operation = schema["paths"][ADMIN_INVITE_PATH]["post"]

    request_schema = operation[
        "requestBody"
    ]["content"]["application/json"]["schema"]

    response_schema = operation[
        "responses"
    ]["200"]["content"]["application/json"]["schema"]

    assert request_schema["$ref"].endswith(
        "/InviteCompanyUserRequest"
    )
    assert response_schema["$ref"].endswith(
        "/InviteCompanyUserResponse"
    )


def test_admin_invite_endpoint_requires_bearer_auth() -> None:
    schema = app.openapi()
    operation = schema["paths"][ADMIN_INVITE_PATH]["post"]

    assert {"HTTPBearer": []} in operation.get("security", [])


def test_admin_models_are_exposed_in_openapi() -> None:
    schema = app.openapi()
    schemas = schema["components"]["schemas"]

    assert "InviteCompanyUserRequest" in schemas
    assert "InviteCompanyUserResponse" in schemas
