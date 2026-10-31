import { useEffect, useState, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoginScreen } from "@/screens/LoginScreen";
import { ActivateAccountScreen } from "@/screens/ActivateAccountScreen";
import { AmbulanceApp } from "@/screens/ambulance/AmbulanceApp";
import { ErApp } from "@/screens/er/ErApp";
import { LocalPortal } from "@/screens/local/LocalPortal";
import { getCurrentUser } from "@/lib/backend";

function AuthenticatedDemo({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<"checking" | "allowed" | "login">("checking");

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(() => active && setAccess("allowed"))
      .catch(() => active && setAccess("login"));
    return () => {
      active = false;
    };
  }, []);

  if (access === "checking") {
    return <p role="status" className="grid-monitor min-h-[100dvh] bg-ink p-8 text-center text-sm text-muted-dark">Comprobando sesión…</p>;
  }
  if (access === "login") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginScreen />} />
      <Route path="/activar-cuenta" element={<ActivateAccountScreen />} />
      <Route path="/local/*" element={<LocalPortal />} />
      <Route path="/ambulancia/*" element={<AuthenticatedDemo><AmbulanceApp /></AuthenticatedDemo>} />
      <Route path="/urgencias/*" element={<AuthenticatedDemo><ErApp /></AuthenticatedDemo>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
