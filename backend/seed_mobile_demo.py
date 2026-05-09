"""Seed a few mobile users + recent telemetry + one pending impact_event into
the shared 'crash_database' so we can validate the web monitor end-to-end.

Run with:  python /app/backend/seed_mobile_demo.py
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import bcrypt


MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _hash(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


SEED_USERS = [
    {"email": "alex.rider@demo.io",   "name": "Alex Rider",   "lat": 19.4326, "lng": -99.1332, "speed": 42.3, "g_force": 1.05},
    {"email": "maria.lopez@demo.io",  "name": "María López",  "lat": 19.4180, "lng": -99.1654, "speed": 28.0, "g_force": 0.98},
    {"email": "diego.salas@demo.io",  "name": "Diego Salas",  "lat": 19.4490, "lng": -99.1276, "speed": 55.7, "g_force": 1.12},
    {"email": "lina.morales@demo.io", "name": "Lina Morales", "lat": 19.3950, "lng": -99.1426, "speed": 0.0,  "g_force": 0.0},
]


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    user_ids: list[tuple[str, str, dict]] = []
    for s in SEED_USERS:
        existing = await db.users.find_one({"email": s["email"]})
        if existing:
            uid = str(existing["_id"])
        else:
            res = await db.users.insert_one({
                "email": s["email"],
                "name": s["name"],
                "password_hash": _hash("demo1234"),
                "role": "user",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            uid = str(res.inserted_id)
            print(f"created user {s['email']} -> {uid}")

        # Always push one fresh telemetry doc with GPS so the map has a marker
        await db.telemetry.insert_one({
            "user_id": uid,
            "acceleration": {"x": 0.1, "y": 0.05, "z": 9.8},
            "gyroscope": {"x": 0.0, "y": 0.0, "z": 0.0},
            "g_force": s["g_force"],
            "latitude": s["lat"],
            "longitude": s["lng"],
            "speed": s["speed"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        user_ids.append((uid, s["email"], s))

    # Make Diego have a pending impact (will appear as critical)
    diego_uid = user_ids[2][0]
    diego_seed = user_ids[2][2]
    impact_id = str(uuid.uuid4())
    await db.impact_events.insert_one({
        "id": impact_id,
        "user_id": diego_uid,
        "acceleration": {"x": 4.5, "y": -3.2, "z": 9.5},
        "gyroscope": {"x": 0.6, "y": -0.4, "z": 0.1},
        "g_force": 7.4,
        "severity": "high",
        "severity_label": "Alto",
        "location": {"latitude": diego_seed["lat"], "longitude": diego_seed["lng"]},
        "ai_diagnosis": {
            "severity_assessment": "Impacto fuerte (7.4G) — riesgo alto",
            "possible_injuries": ["Posible TCE leve", "Contusión cervical"],
            "first_aid_steps": ["Llamar al 911", "No mover al paciente", "Mantener vías aéreas"],
            "emergency_recommendations": ["Activar servicios de emergencia 911"],
            "priority_level": "alto",
        },
        "alerts_sent": True,
        "created_at": (datetime.now(timezone.utc) - timedelta(seconds=20)).isoformat(),
    })
    print(f"created pending impact {impact_id} for {user_ids[2][1]}")

    print(f"done. {len(user_ids)} users seeded into '{DB_NAME}'.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
