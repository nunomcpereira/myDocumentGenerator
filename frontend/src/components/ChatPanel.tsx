import { LoaderCircle, Pencil, SendHorizontal, TriangleAlert } from "lucide-react";
import { memo, useEffect, useState } from "react";

import type { ChatMessage } from "../lib/types";

type ChatPanelProps = {
  messages: ChatMessage[];
  busy: boolean;
  llmAvailable: boolean;
  promptSummary: string;
  onPromptSummaryChange: (value: string) => void;
  onApplyPromptSummary: (value: string) => Promise<void>;
  onSend: (message: string) => Promise<void>;
};

export const ChatPanel = memo(function ChatPanel({
  messages,
  busy,
  llmAvailable,
  promptSummary,
  onPromptSummaryChange,
  onApplyPromptSummary,
  onSend,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(promptSummary);

  useEffect(() => {
    setSummaryDraft(promptSummary);
  }, [promptSummary]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    if (!next || busy) {
      return;
    }
    setDraft("");
    await onSend(next);
  }

  async function handleApplySummary() {
    const nextSummary = summaryDraft.trim();
    onPromptSummaryChange(nextSummary);
    if (!nextSummary || busy) {
      return;
    }
    await onApplyPromptSummary(nextSummary);
    setSummaryOpen(false);
  }

  return (
    <section className="panel-surface flex h-full max-h-[68vh] flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-panel xl:max-h-[74vh]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-steel">Interviewing analyst</p>
          <h2 className="font-serif text-2xl text-ink">Clarify missing requirements</h2>
          <p className="mt-1 text-sm leading-6 text-steel">
            Use this space to provide the instructions the analyst should follow while filling out the specification template.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSummaryOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-steel transition hover:border-ember hover:text-ink"
            aria-label={summaryOpen ? "Hide summarized prompt" : "Show summarized prompt"}
            title="Check or edit the saved summarized prompt"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {!llmAvailable ? (
            <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700">
              <TriangleAlert className="h-4 w-4" />
              <span>LLM offline</span>
            </div>
          ) : null}
        </div>
      </div>

      {summaryOpen ? (
        <div className="mb-4 rounded-[1.5rem] border border-stone-200 bg-[#fff8ee] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-steel">Summarized prompt</p>
              <p className="mt-1 text-sm leading-6 text-steel">
                This saved summary is built from the user inputs and can be replayed to repopulate the draft after loading a scenario.
              </p>
            </div>
          </div>
          <textarea
            value={summaryDraft}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSummaryDraft(nextValue);
              onPromptSummaryChange(nextValue);
            }}
            rows={6}
            placeholder="The summarized prompt will appear here after the analyst processes your inputs. You can edit it before saving or reapplying it."
            className="mt-3 min-h-[9rem] w-full resize-y rounded-[1.25rem] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-ember"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setSummaryDraft(promptSummary);
                setSummaryOpen(false);
              }}
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-steel transition hover:border-stone-400 hover:text-ink"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void handleApplySummary()}
              disabled={busy || !summaryDraft.trim()}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-[#1e2230] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Apply summary
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto pr-2">
        {messages.map((message, index) => (
          <article
            key={`${message.role}-${index}`}
            className={[
              "max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-6",
              message.role === "user"
                ? "ml-auto bg-ink text-sand"
                : message.role === "assistant"
                  ? "bg-sand text-ink"
                  : "bg-white text-steel",
            ].join(" ")}
          >
            {message.content}
          </article>
        ))}
        {busy ? (
          <div className="flex items-center gap-2 text-sm text-steel">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span>Updating draft state</span>
          </div>
        ) : null}
      </div>

      <form className="mt-4 flex flex-col gap-3 border-t border-stone-200/80 pt-4" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={7}
          placeholder="Provide the instructions that should guide completion of the spec template: scope, constraints, required sections, user roles, edge cases, acceptance criteria, or which section to focus on next."
          className="min-h-[10.5rem] resize-y rounded-3xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-ember"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex h-fit items-center justify-center gap-2 self-end rounded-full bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#bc4d2d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <SendHorizontal className="h-4 w-4" />
          Send
        </button>
      </form>
    </section>
  );
});