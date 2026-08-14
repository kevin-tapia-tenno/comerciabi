from fastapi.testclient import TestClient

from api.app.main import app


client = TestClient(app)


def test_openapi_exists():
    response = client.get("/api/openapi.json")
    assert response.status_code == 200
    assert response.json()["info"]["title"] == "ComercioBI API"


def test_protected_route_requires_bearer_token():
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
