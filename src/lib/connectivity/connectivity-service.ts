import type {
  ConnectivityPreference,
  EffectiveConnectivity,
  SystemOnlineStatus,
} from "@/lib/connectivity/connectivity-types";

export function resolveEffectiveConnectivity(
  preference: ConnectivityPreference,
  systemOnline: SystemOnlineStatus,
): EffectiveConnectivity {
  if (preference === "offline") return "offline";
  if (preference === "online") return "online";
  return systemOnline === true ? "online" : "offline";
}

export function getConnectivityLabel(
  preference: ConnectivityPreference,
  effective: EffectiveConnectivity,
  systemOnline: SystemOnlineStatus,
): string {
  if (preference === "offline") return "Offline";
  if (preference === "online") return "Online";
  if (effective === "online") return "Online";
  if (systemOnline === false) return "No connection";
  return "Offline";
}

export function getConnectivityDescription(
  preference: ConnectivityPreference,
  effective: EffectiveConnectivity,
): string {
  if (preference === "offline") {
    return "Privacy mode — web search and cloud models are blocked. Local AI still works.";
  }
  if (preference === "online") {
    return "Online mode — internet features are enabled even if the network probe fails.";
  }
  if (effective === "online") {
    return "Auto — connected. Internet features are available.";
  }
  return "Auto — no internet detected. Web search is unavailable.";
}
