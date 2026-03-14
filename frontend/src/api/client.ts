import type {
  ChatResponse,
  CustomCssResponse,
  ExportResponse,
  GeneratedExportFile,
  IngestResponse,
  LoadScenarioResponse,
  SaveScenarioResponse,
  ScenarioSummary,
  TranslationConfigurationResponse,
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
  existingDocument?: File | null;
  goodExamples: File[];
  badExamples: File[];
}): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append("template", params.template);
  if (params.existingDocument) {
    formData.append("existing_document", params.existingDocument);
  }
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

export async function exportDocuments(sessionId: string, targetLanguages: string[], outputFileName: string): Promise<ExportResponse> {
  const response = await fetch(`${API_BASE_URL}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId, target_languages: targetLanguages, output_file_name: outputFileName }),
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
  outputFileName: string;
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
      output_file_name: params.outputFileName,
    }),
  });
  return handleResponse<SaveScenarioResponse>(response);
}

export async function getTranslationConfiguration(): Promise<TranslationConfigurationResponse> {
  const response = await fetch(`${API_BASE_URL}/config/translation`);
  return handleResponse<TranslationConfigurationResponse>(response);
}

export async function getCustomCss(): Promise<CustomCssResponse> {
  const response = await fetch(`${API_BASE_URL}/config/custom-css`);
  return handleResponse<CustomCssResponse>(response);
}

export async function uploadCustomCss(file: File): Promise<TranslationConfigurationResponse> {
  const formData = new FormData();
  formData.append("custom_css", file);

  const response = await fetch(`${API_BASE_URL}/config/custom-css`, {
    method: "POST",
    body: formData,
  });
  return handleResponse<TranslationConfigurationResponse>(response);
}

export async function clearCustomCss(): Promise<TranslationConfigurationResponse> {
  const response = await fetch(`${API_BASE_URL}/config/custom-css`, {
    method: "DELETE",
  });
  return handleResponse<TranslationConfigurationResponse>(response);
}

export async function listExportFiles(sessionId: string): Promise<GeneratedExportFile[]> {
  const response = await fetch(`${API_BASE_URL}/export/${sessionId}/files`);
  return handleResponse<GeneratedExportFile[]>(response);
}

export function buildExportDownloadUrl(sessionId: string): string {
  return `${API_BASE_URL}/export/${sessionId}/download`;
}

export function buildExportFileDownloadUrl(sessionId: string, fileName: string): string {
  return `${API_BASE_URL}/export/${sessionId}/files/${encodeURIComponent(fileName)}`;
}

export function buildSessionFileUrl(downloadPath: string): string {
  return `${API_BASE_URL}${downloadPath}`;
}