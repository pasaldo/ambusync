import { Stepper } from "@/components/ui/Stepper";
import { VitalsStrip } from "@/components/VitalsStrip";
import type { Draft } from "../draft";
import type { Vitals } from "@/types";

export function StepVitals({
  draft,
  update,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
}) {
  const v = draft.vitals;
  const setV = (patch: Partial<Vitals>) => update({ vitals: { ...v, ...patch } });

  return (
    <div className="space-y-4 pt-1">
      <p className="text-sm text-muted">
        Registra los signos en terreno. Se transmiten tal cual a Urgencias.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Stepper label="FC" unit="lpm" value={v.hr} min={20} max={240} placeholder={80}
          onChange={(hr) => setV({ hr })} />
        <Stepper label="SatO₂" unit="%" value={v.spo2} min={50} max={100} placeholder={97}
          onChange={(spo2) => setV({ spo2 })} />
        <Stepper label="PA sistólica" unit="mmHg" value={v.bpSys} min={50} max={260} step={5} placeholder={120}
          onChange={(bpSys) => setV({ bpSys })} />
        <Stepper label="PA diastólica" unit="mmHg" value={v.bpDia} min={20} max={160} step={5} placeholder={80}
          onChange={(bpDia) => setV({ bpDia })} />
        <Stepper label="FR" unit="rpm" value={v.rr} min={4} max={60} placeholder={16}
          onChange={(rr) => setV({ rr })} />
        <Stepper label="Temp" unit="°C" value={v.tempC} min={30} max={43} step={0.1} placeholder={36.6}
          onChange={(tempC) => setV({ tempC })} />
        <Stepper label="Glasgow" unit="3–15" value={v.glasgow} min={3} max={15} placeholder={15}
          onChange={(glasgow) => setV({ glasgow })} className="col-span-2" />
      </div>

      {/* Vista previa de la tira tal como la verá Urgencias */}
      <div>
        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-muted">
          Vista previa en el monitor
        </p>
        <VitalsStrip vitals={v} tone="light" />
      </div>
    </div>
  );
}
