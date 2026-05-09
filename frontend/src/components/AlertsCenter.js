import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BellOff, Check, Volume2, VolumeX, UserSquare } from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { playCriticalAlert, playAck } from "../lib/sound";
import AlertDiagnosis from "./AlertDiagnosis";

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s`;
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return new Date(iso).toLocaleString();
}

const STATUS_BADGE = {
  pending: "bg-red-500/20 border-red-500/40 text-red-400",
  acknowledged: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
  false_alarm: "bg-neutral-500/15 border-neutral-500/30 text-neutral-400",
};

const STATUS_LABEL = {
  pending: "Pendiente",
  acknowledged: "Atendido",
  false_alarm: "Falsa Alarma",
};

export default function AlertsCenter({ alerts, setAlerts, lastImpactId, onSelectDriver, onOpenDriverDetail }) {
  const [tab, setTab] = useState("active"); // active | history
  const [muted, setMuted] = useState(false);
  const lastPlayedRef = useRef(null);

  // Play sound when a new pending impact arrives (deduped via lastImpactId)
  useEffect(() => {
    if (!lastImpactId || muted) return;
    if (lastPlayedRef.current === lastImpactId) return;
    lastPlayedRef.current = lastImpactId;
    playCriticalAlert();
  }, [lastImpactId, muted]);

  const { active, history } = useMemo(() => {
    const a = (alerts || []).filter((x) => x.status === "pending");
    const h = (alerts || []).filter((x) => x.status !== "pending").slice(0, 25);
    return { active: a, history: h };
  }, [alerts]);

  const acknowledge = async (id) => {
    try {
      const { data } = await api.post(`/alerts/${id}/acknowledge`);
      setAlerts((prev) => prev.map((a) => (a.id === id ? data.alert : a)));
      playAck();
    } catch (e) { console.error(formatApiError(e)); }
  };

  const falseAlarm = async (id) => {
    try {
      const { data } = await api.post(`/alerts/${id}/false-alarm`);
      setAlerts((prev) => prev.map((a) => (a.id === id ? data.alert : a)));
    } catch (e) { console.error(formatApiError(e)); }
  };

  return (
    <div
      className={`flex flex-col h-full bg-white/5 backdrop-blur-2xl border rounded-2xl overflow-hidden ${
        active.length > 0 ? "border-red-500/30 alert-flashing" : "border-white/10"
      }`}
      data-testid="alerts-center"
    >
      <div className="flex items-center justify-between p-5 pb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
            Centro de Alertas
          </div>
          <div className="flex items-center gap-2 mt-1">
            <AlertTriangle className={`h-4 w-4 ${active.length > 0 ? "text-red-400" : "text-neutral-400"}`} />
            <h3 className="text-lg font-bold">
              {active.length > 0 ? `${active.length} crítica${active.length > 1 ? "s" : ""}` : "Sin alertas activas"}
            </h3>
          </div>
        </div>
        <button
          onClick={() => setMuted((m) => !m)}
          data-testid="alerts-mute-toggle"
          className="h-9 w-9 rounded-lg border border-white/10 hover:border-white/30 flex items-center justify-center transition-colors"
          title={muted ? "Activar audio" : "Silenciar audio"}
        >
          {muted ? <VolumeX className="h-4 w-4 text-neutral-400" /> : <Volume2 className="h-4 w-4 text-emerald-400" />}
        </button>
      </div>

      <div className="px-5 flex gap-1 border-b border-white/10">
        {[
          { k: "active", l: `Activas · ${active.length}` },
          { k: "history", l: `Historial · ${history.length}` },
        ].map((t) => (
          <button
            key={t.k}
            data-testid={`alerts-tab-${t.k}`}
            onClick={() => setTab(t.k)}
            className={`relative px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
              tab === t.k ? "text-white" : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {t.l}
            {tab === t.k ? (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-emerald-400" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(tab === "active" ? active : history).length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-neutral-500">
            <BellOff className="h-8 w-8 mb-3" />
            <span className="text-xs uppercase tracking-[0.3em]">
              {tab === "active" ? "Todo en orden" : "Sin registros"}
            </span>
          </div>
        ) : (
          (tab === "active" ? active : history).map((a) => {
            const isCrit = a.status === "pending";
            return (
              <div
                key={a.id}
                data-testid={`alert-${a.id}`}
                className={`rounded-xl border p-4 transition-all ${
                  isCrit
                    ? "bg-red-500/[0.08] border-red-500/40"
                    : "bg-white/[0.03] border-white/10"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[9px] font-semibold uppercase tracking-[0.2em] px-2 py-0.5 rounded border ${STATUS_BADGE[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                        {a.type === "impact" ? "Impacto detectado" : a.type}
                      </span>
                    </div>
                    <button
                      onClick={() => onSelectDriver?.(a.driver_id)}
                      className="text-base font-semibold mt-1.5 hover:text-emerald-400 transition-colors text-left"
                    >
                      {a.driver_name || a.driver_id}
                    </button>
                    <div className="font-mono text-[11px] text-neutral-400 mt-1">
                      {a.gforce?.toFixed(2)}G · {Math.round(a.speed || 0)} km/h ·{" "}
                      <span className="text-neutral-500">
                        {a.lat?.toFixed(4)}, {a.lng?.toFixed(4)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-[10px] font-mono text-neutral-500 whitespace-nowrap">
                    hace {timeAgo(a.created_at)}
                  </div>
                </div>

                {isCrit ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      data-testid={`alert-ack-${a.id}`}
                      onClick={() => acknowledge(a.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 rounded-lg px-3 py-2 transition-all"
                    >
                      <Check className="h-3.5 w-3.5" /> Atender
                    </button>
                    <button
                      data-testid={`alert-false-${a.id}`}
                      onClick={() => falseAlarm(a.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 text-neutral-300 rounded-lg px-3 py-2 transition-all"
                    >
                      Falsa alarma
                    </button>
                  </div>
                ) : (
                  <div className="text-[10px] text-neutral-500 mt-2 font-mono">
                    {a.ack_by ? `por ${a.ack_by}` : ""} {a.ack_at ? `· ${new Date(a.ack_at).toLocaleTimeString()}` : ""}
                  </div>
                )}

                <AlertDiagnosis diagnosis={a.ai_diagnosis} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
