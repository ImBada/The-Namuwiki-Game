import { randomBytes } from "node:crypto";
import { httpError } from "./http.js";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 5;
const ROOM_TTL_MS = Number.parseInt(process.env.MULTIPLAYER_ROOM_TTL_MS || "1800000", 10);
const SIGNAL_TTL_MS = Number.parseInt(process.env.MULTIPLAYER_SIGNAL_TTL_MS || "120000", 10);
const MAX_SIGNALS_PER_ROOM = Number.parseInt(
  process.env.MULTIPLAYER_MAX_SIGNALS_PER_ROOM || "80",
  10
);

const rooms = new Map();
let nextSignalId = 1;
let lastCleanupAt = 0;

export function createMultiplayerRoom(body = {}) {
  cleanupMultiplayerRooms();

  const hostPeerId = createPeerId();
  const room = {
    code: createRoomCode(),
    hostPeerId,
    guestPeerId: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + ROOM_TTL_MS,
    signals: []
  };

  rooms.set(room.code, room);
  return publicRoom(room, hostPeerId);
}

export function joinMultiplayerRoom(code, body = {}) {
  cleanupMultiplayerRooms();

  const room = getRoom(code);
  if (room.guestPeerId) {
    throw httpError(409, "이미 꽉 찬 방입니다.");
  }

  room.guestPeerId = createPeerId();
  touchRoom(room);
  return publicRoom(room, room.guestPeerId);
}

export function getMultiplayerRoom(code, peerId = "") {
  cleanupMultiplayerRooms();

  const room = getRoom(code);
  if (peerId && !isRoomPeer(room, peerId)) {
    throw httpError(403, "이 방에 참여한 플레이어가 아닙니다.");
  }
  return publicRoom(room, peerId);
}

export function addMultiplayerSignal(code, body = {}) {
  cleanupMultiplayerRooms();

  const room = getRoom(code);
  const from = normalizePeerId(body.from);
  const to = normalizePeerId(body.to);
  if (!isRoomPeer(room, from) || !isRoomPeer(room, to) || from === to) {
    throw httpError(400, "잘못된 시그널 대상입니다.");
  }

  const signal = {
    id: nextSignalId,
    from,
    to,
    type: normalizeSignalType(body.type),
    payload: normalizeSignalPayload(body.payload),
    createdAt: Date.now()
  };
  nextSignalId += 1;
  room.signals.push(signal);
  room.signals = pruneSignals(room.signals).slice(-MAX_SIGNALS_PER_ROOM);
  touchRoom(room);

  return { ok: true, signalId: signal.id };
}

export function readMultiplayerSignals(code, peerId, after = 0) {
  cleanupMultiplayerRooms();

  const room = getRoom(code);
  const normalizedPeerId = normalizePeerId(peerId);
  if (!isRoomPeer(room, normalizedPeerId)) {
    throw httpError(403, "이 방에 참여한 플레이어가 아닙니다.");
  }

  const afterId = Number.parseInt(after, 10) || 0;
  const signals = pruneSignals(room.signals)
    .filter((signal) => signal.to === normalizedPeerId && signal.id > afterId)
    .map((signal) => ({
      id: signal.id,
      from: signal.from,
      type: signal.type,
      payload: signal.payload
    }));
  room.signals = room.signals.filter(
    (signal) => signal.to !== normalizedPeerId || signal.id > (signals.at(-1)?.id || afterId)
  );
  touchRoom(room);

  return { signals, room: publicRoom(room, normalizedPeerId).room };
}

export function clearMultiplayerRoomsForTests() {
  rooms.clear();
  nextSignalId = 1;
  lastCleanupAt = 0;
}

function createRoomCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    const bytes = randomBytes(ROOM_CODE_LENGTH);
    for (const byte of bytes) {
      code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
    }
    if (!rooms.has(code)) return code;
  }
  throw httpError(503, "방 코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function createPeerId() {
  return randomBytes(9).toString("base64url");
}

function getRoom(code) {
  const normalizedCode = normalizeRoomCode(code);
  const room = rooms.get(normalizedCode);
  if (!room || room.expiresAt <= Date.now()) {
    if (room) rooms.delete(normalizedCode);
    throw httpError(404, "방을 찾을 수 없습니다.");
  }
  return room;
}

function normalizeRoomCode(code) {
  const normalized = String(code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{5}$/.test(normalized)) {
    throw httpError(400, "방 코드는 5자리입니다.");
  }
  return normalized;
}

function normalizePeerId(peerId) {
  const normalized = String(peerId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(normalized)) {
    throw httpError(400, "잘못된 플레이어 ID입니다.");
  }
  return normalized;
}

function normalizeSignalType(type) {
  const normalized = String(type || "").trim();
  if (!["offer", "answer", "ice"].includes(normalized)) {
    throw httpError(400, "지원하지 않는 시그널입니다.");
  }
  return normalized;
}

function normalizeSignalPayload(payload) {
  const encoded = JSON.stringify(payload);
  if (!encoded || encoded.length > 16000) {
    throw httpError(413, "시그널이 너무 큽니다.");
  }
  return JSON.parse(encoded);
}

function isRoomPeer(room, peerId) {
  return room.hostPeerId === peerId || room.guestPeerId === peerId;
}

function publicRoom(room, peerId = "") {
  return {
    room: {
      code: room.code,
      isHost: peerId ? room.hostPeerId === peerId : false,
      hostPeerId: room.hostPeerId,
      guestPeerId: room.guestPeerId,
      hasGuest: Boolean(room.guestPeerId),
      expiresAt: new Date(room.expiresAt).toISOString()
    },
    peerId
  };
}

function touchRoom(room) {
  room.updatedAt = Date.now();
  room.expiresAt = Date.now() + ROOM_TTL_MS;
}

function pruneSignals(signals) {
  const minimumCreatedAt = Date.now() - SIGNAL_TTL_MS;
  return signals.filter((signal) => signal.createdAt >= minimumCreatedAt);
}

function cleanupMultiplayerRooms() {
  const now = Date.now();
  if (now - lastCleanupAt < 30000) return;
  lastCleanupAt = now;
  for (const [code, room] of rooms) {
    if (room.expiresAt <= now) rooms.delete(code);
    else room.signals = pruneSignals(room.signals);
  }
}
