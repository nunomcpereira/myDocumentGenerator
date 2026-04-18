import type { McpServerCatalogResponse } from "../lib/types";

type McpServerSelectorProps = {
  mcpCatalog: McpServerCatalogResponse | null;
  selectedMcpServers: string[];
  onSelectedMcpServersChange: (serverNames: string[]) => void;
  title?: string;
  description?: string;
};

export function McpServerSelector({
  mcpCatalog,
  selectedMcpServers,
  onSelectedMcpServersChange,
  title = "Integration Hub",
  description = "Select Docker MCP servers to extend the AI analyst's capabilities with real-time data and specialized tools.",
}: McpServerSelectorProps) {
  const unavailableSelectedServers = selectedMcpServers.filter(
    (serverName) => !mcpCatalog?.servers.some((server) => server.name === serverName),
  );

  function toggleMcpServer(serverName: string) {
    const nextSelection = selectedMcpServers.includes(serverName)
      ? selectedMcpServers.filter((item) => item !== serverName)
      : [...selectedMcpServers, serverName];
    onSelectedMcpServersChange(nextSelection);
  }

  return (
    <section className="premium-card rounded-[2rem] p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <div className="inline-flex items-center gap-2 bg-accent/10 px-3 py-1 rounded-full mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-accent">Capabilities</p>
          </div>
          <h2 className="font-headline text-2xl font-bold text-ink mb-2">{title}</h2>
          <p className="text-sm leading-relaxed text-steel max-w-2xl">{description}</p>
        </div>
        <div className={[
          "rounded-xl px-4 py-2 text-xs font-bold border flex items-center gap-2 transition-all shadow-sm",
          mcpCatalog?.available
            ? "bg-success/5 text-success border-success/20"
            : "bg-danger/5 text-danger border-danger/20",
        ].join(" ")}>
          <div className={["h-1.5 w-1.5 rounded-full", mcpCatalog?.available ? "bg-success shadow-glow-success animate-pulse" : "bg-danger"].join(" ")} />
          {mcpCatalog?.available ? "Discovery Active" : "Engine Offline"}
        </div>
      </div>

      {mcpCatalog?.available ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mcpCatalog.servers.length === 0 ? <p className="text-sm text-steel-muted italic py-4">No tool servers discovered in current environment.</p> : null}
          {mcpCatalog.servers.map((server) => {
            const selected = selectedMcpServers.includes(server.name);
            return (
              <button
                key={server.name}
                type="button"
                onClick={() => toggleMcpServer(server.name)}
                className={[
                  "p-5 rounded-2xl border text-left transition-all duration-300",
                  selected
                    ? "bg-white border-primary shadow-glow ring-4 ring-primary/5"
                    : "bg-surface-muted border-ui-outline-soft hover:border-primary/30 hover:bg-white hover:shadow-premium",
                ].join(" ")}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={["text-sm font-bold transition-colors", selected ? "text-primary" : "text-ink"].join(" ")}>{server.name}</span>
                  {selected && <div className="h-4 w-4 bg-primary rounded-full flex items-center justify-center text-[8px] text-white">✓</div>}
                </div>
                {server.description ? <span className="block text-xs text-steel-muted leading-relaxed line-clamp-2">{server.description}</span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="p-6 rounded-2xl bg-danger/5 border border-danger/10 text-danger text-sm font-medium">
          {mcpCatalog?.detail ?? "Docker MCP discovery is currently unavailable from the backend."}
        </div>
      )}

      {unavailableSelectedServers.length > 0 ? (
        <div className="mt-6 p-4 rounded-xl bg-warning/10 border border-warning/20 text-warning-dark text-xs font-bold flex items-center gap-2">
          <span className="shrink-0">⚠️</span>
          <span>Ghost servers detected: {unavailableSelectedServers.join(", ")}</span>
        </div>
      ) : null}
    </section>
  );
}