import { memo } from "react";
import ReactMarkdown from "react-markdown";

type MarkdownPreviewProps = {
  value: string;
  mode: "html" | "markdown";
  onModeChange: (mode: "html" | "markdown") => void;
};

export const MarkdownPreview = memo(function MarkdownPreview({ value, mode, onModeChange }: MarkdownPreviewProps) {
  const fallbackValue = value || "# Draft preview\n\nInitialize a template to start building the projected specification.";

  return (
    <section className="panel-surface flex h-full max-h-[68vh] flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[#fffdf8]/90 p-6 shadow-panel xl:max-h-[74vh]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
        <p className="text-xs uppercase tracking-[0.24em] text-steel">Projected spec</p>
          <h2 className="font-serif text-2xl text-ink">Live preview</h2>
        </div>
        <div className="inline-flex rounded-full border border-stone-300 bg-white p-1 shadow-sm">
          {[
            { id: "html", label: "HTML" },
            { id: "markdown", label: "Markdown" },
          ].map((option) => {
            const active = mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onModeChange(option.id as "html" | "markdown")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  active ? "bg-ink text-sand" : "text-steel hover:text-ink",
                ].join(" ")}
                aria-pressed={active}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {mode === "html" ? (
        <div className="markdown-preview prose prose-stone max-w-none flex-1 overflow-y-auto pr-2">
          <ReactMarkdown>{fallbackValue}</ReactMarkdown>
        </div>
      ) : (
        <pre className="flex-1 overflow-y-auto rounded-[1.5rem] border border-stone-200 bg-white/80 p-5 font-mono text-sm leading-6 text-ink">{fallbackValue}</pre>
      )}
    </section>
  );
});