import { useState, useEffect } from "react";
import { AIChatPanel, PromptInput, AgentCard } from "@/shared/ui/ai";
import { Card } from "@/shared/ui/Card";
import { Loader } from "@/shared/ui/Loader";
import { getAgents, type AgentInfo } from "@/services/systemApi";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export default function AiStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Fetch real agents from backend
  useEffect(() => {
    getAgents().then((data) => {
      setAgents(data);
      setAgentsLoading(false);
    });
  }, []);

  const handleSubmit = async () => {
    if (!prompt.trim() || generating) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setPrompt("");
    setGenerating(true);

    try {
      // Send full conversation history to AI chat endpoint
      const chatMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatMessages }),
      });

      const json = await response.json();

      if (response.ok && json.success && json.data) {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: json.data.content,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Chat endpoint failed — show error, do NOT fall back to template generation
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "system",
          content:
            json.error ??
            "AI chat unavailable. Start the backend server: npm run dev:server",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (err) {
      const crashMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        role: "system",
        content: `Error: ${err instanceof Error ? err.message : "Unknown"}. Try again.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, crashMessage]);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
          AI Studio
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">AI Workspace</h1>
        <p className="mt-2 text-slate-400">
          Generate Roblox Lua code from natural language descriptions.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-xl font-semibold text-white mb-4">Chat</h2>
            <AIChatPanel
              messages={messages}
              loading={generating}
              onClear={() => setMessages([])}
            />
            <div className="mt-4">
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                onSubmit={handleSubmit}
                placeholder="Describe the game system you want to generate..."
                disabled={generating}
                templates={[
                  {
                    name: "Mining Simulator",
                    content:
                      "Create a mining simulator with pickaxes, ores, and rebirth system",
                  },
                  {
                    name: "Obby Checkpoint",
                    content:
                      "Create an obby with checkpoints, timer, and leaderboard",
                  },
                  {
                    name: "Pet System",
                    content:
                      "Create a pet collection system with hatching, upgrading, and trading",
                  },
                ]}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-semibold text-white mb-4">Agents</h3>
            {agentsLoading ? (
              <div className="flex justify-center py-4">
                <Loader size="sm" label="Loading agents..." />
              </div>
            ) : agents.length === 0 ? (
              <p className="text-sm text-slate-400">No agents registered.</p>
            ) : (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={{
                      id: agent.id,
                      name: agent.name,
                      description: agent.description,
                      version: agent.version,
                      status: "ready",
                    }}
                    onSelect={() => setSelectedAgent(agent.id)}
                    onConfigure={() => setSelectedAgent(agent.id)}
                    selected={selectedAgent === agent.id}
                  />
                ))}
              </div>
            )}
          </Card>

          {selectedAgent && (
            <Card>
              <h3 className="text-lg font-semibold text-white mb-2">
                Selected Agent
              </h3>
              <p className="text-sm text-slate-400">
                {agents.find((a) => a.id === selectedAgent)?.name ?? "Unknown"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {agents.find((a) => a.id === selectedAgent)?.description}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
