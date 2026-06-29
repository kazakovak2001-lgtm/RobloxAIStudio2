import { memo } from "react";
import { Activity as ActivityIcon } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import type { PipelineStreamMessage } from "../workspace.types";

interface ActivityFeedProps {
  events: PipelineStreamMessage[];
}

function ActivityFeedComponent({ events }: ActivityFeedProps) {
  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="rounded-2xl bg-cyan-500/10 p-2 text-cyan-300">
            <ActivityIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Activity feed</p>
            <p className="text-xs text-slate-500">
              SSE event timeline for the active pipeline.
            </p>
          </div>
        </div>
        <div className="space-y-2 text-xs text-slate-300">
          {events.length === 0 ? (
            <p className="text-slate-500">No activity yet.</p>
          ) : (
            events.slice(-50).map((event) => (
              <div
                key={`${event.type}-${event.timestamp}`}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-200">{event.type}</p>
                  <span className="text-[11px] text-slate-500">
                    {event.timestamp?.slice(11, 19)}
                  </span>
                </div>
                {event.data && (
                  <pre className="mt-1 whitespace-pre-wrap text-slate-400">
                    {JSON.stringify(event.data)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

export const ActivityFeed = memo(ActivityFeedComponent);
export default ActivityFeed;
