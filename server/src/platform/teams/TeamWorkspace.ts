/**
 * TeamWorkspace — Collaborative workspaces with roles and shared projects.
 */

import { randomUUID } from "crypto";

export type TeamRole = "owner" | "admin" | "member" | "viewer";

export interface TeamMember {
  userId: string;
  role: TeamRole;
  joinedAt: number;
}

export interface TeamInvitation {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  createdAt: number;
  expiresAt: number;
  accepted: boolean;
}

export interface TeamWorkspaceData {
  id: string;
  name: string;
  ownerId: string;
  members: TeamMember[];
  projectIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ActivityEntry {
  id: string;
  teamId: string;
  userId: string;
  action: string;
  target?: string;
  timestamp: number;
}

export class TeamWorkspaceRepository {
  private teams: Map<string, TeamWorkspaceData> = new Map();
  private invitations: TeamInvitation[] = [];
  private activity: ActivityEntry[] = [];

  create(name: string, ownerId: string): TeamWorkspaceData {
    const team: TeamWorkspaceData = {
      id: `team-${randomUUID().slice(0, 8)}`,
      name,
      ownerId,
      members: [{ userId: ownerId, role: "owner", joinedAt: Date.now() }],
      projectIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.teams.set(team.id, team);
    this.logActivity(team.id, ownerId, "created_team");
    return team;
  }

  get(teamId: string): TeamWorkspaceData | null {
    return this.teams.get(teamId) ?? null;
  }

  getByUser(userId: string): TeamWorkspaceData[] {
    return [...this.teams.values()].filter((t) =>
      t.members.some((m) => m.userId === userId),
    );
  }

  addMember(teamId: string, userId: string, role: TeamRole): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    if (team.members.some((m) => m.userId === userId)) return false;
    team.members.push({ userId, role, joinedAt: Date.now() });
    team.updatedAt = Date.now();
    this.logActivity(teamId, userId, "joined_team");
    return true;
  }

  removeMember(teamId: string, userId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    team.members = team.members.filter((m) => m.userId !== userId);
    team.updatedAt = Date.now();
    this.logActivity(teamId, userId, "left_team");
    return true;
  }

  addProject(teamId: string, projectId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    if (!team.projectIds.includes(projectId)) {
      team.projectIds.push(projectId);
      team.updatedAt = Date.now();
    }
    return true;
  }

  invite(teamId: string, email: string, role: TeamRole): TeamInvitation {
    const inv: TeamInvitation = {
      id: `inv-${randomUUID().slice(0, 8)}`,
      teamId,
      email,
      role,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      accepted: false,
    };
    this.invitations.push(inv);
    return inv;
  }

  getInvitations(teamId: string): TeamInvitation[] {
    return this.invitations.filter((i) => i.teamId === teamId && !i.accepted);
  }

  getActivity(teamId: string, limit = 20): ActivityEntry[] {
    return this.activity.filter((a) => a.teamId === teamId).slice(-limit);
  }

  private logActivity(
    teamId: string,
    userId: string,
    action: string,
    target?: string,
  ): void {
    this.activity.push({
      id: `act-${randomUUID().slice(0, 6)}`,
      teamId,
      userId,
      action,
      target,
      timestamp: Date.now(),
    });
  }
}
