import { User, Bot, Copy, Check } from "lucide-react";
import { useState } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface AIChatPanelProps {
  messages: ChatMessage[];
  loading?: boolean;
  onClear?: () => void;
}

export function AIChatPanel({
  messages,
  loading = false,
  onClear,
}: AIChatPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-slate-900/70 shadow-glow backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <h3 className="text-h3 font-semibold text-white">AI Chat</h3>
        {onClear && (
          <button
            onClick={onClear}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white"
            type="button"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <p>No messages yet. Start a conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              {/* Avatar */}
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  message.role === "user"
                    ? "bg-brand-500 text-white"
                    : message.role === "assistant"
                      ? "bg-accent text-white"
                      : "bg-slate-700 text-slate-400"
                }`}
              >
                {message.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : message.role === "assistant" ? (
                  <Bot className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>

              {/* Message Content */}
              <div
                className={`flex max-w-[80%] flex-col gap-1 ${
                  message.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`rounded-2xl px-4 py-3 ${
                    message.role === "user"
                      ? "bg-brand-500 text-white"
                      : message.role === "assistant"
                        ? "bg-slate-800 text-slate-100"
                        : "bg-slate-900/50 text-slate-400"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {formatTimestamp(message.timestamp)}
                  </span>
                  {message.role === "assistant" && (
                    <button
                      onClick={() => handleCopy(message.content, message.id)}
                      className="text-slate-500 transition hover:text-slate-300"
                      type="button"
                      aria-label="Copy message"
                    >
                      {copiedId === message.id ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <Bot className="h-4 w-4 animate-pulse" />
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" />
              <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce delay-100" />
              <div className="h-2 w-2 rounded-full bg-slate-400 animate-bounce delay-200" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
