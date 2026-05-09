"""Main FastAPI server for C.R.A.S.H. 2.0 monitor dashboard."""
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

# ---------- DB ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---------- App ----------
app = FastAPI(title="C.R.A.S.H. 2.0 Monitor API")
api_router = APIRouter(prefix="/api")

# ---------- Logging ----------
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


# =============================================================================
# Auth schemas + endpoints
# =============================================================================
class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax",
                        max_age=60 * 60 * 8, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=False, samesite="lax",
                        max_age=60 * 60 * 24 * 7, path="/")


@api_router.post("/auth/login")
async def login(payload: LoginPayload, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
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
    return {"drivers": simulator.list_drivers()}


@api_router.get("/drivers/{driver_id}")
async def get_driver(driver_id: str, _: dict = Depends(get_current_user)):
    d = simulator.drivers.get(driver_id)
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    profile = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    return {"driver": d, "profile": profile or {}}


@api_router.get("/drivers/{driver_id}/history")
async def driver_history(driver_id: str, limit: int = 200, _: dict = Depends(get_current_user)):
    cursor = db.telemetry.find({"driver_id": driver_id}, {"_id": 0}).sort("ts", -1).limit(limit)
    points = await cursor.to_list(length=limit)
    points.reverse()
    return {"driver_id": driver_id, "points": points}


@api_router.get("/drivers/{driver_id}/events")
async def driver_events(driver_id: str, limit: int = 100, _: dict = Depends(get_current_user)):
    cursor = db.events.find({"driver_id": driver_id}, {"_id": 0}).sort("ts", -1).limit(limit)
    events = await cursor.to_list(length=limit)
    return {"driver_id": driver_id, "events": events}


# =============================================================================
# Alerts
# =============================================================================
@api_router.get("/alerts")
async def list_alerts(_: dict = Depends(get_current_user)):
    # In-memory live alerts + recent persisted
    live = simulator.list_alerts()
    persisted = await db.alerts.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    # Merge: live ids override persisted
    seen = {a["id"] for a in live}
    merged = live + [p for p in persisted if p["id"] not in seen]
    return {"alerts": merged}


@api_router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, user: dict = Depends(get_current_user)):
    a = await simulator.acknowledge(alert_id, user)
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found or already handled")
    return {"alert": a}


@api_router.post("/alerts/{alert_id}/false-alarm")
async def false_alarm(alert_id: str, user: dict = Depends(get_current_user)):
    a = await simulator.false_alarm(alert_id, user)
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"alert": a}


# =============================================================================
# Admin: list users (only admin)
# =============================================================================
@api_router.get("/admin/users")
async def list_users(_: dict = Depends(require_role("admin"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return {"users": users}


# =============================================================================
# WebSocket endpoint
# =============================================================================
@app.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket):
    # Accept token via query param `?token=` or cookie
    token = websocket.query_params.get("token")
    if not token:
        token = websocket.cookies.get("access_token")
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
    # Push initial state immediately
    await websocket.send_text(json.dumps({
        "type": "snapshot",
        "ts": datetime.now(timezone.utc).isoformat(),
        "drivers": simulator.list_drivers(),
        "alerts": simulator.list_alerts(),
    }, default=str))
    try:
        while True:
            # Keep connection alive — accept pings or just wait
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
    return {"service": "crash-monitor", "status": "ok"}


app.include_router(api_router)

# CORS — allow credentials, explicit origin list (or wildcard origin without credentials)
cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
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
async def _seed_users() -> None:
    seeds = [
        {"email": os.environ["ADMIN_EMAIL"].lower(), "password": os.environ["ADMIN_PASSWORD"],
         "name": "Administrador", "role": "admin"},
        {"email": os.environ["MONITOR_EMAIL"].lower(), "password": os.environ["MONITOR_PASSWORD"],
         "name": "Monitorista", "role": "monitor"},
    ]
    for s in seeds:
        existing = await db.users.find_one({"email": s["email"]})
        if existing is None:
            await db.users.insert_one({
                "id": f"usr-{uuid.uuid4().hex[:10]}",
                "email": s["email"],
                "password_hash": hash_password(s["password"]),
                "name": s["name"],
                "role": s["role"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Seeded user %s (%s)", s["email"], s["role"])
        elif not verify_password(s["password"], existing["password_hash"]):
            await db.users.update_one(
                {"email": s["email"]},
                {"$set": {"password_hash": hash_password(s["password"]), "role": s["role"]}},
            )
            logger.info("Refreshed password for %s", s["email"])


@app.on_event("startup")
async def on_startup() -> None:
    await db.users.create_index("email", unique=True)
    await db.drivers.create_index("id", unique=True)
    await db.alerts.create_index("id", unique=True)
    await db.events.create_index([("driver_id", 1), ("ts", -1)])
    await db.telemetry.create_index([("driver_id", 1), ("ts", -1)])
    await _seed_users()
    await simulator.start(db, manager.broadcast)
    logger.info("CRASH monitor started — fleet simulator running")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await simulator.stop()
    client.close()
