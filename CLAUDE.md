# AmbuSync — contexto del proyecto

App web mobile-first (emula una app nativa con un `PhoneFrame` en escritorio) que transmite
datos clínicos de la ambulancia a Urgencias en tiempo real. Dos roles: `/ambulancia` (modo
claro, captura) y `/urgencias` (modo oscuro, tablero).

**Stack:** Vite + React + TS + Tailwind + framer-motion + zustand + react-router + lucide
(frontend). Hay un backend local inicial Django + DRF en `backend/`; Channels, WebSocket,
integración con frontend y despliegue siguen como trabajo futuro. Ver `docs/ETAPA_1.md`.

**Tiempo real:** store Zustand (`useCases`) sincronizado **entre pestañas** del mismo
navegador (`store/sync.ts`: BroadcastChannel + localStorage de respaldo/persistencia). Abrir
`/ambulancia` y `/urgencias` en dos ventanas muestra el caso en vivo. El countdown de ETA corre
con `useNow`. El backend local inicial está documentado en `docs/ETAPA_1.md`; la integración
con la SPA y sincronización entre dispositivos siguen siendo trabajo futuro.

**Diseño:** tokens en `AmbuSync_Roadmap_MVP.md` sección 3, implementados en
`tailwind.config.js` y `src/index.css`. El color codifica triage (no decora). Acento cian
(`signal`) = señal en vivo. Tipografía: Hanken Grotesk (UI) + JetBrains Mono tabular
(vitales/ETA). Firma: tira de vitales (`VitalsStrip`) + pulso de transmisión (`TransmitOverlay`).

**Piso de calidad:** responsive desde 360 px, foco visible, `prefers-reduced-motion`,
contraste AA, copy en voz activa ("Transmitir al hospital" → estado "Transmitido").

**Objeto central:** `CaseRecord` (paciente + vitales + triage + estado + ETA), que viaja de
la ambulancia a Urgencias. Definido en `src/types.ts`.

## Mapa del código (`frontend/src/`)

- `screens/RoleSelect.tsx` — landing y selector de rol.
- `screens/ambulance/` — flujo del paramédico: `AmbulanceApp` (orquestador/wizard),
  `StartScreen`, `steps/*`, `TransmitOverlay` (pulso de transmisión).
- `screens/er/` — Urgencias: `ErApp` (tablero), `PatientCard`, `CaseDetail`, `demo.ts`
  (escenario guionado), `sorting.ts` (orden por triage y ETA).
- `components/` — `PhoneFrame`, `VitalsStrip`, `TriageBadge`, `EtaCountdown`, `Logo`, `ui/*`.
- `store/useCases.ts` — estado global de casos (add/updateStatus/seedDemo/clearAll).
- `data/` — `triage.ts`, `vitals.ts` (rangos para resaltar anormales), `status.ts`, `seed.ts`.

## Comandos

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build de producción
```

Sigue las fases de `AmbuSync_Roadmap_MVP.md` en orden; cada fase debe quedar demostrable.
