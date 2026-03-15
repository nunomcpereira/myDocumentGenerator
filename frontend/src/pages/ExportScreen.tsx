import { Download, FileOutput, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

import { buildExportDownloadUrl, buildSessionFileUrl, exportDocuments, listExportFiles } from "../api/client";
import type { GeneratedExportFile, SessionSnapshot } from "../lib/types";

export const defaultLanguages = ["English", "Spanish", "French", "German", "Portuguese"];

type ExportScreenProps = {
  snapshot: SessionSnapshot;
  selectedLanguages: string[];
  onLanguagesChange: (languages: string[]) => void;
  outputFileName: string;
  onOutputFileNameChange: (value: string) => void;
};

export function ExportScreen({
  snapshot,
  selectedLanguages,
  onLanguagesChange,
  outputFileName,
  onOutputFileNameChange,
}: ExportScreenProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveReady, setArchiveReady] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedExportFile[]>([]);

  if (!snapshot.sessionId) {
    return <Navigate to="/" replace />;
  }

  const downloadUrl = useMemo(() => buildExportDownloadUrl(snapshot.sessionId!), [snapshot.sessionId]);
  const effectiveOutputFileName = outputFileName.trim() || "localized-specification";

  useEffect(() => {
    let cancelled = false;

    async function loadExistingExportFiles() {
      try {
        const files = await listExportFiles(snapshot.sessionId!);
        if (cancelled) {
          return;
        }
        setGeneratedFiles(files);
        setArchiveReady(files.length > 0);
      } catch {
        if (!cancelled) {
          setGeneratedFiles([]);
          setArchiveReady(false);
        }
      }
    }

    void loadExistingExportFiles();

    return () => {
      cancelled = true;
    };
  }, [snapshot.sessionId]);

  function toggleLanguage(language: string) {
    const nextLanguages = selectedLanguages.includes(language)
      ? selectedLanguages.filter((item) => item !== language)
      : [...selectedLanguages, language];
    onLanguagesChange(nextLanguages);
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const response = await exportDocuments(snapshot.sessionId!, selectedLanguages, effectiveOutputFileName, snapshot.mcpServers);
      setGeneratedFiles(response.generated_documents);
      setArchiveReady(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <section className="panel-surface rounded-[2rem] border border-white/60 bg-white/75 p-8 shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.24em] text-steel">Phase 3</p>
        <h1 className="mt-3 font-serif text-4xl text-ink">Structural translation and localized export</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-steel">
          Select the target languages, then generate localized .docx files. The backend preserves the original template layout and packages the generated documents in a ZIP archive.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          {defaultLanguages.map((language) => {
            const active = selectedLanguages.includes(language);
            return (
              <button
                key={language}
                type="button"
                onClick={() => toggleLanguage(language)}
                className={[
                  "selection-chip rounded-full border px-4 py-2 text-sm font-medium transition",
                  active ? "selection-chip-active border-ink bg-ink text-sand" : "selection-chip-inactive border-stone-300 bg-white text-ink hover:border-ember",
                ].join(" ")}
                aria-pressed={active}
              >
                {language}
              </button>
            );
          })}
        </div>

        <label className="mt-8 block">
          <span className="text-xs uppercase tracking-[0.24em] text-steel">Output filename</span>
          <input
            type="text"
            value={outputFileName}
            onChange={(event) => onOutputFileNameChange(event.target.value)}
            placeholder="localized-specification"
            className="mt-3 w-full rounded-3xl border border-stone-300 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ember"
          />
        </label>

        <button
          type="button"
          onClick={handleExport}
          disabled={busy || selectedLanguages.length === 0}
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-moss px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#2f493b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileOutput className="h-4 w-4" />}
          Generate localized archive
        </button>

        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      </section>

      <section className="panel-surface rounded-[2rem] border border-white/60 bg-[#11131a] p-8 text-sand shadow-panel">
        <p className="text-xs uppercase tracking-[0.24em] text-sand/60">Artifacts</p>
        <h2 className="mt-3 font-serif text-3xl">Export package</h2>
        <div className="mt-6 space-y-4 text-sm leading-7 text-sand/80">
          <p>{snapshot.template?.file_name}</p>
          <p>{effectiveOutputFileName}.zip</p>
          <p>{selectedLanguages.length} target languages selected</p>
          <p>{generatedFiles.length} localized files generated</p>
        </div>

        {busy ? (
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-sand/80">
            <div className="flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span>Generating translations and rebuilding the archive. Existing artifacts stay visible until the new export is ready.</span>
            </div>
          </div>
        ) : null}

        {archiveReady ? <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-2 rounded-full bg-sand px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
          >
            <Download className="h-4 w-4" />
            Download ZIP archive
          </a>
        </div> : null}

        {generatedFiles.length > 0 ? (
          <div className="mt-6 rounded-3xl bg-white/5 p-4 text-sm text-sand/80">
            <p className="text-xs uppercase tracking-[0.24em] text-sand/60">Individual files</p>
            <div className="mt-4 space-y-3">
              {generatedFiles.map((file) => (
                <a
                  key={file.file_name}
                  href={buildSessionFileUrl(file.download_path)}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-sand transition hover:bg-white/10"
                >
                  <span>{file.language}</span>
                  <span className="text-sand/60">{file.file_name}</span>
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}