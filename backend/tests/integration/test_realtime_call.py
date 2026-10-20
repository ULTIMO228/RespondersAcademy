

def test_websocket_endpoint_reachable_without_cookie_dependency():
    """Регрессия: роутерная зависимость require_viewer роняла WebSocket в 500 (TypeError: нет Request)."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        with client.websocket_connect("/api/v1/operator112/realtime") as ws:
            ws.send_text('{"ticket":"bad"}')
            message = ws.receive_json()
    assert message["type"] == "error"
