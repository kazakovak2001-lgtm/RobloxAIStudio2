import { useEffect, useState, useCallback } from "react";
import {
  FileJson,
  FileCode,
  FileText,
  Package,
  Layout,
  Image,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  MessageSquare,
  Pencil,
  Save,
} from "lucide-react";
import { Card } from "../../../components/ui/Card";
import {
  getArtifacts,
  getArtifactDetail,
  approveArtifact,
  rejectArtifact,
  commentArtifact,
  editArtifact,
  type ArtifactSummary,
  type ArtifactDetail,
  type ArtifactType,
  type ReviewStatus,
} from "../../../services/conceptApi";

interface ArtifactExplorerProps {
  pipelineId: string | null;
  onReviewChange?: () => void;
}

export function ArtifactExplorer({
  pipelineId,
  onReviewChange,
}: ArtifactExplorerProps) {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [selectedArtifact, setSelectedArtifact] =
    useState<ArtifactDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const loadArtifacts = useCallback(async () => {
    if (!pipelineId) return;
    setIsLoading(true);
    const result = await getArtifacts(pipelineId);
    if (result.success && result.data) {
      setArtifacts(result.data);
    }
    setIsLoading(false);
  }, [pipelineId]);

  useEffect(() => {
    if (!pipelineId) {
      setArtifacts([]);
      setSelectedArtifact(null);
      return;
    }
    loadArtifacts();
  }, [pipelineId, loadArtifacts]);

  const handleSelect = async (artifactId: string) => {
    setIsDetailLoading(true);
    const result = await getArtifactDetail(artifactId);
    if (result.success && result.data) {
      setSelectedArtifact(result.data);
    }
    setIsDetailLoading(false);
  };

  const handleReviewAction = async () => {
    await loadArtifacts();
    if (selectedArtifact) {
      const refreshed = await getArtifactDetail(selectedArtifact.id);
      if (refreshed.success && refreshed.data) {
        setSelectedArtifact(refreshed.data);
      }
    }
    onReviewChange?.();
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
        <ArtifactDetailViewer
          artifact={selectedArtifact}
          onReviewAction={handleReviewAction}
        />
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
      <div className="flex items-center gap-1.5">
        <ReviewBadge status={artifact.reviewStatus} />
        <ChevronRight
          className={`h-3 w-3 ${isSelected ? "text-brand-400" : "text-slate-600"}`}
        />
      </div>
    </button>
  );
}

function ArtifactDetailViewer({
  artifact,
  onReviewAction,
}: {
  artifact: ArtifactDetail;
  onReviewAction: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [commentText, setCommentText] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async () => {
    setIsSubmitting(true);
    await approveArtifact(artifact.id);
    setIsSubmitting(false);
    onReviewAction();
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    await rejectArtifact(artifact.id, commentText || undefined);
    setCommentText("");
    setShowComment(false);
    setIsSubmitting(false);
    onReviewAction();
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setIsSubmitting(true);
    await commentArtifact(artifact.id, commentText);
    setCommentText("");
    setShowComment(false);
    setIsSubmitting(false);
    onReviewAction();
  };

  const handleStartEdit = () => {
    const content =
      typeof artifact.content === "string"
        ? artifact.content
        : JSON.stringify(artifact.content, null, 2);
    setEditContent(content);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    setIsSubmitting(true);
    let parsedContent: unknown = editContent;
    if (
      artifact.type !== "lua" &&
      artifact.type !== "markdown" &&
      artifact.type !== "text"
    ) {
      try {
        parsedContent = JSON.parse(editContent);
      } catch {
        parsedContent = editContent;
      }
    }
    await editArtifact(artifact.id, parsedContent);
    setIsEditing(false);
    setIsSubmitting(false);
    onReviewAction();
  };

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
          <ReviewBadge status={artifact.reviewStatus} />
        </div>
      </div>

      {/* Content viewer / editor */}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="h-48 w-full resize-y rounded-lg border border-white/10 bg-slate-950 p-3 font-mono text-[11px] text-cyan-300 outline-none focus:border-brand-400"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSaveEdit}
              disabled={isSubmitting}
              className="flex items-center gap-1 rounded-lg bg-brand-500/20 px-3 py-1.5 text-[11px] text-brand-300 hover:bg-brand-500/30 disabled:opacity-50"
            >
              <Save className="h-3 w-3" /> Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-[11px] text-slate-400 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <ContentRenderer type={artifact.type} content={artifact.content} />
      )}

      {/* Review comment display */}
      {artifact.reviewComment && (
        <div className="mt-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
          <p className="text-[10px] text-slate-500">Review comment:</p>
          <p className="text-xs text-slate-300">{artifact.reviewComment}</p>
        </div>
      )}

      {/* Review actions */}
      {!isEditing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={handleApprove}
            disabled={isSubmitting || artifact.reviewStatus === "approved"}
            className="flex items-center gap-1 rounded-lg bg-green-500/10 px-2.5 py-1.5 text-[11px] text-green-400 hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle className="h-3 w-3" /> Approve
          </button>
          <button
            onClick={handleReject}
            disabled={isSubmitting || artifact.reviewStatus === "rejected"}
            className="flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle className="h-3 w-3" /> Reject
          </button>
          <button
            onClick={() => setShowComment(!showComment)}
            className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-400 hover:bg-white/10"
          >
            <MessageSquare className="h-3 w-3" /> Comment
          </button>
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-400 hover:bg-white/10"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
      )}

      {/* Comment input */}
      {showComment && (
        <div className="mt-2 flex gap-2">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white outline-none focus:border-brand-400"
          />
          <button
            onClick={handleComment}
            disabled={!commentText.trim() || isSubmitting}
            className="rounded-lg bg-brand-500/20 px-3 py-1.5 text-[11px] text-brand-300 hover:bg-brand-500/30 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
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

  const formatted =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-cyan-300">
      <code>{formatted}</code>
    </pre>
  );
}

function ReviewBadge({ status }: { status: ReviewStatus }) {
  const config: Record<ReviewStatus, { color: string; label: string }> = {
    pending: { color: "bg-slate-500/10 text-slate-400", label: "pending" },
    approved: { color: "bg-green-500/10 text-green-400", label: "approved" },
    rejected: { color: "bg-red-500/10 text-red-400", label: "rejected" },
    edited: { color: "bg-yellow-500/10 text-yellow-400", label: "edited" },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] ${c.color}`}>
      {c.label}
    </span>
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
