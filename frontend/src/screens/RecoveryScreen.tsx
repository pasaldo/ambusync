import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { BackendApiError, completeAccountRecovery, requestAccountRecovery } from "@/lib/backend";
import { usePortalMemory } from "./local/portalMemory";

const input = "mt-1.5 block h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-white outline-none focus:border-signal";
const button = "flex min-h-11 w-full items-center justify-center rounded-lg bg-signal px-4 py-2 font-semibold text-ink disabled:opacity-50";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fragmentCredentials() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const id = params.get("id") ?? "", token = params.get("token") ?? "";
  return params.size === 2 && params.getAll("id").length === 1 && params.getAll("token").length === 1 && UUID.test(id) && /^[-\w]{32,128}$/.test(token) ? { id, token } : null;
}

function recoveryError(error: unknown) {
  if (error instanceof BackendApiError) {
    const fields = Object.values(error.fields ?? {}).flatMap((value) => Array.isArray(value) ? value : [value]);
    return fields.length ? fields.join(" ") : error.message;
  }
  return "No se pudo confirmar el resultado. Si ya enviaste una contraseña, prueba iniciar sesión con ella o solicita un enlace nuevo. No se reenviará automáticamente.";
}

export function RequestRecoveryScreen() { return <RecoveryForm reset={false} />; }
export function ResetPasswordScreen() { return <RecoveryForm reset />; }

function RecoveryForm({ reset }: { reset: boolean }) {
  const memory = usePortalMemory();
  const [credentials, setCredentials] = useState(() => reset ? fragmentCredentials() : null);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [completed, setCompleted] = useState(false), [busy, setBusy] = useState(false);
  const active = useRef(false), inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    if (reset) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
      memory.clear();
    }
    return () => { active.current = false; };
  }, [reset, memory]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try {
      if (reset) {
        if (!credentials) return;
        if (password !== confirmation) { setError("Las contraseñas no coinciden."); return; }
        await completeAccountRecovery({ ...credentials, password, password_confirmation: confirmation }, () => active.current);
        if (!active.current) return;
        memory.clear(); setCredentials(null); setCompleted(true);
        setNotice("Contraseña restablecida. Las sesiones anteriores fueron revocadas; inicia sesión nuevamente.");
      } else {
        const result = await requestAccountRecovery(email, () => active.current);
        if (active.current) setNotice(result.message);
      }
    } catch (failure) {
      if (active.current) setError(recoveryError(failure));
    } finally {
      inFlight.current = false;
      if (active.current) { setBusy(false); setPassword(""); setConfirmation(""); }
    }
  }
  return <div className="grid-monitor flex min-h-[100dvh] items-center justify-center bg-ink px-5 py-10 text-white">
    <main className="w-full max-w-md">
      <div className="mb-4 flex justify-center"><Logo size={34} /></div>
      <h1 className="text-center text-2xl font-bold">{reset ? "Restablecer contraseña" : "Recuperar acceso"}</h1>
      <p className="mt-2 text-center text-sm text-muted-dark">{reset ? "Confirma el correo que recibió el enlace y define tu contraseña personal. El enlace vence en 30 minutos y solo sirve una vez." : "Solicita instrucciones al correo registrado. Por seguridad, no se informa si una cuenta existe."}</p>
      <section className="mt-7 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        {reset && !credentials && !completed ? <p role="alert" className="text-sm text-amber-100">El enlace no contiene una autorización válida. Abre nuevamente el enlace completo del correo o solicita uno nuevo.</p> : !completed && <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            {reset ? <>
              <label className="block text-sm">Nueva contraseña<input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className={input} /></label>
              <label className="block text-sm">Repite la nueva contraseña<input type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={input} /></label>
              <p className="text-xs text-muted-dark">Entre 15 y 128 caracteres. Puedes usar una frase y pegar desde un gestor de contraseñas.</p>
            </> : <label className="block text-sm">Correo registrado<input type="email" autoComplete="email" autoCapitalize="none" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className={input} /></label>}
            <button className={button}>{busy ? "Procesando…" : reset ? "Confirmar recuperación" : "Solicitar recuperación"}</button>
          </fieldset>
        </form>}
        {notice && <p role="status" className="rounded-lg bg-signal/10 p-3 text-sm">{notice}</p>}
        {error && <p role="alert" className="rounded-lg bg-amber-300/10 p-3 text-sm text-amber-100">{error}</p>}
        {!reset && <p className="text-xs text-muted-dark">Si no tienes acceso a ese correo, contacta al soporte técnico. No se puede sustituir el correo desde este formulario.</p>}
        <Link to="/" className="inline-flex min-h-11 items-center text-sm text-signal-soft hover:underline">{completed ? "Ir al inicio de sesión" : "Volver al inicio de sesión"}</Link>
      </section>
      <p className="mt-6 text-center text-xs text-muted-dark">Pruebas locales con Mailpit. No ingresar datos personales reales.</p>
    </main>
  </div>;
}
