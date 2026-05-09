"""Mobile data bridge for C.R.A.S.H. 2.0 web monitor.

Reads the live mobile-app collections (users / telemetry / impact_events /
user_profiles) from the shared MongoDB and exposes the same surface that the
synthetic ``simulator`` did, so ``server.py`` can swap them transparently.

Mapping:
- driver  ← users where role="user"; id = str(_id)
- live state ← latest telemetry document for that user
                (lat/lng/speed only present if the mobile backend includes them)
- gps fallback ← location of last impact_event in last 24h
- alert    ← impact_event document; ack/false_alarm state stored in
              ``monitor_acks`` (separate collection, never mutates mobile data)
- status   ← critical (recent unacked impact) | active (recent telemetry)
              | offline (no telemetry within OFFLINE_AFTER_S)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId

logger = logging.getLogger("crash.bridge")

POLL_INTERVAL_S = 2.0
OFFLINE_AFTER_S = 30
RECENT_IMPACT_WINDOW_MIN = 30
ALERT_LOOKBACK_HOURS = 24


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        # mobile stores `datetime.now(timezone.utc).isoformat()` -> "...+00:00"
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


class MobileBridge:
    def __init__(self) -> None:
        self.drivers: Dict[str, dict] = {}
        self.alerts: Dict[str, dict] = {}
        self._db = None
        self._broadcast = None
        self._task: Optional[asyncio.Task] = None
        self._known_impact_ids: set[str] = set()
        self._user_name_cache: Dict[str, str] = {}
        self._first_load_done = False

    # ----- lifecycle -----
    async def start(self, db, broadcast) -> None:
        self._db = db
        self._broadcast = broadcast
        # Build initial state without raising "new alert" frames
        await self._refresh_drivers()
        await self._refresh_alerts(suppress_new=True)
        self._first_load_done = True
        self._task = asyncio.create_task(self._loop())
        logger.info(
            "MobileBridge started — %d drivers, %d alerts loaded",
            len(self.drivers), len(self.alerts),
        )

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        try:
            while True:
                try:
                    await self._refresh_drivers()
                    new_pending = await self._refresh_alerts(suppress_new=False)
                    for a in new_pending:
                        await self._broadcast({"type": "alert", "alert": a})
                    await self._broadcast({
                        "type": "telemetry_batch",
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "drivers": list(self.drivers.values()),
                    })
                except Exception as exc:  # noqa: BLE001 — keep poller alive
                    logger.warning("Bridge tick failed: %s", exc)
                await asyncio.sleep(POLL_INTERVAL_S)
        except asyncio.CancelledError:
            return

    # ----- helpers -----
    async def _user_name(self, user_id: str) -> str:
        if user_id in self._user_name_cache:
            return self._user_name_cache[user_id]
        try:
            obj_id = ObjectId(user_id)
        except (InvalidId, TypeError):
            self._user_name_cache[user_id] = user_id
            return user_id
        u = await self._db.users.find_one({"_id": obj_id}, {"name": 1, "email": 1})
        if not u:
            name = user_id
        else:
            name = u.get("name") or (u.get("email") or "").split("@")[0] or user_id
        self._user_name_cache[user_id] = name
        return name

    @staticmethod
    def _has_pending(ack_doc: Optional[dict]) -> bool:
        return not ack_doc or ack_doc.get("status", "pending") == "pending"

    # ----- drivers -----
    async def _refresh_drivers(self) -> None:
        users = await self._db.users.find(
            {"role": "user"},
            {"_id": 1, "email": 1, "name": 1, "created_at": 1},
        ).to_list(500)
        now = datetime.now(timezone.utc)
        active_ids = set()

        for u in users:
            uid = str(u["_id"])
            active_ids.add(uid)

            telemetry = await self._db.telemetry.find_one(
                {"user_id": uid}, {"_id": 0}, sort=[("timestamp", -1)],
            )
            recent_impact = await self._db.impact_events.find_one(
                {
                    "user_id": uid,
                    "created_at": {"$gte": (now - timedelta(minutes=RECENT_IMPACT_WINDOW_MIN)).isoformat()},
                },
                {"_id": 0},
                sort=[("created_at", -1)],
            )

            telemetry_age: Optional[float] = None
            if telemetry:
                ts = _parse_iso(telemetry.get("timestamp"))
                if ts:
                    telemetry_age = (now - ts).total_seconds()

            is_critical = False
            critical_gforce = None
            if recent_impact:
                ack = await self._db.monitor_acks.find_one(
                    {"impact_id": recent_impact["id"]}, {"_id": 0}
                )
                if self._has_pending(ack):
                    is_critical = True
                    critical_gforce = recent_impact.get("g_force")

            if is_critical:
                status = "critical"
            elif telemetry_age is not None and telemetry_age < OFFLINE_AFTER_S:
                status = "active"
            else:
                status = "offline"

            # GPS: prefer telemetry, fallback to recent impact location
            lat = telemetry.get("latitude") if telemetry else None
            lng = telemetry.get("longitude") if telemetry else None
            if (lat is None or lng is None) and recent_impact:
                loc = recent_impact.get("location") or {}
                lat = loc.get("latitude") if lat is None else lat
                lng = loc.get("longitude") if lng is None else lng

            # Speed: from telemetry if mobile sends it
            speed = (telemetry or {}).get("speed")

            # G-force: live from telemetry, override with critical impact value
            gforce = (telemetry or {}).get("g_force") or 0
            if critical_gforce is not None:
                gforce = critical_gforce

            email = u.get("email") or ""
            self.drivers[uid] = {
                "id": uid,
                "name": u.get("name") or email or uid,
                "email": email,
                "vehicle": "Motocicleta",
                "plate": email.split("@")[0] if email else uid[-6:],
                "lat": lat,
                "lng": lng,
                "speed": float(speed) if isinstance(speed, (int, float)) else 0.0,
                "gforce": float(gforce) if isinstance(gforce, (int, float)) else 0.0,
                "battery": (telemetry or {}).get("battery"),
                "helmet_connected": telemetry_age is not None and telemetry_age < OFFLINE_AFTER_S,
                "consent": True,
                "status": status,
                "last_update": (telemetry or {}).get("timestamp") or now.isoformat(),
            }

        # Drop drivers that no longer exist as mobile users
        for stale in [k for k in self.drivers if k not in active_ids]:
            del self.drivers[stale]

    # ----- alerts -----
    async def _refresh_alerts(self, suppress_new: bool) -> List[dict]:
        cutoff = (
            datetime.now(timezone.utc) - timedelta(hours=ALERT_LOOKBACK_HOURS)
        ).isoformat()
        impacts = await self._db.impact_events.find(
            {"created_at": {"$gte": cutoff}}, {"_id": 0}
        ).sort("created_at", -1).limit(300).to_list(300)

        ack_states: Dict[str, dict] = {}
        if impacts:
            ids = [i["id"] for i in impacts]
            acks = await self._db.monitor_acks.find(
                {"impact_id": {"$in": ids}}, {"_id": 0}
            ).to_list(1000)
            ack_states = {a["impact_id"]: a for a in acks}

        new_alerts_map: Dict[str, dict] = {}
        new_pending: List[dict] = []
        for imp in impacts:
            ack = ack_states.get(imp["id"], {})
            status = ack.get("status", "pending")
            location = imp.get("location") or {}
            uid = imp["user_id"]
            alert = {
                "id": imp["id"],
                "driver_id": uid,
                "driver_name": await self._user_name(uid),
                "type": "impact",
                "severity": imp.get("severity") or "high",
                "severity_label": imp.get("severity_label"),
                "lat": location.get("latitude"),
                "lng": location.get("longitude"),
                "gforce": imp.get("g_force"),
                "speed": 0,
                "status": status,
                "created_at": imp.get("created_at"),
                "ack_by": ack.get("ack_by"),
                "ack_by_name": ack.get("ack_by_name"),
                "ack_at": ack.get("ack_at"),
                "ai_diagnosis": imp.get("ai_diagnosis"),
                "alerts_sent": imp.get("alerts_sent"),
            }
            new_alerts_map[alert["id"]] = alert
            if (
                not suppress_new
                and alert["id"] not in self._known_impact_ids
                and status == "pending"
            ):
                new_pending.append(alert)
            self._known_impact_ids.add(alert["id"])

        self.alerts = new_alerts_map
        return new_pending

    # ----- public API used by /api/* -----
    def list_drivers(self) -> List[dict]:
        return list(self.drivers.values())

    def list_alerts(self) -> List[dict]:
        return sorted(
            self.alerts.values(),
            key=lambda a: a.get("created_at") or "",
            reverse=True,
        )

    async def get_driver(self, driver_id: str) -> Optional[dict]:
        return self.drivers.get(driver_id)

    async def driver_history(self, driver_id: str, limit: int = 200) -> List[dict]:
        cursor = self._db.telemetry.find(
            {"user_id": driver_id}, {"_id": 0}
        ).sort("timestamp", -1).limit(limit)
        points = await cursor.to_list(length=limit)
        points.reverse()
        # Normalise field names so the frontend keeps working
        normalised = []
        for p in points:
            normalised.append({
                "ts": p.get("timestamp"),
                "lat": p.get("latitude"),
                "lng": p.get("longitude"),
                "speed": p.get("speed", 0) or 0,
                "gforce": p.get("g_force", 0) or 0,
                "g_force": p.get("g_force"),
                "acceleration": p.get("acceleration"),
                "gyroscope": p.get("gyroscope"),
            })
        return normalised

    async def driver_events(self, driver_id: str, limit: int = 100) -> List[dict]:
        cursor = self._db.impact_events.find(
            {"user_id": driver_id}, {"_id": 0}
        ).sort("created_at", -1).limit(limit)
        events = await cursor.to_list(length=limit)
        normalised = []
        for e in events:
            location = e.get("location") or {}
            normalised.append({
                "id": e.get("id"),
                "driver_id": driver_id,
                "type": "impact",
                "severity": e.get("severity"),
                "severity_label": e.get("severity_label"),
                "lat": location.get("latitude"),
                "lng": location.get("longitude"),
                "gforce": e.get("g_force"),
                "speed": 0,
                "ts": e.get("created_at"),
                "ai_diagnosis": e.get("ai_diagnosis"),
                "alerts_sent": e.get("alerts_sent"),
            })
        return normalised

    async def driver_profile(self, driver_id: str) -> dict:
        prof = await self._db.user_profiles.find_one(
            {"user_id": driver_id}, {"_id": 0}
        ) or {}
        contacts = await self._db.emergency_contacts.find(
            {"user_id": driver_id}, {"_id": 0}
        ).to_list(50)
        settings = await self._db.user_settings.find_one(
            {"user_id": driver_id}, {"_id": 0}
        ) or {}
        prof["emergency_contacts"] = contacts
        prof["settings"] = settings
        return prof

    async def acknowledge(self, alert_id: str, user: dict) -> Optional[dict]:
        if alert_id not in self.alerts:
            return None
        now = datetime.now(timezone.utc).isoformat()
        await self._db.monitor_acks.update_one(
            {"impact_id": alert_id},
            {"$set": {
                "impact_id": alert_id,
                "status": "acknowledged",
                "ack_by": user["email"],
                "ack_by_name": user.get("name") or user["email"],
                "ack_at": now,
                "updated_at": now,
            }},
            upsert=True,
        )
        a = self.alerts[alert_id]
        a["status"] = "acknowledged"
        a["ack_by"] = user["email"]
        a["ack_by_name"] = user.get("name") or user["email"]
        a["ack_at"] = now
        await self._broadcast({"type": "alert_update", "alert": a})
        return a

    async def false_alarm(self, alert_id: str, user: dict) -> Optional[dict]:
        if alert_id not in self.alerts:
            return None
        now = datetime.now(timezone.utc).isoformat()
        await self._db.monitor_acks.update_one(
            {"impact_id": alert_id},
            {"$set": {
                "impact_id": alert_id,
                "status": "false_alarm",
                "ack_by": user["email"],
                "ack_by_name": user.get("name") or user["email"],
                "ack_at": now,
                "updated_at": now,
            }},
            upsert=True,
        )
        a = self.alerts[alert_id]
        a["status"] = "false_alarm"
        a["ack_by"] = user["email"]
        a["ack_by_name"] = user.get("name") or user["email"]
        a["ack_at"] = now
        await self._broadcast({"type": "alert_update", "alert": a})
        return a

    # ----- query all impacts (for the global /api/impacts endpoint) -----
    async def query_impacts(
        self,
        q: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        days: Optional[int] = None,
        limit: int = 500,
    ) -> List[dict]:
        """Return all impacts (joined with monitor_acks + driver info), filtered."""
        date_query: Dict[str, Any] = {}
        if days is not None and days > 0 and not date_from and not date_to:
            date_from = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        if date_from:
            date_query["$gte"] = date_from
        if date_to:
            date_query["$lte"] = date_to

        mongo_q: Dict[str, Any] = {}
        if date_query:
            mongo_q["created_at"] = date_query
        if severity:
            sev = severity.lower()
            mongo_q["severity"] = {"$in": [sev, sev.capitalize(), sev.upper()]}

        cursor = self._db.impact_events.find(mongo_q, {"_id": 0}).sort(
            "created_at", -1
        ).limit(max(1, min(int(limit), 1000)))
        impacts = await cursor.to_list(length=limit)

        if not impacts:
            return []

        ids = [i["id"] for i in impacts]
        acks = await self._db.monitor_acks.find(
            {"impact_id": {"$in": ids}}, {"_id": 0}
        ).to_list(2000)
        ack_states = {a["impact_id"]: a for a in acks}

        results: List[dict] = []
        for imp in impacts:
            ack = ack_states.get(imp["id"], {})
            st = ack.get("status", "pending")
            location = imp.get("location") or {}
            uid = imp["user_id"]
            driver_name = await self._user_name(uid)
            driver_email = ""
            try:
                obj_id = ObjectId(uid)
                u = await self._db.users.find_one({"_id": obj_id}, {"email": 1})
                driver_email = (u or {}).get("email", "") or ""
            except (InvalidId, TypeError):
                pass

            row = {
                "id": imp["id"],
                "driver_id": uid,
                "driver_name": driver_name,
                "driver_email": driver_email,
                "type": "impact",
                "severity": imp.get("severity") or "high",
                "severity_label": imp.get("severity_label"),
                "lat": location.get("latitude"),
                "lng": location.get("longitude"),
                "gforce": imp.get("g_force"),
                "speed": 0,
                "status": st,
                "created_at": imp.get("created_at"),
                "ack_by": ack.get("ack_by"),
                "ack_by_name": ack.get("ack_by_name"),
                "ack_at": ack.get("ack_at"),
                "ai_diagnosis": imp.get("ai_diagnosis"),
                "alerts_sent": imp.get("alerts_sent"),
            }
            # Status filter
            if status and status != "all" and row["status"] != status:
                continue
            # Name search
            if q:
                ql = q.strip().lower()
                if ql and ql not in driver_name.lower() and ql not in driver_email.lower():
                    continue
            results.append(row)
        return results


bridge = MobileBridge()
