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
    <section className="flex flex-col h-full bg-white rounded-[2rem] border border-ui-outline-soft shadow-premium overflow-hidden">
      <div className="p-6 border-b border-ui-outline-soft flex items-center justify-between bg-surface-muted/30">
        <div>
          <h2 className="font-headline text-lg font-bold text-ink">AI Analyst</h2>
          <div className="flex items-center gap-1.5">
            <div className={["h-1.5 w-1.5 rounded-full", llmAvailable ? "bg-success" : "bg-danger"].join(" ")} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-steel-muted">{llmAvailable ? "Online" : "Offline"}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSavedPromptsOpen((current) => !current)}
          className={[
            "h-10 w-10 flex items-center justify-center rounded-xl transition-all border",
            savedPromptsOpen ? "bg-primary text-white border-primary shadow-glow" : "bg-white text-steel border-ui-outline-soft hover:border-primary/30"
          ].join(" ")}
          title="Sequence Editor"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative">
        {savedPromptsOpen && (
          <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm p-6 overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-headline font-bold text-ink text-sm">Instruction Sequence</h3>
              <button
                type="button"
                onClick={() => setSavedPromptsOpen(false)}
                className="text-xs font-bold text-primary hover:underline"
              >
                Done
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              {promptDrafts.map((prompt, index) => (
                <div key={`saved-prompt-${index}`} className="p-4 rounded-2xl bg-surface-muted border border-ui-outline-soft">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase text-steel-muted tracking-widest">Step {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => updatePromptDrafts(promptDrafts.filter((_, i) => i !== index))}
                      className="text-danger hover:scale-110 transition-transform"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={prompt}
                    onChange={(event) => {
                      const next = [...promptDrafts];
                      next[index] = event.target.value;
                      updatePromptDrafts(next);
                    }}
                    rows={3}
                    className="w-full bg-white border border-ui-outline-soft rounded-xl p-3 text-xs focus:border-primary outline-none transition-all"
                  />
                </div>
              ))}
              
              <button
                type="button"
                onClick={() => updatePromptDrafts([...promptDrafts, ""])}
                className="w-full p-4 rounded-2xl border-2 border-dashed border-ui-outline-soft text-steel-muted hover:border-primary/30 hover:text-primary transition-all flex items-center justify-center gap-2 text-xs font-bold"
              >
                <Plus className="h-4 w-4" />
                Add Step
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleReplaySavedPrompts()}
              disabled={busy || promptDrafts.every(p => !p.trim())}
              className="btn-primary w-full flex items-center justify-center gap-2 text-xs"
            >
              <Plus className="h-4 w-4 rotate-45" />
              Replay Full Sequence
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={[
                "flex flex-col max-w-[85%]",
                message.role === "user" ? "ml-auto items-end" : "items-start"
              ].join(" ")}
            >
              <div
                className={[
                  "px-5 py-3 rounded-[1.5rem] text-sm leading-relaxed",
                  message.role === "user"
                    ? "bg-primary text-white rounded-tr-none shadow-glow"
                    : message.role === "assistant"
                      ? "bg-surface-muted text-ink rounded-tl-none border border-ui-outline-soft"
                      : "bg-danger/10 text-danger text-xs italic border border-danger/20"
                ].join(" ")}
              >
                {message.content}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-steel-muted mt-2 px-1">
                {message.role === "user" ? "You" : message.role === "assistant" ? "Analyst" : "System"}
              </span>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-3 text-primary animate-pulse">
              <div className="flex gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.2s]" />
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.4s]" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest">Processing</span>
            </div>
          )}
        </div>

        <form className="p-4 border-t border-ui-outline-soft bg-surface-muted/30" onSubmit={handleSubmit}>
          <div className="relative">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type your instructions..."
              rows={3}
              className="w-full bg-white border border-ui-outline-soft rounded-2xl px-5 py-4 pr-14 text-sm focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all resize-none shadow-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit(e as any);
                }
              }}
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="absolute right-3 bottom-3 h-10 w-10 flex items-center justify-center rounded-xl bg-primary text-white shadow-glow hover:bg-primary-light active:scale-90 transition-all disabled:opacity-30 disabled:shadow-none"
            >
              <SendHorizontal className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-2 text-[10px] text-steel-muted text-center font-medium">Shift + Enter for new line</p>
        </form>
      </div>
    </section>
  );
});