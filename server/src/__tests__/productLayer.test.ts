/**
 * Product Layer Tests — Auth, Teams, extended Platform.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "../platform/auth";
import { TeamWorkspaceRepository } from "../platform/teams";

describe("Product Layer", async () => {
  describe("AuthService", async () => {
    let auth: AuthService;

    beforeEach(() => {
      auth = new AuthService();
    });

    it("registers and logs in a user", async () => {
      await auth.registerDurable("test@test.com", "pass123", "user-1");
      const result = await auth.loginDurable(
        "test@test.com",
        "pass123",
        "user-1",
      );
      expect(result.success).toBe(true);
      expect(result.token).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.role).toBe("creator");
    });

    it("rejects invalid credentials", async () => {
      await auth.registerDurable("a@b.com", "correct", "u-1");
      const result = await auth.loginDurable("a@b.com", "wrong", "u-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid");
    });

    it("prevents duplicate registration", async () => {
      await auth.registerDurable("dup@test.com", "pass", "u-1");
      const ok = await auth.registerDurable("dup@test.com", "pass2", "u-2");
      expect(ok).toBe(false);
    });

    it("validates token and returns session", async () => {
      await auth.registerDurable("x@y.com", "pw", "u-1");
      const login = await auth.loginDurable("x@y.com", "pw", "u-1");
      const session = await auth.validateToken(login.token!);
      expect(session).not.toBeNull();
      expect(session!.userId).toBe("u-1");
    });

    it("rejects invalid token", async () => {
      expect(await auth.validateToken("fake_token")).toBeNull();
    });

    it("refreshes session", async () => {
      await auth.registerDurable("r@t.com", "pw", "u-1");
      const login = await auth.loginDurable("r@t.com", "pw", "u-1");
      const refreshed = await auth.refreshSessionDurable(login.refreshToken!);
      expect(refreshed.success).toBe(true);
      expect(refreshed.token).not.toBe(login.token);
    });

    it("checks permissions by role", async () => {
      await auth.registerDurable("p@t.com", "pw", "u-1");
      await auth.setRole("u-1", "premium");
      expect(auth.hasPermission("u-1", "publish")).toBe(true);
      expect(auth.hasPermission("u-1", "admin")).toBe(false);
    });

    it("logout invalidates token", async () => {
      await auth.registerDurable("l@t.com", "pw", "u-1");
      const login = await auth.loginDurable("l@t.com", "pw", "u-1");
      await auth.logoutDurable(login.token!);
      expect(await auth.validateToken(login.token!)).toBeNull();
    });
  });

  describe("TeamWorkspaceRepository", async () => {
    let teams: TeamWorkspaceRepository;

    beforeEach(() => {
      teams = new TeamWorkspaceRepository();
    });

    it("creates a team with owner", async () => {
      const team = teams.create("My Team", "user-1");
      expect(team.name).toBe("My Team");
      expect(team.members).toHaveLength(1);
      expect(team.members[0].role).toBe("owner");
    });

    it("adds and removes members", async () => {
      const team = teams.create("Team", "u-1");
      teams.addMember(team.id, "u-2", "member");
      expect(teams.get(team.id)!.members).toHaveLength(2);
      teams.removeMember(team.id, "u-2");
      expect(teams.get(team.id)!.members).toHaveLength(1);
    });

    it("prevents duplicate member", async () => {
      const team = teams.create("Team", "u-1");
      const ok = teams.addMember(team.id, "u-1", "admin");
      expect(ok).toBe(false);
    });

    it("manages projects", async () => {
      const team = teams.create("Team", "u-1");
      teams.addProject(team.id, "proj-1");
      teams.addProject(team.id, "proj-2");
      expect(teams.get(team.id)!.projectIds).toHaveLength(2);
    });

    it("creates invitations", async () => {
      const team = teams.create("Team", "u-1");
      const inv = teams.invite(team.id, "new@member.com", "member");
      expect(inv.email).toBe("new@member.com");
      expect(teams.getInvitations(team.id)).toHaveLength(1);
    });

    it("tracks activity", async () => {
      const team = teams.create("Team", "u-1");
      teams.addMember(team.id, "u-2", "member");
      const activity = teams.getActivity(team.id);
      expect(activity.length).toBeGreaterThanOrEqual(2);
    });

    it("finds teams by user", async () => {
      teams.create("A", "u-1");
      teams.create("B", "u-2");
      const t = teams.create("C", "u-1");
      teams.addMember(t.id, "u-2", "member");
      expect(teams.getByUser("u-2")).toHaveLength(2);
    });
  });
});
