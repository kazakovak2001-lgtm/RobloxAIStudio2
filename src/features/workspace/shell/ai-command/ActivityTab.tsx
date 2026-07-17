import { ActivityFeed } from "../../components/ActivityFeed";
import type { PipelineStreamMessage } from "../../types";

interface ActivityTabProps {
  events: PipelineStreamMessage[];
}

export default function ActivityTab({ events }: ActivityTabProps) {
  return (
    <div className="h-full">
      <ActivityFeed events={events} />
    </div>
  );
}
