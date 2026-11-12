import { createContext, useContext, useState, type ReactNode } from "react";
import { PortalMemory } from "./portalMemoryState";

const MemoryContext = createContext<PortalMemory | null>(null);

export function PortalMemoryProvider({ children }: { children: ReactNode }) {
  const [memory] = useState(() => new PortalMemory());
  return <MemoryContext.Provider value={memory}>{children}</MemoryContext.Provider>;
}

export function usePortalMemory(): PortalMemory {
  const memory = useContext(MemoryContext);
  if (!memory) throw new Error("PortalMemoryProvider is required.");
  return memory;
}
