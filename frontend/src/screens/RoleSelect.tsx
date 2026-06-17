import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Ambulance, HeartPulse, ArrowRight, Activity } from "lucide-react";
import { Logo } from "@/components/Logo";

const roles = [
  {
    to: "/ambulancia",
    title: "Soy paramédico",
    subtitle: "Ambulancia",
    desc: "Captura al paciente y transmite al hospital.",
    Icon: Ambulance,
    accent: "from-signal/20 to-signal/5",
    ring: "group-hover:ring-signal/60",
  },
  {
    to: "/urgencias",
    title: "Soy Urgencias",
    subtitle: "Hospital",
    desc: "Recibe los pacientes en camino en vivo.",
    Icon: HeartPulse,
    accent: "from-triage-1/20 to-triage-1/5",
    ring: "group-hover:ring-triage-1/60",
  },
];

export function RoleSelect() {
  const navigate = useNavigate();
  return (
    <div className="grid-monitor relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-ink px-5 py-10 text-white">
      {/* Halo de señal de fondo */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-2 flex justify-center">
          <Logo size={34} />
        </div>
        <p className="mb-1 text-center text-balance text-2xl font-bold leading-tight tracking-tight">
          La urgencia empieza antes del arribo.
        </p>
        <p className="mb-8 text-center text-sm text-muted-dark">
          Transmite la información clínica desde la ambulancia a Urgencias en tiempo real.
        </p>

        <div className="space-y-3">
          {roles.map(({ to, title, subtitle, desc, Icon, accent, ring }, i) => (
            <motion.button
              key={to}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.1 }}
              onClick={() => navigate(to)}
              className={`group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left ring-1 ring-transparent transition-all hover:bg-white/[0.07] ${ring}`}
            >
              <span
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b ${accent} ring-1 ring-white/10`}
              >
                <Icon className="h-7 w-7" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-dark">
                  {subtitle}
                </span>
                <span className="block text-lg font-semibold leading-tight">{title}</span>
                <span className="block text-sm text-muted-dark">{desc}</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-dark transition-transform group-hover:translate-x-1 group-hover:text-signal" />
            </motion.button>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-dark">
          <Activity className="h-3.5 w-3.5 text-signal" />
          <span>Demo · sin datos reales de pacientes</span>
        </div>
      </motion.div>
    </div>
  );
}
