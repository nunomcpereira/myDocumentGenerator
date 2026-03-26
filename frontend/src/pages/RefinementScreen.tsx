import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { buildSessionFileUrl, sendChatMessage } from "../api/client";
import { ChatPanel } from "../components/ChatPanel";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { McpServerSelector } from "../components/McpServerSelector";
import type { ChatMessage, McpServerCatalogResponse, SessionSnapshot } from "../lib/types";

type RefinementScreenProps = {
  snapshot: SessionSnapshot;
  mcpCatalog: McpServerCatalogResponse | null;
  onSelectedMcpServersChange: (serverNames: string[]) => void;
  onUpdated: (snapshot: SessionSnapshot) => void;
};

export function RefinementScreen({ snapshot, mcpCatalog, onSelectedMcpServersChange, onUpdated }: RefinementScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      role: "assistant",
      content:
        "The template is initialized. Describe the project scope, intended audience, constraints, and any non-functional requirements so I can complete the draft spec.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState(true);
  const [previewMode, setPreviewMode] = useState<"html" | "markdown">("html");
  const deferredPreviewMarkdown = useDeferredValue(snapshot.previewMarkdown);

  function formatPromptSequence(promptSequence: string[]) {
    return promptSequence.filter((item) => item.trim()).join("\n\n");
  }

  if (!snapshot.sessionId) {
    return <Navigate to="/" replace />;
  }

  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content:
          "The template is initialized. Describe the project scope, intended audience, constraints, and any non-functional requirements so I can complete the draft spec.",
      },
    ]);
    setLlmAvailable(true);
  }, [snapshot.sessionId]);

  useEffect(() => {
    if (!snapshot.sessionId || !snapshot.autoApplyPromptOnRefine || snapshot.promptSequence.length === 0) {
      return;
    }

    let cancelled = false;

    void handleReplayPromptSequence(snapshot.promptSequence, cancelled);

    return () => {
      cancelled = true;
    };
  }, [onUpdated, snapshot]);

  async function handleReplayPromptSequence(promptSequence: string[], cancelled = false) {
    const prompts = promptSequence.map((item) => item.trim()).filter(Boolean);
    if (prompts.length === 0) {
      startTransition(() => {
        onUpdated({
          ...snapshot,
          prompt: "",
          promptSequence: [],
          autoApplyPromptOnRefine: false,
        });
      });
      return;
    }

    setBusy(true);
    let nextSnapshot = {
      ...snapshot,
      prompt: formatPromptSequence(prompts),
      promptSequence: prompts,
      autoApplyPromptOnRefine: false,
    };

    try {
      for (const prompt of prompts) {
        if (cancelled) {
          return;
        }
        setMessages((current) => [...current, { role: "user", content: prompt }]);
        const response = await sendChatMessage(snapshot.sessionId!, prompt, snapshot.mcpServers, false);
        if (cancelled) {
          return;
        }
        setMessages((current) => [...current, { role: "assistant", content: response.assistant_message }]);
        setLlmAvailable(response.llm_available);
        nextSnapshot = {
          ...nextSnapshot,
          prompt: response.prompt ?? nextSnapshot.prompt,
          promptSequence: response.prompt_sequence.length > 0 ? response.prompt_sequence : prompts,
          draftState: response.draft_state,
          previewMarkdown: response.preview_markdown,
          warnings: response.warnings,
        };
        startTransition(() => {
          onUpdated(nextSnapshot);
        });
      }
    } catch (caught) {
      if (cancelled) {
        return;
      }
      const error = caught instanceof Error ? caught.message : "Chat request failed.";
      setMessages((current) => [...current, { role: "system", content: error }]);
      setLlmAvailable(false);
      startTransition(() => {
        onUpdated(nextSnapshot);
      });
    } finally {
      if (!cancelled) {
        setBusy(false);
      }
    }
  }

  async function handleSend(message: string) {
    setBusy(true);
    setMessages((current) => [...current, { role: "user", content: message }]);
    try {
      const response = await sendChatMessage(snapshot.sessionId!, message, snapshot.mcpServers);
      setMessages((current) => [...current, { role: "assistant", content: response.assistant_message }]);
      setLlmAvailable(response.llm_available);
      startTransition(() => {
        onUpdated({
          ...snapshot,
          prompt: response.prompt ?? snapshot.prompt,
          promptSequence: response.prompt_sequence,
          autoApplyPromptOnRefine: false,
          draftState: response.draft_state,
          previewMarkdown: response.preview_markdown,
          warnings: response.warnings,
        });
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
      <div className="panel-surface rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-panel">
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

        <McpServerSelector
          mcpCatalog={mcpCatalog}
          selectedMcpServers={snapshot.mcpServers}
          onSelectedMcpServersChange={onSelectedMcpServersChange}
        />

      <section className="panel-surface rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.24em] text-steel">Loaded files</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {snapshot.loadedFiles.map((file) => (
            <a
              key={`${file.kind}-${file.file_name}`}
              href={buildSessionFileUrl(file.download_path)}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm text-ink transition hover:border-ember"
            >
              {file.kind.replace("_", " ")}: {file.file_name}
            </a>
          ))}
        </div>
      </section>

      <div className="grid min-h-[58vh] gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <ChatPanel
          messages={messages}
          busy={busy}
          llmAvailable={llmAvailable}
          promptSequence={snapshot.promptSequence}
          onPromptSequenceChange={(promptSequence) => onUpdated({
            ...snapshot,
            prompt: formatPromptSequence(promptSequence),
            promptSequence,
            autoApplyPromptOnRefine: false,
          })}
          onReplayPromptSequence={handleReplayPromptSequence}
          onSend={handleSend}
        />
        <MarkdownPreview value={deferredPreviewMarkdown} mode={previewMode} onModeChange={setPreviewMode} />
      </div>
    </div>
  );
}