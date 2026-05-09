import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Search,
  Calendar,
  Filter as FilterIcon,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MapPin,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import { api, formatApiError } from "../lib/api";
import AlertDiagnosis from "./AlertDiagnosis";

const SEVERITY_OPTIONS = [
  { v: "", l: "Todas" },
  { v: "critical", l: "Crítica" },
  { v: "high", l: "Alta" },
  { v: "medium", l: "Media" },
  { v: "low", l: "Baja" },
];

const STATUS_OPTIONS = [
  { v: "all", l: "Todos" },
  { v: "pending", l: "Pendientes" },
  { v: "acknowledged", l: "Atendidos" },
  { v: "false_alarm", l: "Falsa alarma" },
];

const STATUS_COLOR = {
  pending: "#ef4444",
  acknowledged: "#10b981",
  false_alarm: "#a3a3a3",
};

const STATUS_BADGE = {
  pending: "border-red-500/40 bg-red-500/15 text-red-300",
  acknowledged: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  false_alarm: "border-neutral-500/40 bg-neutral-500/15 text-neutral-300",
};

const STATUS_LABEL = {
  pending: "Pendiente",
  acknowledged: "Atendido",
  false_alarm: "Falsa alarma",
};

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function MapFlyTo({ position, zoom = 15 }) {
  const map = useMap();
  useEffect(() => {
    if (position && Array.isArray(position) && position.length === 2) {
      map.flyTo(position, zoom, { duration: 0.8 });
    }
  }, [position, zoom, map]);
  return null;
}

export default function CrashHistoryModal({ open, onClose }) {
  const [impacts, setImpacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // filters
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("all");
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400 * 1000);
  const [dateFrom, setDateFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10));

  const [selectedId, setSelectedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const cardRefs = useRef({});
  const markerRefs = useRef({});

  const fetchImpacts = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (severity) params.set("severity", severity);
      if (status) params.set("status", status);
      if (dateFrom) params.set("date_from", `${dateFrom}T00:00:00+00:00`);
      if (dateTo) params.set("date_to", `${dateTo}T23:59:59+00:00`);
      params.set("limit", "500");
      const { data } = await api.get(`/impacts?${params.toString()}`);
      setImpacts(data.impacts || []);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchImpacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const withGps = useMemo(
    () => impacts.filter((i) => i.lat != null && i.lng != null),
    [impacts],
  );

  const center = useMemo(() => {
    if (withGps.length === 0) return [19.4326, -99.1332];
    const sum = withGps.reduce(
      (acc, i) => ({ lat: acc.lat + i.lat, lng: acc.lng + i.lng }),
      { lat: 0, lng: 0 },
    );
    return [sum.lat / withGps.length, sum.lng / withGps.length];
  }, [withGps]);

  const selected = useMemo(
    () => impacts.find((i) => i.id === selectedId) || null,
    [impacts, selectedId],
  );

  const flyTarget = selected && selected.lat && selected.lng
    ? [selected.lat, selected.lng]
    : null;

  const handleSelect = (imp, opts = {}) => {
    if (!imp) return;
    setSelectedId(imp.id);
    setExpandedId(imp.id);
    if (!opts.fromCard) {
      const card = cardRefs.current[imp.id];
      if (card?.scrollIntoView) {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    if (!opts.fromMarker) {
      setTimeout(() => {
        const m = markerRefs.current[imp.id];
        if (m?.openPopup) m.openPopup();
      }, 350);
    }
  };

  const resetFilters = () => {
    setQ("");
    setSeverity("");
    setStatus("all");
    const t = new Date();
    setDateFrom(new Date(t.getTime() - 30 * 86400 * 1000).toISOString().slice(0, 10));
    setDateTo(t.toISOString().slice(0, 10));
  };

  const counts = useMemo(() => {
    const c = { total: impacts.length, pending: 0, acknowledged: 0, false_alarm: 0 };
    impacts.forEach((i) => {
      c[i.status] = (c[i.status] || 0) + 1;
    });
    return c;
  }, [impacts]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 lg:p-6"
      data-testid="crash-history-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full h-full max-w-[1700px] bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
              C.R.A.S.H. · Registro
            </div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Historial de Choques
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-[0.2em]">
              <span className="px-2 py-1 rounded border border-white/10 bg-white/5 font-mono">
                {counts.total} total
              </span>
              <span className="px-2 py-1 rounded border border-red-500/30 bg-red-500/10 text-red-300 font-mono">
                {counts.pending} pendientes
              </span>
              <span className="px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-mono">
                {counts.acknowledged} atendidos
              </span>
              <span className="px-2 py-1 rounded border border-neutral-500/30 bg-neutral-500/10 text-neutral-300 font-mono">
                {counts.false_alarm} falsa
              </span>
            </div>
            <button
              data-testid="crash-modal-close"
              onClick={onClose}
              className="h-9 w-9 rounded-lg border border-white/10 hover:border-red-500/40 hover:bg-red-500/10 flex items-center justify-center transition-all"
              title="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1 block">
              <Search className="inline h-3 w-3 mr-1" />
              Nombre o correo
            </label>
            <input
              data-testid="filter-name"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") fetchImpacts(); }}
              placeholder="Buscar conductor..."
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/40 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1 block">
              <Calendar className="inline h-3 w-3 mr-1" />
              Desde
            </label>
            <input
              data-testid="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/40 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1 block">
              <Calendar className="inline h-3 w-3 mr-1" />
              Hasta
            </label>
            <input
              data-testid="filter-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/40 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1 block">
              <FilterIcon className="inline h-3 w-3 mr-1" />
              Gravedad
            </label>
            <select
              data-testid="filter-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/40 outline-none"
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1 block">
              Estado
            </label>
            <select
              data-testid="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:border-emerald-500/40 outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              data-testid="filter-apply"
              onClick={fetchImpacts}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium px-4 py-1.5 rounded-lg transition-all"
            >
              Aplicar
            </button>
            <button
              data-testid="filter-reset"
              onClick={() => { resetFilters(); setTimeout(fetchImpacts, 50); }}
              className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 text-neutral-300 text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
              title="Limpiar filtros"
            >
              <RotateCcw className="h-3 w-3" />
              Limpiar
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 min-h-0">
          {/* Map */}
          <div className="lg:col-span-3 border-r border-white/10 relative min-h-[300px]">
            {withGps.length > 0 ? (
              <MapContainer
                center={selected ? [selected.lat, selected.lng] : center}
                zoom={selected ? 15 : 12}
                className="h-full w-full"
                style={{ background: "#0a0a0a", height: "100%" }}
              >
                <TileLayer
                  attribution='&copy; carto.com'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {/* Halo on selected */}
                {selected && selected.lat && selected.lng ? (
                  <CircleMarker
                    key={`halo-${selected.id}`}
                    center={[selected.lat, selected.lng]}
                    radius={22}
                    pathOptions={{
                      color: STATUS_COLOR[selected.status] || "#ef4444",
                      fillColor: STATUS_COLOR[selected.status] || "#ef4444",
                      fillOpacity: 0.15,
                      weight: 1,
                      opacity: 0.6,
                    }}
                    interactive={false}
                  />
                ) : null}

                {withGps.map((i) => {
                  const isSel = i.id === selectedId;
                  const color = STATUS_COLOR[i.status] || "#a3a3a3";
                  return (
                    <CircleMarker
                      key={i.id}
                      center={[i.lat, i.lng]}
                      radius={isSel ? 12 : 7}
                      pathOptions={{
                        color: isSel ? "#ffffff" : color,
                        weight: isSel ? 3 : 1.5,
                        fillColor: color,
                        fillOpacity: isSel ? 0.95 : 0.75,
                      }}
                      eventHandlers={{
                        click: () => handleSelect(i, { fromMarker: true }),
                      }}
                      ref={(ref) => {
                        if (ref) markerRefs.current[i.id] = ref;
                      }}
                    >
                      <Popup>
                        <div style={{ minWidth: 200 }}>
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.2em", color: "#a3a3a3" }}>
                            {STATUS_LABEL[i.status]}
                          </div>
                          <div style={{ fontWeight: 600, marginTop: 2 }}>{i.driver_name}</div>
                          {i.driver_email ? (
                            <div style={{ fontSize: 11, color: "#737373" }}>{i.driver_email}</div>
                          ) : null}
                          <div style={{ fontFamily: "monospace", fontSize: 12, marginTop: 4 }}>
                            {i.gforce?.toFixed?.(2) || "—"}G
                            {i.severity_label ? <span style={{ marginLeft: 6, opacity: 0.8 }}> · {i.severity_label}</span> : null}
                          </div>
                          <div style={{ fontSize: 10, color: "#737373", marginTop: 2 }}>
                            {fmt(i.created_at)}
                          </div>
                          {i.ack_by_name ? (
                            <div style={{ fontSize: 10, color: "#10b981", marginTop: 2 }}>
                              Atendido por {i.ack_by_name} ({i.ack_by})
                            </div>
                          ) : null}
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
                <MapFlyTo position={flyTarget} zoom={15} />
              </MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-neutral-500 text-xs uppercase tracking-[0.3em]">
                {loading ? "Cargando..." : "Sin choques con GPS para los filtros actuales"}
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-3 left-3 z-[400] rounded-lg border border-white/10 bg-black/70 backdrop-blur px-3 py-2 text-[10px] flex gap-3 items-center">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" />
                Pendiente
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />
                Atendido
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-neutral-400 inline-block" />
                Falsa alarma
              </span>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-2 flex flex-col min-h-0">
            <div className="px-4 py-2 border-b border-white/10 text-[10px] uppercase tracking-[0.3em] text-neutral-500">
              Resultados · {impacts.length}
            </div>
            <div
              className="flex-1 overflow-y-auto p-3 space-y-2"
              data-testid="impacts-list"
            >
              {loading ? (
                <div className="text-xs text-neutral-500 px-2">Cargando...</div>
              ) : error ? (
                <div className="text-xs text-red-400 px-2">{error}</div>
              ) : impacts.length === 0 ? (
                <div className="text-xs text-neutral-500 px-2">Sin choques para los filtros aplicados.</div>
              ) : (
                impacts.map((i) => {
                  const isSel = i.id === selectedId;
                  const isExp = i.id === expandedId;
                  const StatusIcon =
                    i.status === "acknowledged" ? CheckCircle2
                    : i.status === "false_alarm" ? XCircle
                    : AlertTriangle;
                  return (
                    <div
                      key={i.id}
                      data-testid={`impact-row-${i.id}`}
                      ref={(el) => { if (el) cardRefs.current[i.id] = el; }}
                      className={`rounded-lg border transition-all cursor-pointer ${
                        isSel
                          ? "border-emerald-500/40 bg-emerald-500/[0.06] ring-1 ring-emerald-400/30"
                          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                      }`}
                    >
                      <div
                        onClick={() => handleSelect(i, { fromCard: true })}
                        className="p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <StatusIcon
                              className={`h-3.5 w-3.5 flex-shrink-0 ${
                                i.status === "acknowledged" ? "text-emerald-400"
                                : i.status === "false_alarm" ? "text-neutral-400"
                                : "text-red-400"
                              }`}
                            />
                            <span className={`text-[9px] font-semibold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border ${STATUS_BADGE[i.status]}`}>
                              {STATUS_LABEL[i.status]}
                            </span>
                            {i.severity_label || i.severity ? (
                              <span className="text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border border-white/15 text-neutral-300">
                                {i.severity_label || i.severity}
                              </span>
                            ) : null}
                          </div>
                          <span className="font-mono text-[10px] text-neutral-500 whitespace-nowrap">
                            {fmt(i.created_at)}
                          </span>
                        </div>

                        <div className="mt-1.5 font-semibold text-sm truncate">
                          {i.driver_name}
                        </div>
                        {i.driver_email ? (
                          <div className="text-[10px] text-neutral-500 font-mono truncate">{i.driver_email}</div>
                        ) : null}

                        <div className="mt-1.5 flex items-center gap-3 font-mono text-[11px] flex-wrap">
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <AlertTriangle className="h-3 w-3" />
                            {i.gforce?.toFixed?.(2) || "—"}G
                          </span>
                          {i.lat != null ? (
                            <span className="inline-flex items-center gap-1 text-neutral-400">
                              <MapPin className="h-3 w-3" />
                              {i.lat.toFixed(4)}, {i.lng.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-amber-400/70 text-[10px]">sin GPS</span>
                          )}
                        </div>

                        {i.status !== "pending" && i.ack_by_name ? (
                          <div className="mt-2 text-[10px] flex items-center gap-1.5 text-emerald-300/80">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>
                              Atendido por <span className="font-semibold">{i.ack_by_name}</span>
                              {i.ack_by ? <span className="text-neutral-500 font-mono"> · {i.ack_by}</span> : null}
                            </span>
                          </div>
                        ) : null}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(isExp ? null : i.id);
                          }}
                          className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-neutral-400 hover:text-white transition-colors"
                        >
                          {isExp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {isExp ? "Ocultar detalle" : "Ver detalle"}
                        </button>
                      </div>

                      {isExp ? (
                        <div className="border-t border-white/10 px-3 pb-3 pt-2 text-xs space-y-2">
                          {i.ai_diagnosis ? (
                            <AlertDiagnosis diagnosis={i.ai_diagnosis} />
                          ) : (
                            <div className="text-neutral-500 text-[11px]">
                              Sin diagnóstico IA registrado para este choque.
                            </div>
                          )}
                          {i.alerts_sent ? (
                            <div className="text-[10px] text-emerald-300/80">
                              ✓ Contactos de emergencia notificados
                            </div>
                          ) : null}
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
    </div>
  );
}
