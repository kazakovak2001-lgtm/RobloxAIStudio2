export class RealtimeServer {
    constructor(io) {
        this.players = new Map();
        this.projectRooms = new Map();
        this.io = io;
        this.io.on("connection", (socket) => {
            const player = {
                userId: socket.handshake.query.userId ?? socket.id,
                socketId: socket.id,
                joinedAt: new Date(),
            };
            this.players.set(socket.id, player);
            socket.on("project:join", ({ projectId }) => {
                player.projectId = projectId;
                socket.join(`project:${projectId}`);
                this.trackProjectRoom(projectId, socket.id);
                socket.emit("project:joined", { projectId });
                socket.to(`project:${projectId}`).emit("player:joined", { userId: player.userId, projectId });
            });
            socket.on("project:leave", ({ projectId }) => {
                socket.leave(`project:${projectId}`);
                this.untrackProjectRoom(projectId, socket.id);
                socket.to(`project:${projectId}`).emit("player:left", { userId: player.userId, projectId });
            });
            socket.on("disconnect", () => {
                if (player.projectId) {
                    this.untrackProjectRoom(player.projectId, socket.id);
                    socket.to(`project:${player.projectId}`).emit("player:left", { userId: player.userId, projectId: player.projectId });
                }
                this.players.delete(socket.id);
            });
        });
    }
    trackProjectRoom(projectId, socketId) {
        const room = this.projectRooms.get(projectId) ?? new Set();
        room.add(socketId);
        this.projectRooms.set(projectId, room);
    }
    untrackProjectRoom(projectId, socketId) {
        const room = this.projectRooms.get(projectId);
        if (!room)
            return;
        room.delete(socketId);
        if (room.size === 0) {
            this.projectRooms.delete(projectId);
        }
    }
    getProjectRoom(projectId) {
        return this.projectRooms.get(projectId) ?? new Set();
    }
    getConnectedPlayers() {
        return Array.from(this.players.values());
    }
    disconnect() {
        this.io.disconnectSockets();
    }
}
