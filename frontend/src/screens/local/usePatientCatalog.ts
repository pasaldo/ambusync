import { useCallback, useEffect, useRef, useState } from "react";
import { BackendApiError, isUncertainWrite, listInstitutionSymptoms, listUnitPatients, sendResourceOperation, type BackendUser } from "@/lib/backend";
import { prepareOperation } from "@/lib/pendingOperation";
import type { CatalogSymptom, PatientRecord, ResourceKind } from "@/lib/resourceOperation";
import { usePortalMemory } from "./portalMemory";

export function usePatientCatalog(user: BackendUser | null, expireSession: () => void) {
  const memory = usePortalMemory();
  const [, render] = useState(0);
  const [data, setData] = useState<{ token: number; patients: PatientRecord[]; symptoms: CatalogSymptom[] }>({ token: -1, patients: [], symptoms: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(new Set<string>());
  const scope = memory.token;
  const canRead = Boolean(user && !user.groups.includes("system_admin") && user.groups.some((group) => ["ambulance", "urgencias", "institution_admin"].includes(group)));
  const ambulance = user?.groups.includes("ambulance") && Boolean(user.ambulance);
  const refresh = useCallback(async () => {
    const token = memory.token;
    if (!canRead) return;
    try {
      const [patients, symptoms] = await Promise.all([ambulance ? listUnitPatients() : Promise.resolve([]), listInstitutionSymptoms()]);
      if (memory.isCurrent(token)) { setData({ token, patients, symptoms }); setError(""); }
    } catch (failure) {
      if (!memory.isCurrent(token)) return;
      if (failure instanceof BackendApiError && failure.status === 401) expireSession();
      else setError("No se pudo consultar pacientes/catálogo. Actualiza antes de seleccionar datos nuevos.");
    }
  }, [memory, canRead, ambulance, expireSession]);
  useEffect(() => { setMessage(""); setError(""); setBusy(false); inFlight.current.clear(); void refresh(); }, [scope, refresh]);

  async function execute(key: string, success = "Operación de registro confirmada en servidor.") {
    const entry = memory.resourceAttempts.get(key);
    if (!entry || inFlight.current.has(key) || !memory.isCurrent(memory.token)) return;
    inFlight.current.add(key);
    const token = memory.token;
    setBusy(true); setError(""); setMessage("");
    try {
      await sendResourceOperation(entry.attempt, () => memory.isCurrent(token));
      if (!memory.isCurrent(token)) return;
      memory.resourceAttempts.delete(key); memory.resourceDrafts.delete(key);
      setMessage(success); await refresh();
    } catch (failure) {
      if (!memory.isCurrent(token)) return;
      entry.uncertain = entry.uncertain || isUncertainWrite(failure) || (failure instanceof BackendApiError && failure.status === 401);
      if (!entry.uncertain) { memory.resourceAttempts.delete(key); if (failure instanceof BackendApiError && failure.status === 409) await refresh(); }
      if (failure instanceof BackendApiError && failure.status === 401) expireSession();
      else setError(failure instanceof BackendApiError ? failure.message : "Resultado sin confirmar; revisa el intento pendiente.");
    } finally {
      if (memory.isCurrent(token)) { inFlight.current.delete(key); setBusy(inFlight.current.size > 0); render((n) => n + 1); }
    }
  }

  async function run(key: string, kind: ResourceKind, targetId: string, path: string, version: number, fields: Record<string, unknown>, success: string, institutionId?: string) {
    if (busy || memory.resourceAttempts.has(key) || !memory.isCurrent(memory.token)) return;
    memory.resourceAttempts.set(key, { attempt: { kind, targetId, institutionId, operation: prepareOperation(path, { ...fields, expected_version: version }) }, uncertain: false });
    await execute(key, success);
  }

  const current = data.token === scope && memory.isCurrent(scope);
  return { patients: current ? data.patients : [], symptoms: current ? data.symptoms : [], ready: current, busy, message, error, refresh, execute, run, memory, rerender: () => render((n) => n + 1) };
}

export type PatientCatalogState = ReturnType<typeof usePatientCatalog>;
