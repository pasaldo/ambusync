import { useEffect, useRef, useState, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoginScreen } from "@/screens/LoginScreen";
import { ActivateAccountScreen } from "@/screens/ActivateAccountScreen";
import { RequestRecoveryScreen, ResetPasswordScreen } from "@/screens/RecoveryScreen";
import { AmbulanceApp } from "@/screens/ambulance/AmbulanceApp";
import { ErApp } from "@/screens/er/ErApp";
import { LocalPortal } from "@/screens/local/LocalPortal";
import { SystemAdminPortal } from "@/screens/system/SystemAdminPortal";
import { getCurrentUser } from "@/lib/backend";
import { PortalMemoryProvider } from "@/screens/local/portalMemory";

function AuthenticatedDemo({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<"checking" | "allowed" | "system" | "login">("checking");

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((user) => active && setAccess(user.groups.includes("system_admin") ? "system" : "allowed"))
      .catch(() => active && setAccess("login"));
    return () => {
      active = false;
    };
  }, []);

  if (access === "checking") {
    return <p role="status" className="grid-monitor min-h-[100dvh] bg-ink p-8 text-center text-sm text-muted-dark">Comprobando sesión…</p>;
  }
  if (access === "login") return <Navigate to="/" replace />;
  if (access === "system") return <Navigate to="/sistema" replace />;
  return children;
}

function ResetRecoveryEntry() {
  const [entry, setEntry] = useState(0);
  const lastNavigation = useRef(window.location.href);
  useEffect(() => {
    const change = (event: Event) => {
      if (event.type === "hashchange" && !window.location.hash) return;
      if (lastNavigation.current === window.location.href) return;
      lastNavigation.current = window.location.href;
      setEntry((value) => value + 1);
    };
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    return () => { window.removeEventListener("hashchange", change); window.removeEventListener("popstate", change); };
  }, []);
  return <ResetPasswordScreen key={entry} />;
}

export default function App() {
  return (
    <PortalMemoryProvider><Routes>
      <Route path="/" element={<LoginScreen />} />
      <Route path="/activar-cuenta" element={<ActivateAccountScreen />} />
      <Route path="/recuperar-cuenta" element={<RequestRecoveryScreen />} />
      <Route path="/restablecer-cuenta" element={<ResetRecoveryEntry />} />
      <Route path="/local/*" element={<LocalPortal />} />
      <Route path="/sistema/*" element={<SystemAdminPortal />} />
      <Route path="/ambulancia/*" element={<AuthenticatedDemo><AmbulanceApp /></AuthenticatedDemo>} />
      <Route path="/urgencias/*" element={<AuthenticatedDemo><ErApp /></AuthenticatedDemo>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></PortalMemoryProvider>
  );
}
