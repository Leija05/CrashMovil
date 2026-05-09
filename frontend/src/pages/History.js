import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  MapPin,
  Activity,
  Gauge,
  Clock,
  AlertTriangle,
  BellRing,
  User as UserIcon,
  Crosshair,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import { api, formatApiError } from "../lib/api";
import AlertDiagnosis from "../components/AlertDiagnosis";

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

const SEVERITY_TONE = {
  critical: "border-red-500/50 bg-red-500/15 text-red-300",
  critico: "border-red-500/50 bg-red-500/15 text-red-300",
  "crítico": "border-red-500/50 bg-red-500/15 text-red-300",
  high: "border-red-500/40 bg-red-500/10 text-red-300",
  alto: "border-red-500/40 bg-red-500/10 text-red-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  medio: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  bajo: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

function severityTone(sev) {
  if (!sev) return "border-white/10 bg-white/5 text-neutral-300";
  return SEVERITY_TONE[String(sev).toLowerCase()] || "border-white/10 bg-white/5 text-neutral-300";
}

// Child component that pans the map to the selected impact location.
function MapFlyTo({ position, zoom = 16 }) {
  const map = useMap();
  useEffect(() => {
    if (position && Array.isArray(position) && position.length === 2) {
      map.flyTo(position, zoom, { duration: 0.9 });
    }
  }, [position, zoom, map]);
  return null;
}

export default function History() {
  const { driverId } = useParams();
  const [profile, setProfile] = useState(null);
  const [points, setPoints] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [selectedEventId, setSelectedEventId] = useState(null);

  const markerRefs = useRef({});
  const cardRefs = useRef({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [d, h, e] = await Promise.all([
          api.get(`/drivers/${driverId}`),
          api.get(`/drivers/${driverId}/history?limit=300`),
          api.get(`/drivers/${driverId}/events?limit=100`),
        ]);
        if (!mounted) return;
        setProfile(d.data.driver);
        setPoints(h.data.points || []);
        const evts = e.data.events || [];
        setEvents(evts);
        // Auto-select the most recent geo-located impact so the user immediately
        // sees a marker on the map (the API returns events DESC by created_at).
        const firstWithGps = evts.find((ev) => ev.lat && ev.lng);
        if (firstWithGps) setSelectedEventId(firstWithGps.id);
      } catch (err) {
        setError(formatApiError(err));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [driverId]);

  const path = points.map((p) => [p.lat, p.lng]).filter(([a, b]) => a != null && b != null);

  const eventsWithGps = useMemo(
    () => events.filter((e) => e.lat != null && e.lng != null),
    [events],
  );

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId],
  );

  const flyTarget = selectedEvent && selectedEvent.lat && selectedEvent.lng
    ? [selectedEvent.lat, selectedEvent.lng]
    : null;

  const center = flyTarget
    || path[Math.floor(path.length / 2)]
    || (eventsWithGps[0] ? [eventsWithGps[0].lat, eventsWithGps[0].lng] : null)
    || [profile?.lat || 19.4326, profile?.lng || -99.1332];

  const handleSelectEvent = (ev) => {
    if (!ev) return;
    setSelectedEventId(ev.id);
    // Scroll the card into view
    const card = cardRefs.current[ev.id];
    if (card && card.scrollIntoView) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    // Open the marker popup if it exists
    setTimeout(() => {
      const m = markerRefs.current[ev.id];
      if (m && m.openPopup) m.openPopup();
    }, 350);
  };

  const hasMapContent = path.length > 0 || eventsWithGps.length > 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white p-4 lg:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            data-testid="back-to-dashboard"
            className="h-10 w-10 rounded-xl border border-white/10 hover:border-white/30 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
              Historial de conductor
            </div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <UserIcon className="h-5 w-5 text-emerald-400" />
              {profile?.name || driverId}
            </h1>
            <div className="font-mono text-xs text-neutral-400 mt-0.5">
              {profile?.id} · {profile?.vehicle} · {profile?.plate}
              {profile?.email ? <span className="text-neutral-500"> · {profile.email}</span> : null}
            </div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3 text-xs text-neutral-400">
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="font-mono text-white">{points.length}</span> puntos
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="font-mono text-white">{events.length}</span> eventos
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2">
            <span className="font-mono">{eventsWithGps.length}</span> impactos geolocalizados
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        <div
          data-testid="history-map"
          className="lg:col-span-2 rounded-2xl border border-white/10 overflow-hidden min-h-[420px] relative"
        >
          {hasMapContent ? (
            <MapContainer
              center={center}
              zoom={selectedEvent ? 16 : 13}
              className="h-full w-full"
              style={{ background: "#0a0a0a", height: "100%" }}
            >
              <TileLayer
                attribution='&copy; carto.com'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              {path.length > 1 ? (
                <Polyline
                  positions={path}
                  pathOptions={{ color: "#10b981", weight: 3, opacity: 0.85 }}
                />
              ) : null}

              {/* Pulse halo around the currently selected impact */}
              {selectedEvent && selectedEvent.lat && selectedEvent.lng ? (
                <CircleMarker
                  key={`halo-${selectedEvent.id}`}
                  center={[selectedEvent.lat, selectedEvent.lng]}
                  radius={22}
                  pathOptions={{
                    color: "#ef4444",
                    fillColor: "#ef4444",
                    fillOpacity: 0.15,
                    weight: 1,
                    opacity: 0.6,
                    className: "crash-impact-halo",
                  }}
                  interactive={false}
                />
              ) : null}

              {eventsWithGps.map((e) => {
                const isSelected = e.id === selectedEventId;
                return (
                  <CircleMarker
                    key={e.id}
                    center={[e.lat, e.lng]}
                    radius={isSelected ? 12 : 8}
                    pathOptions={{
                      color: isSelected ? "#ffffff" : "#ef4444",
                      weight: isSelected ? 3 : 2,
                      fillColor: "#ef4444",
                      fillOpacity: isSelected ? 0.95 : 0.7,
                    }}
                    eventHandlers={{
                      click: () => handleSelectEvent(e),
                    }}
                    ref={(ref) => {
                      if (ref) markerRefs.current[e.id] = ref;
                    }}
                  >
                    <Popup>
                      <div style={{ minWidth: 200 }}>
                        <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
                          Impacto detectado
                        </div>
                        <div style={{ fontWeight: 600, marginTop: 2 }}>
                          {profile?.name || driverId}
                        </div>
                        <div className="font-mono text-xs" style={{ marginTop: 4 }}>
                          {e.gforce?.toFixed?.(2) || "—"}G
                          {e.severity_label || e.severity ? (
                            <span style={{ marginLeft: 6, opacity: 0.8 }}>
                              · {e.severity_label || e.severity}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-neutral-500" style={{ marginTop: 2 }}>
                          {fmt(e.ts)}
                        </div>
                        <div className="text-[10px] font-mono text-neutral-500" style={{ marginTop: 2 }}>
                          {e.lat.toFixed(5)}, {e.lng.toFixed(5)}
                        </div>
                        {e.ai_diagnosis?.severity_assessment ? (
                          <div style={{ marginTop: 6, fontSize: 11, color: "#d4d4d4" }}>
                            {e.ai_diagnosis.severity_assessment}
                          </div>
                        ) : null}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

              <MapFlyTo position={flyTarget} zoom={selectedEvent ? 16 : 13} />
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-500 text-xs uppercase tracking-[0.3em]">
              Sin telemetría ni impactos almacenados todavía
            </div>
          )}

          {selectedEvent ? (
            <div className="absolute top-3 left-3 z-[400] rounded-lg border border-red-500/40 bg-black/70 backdrop-blur px-3 py-2 text-xs flex items-center gap-2 max-w-[80%]">
              <Crosshair className="h-3.5 w-3.5 text-red-400" />
              <div className="font-mono">
                <span className="text-red-300">Impacto seleccionado:</span>{" "}
                <span className="text-white">{fmt(selectedEvent.ts)}</span>
                {selectedEvent.gforce ? (
                  <span className="text-neutral-300"> · {selectedEvent.gforce.toFixed(2)}G</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] uppercase tracking-[0.3em] text-neutral-400">
              Historial de impactos · {events.length}
            </h3>
            {selectedEventId ? (
              <button
                onClick={() => setSelectedEventId(null)}
                className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 hover:text-white transition"
              >
                Limpiar
              </button>
            ) : null}
          </div>

          <div
            className="flex-1 overflow-y-auto space-y-3 pr-1"
            data-testid="events-list"
          >
            {events.length === 0 ? (
              <div className="text-xs text-neutral-500">
                Sin impactos registrados desde la app móvil.
              </div>
            ) : (
              events.map((e) => {
                const isSelected = e.id === selectedEventId;
                const tone = severityTone(e.severity);
                const hasGps = e.lat != null && e.lng != null;
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={e.id}
                    ref={(el) => {
                      if (el) cardRefs.current[e.id] = el;
                    }}
                    onClick={() => handleSelectEvent(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        handleSelectEvent(e);
                      }
                    }}
                    data-testid={`event-card-${e.id}`}
                    className={`w-full text-left rounded-lg border p-3 transition-all cursor-pointer ${tone} ${
                      isSelected
                        ? "ring-2 ring-red-400/60 shadow-[0_0_20px_rgba(239,68,68,0.25)] scale-[1.01]"
                        : "hover:border-white/30 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5" />
                        <span className="text-[10px] uppercase tracking-[0.2em]">
                          Impacto
                        </span>
                        {e.severity_label || e.severity ? (
                          <span className="text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border border-white/20">
                            {e.severity_label || e.severity}
                          </span>
                        ) : null}
                      </div>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {fmt(e.ts)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-200">
                      <UserIcon className="h-3 w-3 text-neutral-400" />
                      <span className="font-medium">{profile?.name || driverId}</span>
                    </div>

                    <div className="font-mono text-xs mt-1.5 flex items-center gap-3 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        {Math.round(e.speed || 0)}km/h
                      </span>
                      {e.gforce != null ? (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {e.gforce.toFixed(2)}G
                        </span>
                      ) : null}
                      {e.alerts_sent ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <BellRing className="h-3 w-3" />
                          Contactos alertados
                        </span>
                      ) : null}
                    </div>

                    {hasGps ? (
                      <div className="text-[10px] font-mono text-neutral-400 mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {e.lat.toFixed(5)}, {e.lng.toFixed(5)}
                        <Clock className="h-3 w-3 ml-2" />
                        {new Date(e.ts).toLocaleString()}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-400/80 mt-1">
                        Este impacto no incluyó coordenadas GPS.
                      </div>
                    )}

                    {e.ai_diagnosis ? (
                      <div onClick={(ev) => ev.stopPropagation()}>
                        <AlertDiagnosis diagnosis={e.ai_diagnosis} />
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
