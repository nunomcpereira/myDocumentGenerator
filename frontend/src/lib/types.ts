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
  warnings: string[];
};

export type ChatResponse = {
  session_id: string;
  assistant_message: string;
  draft_state: DocumentDraftState;
  preview_markdown: string;
  next_required_sections: string[];
  warnings: string[];
  llm_available: boolean;
};

export type ExportResponse = {
  session_id: string;
  archive_path: string;
  generated_files: string[];
  warnings: string[];
};

export type SessionSnapshot = {
  sessionId: string | null;
  template?: TemplateStructure;
  draftState?: DocumentDraftState;
  previewMarkdown: string;
  warnings: string[];
};

export type ChatMessage = {
  role: "assistant" | "user" | "system";
  content: string;
};