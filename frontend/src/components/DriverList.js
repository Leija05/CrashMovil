import { useMemo } from "react";
import { Bike, Bluetooth, BluetoothOff, History } from "lucide-react";
import { Link } from "react-router-dom";

const STATUS_TONE = {
  active:   { dot: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]", text: "text-emerald-400", label: "Activo" },
  critical: { dot: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]",   text: "text-red-400",     label: "Accidente" },
  warning:  { dot: "bg-amber-500",                                        text: "text-amber-400",   label: "Advertencia" },
  offline:  { dot: "bg-neutral-600",                                      text: "text-neutral-500", label: "Offline" },
};

export default function DriverList({ drivers, selectedId, onSelect }) {
  const list = useMemo(() => {
    return Object.values(drivers || {}).sort((a, b) => {
      const order = { critical: 0, warning: 1, active: 2, offline: 3 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });
  }, [drivers]);

  return (
    <div className="flex flex-col h-full" data-testid="driver-list">
      <div className="flex items-center justify-between px-1 mb-3">
        <h3 className="text-[11px] uppercase tracking-[0.3em] text-neutral-400">
          Flota · {list.length}
        </h3>
        <div className="text-[10px] font-mono text-emerald-400">
          {list.filter((d) => d.status === "active").length} activos
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-2">
        {list.map((d) => {
          const tone = STATUS_TONE[d.status] || STATUS_TONE.offline;
          const sel = selectedId === d.id;
          return (
            <button
              key={d.id}
              data-testid={`driver-list-item-${d.id}`}
              onClick={() => onSelect?.(d.id)}
              className={`w-full text-left rounded-xl border transition-all p-3 group ${
                sel
                  ? "bg-white/10 border-emerald-500/50 shadow-[0_0_25px_rgba(16,185,129,0.15)]"
                  : "bg-white/[0.04] border-white/10 hover:bg-white/[0.07] hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                  <Bike className="h-4 w-4 text-neutral-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                    <div className="text-sm font-medium truncate">{d.name}</div>
                  </div>
                  <div className="font-mono text-[10px] text-neutral-500 mt-0.5 truncate">
                    {d.id} · {d.plate}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-[10px] uppercase tracking-[0.2em] ${tone.text}`}>
                    {tone.label}
                  </div>
                  <div className="font-mono text-xs text-white mt-0.5">
                    {Math.round(d.speed)}<span className="text-[10px] text-neutral-500"> km/h</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-[11px]">
                  {d.helmet_connected ? (
                    <Bluetooth className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <BluetoothOff className="h-3 w-3 text-red-400" />
                  )}
                  <span className="text-neutral-400">
                    {d.helmet_connected ? "Casco BT" : "Sin casco"}
                  </span>
                </div>
                <Link
                  to={`/history/${d.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-neutral-500 hover:text-white transition-colors"
                  data-testid={`driver-history-${d.id}`}
                >
                  <History className="h-3 w-3" /> Historial
                </Link>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
