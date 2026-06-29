import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Search, Filter } from "lucide-react";
import { Card } from "../../../components/ui/Card";

interface LiveConsoleProps {
  logs: string[];
}

function LiveConsoleComponent({ logs }: LiveConsoleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [logs, query, filter]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return logs
      .filter((log) => {
        if (filter === "all") return true;
        return log.toLowerCase().includes(filter.toLowerCase());
      })
      .filter((log) =>
        normalizedQuery ? log.toLowerCase().includes(normalizedQuery) : true,
      )
      .slice(-300);
  }, [filter, logs, query]);

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Live console</p>
            <p className="text-xs text-slate-500">
              SSE-backed event stream with filtering and search.
            </p>
          </div>
          <div className="rounded-full border border-brand-400/20 bg-brand-500/10 px-3 py-1 text-xs text-brand-200">
            {filteredRows.length} lines
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search logs"
              className="w-full bg-transparent outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            <Filter className="h-4 w-4 text-slate-500" />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="bg-transparent outline-none"
            >
              <option value="all">All agents</option>
              <option value="Planner">Planner</option>
              <option value="Designer">Designer</option>
              <option value="Architect">Architect</option>
              <option value="Lua">Lua</option>
              <option value="UI">UI</option>
              <option value="QA">QA</option>
            </select>
          </label>
        </div>

        <div
          ref={containerRef}
          className="h-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/80 p-3 font-mono"
        >
          {filteredRows.length === 0 ? (
            <p className="text-xs text-slate-500">No matching logs yet.</p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-300">
              {filteredRows.map((log, index) => {
                const isError =
                  log.toLowerCase().includes("error") ||
                  log.toLowerCase().includes("failed");
                const isSuccess =
                  log.toLowerCase().includes("completed") ||
                  log.toLowerCase().includes("done");
                return (
                  <li
                    key={`${log}-${index}`}
                    className={`whitespace-pre-wrap rounded-xl px-2 py-1 ${isError ? "bg-red-500/10 text-red-200" : isSuccess ? "bg-emerald-500/10 text-emerald-200" : "bg-white/5 text-slate-300"}`}
                  >
                    {log}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

export const LiveConsole = memo(LiveConsoleComponent);
export default LiveConsole;
