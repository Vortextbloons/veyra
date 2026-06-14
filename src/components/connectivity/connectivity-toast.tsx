import { useEffect, useState } from "react";
import { useConnectivityStore } from "@/stores/connectivity-store";

type ToastMessage = {
  id: number;
  text: string;
};

let toastId = 0;

export function ConnectivityToastHost() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const effectiveConnectivity = useConnectivityStore((s) => s.effectiveConnectivity);

  useEffect(() => {
    const transition = useConnectivityStore.getState().consumeConnectivityTransition();
    if (!transition) return;

    const text =
      transition === "online"
        ? "Back online — web search is available."
        : "Offline — web search disabled.";

    const id = ++toastId;
    const showTimer = window.setTimeout(() => {
      setToast({ id, text });
    }, 0);
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 4000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(timer);
    };
  }, [effectiveConnectivity]);

  if (!toast) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2.5 text-[12px] text-white shadow-lg shadow-black/30"
    >
      {toast.text}
    </div>
  );
}
