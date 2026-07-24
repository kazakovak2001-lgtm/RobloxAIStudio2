import type { Server as SocketServer } from "socket.io";

type ProjectId = string;
type UserId = string;

interface Player {
  userId: UserId;
  socketId: string;
  projectId?: ProjectId;
  joinedAt: Date;
}

type ProjectAuthorizer = (
  projectId: ProjectId,
  authenticatedUserId?: UserId,
) => boolean;

export class RealtimeServer {
  private io: SocketServer;
  private players = new Map<string, Player>();
  private projectRooms = new Map<ProjectId, Set<string>>();

  constructor(io: SocketServer, canJoinProject?: ProjectAuthorizer) {
    this.io = io;

    this.io.on("connection", (socket) => {
      const authenticatedUserId = (
        socket.data as { user?: { userId?: string } }
      ).user?.userId;
      const player: Player = {
        userId:
          authenticatedUserId ??
          (socket.handshake.query.userId as string) ??
          socket.id,
        socketId: socket.id,
        joinedAt: new Date(),
      };

      this.players.set(socket.id, player);

      socket.on("project:join", ({ projectId }: { projectId: ProjectId }) => {
        if (
          typeof projectId !== "string" ||
          !projectId.trim() ||
          (canJoinProject &&
            !canJoinProject(projectId.trim(), authenticatedUserId))
        ) {
          socket.emit("project:error", {
            projectId,
            error: "Project access denied",
          });
          return;
        }

        projectId = projectId.trim();
        player.projectId = projectId;
        socket.join(`project:${projectId}`);
        this.trackProjectRoom(projectId, socket.id);

        socket.emit("project:joined", { projectId });
        socket
          .to(`project:${projectId}`)
          .emit("player:joined", { userId: player.userId, projectId });
      });

      socket.on("project:leave", ({ projectId }: { projectId: ProjectId }) => {
        socket.leave(`project:${projectId}`);
        this.untrackProjectRoom(projectId, socket.id);
        socket
          .to(`project:${projectId}`)
          .emit("player:left", { userId: player.userId, projectId });
      });

      socket.on("disconnect", () => {
        if (player.projectId) {
          this.untrackProjectRoom(player.projectId, socket.id);
          socket
            .to(`project:${player.projectId}`)
            .emit("player:left", {
              userId: player.userId,
              projectId: player.projectId,
            });
        }
        this.players.delete(socket.id);
      });
    });
  }

  private trackProjectRoom(projectId: ProjectId, socketId: string) {
    const room = this.projectRooms.get(projectId) ?? new Set<string>();
    room.add(socketId);
    this.projectRooms.set(projectId, room);
  }

  private untrackProjectRoom(projectId: ProjectId, socketId: string) {
    const room = this.projectRooms.get(projectId);
    if (!room) return;
    room.delete(socketId);
    if (room.size === 0) {
      this.projectRooms.delete(projectId);
    }
  }

  getProjectRoom(projectId: ProjectId) {
    return this.projectRooms.get(projectId) ?? new Set<string>();
  }

  getConnectedPlayers() {
    return Array.from(this.players.values());
  }

  disconnect() {
    this.io.disconnectSockets();
  }
}
