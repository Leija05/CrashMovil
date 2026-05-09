# C.R.A.S.H. 2.0 Monitor — Product Requirements Document

## Original Problem Statement
Build a desktop/tablet monitoring web dashboard for the C.R.A.S.H. 2.0 system
(Critical Response Alert System for Helmets). Replicate the visual language of
the mobile app: Dark Mode, Glassmorphism (subtle borders + blur), Bento Grid
layout. The site lets an operator monitor multiple riders in real time:
live map with status-coded markers, telemetry bento (helmet BT, speed, GPS,
G-Force), critical alerts with sound + visual cues, false-alarm logging,
role-based login (Admin / Monitorista), and per-driver route + event history.

## User Choices
- Real WebSocket backend (FastAPI) — switchable simulator vs live mobile DB
- Leaflet with CartoDB Dark Matter (free, no API key)
- JWT auth with two seeded operators (admin@crash.io / monitor@crash.io) in a
  dedicated `monitor_operators` collection
- Synthetic Web Audio API alert sounds
- Full MVP: dashboard + bento + alerts + login + history
- **LIVE mode connected to the mobile-app MongoDB** (`crash_database`)

## Architecture
- **Backend**: FastAPI + Motor (Mongo) + asyncio poller broadcasting via WebSocket
- **Two data sources** (env flag `DEMO_MODE`):
  - `DEMO_MODE=true`  → synthetic `simulator.FleetSimulator` (8 fake bikers in CDMX)
  - `DEMO_MODE=false` → `mobile_bridge.MobileBridge` reading the real mobile collections
- **Frontend**: React 19 + Tailwind + react-leaflet + Web Audio API
- **Auth**: Custom JWT (HS256), httpOnly cookies + Bearer fallback, bcrypt hashing
- **Real-time**: `/api/ws` pushes `snapshot` once + `telemetry_batch` every 2s + `alert` events; client throttles re-renders (250ms flush)

## Data contract — LIVE mode (mobile DB)

Shared MongoDB: `MONGO_URL=mongodb://localhost:27017`, `DB_NAME=crash_database`.

| Mobile collection      | Used for                                                                 |
|------------------------|--------------------------------------------------------------------------|
| `users` (role="user")  | Driver registry. `_id`→`driver_id`, plus `name` and `email`.            |
| `telemetry`            | Live state: `g_force`, `acceleration`, `gyroscope`, `latitude`/`longitude`/`speed` (if mobile sends them), `timestamp`. Latest doc wins. |
| `impact_events`        | Alerts. `id`→alert id, `severity`, `g_force`, `location`, `created_at`, `ai_diagnosis`. |
| `user_profiles`        | Optional medical profile shown on the driver detail.                     |

Web-monitor-only collections (never mutate mobile docs):
- `monitor_operators` — admin / monitor accounts, JWT subject
- `monitor_acks` — `{impact_id, status: pending|acknowledged|false_alarm, ack_by, ack_at}`

### Status derivation per driver
- `critical` if a recent (≤ 30 min) `impact_event` is not yet in `monitor_acks` with status≠pending
- `active` if `telemetry.timestamp` within last 30 s
- `offline` otherwise

### GPS handling (current limitation)
The mobile `TelemetryInput` model in `CrashMovil2-0-main/backend/server.py` does
**not** include latitude / longitude / speed. To render live moving markers,
add the optional fields to that model and to the `db.telemetry.insert_one` doc:

```python
class TelemetryInput(BaseModel):
    acceleration_x: float
    acceleration_y: float
    acceleration_z: float
    gyroscope_x: float
    gyroscope_y: float
    gyroscope_z: float
    g_force: float
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    speed: Optional[float] = None
    battery: Optional[int] = None
```

Until this is done the bridge falls back to the GPS of the latest `impact_event`
for that user; otherwise the driver appears in the sidebar without a map marker
(amber banner: "N sin GPS — el mobile aún no envía coordenadas").

## What's been implemented (2026-05-09)
- ✅ JWT auth (operators in `monitor_operators`) — admin@crash.io / monitor@crash.io
- ✅ `simulator.FleetSimulator` (DEMO_MODE=true) — 8 synthetic bikers + impacts
- ✅ `mobile_bridge.MobileBridge` (DEMO_MODE=false) — reads mobile DB every 2 s
- ✅ WebSocket `/api/ws` token-gated, snapshot + batch + alert frames
- ✅ REST: drivers, driver detail, history (telemetry), events (impacts), alerts, ack, false-alarm, admin/users, system/mode
- ✅ Login page (Spanish, glassmorphism)
- ✅ Dashboard Bento (driver list / map+telemetry / alerts) with live WS sync
- ✅ Live map: dark Leaflet, custom pulsing status markers, "no GPS" banner
- ✅ Telemetry bento null-safe (handles missing GPS / speed / battery)
- ✅ Alerts Center: sound klaxon, mute, ack + false-alarm
- ✅ Per-driver History page: route polyline (when GPS exists) + impact events list
- ✅ `seed_mobile_demo.py` to inject realistic mobile docs for testing
- ✅ Tested 20/20 backend + 11/11 frontend in DEMO mode
- ✅ Live-mode validated end-to-end (4 demo users, 1 pending impact, ack writes
      to `monitor_acks`, status flips back to active)

## Backlog (P0 / P1 / P2)
- **P0** (mobile side): Add `latitude`, `longitude`, `speed`, `battery` to the
  mobile `/api/telemetry` payload — needed for live map markers / route polyline.
- P1: Mobile-side `helmet_connected` flag in telemetry (currently inferred from
  telemetry recency).
- P1: Brute-force lockout for the operator login.
- P2: Operator audit log (every ack / false-alarm).
- P2: SMS / push escalation if a critical alert isn't ack'd within N seconds.
- P2: Multi-tenant fleets, geofences, CSV exports.

## Next Tasks
1. Coordinate with the mobile team to extend `TelemetryInput` (P0).
2. Add fleet-level KPI panel (avg ack time, false-alarm rate, helmet-BT %).
3. Wire AI diagnosis (`impact_events.ai_diagnosis`) into the alert detail panel
   (already loaded by the bridge, just needs UI surfacing).
