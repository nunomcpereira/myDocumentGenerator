import { ArrowRight, Compass, FolderOpen } from "lucide-react";

import { ScenarioControls } from "../components/ScenarioControls";
import type { ScenarioSummary } from "../lib/types";

type WizardScreenProps = {
  scenarios: ScenarioSummary[];
  scenarioId: string;
  onScenarioIdChange: (scenarioId: string) => void;
  onLoadScenario: () => Promise<void>;
  onStartFromScratch: () => void;
  scenarioBusy: boolean;
};

export function WizardScreen({
  scenarios,
  scenarioId,
  onScenarioIdChange,
  onLoadScenario,
  onStartFromScratch,
  scenarioBusy,
}: WizardScreenProps) {
  return (
    <div>
      <section className="rounded-[2rem] border border-white/60 bg-white/78 p-8 shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.24em] text-steel">Start</p>
        <h1 className="mt-3 font-serif text-4xl text-ink">Choose how you want to begin</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-steel">
          Start from a fresh template or reopen an existing scenario. The wizard sits before ingest, refinement, and export so the workflow always begins from an explicit choice.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <button
            type="button"
            onClick={onStartFromScratch}
            className="wizard-entry-card wizard-entry-card-light group rounded-[2rem] border border-stone-200 bg-[#fff8ef] p-6 text-left shadow-panel transition hover:border-ember"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-sand">
                <Compass className="h-5 w-5" />
              </div>
              <ArrowRight className="h-5 w-5 text-steel transition group-hover:text-ember" />
            </div>
            <h2 className="mt-6 font-serif text-3xl text-ink">Start from scratch</h2>
            <p className="mt-3 text-sm leading-7 text-steel">
              Move into ingest, upload a template, and optionally bring an existing document for enhancement before the analyst starts refining the draft.
            </p>
          </button>

          <section className="wizard-entry-card wizard-entry-card-dark rounded-[2rem] border border-white/60 bg-[#172028] p-6 text-sand shadow-panel">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-sand">
              <FolderOpen className="h-5 w-5" />
            </div>
            <h2 className="mt-6 font-serif text-3xl text-white">Start from an existing scenario</h2>
            <p className="mt-3 text-sm leading-7 text-sand/75">
              Pick one of the saved scenario IDs below to restore a previous run.
            </p>

            <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-sand/60">Saved scenarios</p>
              <p className="mt-2 text-sm leading-6 text-sand/80">
                Select an ID and load it directly from this card.
              </p>

              <div className="mt-4">
                <ScenarioControls
                  scenarios={scenarios}
                  scenarioId={scenarioId}
                  onScenarioIdChange={onScenarioIdChange}
                  onLoad={onLoadScenario}
                  onSave={async () => {}}
                  busy={scenarioBusy}
                  canSave={false}
                  mode="load-only"
                  embedded
                  hideHeader
                  hideManualInput
                  hideScenarioChips
                />
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}