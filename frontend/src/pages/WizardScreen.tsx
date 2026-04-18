import { ArrowRight, Compass, FolderOpen, Zap } from "lucide-react";

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
    <div className="animate-fade-in max-w-5xl mx-auto py-12">
      <section className="text-center mb-16 animate-slide-up">
        <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full mb-6">
          <Zap className="h-4 w-4 text-primary animate-pulse" />
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Get started</p>
        </div>
        <h1 className="font-headline text-5xl font-extrabold text-ink mb-6 tracking-tight">
          How would you like to <span className="text-primary bg-clip-text">begin?</span>
        </h1>
        <p className="max-w-2xl mx-auto text-lg leading-relaxed text-steel">
          Start a fresh project or restore a previous session. Our AI-driven workflow guides you from initial ingestion through refined drafting to final localization.
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2 animate-slide-up animate-delay-200">
        <button
          type="button"
          onClick={onStartFromScratch}
          className="group premium-card p-10 text-left rounded-[2.5rem] bg-gradient-to-br from-white to-surface-muted relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
            <Compass className="h-40 w-40 -mr-10 -mt-10" />
          </div>
          
          <div className="flex items-center justify-between mb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-glow text-white transition-transform group-hover:scale-110">
              <Compass className="h-8 w-8" />
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-steel-muted group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
              <ArrowRight className="h-5 w-5" />
            </div>
          </div>
          
          <h2 className="font-headline text-3xl font-bold text-ink mb-4 group-hover:text-primary transition-colors">Start from scratch</h2>
          <p className="text-steel leading-relaxed">
            Move directly into ingestion. Upload your templates and source documents to begin the AI-assisted generation process.
          </p>
        </button>

        <section className="premium-card p-10 text-left rounded-[2.5rem] bg-slate-900 text-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <FolderOpen className="h-40 w-40 -mr-10 -mt-10" />
          </div>

          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md mb-8">
            <FolderOpen className="h-8 w-8 text-white" />
          </div>
          
          <h2 className="font-headline text-3xl font-bold text-white mb-4">Restore a scenario</h2>
          <p className="text-slate-400 leading-relaxed mb-8">
            Select a previously saved environment to resume your work exactly where you left off.
          </p>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-6 backdrop-blur-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4">Available Environments</p>
            
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
        </section>
      </div>
    </div>
  );
}
