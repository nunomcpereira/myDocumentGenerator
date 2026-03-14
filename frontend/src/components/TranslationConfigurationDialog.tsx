import { LoaderCircle, Paintbrush2, Settings2, Trash2, Upload, X } from "lucide-react";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/70 bg-[#fffaf5] p-6 shadow-[0_30px_80px_rgba(17,19,26,0.3)] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs uppercase tracking-[0.22em] text-steel">
              <Settings2 className="h-4 w-4" />
              Workspace configuration
            </div>
            <h2 className="mt-4 font-serif text-3xl text-ink">Configure translation and UI theming</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-steel">
              The backend reads the active translator from backend/.env. You can also upload a custom CSS file stored in the application database and applied to the UI immediately.
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

        <section className="mt-6 rounded-[1.75rem] border border-stone-200 bg-white/90 p-5 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-[0.18em] text-steel">
                <Paintbrush2 className="h-4 w-4" />
                Custom CSS
              </div>
              <h3 className="mt-3 font-serif text-2xl text-ink">Upload a stylesheet override</h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-steel">
                Upload a `.css` file to override the default UI styles. The file is saved in the application database and applied across reloads until you clear it.
              </p>
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
            <div className="rounded-full bg-sand px-4 py-2 text-sm text-ink">
              {configuration?.custom_css.enabled
                ? `Active stylesheet: ${configuration.custom_css.file_name ?? "custom.css"}`
                : "No custom CSS uploaded"}
            </div>
          </div>

          {configuration?.custom_css.updated_at ? (
            <p className="mt-4 text-sm text-steel">Last updated: {new Date(configuration.custom_css.updated_at).toLocaleString()}</p>
          ) : null}
        </section>

        <div className="mt-6 rounded-[1.75rem] border border-dashed border-stone-300 bg-white/75 p-5 text-sm leading-7 text-steel">
          Configuration file: backend/.env
          <br />
          Restart required: yes, after changing TRANSLATION_PROVIDER or provider credentials.
        </div>
      </div>
    </div>
  );
}