import { createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { httpError } from "./http.js";

const DATA_DIR = resolve(
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  join(process.cwd(), ".data")
);
const DAILY_SCORES_FILE = join(DATA_DIR, "daily-scores.json");
const ROUND_SECRET =
  process.env.ROUND_SECRET || "the-namuwiki-game-local-round-secret";

let dailyScoreWriteQueue = Promise.resolve();

export async function getDailyLeaderboard() {
  const dateKey = todayDateKey();
  const store = await readDailyScoreStore();
  return {
    dateKey,
    scores: normalizeDailyScores(store[dateKey] || []).slice(0, 20)
  };
}

export async function submitDailyScore(body) {
  const dateKey = todayDateKey();
  const nickname = normalizeNickname(body?.nickname);
  if (!nickname) throw httpError(400, "닉네임을 입력해 주세요.");

  const score = {
    id: createHmac("sha256", ROUND_SECRET)
      .update(`${dateKey}:${nickname}:${Date.now()}:${Math.random()}`)
      .digest("base64url")
      .slice(0, 16),
    dateKey,
    nickname,
    clickCount: clampInteger(body?.clickCount, 0, 999),
    elapsedSeconds: clampInteger(body?.elapsedSeconds, 0, 24 * 60 * 60),
    pathLength: clampInteger(body?.pathLength, 1, 1000),
    completedAt: new Date().toISOString()
  };

  const result = await queueDailyScoreWrite(async () => {
    const store = await readDailyScoreStore();
    const todayOnlyStore = { [dateKey]: normalizeDailyScores(store[dateKey] || []) };
    const sortedScores = [...todayOnlyStore[dateKey], score].sort(compareScores);
    const rank = sortedScores.findIndex((item) => item.id === score.id) + 1;
    todayOnlyStore[dateKey] = sortedScores.slice(0, 100);
    await writeDailyScoreStore(todayOnlyStore);
    return {
      rank,
      scores: sortedScores.slice(0, 20)
    };
  });

  return { dateKey, score, rank: result.rank, scores: result.scores };
}

function queueDailyScoreWrite(task) {
  dailyScoreWriteQueue = dailyScoreWriteQueue.then(task, task);
  return dailyScoreWriteQueue;
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
    .map((score) => ({
      id: String(score.id || ""),
      dateKey: normalizeDailyDateKey(score.dateKey),
      nickname: normalizeNickname(score.nickname) || "익명",
      clickCount: clampInteger(score.clickCount, 0, 999),
      elapsedSeconds: clampInteger(score.elapsedSeconds, 0, 24 * 60 * 60),
      pathLength: clampInteger(score.pathLength, 1, 1000),
      completedAt: String(score.completedAt || "")
    }))
    .filter((score) => score.dateKey)
    .sort(compareScores);
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
