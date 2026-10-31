import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, KeyRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { activateAccount, BackendApiError } from "@/lib/backend";

function activationError(error: unknown) {
  if (error instanceof BackendApiError) {
    const fields = Object.values(error.fields ?? {}).flatMap((value) => Array.isArray(value) ? value : [value]);
    return fields.length ? fields.join(" ") : error.message;
  }
  return "No se pudo conectar con el backend local.";
}

export function ActivateAccountScreen() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activated, setActivated] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await activateAccount({ uid, token, password, password_confirmation: confirmation });
      setPassword("");
      setConfirmation("");
      setActivated(true);
    } catch (requestError) {
      setError(activationError(requestError));
      setPassword("");
      setConfirmation("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid-monitor relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-ink px-5 py-10 text-white">
      <main className="relative z-10 w-full max-w-md">
        <div className="mb-2 flex justify-center"><Logo size={34} /></div>
        <h1 className="text-center text-2xl font-bold">Activa tu cuenta</h1>
        <p className="mt-2 text-center text-sm text-muted-dark">Define una contraseña personal para el entorno local de prueba.</p>
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
