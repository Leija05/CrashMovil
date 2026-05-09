import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Loader2,
  TrendingUp,
  TriangleAlert,
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
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!open || loadedRef.current) return;
    let mounted = true;
    setLoading(true);
    setError("");
    api
      .get("/impacts?days=30&status=all&limit=1000")
      .then(({ data }) => {
        if (!mounted) return;
        setImpacts(data.impacts || []);
        loadedRef.current = true;
      })
      .catch((err) => {
        if (mounted) setError(formatApiError(err));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
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
    <div className="relative">
      <button
        data-testid="open-crash-stats"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 hover:border-cyan-500/40 hover:bg-cyan-500/10 text-[10px] uppercase tracking-[0.25em] text-neutral-300 hover:text-cyan-300 transition-all"
        title="Estadísticas de choques de los últimos 30 días"
        aria-expanded={open}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Estadísticas
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[1300] w-80 rounded-2xl border border-white/10 bg-[#101012]/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
                Últimos 30 días
              </div>
              <div className="text-sm font-semibold text-white">
                Resumen de choques
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 hover:text-white"
            >
              Cerrar
            </button>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando
              estadísticas...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-200/80">
                    <TrendingUp className="h-3 w-3" /> Choques/día
                  </div>
                  <div className="mt-2 font-mono text-2xl font-bold text-cyan-200">
                    {stats.perDay.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-200/80">
                    <TriangleAlert className="h-3 w-3" /> Severidad media
                  </div>
                  <div className="mt-2 font-mono text-2xl font-bold text-amber-200">
                    {stats.avgSeverity ? stats.avgSeverity.toFixed(1) : "—"}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-amber-100/60">
                    {severityLabel(stats.avgSeverity)}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="font-mono text-sm text-white">
                    {stats.total}
                  </div>
                  Total
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                  <div className="font-mono text-sm text-red-300">
                    {stats.pending}
                  </div>
                  Pend.
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
                  <div className="font-mono text-sm text-emerald-300">
                    {stats.withGps}
                  </div>
                  GPS
                </div>
              </div>
              <div className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-neutral-500">
                <Activity className="mt-0.5 h-3 w-3 flex-shrink-0" />
                La severidad se promedia en escala 1-4: baja, media, alta y
                crítica.
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
