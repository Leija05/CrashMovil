"""Main FastAPI server for C.R.A.S.H. 2.0 monitor dashboard.

Two data sources, switched by the ``DEMO_MODE`` env flag:
  - DEMO_MODE=true  → synthetic ``simulator.FleetSimulator``
  - DEMO_MODE=false → real ``mobile_bridge.MobileBridge`` reading the mobile
                       app's MongoDB collections (users / telemetry /
                       impact_events / user_profiles).

Operator users (admin / monitorista) live in the dedicated
``monitor_operators`` collection and never touch the mobile's ``users`` set.
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    HTTPException,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
)
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr
from starlette.middleware.cors import CORSMiddleware

from auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    require_role,
    verify_password,
)
from simulator import simulator
from mobile_bridge import bridge

# ---------- DB ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

DEMO_MODE = os.environ.get("DEMO_MODE", "false").lower() == "true"

# ---------- App ----------
app = FastAPI(title="C.R.A.S.H. 2.0 Monitor API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("crash")


# =============================================================================
# WebSocket connection manager
# =============================================================================
class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.active.append(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            if ws in self.active:
                self.active.remove(ws)

    async def broadcast(self, payload: dict) -> None:
        msg = json.dumps(payload, default=str)
        async with self._lock:
            targets = list(self.active)
        for ws in targets:
            try:
                await ws.send_text(msg)
            except Exception:
                await self.disconnect(ws)


manager = ConnectionManager()


def _source():
    """Return the active data source object."""
    return simulator if DEMO_MODE else bridge


# =============================================================================
# Auth schemas + endpoints
# =============================================================================
class LoginPayload(BaseModel):
    email: EmailStr
    password: str


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax",
                        max_age=60 * 60 * 8, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=False, samesite="lax",
                        max_age=60 * 60 * 24 * 7, path="/")


@api_router.post("/auth/login")
async def login(payload: LoginPayload, response: Response):
    email = payload.email.lower()
    user = await db.monitor_operators.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_auth_cookies(response, access, refresh)
    return {
        "id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"],
        "access_token": access,
    }


@api_router.post("/auth/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# =============================================================================
# Drivers + history + events
# =============================================================================
@api_router.get("/drivers")
async def list_drivers(_: dict = Depends(get_current_user)):
    return {"drivers": _source().list_drivers(), "demo": DEMO_MODE}


@api_router.get("/drivers/{driver_id}")
async def get_driver(driver_id: str, _: dict = Depends(get_current_user)):
    src = _source()
    d = src.drivers.get(driver_id)
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    if DEMO_MODE:
        profile = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
        return {"driver": d, "profile": profile or {}}
    profile = await bridge.driver_profile(driver_id)
    return {"driver": d, "profile": profile}


@api_router.get("/drivers/{driver_id}/history")
async def driver_history(driver_id: str, limit: int = 200, _: dict = Depends(get_current_user)):
    if DEMO_MODE:
        cursor = db.telemetry.find({"driver_id": driver_id}, {"_id": 0}).sort("ts", -1).limit(limit)
        points = await cursor.to_list(length=limit)
        points.reverse()
    else:
        points = await bridge.driver_history(driver_id, limit)
    return {"driver_id": driver_id, "points": points}


@api_router.get("/drivers/{driver_id}/events")
async def driver_events(driver_id: str, limit: int = 100, _: dict = Depends(get_current_user)):
    if DEMO_MODE:
        cursor = db.events.find({"driver_id": driver_id}, {"_id": 0}).sort("ts", -1).limit(limit)
        events = await cursor.to_list(length=limit)
    else:
        events = await bridge.driver_events(driver_id, limit)
    return {"driver_id": driver_id, "events": events}


# =============================================================================
# Alerts
# =============================================================================
@api_router.get("/alerts")
async def list_alerts(_: dict = Depends(get_current_user)):
    return {"alerts": _source().list_alerts()}


@api_router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, user: dict = Depends(get_current_user)):
    a = await _source().acknowledge(alert_id, user)
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found or already handled")
    return {"alert": a}


@api_router.post("/alerts/{alert_id}/false-alarm")
async def false_alarm(alert_id: str, user: dict = Depends(get_current_user)):
    a = await _source().false_alarm(alert_id, user)
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"alert": a}


# =============================================================================
# Admin: list operator users (only admin)
# =============================================================================
@api_router.get("/admin/users")
async def list_users(_: dict = Depends(require_role("admin"))):
    users = await db.monitor_operators.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return {"users": users}


# =============================================================================
# Mode info — handy for the frontend banner
# =============================================================================
@api_router.get("/system/mode")
async def system_mode(_: dict = Depends(get_current_user)):
    return {
        "demo": DEMO_MODE,
        "source": "simulator" if DEMO_MODE else "mobile_bridge",
        "db_name": os.environ["DB_NAME"],
    }


# =============================================================================
# WebSocket endpoint
# =============================================================================
@app.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token") or websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("bad token type")
    except Exception:
        await websocket.close(code=4401)
        return

    await manager.connect(websocket)
    src = _source()
    await websocket.send_text(json.dumps({
        "type": "snapshot",
        "ts": datetime.now(timezone.utc).isoformat(),
        "drivers": src.list_drivers(),
        "alerts": src.list_alerts(),
        "demo": DEMO_MODE,
    }, default=str))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        await manager.disconnect(websocket)


# =============================================================================
# Health
# =============================================================================
@api_router.get("/")
async def root():
    return {"service": "crash-monitor", "status": "ok", "demo": DEMO_MODE}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Startup
# =============================================================================
async def _seed_operators() -> None:
    seeds = [
        {"email": os.environ["ADMIN_EMAIL"].lower(), "password": os.environ["ADMIN_PASSWORD"],
         "name": "Administrador", "role": "admin"},
        {"email": os.environ["MONITOR_EMAIL"].lower(), "password": os.environ["MONITOR_PASSWORD"],
         "name": "Monitorista", "role": "monitor"},
    ]
    for s in seeds:
        existing = await db.monitor_operators.find_one({"email": s["email"]})
        if existing is None:
            await db.monitor_operators.insert_one({
                "id": f"usr-{uuid.uuid4().hex[:10]}",
                "email": s["email"],
                "password_hash": hash_password(s["password"]),
                "name": s["name"],
                "role": s["role"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Seeded operator %s (%s)", s["email"], s["role"])
        elif not verify_password(s["password"], existing["password_hash"]):
            await db.monitor_operators.update_one(
                {"email": s["email"]},
                {"$set": {"password_hash": hash_password(s["password"]), "role": s["role"]}},
            )
            logger.info("Refreshed operator password for %s", s["email"])


@app.on_event("startup")
async def on_startup() -> None:
    # Operator collection (separate from mobile users)
    await db.monitor_operators.create_index("email", unique=True)
    # Per-impact ack state (managed only by the web monitor)
    await db.monitor_acks.create_index("impact_id", unique=True)

    if DEMO_MODE:
        # Demo collections — only created when running synthetic mode
        await db.drivers.create_index("id", unique=True)
        await db.alerts.create_index("id", unique=True)
        await db.events.create_index([("driver_id", 1), ("ts", -1)])
        await db.telemetry.create_index([("driver_id", 1), ("ts", -1)])

    await _seed_operators()

    if DEMO_MODE:
        await simulator.start(db, manager.broadcast)
        logger.info("CRASH monitor started in DEMO mode (simulator)")
    else:
        await bridge.start(db, manager.broadcast)
        logger.info(
            "CRASH monitor started in LIVE mode — reading mobile DB '%s'",
            os.environ["DB_NAME"],
        )


@app.on_event("shutdown")
async def on_shutdown() -> None:
    if DEMO_MODE:
        await simulator.stop()
    else:
        await bridge.stop()
    client.close()
