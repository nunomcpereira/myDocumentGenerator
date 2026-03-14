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
    <section className="rounded-[1.75rem] border border-stone-200 bg-white/90 shadow-panel">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-start justify-between gap-4 px-5 py-5 text-left sm:px-6"
        aria-expanded={expanded}
      >
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-steel">{eyebrow}</div>
          <h3 className="mt-2 font-serif text-2xl text-ink">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-steel">{description}</p>
        </div>
        <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-sand text-ink">
          <ChevronDown className={["h-4 w-4 transition-transform duration-200", expanded ? "rotate-180" : "rotate-0"].join(" ")} />
        </span>
      </button>

      {expanded ? <div className="border-t border-stone-200 px-5 py-5 sm:px-6">{children}</div> : null}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/70 bg-[#fffaf5] p-6 shadow-[0_30px_80px_rgba(17,19,26,0.3)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.22em] text-steel">
              <Settings2 className="h-4 w-4" />
              Workspace configuration
            </div>
            <h2 className="mt-4 font-serif text-3xl text-ink">Configure translation and UI theming</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-steel">
              This panel controls the translation provider and any custom UI stylesheet. The details are grouped below so you can inspect only the section you need.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-stone-200 bg-white text-ink transition hover:border-ember"
            aria-label="Close translation configuration"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="mt-6 rounded-[1.75rem] border border-stone-200 bg-white/90 p-5 shadow-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-steel">Quick status</p>
              <h3 className="mt-2 font-serif text-2xl text-ink">Current configuration at a glance</h3>
              <p className="mt-2 text-sm leading-7 text-steel">Refresh the backend snapshot, then expand only the sections you want to inspect or change.</p>
            </div>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-sand transition hover:bg-[#1e2230] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              Refresh backend config
            </button>
          </div>

          {configuration ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.25rem] bg-sand px-4 py-4 text-sm text-ink">
                <p className="text-[11px] uppercase tracking-[0.2em] text-steel">Active provider</p>
                <p className="mt-2 text-lg font-semibold uppercase">{configuration.active_provider}</p>
              </div>
              <div className="rounded-[1.25rem] bg-sand px-4 py-4 text-sm text-ink">
                <p className="text-[11px] uppercase tracking-[0.2em] text-steel">Configured providers</p>
                <p className="mt-2 text-lg font-semibold">{configuredOptions} of {configuration.options.length}</p>
              </div>
              <div className="rounded-[1.25rem] bg-sand px-4 py-4 text-sm text-ink">
                <p className="text-[11px] uppercase tracking-[0.2em] text-steel">Custom CSS</p>
                <p className="mt-2 text-lg font-semibold">{configuration.custom_css.enabled ? "Enabled" : "Not uploaded"}</p>
              </div>
            </div>
          ) : null}
        </section>

        {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        {configuration ? (
          <div className="mt-6 space-y-4">
            <CollapsibleSection
              eyebrow="Section 1"
              title="Current setup"
              description="See which translator is active, where the settings are loaded from, and whether a restart is expected."
            >
              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[1.5rem] bg-[#1a212a] p-5 text-sand">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-sand/60">Active translator</p>
                  <h4 className="mt-3 font-serif text-3xl uppercase">{configuration.active_provider}</h4>
                  <p className="mt-3 text-sm leading-7 text-sand/80">
                    The backend will use this provider for section title and body translation until the configuration source changes and the service is restarted if required.
                  </p>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-[1.5rem] bg-sand px-4 py-4 text-sm text-ink">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-steel">Configuration source</p>
                    <p className="mt-2 font-semibold">{configuration.source}</p>
                  </div>
                  <div className="rounded-[1.5rem] bg-sand px-4 py-4 text-sm text-ink">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-steel">Restart required</p>
                    <p className="mt-2 font-semibold">{configuration.restart_required ? "Yes" : "No"}</p>
                  </div>
                  <div className="rounded-[1.5rem] bg-sand px-4 py-4 text-sm text-ink">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-steel">Provider readiness</p>
                    <p className="mt-2 font-semibold">{configuredOptions} configured, {configuration.options.length - configuredOptions} incomplete</p>
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              eyebrow="Section 2"
              title="Translation providers"
              description="Review the available translators, their purpose, and the environment variables each one requires."
            >
              <div className="grid gap-4 lg:grid-cols-3">
                {configuration.options.map((option) => {
                  const active = option.id === configuration.active_provider;
                  return (
                    <section
                      key={option.id}
                      className={[
                        "rounded-[1.5rem] border p-5",
                        active ? "border-ink bg-[#1a212a] text-sand" : "border-stone-200 bg-[#fffaf5] text-ink",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={["text-[11px] uppercase tracking-[0.2em]", active ? "text-sand/60" : "text-steel"].join(" ")}>
                            {active ? "Currently active" : "Available option"}
                          </p>
                          <h4 className="mt-2 font-serif text-2xl">{option.label}</h4>
                        </div>
                        <span
                          className={[
                            "rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]",
                            option.configured
                              ? active
                                ? "bg-white/10 text-sand"
                                : "bg-emerald-50 text-emerald-700"
                              : active
                                ? "bg-amber-200/20 text-amber-100"
                                : "bg-amber-50 text-amber-700",
                          ].join(" ")}
                        >
                          {option.configured ? "Configured" : "Missing env"}
                        </span>
                      </div>
                      <p className={["mt-3 text-sm leading-7", active ? "text-sand/80" : "text-steel"].join(" ")}>{option.description}</p>
                      <div className="mt-5">
                        <p className={["text-xs uppercase tracking-[0.2em]", active ? "text-sand/60" : "text-steel"].join(" ")}>Required .env keys</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {option.required_env.map((envName) => (
                            <span
                              key={envName}
                              className={[
                                "rounded-full px-3 py-1 text-xs",
                                active ? "border border-white/10 bg-white/5 text-sand" : "bg-sand text-ink",
                              ].join(" ")}
                            >
                              {envName}
                            </span>
                          ))}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            </CollapsibleSection>
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          <CollapsibleSection
            eyebrow="Section 3"
            title="Custom stylesheet override"
            description="Upload a CSS file to restyle the UI immediately, or remove the existing override if you want to fall back to the default theme."
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="rounded-[1.5rem] bg-sand px-4 py-4 text-sm text-ink">
                <p className="text-[11px] uppercase tracking-[0.2em] text-steel">Current stylesheet</p>
                <p className="mt-2 font-semibold">
                  {configuration?.custom_css.enabled
                    ? configuration.custom_css.file_name ?? "custom.css"
                    : "No custom CSS uploaded"}
                </p>
                {configuration?.custom_css.updated_at ? (
                  <p className="mt-2 text-steel">Last updated: {new Date(configuration.custom_css.updated_at).toLocaleString()}</p>
                ) : null}
              </div>

              {configuration?.custom_css.enabled ? (
                <button
                  type="button"
                  onClick={() => void onClearCustomCss()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear custom CSS
                </button>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-sand transition hover:bg-[#1e2230]">
                <Upload className="h-4 w-4" />
                Upload CSS
                <input
                  type="file"
                  accept=".css,text/css"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void onUploadCustomCss(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="inline-flex items-center gap-2 rounded-full bg-sand px-4 py-2 text-sm text-ink">
                <Paintbrush2 className="h-4 w-4" />
                Applied immediately after upload
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            eyebrow="Section 4"
            title="Configuration source and restart guidance"
            description="Use this as the operational note for where the settings live and when backend restarts are needed."
          >
            <div className="rounded-[1.5rem] border border-dashed border-stone-300 bg-white/75 p-5 text-sm leading-7 text-steel">
              Configuration file: {configuration?.source ?? "backend/.env"}
              <br />
              Restart required: {configuration?.restart_required ? "yes" : "no"}
              {configuration?.restart_required ? ", after changing TRANSLATION_PROVIDER or provider credentials." : "."}
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}