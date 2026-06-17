import type { ResearchDepth } from "@/modules/research/research-types";

export type ResearchContradictionStrategy = "all_pairs" | "top_k";

export type ResearchDepthProfileId =
  | ResearchDepth
  | "custom";

export interface ResearchProfileOverride {
  // Search & Sources
  maxSearchRounds?: number;
  maxSources?: number;
  maxSourcesPerRound?: number;
  adaptiveDeepening?: boolean;
  minSourceQuality?: number;
  perSourceRead?: boolean;
  /** Direct ArXiv API during search (requires global bundle + ArXiv toggle). */
  directArxivSearch?: boolean;
  /** Direct Wikipedia API during search (requires global bundle + Wikipedia toggle). */
  directWikipediaSearch?: boolean;

  // Validation
  validateConcurrency?: number;
  validateReasoning?: boolean;
  validateBatchSize?: number;
  crossSourceVerify?: boolean;
  verifyBatchSize?: number;
  verifyReasoning?: boolean;
  extractBatchSize?: number;
  contradictionDetect?: boolean;
  contradictionMaxPairs?: number;
  contradictionMinClaims?: number;
  contradictionStrategy?: ResearchContradictionStrategy;
  contradictionTopK?: number;
  contradictionConcurrency?: number;

  // Synthesis & Audit
  synthesisReasoning?: boolean;
  selfCritiquePass?: boolean;
  auditReasoning?: boolean;
  auditMaxCitations?: number;
  auditConcurrency?: number;
  gapAnalysis?: boolean;
  // Report composition
  sectionMaxWords?: number;
  maxSections?: number;

  // Lite-model routing (optional override of (modelId, providerId) for repetitive calls).
  liteModelId?: string;
  liteModelProviderId?: string;
}

export interface ResearchDepthProfile {
  id: ResearchDepthProfileId;
  name: string;
  description: string;
  builtIn: boolean;
  // Baseline values that are merged with the user's per-knob settings.
  baseline: ResearchProfileOverride;
}

export const RESEARCH_DEPTH_PRESETS: Record<ResearchDepth, ResearchDepthProfile> = {
  lightning: {
    id: "lightning",
    name: "Lightning",
    description: "Single-pass blitz. Snippets only — fast answers when you need them now.",
    builtIn: true,
    baseline: {
      maxSearchRounds: 1,
      maxSources: 15,
      maxSourcesPerRound: 15,
      adaptiveDeepening: false,
      minSourceQuality: 2,
      perSourceRead: false,
      directArxivSearch: false,
      directWikipediaSearch: false,
      validateConcurrency: 1,
      validateReasoning: false,
      validateBatchSize: 1,
      crossSourceVerify: false,
      verifyBatchSize: 1,
      verifyReasoning: false,
      extractBatchSize: 1,
      contradictionDetect: false,
      contradictionMaxPairs: 0,
      contradictionMinClaims: 0,
      contradictionStrategy: "top_k",
      contradictionTopK: 10,
      contradictionConcurrency: 2,
      synthesisReasoning: false,
      selfCritiquePass: false,
      auditReasoning: false,
      auditMaxCitations: 0,
      auditConcurrency: 1,
      gapAnalysis: false,
      sectionMaxWords: 300,
      maxSections: 4,
      liteModelId: "",
      liteModelProviderId: "",
    },
  },
  quick: {
    id: "quick",
    name: "Quick",
    description: "Rapid triage across 3 rounds. Lightweight validation keeps it fast without being reckless.",
    builtIn: true,
    baseline: {
      maxSearchRounds: 3,
      maxSources: 35,
      maxSourcesPerRound: 12,
      adaptiveDeepening: false,
      minSourceQuality: 2,
      perSourceRead: true,
      directArxivSearch: false,
      directWikipediaSearch: false,
      validateConcurrency: 5,
      validateReasoning: false,
      validateBatchSize: 3,
      crossSourceVerify: true,
      verifyBatchSize: 15,
      verifyReasoning: false,
      extractBatchSize: 2,
      contradictionDetect: false,
      contradictionMaxPairs: 0,
      contradictionMinClaims: 5,
      contradictionStrategy: "top_k",
      contradictionTopK: 20,
      contradictionConcurrency: 2,
      synthesisReasoning: false,
      selfCritiquePass: false,
      auditReasoning: false,
      auditMaxCitations: 5,
      auditConcurrency: 1,
      gapAnalysis: false,
      sectionMaxWords: 500,
      maxSections: 6,
      liteModelId: "",
      liteModelProviderId: "",
    },
  },
  standard: {
    id: "standard",
    name: "Standard",
    description: "5-round investigation with source validation and cross-source verification. The daily driver.",
    builtIn: true,
    baseline: {
      maxSearchRounds: 5,
      maxSources: 75,
      maxSourcesPerRound: 15,
      adaptiveDeepening: false,
      minSourceQuality: 3,
      perSourceRead: true,
      directArxivSearch: false,
      directWikipediaSearch: true,
      validateConcurrency: 3,
      validateReasoning: false,
      validateBatchSize: 2,
      crossSourceVerify: true,
      verifyBatchSize: 5,
      verifyReasoning: true,
      extractBatchSize: 3,
      contradictionDetect: false,
      contradictionMaxPairs: 0,
      contradictionMinClaims: 5,
      contradictionStrategy: "top_k",
      contradictionTopK: 30,
      contradictionConcurrency: 3,
      synthesisReasoning: true,
      selfCritiquePass: true,
      auditReasoning: true,
      auditMaxCitations: 20,
      auditConcurrency: 3,
      gapAnalysis: true,
      sectionMaxWords: 600,
      maxSections: 7,
      liteModelId: "",
      liteModelProviderId: "",
    },
  },
  deep: {
    id: "deep",
    name: "Deep",
    description: "8-round deep dive. Contradiction hunting, gap analysis, and follow-up searches — no stone unturned.",
    builtIn: true,
    baseline: {
      maxSearchRounds: 8,
      maxSources: 150,
      maxSourcesPerRound: 19,
      adaptiveDeepening: true,
      minSourceQuality: 3,
      perSourceRead: true,
      directArxivSearch: true,
      directWikipediaSearch: true,
      validateConcurrency: 3,
      validateReasoning: false,
      validateBatchSize: 1,
      crossSourceVerify: true,
      verifyBatchSize: 3,
      verifyReasoning: true,
      extractBatchSize: 3,
      contradictionDetect: true,
      contradictionMaxPairs: 200,
      contradictionMinClaims: 5,
      contradictionStrategy: "top_k",
      contradictionTopK: 50,
      contradictionConcurrency: 4,
      synthesisReasoning: true,
      selfCritiquePass: true,
      auditReasoning: true,
      auditMaxCitations: 30,
      auditConcurrency: 3,
      gapAnalysis: true,
      sectionMaxWords: 1000,
      maxSections: 8,
      liteModelId: "",
      liteModelProviderId: "",
    },
  },
  exhaustive: {
    id: "exhaustive",
    name: "Exhaustive",
    description: "10-round research marathon. Maximum source depth, aggressive contradiction detection, and exhaustive gap coverage. Brute force meets rigor.",
    builtIn: true,
    baseline: {
      maxSearchRounds: 10,
      maxSources: 300,
      maxSourcesPerRound: 30,
      adaptiveDeepening: true,
      minSourceQuality: 3,
      perSourceRead: true,
      directArxivSearch: true,
      directWikipediaSearch: true,
      validateConcurrency: 3,
      validateReasoning: false,
      validateBatchSize: 1,
      crossSourceVerify: true,
      verifyBatchSize: 2,
      verifyReasoning: true,
      extractBatchSize: 2,
      contradictionDetect: true,
      contradictionMaxPairs: 500,
      contradictionMinClaims: 5,
      contradictionStrategy: "top_k",
      contradictionTopK: 80,
      contradictionConcurrency: 6,
      synthesisReasoning: true,
      selfCritiquePass: true,
      auditReasoning: true,
      auditMaxCitations: 50,
      auditConcurrency: 3,
      gapAnalysis: true,
      sectionMaxWords: 1500,
      maxSections: 10,
      liteModelId: "",
      liteModelProviderId: "",
    },
  },
};

export interface ResearchConfigState {
  // Active profile id (or "custom" if any knob has been tweaked away from a baseline).
  activeProfileId: ResearchDepthProfileId;
  // Per-knob overrides relative to the baseline. Empty means "use the baseline".
  override: ResearchProfileOverride;
  // Per-depth overrides: lets a user tweak the "standard" preset and have it persist.
  depthOverrides: Partial<Record<ResearchDepth, ResearchProfileOverride>>;
  // Saved custom profiles (user-defined).
  customProfiles: ResearchDepthProfile[];
  // Defaults applied to the New Research dialog.
  defaultDepth: ResearchDepth;
  defaultModelId: string | null;
  // Lite model: when set, the runtime uses this model for the per-source validation,
  // contradiction, and audit phases. The main model is used for planning, extraction,
  // and synthesis. Empty string means "disabled, use the main model for everything".
  liteModelId: string;
  liteModelProviderId: string;
}

export const DEFAULT_RESEARCH_CONFIG: ResearchConfigState = {
  activeProfileId: "standard",
  override: {},
  depthOverrides: {},
  customProfiles: [],
  defaultDepth: "standard",
  defaultModelId: null,
  liteModelId: "",
  liteModelProviderId: "",
};

/**
 * Resolve an effective profile by merging: built-in baseline < depth-specific override < global override.
 * Custom profiles use their own baseline; the global override still applies on top.
 *
 * Returns a fully-resolved object with no undefined values — convenient for the UI and runtime.
 */
export function resolveResearchProfile(
  state: ResearchConfigState,
  profileId: ResearchDepthProfileId,
): Required<ResearchProfileOverride> {
  let baseline: ResearchProfileOverride;
  if (profileId === "custom") {
    const activeId = state.activeProfileId;
    const fallbackDepth: ResearchDepth = activeId === "custom" || activeId === undefined
      ? "standard"
      : (activeId as ResearchDepth);
    baseline = { ...RESEARCH_DEPTH_PRESETS[fallbackDepth].baseline };
  } else {
    baseline = { ...RESEARCH_DEPTH_PRESETS[profileId as ResearchDepth].baseline };
  }

  let depthOverride: ResearchProfileOverride =
    profileId === "custom" ? {} : state.depthOverrides[profileId as ResearchDepth] ?? {};
  let override: ResearchProfileOverride = state.override;

  if ((override.contradictionStrategy as string) === "cluster_sample") {
    override = { ...override, contradictionStrategy: "top_k" };
  }
  if ((depthOverride.contradictionStrategy as string) === "cluster_sample") {
    depthOverride = { ...depthOverride, contradictionStrategy: "top_k" };
  }

  const merged: ResearchProfileOverride = {
    ...baseline,
    ...depthOverride,
    ...override,
  };
  if (import.meta.env.DEV) {
    const requiredKeys: Array<keyof ResearchProfileOverride> = [
      "maxSearchRounds", "maxSources", "maxSourcesPerRound", "adaptiveDeepening",
      "minSourceQuality", "perSourceRead", "directArxivSearch", "directWikipediaSearch",
      "validateConcurrency", "validateReasoning", "validateBatchSize",
      "crossSourceVerify", "verifyBatchSize", "verifyReasoning", "extractBatchSize",
      "contradictionDetect", "contradictionMaxPairs", "contradictionMinClaims",
      "contradictionStrategy", "contradictionTopK", "contradictionConcurrency", "synthesisReasoning", "selfCritiquePass",
      "auditReasoning", "auditMaxCitations", "auditConcurrency", "gapAnalysis",
      "sectionMaxWords", "maxSections", "liteModelId", "liteModelProviderId",
    ];
    const baselineKeys = Object.keys(baseline) as Array<keyof ResearchProfileOverride>;
    const missing = requiredKeys.filter((k) => !baselineKeys.includes(k));
    if (missing.length > 0) {
      console.warn(
        `[research-config] Baseline for "${profileId}" is missing fields: ${missing.join(", ")}. ` +
        `Config drift: expected all keys to be explicitly defined.`,
      );
    }
  }
  return merged as Required<ResearchProfileOverride>;
}

/**
 * Resolve settings for a specific run: preset + saved overrides + optional per-run tweaks.
 * Mirrors `buildDepthConfig` in research-runtime.
 */
export function resolveResearchProfileForRun(
  state: ResearchConfigState,
  depth: ResearchDepth,
  perRunOverride?: ResearchProfileOverride,
): Required<ResearchProfileOverride> {
  const resolved = resolveResearchProfile(state, depth);
  return {
    ...resolved,
    liteModelId: state.liteModelId,
    liteModelProviderId: state.liteModelProviderId,
    ...(perRunOverride ?? {}),
  };
}

export type ResearchConfigSetter =
  | { kind: "setActiveProfile"; id: ResearchDepthProfileId }
  | { kind: "setOverride"; override: ResearchProfileOverride }
  | { kind: "setDepthOverride"; depth: ResearchDepth; override: ResearchProfileOverride }
  | { kind: "addCustomProfile"; profile: ResearchDepthProfile }
  | { kind: "updateCustomProfile"; id: string; profile: Partial<ResearchDepthProfile> }
  | { kind: "deleteCustomProfile"; id: string }
  | { kind: "setDefaultDepth"; depth: ResearchDepth }
  | { kind: "setDefaultModelId"; modelId: string | null }
  | { kind: "setLiteModel"; modelId: string; providerId: string }
  | { kind: "reset" };


export function applyResearchConfig(
  state: ResearchConfigState,
  action: ResearchConfigSetter,
): ResearchConfigState {
  switch (action.kind) {
    case "setActiveProfile":
      return { ...state, activeProfileId: action.id, override: {} };
    case "setOverride":
      return { ...state, override: { ...action.override } };
    case "setDepthOverride":
      return {
        ...state,
        depthOverrides: {
          ...state.depthOverrides,
          [action.depth]: { ...action.override },
        },
      };
    case "addCustomProfile":
      return { ...state, customProfiles: [...state.customProfiles, action.profile] };
    case "updateCustomProfile":
      return {
        ...state,
        customProfiles: state.customProfiles.map((p) =>
          p.id === action.id ? { ...p, ...action.profile } : p,
        ),
      };
    case "deleteCustomProfile":
      return {
        ...state,
        customProfiles: state.customProfiles.filter((p) => p.id !== action.id),
      };
    case "setDefaultDepth":
      return { ...state, defaultDepth: action.depth };
    case "setDefaultModelId":
      return { ...state, defaultModelId: action.modelId };
    case "setLiteModel":
      return { ...state, liteModelId: action.modelId, liteModelProviderId: action.providerId };
    case "reset":
      return { ...DEFAULT_RESEARCH_CONFIG };
  }
}

export function profileFromBaseline(
  id: string,
  name: string,
  description: string,
  baseline: ResearchProfileOverride,
): ResearchDepthProfile {
  // Custom profiles use string ids; cast to the profile id union.
  return { id: id as ResearchDepthProfileId, name, description, builtIn: false, baseline };
}
