import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, LogIn } from "lucide-react";
import { Logo } from "@/components/Logo";
import { BackendApiError, getCurrentUser, login, logout } from "@/lib/backend";

function canEnterPortal(groups: string[]) {
  return groups.includes("ambulance") || groups.includes("urgencias") || groups.includes("institution_admin");
}

function errorMessage(error: unknown) {
  if (error instanceof BackendApiError) {
    if (error.status === 429) return "Demasiados intentos. Espera antes de volver a intentarlo.";
    return error.message;
  }
  return "No se pudo conectar con el backend local. Comprueba que Django esté activo.";
}

export function LoginScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checkingSession, setCheckingSession] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const notice = typeof location.state?.notice === "string" ? location.state.notice : "";

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((user) => {
        if (!active) return;
        if (canEnterPortal(user.groups)) navigate("/local", { replace: true });
        else setError("La cuenta no tiene un módulo operativo habilitado.");
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (!(requestError instanceof BackendApiError) || requestError.status !== 401) {
          setError(errorMessage(requestError));
        }
      })
      .finally(() => active && setCheckingSession(false));
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      const user = await getCurrentUser();
      if (!canEnterPortal(user.groups)) {
        await logout();
        setError("La cuenta no tiene un módulo operativo habilitado.");
        setPassword("");
        return;
      }
      navigate("/local", { replace: true });
    } catch (loginError) {
      setError(errorMessage(loginError));
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid-monitor relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-ink px-5 py-10 text-white">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/10 blur-[120px]" />
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-2 flex justify-center">
          <Logo size={34} />
        </div>
        <h1 className="text-center text-balance text-2xl font-bold leading-tight tracking-tight">
          La urgencia empieza antes del arribo.
        </h1>
        <p className="mt-2 text-center text-sm text-muted-dark">
          Inicia sesión para abrir el módulo correspondiente a tu cuenta.
        </p>

        <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          {checkingSession ? (
            <p role="status" className="py-4 text-center text-sm text-muted-dark">
              Comprobando sesión…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-medium">
                Usuario
                <input
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-white outline-none focus:border-signal"
                />
              </label>
              <label className="block text-sm font-medium">
                Contraseña
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-white outline-none focus:border-signal"
                />
              </label>
              <button
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-signal px-4 font-semibold text-ink disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                {submitting ? "Ingresando…" : "Iniciar sesión"}
              </button>
            </form>
          )}
          {notice && <p role="status" className="mt-4 rounded-lg bg-white/5 p-3 text-sm text-muted-dark">{notice}</p>}
          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</p>}
        </section>

        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-dark">
          <Activity className="h-3.5 w-3.5 shrink-0 text-signal" />
          Acceso local de demostración. No usar para atención clínica ni ingresar información de personas reales.
        </p>
      </motion.main>
    </div>
  );
}
