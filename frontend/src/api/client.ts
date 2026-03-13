import type {
  ChatResponse,
  ExportResponse,
  IngestResponse,
  LoadScenarioResponse,
  SaveScenarioResponse,
  ScenarioSummary,
} from "../lib/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Unexpected API failure.");
  }
  return (await response.json()) as T;
}

export async function ingestDocuments(params: {
  template: File;
  goodExamples: File[];
  badExamples: File[];
}): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append("template", params.template);
  params.goodExamples.forEach((file) => formData.append("good_examples", file));
  params.badExamples.forEach((file) => formData.append("bad_examples", file));

  const response = await fetch(`${API_BASE_URL}/ingest`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<IngestResponse>(response);
}

export async function sendChatMessage(sessionId: string, message: string): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  return handleResponse<ChatResponse>(response);
}

export async function exportDocuments(sessionId: string, targetLanguages: string[]): Promise<ExportResponse> {
  const response = await fetch(`${API_BASE_URL}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId, target_languages: targetLanguages }),
  });
  return handleResponse<ExportResponse>(response);
}

export async function listScenarios(): Promise<ScenarioSummary[]> {
  const response = await fetch(`${API_BASE_URL}/scenarios`);
  return handleResponse<ScenarioSummary[]>(response);
}

export async function loadScenario(scenarioId: string): Promise<LoadScenarioResponse> {
  const response = await fetch(`${API_BASE_URL}/scenarios/load`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
  return handleResponse<LoadScenarioResponse>(response);
}

export async function saveScenario(params: {
  sessionId: string;
  scenarioId: string;
  prompt: string;
  targetLanguages: string[];
}): Promise<SaveScenarioResponse> {
  const response = await fetch(`${API_BASE_URL}/scenarios/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: params.sessionId,
      scenario_id: params.scenarioId,
      prompt: params.prompt,
      target_languages: params.targetLanguages,
    }),
  });
  return handleResponse<SaveScenarioResponse>(response);
}

export function buildExportDownloadUrl(sessionId: string): string {
  return `${API_BASE_URL}/export/${sessionId}/download`;
}