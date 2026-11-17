import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Activity, KeyRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { activateAccount, BackendApiError } from "@/lib/backend";

function activationError(error: unknown) {
  if (error instanceof BackendApiError) {
    const fields = Object.values(error.fields ?? {}).flatMap((value) => Array.isArray(value) ? value : [value]);
    return fields.length ? fields.join(" ") : error.message;
  }
  return "No se pudo confirmar la activación. Comprueba la conexión antes de intentarlo de nuevo.";
}

function activationCredentials() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const valid = (params: URLSearchParams) =>
    params.getAll("uid").length === 1 && params.getAll("token").length === 1
    && Boolean(params.get("uid")) && Boolean(params.get("token"));
  // Never assemble one credential from each source, or fall back from a partial fragment.
  const source = fragment.size ? fragment : query;
  return valid(source) ? { uid: source.get("uid")!, token: source.get("token")! } : { uid: "", token: "" };
}

export function ActivateAccountScreen() {
  const [entry, setEntry] = useState(0);
  useEffect(() => {
    const change = () => {
      // A fragment navigation can emit both popstate and hashchange. The first
      // remount consumes/erases the link; the second must not consume it again.
      if (!window.location.hash && !window.location.search) return;
      setEntry((value) => value + 1);
    };
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("popstate", change);
    };
  }, []);
  return <ActivationForm key={entry} />;
}

function ActivationForm() {
  const [{ uid, token }] = useState(activationCredentials);
  const mounted = useRef(false);
  const pending = useRef(false);
  const cleanUrl = useRef(window.location.origin + window.location.pathname);
  useEffect(() => {
    mounted.current = true;
    window.history.replaceState(window.history.state, "", cleanUrl.current);
    return () => { mounted.current = false; };
  }, []);
  const isCurrent = () => mounted.current && window.location.href === cleanUrl.current;
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !isCurrent() || !uid || !token) return;
    pending.current = true;
    setError("");
    setSubmitting(true);
    try {
      await activateAccount({ uid, token, password, password_confirmation: confirmation });
      if (!isCurrent()) return;
      setPassword("");
      setConfirmation("");
      setActivated(true);
    } catch (requestError) {
      if (!isCurrent()) return;
      setError(activationError(requestError));
      setPassword("");
      setConfirmation("");
    } finally {
      pending.current = false;
      if (isCurrent()) setSubmitting(false);
    }
  }

  return (
    <div className="grid-monitor relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-ink px-5 py-10 text-white">
      <main className="relative z-10 w-full max-w-md">
        <div className="mb-2 flex justify-center"><Logo size={34} /></div>
        <h1 className="text-center text-2xl font-bold">Activa tu cuenta</h1>
        <p className="mt-2 text-center text-sm text-muted-dark">Define una contraseña personal para el piloto de prueba.</p>
        <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          {activated ? (
            <div className="space-y-4 text-center">
              <p role="status" className="rounded-lg bg-emerald-300/10 p-3 text-sm text-emerald-100">Cuenta activada. Ya puedes iniciar sesión con tu nombre de usuario y la contraseña que definiste.</p>
              <Link to="/" className="inline-flex h-11 items-center justify-center rounded-lg bg-signal px-4 font-semibold text-ink">Ir al inicio de sesión</Link>
            </div>
          ) : !uid || !token ? (
            <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">El enlace de activación no contiene los datos requeridos. Solicita una nueva invitación a la administración institucional.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-medium">Contraseña (mínimo 15 caracteres)
                <input required minLength={15} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-white outline-none focus:border-signal" />
              </label>
              <label className="block text-sm font-medium">Repite la contraseña
                <input required minLength={15} maxLength={128} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-white outline-none focus:border-signal" />
              </label>
              <button disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 font-semibold text-ink disabled:opacity-50"><KeyRound className="h-4 w-4" />{submitting ? "Activando…" : "Definir contraseña y activar"}</button>
            </form>
          )}
          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</p>}
        </section>
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-dark"><Activity className="h-3.5 w-3.5 shrink-0 text-signal" />Enlace de un solo uso, con vigencia limitada. No usar con información de personas reales.</p>
      </main>
    </div>
  );
}
