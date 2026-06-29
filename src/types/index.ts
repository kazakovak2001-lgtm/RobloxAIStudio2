export interface NavItem {
  label: string;
  href: string;
}

export interface ProjectItem {
  id: string;
  name: string;
  type: string;
  genre: string;
  lastUpdated: string;
  status: string;
  progress: number;
}

export interface AgentItem {
  name: string;
  status: "Ready" | "Queued" | "In Progress";
  progress: number;
  description: string;
}
