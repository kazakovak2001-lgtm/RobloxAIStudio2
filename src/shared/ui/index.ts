// Base UI components
export { Button } from "./Button";
export { Input, Textarea } from "./Input";
export { Card } from "./Card";
export { Dropdown } from "./Dropdown";
export { Tabs } from "./Tabs";
export { Modal } from "./Modal";
export { Toast, ToastContext, useToast } from "./Toast";
export { Loader } from "./Loader";
export { Badge } from "./Badge";

// Layout components
export { AppShell } from "./layout/AppShell";
export { Workspace } from "./layout/Workspace";
export { Sidebar } from "./layout/Sidebar";
export { TopBar } from "./layout/TopBar";
export { StatusBar } from "./layout/StatusBar";

// Data components
export { TreeView } from "./data/TreeView";

// System components
export { StatusIndicator } from "./system/StatusIndicator";
export { ConnectionBadge } from "./system/ConnectionBadge";
export { SyncProgress } from "./system/SyncProgress";

// AI components
export { AIChatPanel } from "./ai/AIChatPanel";
export { PromptInput } from "./ai/PromptInput";
export { AgentCard } from "./ai/AgentCard";
export { CodeDiffViewer } from "./ai/CodeDiffViewer";
export { GenerationHistory } from "./ai/GenerationHistory";

// Dashboard components
export { ProjectOverview } from "./dashboard/ProjectOverview";
export { AIStatus } from "./dashboard/AIStatus";
export { PluginStatus } from "./dashboard/PluginStatus";
export { SyncMonitor } from "./dashboard/SyncMonitor";
export { SystemHealth } from "./dashboard/SystemHealth";

// Projects components
export { ProjectExplorer } from "./projects/ProjectExplorer";

// Type exports
export type { ButtonProps } from "./Button";
export type { InputProps, TextareaProps } from "./Input";
export type { CardProps } from "./Card";
export type { DropdownProps, DropdownItem } from "./Dropdown";
export type { TabsProps, TabItem } from "./Tabs";
export type { ModalProps } from "./Modal";
export type { AppShellProps } from "./layout/AppShell";
export type { WorkspaceProps, Tab, WorkspacePanel } from "./layout/Workspace";
export type { SidebarProps, NavigationItem } from "./layout/Sidebar";
export type { TopBarProps, BreadcrumbItem } from "./layout/TopBar";
export type { StatusBarProps } from "./layout/StatusBar";
export type { TreeViewProps, TreeNode } from "./data/TreeView";
export type { StatusIndicatorProps } from "./system/StatusIndicator";
export type { ConnectionBadgeProps } from "./system/ConnectionBadge";
export type { SyncProgressProps } from "./system/SyncProgress";
export type { AIChatPanelProps, ChatMessage } from "./ai/AIChatPanel";
export type { PromptInputProps } from "./ai/PromptInput";
export type { AgentCardProps, Agent } from "./ai/AgentCard";
export type { CodeDiffViewerProps } from "./ai/CodeDiffViewer";
export type { GenerationHistoryProps, Generation } from "./ai/GenerationHistory";
export type { ProjectOverviewProps } from "./dashboard/ProjectOverview";
export type { AIStatusProps } from "./dashboard/AIStatus";
export type { PluginStatusProps } from "./dashboard/PluginStatus";
export type { SyncMonitorProps } from "./dashboard/SyncMonitor";
export type { SystemHealthProps } from "./dashboard/SystemHealth";
export type { ProjectExplorerProps } from "./projects/ProjectExplorer";