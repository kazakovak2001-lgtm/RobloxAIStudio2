import { LiveConsole } from "../../components/LiveConsole";

interface ConsoleTabProps {
  logs: string[];
}

export default function ConsoleTab({ logs }: ConsoleTabProps) {
  return (
    <div className="h-full">
      <LiveConsole logs={logs} />
    </div>
  );
}
