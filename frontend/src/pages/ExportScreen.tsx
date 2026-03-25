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
  exportFormat: "docx" | "pdf";
  onExportFormatChange: (format: "docx" | "pdf") => void;
  outputFileName: string;
  onOutputFileNameChange: (value: string) => void;
};

export function ExportScreen({
  snapshot,
  selectedLanguages,
  onLanguagesChange,
  exportFormat,
  onExportFormatChange,
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
  const hasGeneratedArtifacts = archiveReady || generatedFiles.length > 0;

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
      const response = await exportDocuments(snapshot.sessionId!, selectedLanguages, effectiveOutputFileName, exportFormat, snapshot.mcpServers);
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
          Select the target languages and export format, then generate localized files. The backend preserves the original template layout and packages the generated documents in a ZIP archive.
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

        <div className="mt-8">
          <p className="text-xs uppercase tracking-[0.24em] text-steel">Export format</p>
          <div className="mt-3 inline-flex rounded-full border border-stone-300 bg-white p-1 shadow-sm">
            {[
              { id: "docx", label: "DOCX" },
              { id: "pdf", label: "PDF" },
            ].map((option) => {
              const active = exportFormat === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onExportFormatChange(option.id as "docx" | "pdf")}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    active ? "bg-ink text-sand" : "text-steel hover:text-ink",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
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

      <section className="panel-surface relative overflow-hidden rounded-[2rem] border border-white/60 bg-[#11131a] p-8 text-sand shadow-panel">
        <p className="text-xs uppercase tracking-[0.24em] text-sand/60">Artifacts</p>
        <h2 className="mt-3 font-serif text-3xl">Export package</h2>
        <div className="mt-6 space-y-4 text-sm leading-7 text-sand/80">
          <p>{snapshot.template?.file_name}</p>
          <p>{effectiveOutputFileName}.zip</p>
          <p>{exportFormat.toUpperCase()} output selected</p>
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

        <div className="mt-8 min-h-[3.5rem] flex flex-wrap gap-3">
          {archiveReady ? (
            <a
              href={downloadUrl}
              className="inline-flex items-center gap-2 rounded-full bg-sand px-5 py-3 text-sm font-semibold text-ink transition hover:bg-white"
            >
              <Download className="h-4 w-4" />
              Download ZIP archive
            </a>
          ) : (
            <div className="flex items-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm text-sand/60">
              ZIP archive will appear here when export finishes.
            </div>
          )}
        </div>

        <div className="mt-6 min-h-[13rem] rounded-3xl bg-white/5 p-4 text-sm text-sand/80">
          <p className="text-xs uppercase tracking-[0.24em] text-sand/60">Individual files</p>
          {hasGeneratedArtifacts ? (
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
          ) : (
            <div className="mt-4 flex min-h-[9rem] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 text-center text-sand/60">
              Generated localized documents will stay listed here once the export completes.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}