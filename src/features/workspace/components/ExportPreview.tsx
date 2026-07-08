import { FileCode, Layout, Image, FileText, Package } from "lucide-react";
import { Card } from "../../../components/ui/Card";
import type { ArtifactSummary } from "../../../services/conceptApi";

interface ExportPreviewProps {
  artifacts: ArtifactSummary[];
}

interface ExportCategory {
  label: string;
  icon: typeof FileCode;
  color: string;
  items: ArtifactSummary[];
}

export function ExportPreview({ artifacts }: ExportPreviewProps) {
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
  const validatedCount = artifacts.filter((a) => a.validated).length;

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

      <div className="mt-3 border-t border-white/5 pt-2 text-xs text-slate-400 space-y-1">
        <p>
          Validated: {validatedCount}/{artifacts.length}
        </p>
        <p>Ready for Roblox Studio export</p>
      </div>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
