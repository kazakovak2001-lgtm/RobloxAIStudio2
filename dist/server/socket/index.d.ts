import type { Server as SocketServer } from "socket.io";
type ProjectId = string;
type UserId = string;
interface Player {
    userId: UserId;
    socketId: string;
    projectId?: ProjectId;
    joinedAt: Date;
}
export declare class RealtimeServer {
    private io;
    private players;
    private projectRooms;
    constructor(io: SocketServer);
    private trackProjectRoom;
    private untrackProjectRoom;
    getProjectRoom(projectId: ProjectId): Set<string>;
    getConnectedPlayers(): Player[];
    disconnect(): void;
}
export {};
