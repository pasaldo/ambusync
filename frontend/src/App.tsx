import { Routes, Route, Navigate } from "react-router-dom";
import { RoleSelect } from "@/screens/RoleSelect";
import { AmbulanceApp } from "@/screens/ambulance/AmbulanceApp";
import { ErApp } from "@/screens/er/ErApp";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RoleSelect />} />
      <Route path="/ambulancia/*" element={<AmbulanceApp />} />
      <Route path="/urgencias/*" element={<ErApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
