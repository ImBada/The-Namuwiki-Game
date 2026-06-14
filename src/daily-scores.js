import { createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getRoundSecret } from "./config.js";
import { verifyCompletedDailyRound } from "./game.js";
import { httpError } from "./http.js";

const DATA_DIR = resolve(
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  join(process.cwd(), ".data")
);
const DAILY_SCORES_FILE = join(DATA_DIR, "daily-scores.json");
const USED_ROUND_TOKEN_HASHES_KEY = "_usedRoundTokenHashes";
const ROUND_SECRET = getRoundSecret();

let dailyScoreWriteQueue = Promise.resolve();

export async function getDailyLeaderboard() {
  const dateKey = todayDateKey();
  const store = await readDailyScoreStore();
  return {
    dateKey,
    scores: publicDailyScores(normalizeDailyScores(scoreStoreDateEntry(store, dateKey)).slice(0, 20))
  };
}

export async function submitDailyScore(body, options = {}) {
  const dateKey = todayDateKey();
  const nickname = normalizeNickname(body?.nickname);
  if (!nickname) throw httpError(400, "닉네임을 입력해 주세요.");

  const roundId = String(body?.roundId || "");
  const completedRound = verifyCompletedDailyRound(roundId, { dateKey });
  assertSubmittedRoundMetrics(body, completedRound);
  const now = resolveTimestamp(options.now);
  const completedAt = completionTimestampFromRound(completedRound, now);
  const elapsedSeconds = elapsedSecondsFromRound(completedRound.startedAt, completedAt, now);
  const roundTokenHashes = hashRoundSubmission(completedRound, roundId);
  const roundTokenHash = roundTokenHashes[0];

  const score = {
    id: createHmac("sha256", ROUND_SECRET)
      .update(`${dateKey}:${nickname}:${Date.now()}:${Math.random()}`)
      .digest("base64url")
      .slice(0, 16),
    dateKey,
    nickname,
    clickCount: completedRound.clickCount,
    elapsedSeconds,
    pathLength: completedRound.pathLength,
    completedAt: new Date(completedAt).toISOString(),
    roundTokenHash
  };

  const result = await queueDailyScoreWrite(async () => {
    const store = await readDailyScoreStore();
    const existingScores = normalizeDailyScores(scoreStoreDateEntry(store, dateKey));
    const usedRoundTokenHashes = collectUsedRoundTokenHashes(store, dateKey, existingScores);
    if (roundTokenHashes.some((hash) => usedRoundTokenHashes.has(hash))) {
      throw httpError(409, "이미 등록된 라운드 기록입니다.");
    }

    for (const hash of roundTokenHashes) {
      usedRoundTokenHashes.add(hash);
    }
    const sortedScores = [...existingScores, score].sort(compareScores);
    const rank = sortedScores.findIndex((item) => item.id === score.id) + 1;
    const todayOnlyStore = {
      [dateKey]: sortedScores.slice(0, 100),
      [USED_ROUND_TOKEN_HASHES_KEY]: {
        [dateKey]: [...usedRoundTokenHashes]
      }
    };
    await writeDailyScoreStore(todayOnlyStore);
    return {
      rank,
      scores: sortedScores.slice(0, 20)
    };
  });

  return {
    dateKey,
    score: publicDailyScore(score),
    rank: result.rank,
    scores: publicDailyScores(result.scores)
  };
}

function queueDailyScoreWrite(task) {
  dailyScoreWriteQueue = dailyScoreWriteQueue.then(task, task);
  return dailyScoreWriteQueue;
}

function assertSubmittedRoundMetrics(body, completedRound) {
  const clickCount = parseSubmittedInteger(body?.clickCount);
  const pathLength = parseSubmittedInteger(body?.pathLength);
  if (
    clickCount !== completedRound.clickCount ||
    pathLength !== completedRound.pathLength
  ) {
    throw httpError(400, "제출된 라운드 기록이 일치하지 않습니다.");
  }
}

function parseSubmittedInteger(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function completionTimestampFromRound(completedRound, now) {
  const completedAt = Number(completedRound.completedAt);
  return Number.isSafeInteger(completedAt) && completedAt > 0 ? completedAt : now;
}

function elapsedSecondsFromRound(startedAt, completedAt, now) {
  if (
    now + 5000 < startedAt ||
    now + 5000 < completedAt ||
    completedAt + 5000 < startedAt
  ) {
    throw httpError(400, "라운드 시간이 올바르지 않습니다.");
  }
  return clampInteger(
    Math.floor(Math.max(1000, completedAt - startedAt) / 1000),
    1,
    24 * 60 * 60
  );
}

function resolveTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

async function readDailyScoreStore() {
  try {
    return JSON.parse(await readFile(DAILY_SCORES_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeDailyScoreStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DAILY_SCORES_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

function normalizeDailyScores(scores) {
  return (Array.isArray(scores) ? scores : [])
    .map((score) => {
      const legacyRoundId = String(score.roundId || "").trim();
      return {
        id: String(score.id || ""),
        dateKey: normalizeDailyDateKey(score.dateKey),
        nickname: normalizeNickname(score.nickname) || "익명",
        clickCount: clampInteger(score.clickCount, 0, 999),
        elapsedSeconds: clampInteger(score.elapsedSeconds, 0, 24 * 60 * 60),
        pathLength: clampInteger(score.pathLength, 1, 1000),
        completedAt: String(score.completedAt || ""),
        roundTokenHash:
          normalizeRoundTokenHash(score.roundTokenHash) ||
          (legacyRoundId ? hashRoundToken(legacyRoundId) : "")
      };
    })
    .filter((score) => score.dateKey)
    .sort(compareScores);
}

function publicDailyScores(scores) {
  return scores.map(publicDailyScore);
}

function publicDailyScore(score) {
  const { roundTokenHash, ...publicScore } = score;
  return publicScore;
}

function scoreStoreDateEntry(store, dateKey) {
  return store && typeof store === "object" && !Array.isArray(store)
    ? store[dateKey]
    : [];
}

function collectUsedRoundTokenHashes(store, dateKey, scores) {
  const hashes = new Set(scores.map((score) => score.roundTokenHash).filter(Boolean));
  const metadata = store && typeof store === "object" && !Array.isArray(store)
    ? store[USED_ROUND_TOKEN_HASHES_KEY]
    : null;
  const storedHashes = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata[dateKey]
    : [];

  for (const hash of Array.isArray(storedHashes) ? storedHashes : []) {
    const normalizedHash = normalizeRoundTokenHash(hash);
    if (normalizedHash) hashes.add(normalizedHash);
  }

  return hashes;
}

function compareScores(a, b) {
  return (
    (a.clickCount || 0) - (b.clickCount || 0) ||
    (a.elapsedSeconds || 0) - (b.elapsedSeconds || 0) ||
    (a.pathLength || 0) - (b.pathLength || 0) ||
    String(a.completedAt || "").localeCompare(String(b.completedAt || ""))
  );
}

function normalizeNickname(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

function clampInteger(value, min, max) {
  const integer = Number.parseInt(value, 10);
  if (!Number.isFinite(integer)) return min;
  return Math.max(min, Math.min(max, integer));
}

function hashRoundToken(roundId) {
  return createHmac("sha256", ROUND_SECRET)
    .update(roundId)
    .digest("base64url");
}

function hashRoundSubmission(completedRound, roundId) {
  const attemptId = normalizeRoundAttemptId(completedRound.attemptId);
  if (attemptId) {
    return [hashRoundSubmissionKey(`attempt:${completedRound.dailyDateKey}:${attemptId}`)];
  }

  const legacyStableHash = hashRoundSubmissionKey([
    "legacy-attempt",
    completedRound.dailyDateKey,
    completedRound.startedAt,
    completedRound.startTitle,
    completedRound.goalTitle
  ].join("\u001f"));
  const exactTokenHash = hashRoundToken(roundId);
  return legacyStableHash === exactTokenHash
    ? [legacyStableHash]
    : [legacyStableHash, exactTokenHash];
}

function hashRoundSubmissionKey(key) {
  return createHmac("sha256", ROUND_SECRET)
    .update(key)
    .digest("base64url");
}

function normalizeRoundTokenHash(value) {
  const hash = String(value || "").trim();
  return /^[A-Za-z0-9_-]{32,128}$/.test(hash) ? hash : "";
}

function normalizeRoundAttemptId(value) {
  const attemptId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(attemptId) ? attemptId : "";
}

function normalizeDailyDateKey(value) {
  const normalized = String(value || "")
    .replace(/^daily-/, "")
    .trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function todayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}
