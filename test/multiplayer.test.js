import test from "node:test";
import assert from "node:assert/strict";
import {
  addMultiplayerSignal,
  clearMultiplayerRoomsForTests,
  createMultiplayerRoom,
  joinMultiplayerRoom,
  readMultiplayerSignals
} from "../src/multiplayer.js";

test("creates and joins a multiplayer room", () => {
  clearMultiplayerRoomsForTests();

  const created = createMultiplayerRoom();
  const joined = joinMultiplayerRoom(created.room.code);

  assert.match(created.room.code, /^[A-Z0-9]{5}$/);
  assert.equal(created.room.isHost, true);
  assert.equal(joined.room.isHost, false);
  assert.equal(joined.room.hostPeerId, created.peerId);
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

test("relays multiplayer signals to the targeted peer", () => {
  clearMultiplayerRoomsForTests();

  const host = createMultiplayerRoom();
  const guest = joinMultiplayerRoom(host.room.code);

  const written = addMultiplayerSignal(host.room.code, {
    from: host.peerId,
    to: guest.peerId,
    type: "offer",
    payload: { type: "offer", sdp: "test-sdp" }
  });
  const delivered = readMultiplayerSignals(host.room.code, guest.peerId, 0);
  const deliveredAgain = readMultiplayerSignals(host.room.code, guest.peerId, written.signalId);

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

test("rejects signals from non-room peers", () => {
  clearMultiplayerRoomsForTests();

  const host = createMultiplayerRoom();
  const guest = joinMultiplayerRoom(host.room.code);

  assert.throws(
    () => addMultiplayerSignal(host.room.code, {
      from: "notARealPeer",
      to: guest.peerId,
      type: "offer",
      payload: { type: "offer", sdp: "test-sdp" }
    }),
    (error) => error.statusCode === 400
  );
});
