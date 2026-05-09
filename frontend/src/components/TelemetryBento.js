import { Bluetooth, BluetoothOff, Gauge, MapPin, Activity, Battery } from "lucide-react";

function Card({ label, children, tone = "default", testid }) {
  const toneClass = {
    default:  "border-white/10",
    critical: "border-red-500/40 shadow-[0_0_25px_rgba(239,68,68,0.15)]",
    active:   "border-emerald-500/30",
  }[tone] || "border-white/10";

  return (
    <div
      data-testid={testid}
      className={`relative bg-white/5 backdrop-blur-2xl border ${toneClass} rounded-2xl p-5 overflow-hidden`}
    >
      <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export default function TelemetryBento({ driver }) {
  if (!driver) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="telemetry-bento-empty">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl p-5 h-[140px] flex items-center justify-center">
            <span className="text-[10px] uppercase tracking-[0.3em] text-neutral-600">
              Selecciona un conductor
            </span>
          </div>
        ))}
      </div>
    );
  }

  const isCrit = driver.status === "critical";
  const gforceTone = driver.gforce >= 4 ? "critical" : driver.gforce >= 2.5 ? "warning" : "active";
  const speedColor = driver.speed > 80 ? "text-amber-400" : "text-white";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="telemetry-bento">
      <Card
        label="Casco · Bluetooth"
        tone={driver.helmet_connected ? "active" : "critical"}
        testid="telemetry-helmet"
      >
        <div className="flex items-center gap-3">
          {driver.helmet_connected ? (
            <Bluetooth className="h-7 w-7 text-emerald-400" />
          ) : (
            <BluetoothOff className="h-7 w-7 text-red-400" />
          )}
          <div>
            <div className="font-mono text-2xl font-bold text-white">
              {driver.helmet_connected ? "ONLINE" : "OFFLINE"}
            </div>
            <div className="text-xs text-neutral-400 mt-0.5">
              {driver.helmet_connected ? "Conectado al headset" : "Desconectado"}
            </div>
          </div>
        </div>
      </Card>

      <Card label="Velocidad" testid="telemetry-speed" tone={driver.speed > 80 ? "warning" : "default"}>
        <div className="flex items-end gap-2">
          <Gauge className="h-7 w-7 text-emerald-400 mb-1" />
          <div>
            <div className={`font-mono text-4xl font-bold tracking-tighter ${speedColor}`}>
              {Math.round(driver.speed)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">km/h</div>
          </div>
        </div>
      </Card>

      <Card label="G-Force" testid="telemetry-gforce" tone={gforceTone === "critical" ? "critical" : "default"}>
        <div className="flex items-end gap-2">
          <Activity className={`h-7 w-7 mb-1 ${
            gforceTone === "critical" ? "text-red-400" : gforceTone === "warning" ? "text-amber-400" : "text-emerald-400"
          }`} />
          <div>
            <div className={`font-mono text-4xl font-bold tracking-tighter ${
              gforceTone === "critical" ? "text-red-400" : "text-white"
            }`}>
              {driver.gforce.toFixed(2)}<span className="text-base text-neutral-500 ml-1">G</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
              {isCrit ? "IMPACTO DETECTADO" : driver.gforce >= 2.5 ? "Esfuerzo" : "Estable"}
            </div>
          </div>
        </div>
      </Card>

      <Card label="GPS · Batería" testid="telemetry-gps">
        <div className="flex items-start gap-2">
          <MapPin className="h-6 w-6 text-emerald-400 mt-1" />
          <div className="flex-1">
            <div className="font-mono text-sm text-white leading-tight">
              {driver.lat.toFixed(5)}<span className="text-neutral-500">°</span>
            </div>
            <div className="font-mono text-sm text-white leading-tight">
              {driver.lng.toFixed(5)}<span className="text-neutral-500">°</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <Battery className="h-3 w-3 text-neutral-400" />
              <div className="text-[11px] font-mono text-neutral-300">{driver.battery}%</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
