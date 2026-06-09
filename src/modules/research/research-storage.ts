import { invoke } from "@tauri-apps/api/core";
import type {
  ResearchRun,
  ResearchRunWithRelations,
  ResearchStep,
  ResearchSource,
  ResearchEvidence,
  ResearchClaim,
  ResearchContradiction,
  ResearchReport,
  ListResearchRunsFilter,
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

export async function createResearchRun(input: CreateResearchRunInput): Promise<ResearchRun> {
  return invoke<ResearchRun>("create_research_run", { input: JSON.stringify(input) });
}

export async function getResearchRun(id: string): Promise<ResearchRunWithRelations> {
  return invoke<ResearchRunWithRelations>("get_research_run", { id });
}

export async function updateResearchRun(input: UpdateResearchRunInput): Promise<ResearchRun> {
  return invoke<ResearchRun>("update_research_run", { input: JSON.stringify(input) });
}

export async function listResearchRuns(filter?: ListResearchRunsFilter): Promise<ResearchRun[]> {
  return invoke<ResearchRun[]>("list_research_runs", { filter: filter ? JSON.stringify(filter) : "" });
}

export async function deleteResearchRun(id: string): Promise<void> {
  await invoke<void>("delete_research_run", { id });
}

export async function createResearchStep(input: CreateResearchStepInput): Promise<ResearchStep> {
  return invoke<ResearchStep>("create_research_step", { input: JSON.stringify(input) });
}

export async function updateResearchStep(input: UpdateResearchStepInput): Promise<ResearchStep> {
  return invoke<ResearchStep>("update_research_step", { input: JSON.stringify(input) });
}

export async function createResearchSource(input: CreateResearchSourceInput): Promise<ResearchSource> {
  return invoke<ResearchSource>("create_research_source", { input: JSON.stringify(input) });
}

export async function updateResearchSource(input: UpdateResearchSourceInput): Promise<ResearchSource> {
  return invoke<ResearchSource>("update_research_source", { input: JSON.stringify(input) });
}

export async function createResearchEvidence(input: CreateResearchEvidenceInput): Promise<ResearchEvidence> {
  return invoke<ResearchEvidence>("create_research_evidence", { input: JSON.stringify(input) });
}

export async function createResearchClaim(input: CreateResearchClaimInput): Promise<ResearchClaim> {
  return invoke<ResearchClaim>("create_research_claim", { input: JSON.stringify(input) });
}

export async function updateResearchClaim(input: UpdateResearchClaimInput): Promise<ResearchClaim> {
  return invoke<ResearchClaim>("update_research_claim", { input: JSON.stringify(input) });
}

export async function createResearchContradiction(input: CreateResearchContradictionInput): Promise<ResearchContradiction> {
  return invoke<ResearchContradiction>("create_research_contradiction", { input: JSON.stringify(input) });
}

export async function createResearchReport(input: CreateResearchReportInput): Promise<ResearchReport> {
  return invoke<ResearchReport>("create_research_report", { input: JSON.stringify(input) });
}

export async function updateResearchReport(input: UpdateResearchReportInput): Promise<ResearchReport> {
  return invoke<ResearchReport>("update_research_report", { input: JSON.stringify(input) });
}

export async function fetchResearchSource(
  url: string,
): Promise<{
  url: string;
  title: string;
  contentType: string;
  textContent: string;
  statusCode: number;
  fetchError?: string;
  fetchedAt: string;
}> {
  return invoke("fetch_research_source", { url });
}

export async function fetchResearchSourcesBulk(
  urls: string[],
): Promise<
  Array<{
    url: string;
    source?: {
      url: string;
      title: string;
      contentType: string;
      textContent: string;
      statusCode: number;
      fetchError?: string;
      fetchedAt: string;
    };
    error?: string;
  }>
> {
  return invoke("fetch_research_sources_bulk", { urls });
}

export async function updateResearchSourceAfterFetch(
  sourceId: string,
  fetched: {
    url: string;
    title: string;
    contentType: string;
    textContent: string;
    statusCode: number;
    fetchError?: string;
    fetchedAt: string;
  },
): Promise<ResearchSource> {
  return invoke<ResearchSource>("update_research_source_after_fetch", { sourceId, fetched });
}
