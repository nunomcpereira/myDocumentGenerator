import { useState } from "react";
import { Navigate } from "react-router-dom";

import { sendChatMessage } from "../api/client";
import { ChatPanel } from "../components/ChatPanel";
import { MarkdownPreview } from "../components/MarkdownPreview";
import type { ChatMessage, SessionSnapshot } from "../lib/types";

type RefinementScreenProps = {
  snapshot: SessionSnapshot;
  onUpdated: (snapshot: SessionSnapshot) => void;
};

export function RefinementScreen({ snapshot, onUpdated }: RefinementScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "The template is initialized. Describe the project scope, intended audience, constraints, and any non-functional requirements so I can complete the draft spec.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState(true);

  if (!snapshot.sessionId) {
    return <Navigate to="/" replace />;
  }

  async function handleSend(message: string) {
    setBusy(true);
    setMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const response = await sendChatMessage(snapshot.sessionId!, message);
      setMessages((current) => [...current, { role: "assistant", content: response.assistant_message }]);
      setLlmAvailable(response.llm_available);
      onUpdated({
        ...snapshot,
        prompt: message,
        draftState: response.draft_state,
        previewMarkdown: response.preview_markdown,
        warnings: response.warnings,
      });
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : "Chat request failed.";
      setMessages((current) => [
        ...current,
        { role: "system", content: error },
      ]);
      setLlmAvailable(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-panel backdrop-blur">
        <p className="text-xs uppercase tracking-[0.24em] text-steel">Phase 2</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl text-ink">Refinement workstation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-steel">
              The analyst interviews for missing information while the projected spec updates live. Every interaction goes through the REST API so the same flow can run headless in batch mode.
            </p>
          </div>
          <div className="rounded-3xl bg-sand/80 px-4 py-3 text-sm text-ink">
            {snapshot.draftState?.sections.filter((section) => section.status === "complete").length ?? 0}/{snapshot.draftState?.sections.length ?? 0} sections complete
          </div>
        </div>
      </div>

      <div className="grid min-h-[65vh] gap-6 xl:grid-cols-2">
        <ChatPanel messages={messages} busy={busy} llmAvailable={llmAvailable} onSend={handleSend} />
        <MarkdownPreview value={snapshot.previewMarkdown} />
      </div>
    </div>
  );
}