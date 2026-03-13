import { memo } from "react";
import ReactMarkdown from "react-markdown";

type MarkdownPreviewProps = {
  value: string;
};

export const MarkdownPreview = memo(function MarkdownPreview({ value }: MarkdownPreviewProps) {
  return (
    <section className="panel-surface flex h-full flex-col rounded-[2rem] border border-white/70 bg-[#fffdf8]/90 p-6 shadow-panel">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.24em] text-steel">Projected spec</p>
        <h2 className="font-serif text-2xl text-ink">Live Markdown preview</h2>
      </div>
      <div className="markdown-preview prose prose-stone max-w-none flex-1 overflow-y-auto pr-2">
        <ReactMarkdown>{value || "# Draft preview\n\nInitialize a template to start building the projected specification."}</ReactMarkdown>
      </div>
    </section>
  );
});