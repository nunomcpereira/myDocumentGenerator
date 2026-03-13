import { FileArchive, FileUp, LoaderCircle, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { ingestDocuments } from "../api/client";
import type { SessionSnapshot } from "../lib/types";

type IngestionScreenProps = {
  onInitialized: (snapshot: SessionSnapshot) => void;
};

export function IngestionScreen({ onInitialized }: IngestionScreenProps) {
  const [template, setTemplate] = useState<File | null>(null);
  const [goodExamples, setGoodExamples] = useState<File[]>([]);
  const [badExamples, setBadExamples] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!template) {
      setError("Select a .docx or .pdf template before initializing the session.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await ingestDocuments({ template, goodExamples, badExamples });
      const previewMarkdown = response.draft_state.sections
        .map((section) => `## ${section.title}\n\n${section.content || "_Pending input_"}`)
        .join("\n\n");

      onInitialized({
        sessionId: response.session_id,
        scenarioId: "",
        prompt: "",
        exportLanguages: ["English", "Spanish", "French"],
        outputFileName: response.output_file_name ?? template.name.replace(/\.[^.]+$/, ""),
        loadedFiles: response.loaded_files,
        template: response.template,
        draftState: response.draft_state,
        previewMarkdown: `# ${response.template.file_name}\n\n${previewMarkdown}`,
        warnings: response.warnings,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to initialize the ingestion session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[2rem] border border-white/60 bg-white/75 p-8 shadow-panel backdrop-blur">
        <div className="mb-6 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.24em] text-steel">Phase 1</p>
          <h1 className="font-serif text-4xl text-ink">Initialize ingestion and local retrieval context</h1>
          <p className="mt-3 text-sm leading-7 text-steel">
            Upload the source template, then optionally add approved and rejected examples. The backend parses the document structure and builds the RAG context used by the analyst and translation pipeline.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <label className="block rounded-3xl border border-dashed border-stone-300 bg-sand/70 p-5">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <FileUp className="h-4 w-4" />
              Template (.docx or .pdf)
            </span>
            <input
              type="file"
              accept=".docx,.pdf"
              onChange={(event) => setTemplate(event.target.files?.[0] ?? null)}
              className="mt-2 block text-sm text-steel"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block rounded-3xl border border-stone-200 bg-white p-5">
              <span className="text-sm font-semibold text-ink">Good examples</span>
              <p className="mt-1 text-xs leading-6 text-steel">Used for tone, structure, and few-shot prompting.</p>
              <input
                type="file"
                multiple
                accept=".docx,.pdf,.md,.txt"
                onChange={(event) => setGoodExamples(Array.from(event.target.files ?? []))}
                className="mt-3 block text-sm text-steel"
              />
            </label>

            <label className="block rounded-3xl border border-stone-200 bg-white p-5">
              <span className="text-sm font-semibold text-ink">Bad examples</span>
              <p className="mt-1 text-xs leading-6 text-steel">Used to derive explicit negative constraints.</p>
              <input
                type="file"
                multiple
                accept=".docx,.pdf,.md,.txt"
                onChange={(event) => setBadExamples(Array.from(event.target.files ?? []))}
                className="mt-3 block text-sm text-steel"
              />
            </label>
          </div>

          {error ? (
            <div className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <ShieldAlert className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-sand transition hover:bg-[#1e2230] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
            Initialize session
          </button>
        </form>
      </section>

      <section className="rounded-[2rem] border border-white/60 bg-[#1d241f] p-8 text-sand shadow-panel">
        <p className="text-xs uppercase tracking-[0.24em] text-sand/60">API-first workflow</p>
        <h2 className="mt-3 font-serif text-3xl">Backend-first orchestration</h2>
        <div className="mt-6 space-y-4 text-sm leading-7 text-sand/80">
          <p><strong>Ingest:</strong> parse template structure, save examples, initialize session state.</p>
          <p><strong>Chat:</strong> update the draft state via an interviewing analyst prompt and retrieval context.</p>
          <p><strong>Export:</strong> translate structured content, then inject it into the original .docx layout.</p>
        </div>
      </section>
    </div>
  );
}