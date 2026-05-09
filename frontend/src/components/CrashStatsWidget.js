import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  BarChart3,
  Loader2,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import { api, formatApiError } from "../lib/api";

const SEVERITY_SCORE = {
  critical: 4,
  critico: 4,
  crítico: 4,
  high: 3,
  alto: 3,
  medium: 2,
  medio: 2,
  low: 1,
  bajo: 1,
};

function severityScore(impact) {
  const raw = (impact?.severity || impact?.severity_label || "")
    .toString()
    .toLowerCase();
  return SEVERITY_SCORE[raw] || 0;
}

function severityLabel(score) {
  if (!score) return "Sin datos";
  if (score >= 3.5) return "Crítica";
  if (score >= 2.5) return "Alta";
  if (score >= 1.5) return "Media";
  return "Baja";
}

export default function CrashStatsWidget() {
  const [open, setOpen] = useState(false);
  const [impacts, setImpacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchImpacts = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/impacts?days=30&status=all&limit=1000");
      setImpacts(data.impacts || []);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchImpacts();
    const intervalId = window.setInterval(() => {
      fetchImpacts({ silent: true });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const stats = useMemo(() => {
    const total = impacts.length;
    const scoreValues = impacts.map(severityScore).filter(Boolean);
    const avgSeverity = scoreValues.length
      ? scoreValues.reduce((sum, n) => sum + n, 0) / scoreValues.length
      : 0;
    const perDay = total / 30;
    const pending = impacts.filter((i) => i.status === "pending").length;
    const withGps = impacts.filter(
      (i) => i.lat != null && i.lng != null,
    ).length;
    return { total, avgSeverity, perDay, pending, withGps };
  }, [impacts]);

  return (
    <>
      <button
        data-testid="open-crash-stats"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 hover:border-cyan-500/40 hover:bg-cyan-500/10 text-[10px] uppercase tracking-[0.25em] text-neutral-300 hover:text-cyan-300 transition-all"
        title="Estadísticas de choques de los últimos 30 días"
        aria-expanded={open}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Estadísticas
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[2200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3"
              data-testid="crash-stats-modal"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-3xl bg-[#0A0A0A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
                      C.R.A.S.H. · Estadísticas
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">Resumen de choques</h2>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="h-9 w-9 rounded-lg border border-white/10 hover:border-red-500/40 hover:bg-red-500/10 flex items-center justify-center transition-all"
                    title="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-5">
                  {loading ? (
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-neutral-400">
                      <Loader2 className="h-4 w-4 animate-spin" /> Calculando estadísticas...
                    </div>
                  ) : error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                      {error}
                    </div>
                  ) : (
                    <>
                      <div className="mb-4 text-[10px] uppercase tracking-[0.25em] text-cyan-300/70">
                        Se actualiza automáticamente cada 10 segundos
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-200/80">
                            <TrendingUp className="h-3 w-3" /> Choques/día
                          </div>
                          <div className="mt-2 font-mono text-3xl font-bold text-cyan-200">
                            {stats.perDay.toFixed(2)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-200/80">
                            <TriangleAlert className="h-3 w-3" /> Severidad media
                          </div>
                          <div className="mt-2 font-mono text-3xl font-bold text-amber-200">
                            {stats.avgSeverity ? stats.avgSeverity.toFixed(1) : "—"}
                          </div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-amber-100/60">
                            {severityLabel(stats.avgSeverity)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                          <div className="font-mono text-sm text-white">{stats.total}</div>
                          Total
                        </div>
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                          <div className="font-mono text-sm text-red-300">{stats.pending}</div>
                          Pend.
                        </div>
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
                          <div className="font-mono text-sm text-emerald-300">{stats.withGps}</div>
                          GPS
                        </div>
                      </div>
                      <div className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-neutral-500">
                        <Activity className="mt-0.5 h-3 w-3 flex-shrink-0" />
                        La severidad se promedia en escala 1-4: baja, media, alta y crítica.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
