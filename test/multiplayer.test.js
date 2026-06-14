import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleRequest } from "../server.js";
import {
  addMultiplayerSignal,
  clearMultiplayerRoomsForTests,
  createMultiplayerRoom,
  getMultiplayerRoom,
  joinMultiplayerRoom,
  readMultiplayerSignals
} from "../src/multiplayer.js";

const PEER_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const statusCode = (expected) => (error) => error.statusCode === expected;

function createRequest(method, url, body, headers = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Readable.from(chunks);
  request.method = method;
  request.url = url;
  request.headers = {
    host: "example.com",
    ...headers
  };
  return request;
}

function createResponseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: Buffer.alloc(0),
    writeHead(statusCodeValue, headers) {
      this.statusCode = statusCodeValue;
      this.headers = headers;
    },
    end(data) {
      this.body = Buffer.isBuffer(data) ? data : Buffer.from(String(data || ""));
    }
  };
}

async function requestJson(method, url, body, headers) {
  const response = createResponseRecorder();
  await handleRequest(createRequest(method, url, body, headers), response);
  return {
    statusCode: response.statusCode,
    payload: JSON.parse(response.body.toString("utf8"))
  };
}

test("creates and joins a multiplayer room", () => {
  clearMultiplayerRoomsForTests();

  const created = createMultiplayerRoom();
  const joined = joinMultiplayerRoom(created.room.code);
  const hostView = getMultiplayerRoom(created.room.code, created.peerId, created.peerSecret);

  assert.match(created.room.code, /^[A-Z0-9]{5}$/);
  assert.match(created.peerSecret, PEER_SECRET_PATTERN);
  assert.match(joined.peerSecret, PEER_SECRET_PATTERN);
  assert.notEqual(created.peerSecret, created.peerId);
  assert.notEqual(joined.peerSecret, joined.peerId);
  assert.equal(created.room.isHost, true);
  assert.equal(joined.room.isHost, false);
  assert.equal(joined.room.hostPeerId, created.peerId);
  assert.equal(joined.room.guestPeerId, joined.peerId);
  assert.equal(hostView.room.guestPeerId, joined.peerId);
  assert.equal(joined.room.hasGuest, true);
  assert.deepEqual(Object.keys(joined.room).sort(), [
    "code",
    "expiresAt",
    "guestPeerId",
    "hasGuest",
    "hostPeerId",
    "isHost"
  ]);
});

test("requires peer secrets before exposing room peer ids", () => {
  clearMultiplayerRoomsForTests();

  const host = createMultiplayerRoom();
  const guest = joinMultiplayerRoom(host.room.code);

  assert.throws(() => getMultiplayerRoom(host.room.code), statusCode(403));
  assert.throws(() => getMultiplayerRoom(host.room.code, host.peerId), statusCode(403));
  assert.throws(
    () => getMultiplayerRoom(host.room.code, host.peerId, guest.peerSecret),
    statusCode(403)
  );

  const roomView = getMultiplayerRoom(host.room.code, host.peerId, host.peerSecret);
  assert.equal(roomView.room.hostPeerId, host.peerId);
  assert.equal(roomView.room.guestPeerId, guest.peerId);
});

test("relays multiplayer signals to the targeted peer", () => {
  clearMultiplayerRoomsForTests();

  const host = createMultiplayerRoom();
  const guest = joinMultiplayerRoom(host.room.code);

  const written = addMultiplayerSignal(host.room.code, {
    from: host.peerId,
    peerSecret: host.peerSecret,
    to: guest.peerId,
    type: "offer",
    payload: { type: "offer", sdp: "test-sdp" }
  });
  const delivered = readMultiplayerSignals(host.room.code, guest.peerId, guest.peerSecret, 0);
  const deliveredAgain = readMultiplayerSignals(
    host.room.code,
    guest.peerId,
    guest.peerSecret,
    written.signalId
  );

  assert.equal(written.ok, true);
  assert.deepEqual(delivered.signals, [
    {
      id: written.signalId,
      from: host.peerId,
      type: "offer",
      payload: { type: "offer", sdp: "test-sdp" }
    }
  ]);
  assert.deepEqual(deliveredAgain.signals, []);
});

test("rejects signal reads without the peer secret", () => {
  clearMultiplayerRoomsForTests();

  const host = createMultiplayerRoom();
  const guest = joinMultiplayerRoom(host.room.code);

  const written = addMultiplayerSignal(host.room.code, {
    from: host.peerId,
    peerSecret: host.peerSecret,
    to: guest.peerId,
    type: "offer",
    payload: { type: "offer", sdp: "test-sdp" }
  });

  assert.throws(
    () => readMultiplayerSignals(host.room.code, guest.peerId, host.peerSecret, 0),
    statusCode(403)
  );

  const delivered = readMultiplayerSignals(host.room.code, guest.peerId, guest.peerSecret, 0);
  assert.equal(delivered.signals[0].id, written.signalId);
});

test("rejects signals from non-room peers", () => {
  clearMultiplayerRoomsForTests();

  const host = createMultiplayerRoom();
  const guest = joinMultiplayerRoom(host.room.code);

  assert.throws(
    () => addMultiplayerSignal(host.room.code, {
      from: host.peerId,
      peerSecret: host.peerSecret,
      to: "notARealPeer",
      type: "offer",
      payload: { type: "offer", sdp: "test-sdp" }
    }),
    (error) => error.statusCode === 400
  );
});

test("rejects spoofed room-peer signals without the peer secret", () => {
  clearMultiplayerRoomsForTests();

  const host = createMultiplayerRoom();
  const guest = joinMultiplayerRoom(host.room.code);

  assert.throws(
    () => addMultiplayerSignal(host.room.code, {
      from: host.peerId,
      to: guest.peerId,
      type: "offer",
      payload: { type: "offer", sdp: "test-sdp" }
    }),
    statusCode(403)
  );
  assert.throws(
    () => addMultiplayerSignal(host.room.code, {
      from: host.peerId,
      peerSecret: guest.peerSecret,
      to: guest.peerId,
      type: "offer",
      payload: { type: "offer", sdp: "test-sdp" }
    }),
    statusCode(403)
  );

  const delivered = readMultiplayerSignals(host.room.code, guest.peerId, guest.peerSecret, 0);
  assert.deepEqual(delivered.signals, []);
});

test("accepts peer secrets through multiplayer API headers", async () => {
  clearMultiplayerRoomsForTests();

  const created = await requestJson("POST", "/api/multiplayer/rooms", {});
  const joined = await requestJson("POST", `/api/multiplayer/rooms/${created.payload.room.code}`, {});

  const unauthenticatedRoomRead = await requestJson(
    "GET",
    `/api/multiplayer/rooms/${created.payload.room.code}?peerId=${created.payload.peerId}`
  );
  assert.equal(unauthenticatedRoomRead.statusCode, 403);

  const roomRead = await requestJson(
    "GET",
    `/api/multiplayer/rooms/${created.payload.room.code}?peerId=${created.payload.peerId}`,
    undefined,
    { "x-peer-secret": created.payload.peerSecret }
  );
  assert.equal(roomRead.statusCode, 200);
  assert.equal(roomRead.payload.room.hostPeerId, created.payload.peerId);
  assert.equal(roomRead.payload.room.guestPeerId, joined.payload.peerId);

  const written = await requestJson(
    "POST",
    `/api/multiplayer/rooms/${created.payload.room.code}/signals`,
    {
      from: created.payload.peerId,
      to: joined.payload.peerId,
      type: "offer",
      payload: { type: "offer", sdp: "test-sdp" }
    },
    { "x-peer-secret": created.payload.peerSecret }
  );
  assert.equal(written.statusCode, 201);

  const signals = await requestJson(
    "GET",
    `/api/multiplayer/rooms/${created.payload.room.code}/signals?peerId=${joined.payload.peerId}`,
    undefined,
    { "x-peer-secret": joined.payload.peerSecret }
  );
  assert.equal(signals.statusCode, 200);
  assert.deepEqual(signals.payload.signals, [
    {
      id: written.payload.signalId,
      from: created.payload.peerId,
      type: "offer",
      payload: { type: "offer", sdp: "test-sdp" }
    }
  ]);
});
