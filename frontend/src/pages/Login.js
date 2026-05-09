import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ShieldAlert, Lock, Mail, Loader2 } from "lucide-react";

export default function Login() {
  const { user, login, error } = useAuth();
  const [email, setEmail] = useState("admin@crash.io");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await login(email, password);
    setBusy(false);
    if (ok) navigate("/");
  };

  return (
    <div
      className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-5 bg-[#0A0A0A] text-white"
      data-testid="login-page"
    >
      {/* LEFT — brand panel */}
      <aside className="hidden lg:flex lg:col-span-3 relative overflow-hidden border-r border-white/5">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1558981285-6f0c94958bb6?w=2000&q=80)" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A0A0A] via-[#0A0A0A]/70 to-transparent" />
        <div className="absolute inset-0 grid-grain opacity-30" />

        <div className="relative z-10 flex flex-col justify-between p-14 w-full">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
              <ShieldAlert className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.4em] text-neutral-400">
                Critical Response
              </div>
              <div className="text-lg font-bold tracking-tight">C.R.A.S.H. <span className="text-emerald-400">2.0</span></div>
            </div>
          </div>

          <div className="max-w-md">
            <div className="text-[11px] uppercase tracking-[0.3em] text-emerald-400 mb-4">
              Command Center · Live
            </div>
            <h1 className="text-4xl xl:text-5xl font-bold leading-[1.05] tracking-tight">
              Supervisión de telemetría<br/>
              de cascos en <span className="text-emerald-400">tiempo real</span>.
            </h1>
            <p className="mt-6 text-neutral-400 max-w-sm leading-relaxed">
              Mapa en vivo, fuerza-G, conexión Bluetooth y respuesta inmediata
              ante impactos. Diseñado para operadores de seguridad vial.
            </p>

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              {[
                { v: "8", l: "Conductores" },
                { v: "<2s", l: "Latencia" },
                { v: "24/7", l: "Monitoreo" },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
                  <div className="font-mono text-2xl font-bold text-white">{s.v}</div>
                  <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-600">
            // Encrypted channel · TLS 1.3 · Session JWT
          </div>
        </div>
      </aside>

      {/* RIGHT — form */}
      <main className="lg:col-span-2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="font-bold text-lg">C.R.A.S.H. <span className="text-emerald-400">2.0</span></div>
          </div>

          <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-500 mb-3">
            Acceso de operador
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Iniciar sesión</h2>
          <p className="text-neutral-400 text-sm mb-10">
            Ingresa con tus credenciales de administrador o monitorista.
          </p>

          <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 mb-2 block">
                Correo
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                <input
                  data-testid="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-emerald-500/60 focus:bg-white/10 outline-none rounded-xl pl-10 pr-3 py-3 text-sm transition-all"
                  placeholder="operador@crash.io"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 mb-2 block">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                <input
                  data-testid="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-emerald-500/60 focus:bg-white/10 outline-none rounded-xl pl-10 pr-3 py-3 text-sm transition-all"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {error ? (
              <div
                data-testid="login-error"
                className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3"
              >
                {error}
              </div>
            ) : null}

            <button
              data-testid="login-submit"
              disabled={busy}
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold rounded-xl px-4 py-3 transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.25)]"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Verificando…" : "Acceder al Centro de Mando"}
            </button>
          </form>

          <div className="mt-10 grid grid-cols-2 gap-3 text-[11px]">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 font-mono">
              <div className="uppercase tracking-[0.2em] text-neutral-500 text-[9px] mb-1">Admin</div>
              admin@crash.io<br/>admin123
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 font-mono">
              <div className="uppercase tracking-[0.2em] text-neutral-500 text-[9px] mb-1">Monitor</div>
              monitor@crash.io<br/>monitor123
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
