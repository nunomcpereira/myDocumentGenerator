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
  title = "Docker MCP servers for this session",
  description = "Choose the Docker MCP servers the analyst and translation pipeline should use for this working session. These selections are also saved with the scenario.",
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
    <section className="panel-surface rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-steel">MCP Context</p>
          <h2 className="mt-2 font-serif text-2xl text-ink">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">{description}</p>
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-steel">
          {mcpCatalog?.available ? `${mcpCatalog.servers.length} available` : "Unavailable"}
        </div>
      </div>

      {mcpCatalog?.available ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {mcpCatalog.servers.length === 0 ? <p className="text-sm text-steel">No Docker MCP servers are currently enabled.</p> : null}
          {mcpCatalog.servers.map((server) => {
            const selected = selectedMcpServers.includes(server.name);
            return (
              <button
                key={server.name}
                type="button"
                onClick={() => toggleMcpServer(server.name)}
                className={[
                  "selection-chip rounded-2xl border px-4 py-3 text-left text-sm transition",
                  selected
                    ? "selection-chip-active border-ink bg-ink text-sand"
                    : "selection-chip-inactive border-stone-300 bg-white text-ink hover:border-ember",
                ].join(" ")}
                aria-pressed={selected}
              >
                <span className="block font-semibold">{server.name}</span>
                {server.description ? <span className="mt-1 block text-xs opacity-80">{server.description}</span> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-steel">
          {mcpCatalog?.detail ?? "Docker MCP discovery is currently unavailable from the backend."}
        </p>
      )}

      {unavailableSelectedServers.length > 0 ? (
        <p className="mt-4 text-sm text-amber-800">
          Saved selection not currently available: {unavailableSelectedServers.join(", ")}.
        </p>
      ) : null}
    </section>
  );
}