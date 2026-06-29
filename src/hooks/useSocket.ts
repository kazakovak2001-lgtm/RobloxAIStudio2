import { useEffect, useRef, useCallback } from "react";
import { getSocket } from "../services/socket";

type EventCallback = (data: unknown) => void;

export function useSocket(projectId?: string) {
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    return () => {
      if (projectId && socketRef.current) {
        socketRef.current.emit("project:leave", { projectId });
      }
    };
  }, [projectId]);

  const joinProject = useCallback((id: string) => {
    socketRef.current?.emit("project:join", { projectId: id });
  }, []);

  const leaveProject = useCallback((id: string) => {
    socketRef.current?.emit("project:leave", { projectId: id });
  }, []);

  const on = useCallback((event: string, callback: EventCallback) => {
    socketRef.current?.on(event, callback);
    return () => socketRef.current?.off(event, callback);
  }, []);

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { socket: socketRef.current, joinProject, leaveProject, on, emit };
}

export function useRealtimeProject(projectId: string) {
  const connection = useSocket(projectId);

  useEffect(() => {
    if (!projectId) return;
    connection.joinProject(projectId);
    return () => connection.leaveProject(projectId);
  }, [projectId, connection]);

  return connection;
}
