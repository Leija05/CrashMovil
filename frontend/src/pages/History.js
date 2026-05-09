import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, MapPin, Activity, Gauge, Clock } from "lucide-react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from "react-leaflet";
import { api, formatApiError } from "../lib/api";

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function History() {
  const { driverId } = useParams();
  const [profile, setProfile] = useState(null);
  const [points, setPoints] = useState([]);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");

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
        setEvents(e.data.events || []);
      } catch (err) { setError(formatApiError(err)); }
    })();
    return () => { mounted = false; };
  }, [driverId]);

  const path = points.map((p) => [p.lat, p.lng]);
  const center = path[Math.floor(path.length / 2)] || [profile?.lat || 19.4326, profile?.lng || -99.1332];

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
            <h1 className="text-2xl font-bold tracking-tight">
              {profile?.name || driverId}
            </h1>
            <div className="font-mono text-xs text-neutral-400 mt-0.5">
              {profile?.id} · {profile?.vehicle} · {profile?.plate}
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
          className="lg:col-span-2 rounded-2xl border border-white/10 overflow-hidden min-h-[420px]"
        >
          {path.length > 0 ? (
            <MapContainer center={center} zoom={13} className="h-full w-full" style={{ background: "#0a0a0a", height: "100%" }}>
              <TileLayer
                attribution='&copy; carto.com'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <Polyline positions={path} pathOptions={{ color: "#10b981", weight: 3, opacity: 0.85 }} />
              {events.filter((e) => e.lat && e.lng).map((e) => (
                <CircleMarker
                  key={e.id}
                  center={[e.lat, e.lng]}
                  radius={8}
                  pathOptions={{
                    color: e.type === "impact" ? "#ef4444" : "#f59e0b",
                    fillColor: e.type === "impact" ? "#ef4444" : "#f59e0b",
                    fillOpacity: 0.7,
                  }}
                >
                  <Popup>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
                        {e.type}
                      </div>
                      <div className="font-mono text-xs">{e.gforce?.toFixed?.(2) || "—"}G</div>
                      <div className="text-[10px] text-neutral-500">{fmt(e.ts)}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-500 text-xs uppercase tracking-[0.3em]">
              Sin telemetría almacenada todavía
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-5 flex flex-col min-h-0">
          <h3 className="text-[11px] uppercase tracking-[0.3em] text-neutral-400 mb-3">
            Eventos · {events.length}
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1" data-testid="events-list">
            {events.length === 0 ? (
              <div className="text-xs text-neutral-500">Sin eventos registrados.</div>
            ) : (
              events.map((e) => {
                const tone = e.type === "impact"
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : e.type === "false_alarm"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-white/10 bg-white/5 text-neutral-300";
                return (
                  <div key={e.id} className={`rounded-lg border p-3 ${tone}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {e.type === "impact" ? <Activity className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                        <span className="text-[10px] uppercase tracking-[0.2em]">{e.type}</span>
                      </div>
                      <span className="font-mono text-[10px] text-neutral-400">{fmt(e.ts)}</span>
                    </div>
                    {e.gforce ? (
                      <div className="font-mono text-xs mt-1.5 flex items-center gap-3">
                        <span><Gauge className="inline h-3 w-3 mr-1" />{Math.round(e.speed || 0)}km/h</span>
                        <span>{e.gforce.toFixed(2)}G</span>
                      </div>
                    ) : null}
                    {e.lat && e.lng ? (
                      <div className="text-[10px] font-mono text-neutral-500 mt-1">
                        <MapPin className="inline h-3 w-3 mr-0.5" /> {e.lat.toFixed(4)}, {e.lng.toFixed(4)}
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
