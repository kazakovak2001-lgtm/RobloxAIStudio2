# UI COMPONENT LIBRARY
**Generated**: 2026-07-13
**Project**: Roblox AI Studio DevKit
**Phase**: UX-2 - Component Library

---

## EXECUTIVE SUMMARY

This document defines the reusable UI component library for the Roblox AI Studio Control Center. Components are organized by category and follow the design system defined in DESIGN_SYSTEM.md.

**Component Status**: ⏸️ DOCUMENTED (Implementation Pending)
- **Total Components**: 35
- **Layout Components**: 5
- **Data Components**: 5
- **AI Components**: 5
- **System Components**: 5
- **Developer Components**: 5
- **Existing Components**: 10 (to be enhanced)

---

## 1. LAYOUT COMPONENTS

### 1.1 AppShell

**Purpose**: Main application shell with sidebar, top bar, workspace, and status bar

**Props**:
```typescript
interface AppShellProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  topBar?: React.ReactNode;
  statusBar?: React.ReactNode;
  sidebarCollapsed?: boolean;
  onSidebarToggle?: () => void;
}
```

**Features**:
- Responsive sidebar with collapse toggle
- Fixed top bar with navigation
- Scrollable workspace area
- Status bar at bottom
- Keyboard shortcut hints

**Design Tokens**:
- Sidebar width: 256px (expanded), 64px (collapsed)
- Top bar height: 56px
- Status bar height: 32px
- Background: `slate-950`
- Border: `border-white/10`

---

### 1.2 Sidebar

**Purpose**: Main navigation sidebar

**Props**:
```typescript
interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  navigationItems: NavigationItem[];
  activeItem?: string;
  onItemClick?: (item: NavigationItem) => void;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  disabled?: boolean;
}
```

**Features**:
- Collapsible with animation
- Active state indicator
- Badge support
- Keyboard navigation
- Hover effects

**Design Tokens**:
- Item height: 40px
- Item padding: 12px
- Active background: `brand-500/10`
- Active border: `border-l-2 border-brand-400`

---

### 1.3 TopBar

**Purpose**: Top navigation bar with breadcrumbs, actions, and user menu

**Props**:
```typescript
interface TopBarProps {
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  user?: User;
  onUserMenuClick?: () => void;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}
```

**Features**:
- Breadcrumb navigation
- Action buttons
- User menu
- Search input
- Notifications

**Design Tokens**:
- Height: 56px
- Padding: 16px
- Background: `slate-900/80` with backdrop blur
- Border: `border-b border-white/10`

---

### 1.4 Workspace

**Purpose**: Main content area with tabs and panels

**Props**:
```typescript
interface WorkspaceProps {
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: React.ReactNode;
  panels?: WorkspacePanel[];
}

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  closable?: boolean;
}

interface WorkspacePanel {
  id: string;
  title: string;
  content: React.ReactNode;
  position: "left" | "right" | "bottom";
  size?: number;
}
```

**Features**:
- Tab management
- Resizable panels
- Panel collapse
- Drag and drop reordering

**Design Tokens**:
- Tab height: 40px
- Panel min width: 200px
- Panel min height: 150px
- Background: `slate-950`

---

### 1.5 StatusBar

**Purpose**: Status bar at bottom with system information

**Props**:
```typescript
interface StatusBarProps {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
}
```

**Features**:
- Connection status
- Branch information
- Line/column position
- Encoding
- Language mode

**Design Tokens**:
- Height: 32px
- Background: `slate-900`
- Border: `border-t border-white/10`
- Text: `text-xs text-slate-400`

---

## 2. DATA COMPONENTS

### 2.1 Card

**Purpose**: Container for content with optional hover effects

**Props**:
```typescript
interface CardProps {
  children: React.ReactNode;
  variant?: "default" | "elevated" | "flat";
  hover?: boolean;
  clickable?: boolean;
  onClick?: () => void;
  className?: string;
}
```

**Variants**:
- Default: `border border-white/10 bg-slate-900/70 shadow-glow`
- Elevated: `border border-white/10 bg-slate-900/70 shadow-2xl`
- Flat: `border-0 bg-transparent`

**Design Tokens**:
- Border radius: `rounded-2xl`
- Padding: `p-6`
- Hover: `hover:-translate-y-1 hover:border-brand-400/40`

---

### 2.2 Table

**Purpose**: Data table with sorting, filtering, and pagination

**Props**:
```typescript
interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  sortable?: boolean;
  filterable?: boolean;
  paginated?: boolean;
  pageSize?: number;
  onRowClick?: (row: T) => void;
}

interface Column<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
}
```

**Features**:
- Column sorting
- Column filtering
- Row selection
- Pagination
- Export

**Design Tokens**:
- Header background: `slate-800/50`
- Row hover: `hover:bg-white/5`
- Border: `border border-white/10`

---

### 2.3 Timeline

**Purpose**: Timeline visualization for events or history

**Props**:
```typescript
interface TimelineProps {
  events: TimelineEvent[];
  orientation?: "vertical" | "horizontal";
}

interface TimelineEvent {
  id: string;
  timestamp: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  status?: "success" | "warning" | "error" | "info";
}
```

**Features**:
- Vertical/horizontal orientation
- Status indicators
- Timestamp formatting
- Expandable details

**Design Tokens**:
- Line color: `border-white/10`
- Dot size: 12px
- Spacing: `gap-4`

---

### 2.4 Graph

**Purpose**: Data visualization with charts

**Props**:
```typescript
interface GraphProps {
  type: "line" | "bar" | "area" | "pie";
  data: GraphData[];
  xAxis?: string;
  yAxis?: string;
  color?: string;
}

interface GraphData {
  label: string;
  value: number;
}
```

**Features**:
- Multiple chart types
- Responsive sizing
- Tooltips
- Legend
- Export

**Design Tokens**:
- Line color: `brand-400`
- Fill color: `brand-400/20`
- Grid color: `white/5`

---

### 2.5 TreeView

**Purpose**: Hierarchical data display (file explorer, etc.)

**Props**:
```typescript
interface TreeViewProps {
  nodes: TreeNode[];
  expanded?: string[];
  onExpand?: (nodeId: string) => void;
  onCollapse?: (nodeId: string) => void;
  onSelect?: (nodeId: string) => void;
}

interface TreeNode {
  id: string;
  label: string;
  icon?: React.ReactNode;
  children?: TreeNode[];
  type?: "file" | "folder";
}
```

**Features**:
- Expand/collapse
- Selection
- Drag and drop
- Context menu
- Search

**Design Tokens**:
- Indent: 20px per level
- Item height: 32px
- Hover: `hover:bg-white/5`
- Selected: `bg-brand-500/10 border-l-2 border-brand-400`

---

## 3. AI COMPONENTS

### 3.1 AIChatPanel

**Purpose**: Chat interface for AI interactions

**Props**:
```typescript
interface AIChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  loading?: boolean;
  onClear?: () => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}
```

**Features**:
- Message bubbles
- Typing indicator
- Markdown rendering
- Code syntax highlighting
- Copy code button
- Message actions

**Design Tokens**:
- User message: `bg-brand-500 text-white`
- Assistant message: `bg-slate-800 text-slate-100`
- System message: `bg-slate-900/50 text-slate-400`
- Border radius: `rounded-2xl`

---

### 3.2 PromptInput

**Purpose**: Dedicated input for AI prompts

**Props**:
```typescript
interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  maxTokens?: number;
}
```

**Features**:
- Multi-line input
- Token counter
- Auto-resize
- Keyboard shortcuts (Ctrl+Enter to submit)
- Prompt templates
- History navigation

**Design Tokens**:
- Background: `slate-900/70`
- Border: `border border-white/10`
- Focus: `focus:border-brand-400/50`
- Border radius: `rounded-2xl`

---

### 3.3 AgentCard

**Purpose**: Display AI agent information

**Props**:
```typescript
interface AgentCardProps {
  agent: Agent;
  onSelect?: () => void;
  onConfigure?: () => void;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  version: string;
  status: "ready" | "running" | "error";
  icon?: React.ReactNode;
}
```

**Features**:
- Status indicator
- Version display
- Configure button
- Select action
- Hover effects

**Design Tokens**:
- Background: `bg-slate-900/70`
- Border: `border border-white/10`
- Status colors: success/warning/error
- Border radius: `rounded-2xl`

---

### 3.4 CodeDiffViewer

**Purpose**: Display code differences

**Props**:
```typescript
interface CodeDiffViewerProps {
  before: string;
  after: string;
  language?: string;
  onApply?: () => void;
  onReject?: () => void;
}
```

**Features**:
- Side-by-side view
- Unified view
- Line numbers
- Syntax highlighting
- Apply/reject buttons
- Copy to clipboard

**Design Tokens**:
- Added line: `bg-success-500/10 text-success-400`
- Removed line: `bg-error-500/10 text-error-400`
- Changed line: `bg-warning-500/10 text-warning-400`
- Line numbers: `text-slate-600`

---

### 3.5 GenerationHistory

**Purpose**: Display AI generation history

**Props**:
```typescript
interface GenerationHistoryProps {
  generations: Generation[];
  onSelect?: (generation: Generation) => void;
  onDelete?: (generationId: string) => void;
}

interface Generation {
  id: string;
  prompt: string;
  timestamp: number;
  status: "completed" | "failed" | "running";
  tokens?: number;
  cost?: number;
}
```

**Features**:
- List view
- Status indicators
- Token usage
- Cost display
- Delete action
- View details

**Design Tokens**:
- Item height: 64px
- Hover: `hover:bg-white/5`
- Status colors: success/warning/error
- Border radius: `rounded-xl`

---

## 4. SYSTEM COMPONENTS

### 4.1 StatusIndicator

**Purpose**: Display system status

**Props**:
```typescript
interface StatusIndicatorProps {
  status: "online" | "offline" | "warning" | "error";
  label?: string;
  size?: "sm" | "md" | "lg";
}
```

**Variants**:
- Online: Green dot
- Offline: Gray dot
- Warning: Yellow dot
- Error: Red dot

**Design Tokens**:
- Dot size: 8px (sm), 12px (md), 16px (lg)
- Animation: `animate-pulse` for online
- Colors: success-400, slate-400, warning-400, error-400

---

### 4.2 ConnectionBadge

**Purpose**: Display connection status with details

**Props**:
```typescript
interface ConnectionBadgeProps {
  connected: boolean;
  latency?: number;
  lastHeartbeat?: number;
  onDisconnect?: () => void;
}
```

**Features**:
- Connection status
- Latency display
- Last heartbeat
- Disconnect button
- Hover details

**Design Tokens**:
- Connected: `bg-success-500/10 text-success-400 border-success-400/20`
- Disconnected: `bg-slate-500/10 text-slate-400 border-slate-400/20`
- Border radius: `rounded-full`

---

### 4.3 SyncProgress

**Purpose**: Display synchronization progress

**Props**:
```typescript
interface SyncProgressProps {
  progress: number;
  total: number;
  current?: string;
  onCancel?: () => void;
}
```

**Features**:
- Progress bar
- Percentage display
- Current operation
- Cancel button
- Estimated time

**Design Tokens**:
- Progress bar: `h-2 bg-slate-800 rounded-full`
- Progress fill: `bg-gradient-to-r from-brand-500 to-cyan-400`
- Text: `text-sm text-slate-400`

---

### 4.4 ErrorPanel

**Purpose**: Display error with explanation and solution

**Error Structure**:
```typescript
interface ErrorPanelProps {
  error: {
    title: string;
    message: string;
    cause?: string;
    solution?: string;
    action?: {
      label: string;
      onClick: () => void;
    };
  };
  onDismiss?: () => void;
}
```

**Features**:
- Error title
- Error message
- Root cause
- Suggested solution
- Action button
- Dismiss button

**Design Tokens**:
- Background: `bg-error-500/10 border-error-400/20`
- Icon: `text-error-400`
- Border radius: `rounded-2xl`

---

### 4.5 Notification

**Purpose**: Display notifications

**Props**:
```typescript
interface NotificationProps {
  type: "success" | "warning" | "error" | "info";
  title: string;
  message?: string;
  duration?: number;
  onDismiss?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

**Features**:
- Auto-dismiss
- Manual dismiss
- Action button
- Icon
- Animation

**Design Tokens**:
- Success: `bg-success-500/10 border-success-400/20`
- Warning: `bg-warning-500/10 border-warning-400/20`
- Error: `bg-error-500/10 border-error-400/20`
- Info: `bg-info-500/10 border-info-400/20`

---

## 5. DEVELOPER COMPONENTS

### 5.1 CodeViewer

**Purpose**: Display code with syntax highlighting

**Props**:
```typescript
interface CodeViewerProps {
  code: string;
  language?: string;
  readonly?: boolean;
  onCopy?: () => void;
}
```

**Features**:
- Syntax highlighting
- Line numbers
- Copy to clipboard
- Read-only mode
- Word wrap toggle

**Design Tokens**:
- Background: `bg-slate-950`
- Line numbers: `text-slate-600`
- Border radius: `rounded-lg`
- Font: `font-mono`

---

### 5.2 TerminalPanel

**Purpose**: Terminal output display

**Props**:
```typescript
interface TerminalPanelProps {
  output: TerminalOutput[];
  onClear?: () => void;
}

interface TerminalOutput {
  id: string;
  timestamp: number;
  type: "info" | "warning" | "error" | "command";
  content: string;
}
```

**Features**:
- Color-coded output
- Timestamp display
- Clear button
- Auto-scroll
- Copy to clipboard

**Design Tokens**:
- Background: `bg-slate-950`
- Font: `font-mono text-sm`
- Info: `text-slate-400`
- Warning: `text-warning-400`
- Error: `text-error-400`
- Command: `text-brand-400`

---

### 5.3 LogViewer

**Purpose**: Display application logs

**Props**:
```typescript
interface LogViewerProps {
  logs: LogEntry[];
  filter?: LogFilter;
  onFilterChange?: (filter: LogFilter) => void;
}

interface LogEntry {
  id: string;
  timestamp: number;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
}

interface LogFilter {
  level?: string;
  search?: string;
}
```

**Features**:
- Log level filtering
- Search
- Expandable details
- Copy to clipboard
- Export

**Design Tokens**:
- Debug: `text-slate-500`
- Info: `text-slate-400`
- Warn: `text-warning-400`
- Error: `text-error-400`

---

## 6. EXISTING COMPONENTS (TO BE ENHANCED)

### 6.1 Button

**Enhancements Needed**:
- Add loading state
- Add icon-only variant
- Add danger variant
- Add link variant
- Improve focus states

---

### 6.2 Card

**Enhancements Needed**:
- Add variant prop (default, elevated, flat)
- Add clickable prop
- Add size prop
- Improve hover effects

---

### 6.3 Loader

**Enhancements Needed**:
- Add skeleton variant
- Add progress variant
- Add dots variant
- Add overlay variant

---

### 6.4 Modal

**Enhancements Needed**:
- Add size prop (sm, md, lg, xl)
- Add backdrop blur
- Add animation variants
- Add close on escape

---

### 6.5 Toast

**Enhancements Needed**:
- Add position prop (top, bottom, left, right)
- Add stack support
- Add progress bar
- Add action button

---

## 7. IMPLEMENTATION PRIORITY

### 7.1 High Priority

**Layout Components**:
1. AppShell
2. Sidebar
3. TopBar
4. Workspace
5. StatusBar

**AI Components**:
1. AIChatPanel
2. PromptInput
3. AgentCard

**System Components**:
1. StatusIndicator
2. ConnectionBadge
3. SyncProgress
4. ErrorPanel

### 7.2 Medium Priority

**Data Components**:
1. Table
2. TreeView
3. Timeline

**Developer Components**:
1. CodeViewer
2. TerminalPanel
3. LogViewer

### 7.3 Low Priority

**Data Components**:
1. Graph (use library like Recharts)

**AI Components**:
1. CodeDiffViewer (use library like react-diff-viewer)
2. GenerationHistory

---

## 8. SUMMARY

### 8.1 Component Count

**New Components**: 25
**Existing Components**: 10 (to be enhanced)
**Total Components**: 35

### 8.2 Implementation Status

**Documented**: ✅ COMPLETE
**Implemented**: ⏸️ PENDING
**Tested**: ⏸️ PENDING

### 8.3 Next Steps

**Phase UX-3**: Redesign Main Screens
- Apply new components to screens
- Ensure consistency
- Validate accessibility

---

**Component Library Status**: ✅ DOCUMENTED
**Next Phase**: UX-3 - Redesign Main Screens
**Owner**: Design Team
