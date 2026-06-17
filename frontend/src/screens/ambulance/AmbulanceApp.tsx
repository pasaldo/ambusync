import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PhoneFrame } from "@/components/PhoneFrame";
import { useCases } from "@/store/useCases";
import { type Draft, emptyDraft } from "./draft";
import { StartScreen } from "./StartScreen";
import { StepPatient } from "./steps/StepPatient";
import { StepVitals } from "./steps/StepVitals";
import { StepTriage } from "./steps/StepTriage";
import { StepDestination } from "./steps/StepDestination";
import { StepSummary } from "./steps/StepSummary";
import { TransmitOverlay } from "./TransmitOverlay";

type Phase = "start" | "wizard" | "sending" | "sent";

const STEP_COUNT = 5;

export function AmbulanceApp() {
  const navigate = useNavigate();
  const addCase = useCases((s) => s.addCase);

  const [phase, setPhase] = useState<Phase>("start");
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [dir, setDir] = useState(1);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function startNew(seed?: Draft) {
    setDraft(seed ?? emptyDraft());
    setStep(0);
    setDir(1);
    setPhase("wizard");
  }

  function goNext() {
    if (step < STEP_COUNT - 1) {
      setDir(1);
      setStep((s) => s + 1);
    } else {
      transmit();
    }
  }

  function goBack() {
    if (step === 0) {
      setPhase("start");
      return;
    }
    setDir(-1);
    setStep((s) => s - 1);
  }

  function transmit() {
    setPhase("sending");
    // El pulso de transmisión corre ~1.5s antes de "aterrizar" el caso.
    window.setTimeout(() => {
      addCase({
        ambulanceCode: draft.ambulanceCode,
        hospitalName: draft.hospitalName,
        patient: {
          alias: draft.alias.trim() || "Paciente sin alias",
          age: draft.age ? Number(draft.age) : null,
          sex: draft.sex,
          chiefComplaint: draft.chiefComplaint.trim(),
          symptoms: draft.symptoms,
        },
        vitals: { ...draft.vitals, takenAt: Date.now() },
        triage: draft.triage ?? 3,
        etaMinutes: draft.etaMinutes,
      });
      setPhase("sent");
    }, 1600);
  }

  const steps = [
    <StepPatient key="patient" draft={draft} update={update} />,
    <StepVitals key="vitals" draft={draft} update={update} />,
    <StepTriage key="triage" draft={draft} update={update} />,
    <StepDestination key="dest" draft={draft} update={update} />,
    <StepSummary key="summary" draft={draft} />,
  ];

  return (
    <PhoneFrame tone="light">
      <AnimatePresence mode="wait">
        {phase === "start" && (
          <StartScreen
            key="start"
            onNew={() => startNew()}
            onExit={() => navigate("/")}
          />
        )}

        {phase === "wizard" && (
          <WizardShell
            key="wizard"
            step={step}
            dir={dir}
            draft={draft}
            onBack={goBack}
            onNext={goNext}
          >
            {steps[step]}
          </WizardShell>
        )}

        {(phase === "sending" || phase === "sent") && (
          <TransmitOverlay
            key="transmit"
            phase={phase}
            draft={draft}
            onSeeBoard={() => navigate("/urgencias")}
            onNewCase={() => startNew()}
            onBackHome={() => setPhase("start")}
          />
        )}
      </AnimatePresence>
    </PhoneFrame>
  );
}

// ——— Marco del wizard: cabecera con progreso + barra de acciones ———

import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { canAdvance, STEP_META } from "./steps/meta";
import type { ReactNode } from "react";

function WizardShell({
  step,
  dir,
  draft,
  children,
  onBack,
  onNext,
}: {
  step: number;
  dir: number;
  draft: Draft;
  children: ReactNode;
  onBack: () => void;
  onNext: () => void;
}) {
  const meta = STEP_META[step];
  const last = step === STEP_META.length - 1;
  const ok = canAdvance(step, draft);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* Cabecera */}
      <header className="shrink-0 px-5 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            aria-label="Volver"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-ink/5"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
              Paso {step + 1} de {STEP_META.length}
            </p>
            <h1 className="truncate text-lg font-bold leading-tight text-ink">{meta.title}</h1>
          </div>
        </div>
        {/* Barra de progreso por segmentos */}
        <div className="mt-3 flex gap-1.5">
          {STEP_META.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-signal" : "bg-ink/10"
              }`}
            />
          ))}
        </div>
      </header>

      {/* Cuerpo deslizante */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -28 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="no-scrollbar h-full overflow-y-auto px-5 pb-4"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Barra de acción */}
      <div className="shrink-0 border-t border-ink/10 bg-white/70 px-5 py-3 backdrop-blur">
        <Button size="lg" className="w-full" onClick={onNext} disabled={!ok}>
          {last ? "Transmitir al hospital" : "Continuar"}
        </Button>
        {!ok && meta.requiredHint && (
          <p className="mt-1.5 text-center text-xs text-muted">{meta.requiredHint}</p>
        )}
      </div>
    </motion.div>
  );
}
