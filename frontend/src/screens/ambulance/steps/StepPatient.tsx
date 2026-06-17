import { Field, TextInput, TextArea } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import type { Draft } from "../draft";
import type { Sex } from "@/types";
import { cn } from "@/lib/utils";

const COMMON_SYMPTOMS = [
  "Disnea",
  "Dolor torácico",
  "Sudoración",
  "Náuseas",
  "Mareo",
  "Pérdida de conciencia",
  "Hemorragia",
  "Convulsión",
];

export function StepPatient({
  draft,
  update,
}: {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
}) {
  function toggleSymptom(s: string) {
    const has = draft.symptoms.includes(s);
    update({
      symptoms: has ? draft.symptoms.filter((x) => x !== s) : [...draft.symptoms, s],
    });
  }

  return (
    <div className="space-y-4 pt-1">
      <Field label="Alias del paciente" hint="opcional" htmlFor="alias">
        <TextInput
          id="alias"
          value={draft.alias}
          onChange={(e) => update({ alias: e.target.value })}
          placeholder="Ej. Paciente Bravo"
          autoComplete="off"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Edad" hint="años" htmlFor="age">
          <TextInput
            id="age"
            inputMode="numeric"
            value={draft.age}
            onChange={(e) => update({ age: e.target.value.replace(/\D/g, "").slice(0, 3) })}
            placeholder="––"
            className="font-mono tabular"
          />
        </Field>
        <Field label="Sexo">
          <Segmented<Sex>
            ariaLabel="Sexo"
            value={draft.sex}
            onChange={(v) => update({ sex: v })}
            options={[
              { value: "F", label: "F" },
              { value: "M", label: "M" },
              { value: "X", label: "X" },
            ]}
          />
        </Field>
      </div>

      <Field label="Motivo de consulta" htmlFor="cc">
        <TextInput
          id="cc"
          value={draft.chiefComplaint}
          onChange={(e) => update({ chiefComplaint: e.target.value })}
          placeholder="Ej. Dolor torácico opresivo"
          autoComplete="off"
        />
      </Field>

      <Field label="Síntomas" hint="toca para añadir">
        <div className="flex flex-wrap gap-2">
          {COMMON_SYMPTOMS.map((s) => {
            const active = draft.symptoms.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSymptom(s)}
                aria-pressed={active}
                className={cn(
                  "h-9 rounded-full border px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-signal bg-signal/10 text-signal-deep"
                    : "border-ink/15 bg-white text-muted hover:border-ink/30",
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Notas adicionales" hint="opcional" htmlFor="notes">
        <TextArea
          id="notes"
          rows={2}
          placeholder="Antecedentes, alergias, contexto…"
          onChange={(e) => {
            const extra = e.target.value
              .split(/[,\n]/)
              .map((x) => x.trim())
              .filter(Boolean);
            // Conserva los chips seleccionados y agrega texto libre.
            const chips = draft.symptoms.filter((x) => COMMON_SYMPTOMS.includes(x));
            update({ symptoms: [...chips, ...extra] });
          }}
        />
      </Field>
    </div>
  );
}
