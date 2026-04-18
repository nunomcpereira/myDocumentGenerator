import { FolderOpen, LoaderCircle, Save } from "lucide-react";

import type { ScenarioSummary } from "../lib/types";

type ScenarioControlsProps = {
  scenarios: ScenarioSummary[];
  scenarioId: string;
  onScenarioIdChange: (scenarioId: string) => void;
  onLoad: () => Promise<void>;
  onSave: () => Promise<void>;
  busy: boolean;
  canSave: boolean;
  mode?: "load-save" | "load-only" | "save-only";
  title?: string;
  description?: string;
  embedded?: boolean;
  hideHeader?: boolean;
  hideManualInput?: boolean;
  hideScenarioChips?: boolean;
};

export function ScenarioControls({
  scenarios,
  scenarioId,
  onScenarioIdChange,
  onLoad,
  onSave,
  busy,
  canSave,
  mode = "load-save",
  title,
  description,
  embedded = false,
  hideHeader = false,
  hideManualInput = false,
  hideScenarioChips = false,
}: ScenarioControlsProps) {
  const showLoad = mode !== "save-only";
  const showSave = mode !== "load-only";

  return (
    <div
      className={[
        "flex flex-col gap-6",
        embedded ? "" : "premium-card p-8 rounded-[2rem]",
      ].join(" ")}
    >
      {hideHeader ? null : (
        <div>
          <div className="inline-flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Configurations</p>
          </div>
          <h2 className="font-headline text-2xl font-bold text-ink mb-2">
            {title ?? (mode === "load-only" ? "Restore Session" : mode === "save-only" ? "Persist Environment" : "Scenario Management")}
          </h2>
          <p className="text-sm leading-relaxed text-steel max-w-2xl">
            {description ?? "Snapshots capture the template, training context, instruction sequences, and localization settings for consistent document generation."}
          </p>
        </div>
      )}
      
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-steel-muted px-1">Select Existing</label>
          <select
            value={scenarioId}
            onChange={(event) => onScenarioIdChange(event.target.value)}
            className="input-standard !py-3 font-medium"
          >
            <option value="">Choose a scenario...</option>
            {scenarios.map((scenario) => (
              <option key={scenario.scenario_id} value={scenario.scenario_id}>
                {scenario.scenario_id}
              </option>
            ))}
          </select>
        </div>
        
        {hideManualInput ? null : (
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-steel-muted px-1">Environment Name</label>
            <input
              value={scenarioId}
              onChange={(event) => onScenarioIdChange(event.target.value)}
              placeholder="e.g. Q4-Report-Draft"
              className="input-standard !py-3 font-medium"
            />
          </div>
        )}
      </div>

      {hideScenarioChips ? null : (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-steel-muted px-1">Recent Environments</p>
          <div className="flex flex-wrap gap-2">
            {scenarios.length === 0 ? <p className="text-xs text-steel-muted italic p-2">No saved environments found.</p> : null}
            {scenarios.map((scenario) => (
              <button
                key={scenario.scenario_id}
                type="button"
                onClick={() => onScenarioIdChange(scenario.scenario_id)}
                className={[
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all border",
                  scenario.scenario_id === scenarioId
                    ? "bg-primary text-white border-primary shadow-glow"
                    : "bg-surface-muted text-steel-muted border-ui-outline-soft hover:border-primary/30 hover:text-ink hover:bg-white",
                ].join(" ")}
              >
                {scenario.scenario_id}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 pt-4 border-t border-ui-outline-soft">
        {showLoad ? (
          <button
            type="button"
            onClick={() => void onLoad()}
            disabled={busy || !scenarioId.trim()}
            className="btn-primary flex items-center gap-3 min-w-[160px] justify-center"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
            Restore Scenario
          </button>
        ) : null}
        {showSave ? (
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={busy || !scenarioId.trim() || !canSave}
            className="btn-secondary !bg-primary/5 !text-primary !border-primary/20 hover:!bg-primary/10 flex items-center gap-3 min-w-[160px] justify-center"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Persist Current
          </button>
        ) : null}
      </div>
    </div>
  );
}