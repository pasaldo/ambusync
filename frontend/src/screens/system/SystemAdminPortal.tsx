import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/Logo";
import { BackendApiError, getCurrentUser, logout } from "@/lib/backend";
import { SystemInstitutionsPanel } from "@/screens/system/SystemInstitutionsPanel";

export function SystemAdminPortal() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((user) => {
        if (!active) return;
        if (user.groups.length !== 1 || !user.groups.includes("system_admin")) {
          navigate("/", { replace: true });
          return;
        }
        setUsername(user.username);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof BackendApiError && requestError.status === 401) {
          navigate("/", { replace: true });
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "No se pudo cargar la sesión.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [navigate]);

  async function handleLogout() {
    try {
      await logout();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "No se pudo cerrar la sesión.");
    } finally {
      navigate("/", { replace: true, state: { notice: "Sesión global cerrada." } });
    }
  }

  if (loading) {
    return <p role="status" className="grid-monitor min-h-[100dvh] bg-ink p-8 text-center text-sm text-muted-dark">Verificando rol global…</p>;
  }
  if (!username) return null;

  return (
    <main className="grid-monitor min-h-[100dvh] bg-ink px-4 py-6 text-white sm:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-4">
            <Logo size={30} />
            <div>
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-signal"><ShieldCheck className="h-4 w-4" /> Administración global</p>
              <h1 className="mt-1 text-xl font-semibold">AmbuSync · Sistema</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-dark">
            <span>{username}</span>
            <button type="button" onClick={() => void handleLogout()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-white hover:border-signal">
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        </header>
        <p className="my-5 rounded-xl border border-amber-200/15 bg-amber-200/[0.04] p-3 text-sm text-amber-100/80">
          Panel de administración de instituciones. No habilita operaciones clínicas ni reemplaza los permisos institucionales.
        </p>
        {error ? <p role="alert" className="mb-5 rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</p> : null}
        {!error ? <SystemInstitutionsPanel /> : null}
      </div>
    </main>
  );
}
