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
- Real WebSocket backend (FastAPI + driver simulator)
- Leaflet with CartoDB Dark Matter (free, no API key)
- JWT auth with two seeded users (admin / monitor)
- Synthetic Web Audio API alert sounds
- Full MVP: dashboard + bento + alerts + login + history

## Architecture
- **Backend**: FastAPI + Motor (Mongo) + asyncio simulator broadcasting via WebSocket
- **Frontend**: React 19 + Tailwind + react-leaflet + Web Audio API
- **Auth**: Custom JWT (HS256), httpOnly cookies + Bearer fallback, bcrypt hashing
- **Real-time**: `/api/ws` pushes `snapshot` once + `telemetry_batch` every 2s + `alert` events; client throttles re-renders (250ms flush)

## Personas
- **Administrador**: full access, can view admin endpoints, all monitoring features
- **Monitorista**: monitoring-only — drivers, alerts, history, ack/false-alarm

## What's been implemented (2026-05-09)
- ✅ JWT auth (login/me/logout) with seeded admin + monitor + bcrypt + role guards
- ✅ Driver fleet simulator (8 riders around CDMX, 2s telemetry tick, probabilistic impacts capped at 2 active)
- ✅ WebSocket `/api/ws` with token gate, snapshot + batch + alert frames
- ✅ REST endpoints: drivers, driver detail, history, events, alerts, ack, false-alarm, admin/users
- ✅ Login page (Spanish, glassmorphism, brand panel + form)
- ✅ Dashboard (Bento: driver list 3 / map+telemetry 6 / alerts 3) with live WS sync
- ✅ Live map: Leaflet dark, custom pulsing status markers, popups, legend
- ✅ Telemetry bento: helmet BT, speed, G-Force, GPS+battery (semantic tones)
- ✅ Alerts Center: pending/history tabs, audio klaxon on impact, mute toggle, ack + false-alarm actions
- ✅ Per-driver History page: route polyline, event circle markers, events list
- ✅ Mongo indices, _id excluded from all responses, datetimes serialised as ISO strings
- ✅ data-testid coverage across all interactive elements
- ✅ Tested end-to-end: 20/20 backend, 11/11 frontend flows

## Backlog (P0 / P1 / P2)
- P1: Brute-force lockout (5 fails → 15 min) — playbook mentions, not yet in scope
- P1: Driver consent toggle from UI (currently auto by simulator)
- P2: CSV export of history + events
- P2: Real device ingestion endpoint (`POST /api/ingest/telemetry`) for actual helmets
- P2: Geofencing zones + warnings
- P2: Operator audit log
- P2: Multi-tenant fleets

## Next Tasks
- Real device telemetry ingestion (replace simulator with actual rider apps posting to `/api/ingest/telemetry`)
- Persist active alert sound preference per operator
- Push-notification escalation when no acknowledgement within N seconds
