import { FileArchive, FileText, FileUp, LoaderCircle, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { ingestDocuments } from "../api/client";
import type { SessionSnapshot } from "../lib/types";

type IngestionScreenProps = {
  onInitialized: (snapshot: SessionSnapshot) => void;
};

export function IngestionScreen({ onInitialized }: IngestionScreenProps) {
  const [template, setTemplate] = useState<File | null>(null);
  const [existingDocument, setExistingDocument] = useState<File | null>(null);
  const [goodExamples, setGoodExamples] = useState<File[]>([]);
  const [badExamples, setBadExamples] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!template) {
      setError("Please select a source document to initialize the session.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await ingestDocuments({ template, existingDocument, goodExamples, badExamples });

      onInitialized({
        sessionId: response.session_id,
        scenarioId: "",
        prompt: "",
        promptSequence: [],
        autoApplyPromptOnRefine: false,
        mcpServers: [],
        exportLanguages: ["English", "Spanish", "French"],
        exportFormat: "docx",
        outputFileName: response.output_file_name ?? template.name.replace(/\.[^.]+$/, ""),
        loadedFiles: response.loaded_files,
        template: response.template,
        draftState: response.draft_state,
        previewMarkdown: response.preview_markdown,
        warnings: response.warnings,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to initialize the ingestion session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] animate-fade-in">
      <section className="premium-card p-10 rounded-[2.5rem]">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Phase 1</p>
          </div>
          <h1 className="font-headline text-4xl font-bold text-ink mb-4 tracking-tight">Project Initialization</h1>
          <p className="text-steel leading-relaxed">
            Upload your source template and context documents. Our RAG engine will analyze the structure and style to prepare for high-fidelity generation.
          </p>
        </div>

        <form className="space-y-8" onSubmit={handleSubmit}>
          <div className="space-y-6">
            <div className="relative group">
              <label className="block p-8 rounded-3xl border-2 border-dashed border-ui-outline-soft bg-surface-muted transition-all group-hover:border-primary/30 group-hover:bg-primary/[0.02] cursor-pointer">
                <div className="flex flex-col items-center text-center">
                  <div className="h-14 w-14 rounded-2xl bg-white shadow-premium flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <FileUp className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-sm font-bold text-ink mb-1">Source Template</span>
                  <span className="text-xs text-steel-muted mb-4">DOCX, PDF, MD, or TXT</span>
                  <input
                    type="file"
                    accept=".doc,.docx,.pdf,.md,.txt,.html,.htm,.csv,.xlsx,.xls,.pptx,.png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.webp,.ipynb,.epub,.zip,.msg"
                    onChange={(event) => setTemplate(event.target.files?.[0] ?? null)}
                    className="block w-full text-xs text-steel file:hidden"
                  />
                  {template && (
                    <div className="mt-4 px-4 py-2 bg-success/10 text-success rounded-xl text-xs font-bold animate-scale-in">
                      Selected: {template.name}
                    </div>
                  )}
                </div>
              </label>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <label className="block p-6 rounded-3xl border border-ui-outline-soft bg-white shadow-sm hover:shadow-premium transition-shadow">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-ink block">Seed Document</span>
                      <span className="text-[10px] text-steel-muted">Optional: Existing draft</span>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept=".docx,.pdf,.md,.txt"
                    onChange={(event) => setExistingDocument(event.target.files?.[0] ?? null)}
                    className="block w-full text-xs text-steel-muted file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  />
                </label>
              </div>

              <div className="space-y-4">
                <div className="p-6 rounded-3xl border border-ui-outline-soft bg-white shadow-sm">
                  <span className="text-sm font-bold text-ink block mb-4">Training Context</span>
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-success mb-2 block">Approved Examples</span>
                      <input
                        type="file"
                        multiple
                        accept=".docx,.pdf,.md,.txt"
                        onChange={(event) => setGoodExamples(Array.from(event.target.files ?? []))}
                        className="block w-full text-xs text-steel-muted"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-danger mb-2 block">Rejected Examples</span>
                      <input
                        type="file"
                        multiple
                        accept=".docx,.pdf,.md,.txt"
                        onChange={(event) => setBadExamples(Array.from(event.target.files ?? []))}
                        className="block w-full text-xs text-steel-muted"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="flex items-center gap-3 rounded-2xl bg-danger/10 px-5 py-4 text-sm text-danger animate-slide-up">
              <ShieldAlert className="h-5 w-5" />
              <span className="font-medium">{error}</span>
            </div>
          ) : null}

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={busy || !template}
              className="btn-primary min-w-[200px] flex items-center justify-center gap-3"
            >
              {busy ? (
                <>
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <FileArchive className="h-5 w-5" />
                  <span>Initialize Session</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      <section className="premium-card p-10 rounded-[2.5rem] bg-slate-900 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-10">
          <FileArchive className="h-64 w-64 -mr-20 -mt-20" />
        </div>
        
        <div className="relative z-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mb-6">Workflow Intelligence</p>
          <h2 className="font-headline text-3xl font-bold mb-8 leading-tight">Orchestrated Document Engineering</h2>
          
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary text-xs font-bold">1</div>
              <div>
                <h3 className="font-bold text-lg mb-1">RAG Contextualization</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Multi-stage parsing of template structure and style vectors for precise content generation.</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0 text-accent text-xs font-bold">2</div>
              <div>
                <h3 className="font-bold text-lg mb-1">Agentic Refinement</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Interactive interview loop that hydrates the draft using your specific domain knowledge.</p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center shrink-0 text-success text-xs font-bold">3</div>
              <div>
                <h3 className="font-bold text-lg mb-1">Structural Localization</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Zero-loss translation that preserves your original formatting while adapting terminology.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}