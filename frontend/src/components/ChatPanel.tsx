import { LoaderCircle, Pencil, Plus, SendHorizontal, Trash2, TriangleAlert } from "lucide-react";
import { memo, useEffect, useState } from "react";

import type { ChatMessage } from "../lib/types";

type ChatPanelProps = {
  messages: ChatMessage[];
  busy: boolean;
  llmAvailable: boolean;
  promptSequence: string[];
  onPromptSequenceChange: (value: string[]) => void;
  onReplayPromptSequence: (value: string[]) => Promise<void>;
  onSend: (message: string) => Promise<void>;
};

export const ChatPanel = memo(function ChatPanel({
  messages,
  busy,
  llmAvailable,
  promptSequence,
  onPromptSequenceChange,
  onReplayPromptSequence,
  onSend,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [savedPromptsOpen, setSavedPromptsOpen] = useState(false);
  const [promptDrafts, setPromptDrafts] = useState<string[]>(promptSequence);

  useEffect(() => {
    setPromptDrafts(promptSequence);
  }, [promptSequence]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    if (!next || busy) {
      return;
    }
    setDraft("");
    await onSend(next);
  }

  function updatePromptDrafts(nextDrafts: string[]) {
    setPromptDrafts(nextDrafts);
    onPromptSequenceChange(nextDrafts.map((item) => item.trim()).filter(Boolean));
  }

  async function handleReplaySavedPrompts() {
    const nextPrompts = promptDrafts.map((item) => item.trim()).filter(Boolean);
    onPromptSequenceChange(nextPrompts);
    if (nextPrompts.length === 0 || busy) {
      return;
    }
    await onReplayPromptSequence(nextPrompts);
    setSavedPromptsOpen(false);
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
            onClick={() => setSavedPromptsOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-steel transition hover:border-ember hover:text-ink"
            aria-label={savedPromptsOpen ? "Hide saved prompts" : "Show saved prompts"}
            title="Check or edit the saved prompt list"
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

      {savedPromptsOpen ? (
        <div className="mb-4 rounded-[1.5rem] border border-stone-200 bg-[#fff8ee] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-steel">Saved user prompts</p>
              <p className="mt-1 text-sm leading-6 text-steel">
                These exact user prompts are stored in order and replayed one after another when you reapply the scenario instructions.
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {promptDrafts.length > 0 ? promptDrafts.map((prompt, index) => (
              <div key={`saved-prompt-${index}`} className="rounded-[1.25rem] border border-stone-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-steel">Prompt {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => updatePromptDrafts(promptDrafts.filter((_, itemIndex) => itemIndex !== index))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 text-steel transition hover:border-rose-300 hover:text-rose-700"
                    aria-label={`Remove prompt ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <textarea
                  value={prompt}
                  onChange={(event) => {
                    const nextDrafts = [...promptDrafts];
                    nextDrafts[index] = event.target.value;
                    updatePromptDrafts(nextDrafts);
                  }}
                  rows={4}
                  placeholder="Enter the exact user instruction to replay at this step."
                  className="min-h-[7rem] w-full resize-y rounded-[1rem] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-ember"
                />
              </div>
            )) : (
              <div className="rounded-[1.25rem] border border-dashed border-stone-200 bg-white/70 px-4 py-5 text-sm text-steel">
                No saved prompts yet. User messages you send here will accumulate in this list.
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPromptDrafts(promptSequence);
                setSavedPromptsOpen(false);
              }}
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-steel transition hover:border-stone-400 hover:text-ink"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => updatePromptDrafts([...promptDrafts, ""])}
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-steel transition hover:border-ember hover:text-ink"
            >
              <Plus className="h-4 w-4" />
              Add prompt
            </button>
            <button
              type="button"
              onClick={() => void handleReplaySavedPrompts()}
              disabled={busy || promptDrafts.every((item) => !item.trim())}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-sand transition hover:bg-[#1e2230] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Replay prompts
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