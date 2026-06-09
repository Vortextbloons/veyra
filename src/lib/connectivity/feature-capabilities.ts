import type {
  ConnectivityRequirement,
  EffectiveConnectivity,
} from "@/lib/connectivity/connectivity-types";

export const FEATURE_CAPABILITIES = {
  chat: { requirement: "local_service" as const, label: "Chat" },
  memory: { requirement: "none" as const, label: "Memory" },
  documents: { requirement: "none" as const, label: "Documents" },
  webSearch: { requirement: "internet" as const, label: "Web Search" },
  backgroundJobs: { requirement: "local_service" as const, label: "Background AI" },
  agents: { requirement: "local_service" as const, label: "Agents" },
  cloudProvider: { requirement: "internet" as const, label: "Cloud models" },
} as const;

export type FeatureKey = keyof typeof FEATURE_CAPABILITIES;

export type FeatureAvailability = {
  available: boolean;
  reason?: string;
};

function requirementMet(
  requirement: ConnectivityRequirement,
  effective: EffectiveConnectivity,
  localServiceReady: boolean,
): boolean {
  switch (requirement) {
    case "none":
      return true;
    case "local_service":
      return localServiceReady;
    case "internet":
      return effective === "online";
    default:
      return false;
  }
}

export function isFeatureAvailable(
  feature: FeatureKey,
  effective: EffectiveConnectivity,
  localServiceReady: boolean,
): FeatureAvailability {
  const { requirement, label } = FEATURE_CAPABILITIES[feature];

  if (requirement === "internet" && effective === "offline") {
    return {
      available: false,
      reason: `${label} is unavailable in Offline mode.`,
    };
  }

  if (requirement === "local_service" && !localServiceReady) {
    return {
      available: false,
      reason: `${label} requires LM Studio to be connected.`,
    };
  }

  if (!requirementMet(requirement, effective, localServiceReady)) {
    return { available: false, reason: `${label} is currently unavailable.` };
  }

  return { available: true };
}

export function listFeatureAvailability(
  effective: EffectiveConnectivity,
  localServiceReady: boolean,
): Array<{ feature: FeatureKey; label: string; available: boolean; reason?: string }> {
  return (Object.keys(FEATURE_CAPABILITIES) as FeatureKey[]).map((feature) => {
    const { label } = FEATURE_CAPABILITIES[feature];
    const { available, reason } = isFeatureAvailable(feature, effective, localServiceReady);
    return { feature, label, available, reason };
  });
}
