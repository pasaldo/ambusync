import { useCases } from "@/store/useCases";
import { scriptedCriticalDraft } from "../ambulance/draft";

/**
 * Escenario guionado para grabar el video de entrega: una ambulancia transmite
 * un caso crítico que "aterriza" en el tablero tras un breve retardo (simula la
 * latencia de la transmisión). Devuelve el control vía `onDone`.
 */
export function runDemoScenario(onDone: () => void) {
  const d = scriptedCriticalDraft();
  window.setTimeout(() => {
    useCases.getState().addCase({
      ambulanceCode: d.ambulanceCode,
      hospitalName: d.hospitalName,
      patient: {
        alias: d.alias,
        age: d.age ? Number(d.age) : null,
        sex: d.sex,
        chiefComplaint: d.chiefComplaint,
        symptoms: d.symptoms,
      },
      vitals: { ...d.vitals, takenAt: Date.now() },
      triage: d.triage ?? 1,
      etaMinutes: d.etaMinutes,
    });
    onDone();
  }, 900);
}
