"""Driver fleet simulator for C.R.A.S.H. 2.0.

Generates pseudo-realistic telemetry for a fixed set of drivers around
Mexico City and broadcasts updates over WebSocket. Occasionally raises
impact alerts.
"""
from __future__ import annotations

import asyncio
import math
import random
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional


# ---------- Initial fleet ----------
DRIVERS_SEED: List[dict] = [
    {"id": "drv-01", "name": "Carlos Mendoza", "vehicle": "Yamaha MT-07", "plate": "MX-7821",
     "lat": 19.4326, "lng": -99.1332, "heading": 45},
    {"id": "drv-02", "name": "Andrea Rivas",   "vehicle": "Honda CBR 500R","plate": "MX-3401",
     "lat": 19.4180, "lng": -99.1654, "heading": 120},
    {"id": "drv-03", "name": "Luis Hernández", "vehicle": "Kawasaki Z650", "plate": "MX-9087",
     "lat": 19.4490, "lng": -99.1276, "heading": 200},
    {"id": "drv-04", "name": "Mariana Soto",   "vehicle": "BMW G310 R",    "plate": "MX-5512",
     "lat": 19.3950, "lng": -99.1426, "heading": 320},
    {"id": "drv-05", "name": "Diego Ortega",   "vehicle": "Suzuki GSX-S",  "plate": "MX-2245",
     "lat": 19.4100, "lng": -99.1900, "heading": 80},
    {"id": "drv-06", "name": "Patricia Gómez", "vehicle": "Vespa GTS 300", "plate": "MX-6634",
     "lat": 19.4600, "lng": -99.1700, "heading": 10},
    {"id": "drv-07", "name": "Iván Ruiz",      "vehicle": "Triumph Street Triple","plate": "MX-1109",
     "lat": 19.3700, "lng": -99.1600, "heading": 270},
    {"id": "drv-08", "name": "Sofía Núñez",    "vehicle": "Ducati Monster","plate": "MX-8810",
     "lat": 19.4350, "lng": -99.2050, "heading": 180},
]


class FleetSimulator:
    """Owns the live state of every driver + alert lifecycle."""

    def __init__(self) -> None:
        self.drivers: Dict[str, dict] = {}
        self.alerts: Dict[str, dict] = {}
        self._db = None
        self._broadcast = None  # async fn(payload: dict)
        self._tick_task: Optional[asyncio.Task] = None
        self._tick_count: int = 0
        for d in DRIVERS_SEED:
            self.drivers[d["id"]] = self._init_state(d)

    # ---------- helpers ----------
    @staticmethod
    def _init_state(d: dict) -> dict:
        return {
            "id": d["id"],
            "name": d["name"],
            "vehicle": d["vehicle"],
            "plate": d["plate"],
            "lat": d["lat"],
            "lng": d["lng"],
            "heading": d["heading"],
            "speed": 0.0,
            "gforce": 1.0,
            "battery": random.randint(60, 100),
            "helmet_connected": True,
            "consent": True,
            "status": "active",  # active | critical | offline | warning
            "last_update": datetime.now(timezone.utc).isoformat(),
        }

    def _move(self, s: dict) -> None:
        # speed dynamics
        target = random.uniform(20, 95) if s["status"] == "active" else 0
        s["speed"] = max(0.0, s["speed"] + (target - s["speed"]) * 0.1 + random.uniform(-2, 2))

        if s["status"] == "active":
            s["heading"] = (s["heading"] + random.uniform(-15, 15)) % 360
            # km/h to deg/sec approx; tick = 2s
            dist_km = s["speed"] / 3600 * 2
            d_lat = dist_km / 111 * math.cos(math.radians(s["heading"]))
            d_lng = dist_km / (111 * math.cos(math.radians(s["lat"]))) * math.sin(math.radians(s["heading"]))
            s["lat"] += d_lat
            s["lng"] += d_lng
            s["gforce"] = round(0.95 + random.uniform(0, 0.4), 2)
            # Slow battery drain
            if random.random() < 0.05:
                s["battery"] = max(0, s["battery"] - 1)
        elif s["status"] == "critical":
            # Holds position, gforce stays high until acknowledged
            s["speed"] = 0
            s["gforce"] = round(random.uniform(3.5, 6.5), 2)
        elif s["status"] == "offline":
            s["speed"] = 0
            s["gforce"] = 0

        s["last_update"] = datetime.now(timezone.utc).isoformat()

    # ---------- lifecycle ----------
    async def start(self, db, broadcast) -> None:
        self._db = db
        self._broadcast = broadcast
        # Persist driver registry once
        for d in self.drivers.values():
            await db.drivers.update_one({"id": d["id"]}, {"$set": {
                "id": d["id"], "name": d["name"], "vehicle": d["vehicle"], "plate": d["plate"],
            }}, upsert=True)
        self._tick_task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._tick_task:
            self._tick_task.cancel()

    async def _loop(self) -> None:
        try:
            while True:
                await self._tick()
                await asyncio.sleep(2.0)
        except asyncio.CancelledError:
            return

    async def _tick(self) -> None:
        self._tick_count += 1
        # Random helmet/offline events occasionally
        for s in self.drivers.values():
            if s["status"] == "active":
                if random.random() < 0.005:
                    s["helmet_connected"] = not s["helmet_connected"]
                if random.random() < 0.003:
                    s["status"] = "offline"
                    s["consent"] = False
            elif s["status"] == "offline" and random.random() < 0.05:
                s["status"] = "active"
                s["consent"] = True
                s["helmet_connected"] = True

            self._move(s)

        # Maybe trigger an impact (low probability per tick).
        # Skip the first 5 ticks (warm-up) and never raise more than 2 active impacts at once.
        active_pending = sum(1 for a in self.alerts.values() if a["status"] == "pending")
        if (
            self._tick_count > 5
            and active_pending < 2
            and random.random() < 0.012
        ):
            candidates = [s for s in self.drivers.values() if s["status"] == "active"]
            if candidates:
                victim = random.choice(candidates)
                await self._raise_impact(victim)

        # Snapshot persist (low frequency every ~10 ticks)
        if random.randint(0, 9) == 0 and self._db is not None:
            docs = []
            ts = datetime.now(timezone.utc).isoformat()
            for s in self.drivers.values():
                docs.append({
                    "driver_id": s["id"], "ts": ts,
                    "lat": s["lat"], "lng": s["lng"], "speed": s["speed"],
                    "gforce": s["gforce"], "status": s["status"],
                    "helmet_connected": s["helmet_connected"], "battery": s["battery"],
                })
            if docs:
                await self._db.telemetry.insert_many(docs)

        await self._broadcast({
            "type": "telemetry_batch",
            "ts": datetime.now(timezone.utc).isoformat(),
            "drivers": list(self.drivers.values()),
        })

    async def _raise_impact(self, driver: dict) -> None:
        driver["status"] = "critical"
        gforce = round(random.uniform(4.5, 8.5), 2)
        driver["gforce"] = gforce
        alert = {
            "id": f"alt-{uuid.uuid4().hex[:8]}",
            "driver_id": driver["id"],
            "driver_name": driver["name"],
            "type": "impact",
            "severity": "critical" if gforce >= 6 else "high",
            "lat": driver["lat"],
            "lng": driver["lng"],
            "gforce": gforce,
            "speed": round(driver["speed"], 1),
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "ack_by": None,
            "ack_at": None,
        }
        self.alerts[alert["id"]] = alert
        if self._db is not None:
            await self._db.alerts.insert_one(alert.copy())
            await self._db.events.insert_one({
                "id": f"evt-{uuid.uuid4().hex[:8]}",
                "driver_id": driver["id"],
                "type": "impact",
                "severity": alert["severity"],
                "lat": alert["lat"], "lng": alert["lng"],
                "gforce": gforce, "speed": alert["speed"],
                "ts": alert["created_at"],
            })
        await self._broadcast({"type": "alert", "alert": alert})

    # ---------- public API ----------
    async def acknowledge(self, alert_id: str, user: dict) -> Optional[dict]:
        a = self.alerts.get(alert_id)
        if not a or a["status"] != "pending":
            return None
        a["status"] = "acknowledged"
        a["ack_by"] = user["email"]
        a["ack_by_name"] = user.get("name") or user["email"]
        a["ack_at"] = datetime.now(timezone.utc).isoformat()
        # bring driver back to active
        d = self.drivers.get(a["driver_id"])
        if d and d["status"] == "critical":
            d["status"] = "active"
            d["gforce"] = 1.0
        if self._db is not None:
            await self._db.alerts.update_one({"id": alert_id}, {"$set": {
                "status": a["status"], "ack_by": a["ack_by"],
                "ack_by_name": a["ack_by_name"], "ack_at": a["ack_at"],
            }})
        await self._broadcast({"type": "alert_update", "alert": a})
        return a

    async def false_alarm(self, alert_id: str, user: dict) -> Optional[dict]:
        a = self.alerts.get(alert_id)
        if not a:
            return None
        a["status"] = "false_alarm"
        a["ack_by"] = user["email"]
        a["ack_by_name"] = user.get("name") or user["email"]
        a["ack_at"] = datetime.now(timezone.utc).isoformat()
        d = self.drivers.get(a["driver_id"])
        if d and d["status"] == "critical":
            d["status"] = "active"
            d["gforce"] = 1.0
        if self._db is not None:
            await self._db.alerts.update_one({"id": alert_id}, {"$set": {
                "status": "false_alarm", "ack_by": a["ack_by"],
                "ack_by_name": a["ack_by_name"], "ack_at": a["ack_at"],
            }})
            await self._db.events.insert_one({
                "id": f"evt-{uuid.uuid4().hex[:8]}",
                "driver_id": a["driver_id"],
                "type": "false_alarm",
                "severity": "info",
                "lat": a["lat"], "lng": a["lng"],
                "ts": a["ack_at"],
                "ref_alert": alert_id,
            })
        await self._broadcast({"type": "alert_update", "alert": a})
        return a

    def list_drivers(self) -> List[dict]:
        return list(self.drivers.values())

    def list_alerts(self) -> List[dict]:
        return sorted(self.alerts.values(), key=lambda a: a["created_at"], reverse=True)


simulator = FleetSimulator()
