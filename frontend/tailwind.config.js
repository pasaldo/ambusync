/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Superficies
        ink: {
          DEFAULT: "#0E1726", // fondo tablero Urgencias (monitor)
          800: "#152033",
          700: "#1C2A42",
          600: "#26354F",
        },
        surface: {
          DEFAULT: "#F7F9FB", // fondo captura del Paramédico
          card: "#FFFFFF",
          sunk: "#EDF1F6",
        },
        // Acento: señal / sync en vivo
        signal: {
          DEFAULT: "#00B5D8",
          soft: "#22D3EE",
          deep: "#0891B2",
        },
        // Triage (el color codifica gravedad, no decora)
        triage: {
          1: "#E5392E", // crítico
          2: "#F2792B", // emergencia
          3: "#F5C518", // urgente
          4: "#2FB67A", // menos urgente
          5: "#3B82F6", // no urgente
        },
        muted: {
          DEFAULT: "#64748B",
          dark: "#8294AE", // texto secundario sobre ink
        },
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        phone: "44px",
      },
      boxShadow: {
        phone: "0 40px 80px -20px rgba(14,23,38,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
        card: "0 1px 2px rgba(14,23,38,0.06), 0 8px 24px -12px rgba(14,23,38,0.18)",
        glow: "0 0 0 1px rgba(0,181,216,0.5), 0 0 24px -2px rgba(0,181,216,0.45)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.6)", opacity: "0.7" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "sweep": {
          "0%": { transform: "translateY(-120%)" },
          "100%": { transform: "translateY(120%)" },
        },
        "blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
        sweep: "sweep 1.1s ease-in-out",
        blink: "blink 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
