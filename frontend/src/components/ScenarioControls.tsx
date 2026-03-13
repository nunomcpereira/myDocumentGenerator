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
};

export function ScenarioControls({
  scenarios,
  scenarioId,
  onScenarioIdChange,
  onLoad,
  onSave,
  busy,
  canSave,
}: ScenarioControlsProps) {
  return (
    <div className="flex flex-col gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-steel">Scenarios</p>
        <h2 className="mt-2 font-serif text-2xl text-ink">Load or save a named scenario</h2>
        <p className="mt-2 text-sm leading-6 text-steel">
          A scenario stores the template, examples, current prompt, draft document, and export language configuration under the root scenarios folder.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={scenarioId}
          onChange={(event) => onScenarioIdChange(event.target.value)}
          className="min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-4 py-3 text-sm text-ink outline-none"
        >
          <option value="">Select or type scenario ID</option>
          {scenarios.map((scenario) => (
            <option key={scenario.scenario_id} value={scenario.scenario_id}>
              {scenario.scenario_id}
            </option>
          ))}
        </select>
        <input
          value={scenarioId}
          onChange={(event) => onScenarioIdChange(event.target.value)}
          placeholder="scenario-id"
          className="min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-4 py-3 text-sm text-ink outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {scenarios.length === 0 ? <p className="text-sm text-steel">No saved scenarios yet.</p> : null}
        {scenarios.map((scenario) => (
          <button
            key={scenario.scenario_id}
            type="button"
            onClick={() => onScenarioIdChange(scenario.scenario_id)}
            className={[
              "rounded-full border px-3 py-1 text-xs transition",
              scenario.scenario_id === scenarioId ? "border-ink bg-ink text-sand" : "border-stone-300 bg-white text-ink hover:border-ember",
            ].join(" ")}
          >
            {scenario.scenario_id}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void onLoad()}
          disabled={busy || !scenarioId.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-sand transition hover:bg-[#1e2230] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          Load scenario
        </button>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={busy || !scenarioId.trim() || !canSave}
          className="inline-flex items-center gap-2 rounded-full bg-moss px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2f493b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save scenario
        </button>
      </div>
    </div>
  );
}