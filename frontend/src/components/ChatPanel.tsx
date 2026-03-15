import { LoaderCircle, SendHorizontal, TriangleAlert } from "lucide-react";
import { memo, useState } from "react";

import type { ChatMessage } from "../lib/types";

type ChatPanelProps = {
  messages: ChatMessage[];
  busy: boolean;
  llmAvailable: boolean;
  onSend: (message: string) => Promise<void>;
};

export const ChatPanel = memo(function ChatPanel({ messages, busy, llmAvailable, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    if (!next || busy) {
      return;
    }
    setDraft("");
    await onSend(next);
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
        {!llmAvailable ? (
          <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700">
            <TriangleAlert className="h-4 w-4" />
            <span>LLM offline</span>
          </div>
        ) : null}
      </div>

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