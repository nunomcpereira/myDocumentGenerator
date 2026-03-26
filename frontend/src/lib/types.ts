export type TemplateSection = {
  id: string;
  title: string;
  level: number;
  prompt_hint?: string | null;
  source_excerpt?: string | null;
  content_paragraph_indices: number[];
};

export type TemplateStructure = {
  file_name: string;
  file_type: "docx" | "pdf";
  sections: TemplateSection[];
  extracted_outline: string[];
};

export type LoadedFileReference = {
  kind: "template" | "enhancement_document" | "good_example" | "bad_example";
  file_name: string;
  download_path: string;
};

export type DraftSectionState = {
  section_id: string;
  title: string;
  content: string;
  status: "missing" | "in_progress" | "complete";
  last_updated_at?: string | null;
};

export type DocumentDraftState = {
  session_id: string;
  sections: DraftSectionState[];
  summary?: string | null;
  updated_at: string;
};

export type IngestResponse = {
  session_id: string;
  template: TemplateStructure;
  draft_state: DocumentDraftState;
  preview_markdown: string;
  loaded_files: LoadedFileReference[];
  output_file_name?: string | null;
  warnings: string[];
};

export type ChatResponse = {
  session_id: string;
  assistant_message: string;
  draft_state: DocumentDraftState;
  preview_markdown: string;
  prompt?: string | null;
  prompt_sequence: string[];
  next_required_sections: string[];
  warnings: string[];
  llm_available: boolean;
};

export type ExportResponse = {
  session_id: string;
  archive_path: string;
  generated_files: string[];
  generated_documents: GeneratedExportFile[];
  export_format: "docx" | "pdf";
  output_file_name?: string | null;
  warnings: string[];
};

export type GeneratedExportFile = {
  language: string;
  format: "docx" | "pdf";
  file_name: string;
  download_path: string;
};

export type TranslationProviderId = "llm" | "azure" | "google";

export type TranslationProviderOption = {
  id: TranslationProviderId;
  label: string;
  description: string;
  configured: boolean;
  required_env: string[];
};

export type CustomCssConfiguration = {
  enabled: boolean;
  file_name?: string | null;
  updated_at?: string | null;
};

export type TranslationConfigurationResponse = {
  active_provider: TranslationProviderId;
  options: TranslationProviderOption[];
  custom_css: CustomCssConfiguration;
  source: string;
  restart_required: boolean;
};

export type CustomCssResponse = CustomCssConfiguration & {
  css_text?: string | null;
};

export type ScenarioSummary = {
  scenario_id: string;
  template_file_name?: string | null;
  prompt?: string | null;
  prompt_sequence: string[];
  mcp_servers: string[];
  target_languages: string[];
  output_file_name?: string | null;
  updated_at: string;
};

export type SaveScenarioResponse = {
  scenario_id: string;
  session_id: string;
  prompt?: string | null;
  prompt_sequence: string[];
  mcp_servers: string[];
  target_languages: string[];
  output_file_name?: string | null;
  updated_at: string;
};

export type LoadScenarioResponse = {
  scenario_id: string;
  session_id: string;
  template: TemplateStructure;
  draft_state: DocumentDraftState;
  preview_markdown: string;
  warnings: string[];
  prompt?: string | null;
  prompt_sequence: string[];
  mcp_servers: string[];
  target_languages: string[];
  loaded_files: LoadedFileReference[];
  output_file_name?: string | null;
};

export type McpServerSummary = {
  name: string;
  description?: string | null;
  oauth?: string | null;
  secrets?: string | null;
  config?: string | null;
};

export type McpServerCatalogResponse = {
  available: boolean;
  source: string;
  detail?: string | null;
  servers: McpServerSummary[];
};

export type SessionSnapshot = {
  sessionId: string | null;
  scenarioId: string;
  prompt: string;
  promptSequence: string[];
  autoApplyPromptOnRefine: boolean;
  mcpServers: string[];
  exportLanguages: string[];
  exportFormat: "docx" | "pdf";
  outputFileName: string;
  loadedFiles: LoadedFileReference[];
  template?: TemplateStructure;
  draftState?: DocumentDraftState;
  previewMarkdown: string;
  warnings: string[];
};

export type ChatMessage = {
  role: "assistant" | "user" | "system";
  content: string;
};