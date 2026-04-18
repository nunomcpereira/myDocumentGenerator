import { FileText } from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
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
  const cancelReplayRef = useRef(false);
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

    cancelReplayRef.current = false;
    void handleReplayPromptSequence(snapshot.promptSequence);

    return () => {
      cancelReplayRef.current = true;
    };
  }, [onUpdated, snapshot]);

  async function handleReplayPromptSequence(promptSequence: string[]) {
    const cancelled = () => cancelReplayRef.current;
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
        if (cancelled()) {
          return;
        }
        setMessages((current) => [...current, { role: "user", content: prompt }]);
        const response = await sendChatMessage(snapshot.sessionId!, prompt, snapshot.mcpServers, false);
        if (cancelled()) {
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
      if (cancelled()) {
        return;
      }
      const error = caught instanceof Error ? caught.message : "Chat request failed.";
      setMessages((current) => [...current, { role: "system", content: error }]);
      setLlmAvailable(false);
      startTransition(() => {
        onUpdated(nextSnapshot);
      });
    } finally {
      if (!cancelled()) {
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

  const completedSections = snapshot.draftState?.sections.filter((s) => s.status === "complete").length ?? 0;
  const totalSections = snapshot.draftState?.sections.length ?? 0;
  const allDone = totalSections > 0 && completedSections === totalSections;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="premium-card rounded-[2rem] p-8 flex flex-wrap items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <FileText className="h-32 w-32 -mr-8 -mt-8" />
        </div>
        
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Phase 2</p>
          </div>
          <h1 className="font-headline text-4xl font-bold text-ink mb-2 tracking-tight">Refinement Workstation</h1>
          <p className="text-steel max-w-xl text-sm leading-relaxed">
            Collaborate with the AI analyst to hydrate the draft with domain-specific details. The projected specification updates live as you provide information.
          </p>
        </div>

        <div className="relative z-10">
          <div className={[
            "flex flex-col items-end gap-2 p-6 rounded-3xl border transition-all shadow-sm",
            allDone
              ? "border-success/30 bg-success/5 text-success"
              : "border-ui-outline-soft bg-surface-muted text-steel",
          ].join(" ")}>
            <div className="flex items-center gap-2">
              <div className={[
                "h-2 w-2 rounded-full",
                allDone ? "bg-success shadow-glow-success" : totalSections === 0 ? "bg-ui-outline-medium" : "bg-warning animate-pulse"
              ].join(" ")} />
              <span className="text-xs font-bold uppercase tracking-wider">{completedSections} of {totalSections} Sections Complete</span>
            </div>
            <div className="w-48 h-1.5 bg-ui-outline-soft rounded-full overflow-hidden">
              <div 
                className={["h-full transition-all duration-500", allDone ? "bg-success" : "bg-primary"].join(" ")}
                style={{ width: `${totalSections > 0 ? (completedSections / totalSections) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_auto]">
        <div className="space-y-8">
          <McpServerSelector
            mcpCatalog={mcpCatalog}
            selectedMcpServers={snapshot.mcpServers}
            onSelectedMcpServersChange={onSelectedMcpServersChange}
          />

          <section className="premium-card rounded-[2rem] p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-steel-muted mb-4 px-2">Environment Context</h3>
            <div className="flex flex-wrap gap-2">
              {snapshot.loadedFiles.map((file) => (
                <a
                  key={`${file.kind}-${file.file_name}`}
                  href={buildSessionFileUrl(file.download_path)}
                  target="_blank"
                  rel="noreferrer"
                  title={file.file_name}
                  className="group flex items-center gap-3 bg-surface-muted border border-ui-outline-soft rounded-xl px-4 py-2 text-xs transition-all hover:border-primary/30 hover:bg-white hover:shadow-sm"
                >
                  <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <FileText className="h-3 w-3" />
                  </div>
                  <div>
                    <span className="font-bold text-ink block capitalize">{file.kind.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-steel-muted truncate max-w-[120px] block">{file.file_name}</span>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <div className="grid min-h-[650px] gap-8 lg:grid-cols-[450px_1fr]">
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
            <MarkdownPreview
              value={deferredPreviewMarkdown}
              mode={previewMode}
              onModeChange={setPreviewMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
