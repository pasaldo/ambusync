import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function HistoricalDetailShell({ modal, onClose, children }: { modal: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!modal || !dialog.current) return;
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [modal]);
  if (!modal) return <section aria-label="Consulta del episodio histórico" className="space-y-3 rounded-xl border border-white/10 p-4">{children}</section>;
  return createPortal(<dialog ref={dialog} aria-label="Detalle de episodio" aria-modal="true"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')].filter((node) => node.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-ink p-0 text-white shadow-2xl backdrop:bg-black/70">
    <section aria-label="Consulta del episodio histórico" className="space-y-3 p-5">{children}</section>
  </dialog>, document.body);
}
