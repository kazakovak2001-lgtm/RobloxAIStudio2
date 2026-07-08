import {
  FileCode,
  Layout,
  Image,
  FileText,
  Package,
  Lock,
  Unlock,
} from "lucide-react";
import { Card } from "../../../components/ui/Card";
import type {
  ArtifactSummary,
  ReviewSummary,
} from "../../../services/conceptApi";

interface ExportPreviewProps {
  artifacts: ArtifactSummary[];
  reviewSummary?: ReviewSummary | null;
}

interface ExportCategory {
  label: string;
  icon: typeof FileCode;
  color: string;
  items: ArtifactSummary[];
}

export function ExportPreview({
  artifacts,
  reviewSummary,
}: ExportPreviewProps) {
  if (artifacts.length === 0) return null;

  const categories: ExportCategory[] = [
    {
      label: "Scripts",
      icon: FileCode,
      color: "text-emerald-400",
      items: artifacts.filter((a) => a.type === "lua"),
    },
    {
      label: "UI Layouts",
      icon: Layout,
      color: "text-pink-400",
      items: artifacts.filter((a) => a.type === "ui-layout"),
    },
    {
      label: "Assets",
      icon: Image,
      color: "text-yellow-400",
      items: artifacts.filter((a) => a.type === "asset-plan"),
    },
    {
      label: "Documentation",
      icon: FileText,
      color: "text-purple-400",
      items: artifacts.filter((a) => a.type === "markdown"),
    },
    {
      label: "Manifest",
      icon: Package,
      color: "text-orange-400",
      items: artifacts.filter((a) => a.type === "manifest"),
    },
  ];

  const totalSize = artifacts.reduce((sum, a) => sum + a.sizeBytes, 0);
  const exportReady = reviewSummary?.allApproved ?? false;
  const unapproved = artifacts.filter(
    (a) => a.reviewStatus !== "approved" && a.reviewStatus !== "edited",
  );

  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Export Preview</p>
        <span className="text-xs text-slate-500">
          {formatBytes(totalSize)} total
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {categories
          .filter((c) => c.items.length > 0)
          .map((category) => {
            const Icon = category.icon;
            return (
              <div
                key={category.label}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 ${category.color}`} />
                  <span className="text-xs text-slate-300">
                    {category.label}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {category.items.length} file
                  {category.items.length !== 1 ? "s" : ""}
                </span>
              </div>
            );
          })}
      </div>

      {/* Export lock status */}
      <div className="mt-3 border-t border-white/5 pt-2">
        {exportReady ? (
          <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-3 py-2">
            <Unlock className="h-4 w-4 text-green-400" />
            <div>
              <p className="text-xs font-medium text-green-400">Export Ready</p>
              <p className="text-[10px] text-green-400/70">
                All artifacts approved. Ready for Roblox Studio export.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
            <Lock className="h-4 w-4 text-yellow-400" />
            <div>
              <p className="text-xs font-medium text-yellow-400">
                Export Locked
              </p>
              <p className="text-[10px] text-yellow-400/70">
                {unapproved.length} artifact{unapproved.length !== 1 ? "s" : ""}{" "}
                require approval before export.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Unapproved list */}
      {!exportReady && unapproved.length > 0 && (
        <div className="mt-2 space-y-1">
          {unapproved.slice(0, 5).map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-[10px]"
            >
              <span className="text-slate-400">{formatStageName(a.stage)}</span>
              <span className="text-yellow-400">{a.reviewStatus}</span>
            </div>
          ))}
          {unapproved.length > 5 && (
            <p className="text-center text-[10px] text-slate-500">
              +{unapproved.length - 5} more
            </p>
          )}
        </div>
      )}

      {/* Review summary */}
      {reviewSummary && (
        <div className="mt-2 text-xs text-slate-400 space-y-0.5">
          <p>
            Approved: {reviewSummary.approved}/{reviewSummary.total} • Edited:{" "}
            {reviewSummary.edited} • Pending: {reviewSummary.pending} •
            Rejected: {reviewSummary.rejected}
          </p>
        </div>
      )}
    </Card>
  );
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
