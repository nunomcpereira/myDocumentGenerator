import { BotMessageSquare, Save, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { clearCustomCss, getCustomCss, getTranslationConfiguration, listMcpServers, listScenarios, loadScenario, saveScenario, uploadCustomCss } from "./api/client";
import { ProgressStepper } from "./components/ProgressStepper";
import { ScenarioControls } from "./components/ScenarioControls";
import { TranslationConfigurationDialog } from "./components/TranslationConfigurationDialog";
import { ExportScreen } from "./pages/ExportScreen";
import { IngestionScreen } from "./pages/IngestionScreen";
import { RefinementScreen } from "./pages/RefinementScreen";
import { WizardScreen } from "./pages/WizardScreen";
import type { McpServerCatalogResponse, ScenarioSummary, SessionSnapshot, TranslationConfigurationResponse } from "./lib/types";

const initialSnapshot: SessionSnapshot = {
  sessionId: null,
  scenarioId: "",
  prompt: "",
  promptSequence: [],
  autoApplyPromptOnRefine: false,
  mcpServers: [],
  exportLanguages: ["English", "Spanish", "French"],
  exportFormat: "docx",
  outputFileName: "localized-specification",
  loadedFiles: [],
  previewMarkdown: "",
  warnings: [],
};


function RefinementRoute({
  snapshot,
  mcpCatalog,
  onSelectedMcpServersChange,
  onSnapshotChange,
}: {
  snapshot: SessionSnapshot;
  mcpCatalog: McpServerCatalogResponse | null;
  onSelectedMcpServersChange: (serverNames: string[]) => void;
  onSnapshotChange: (snapshot: SessionSnapshot) => void;
}) {
  const { sessionId } = useParams();
  if (!snapshot.sessionId || snapshot.sessionId !== sessionId) {
    return <Navigate to="/" replace />;
  }
  return (
    <RefinementScreen
      snapshot={snapshot}
      mcpCatalog={mcpCatalog}
      onSelectedMcpServersChange={onSelectedMcpServersChange}
      onUpdated={onSnapshotChange}
    />
  );
}

function ExportRoute({ snapshot, onSnapshotChange }: { snapshot: SessionSnapshot; onSnapshotChange: (snapshot: SessionSnapshot) => void }) {
  const { sessionId } = useParams();
  if (!snapshot.sessionId || snapshot.sessionId !== sessionId) {
    return <Navigate to="/" replace />;
  }
  return (
    <ExportScreen
      snapshot={snapshot}
      selectedLanguages={snapshot.exportLanguages}
      onLanguagesChange={(languages) => onSnapshotChange({ ...snapshot, exportLanguages: languages })}
      exportFormat={snapshot.exportFormat}
      onExportFormatChange={(exportFormat) => onSnapshotChange({ ...snapshot, exportFormat })}
      outputFileName={snapshot.outputFileName}
      onOutputFileNameChange={(outputFileName) => onSnapshotChange({ ...snapshot, outputFileName })}
    />
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => {
    const raw = window.sessionStorage.getItem("documentation-engine-session");
    if (!raw) {
      return initialSnapshot;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
      const parsedPromptSequence = Array.isArray(parsed.promptSequence)
        ? parsed.promptSequence.filter((item): item is string => typeof item === "string")
        : [];
      return {
        ...initialSnapshot,
        ...parsed,
        scenarioId: parsed.scenarioId ?? "",
        prompt: parsed.prompt ?? "",
        promptSequence: parsedPromptSequence.length > 0 ? parsedPromptSequence : (parsed.prompt?.trim() ? [parsed.prompt.trim()] : []),
        autoApplyPromptOnRefine: parsed.autoApplyPromptOnRefine ?? false,
        mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers : [],
        exportLanguages: Array.isArray(parsed.exportLanguages) && parsed.exportLanguages.length > 0
          ? parsed.exportLanguages
          : initialSnapshot.exportLanguages,
        exportFormat: parsed.exportFormat === "pdf" ? "pdf" : "docx",
        outputFileName: parsed.outputFileName ?? initialSnapshot.outputFileName,
        loadedFiles: Array.isArray(parsed.loadedFiles) ? parsed.loadedFiles : [],
        previewMarkdown: parsed.previewMarkdown ?? "",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      };
    } catch {
      window.sessionStorage.removeItem("documentation-engine-session");
      return initialSnapshot;
    }
  });
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [saveScenarioOpen, setSaveScenarioOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [translationConfiguration, setTranslationConfiguration] = useState<TranslationConfigurationResponse | null>(null);
  const [translationConfigurationBusy, setTranslationConfigurationBusy] = useState(false);
  const [translationConfigurationError, setTranslationConfigurationError] = useState<string | null>(null);
  const [customCss, setCustomCss] = useState<string | null>(null);
  const [mcpCatalog, setMcpCatalog] = useState<McpServerCatalogResponse | null>(null);

  useEffect(() => {
    void refreshScenarios();
    void loadCustomCssTheme();
    void refreshMcpCatalog();
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("documentation-engine-session", JSON.stringify(snapshot));
  }, [snapshot]);

  async function refreshScenarios() {
    try {
      setScenarios(await listScenarios());
    } catch {
      setScenarios([]);
    }
  }

  async function refreshMcpCatalog() {
    try {
      setMcpCatalog(await listMcpServers());
    } catch (caught) {
      setMcpCatalog({
        available: false,
        source: "docker-mcp-cli",
        detail: caught instanceof Error ? caught.message : "Failed to discover Docker MCP servers.",
        servers: [],
      });
    }
  }

  async function loadTranslationProviderConfiguration() {
    setTranslationConfigurationBusy(true);
    setTranslationConfigurationError(null);
    try {
      setTranslationConfiguration(await getTranslationConfiguration());
    } catch (caught) {
      setTranslationConfigurationError(caught instanceof Error ? caught.message : "Failed to load translation configuration.");
    } finally {
      setTranslationConfigurationBusy(false);
    }
  }

  async function loadCustomCssTheme() {
    try {
      const response = await getCustomCss();
      setCustomCss(response.css_text ?? null);
    } catch {
      setCustomCss(null);
    }
  }

  useEffect(() => {
    const styleElementId = "app-custom-css";
    const existingStyleElement = document.getElementById(styleElementId);

    if (!customCss?.trim()) {
      existingStyleElement?.remove();
      return;
    }

    const styleElement = existingStyleElement ?? document.createElement("style");
    styleElement.id = styleElementId;
    styleElement.textContent = customCss;
    if (!existingStyleElement) {
      document.head.appendChild(styleElement);
    }

    return () => {
      if (!customCss?.trim()) {
        styleElement.remove();
      }
    };
  }, [customCss]);

  async function handleOpenConfiguration() {
    setConfigurationOpen(true);
    await Promise.all([loadTranslationProviderConfiguration(), loadCustomCssTheme()]);
  }

  async function handleUploadCustomCss(file: File) {
    setTranslationConfigurationBusy(true);
    setTranslationConfigurationError(null);
    try {
      setTranslationConfiguration(await uploadCustomCss(file));
      await loadCustomCssTheme();
    } catch (caught) {
      setTranslationConfigurationError(caught instanceof Error ? caught.message : "Failed to upload custom CSS.");
    } finally {
      setTranslationConfigurationBusy(false);
    }
  }

  async function handleClearCustomCss() {
    setTranslationConfigurationBusy(true);
    setTranslationConfigurationError(null);
    try {
      setTranslationConfiguration(await clearCustomCss());
      setCustomCss(null);
    } catch (caught) {
      setTranslationConfigurationError(caught instanceof Error ? caught.message : "Failed to clear custom CSS.");
    } finally {
      setTranslationConfigurationBusy(false);
    }
  }

  async function handleLoadScenario() {
    if (!snapshot.scenarioId.trim()) {
      return;
    }
    setScenarioBusy(true);
    try {
      const response = await loadScenario(snapshot.scenarioId);
      setSnapshot({
        sessionId: response.session_id,
        scenarioId: response.scenario_id,
        prompt: response.prompt ?? "",
        promptSequence: response.prompt_sequence ?? [],
        autoApplyPromptOnRefine: (response.prompt_sequence?.length ?? 0) > 0,
        mcpServers: response.mcp_servers ?? [],
        exportLanguages: response.target_languages.length > 0 ? response.target_languages : initialSnapshot.exportLanguages,
        exportFormat: snapshot.exportFormat,
        outputFileName: response.output_file_name ?? initialSnapshot.outputFileName,
        loadedFiles: response.loaded_files,
        template: response.template,
        draftState: response.draft_state,
        previewMarkdown: response.preview_markdown,
        warnings: response.warnings,
      });
      navigate(`/refine/${response.session_id}`);
      await refreshScenarios();
    } finally {
      setScenarioBusy(false);
    }
  }

  async function handleSaveScenario() {
    if (!snapshot.sessionId || !snapshot.scenarioId.trim()) {
      return;
    }
    setScenarioBusy(true);
    try {
      const response = await saveScenario({
        sessionId: snapshot.sessionId,
        scenarioId: snapshot.scenarioId,
        prompt: snapshot.prompt,
        promptSequence: snapshot.promptSequence,
        mcpServers: snapshot.mcpServers,
        targetLanguages: snapshot.exportLanguages,
        outputFileName: snapshot.outputFileName,
      });
      setSnapshot((current) => ({
        ...current,
        scenarioId: response.scenario_id,
        prompt: response.prompt ?? current.prompt,
        promptSequence: response.prompt_sequence ?? current.promptSequence,
        autoApplyPromptOnRefine: false,
        mcpServers: response.mcp_servers,
        exportLanguages: response.target_languages,
        outputFileName: response.output_file_name ?? current.outputFileName,
      }));
      await refreshScenarios();
      setSaveScenarioOpen(false);
    } finally {
      setScenarioBusy(false);
    }
  }

  const currentStep = location.pathname === "/"
    ? 0
    : location.pathname.startsWith("/ingest")
      ? 1
      : location.pathname.startsWith("/refine")
        ? 2
        : location.pathname.startsWith("/export")
          ? 3
          : 0;

  return (
    <div data-testid="app-shell" className="relative min-h-screen selection:bg-primary/10 selection:text-primary">
      <div className="mesh-bg" aria-hidden="true" />
      
      <div className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-10">
        <header className="mb-10 flex flex-col gap-6 animate-slide-down">
          <div className="flex flex-wrap items-center justify-between gap-4 glass-panel rounded-3xl p-4 shadow-xl">
            <div className="flex items-center gap-3 px-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-glow text-white">
                <BotMessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-ink leading-tight">Documentation Engine</h1>
                <p className="text-xs font-medium text-steel-muted">AI-Powered Generation & Localization</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <ProgressStepper currentStep={currentStep} sessionId={snapshot.sessionId} />
              
              <div className="h-8 w-px bg-ui-outline-soft hidden sm:block mx-1" />
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleOpenConfiguration()}
                  className="btn-secondary !px-3 !py-2 flex items-center gap-2 text-xs"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Configuration</span>
                </button>
                {snapshot.sessionId ? (
                  <button
                    type="button"
                    onClick={() => setSaveScenarioOpen((current) => !current)}
                    className={[
                      "btn-primary !px-3 !py-2 flex items-center gap-2 text-xs transition-all",
                      saveScenarioOpen
                        ? "bg-accent hover:bg-accent-light shadow-glow-accent"
                        : "",
                    ].join(" ")}
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{saveScenarioOpen ? "Hide save" : "Save scenario"}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className="relative z-10">
          {snapshot.sessionId && saveScenarioOpen ? (
            <div className="mb-8 animate-slide-up">
              <div className="glass-panel rounded-3xl p-1 overflow-hidden">
                <ScenarioControls
                  scenarios={scenarios}
                  scenarioId={snapshot.scenarioId}
                  onScenarioIdChange={(scenarioId) => setSnapshot((current) => ({ ...current, scenarioId }))}
                  onLoad={handleLoadScenario}
                  onSave={handleSaveScenario}
                  busy={scenarioBusy}
                  canSave={Boolean(snapshot.sessionId)}
                  mode="save-only"
                  title="Save Environment"
                  description="Capture current configuration as a reusable scenario."
                />
              </div>
            </div>
          ) : null}

          {snapshot.warnings.length > 0 ? (
            <div className="mb-8 animate-slide-up rounded-2xl border border-warning-light/30 bg-warning-light/10 px-6 py-4 text-sm text-warning-dark backdrop-blur-sm shadow-premium">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warning animate-pulse" />
                <div className="space-y-1">
                  {snapshot.warnings.map((warning) => (
                    <p key={warning} className="font-medium">{warning}</p>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="animate-fade-in animate-delay-200">
            <Routes>
              <Route
                path="/"
                element={
                  <WizardScreen
                    scenarios={scenarios}
                    scenarioId={snapshot.scenarioId}
                    onScenarioIdChange={(scenarioId) => setSnapshot((current) => ({ ...current, scenarioId }))}
                    onLoadScenario={handleLoadScenario}
                    onStartFromScratch={() => navigate("/ingest")}
                    scenarioBusy={scenarioBusy}
                  />
                }
              />
              <Route
                path="/ingest"
                element={
                  <IngestionScreen
                    onInitialized={(nextSnapshot) => {
                      setSnapshot(nextSnapshot);
                      navigate(`/refine/${nextSnapshot.sessionId}`);
                    }}
                  />
                }
              />
              <Route
                path="/refine/:sessionId"
                element={(
                  <RefinementRoute
                    snapshot={snapshot}
                    mcpCatalog={mcpCatalog}
                    onSelectedMcpServersChange={(mcpServers) => setSnapshot((current) => ({ ...current, mcpServers }))}
                    onSnapshotChange={setSnapshot}
                  />
                )}
              />
              <Route path="/export/:sessionId" element={<ExportRoute snapshot={snapshot} onSnapshotChange={setSnapshot} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>

      <TranslationConfigurationDialog
        open={configurationOpen}
        loading={translationConfigurationBusy}
        error={translationConfigurationError}
        configuration={translationConfiguration}
        onClose={() => setConfigurationOpen(false)}
        onRefresh={() => void loadTranslationProviderConfiguration()}
        onUploadCustomCss={handleUploadCustomCss}
        onClearCustomCss={handleClearCustomCss}
      />
    </div>
  );
}
