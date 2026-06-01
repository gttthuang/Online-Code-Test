import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveRoomParticipant, LiveRoomServerMessage, LiveRoomSnapshot, SupportedLanguage } from "@oct/contracts";

import { getLiveRoomSocketUrl } from "./api";

type LiveRoomStatus = "idle" | "connecting" | "connected" | "error";

interface UseLiveRoomOptions {
  token: string;
  candidateId: string | null;
  problemId: string | null;
  onCodeUpdate?: (snapshot: LiveRoomSnapshot) => void;
}

export function useLiveRoom({
  token,
  candidateId,
  problemId,
  onCodeUpdate
}: UseLiveRoomOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onCodeUpdate);
  const [status, setStatus] = useState<LiveRoomStatus>("idle");
  const [participants, setParticipants] = useState<LiveRoomParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handlerRef.current = onCodeUpdate;
  }, [onCodeUpdate]);

  useEffect(() => {
    if (!candidateId || !problemId) {
      setStatus("idle");
      setParticipants([]);
      socketRef.current?.close();
      socketRef.current = null;
      return;
    }

    const socket = new WebSocket(getLiveRoomSocketUrl(token, candidateId, problemId));
    socketRef.current = socket;
    setStatus("connecting");
    setError(null);

    socket.onopen = () => {
      setStatus("connected");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as LiveRoomServerMessage;

      if (message.type === "room_snapshot") {
        setParticipants(message.participants);

        if (message.snapshot) {
          handlerRef.current?.(message.snapshot);
        }
        return;
      }

      if (message.type === "presence_update") {
        setParticipants(message.participants);
        return;
      }

      if (message.type === "code_update") {
        handlerRef.current?.(message.snapshot);
        return;
      }

      if (message.type === "error") {
        setStatus("error");
        setError(message.message);
      }
    };

    socket.onerror = () => {
      if (socketRef.current !== socket) {
        return;
      }

      setStatus("error");
      setError("Live room connection failed.");
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) {
        return;
      }

      setStatus((current) => current === "error" ? current : "idle");
    };

    return () => {
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [candidateId, problemId, token]);

  const sendCodeUpdate = useCallback((language: SupportedLanguage, sourceCode: string) => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify({
      type: "code_update",
      language,
      sourceCode
    }));
  }, []);

  const sendCursorUpdate = useCallback((line: number, column: number) => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify({
      type: "cursor_update",
      line,
      column
    }));
  }, []);

  return {
    status,
    participants,
    error,
    sendCodeUpdate,
    sendCursorUpdate
  };
}
