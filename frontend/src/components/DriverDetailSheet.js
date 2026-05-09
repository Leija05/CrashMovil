import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../components/ui/sheet";
import {
  User,
  Heart,
  AlertTriangle,
  Pill,
  Accessibility,
  Phone,
  MessageCircle,
  Mail,
  Bike,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { api } from "../lib/api";

function Section({ icon: Icon, label, children, tone = "default" }) {
  const toneClass = {
    default: "border-white/10 bg-white/[0.03]",
    danger: "border-red-500/30 bg-red-500/5",
  }[tone];
  return (
    <div className={`rounded-xl border ${toneClass} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5 text-neutral-400" />
        <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
          {label}
        </div>
      </div>
      {children}
    </div>
  );
}

function ChipList({ items }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-neutral-500 italic">Ninguno</div>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <span
          key={i}
          className="text-[11px] font-mono bg-white/5 border border-white/10 rounded-full px-2.5 py-0.5 text-neutral-200"
        >
          {it}
        </span>
      ))}
    </div>
  );
}

const STATUS_TONE = {
  active:   { text: "text-emerald-400", label: "Activo" },
  critical: { text: "text-red-400",     label: "Accidente" },
  warning:  { text: "text-amber-400",   label: "Advertencia" },
  offline:  { text: "text-neutral-500", label: "Offline" },
};

export default function DriverDetailSheet({ driverId, open, onOpenChange, driver }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !driverId) return;
    setLoading(true);
    setError("");
    setData(null);
    api
      .get(`/drivers/${driverId}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || "No se pudo cargar"))
      .finally(() => setLoading(false));
  }, [driverId, open]);

  const profile = data?.profile || {};
  const contacts = profile.emergency_contacts || [];
  const settings = profile.settings || {};
  const tone = STATUS_TONE[driver?.status] || STATUS_TONE.offline;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-[#0d0d0f] border-l border-white/10 text-white overflow-y-auto p-0"
        data-testid="driver-detail-sheet"
      >
        <div className="sticky top-0 z-10 bg-[#0d0d0f]/95 backdrop-blur-xl border-b border-white/10 px-6 py-5">
          <SheetHeader className="text-left space-y-2">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Bike className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-xl font-bold tracking-tight truncate">
                  {driver?.name || "Conductor"}
                </SheetTitle>
                <SheetDescription className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 mt-1">
                  {driver?.email || driverId}
                </SheetDescription>
              </div>
              <div className={`text-[10px] font-mono uppercase tracking-[0.2em] ${tone.text}`}>
                {tone.label}
              </div>
            </div>
            {driver ? (
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">Vel.</div>
                  <div className="font-mono text-sm">
                    {typeof driver.speed === "number" ? `${Math.round(driver.speed)} km/h` : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">G-Force</div>
                  <div className="font-mono text-sm">
                    {typeof driver.gforce === "number" ? `${driver.gforce.toFixed(2)}G` : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">Batería</div>
                  <div className="font-mono text-sm">
                    {driver.battery != null ? `${driver.battery}%` : "—"}
                  </div>
                </div>
              </div>
            ) : null}
          </SheetHeader>
        </div>

        <div className="px-6 py-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 text-neutral-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {error}
            </div>
          ) : (
            <>
              <Section icon={User} label="Perfil médico">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-500">Nombre</div>
                    <div className="text-white">{profile.full_name || driver?.name || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-500">Tipo de sangre</div>
                    <div className="font-mono text-emerald-400 font-bold text-base">
                      {profile.blood_type || "—"}
                    </div>
                  </div>
                </div>
              </Section>

              <Section icon={AlertTriangle} label="Alergias" tone={(profile.allergies || []).length ? "danger" : "default"}>
                <ChipList items={profile.allergies} />
              </Section>

              <Section icon={Heart} label="Condiciones médicas" tone={(profile.medical_conditions || []).length ? "danger" : "default"}>
                <ChipList items={profile.medical_conditions} />
              </Section>

              <Section icon={Accessibility} label="Discapacidades">
                <ChipList items={profile.disabilities} />
              </Section>

              {profile.emergency_notes ? (
                <Section icon={Pill} label="Notas de emergencia">
                  <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-line">
                    {profile.emergency_notes}
                  </p>
                </Section>
              ) : null}

              <Section icon={Phone} label={`Contactos de emergencia · ${contacts.length}`}>
                {contacts.length === 0 ? (
                  <div className="text-xs text-neutral-500 italic">Sin contactos registrados</div>
                ) : (
                  <div className="space-y-2">
                    {contacts.map((c) => (
                      <div
                        key={c.id || c.phone}
                        className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="font-mono text-xs text-neutral-400 truncate">{c.phone}</div>
                          {c.relationship ? (
                            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mt-0.5">
                              {c.relationship}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex gap-1">
                          <a
                            href={`tel:${c.phone}`}
                            className="h-8 w-8 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 flex items-center justify-center transition-colors"
                            title="Llamar"
                          >
                            <Phone className="h-3.5 w-3.5 text-emerald-400" />
                          </a>
                          <a
                            href={`https://wa.me/${(c.phone || "").replace(/[^\d]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors"
                            title="WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5 text-neutral-300" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {settings && Object.keys(settings).length > 0 ? (
                <Section icon={ShieldCheck} label="Configuración del conductor">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">Umbral G</div>
                      <div className="font-mono text-emerald-400">
                        {settings.alert_threshold ?? "—"}G
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">Auto llamada</div>
                      <div className={`font-mono ${settings.auto_call ? "text-emerald-400" : "text-neutral-500"}`}>
                        {settings.auto_call ? "ON" : "OFF"}
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <div className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">WhatsApp</div>
                      <div className={`font-mono ${settings.auto_whatsapp ? "text-emerald-400" : "text-neutral-500"}`}>
                        {settings.auto_whatsapp ? "ON" : "OFF"}
                      </div>
                    </div>
                  </div>
                </Section>
              ) : null}

              <Section icon={Mail} label="Identificadores">
                <div className="font-mono text-[11px] text-neutral-400 space-y-1 break-all">
                  <div><span className="text-neutral-600">id:</span> {driverId}</div>
                  <div><span className="text-neutral-600">email:</span> {driver?.email || "—"}</div>
                </div>
              </Section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
