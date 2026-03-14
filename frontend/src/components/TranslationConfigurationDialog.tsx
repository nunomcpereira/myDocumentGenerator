import { LoaderCircle, Settings2, X } from "lucide-react";

import type { TranslationConfigurationResponse } from "../lib/types";

type TranslationConfigurationDialogProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  configuration: TranslationConfigurationResponse | null;
  onClose: () => void;
  onRefresh: () => void;
};

export function TranslationConfigurationDialog({
  open,
  loading,
  error,
  configuration,
  onClose,
  onRefresh,
}: TranslationConfigurationDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/70 bg-[#fffaf5] p-6 shadow-[0_30px_80px_rgba(17,19,26,0.3)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.22em] text-steel">
              <Settings2 className="h-4 w-4" />
              Translation configuration
            </div>
            <h2 className="mt-4 font-serif text-3xl text-ink">Choose the backend translation provider through .env</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-steel">
              The backend reads the active translator from backend/.env. Set TRANSLATION_PROVIDER to llm, azure, or google, then restart the backend to apply the change.
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

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-semibold text-sand transition hover:bg-[#1e2230] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
            Refresh backend config
          </button>
          {configuration ? (
            <div className="rounded-full bg-sand px-4 py-2 text-sm text-ink">
              Active provider: <span className="font-semibold uppercase">{configuration.active_provider}</span>
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        {configuration ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {configuration.options.map((option) => {
              const active = option.id === configuration.active_provider;
              return (
                <section
                  key={option.id}
                  className={[
                    "rounded-[1.75rem] border p-5 shadow-panel",
                    active ? "border-ink bg-[#1a212a] text-sand" : "border-stone-200 bg-white text-ink",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-serif text-2xl">{option.label}</h3>
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
        ) : null}

        <div className="mt-6 rounded-[1.75rem] border border-dashed border-stone-300 bg-white/75 p-5 text-sm leading-7 text-steel">
          Configuration file: backend/.env
          <br />
          Restart required: yes, after changing TRANSLATION_PROVIDER or provider credentials.
        </div>
      </div>
    </div>
  );
}