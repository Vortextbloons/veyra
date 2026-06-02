import { useSyncExternalStore } from "react";
import { getShutdownSnapshot, subscribeToShutdown } from "@/lib/app-shutdown";

export function useShutdownState() {
  return useSyncExternalStore(
    subscribeToShutdown,
    getShutdownSnapshot,
    getShutdownSnapshot,
  );
}
