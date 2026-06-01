import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { languages } from "@oct/contracts";
import type { AuthUser, LiveRoomClientMessage, LiveRoomParticipant, LiveRoomServerMessage } from "@oct/contracts";

import type { AppContext } from "../../core/app-context.js";

const roomQuerySchema = z.object({
  candidateId: z.string().min(1),
  problemId: z.string().min(1),
  token: z.string().min(1)
});

const clientMessageSchema: z.ZodType<LiveRoomClientMessage> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("code_update"),
    language: z.enum(languages),
    sourceCode: z.string().max(100_000)
  }),
  z.object({
    type: z.literal("cursor_update"),
    line: z.number().int().min(1).max(1_000_000),
    column: z.number().int().min(1).max(1_000_000)
  }),
  z.object({
    type: z.literal("ping")
  })
]);

type LiveRoomClient = {
  id: string;
  socket: WebSocket;
  candidateId: string;
  problemId: string;
  user: AuthUser;
};

type LiveRoomSession = {
  candidateId: string;
  problemId: string;
  user: AuthUser;
};

class LiveRoomHub {
  private readonly rooms = new Map<string, Map<string, LiveRoomClient>>();

  constructor(private readonly context: AppContext) {}

  async join(socket: WebSocket, session: LiveRoomSession) {
    const client: LiveRoomClient = {
      id: `live_client_${randomUUID()}`,
      socket,
      candidateId: session.candidateId,
      problemId: session.problemId,
      user: session.user
    };
    const room = this.getRoom(session.candidateId, session.problemId);

    room.set(client.id, client);

    send(socket, {
      type: "room_snapshot",
      snapshot: await this.context.store.getLiveRoomSnapshot(session.candidateId, session.problemId),
      participants: this.getParticipants(room)
    });
    this.broadcastPresence(room);

    await this.context.store.createLiveRoomEvent({
      candidateId: session.candidateId,
      problemId: session.problemId,
      actorId: session.user.id,
      actorRole: session.user.role,
      eventType: "join",
      payload: {
        participant: toParticipant(session.user)
      }
    });

    return client;
  }

  async leave(client: LiveRoomClient) {
    const roomKey = getRoomKey(client.candidateId, client.problemId);
    const room = this.rooms.get(roomKey);

    if (!room) {
      return;
    }

    room.delete(client.id);

    if (room.size === 0) {
      this.rooms.delete(roomKey);
    } else {
      this.broadcastPresence(room);
    }

    await this.context.store.createLiveRoomEvent({
      candidateId: client.candidateId,
      problemId: client.problemId,
      actorId: client.user.id,
      actorRole: client.user.role,
      eventType: "leave",
      payload: {
        participant: toParticipant(client.user)
      }
    });
  }

  async handleMessage(client: LiveRoomClient, message: LiveRoomClientMessage) {
    if (message.type === "ping") {
      send(client.socket, { type: "pong" });
      return;
    }

    const room = this.rooms.get(getRoomKey(client.candidateId, client.problemId));

    if (!room) {
      return;
    }

    if (message.type === "code_update") {
      const snapshot = await this.context.store.upsertLiveRoomSnapshot({
        candidateId: client.candidateId,
        problemId: client.problemId,
        language: message.language,
        sourceCode: message.sourceCode,
        updatedBy: client.user.id
      });
      const payload: LiveRoomServerMessage = {
        type: "code_update",
        snapshot,
        actor: toParticipant(client.user)
      };

      await this.context.store.createLiveRoomEvent({
        candidateId: client.candidateId,
        problemId: client.problemId,
        actorId: client.user.id,
        actorRole: client.user.role,
        eventType: "code_update",
        payload: {
          language: message.language,
          sourceCode: message.sourceCode
        }
      });
      this.broadcast(room, payload, client.id);
      return;
    }

    const updatedAt = new Date().toISOString();
    const payload: LiveRoomServerMessage = {
      type: "cursor_update",
      actor: toParticipant(client.user),
      line: message.line,
      column: message.column,
      updatedAt
    };

    await this.context.store.createLiveRoomEvent({
      candidateId: client.candidateId,
      problemId: client.problemId,
      actorId: client.user.id,
      actorRole: client.user.role,
      eventType: "cursor_update",
      payload: {
        line: message.line,
        column: message.column,
        updatedAt
      }
    });
    this.broadcast(room, payload, client.id);
  }

  private getRoom(candidateId: string, problemId: string) {
    const roomKey = getRoomKey(candidateId, problemId);
    const existing = this.rooms.get(roomKey);

    if (existing) {
      return existing;
    }

    const room = new Map<string, LiveRoomClient>();
    this.rooms.set(roomKey, room);
    return room;
  }

  private getParticipants(room: Map<string, LiveRoomClient>) {
    return Array.from(room.values()).map((client) => toParticipant(client.user));
  }

  private broadcastPresence(room: Map<string, LiveRoomClient>) {
    this.broadcast(room, {
      type: "presence_update",
      participants: this.getParticipants(room)
    });
  }

  private broadcast(room: Map<string, LiveRoomClient>, message: LiveRoomServerMessage, exceptClientId?: string) {
    for (const client of room.values()) {
      if (client.id !== exceptClientId) {
        send(client.socket, message);
      }
    }
  }
}

export async function registerLiveRoomRoutes(app: FastifyInstance, context: AppContext) {
  const hub = new LiveRoomHub(context);

  app.get("/live/rooms", { websocket: true }, (socket, request) => {
    let client: LiveRoomClient | null = null;
    let closed = false;
    const requestUrl = request.raw.url ?? request.url;
    const sessionPromise = resolveLiveRoomSession(request.query, requestUrl, request.headers, context);

    socket.on("message", async (rawMessage) => {
      const activeClient = client ?? await sessionPromise;

      if (!activeClient) {
        return;
      }

      client = activeClient;

      try {
        const message = parseClientMessage(rawMessage.toString());
        await hub.handleMessage(activeClient, message);
      } catch {
        send(socket, {
          type: "error",
          code: "invalid_live_room_message",
          message: "Live room message is invalid"
        });
      }
    });

    socket.on("close", () => {
      closed = true;

      if (client) {
        void hub.leave(client).catch(() => {
          // The app may be shutting down while sockets close during tests or deploys.
        });
      }
    });

    sessionPromise
      .then((nextSession) => {
        if (!nextSession || closed) {
          return;
        }

        client = nextSession;
      })
      .catch(() => {
        send(socket, {
          type: "error",
          code: "live_room_join_failed",
          message: "Unable to join live room"
        });
        socket.close(1011, "Unable to join live room");
      });

    async function resolveLiveRoomSession(queryPayload: unknown, requestUrl: string, headers: IncomingHttpHeaders, appContext: AppContext) {
      const query = parseRoomQuery(queryPayload, requestUrl, headers);
      const user = await appContext.store.getUserById(query.token);

      if (!user) {
        send(socket, {
          type: "error",
          code: "unauthorized",
          message: "A valid token is required"
        });
        socket.close(1008, "Unauthorized");
        return null;
      }

      if (!(await canJoinLiveRoom(appContext, user, query.candidateId, query.problemId))) {
        send(socket, {
          type: "error",
          code: "forbidden",
          message: "You do not have access to this live room"
        });
        socket.close(1008, "Forbidden");
        return null;
      }

      if (closed) {
        return null;
      }

      return hub.join(socket, {
        candidateId: query.candidateId,
        problemId: query.problemId,
        user
      });
    }
  });
}

async function canJoinLiveRoom(context: AppContext, user: AuthUser, candidateId: string, problemId: string) {
  if (user.role === "candidate") {
    return user.id === candidateId && context.store.isProblemAssigned(candidateId, problemId);
  }

  if (user.role === "interviewer") {
    const candidate = await context.store.getUserById(candidateId);
    return Boolean(candidate && candidate.role === "candidate" && await context.store.isProblemAssigned(candidateId, problemId));
  }

  if (user.role === "problem_admin") {
    return Boolean(await context.store.getProblem(problemId));
  }

  return false;
}

function parseClientMessage(payload: string) {
  return clientMessageSchema.parse(JSON.parse(payload));
}

function parseRoomQuery(payload: unknown, requestUrl: string, headers: IncomingHttpHeaders) {
  const parsed = roomQuerySchema.safeParse(payload);

  if (parsed.success) {
    return parsed.data;
  }

  const url = new URL(requestUrl, "http://localhost");

  return roomQuerySchema.parse({
    candidateId: url.searchParams.get("candidateId") ?? headerValue(headers["x-live-candidate-id"]),
    problemId: url.searchParams.get("problemId") ?? headerValue(headers["x-live-problem-id"]),
    token: url.searchParams.get("token") ?? headerValue(headers["x-live-token"])
  });
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getRoomKey(candidateId: string, problemId: string) {
  return `${candidateId}:${problemId}`;
}

function toParticipant(user: AuthUser): LiveRoomParticipant {
  return {
    id: user.id,
    name: user.name,
    role: user.role
  };
}

function send(socket: WebSocket, message: LiveRoomServerMessage) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}
