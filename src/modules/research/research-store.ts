import { create } from "zustand";
import type {
  ResearchRun,
  ResearchRunWithRelations,
  ResearchStep,
  ResearchSource,
  ResearchEvidence,
  ResearchClaim,
  ResearchContradiction,
  ResearchReport,
  CreateResearchRunInput,
  UpdateResearchRunInput,
  CreateResearchStepInput,
  UpdateResearchStepInput,
  CreateResearchSourceInput,
  UpdateResearchSourceInput,
  CreateResearchEvidenceInput,
  CreateResearchClaimInput,
  UpdateResearchClaimInput,
  CreateResearchContradictionInput,
  CreateResearchReportInput,
  UpdateResearchReportInput,
} from "./research-types";
import {
  createResearchRun as apiCreateRun,
  getResearchRun as apiGetRun,
  updateResearchRun as apiUpdateRun,
  listResearchRuns as apiListRuns,
  deleteResearchRun as apiDeleteRun,
  createResearchStep as apiCreateStep,
  updateResearchStep as apiUpdateStep,
  createResearchSource as apiCreateSource,
  updateResearchSource as apiUpdateSource,
  createResearchEvidence as apiCreateEvidence,
  createResearchClaim as apiCreateClaim,
  updateResearchClaim as apiUpdateClaim,
  createResearchContradiction as apiCreateContradiction,
  createResearchReport as apiCreateReport,
  updateResearchReport as apiUpdateReport,
} from "./research-storage";

type ResearchStore = {
  runs: ResearchRun[];
  activeRunId: string | null;
  activeRun: ResearchRunWithRelations | null;
  isLoading: boolean;
  error: string | null;
  hydrationState: "loading" | "ready";

  // Hydration
  hydrateRuns: () => Promise<void>;

  // Selection
  setActiveRunId: (id: string | null) => void;
  clearActiveRun: () => void;

  // CRUD
  createRun: (input: CreateResearchRunInput) => Promise<ResearchRun>;
  updateRun: (input: UpdateResearchRunInput) => Promise<ResearchRun>;
  deleteRun: (id: string) => Promise<void>;
  loadRun: (id: string) => Promise<void>;

  // Steps
  createStep: (input: CreateResearchStepInput) => Promise<ResearchStep>;
  updateStep: (input: UpdateResearchStepInput) => Promise<ResearchStep>;

  // Sources
  createSource: (input: CreateResearchSourceInput) => Promise<ResearchSource>;
  updateSource: (input: UpdateResearchSourceInput) => Promise<ResearchSource>;

  // Evidence
  createEvidence: (input: CreateResearchEvidenceInput) => Promise<ResearchEvidence>;

  // Claims
  createClaim: (input: CreateResearchClaimInput) => Promise<ResearchClaim>;
  updateClaim: (input: UpdateResearchClaimInput) => Promise<ResearchClaim>;

  // Contradictions
  createContradiction: (input: CreateResearchContradictionInput) => Promise<ResearchContradiction>;

  // Reports
  createReport: (input: CreateResearchReportInput) => Promise<ResearchReport>;
  updateReport: (input: UpdateResearchReportInput) => Promise<ResearchReport>;

  // Derived
  getRunById: (id: string) => ResearchRun | undefined;
  activeRunOrNull: () => ResearchRunWithRelations | null;
};

let hydrationPromise: Promise<void> | null = null;

export const useResearchStore = create<ResearchStore>((set, get) => ({
  runs: [],
  activeRunId: null,
  activeRun: null,
  isLoading: false,
  error: null,
  hydrationState: "loading",

  hydrateRuns: async () => {
    if (get().hydrationState === "ready") return;
    hydrationPromise ??= (async () => {
      try {
        const runs = await apiListRuns();
        set({ runs, hydrationState: "ready" });
      } catch (error) {
        set({ error: String(error), hydrationState: "ready" });
      }
    })().finally(() => {
      hydrationPromise = null;
    });
    await hydrationPromise;
  },

  setActiveRunId: (id) => {
    set({ activeRunId: id, activeRun: null });
  },

  clearActiveRun: () => {
    set({ activeRunId: null, activeRun: null });
  },

  createRun: async (input) => {
    try {
      const run = await apiCreateRun(input);
      set((state) => ({
        runs: [run, ...state.runs],
        activeRunId: run.id,
      }));
      return run;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateRun: async (input) => {
    try {
      const run = await apiUpdateRun(input);
      set((state) => {
        const runs = state.runs.map((r) => (r.id === run.id ? run : r));
        const activeRun = state.activeRun && state.activeRun.run.id === run.id
          ? { ...state.activeRun, run }
          : state.activeRun;
        return { runs, activeRun };
      });
      return run;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deleteRun: async (id) => {
    try {
      await apiDeleteRun(id);
      set((state) => ({
        runs: state.runs.filter((r) => r.id !== id),
        activeRunId: state.activeRunId === id ? null : state.activeRunId,
        activeRun: state.activeRun?.run.id === id ? null : state.activeRun,
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  loadRun: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const run = await apiGetRun(id);
      set({ activeRun: run, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createStep: async (input) => {
    try {
      const step = await apiCreateStep(input);
      set((state) => {
        if (!state.activeRun || state.activeRun.run.id !== input.runId) return state;
        return {
          activeRun: {
            ...state.activeRun,
            steps: [...state.activeRun.steps, step],
          },
        };
      });
      return step;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateStep: async (input) => {
    try {
      const step = await apiUpdateStep(input);
      set((state) => {
        if (!state.activeRun) return state;
        return {
          activeRun: {
            ...state.activeRun,
            steps: state.activeRun.steps.map((s) => (s.id === step.id ? step : s)),
          },
        };
      });
      return step;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  createSource: async (input) => {
    try {
      const source = await apiCreateSource(input);
      set((state) => {
        if (!state.activeRun || state.activeRun.run.id !== input.runId) return state;
        return {
          activeRun: {
            ...state.activeRun,
            sources: [...state.activeRun.sources, source],
          },
        };
      });
      return source;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateSource: async (input) => {
    try {
      const source = await apiUpdateSource(input);
      set((state) => {
        if (!state.activeRun) return state;
        return {
          activeRun: {
            ...state.activeRun,
            sources: state.activeRun.sources.map((s) => (s.id === source.id ? source : s)),
          },
        };
      });
      return source;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  createEvidence: async (input) => {
    try {
      const evidence = await apiCreateEvidence(input);
      set((state) => {
        if (!state.activeRun || state.activeRun.run.id !== input.runId) return state;
        return {
          activeRun: {
            ...state.activeRun,
            evidence: [...state.activeRun.evidence, evidence],
          },
        };
      });
      return evidence;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  createClaim: async (input) => {
    try {
      const claim = await apiCreateClaim(input);
      set((state) => {
        if (!state.activeRun || state.activeRun.run.id !== input.runId) return state;
        return {
          activeRun: {
            ...state.activeRun,
            claims: [...state.activeRun.claims, claim],
          },
        };
      });
      return claim;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateClaim: async (input) => {
    try {
      const claim = await apiUpdateClaim(input);
      set((state) => {
        if (!state.activeRun) return state;
        return {
          activeRun: {
            ...state.activeRun,
            claims: state.activeRun.claims.map((c) => (c.id === claim.id ? claim : c)),
          },
        };
      });
      return claim;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  createContradiction: async (input) => {
    try {
      const contradiction = await apiCreateContradiction(input);
      set((state) => {
        if (!state.activeRun || state.activeRun.run.id !== input.runId) return state;
        return {
          activeRun: {
            ...state.activeRun,
            contradictions: [...state.activeRun.contradictions, contradiction],
          },
        };
      });
      return contradiction;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  createReport: async (input) => {
    try {
      const report = await apiCreateReport(input);
      set((state) => {
        if (!state.activeRun || state.activeRun.run.id !== input.runId) return state;
        return {
          activeRun: {
            ...state.activeRun,
            report,
          },
        };
      });
      return report;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateReport: async (input) => {
    try {
      const report = await apiUpdateReport(input);
      set((state) => {
        if (!state.activeRun || state.activeRun.report?.id !== report.id) return state;
        return {
          activeRun: {
            ...state.activeRun,
            report,
          },
        };
      });
      return report;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  getRunById: (id) => {
    return get().runs.find((r) => r.id === id);
  },

  activeRunOrNull: () => {
    return get().activeRun;
  },
}));
