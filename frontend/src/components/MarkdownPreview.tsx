import { memo } from "react";
import ReactMarkdown from "react-markdown";

import { buildSessionFileUrl } from "../api/client";

type MarkdownPreviewProps = {
  value: string;
  mode: "html" | "markdown";
  onModeChange: (mode: "html" | "markdown") => void;
};

function resolvePreviewUrl(url: string): string {
  if (!url.startsWith("/")) {
    return url;
  }
  if (url.startsWith("/sessions/") || url.startsWith("/export/")) {
    return buildSessionFileUrl(url);
  }
  return url;
}

export const MarkdownPreview = memo(function MarkdownPreview({
  value,
  mode,
  onModeChange,
}: MarkdownPreviewProps) {
  const fallbackValue = value || "# Draft preview\n\nInitialize a template to start building the projected specification.";

  return (
    <section className="flex flex-col h-full bg-white rounded-[2rem] border border-ui-outline-soft shadow-premium overflow-hidden">
      <div className="p-6 border-b border-ui-outline-soft flex items-center justify-between bg-surface-muted/30">
        <div>
          <h2 className="font-headline text-lg font-bold text-ink">Projected Specification</h2>
          <p className="text-[10px] font-bold uppercase tracking-wider text-steel-muted">Live Document Preview</p>
        </div>
        <div className="inline-flex p-1 bg-white rounded-xl border border-ui-outline-soft shadow-sm">
          {[
            { id: "html", label: "Preview" },
            { id: "markdown", label: "Source" },
          ].map((option) => {
            const active = mode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onModeChange(option.id as "html" | "markdown")}
                className={[
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                  active ? "bg-primary text-white shadow-sm" : "text-steel-muted hover:text-ink",
                ].join(" ")}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col bg-surface-dark/30 p-8">
        <div className="flex-1 bg-white shadow-2xl rounded-sm border border-ui-outline-soft/50 overflow-y-auto custom-scrollbar relative">
          {/* Paper Texture Overlay */}
          <div className="absolute inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')] opacity-[0.03]" />
          
          <div className="relative z-10 p-12 min-h-full">
            {mode === "html" ? (
              <div className="markdown-content">
                <ReactMarkdown
                  urlTransform={(url) => resolvePreviewUrl(url)}
                >
                  {fallbackValue}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="font-mono text-xs leading-relaxed text-steel bg-surface-muted p-6 rounded-xl border border-ui-outline-soft whitespace-pre-wrap">
                {fallbackValue}
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
});
