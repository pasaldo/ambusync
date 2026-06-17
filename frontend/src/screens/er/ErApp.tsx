import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Inbox, Sparkles, Trash2, Activity } from "lucide-react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Logo } from "@/components/Logo";
import { useCases } from "@/store/useCases";
import type { CaseRecord } from "@/types";
import { sortCases, isIncoming } from "./sorting";
import { PatientCard } from "./PatientCard";
import { CaseDetail } from "./CaseDetail";
import { runDemoScenario } from "./demo";

export function ErApp() {
  const navigate = useNavigate();
  const cases = useCases((s) => s.cases);
  const seedDemo = useCases((s) => s.seedDemo);
  const clearAll = useCases((s) => s.clearAll);
  const lastTransmittedId = useCases((s) => s.lastTransmittedId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);

  // Siembra inicial para que el tablero se vea vivo al entrar.
  useEffect(() => {
    if (cases.length === 0) seedDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const incoming = useMemo(
    () => sortCases(cases.filter(isIncoming)),
    [cases],
  );
  const received = useMemo(
    () => cases.filter((c) => c.status === "recibido"),
    [cases],
  );

  const selected = cases.find((c) => c.id === selectedId) ?? null;
  const critical = incoming.filter((c) => c.triage <= 2).length;

  function handleDemo() {
    setDemoRunning(true);
    runDemoScenario(() => setDemoRunning(false));
  }

  return (
    <PhoneFrame tone="dark">
      <div className="grid-monitor relative flex min-h-0 flex-1 flex-col text-white">
        {/* Cabecera */}
        <header className="shrink-0 px-4 pb-2 pt-1">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate("/")}
              className="flex h-9 items-center gap-1 rounded-full px-2 text-sm text-muted-dark hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" /> Roles
            </button>
            <Logo size={22} className="text-white" />
            <div className="w-[68px]" />
          </div>

          {/* Resumen del tablero */}
          <div className="mt-2 flex items-end justify-between">
            <div>
              <h1 className="text-xl font-bold leading-tight">Pacientes entrantes</h1>
              <p className="flex items-center gap-1.5 text-sm text-muted-dark">
                <Activity className="h-3.5 w-3.5 text-signal" />
                Enlace en vivo · {incoming.length} en camino
              </p>
            </div>
            {critical > 0 && (
              <span className="mb-0.5 inline-flex items-center gap-1.5 rounded-full bg-triage-1/15 px-2.5 py-1 text-xs font-semibold text-triage-1">
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-triage-1" />
                {critical} crítico{critical > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </header>

        {/* Lista */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          {incoming.length === 0 ? (
            <EmptyState />
          ) : (
            <motion.div layout className="space-y-2.5 pt-1">
              <AnimatePresence initial={false}>
                {incoming.map((c) => (
                  <PatientCard
                    key={c.id}
                    record={c}
                    isNew={c.id === lastTransmittedId}
                    onOpen={() => setSelectedId(c.id)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}

          {received.length > 0 && <ReceivedSection received={received} onOpen={setSelectedId} />}
        </div>

        {/* Controles de demo */}
        <div className="shrink-0 border-t border-white/10 bg-ink/80 px-4 py-2.5 backdrop-blur">
          <div className="flex gap-2">
            <button
              onClick={handleDemo}
              disabled={demoRunning}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-signal/15 text-sm font-semibold text-signal-soft transition-colors hover:bg-signal/25 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {demoRunning ? "Entrando caso…" : "Modo demo"}
            </button>
            <button
              onClick={() => {
                clearAll();
                setSelectedId(null);
              }}
              aria-label="Vaciar tablero"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-muted-dark transition-colors hover:bg-white/10 hover:text-white"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Detalle */}
        <AnimatePresence>
          {selected && <CaseDetail record={selected} onClose={() => setSelectedId(null)} />}
        </AnimatePresence>
      </div>
    </PhoneFrame>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        <Inbox className="h-8 w-8 text-muted-dark" />
      </div>
      <p className="mt-4 font-semibold text-white">Sin pacientes en camino</p>
      <p className="mt-1 max-w-[15rem] text-sm text-muted-dark">
        Cuando una ambulancia transmita, el caso aparecerá aquí en vivo.
      </p>
    </div>
  );
}

function ReceivedSection({
  received,
  onOpen,
}: {
  received: CaseRecord[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mt-5">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-dark">
        Recibidos ({received.length})
      </p>
      <div className="space-y-1.5">
        {received.map((c) => (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            className="flex w-full items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-left text-sm text-muted-dark ring-1 ring-white/5 hover:bg-white/5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-triage-4" />
            <span className="flex-1 truncate text-white/80">{c.patient.alias}</span>
            <span className="truncate font-mono text-xs">{c.patient.chiefComplaint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
