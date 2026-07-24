import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useState } from "react";

export interface TreeNode {
  id: string;
  label: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
  type?: "file" | "folder";
}

export interface TreeViewProps {
  nodes: TreeNode[];
  expanded?: string[];
  onExpand?: (nodeId: string) => void;
  onCollapse?: (nodeId: string) => void;
  onSelect?: (nodeId: string) => void;
  selectedId?: string;
}

export function TreeView({
  nodes,
  expanded = [],
  onExpand,
  onCollapse,
  onSelect,
  selectedId,
}: TreeViewProps) {
  const [localExpanded, setLocalExpanded] = useState<Set<string>>(
    new Set(expanded),
  );

  const isExpanded = (nodeId: string) => {
    return localExpanded.has(nodeId);
  };

  const handleToggle = (nodeId: string, hasChildren: boolean) => {
    if (!hasChildren) return;

    const newExpanded = new Set(localExpanded);
    if (isExpanded(nodeId)) {
      newExpanded.delete(nodeId);
      onCollapse?.(nodeId);
    } else {
      newExpanded.add(nodeId);
      onExpand?.(nodeId);
    }
    setLocalExpanded(newExpanded);
  };

  const handleSelect = (nodeId: string) => {
    onSelect?.(nodeId);
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const expanded = isExpanded(node.id);
    const selected = selectedId === node.id;
    const isFolder = node.type === "folder" || hasChildren;

    return (
      <div key={node.id}>
        <div
          onClick={() => {
            handleSelect(node.id);
            if (hasChildren) {
              handleToggle(node.id, true);
            }
          }}
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition ${
            selected
              ? "bg-brand-500/10 text-white border-l-2 border-brand-400"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
        >
          {/* Expand/Collapse Icon */}
          <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
            {hasChildren ? (
              expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )
            ) : null}
          </div>

          {/* Node Icon */}
          <div className="flex-shrink-0">
            {node.icon ||
              (isFolder ? (
                expanded ? (
                  <FolderOpen className="h-4 w-4 text-brand-400" />
                ) : (
                  <Folder className="h-4 w-4 text-brand-400" />
                )
              ) : (
                <File className="h-4 w-4 text-slate-400" />
              ))}
          </div>

          {/* Node Label */}
          <span className="text-sm truncate flex-1">{node.label}</span>
        </div>

        {/* Children */}
        {hasChildren && expanded && (
          <div>
            {node.children?.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col">{nodes.map((node) => renderNode(node))}</div>
  );
}
