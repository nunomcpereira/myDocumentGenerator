import type {
  ChatResponse,
  CustomCssResponse,
  ExportResponse,
  GeneratedExportFile,
  IngestResponse,
  McpServerCatalogResponse,
  LoadScenarioResponse,
  SaveScenarioResponse,
  ScenarioSummary,
  TranslationConfigurationResponse,
} from "../lib/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type RequestOptions = {
  retryOnNetworkError?: number;
};

function isNetworkError(error: unknown): error is TypeError {
  return error instanceof TypeError;
}

function normalizeNetworkError(error: unknown): Error {
  if (!isNetworkError(error)) {
    return error instanceof Error ? error : new Error("Unexpected API failure.");
  }
  return new Error(`Unable to reach the backend at ${API_BASE_URL}. Check that the backend container is running and reachable from the browser.`);
}

async function requestJson<T>(input: string, init?: RequestInit, options: RequestOptions = {}): Promise<T> {
  const attempts = Math.max(1, (options.retryOnNetworkError ?? 0) + 1);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      return await handleResponse<T>(response);
    } catch (error) {
      lastError = error;
      if (!isNetworkError(error) || attempt === attempts) {
        throw normalizeNetworkError(error);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 350));
    }
  }

  throw normalizeNetworkError(lastError);
}

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

export async function sendChatMessage(sessionId: string, message: string, mcpServers: string[]): Promise<ChatResponse> {
  return requestJson<ChatResponse>(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId, message, mcp_servers: mcpServers }),
  });
}

export async function exportDocuments(sessionId: string, targetLanguages: string[], outputFileName: string, exportFormat: "docx" | "pdf", mcpServers: string[]): Promise<ExportResponse> {
  return requestJson<ExportResponse>(`${API_BASE_URL}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId, target_languages: targetLanguages, output_file_name: outputFileName, export_format: exportFormat, mcp_servers: mcpServers }),
  }, { retryOnNetworkError: 1 });
}

export async function listScenarios(): Promise<ScenarioSummary[]> {
  return requestJson<ScenarioSummary[]>(`${API_BASE_URL}/scenarios`);
}

export async function loadScenario(scenarioId: string): Promise<LoadScenarioResponse> {
  return requestJson<LoadScenarioResponse>(`${API_BASE_URL}/scenarios/load`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
}

export async function listMcpServers(): Promise<McpServerCatalogResponse> {
  return requestJson<McpServerCatalogResponse>(`${API_BASE_URL}/mcp/servers`);
}

export async function saveScenario(params: {
  sessionId: string;
  scenarioId: string;
  prompt: string;
  mcpServers: string[];
  targetLanguages: string[];
  outputFileName: string;
}): Promise<SaveScenarioResponse> {
  return requestJson<SaveScenarioResponse>(`${API_BASE_URL}/scenarios/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: params.sessionId,
      scenario_id: params.scenarioId,
      prompt: params.prompt,
      mcp_servers: params.mcpServers,
      target_languages: params.targetLanguages,
      output_file_name: params.outputFileName,
    }),
  });
}

export async function getTranslationConfiguration(): Promise<TranslationConfigurationResponse> {
  return requestJson<TranslationConfigurationResponse>(`${API_BASE_URL}/config/translation`);
}

export async function getCustomCss(): Promise<CustomCssResponse> {
  return requestJson<CustomCssResponse>(`${API_BASE_URL}/config/custom-css`);
}

export async function uploadCustomCss(file: File): Promise<TranslationConfigurationResponse> {
  const formData = new FormData();
  formData.append("custom_css", file);

  return requestJson<TranslationConfigurationResponse>(`${API_BASE_URL}/config/custom-css`, {
    method: "POST",
    body: formData,
  });
}

export async function clearCustomCss(): Promise<TranslationConfigurationResponse> {
  return requestJson<TranslationConfigurationResponse>(`${API_BASE_URL}/config/custom-css`, {
    method: "DELETE",
  });
}

export async function listExportFiles(sessionId: string): Promise<GeneratedExportFile[]> {
  return requestJson<GeneratedExportFile[]>(`${API_BASE_URL}/export/${sessionId}/files`);
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