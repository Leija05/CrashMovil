"""Seed extra impact_events with varying severities, statuses and dates so the
'Historial de choques' modal has interesting data to filter through.

Idempotent: skips if equivalent demo set already exists.
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient


MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Marker doc so we don't re-seed
    marker = await db.monitor_acks.find_one({"_seed_marker": "history-v1"})
    if marker:
        print("Already seeded (history-v1). Aborting.")
        return

    users = await db.users.find({"role": "user"}).to_list(20)
    if not users:
        print("No users yet — run seed_mobile_demo.py first.")
        return

    now = datetime.now(timezone.utc)

    samples = [
        # (offset_days, severity, severity_label, gforce, ack_status, lat, lng, dx)
        (0,   "high",     "Alto",     6.8, "acknowledged", 19.4326, -99.1332, "Choque lateral con automóvil"),
        (0,   "medium",   "Medio",    3.4, "false_alarm",  19.4180, -99.1654, "Frenado brusco"),
        (1,   "critical", "Crítico",  9.2, "acknowledged", 19.4400, -99.1500, "Volcadura a alta velocidad"),
        (2,   "high",     "Alto",     7.1, "acknowledged", 19.4290, -99.1420, "Colisión por alcance"),
        (3,   "medium",   "Medio",    4.0, "pending",      19.4500, -99.1600, "Caída lateral"),
        (5,   "low",      "Bajo",     2.5, "false_alarm",  19.4100, -99.1700, "Bache fuerte (falsa alarma)"),
        (7,   "high",     "Alto",     6.4, "acknowledged", 19.3950, -99.1426, "Impacto frontal leve"),
        (10,  "critical", "Crítico",  8.6, "acknowledged", 19.4700, -99.1800, "Atropello evitado"),
        (14,  "medium",   "Medio",    3.9, "acknowledged", 19.4200, -99.1300, "Derrape en curva"),
        (20,  "low",      "Bajo",     2.0, "false_alarm",  19.4350, -99.2050, "Vibración fuerte"),
    ]

    diag_template = lambda label, gf, summary: {
        "severity_assessment": f"{summary} — fuerza registrada {gf:.2f}G ({label.lower()}).",
        "possible_injuries": (
            ["Posible TCE", "Fracturas en extremidades", "Trauma interno"] if gf >= 7
            else ["Contusiones leves", "Esguinces"] if gf >= 4
            else ["Sin lesiones aparentes"]
        ),
        "first_aid_steps": [
            "Llamar al 911 inmediatamente",
            "No mover al paciente salvo riesgo inminente",
            "Mantener vías aéreas abiertas",
            "Controlar hemorragias visibles",
        ] if gf >= 4 else ["Verificar al motociclista", "Reposo y observación"],
        "emergency_recommendations": (
            ["Activar servicios de emergencia 911", "Notificar contactos de emergencia"]
            if gf >= 4 else ["Documentar incidente"]
        ),
        "priority_level": (
            "Crítico" if gf >= 8 else "Alto" if gf >= 6 else "Medio" if gf >= 3 else "Bajo"
        ),
    }

    inserted = 0
    for i, (offset, sev, sev_label, gforce, ack_status, lat, lng, summary) in enumerate(samples):
        u = users[i % len(users)]
        uid = str(u["_id"])
        impact_id = str(uuid.uuid4())
        ts = (now - timedelta(days=offset, hours=(i * 3) % 24)).isoformat()

        await db.impact_events.insert_one({
            "id": impact_id,
            "user_id": uid,
            "acceleration": {"x": 4.5, "y": -3.2, "z": 9.5},
            "gyroscope": {"x": 0.6, "y": -0.4, "z": 0.1},
            "g_force": gforce,
            "severity": sev,
            "severity_label": sev_label,
            "location": {"latitude": lat, "longitude": lng},
            "ai_diagnosis": diag_template(sev_label, gforce, summary),
            "alerts_sent": True,
            "created_at": ts,
        })

        if ack_status != "pending":
            await db.monitor_acks.update_one(
                {"impact_id": impact_id},
                {"$set": {
                    "impact_id": impact_id,
                    "status": ack_status,
                    "ack_by": "monitor@crash.io" if i % 2 == 0 else "admin@crash.io",
                    "ack_by_name": "Monitorista" if i % 2 == 0 else "Administrador",
                    "ack_at": ts,
                    "updated_at": ts,
                }},
                upsert=True,
            )
        inserted += 1

    # Plant the marker
    await db.monitor_acks.insert_one({
        "_seed_marker": "history-v1",
        "created_at": now.isoformat(),
    })

    print(f"Seeded {inserted} historical impact events.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
