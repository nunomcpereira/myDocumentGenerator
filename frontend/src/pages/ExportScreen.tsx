import { Download, FileOutput, FileText, Globe2, LoaderCircle } from "lucide-react";
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
  const [statusMessage, setStatusMessage] = useState("No export running.");

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
    if (busy) {
      return;
    }
    const nextLanguages = selectedLanguages.includes(language)
      ? selectedLanguages.filter((item) => item !== language)
      : [...selectedLanguages, language];
    onLanguagesChange(nextLanguages);
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    setStatusMessage(`Generating ${exportFormat.toUpperCase()} files...`);
    try {
      const response = await exportDocuments(snapshot.sessionId!, selectedLanguages, effectiveOutputFileName, exportFormat, snapshot.mcpServers);
      setGeneratedFiles(response.generated_documents);
      setArchiveReady(true);
      setStatusMessage(`Ready. Generated ${response.generated_documents.length} localized documents.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Export failed.";
      setError(message);
      setStatusMessage(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] animate-fade-in">
      <section className="premium-card p-10 rounded-[2.5rem]">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Phase 3</p>
          </div>
          <h1 className="font-headline text-4xl font-bold text-ink mb-4 tracking-tight">Export & Localization</h1>
          <p className="text-steel leading-relaxed">
            Finalize your documentation by selecting target languages and format. Our localization pipeline ensures structural integrity while adapting content for global audiences.
          </p>
        </div>

        <div className="space-y-10">
          <div>
            <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              Target Languages
            </h3>
            <div className="flex flex-wrap gap-2">
              {defaultLanguages.map((language) => {
                const active = selectedLanguages.includes(language);
                return (
                  <button
                    key={language}
                    type="button"
                    onClick={() => toggleLanguage(language)}
                    className={[
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all border",
                      active 
                        ? "bg-primary text-white border-primary shadow-glow" 
                        : "bg-white text-steel-muted border-ui-outline-soft hover:border-primary/30 hover:text-ink hover:bg-surface-muted",
                    ].join(" ")}
                  >
                    {language}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-ink mb-4">Export Format</h3>
              <div className="inline-flex p-1 bg-surface-muted rounded-2xl border border-ui-outline-soft">
                {[
                  { id: "docx", label: "DOCX" },
                  { id: "pdf", label: "PDF" },
                ].map((option) => {
                  const active = exportFormat === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => !busy && onExportFormatChange(option.id as "docx" | "pdf")}
                      className={[
                        "px-6 py-2 rounded-xl text-xs font-bold transition-all",
                        active ? "bg-white text-primary shadow-sm" : "text-steel-muted hover:text-ink",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-ink mb-4">Output Filename</h3>
              <input
                type="text"
                value={outputFileName}
                onChange={(event) => !busy && onOutputFileNameChange(event.target.value)}
                placeholder="localized-specification"
                className="input-standard !py-2 !text-xs font-medium"
              />
            </div>
          </div>

          <div className="pt-6 border-t border-ui-outline-soft">
            <button
              type="button"
              onClick={handleExport}
              disabled={busy || selectedLanguages.length === 0}
              className="btn-primary w-full flex items-center justify-center gap-3 !py-4"
            >
              {busy ? (
                <>
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                  <span>Generating Localization Package...</span>
                </>
              ) : (
                <>
                  <FileOutput className="h-5 w-5" />
                  <span>Generate All Localized Files</span>
                </>
              )}
            </button>
            {error && <p className="mt-4 text-xs font-bold text-danger text-center animate-slide-up">{error}</p>}
          </div>
        </div>
      </section>

      <section className="premium-card p-10 rounded-[2.5rem] bg-slate-900 text-white shadow-2xl flex flex-col relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5">
          <Download className="h-64 w-64 -mr-20 -mt-20" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mb-6">Generated Assets</p>
          <h2 className="font-headline text-3xl font-bold mb-8">Export Package</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Languages</span>
              <span className="text-xl font-bold">{selectedLanguages.length}</span>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Format</span>
              <span className="text-xl font-bold uppercase">{exportFormat}</span>
            </div>
          </div>

          <div className="mb-8 p-6 rounded-3xl bg-primary/10 border border-primary/20 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-sm">
              <div className={[
                "h-2 w-2 rounded-full",
                busy ? "bg-primary animate-pulse" : archiveReady ? "bg-success" : "bg-slate-600"
              ].join(" ")} />
              <span className="font-medium text-slate-300">{statusMessage}</span>
            </div>
          </div>

          {archiveReady && (
            <a
              href={downloadUrl}
              className="btn-primary !bg-white !text-primary hover:!bg-slate-100 mb-8 flex items-center justify-center gap-3 animate-scale-in"
            >
              <Download className="h-5 w-5" />
              Download Localized ZIP Archive
            </a>
          )}

          <div className="flex-1 overflow-hidden flex flex-col min-h-[300px]">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Individual Documents</h4>
            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
              {hasGeneratedArtifacts ? (
                generatedFiles.map((file) => (
                  <a
                    key={file.file_name}
                    href={buildSessionFileUrl(file.download_path)}
                    className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                        <FileText className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold">{file.language}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 truncate max-w-[150px]">{file.file_name}</span>
                  </a>
                ))
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-[2rem] text-slate-600">
                  <FileOutput className="h-12 w-12 mb-4 opacity-20" />
                  <p className="text-xs font-medium">Ready for generation</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}