import pytest
from fastapi.testclient import TestClient

from live2d_llm_expression.server import create_app


@pytest.fixture
def client(yachiyo_dir):
    return TestClient(create_app(yachiyo_dir))


def test_server_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_server_profile_summary(client):
    response = client.get("/profile")

    assert response.status_code == 200
    payload = response.json()
    assert payload["character_id"] == "yachiyo"
    assert payload["parameter_count"] > 0
    assert "ParamMouthForm" in payload["main_controls"]
    assert sorted(payload["expression_presets"]) == ["泪珠", "眯眯眼", "眼泪", "笑咪咪"]


def test_server_emotion_endpoint(client):
    response = client.post("/emotion", json={"emotion": "shy", "intensity": 0.7})

    assert response.status_code == 200
    payload = response.json()
    assert payload["emotion"] == "shy"
    assert payload["params"]["ParamMouthForm"] == pytest.approx(0.315)
    assert payload["warnings"] == []


def test_server_text_endpoint_uses_default_mock_analyzer(client):
    response = client.post("/text", json={"text": "八千代有点害羞地笑了一下"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["emotion"] == "shy"
    assert payload["params"]["ParamEyeBallX"] == pytest.approx(0.25)
    assert payload["warnings"] == []


def test_server_rejects_invalid_emotion(client):
    response = client.post("/emotion", json={"emotion": "invalid", "intensity": 0.7})

    assert response.status_code == 422

