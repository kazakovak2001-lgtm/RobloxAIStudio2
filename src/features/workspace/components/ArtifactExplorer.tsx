import { useEffect, useState } from "react";
import {
  FileJson,
  FileCode,
  FileText,
  Package,
  Layout,
  Image,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Card } from "../../../components/ui/Card";
import {
  getArtifacts,
  getArtifactDetail,
  type ArtifactSummary,
  type ArtifactDetail,
  type ArtifactType,
} from "../../../services/conceptApi";

interface ArtifactExplorerProps {
  pipelineId: string | null;
}

export function ArtifactExplorer({ pipelineId }: ArtifactExplorerProps) {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [selectedArtifact, setSelectedArtifact] =
    useState<ArtifactDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  useEffect(() => {
    if (!pipelineId) {
      setArtifacts([]);
      setSelectedArtifact(null);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      const result = await getArtifacts(pipelineId);
      if (result.success && result.data) {
        setArtifacts(result.data);
      }
      setIsLoading(false);
    };
    load();
  }, [pipelineId]);

  const handleSelect = async (artifactId: string) => {
    setIsDetailLoading(true);
    const result = await getArtifactDetail(artifactId);
    if (result.success && result.data) {
      setSelectedArtifact(result.data);
    }
    setIsDetailLoading(false);
  };

  if (!pipelineId) return null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Artifact Explorer</p>
        <span className="text-xs text-slate-500">
          {artifacts.length} artifact{artifacts.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="mt-3 flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        </div>
      ) : artifacts.length === 0 ? (
        <p className="mt-3 text-center text-xs text-slate-500">
          No artifacts yet. Generate an experience first.
        </p>
      ) : (
        <div className="mt-3 space-y-1">
          {artifacts.map((artifact) => (
            <ArtifactRow
              key={artifact.id}
              artifact={artifact}
              isSelected={selectedArtifact?.id === artifact.id}
              onClick={() => handleSelect(artifact.id)}
            />
          ))}
        </div>
      )}

      {isDetailLoading && (
        <div className="mt-3 flex items-center justify-center border-t border-white/5 pt-3">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        </div>
      )}

      {selectedArtifact && !isDetailLoading && (
        <ArtifactDetailViewer artifact={selectedArtifact} />
      )}
    </Card>
  );
}

function ArtifactRow({
  artifact,
  isSelected,
  onClick,
}: {
  artifact: ArtifactSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
        isSelected
          ? "border border-brand-500/30 bg-brand-500/10"
          : "border border-transparent bg-white/[0.02] hover:bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <ArtifactIcon type={artifact.type} />
        <div>
          <p
            className={`font-medium ${isSelected ? "text-brand-300" : "text-slate-300"}`}
          >
            {formatStageName(artifact.stage)}
          </p>
          <p className="text-[10px] text-slate-500">
            {artifact.name} • {formatBytes(artifact.sizeBytes)}
          </p>
        </div>
      </div>
      <ChevronRight
        className={`h-3 w-3 ${isSelected ? "text-brand-400" : "text-slate-600"}`}
      />
    </button>
  );
}

function ArtifactDetailViewer({ artifact }: { artifact: ArtifactDetail }) {
  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-300">{artifact.name}</p>
        <div className="flex items-center gap-2">
          {artifact.agent && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
              {artifact.agent}
            </span>
          )}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${artifact.validated ? "bg-green-500/10 text-green-400" : "bg-slate-500/10 text-slate-400"}`}
          >
            {artifact.validated ? "validated" : "pending"}
          </span>
        </div>
      </div>
      <ContentRenderer type={artifact.type} content={artifact.content} />
    </div>
  );
}

function ContentRenderer({
  type,
  content,
}: {
  type: ArtifactType;
  content: unknown;
}) {
  if (type === "lua") {
    const code =
      typeof content === "string" ? content : JSON.stringify(content, null, 2);
    return (
      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-emerald-300">
        <code>{code}</code>
      </pre>
    );
  }

  if (type === "markdown") {
    const text =
      typeof content === "string" ? content : JSON.stringify(content, null, 2);
    return (
      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-300 whitespace-pre-wrap">
        {text}
      </pre>
    );
  }

  // JSON, manifest, ui-layout, asset-plan, text
  const formatted =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-cyan-300">
      <code>{formatted}</code>
    </pre>
  );
}

function ArtifactIcon({ type }: { type: ArtifactType }) {
  switch (type) {
    case "lua":
      return <FileCode className="h-3.5 w-3.5 text-emerald-400" />;
    case "markdown":
      return <FileText className="h-3.5 w-3.5 text-purple-400" />;
    case "manifest":
      return <Package className="h-3.5 w-3.5 text-orange-400" />;
    case "ui-layout":
      return <Layout className="h-3.5 w-3.5 text-pink-400" />;
    case "asset-plan":
      return <Image className="h-3.5 w-3.5 text-yellow-400" />;
    default:
      return <FileJson className="h-3.5 w-3.5 text-cyan-400" />;
  }
}

function formatStageName(name: string): string {
  return name
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
