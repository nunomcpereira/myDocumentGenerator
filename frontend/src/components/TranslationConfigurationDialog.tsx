import { ChevronDown, LoaderCircle, Paintbrush2, Settings2, Trash2, Upload, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { TranslationConfigurationResponse } from "../lib/types";

type TranslationConfigurationDialogProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  configuration: TranslationConfigurationResponse | null;
  onClose: () => void;
  onRefresh: () => void;
  onUploadCustomCss: (file: File) => Promise<void>;
  onClearCustomCss: () => Promise<void>;
};

type CollapsibleSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

function CollapsibleSection({ eyebrow, title, description, children }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="premium-card rounded-[2rem] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-start justify-between gap-6 p-8 text-left transition-colors hover:bg-surface-muted/30"
        aria-expanded={expanded}
      >
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">{eyebrow}</div>
          <h3 className="font-headline text-2xl font-bold text-ink mb-2">{title}</h3>
          <p className="text-sm leading-relaxed text-steel max-w-2xl">{description}</p>
        </div>
        <div className={[
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-ui-outline-soft transition-all duration-300",
          expanded ? "bg-primary text-white border-primary shadow-glow rotate-180" : "bg-white text-steel hover:border-primary/30"
        ].join(" ")}>
          <ChevronDown className="h-5 w-5" />
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-ui-outline-soft bg-surface-muted/10 p-8 animate-slide-down">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function TranslationConfigurationDialog({
  open,
  loading,
  error,
  configuration,
  onClose,
  onRefresh,
  onUploadCustomCss,
  onClearCustomCss,
}: TranslationConfigurationDialogProps) {
  if (!open) {
    return null;
  }

  const configuredOptions = configuration?.options.filter((option) => option.configured).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-4 py-8 animate-fade-in">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[2.5rem] border border-ui-outline-soft bg-white shadow-2xl flex flex-col animate-scale-in">
        <header className="p-8 border-b border-ui-outline-soft flex items-start justify-between bg-surface-muted/30">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full mb-4">
              <Settings2 className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Workspace Environment</p>
            </div>
            <h2 className="font-headline text-3xl font-bold text-ink mb-2 tracking-tight">System Configuration</h2>
            <p className="text-sm leading-relaxed text-steel max-w-2xl">
              Manage core engine settings, translation providers, and UI theming. Changes to providers may require a backend restart.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white border border-ui-outline-soft text-steel hover:text-danger hover:border-danger/30 transition-all shadow-sm"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          <section className="premium-card bg-slate-900 text-white p-8 rounded-[2rem] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Settings2 className="h-40 w-40 -mr-10 -mt-10" />
            </div>
            
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div>
                <h3 className="font-headline text-2xl font-bold mb-2">Live Snapshot</h3>
                <p className="text-slate-400 text-sm">Real-time status of the documentation engine backend.</p>
              </div>

              <div className="flex flex-wrap gap-4">
                {configuration && (
                  <>
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl min-w-[140px]">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Active Provider</span>
                      <span className="text-sm font-bold uppercase text-primary">{configuration.active_provider}</span>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl min-w-[140px]">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Custom UI</span>
                      <span className={["text-sm font-bold", configuration.custom_css.enabled ? "text-success" : "text-slate-400"].join(" ")}>
                        {configuration.custom_css.enabled ? "Active" : "None"}
                      </span>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  className="btn-primary flex items-center gap-3 px-6"
                >
                  {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
                  Refresh System
                </button>
              </div>
            </div>
          </section>

          {error && (
            <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-sm font-bold animate-slide-up flex items-center gap-3">
              <span className="h-6 w-6 rounded-lg bg-danger/10 flex items-center justify-center text-xs">!</span>
              {error}
            </div>
          )}

          {configuration && (
            <div className="space-y-6">
              <CollapsibleSection
                eyebrow="Integration"
                title="Translation Engine"
                description="Monitor the active localization pipeline and provider health."
              >
                <div className="grid gap-6 lg:grid-cols-3">
                  {configuration.options.map((option) => {
                    const active = option.id === configuration.active_provider;
                    return (
                      <div
                        key={option.id}
                        className={[
                          "p-6 rounded-[2rem] border transition-all duration-300",
                          active 
                            ? "bg-white border-primary shadow-glow ring-4 ring-primary/5" 
                            : "bg-surface-muted border-ui-outline-soft hover:bg-white hover:shadow-premium"
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h4 className={["font-bold text-lg transition-colors", active ? "text-primary" : "text-ink"].join(" ")}>{option.label}</h4>
                          <span className={[
                            "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                            option.configured 
                              ? active ? "bg-primary text-white" : "bg-success/10 text-success"
                              : "bg-danger/10 text-danger"
                          ].join(" ")}>
                            {option.configured ? "Ready" : "Incomplete"}
                          </span>
                        </div>
                        <p className="text-xs text-steel-muted leading-relaxed mb-6">{option.description}</p>
                        <div className="space-y-2">
                          <span className="text-[9px] font-bold uppercase text-steel-muted tracking-widest block">Environment Dependencies</span>
                          <div className="flex flex-wrap gap-1.5">
                            {option.required_env.map((env) => (
                              <code key={env} className="text-[10px] bg-white border border-ui-outline-soft px-2 py-0.5 rounded-md text-ink font-mono">{env}</code>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                eyebrow="Interface"
                title="Visual Overrides"
                description="Inject custom CSS to adapt the documentation engine to your workspace theme."
              >
                <div className="flex flex-col lg:flex-row gap-8 lg:items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="h-16 w-16 rounded-2xl bg-surface-muted flex items-center justify-center text-primary border border-ui-outline-soft">
                      <Paintbrush2 className="h-8 w-8" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-ink block mb-1">
                        {configuration.custom_css.enabled ? configuration.custom_css.file_name : "Default Theme Active"}
                      </span>
                      {configuration.custom_css.updated_at && (
                        <span className="text-[10px] text-steel-muted block">Last updated: {new Date(configuration.custom_css.updated_at).toLocaleString()}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {configuration.custom_css.enabled && (
                      <button
                        type="button"
                        onClick={() => void onClearCustomCss()}
                        className="btn-secondary text-danger border-danger/20 hover:bg-danger/5 hover:text-danger hover:border-danger/40 flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Reset Theme
                      </button>
                    )}
                    <label className="btn-primary cursor-pointer flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload Stylesheet
                      <input
                        type="file"
                        accept=".css,text/css"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void onUploadCustomCss(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                eyebrow="Operations"
                title="System Metadata"
                description="Technical details regarding configuration origin and service lifecycle."
              >
                <div className="p-6 rounded-2xl border-2 border-dashed border-ui-outline-soft bg-surface-muted/30 text-xs font-medium text-steel leading-relaxed space-y-2">
                  <div className="flex gap-4">
                    <span className="w-40 text-steel-muted uppercase tracking-widest font-bold text-[9px]">Source Manifest</span>
                    <span className="text-ink font-mono">{configuration.source}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="w-40 text-steel-muted uppercase tracking-widest font-bold text-[9px]">Cycle Status</span>
                    <span className={configuration.restart_required ? "text-danger font-bold" : "text-success font-bold"}>
                      {configuration.restart_required ? "PENDING RESTART" : "SYNCHRONIZED"}
                    </span>
                  </div>
                </div>
              </CollapsibleSection>
            </div>
          )}
        </div>

        <footer className="p-8 border-t border-ui-outline-soft flex justify-end bg-surface-muted/10">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-8"
          >
            Close Settings
          </button>
        </footer>
      </div>
    </div>
  );
}