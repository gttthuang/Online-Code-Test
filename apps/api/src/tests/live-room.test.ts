import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { LiveRoomReplayEvent, LiveRoomServerMessage } from "@oct/contracts";
import type { FastifyInstance } from "fastify";

import { createHarness, destroyHarness, login } from "./helpers.js";

test("candidate and interviewer can share live room code updates", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const interviewer = await login(harness.app, "bob.interviewer@example.com");
    const candidateSocket = await connectLiveSocket(harness.app, {
      candidateId: "candidate_alice",
      problemId: "problem_reverse_string",
      token: candidate.token
    });
    const interviewerSocket = await connectLiveSocket(harness.app, {
      candidateId: "candidate_alice",
      problemId: "problem_reverse_string",
      token: interviewer.token
    });

    try {
      await nextMessage(candidateSocket, (message) => message.type === "room_snapshot");
      await nextMessage(interviewerSocket, (message) => message.type === "room_snapshot");

      candidateSocket.send(JSON.stringify({
        type: "code_update",
        language: "python",
        sourceCode: "print('shared room')"
      }));

      const update = await nextMessage(interviewerSocket, (message) => message.type === "code_update");
      assert.equal(update.type, "code_update");

      if (update.type === "code_update") {
        assert.equal(update.snapshot.sourceCode, "print('shared room')");
        assert.equal(update.snapshot.language, "python");
        assert.equal(update.actor.id, "candidate_alice");
      }

      const snapshot = await harness.adminPool.query<{
        source_code: string;
        language: string;
        updated_by: string;
      }>(
        `
          select source_code, language, updated_by
          from live_room_snapshots
          where candidate_id = $1 and problem_id = $2
        `,
        ["candidate_alice", "problem_reverse_string"]
      );
      const events = await harness.adminPool.query<{ count: string }>(
        `
          select count(*)::text
          from live_room_events
          where candidate_id = $1 and problem_id = $2 and event_type = 'code_update'
        `,
        ["candidate_alice", "problem_reverse_string"]
      );

      assert.equal(snapshot.rows[0].source_code, "print('shared room')");
      assert.equal(snapshot.rows[0].language, "python");
      assert.equal(snapshot.rows[0].updated_by, "candidate_alice");
      assert.equal(Number(events.rows[0].count), 1);

      const replayResponse = await harness.app.inject({
        method: "GET",
        url: "/admin/live/rooms/candidate_alice/problem_reverse_string/replay",
        headers: {
          authorization: `Bearer ${interviewer.token}`
        }
      });
      const replay = replayResponse.json<{ events: LiveRoomReplayEvent[] }>();
      const codeUpdate = replay.events.find((event) => event.eventType === "code_update");

      assert.equal(replayResponse.statusCode, 200);
      assert.ok(codeUpdate);
      assert.deepEqual(codeUpdate?.payload, {
        language: "python",
        sourceCode: "print('shared room')"
      });
    } finally {
      candidateSocket.close();
      interviewerSocket.close();
    }
  } finally {
    await destroyHarness(harness);
  }
});

test("live rooms reject candidates outside their own assignment", async () => {
  const harness = await createHarness();

  try {
    const candidate = await login(harness.app, "alice.candidate@example.com");
    const socket = await connectLiveSocket(harness.app, {
      candidateId: "candidate_bob",
      problemId: "problem_reverse_string",
      token: candidate.token
    });

    try {
      const error = await nextMessage(socket, (message) => message.type === "error");
      assert.equal(error.type, "error");

      if (error.type === "error") {
        assert.equal(error.code, "forbidden");
      }

      const replayResponse = await harness.app.inject({
        method: "GET",
        url: "/admin/live/rooms/candidate_bob/problem_reverse_string/replay",
        headers: {
          authorization: `Bearer ${candidate.token}`
        }
      });

      assert.equal(replayResponse.statusCode, 403);
    } finally {
      socket.close();
    }
  } finally {
    await destroyHarness(harness);
  }
});

async function connectLiveSocket(app: FastifyInstance, query: {
  candidateId: string;
  problemId: string;
  token: string;
}) {
  if (!app.server.listening) {
    await app.listen({ port: 0 });
  }

  const address = app.server.address() as AddressInfo;
  const searchParams = new URLSearchParams(query);

  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/live/rooms?${searchParams.toString()}`, {
      headers: {
        "x-live-candidate-id": query.candidateId,
        "x-live-problem-id": query.problemId,
        "x-live-token": query.token
      }
    });

    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextMessage(socket: WebSocket, predicate: (message: LiveRoomServerMessage) => boolean) {
  return new Promise<LiveRoomServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", handleMessage);
      reject(new Error("Timed out waiting for live room message"));
    }, 1000);

    function handleMessage(raw: Buffer) {
      const message = JSON.parse(raw.toString()) as LiveRoomServerMessage;

      if (!predicate(message)) {
        return;
      }

      clearTimeout(timer);
      socket.off("message", handleMessage);
      resolve(message);
    }

    socket.on("message", handleMessage);
  });
}
