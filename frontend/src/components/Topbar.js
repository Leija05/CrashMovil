import { ShieldAlert, LogOut, Wifi, WifiOff, History } from "lucide-react";
import CrashStatsWidget from "./CrashStatsWidget";
import { useAuth } from "../auth/AuthContext";

const STATUS_LABEL = {
  connecting: "Conectando",
  open: "En vivo",
  closed: "Reconectando",
};

export default function Topbar({ status, alertCount, onOpenHistory }) {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.25)]">
          <ShieldAlert className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="leading-tight">
          <div className="text-[9px] uppercase tracking-[0.4em] text-neutral-500">
            Critical Response Alert System
          </div>
          <div className="font-bold tracking-tight">
            C.R.A.S.H. <span className="text-emerald-400">2.0</span> · Command
            Center
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-3">
        <CrashStatsWidget />

        <button
          data-testid="open-crash-history"
          onClick={onOpenHistory}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/10 text-[10px] uppercase tracking-[0.25em] text-neutral-300 hover:text-emerald-300 transition-all"
          title="Historial completo de choques"
        >
          <History className="h-3.5 w-3.5" />
          Historial de choques
        </button>

        <div
          data-testid="ws-status"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] uppercase tracking-[0.25em] ${
            status === "open"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}
        >
          {status === "open" ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {STATUS_LABEL[status] || status}
        </div>

        {alertCount > 0 ? (
          <div
            data-testid="alert-count"
            className="px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 text-[10px] uppercase tracking-[0.25em] alert-flashing"
          >
            {alertCount} alerta{alertCount > 1 ? "s" : ""} crítica
            {alertCount > 1 ? "s" : ""}
          </div>
        ) : null}

        {user ? (
          <div className="flex items-center gap-2 pl-3 border-l border-white/10">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-500">
                {user.role}
              </div>
            </div>
            <button
              data-testid="logout-btn"
              onClick={logout}
              className="ml-2 h-9 w-9 rounded-lg border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 flex items-center justify-center transition-all group"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4 text-neutral-400 group-hover:text-red-400" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
