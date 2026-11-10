import { useEffect, useState, type FormEvent } from "react";
import { Building2, Check, Edit3, Plus, RefreshCw, Search, ShieldAlert } from "lucide-react";
import {
  BackendApiError,
  createSystemInstitution,
  listSystemInstitutions,
  setSystemInstitutionEnabled,
  updateSystemInstitution,
  type NewSystemInstitution,
  type SystemInstitution,
} from "@/lib/backend";

const emptyForm: NewSystemInstitution = {
  name: "",
  rut: "",
  address: "",
  phone: "",
  email: "",
  first_username: "",
  first_email: "",
};

const inputClass = "mt-1.5 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-white outline-none focus:border-signal";

function errorText(error: unknown) {
  if (error instanceof BackendApiError && error.fields) {
    return Object.values(error.fields).flatMap((value) => Array.isArray(value) ? value : [value]).join(" ");
  }
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

export function SystemInstitutionsPanel() {
  const [institutions, setInstitutions] = useState<SystemInstitution[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<NewSystemInstitution>(emptyForm);
  const [editing, setEditing] = useState<SystemInstitution | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      setInstitutions(await listSystemInstitutions(statusFilter, query.trim()));
      setError("");
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [statusFilter]);

  function editInstitution(institution: SystemInstitution) {
    setEditing(institution);
    setForm({
      name: institution.name,
      rut: institution.rut,
      address: institution.address,
      phone: institution.phone,
      email: institution.email,
      first_username: "",
      first_email: "",
    });
    setMessage("");
    setError("");
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (editing) {
        await updateSystemInstitution(editing.id, {
          name: form.name,
          rut: form.rut,
          address: form.address,
          phone: form.phone,
          email: form.email,
        });
        setMessage("Los datos de la institución se actualizaron.");
      } else {
        const created = await createSystemInstitution(form);
        setMessage(`Institución creada. Se envió la activación para ${created.first_account.username}.`);
        setForm(emptyForm);
      }
      await refresh();
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function toggleInstitution(institution: SystemInstitution) {
    if (institution.enabled && !window.confirm(`¿Desactivar ${institution.name}? Se bloqueará su acceso mientras permanezca inactiva.`)) return;
    setError("");
    setMessage("");
    try {
      await setSystemInstitutionEnabled(institution.id, !institution.enabled);
      setMessage(`Institución ${institution.enabled ? "desactivada" : "reactivada"}.`);
      await refresh();
    } catch (toggleError) {
      setError(errorText(toggleError));
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-signal">Directorio global</p>
            <h2 className="mt-2 text-xl font-semibold">Instituciones</h2>
            <p className="mt-1 text-sm text-muted-dark">Las instituciones inactivas se conservan y pueden reactivarse.</p>
          </div>
          <button type="button" onClick={startCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-signal px-3 text-sm font-semibold text-ink">
            <Plus className="h-4 w-4" /> Nueva institución
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
          <label className="text-xs text-muted-dark">
            Buscar por nombre o RUT
            <span className="relative mt-1.5 block">
              <Search className="absolute left-3 top-3 h-4 w-4" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-9`} />
            </span>
          </label>
          <label className="text-xs text-muted-dark">
            Estado
            <select aria-label="Estado de institución" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className={inputClass}>
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
            </select>
          </label>
          <button type="button" onClick={() => void refresh()} aria-label="Buscar instituciones" className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-sm hover:border-signal">
            <RefreshCw className="h-4 w-4" /> Buscar
          </button>
        </div>

        <div className="mt-5 space-y-3" aria-live="polite">
          {loading ? <p role="status" className="py-8 text-center text-sm text-muted-dark">Cargando instituciones…</p> : null}
          {!loading && institutions.length === 0 ? <p className="rounded-xl border border-white/10 p-6 text-center text-sm text-muted-dark">No hay instituciones para mostrar.</p> : null}
          {institutions.map((institution) => (
            <article key={institution.id} className="rounded-xl border border-white/10 bg-ink/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 shrink-0 text-signal" />
                    <h3 className="truncate font-semibold">{institution.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${institution.enabled ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>
                      {institution.enabled ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                  <p className="mt-2 pl-6 text-xs text-muted-dark">RUT {institution.rut || "Pendiente"} · {institution.email || "Correo pendiente"}</p>
                  <p className="mt-1 pl-6 text-xs text-muted-dark">{institution.address || "Dirección pendiente"}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => editInstitution(institution)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-xs hover:border-signal">
                    <Edit3 className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button type="button" onClick={() => void toggleInstitution(institution)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-xs hover:border-signal">
                    {institution.enabled ? <ShieldAlert className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    {institution.enabled ? "Desactivar" : "Reactivar"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="h-fit rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-signal">{editing ? "Editar ficha" : "Alta institucional"}</p>
        <h2 className="mt-2 text-xl font-semibold">{editing ? editing.name : "Registrar institución"}</h2>
        <p className="mt-1 text-sm text-muted-dark">
          {editing ? "El tipo y el estado se administran por separado." : "Se creará como Receptora con una primera cuenta administrativa de Urgencias."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-sm font-medium">Nombre institución
            <input required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">RUT empresa
            <input required maxLength={12} placeholder="76.123.456-0" value={form.rut} onChange={(event) => setForm({ ...form, rut: event.target.value.toUpperCase() })} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">Dirección
            <input required maxLength={255} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">Teléfono (opcional)
            <input type="tel" maxLength={15} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">Correo de contacto
            <input required type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} />
          </label>
          {!editing ? (
            <div className="border-t border-white/10 pt-4">
              <h3 className="font-semibold">Primera cuenta de Urgencias</h3>
              <p className="mt-1 text-xs text-muted-dark">La contraseña se define desde el enlace de activación enviado por correo.</p>
              <label className="mt-3 block text-sm font-medium">Nombre de usuario
                <input required maxLength={150} autoComplete="off" value={form.first_username} onChange={(event) => setForm({ ...form, first_username: event.target.value })} className={inputClass} />
              </label>
              <label className="mt-3 block text-sm font-medium">Correo de activación
                <input required type="email" maxLength={254} value={form.first_email} onChange={(event) => setForm({ ...form, first_email: event.target.value })} className={inputClass} />
              </label>
            </div>
          ) : null}
          {error ? <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/10 p-3 text-sm text-rose-100">{error}</p> : null}
          {message ? <p role="status" className="rounded-lg border border-signal/20 bg-signal/10 p-3 text-sm text-signal">{message}</p> : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <button disabled={saving} className="h-11 rounded-lg bg-signal px-4 font-semibold text-ink disabled:opacity-50">
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear institución y enviar activación"}
            </button>
            {editing ? <button type="button" onClick={startCreate} className="h-11 rounded-lg border border-white/15 px-4 text-sm">Cancelar edición</button> : null}
          </div>
        </form>
      </section>
    </div>
  );
}
