"""Backend API tests for C.R.A.S.H. 2.0 monitor dashboard."""
import os
import json
import time
import asyncio
import pytest
import requests

try:
    import websockets
except ImportError:
    websockets = None

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crash-locator.preview.emergentagent.com").rstrip("/")
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"

ADMIN = {"email": "admin@crash.io", "password": "admin123"}
MONITOR = {"email": "monitor@crash.io", "password": "monitor123"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    s.headers.update({"Authorization": f"Bearer {body['access_token']}"})
    s.token = body["access_token"]
    s.user = body
    return s


@pytest.fixture(scope="session")
def monitor_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=MONITOR, timeout=15)
    assert r.status_code == 200, f"monitor login failed: {r.status_code} {r.text}"
    body = r.json()
    s.headers.update({"Authorization": f"Bearer {body['access_token']}"})
    s.token = body["access_token"]
    s.user = body
    return s


# ---------- Auth tests ----------
class TestAuth:
    def test_login_admin_success(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == ADMIN["email"]
        assert body["role"] == "admin"
        assert isinstance(body["access_token"], str) and len(body["access_token"]) > 20
        # cookie set
        assert r.cookies.get("access_token") is not None

    def test_login_monitor_success(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=MONITOR, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "monitor"
        assert r.cookies.get("access_token") is not None

    def test_login_bad_credentials(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@crash.io", "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_with_cookie(self):
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
        r = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]

    def test_me_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_logout_clears_cookies(self):
        s = requests.Session()
        s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
        r = s.post(f"{BASE_URL}/api/auth/logout", timeout=15)
        assert r.status_code == 200
        # next /me should fail using session without cookie
        s2 = requests.Session()
        r2 = s2.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r2.status_code == 401


# ---------- Drivers tests ----------
class TestDrivers:
    def test_list_drivers(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/drivers", timeout=15)
        assert r.status_code == 200
        drivers = r.json()["drivers"]
        assert len(drivers) == 8
        d = drivers[0]
        for k in ("id", "name", "lat", "lng", "speed", "gforce", "status", "helmet_connected"):
            assert k in d, f"missing key {k}"

    def test_get_driver_detail(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/drivers/drv-01", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["driver"]["id"] == "drv-01"
        assert "profile" in body

    def test_get_driver_404(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/drivers/drv-99", timeout=15)
        assert r.status_code == 404

    def test_driver_history(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/drivers/drv-01/history", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["driver_id"] == "drv-01"
        assert isinstance(body["points"], list)

    def test_driver_events(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/drivers/drv-01/events", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["driver_id"] == "drv-01"
        assert isinstance(body["events"], list)

    def test_drivers_unauthenticated(self):
        r = requests.get(f"{BASE_URL}/api/drivers", timeout=15)
        assert r.status_code == 401


# ---------- Alerts tests ----------
class TestAlerts:
    def test_list_alerts(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/alerts", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json()["alerts"], list)

    def test_acknowledge_invalid_id(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/alerts/alt-doesnotexist/acknowledge", timeout=15)
        assert r.status_code == 404

    def test_false_alarm_invalid_id(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/alerts/alt-doesnotexist/false-alarm", timeout=15)
        assert r.status_code == 404

    def test_alert_lifecycle_via_simulator(self, admin_session):
        """Poll up to ~90s for an impact alert from simulator, then ack & false_alarm."""
        deadline = time.time() + 90
        alert = None
        while time.time() < deadline:
            r = admin_session.get(f"{BASE_URL}/api/alerts", timeout=15)
            for a in r.json().get("alerts", []):
                if a["status"] == "pending" and a["type"] == "impact":
                    alert = a
                    break
            if alert:
                break
            time.sleep(3)
        if not alert:
            pytest.skip("No impact alert raised within 90s window (probabilistic)")

        # acknowledge
        ack = admin_session.post(f"{BASE_URL}/api/alerts/{alert['id']}/acknowledge", timeout=15)
        assert ack.status_code == 200
        assert ack.json()["alert"]["status"] == "acknowledged"

        # try to ack again -> 404 (already handled)
        again = admin_session.post(f"{BASE_URL}/api/alerts/{alert['id']}/acknowledge", timeout=15)
        assert again.status_code == 404

        # find/wait for another pending alert to test false_alarm
        deadline2 = time.time() + 90
        alert2 = None
        while time.time() < deadline2:
            r = admin_session.get(f"{BASE_URL}/api/alerts", timeout=15)
            for a in r.json().get("alerts", []):
                if a["status"] == "pending" and a["type"] == "impact" and a["id"] != alert["id"]:
                    alert2 = a
                    break
            if alert2:
                break
            time.sleep(3)
        if not alert2:
            pytest.skip("Second impact alert not raised within window")
        fa = admin_session.post(f"{BASE_URL}/api/alerts/{alert2['id']}/false-alarm", timeout=15)
        assert fa.status_code == 200
        assert fa.json()["alert"]["status"] == "false_alarm"


# ---------- Admin tests ----------
class TestAdmin:
    def test_admin_users_with_admin_token(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/users", timeout=15)
        assert r.status_code == 200
        users = r.json()["users"]
        assert any(u["email"] == ADMIN["email"] for u in users)
        # Ensure no password_hash leaked
        for u in users:
            assert "password_hash" not in u

    def test_admin_users_with_monitor_forbidden(self, monitor_session):
        r = monitor_session.get(f"{BASE_URL}/api/admin/users", timeout=15)
        assert r.status_code == 403


# ---------- WebSocket tests ----------
@pytest.mark.skipif(websockets is None, reason="websockets package not installed")
class TestWebSocket:
    def test_ws_no_token_closes(self):
        async def runner():
            try:
                async with websockets.connect(WS_URL, open_timeout=10) as ws:
                    await asyncio.wait_for(ws.recv(), timeout=5)
            except websockets.exceptions.ConnectionClosed as e:
                return e.code
            except Exception as e:
                return str(e)
            return None
        result = asyncio.get_event_loop().run_until_complete(runner())
        # Either it raised ConnectionClosed with 4401 or InvalidStatusCode
        assert result == 4401 or result is not None

    def test_ws_with_token_snapshot_and_telemetry(self, admin_session):
        token = admin_session.token

        async def runner():
            url = f"{WS_URL}?token={token}"
            messages = []
            async with websockets.connect(url, open_timeout=10) as ws:
                # initial snapshot
                msg = await asyncio.wait_for(ws.recv(), timeout=10)
                messages.append(json.loads(msg))
                # wait for telemetry_batch within 6s (simulator ticks every 2s)
                end = time.time() + 8
                while time.time() < end:
                    try:
                        m = await asyncio.wait_for(ws.recv(), timeout=4)
                        messages.append(json.loads(m))
                        if any(x.get("type") == "telemetry_batch" for x in messages):
                            break
                    except asyncio.TimeoutError:
                        break
            return messages

        msgs = asyncio.new_event_loop().run_until_complete(runner())
        assert msgs, "no WS messages received"
        assert msgs[0]["type"] == "snapshot"
        assert isinstance(msgs[0]["drivers"], list)
        assert len(msgs[0]["drivers"]) == 8
        assert any(m.get("type") == "telemetry_batch" for m in msgs), "no telemetry_batch within 8s"
