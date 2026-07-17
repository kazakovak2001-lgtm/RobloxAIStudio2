import { Check, X, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export interface CodeDiffViewerProps {
  before: string;
  after: string;
  onApply?: () => void;
  onReject?: () => void;
}

export function CodeDiffViewer({
  before,
  after,
  onApply,
  onReject,
}: CodeDiffViewerProps) {
  const [viewMode, setViewMode] = useState<"unified" | "side-by-side">("unified");
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  // Simple diff visualization (in production, use a proper diff library)
  const linesBefore = before.split("\n");
  const linesAfter = after.split("\n");
  const maxLines = Math.max(linesBefore.length, linesAfter.length);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-slate-900/70 shadow-glow backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <h3 className="text-h3 font-semibold text-white">Code Changes</h3>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <button
            onClick={() => setViewMode(viewMode === "unified" ? "side-by-side" : "unified")}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white"
            type="button"
          >
            {viewMode === "unified" ? "Side by Side" : "Unified"}
          </button>

          {/* Line Numbers Toggle */}
          <button
            onClick={() => setShowLineNumbers(!showLineNumbers)}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            type="button"
            aria-label={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
          >
            {showLineNumbers ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="rounded-xl border border-white/10 bg-slate-950">
          {viewMode === "unified" ? (
            <UnifiedView
              linesBefore={linesBefore}
              linesAfter={linesAfter}
              maxLines={maxLines}
              showLineNumbers={showLineNumbers}
            />
          ) : (
            <SideBySideView
              linesBefore={linesBefore}
              linesAfter={linesAfter}
              showLineNumbers={showLineNumbers}
            />
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-white/10 p-4">
        <div className="text-sm text-slate-400">
          {linesAfter.length - linesBefore.length > 0 ? (
            <span className="text-success-400">
              +{linesAfter.length - linesBefore.length} lines added
            </span>
          ) : linesAfter.length - linesBefore.length < 0 ? (
            <span className="text-error-400">
              {linesAfter.length - linesBefore.length} lines removed
            </span>
          ) : (
            <span>No changes in line count</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onReject && (
            <button
              onClick={onReject}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              type="button"
            >
              <X className="h-4 w-4" />
              <span>Reject</span>
            </button>
          )}
          {onApply && (
            <button
              onClick={onApply}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-accent px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:translate-y-[-1px]"
              type="button"
            >
              <Check className="h-4 w-4" />
              <span>Apply</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UnifiedView({
  linesBefore,
  linesAfter,
  maxLines,
  showLineNumbers,
}: {
  linesBefore: string[];
  linesAfter: string[];
  maxLines: number;
  showLineNumbers: boolean;
}) {
  return (
    <div className="font-mono text-sm">
      {Array.from({ length: maxLines }).map((_, i) => {
        const beforeLine = linesBefore[i];
        const afterLine = linesAfter[i];
        const isAdded = !beforeLine && afterLine;
        const isRemoved = beforeLine && !afterLine;
        const isChanged = beforeLine && afterLine && beforeLine !== afterLine;

        return (
          <div
            key={i}
            className={`flex ${
              isAdded
                ? "bg-success-500/10"
                : isRemoved
                ? "bg-error-500/10"
                : isChanged
                ? "bg-warning-500/10"
                : ""
            }`}
          >
            {showLineNumbers && (
              <div className="w-12 flex-shrink-0 border-r border-white/5 px-2 text-right text-slate-600">
                {beforeLine ? i + 1 : ""}
              </div>
            )}
            <div className="flex-1 px-3 py-1">
              {isAdded ? (
                <span className="text-success-400">+ {afterLine}</span>
              ) : isRemoved ? (
                <span className="text-error-400">- {beforeLine}</span>
              ) : isChanged ? (
                <>
                  <span className="text-error-400 line-through">{beforeLine}</span>
                  <span className="text-success-400 ml-2">+ {afterLine}</span>
                </>
              ) : (
                <span className="text-slate-300">{afterLine || beforeLine}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SideBySideView({
  linesBefore,
  linesAfter,
  showLineNumbers,
}: {
  linesBefore: string[];
  linesAfter: string[];
  showLineNumbers: boolean;
}) {
  const maxLines = Math.max(linesBefore.length, linesAfter.length);

  return (
    <div className="grid grid-cols-2 font-mono text-sm">
      {/* Before */}
      <div className="border-r border-white/10">
        <div className="border-b border-white/10 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-400">
          Before
        </div>
        {Array.from({ length: maxLines }).map((_, i) => {
          const line = linesBefore[i];
          const isRemoved = line && !linesAfter[i];

          return (
            <div
              key={`before-${i}`}
              className={`flex ${isRemoved ? "bg-error-500/10" : ""}`}
            >
              {showLineNumbers && (
                <div className="w-12 flex-shrink-0 border-r border-white/5 px-2 text-right text-slate-600">
                  {line ? i + 1 : ""}
                </div>
              )}
              <div className="flex-1 px-3 py-1">
                {line ? (
                  <span className={isRemoved ? "text-error-400" : "text-slate-300"}>
                    {line}
                  </span>
                ) : (
                  <span className="text-slate-600">&nbsp;</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* After */}
      <div>
        <div className="border-b border-white/10 bg-slate-800/50 px-3 py-2 text-xs font-medium text-slate-400">
          After
        </div>
        {Array.from({ length: maxLines }).map((_, i) => {
          const line = linesAfter[i];
          const isAdded = line && !linesBefore[i];

          return (
            <div key={`after-${i}`} className={`flex ${isAdded ? "bg-success-500/10" : ""}`}>
              {showLineNumbers && (
                <div className="w-12 flex-shrink-0 border-r border-white/5 px-2 text-right text-slate-600">
                  {line ? i + 1 : ""}
                </div>
              )}
              <div className="flex-1 px-3 py-1">
                {line ? (
                  <span className={isAdded ? "text-success-400" : "text-slate-300"}>
                    {line}
                  </span>
                ) : (
                  <span className="text-slate-600">&nbsp;</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
