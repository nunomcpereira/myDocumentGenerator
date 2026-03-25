import { BotMessageSquare, MoonStar, Save, Settings2, SunMedium } from "lucide-react";
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
  autoApplyPromptOnRefine: false,
  mcpServers: [],
  exportLanguages: ["English", "Spanish", "French"],
  exportFormat: "docx",
  outputFileName: "localized-specification",
  loadedFiles: [],
  previewMarkdown: "",
  warnings: [],
};

type ThemeMode = "light" | "dark";

const themeStorageKey = "documentation-engine-theme";

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
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return storedTheme === "dark" ? "dark" : "light";
  });
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => {
    const raw = window.sessionStorage.getItem("documentation-engine-session");
    if (!raw) {
      return initialSnapshot;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
      return {
        ...initialSnapshot,
        ...parsed,
        scenarioId: parsed.scenarioId ?? "",
        prompt: parsed.prompt ?? "",
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
    document.body.classList.toggle("theme-dark", theme === "dark");
    document.body.classList.toggle("theme-light", theme === "light");
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

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
        autoApplyPromptOnRefine: Boolean(response.prompt?.trim()),
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
        mcpServers: snapshot.mcpServers,
        targetLanguages: snapshot.exportLanguages,
        outputFileName: snapshot.outputFileName,
      });
      setSnapshot((current) => ({
        ...current,
        scenarioId: response.scenario_id,
        prompt: response.prompt ?? current.prompt,
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
    <div data-testid="app-shell" data-theme={theme} className="mx-auto min-h-screen max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10">
      <header className="mb-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 shadow-panel backdrop-blur">
            <BotMessageSquare className="h-4 w-4 text-ember" />
            <span className="text-sm text-ink">Documentation Generation & Localization Engine</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <ProgressStepper currentStep={currentStep} sessionId={snapshot.sessionId} />
          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <button
              type="button"
              onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
              className="ui-toolbar-button inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-3 text-sm font-semibold text-ink shadow-panel backdrop-blur transition hover:border-ember"
              aria-label={theme === "light" ? "Switch to dark theme" : "Switch to white theme"}
            >
              {theme === "light" ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
              {theme === "light" ? "Dark theme" : "White theme"}
            </button>
            <button
              type="button"
              onClick={() => void handleOpenConfiguration()}
              className="ui-toolbar-button inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-3 text-sm font-semibold text-ink shadow-panel backdrop-blur transition hover:border-ember"
            >
              <Settings2 className="h-4 w-4" />
              Configuration
            </button>
            {snapshot.sessionId ? (
              <button
                type="button"
                onClick={() => setSaveScenarioOpen((current) => !current)}
                className="ui-toolbar-button inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-3 text-sm font-semibold text-ink shadow-panel backdrop-blur transition hover:border-ember"
              >
                <Save className="h-4 w-4" />
                {saveScenarioOpen ? "Hide save scenario" : "Save scenario"}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {snapshot.sessionId && saveScenarioOpen ? (
        <div className="mb-6">
          <ScenarioControls
            scenarios={scenarios}
            scenarioId={snapshot.scenarioId}
            onScenarioIdChange={(scenarioId) => setSnapshot((current) => ({ ...current, scenarioId }))}
            onLoad={handleLoadScenario}
            onSave={handleSaveScenario}
            busy={scenarioBusy}
            canSave={Boolean(snapshot.sessionId)}
            mode="save-only"
            title="Save the current scenario"
            description="Capture the template, enhancement document, examples, draft state, and export settings under a reusable scenario ID."
          />
        </div>
      ) : null}

      {snapshot.warnings.length > 0 ? (
        <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          {snapshot.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

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