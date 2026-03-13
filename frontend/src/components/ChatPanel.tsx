import { LoaderCircle, SendHorizontal, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { ChatMessage } from "../lib/types";

type ChatPanelProps = {
  messages: ChatMessage[];
  busy: boolean;
  llmAvailable: boolean;
  onSend: (message: string) => Promise<void>;
};

export function ChatPanel({ messages, busy, llmAvailable, onSend }: ChatPanelProps) {
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
    <section className="flex h-full flex-col rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-panel backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-steel">Interviewing analyst</p>
          <h2 className="font-serif text-2xl text-ink">Clarify missing requirements</h2>
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

      <form className="mt-4 flex gap-3" onSubmit={handleSubmit}>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder="Add project details, constraints, user roles, edge cases, or ask the analyst to focus on a section."
          className="flex-1 resize-none rounded-3xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-ember"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex h-fit items-center gap-2 rounded-full bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#bc4d2d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <SendHorizontal className="h-4 w-4" />
          Send
        </button>
      </form>
    </section>
  );
}