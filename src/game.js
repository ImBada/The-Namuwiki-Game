import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { brotliCompress, brotliDecompress } from "node:zlib";
import { promisify } from "node:util";
import {
  encodeTitle,
  extractArticle,
  extractBalancedElement,
  extractInternalLinks,
  isPlayableArticleTitle,
  makeArticleUrl,
  makeBacklinkUrl,
  normalizeTitle,
  stripTags
} from "./namu.js";
import { getRoundSecret } from "./config.js";
import { httpError } from "./http.js";

const DOCUMENT_CACHE_TTL_DAYS = 7;
const DOCUMENT_TTL_MS = 1000 * 60 * 60 * 24 * DOCUMENT_CACHE_TTL_DAYS;
const DOCUMENT_CACHE_VERSION = 9;
const DOCUMENT_CACHE_MAX_ENTRIES = Number.parseInt(
  process.env.DOCUMENT_CACHE_MAX_ENTRIES || "1000",
  10
);
const DATA_DIR = resolve(
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  join(process.cwd(), ".data")
);
const DOCUMENT_CACHE_DIR = resolve(
  process.env.DOCUMENT_CACHE_DIR ||
  join(DATA_DIR, "document-cache")
);
const DAILY_ROUNDS_FILE = join(DATA_DIR, "daily-rounds.json");
const compressCachePayload = promisify(brotliCompress);
const decompressCachePayload = promisify(brotliDecompress);
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const NAMU_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://namu.wiki/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin"
};
const NAMU_BACKLINK_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://namu.wiki/"
};
const NAMU_FETCH_TIMEOUT_MS = Number.parseInt(
  process.env.NAMU_FETCH_TIMEOUT_MS || "10000",
  10
);
const ROUND_SECRET = getRoundSecret();
const ALLOW_SYNTHETIC_FALLBACK = process.env.ALLOW_SYNTHETIC_FALLBACK === "1";

const documentCache = new Map();
const dailyRoundCache = new Map();
let dailyRoundWriteQueue = Promise.resolve();

const curatedFallbackTitles = [
  "대한민국", "서울특별시", "인터넷", "게임", "컴퓨터", "한글", "위키", "과학",
  "역사", "음악", "영화", "축구", "스타크래프트", "부산광역시", "일본", "미국",
  "유럽", "철도", "자동차", "스마트폰", "프로그래밍"
];

const targetFallbackTitles = [
  "대한민국", "서울특별시", "인터넷", "게임", "컴퓨터", "한글", "영화", "음악",
  "축구", "부산광역시", "일본", "미국", "철도", "자동차"
];

const randomPickAttempts = 6;
const sensitiveTerms = [
  "강간", "성폭행", "성추행", "능욕", "자살", "살인", "고문", "학살", "아동학대"
];

export async function createRound(options = {}) {
  const requestedStartTitle = normalizeTitle(options.startTitle);
  const requestedGoalTitle = normalizeTitle(options.goalTitle);
  const requestedDailyChallenge = Boolean(options.dailyChallenge);
  const persistedDailyChallenge = Boolean(options.persistedDailyChallenge);
  const dailyChallenge = persistedDailyChallenge;
  const dailyDateKey = dailyChallenge
    ? normalizeDailyDateKey(options.dailyDateKey)
    : "";
  if (
    requestedStartTitle &&
    requestedGoalTitle &&
    sameTitle(requestedStartTitle, requestedGoalTitle)
  ) {
    throw httpError(400, "시작 문서와 목표 문서는 서로 달라야 합니다.");
  }
  if (
    requestedDailyChallenge &&
    !persistedDailyChallenge &&
    !requestedStartTitle &&
    !requestedGoalTitle
  ) {
    return createPersistedDailyRound(todayDateKey());
  }

  const startArticle = requestedStartTitle
    ? await getRequestedArticle(requestedStartTitle, "시작")
    : await pickArticleCandidate({
        role: "start",
        exceptTitles: [],
        minLinks: 12
      });
  let goalArticle = requestedGoalTitle
    ? await getRequestedArticle(requestedGoalTitle, "목표")
    : await pickArticleCandidate({
        role: "goal",
        exceptTitles: [startArticle.title],
        minLinks: 4
      });
  if (isSingleHanCharacterTitle(goalArticle.title)) {
    throw httpError(400, `목표 문서 "${goalArticle.title}"은(는) 한 글자 한자 문서라 사용할 수 없습니다.`);
  }
  if (requestedGoalTitle) {
    await assertGoalArticleHasBacklinks(goalArticle);
  }

  if (normalizeTitle(goalArticle.title) === normalizeTitle(startArticle.title)) {
    throw httpError(502, "목표 문서 후보를 확인하지 못했습니다. 다시 시작해 주세요.");
  }

  const round = {
    attemptId: createRoundAttemptId(),
    startTitle: startArticle.title,
    goalTitle: goalArticle.title,
    currentTitle: startArticle.title,
    path: [startArticle.title],
    startedAt: Date.now(),
    clickCount: 0,
    dailyChallenge,
    dailyDateKey
  };

  return {
    round: publicRound(round),
    article: startArticle,
    goal: compactArticle(goalArticle)
  };
}

async function getRequestedArticle(title, roleLabel) {
  try {
    return await getArticle(title);
  } catch (error) {
    throw httpError(
      error.statusCode || 502,
      `${roleLabel} 문서 "${title}"을(를) 불러오지 못했습니다. 문서 제목이 정확한지 확인해 주세요.`
    );
  }
}

async function createPersistedDailyRound(dateKey) {
  const storedRound = await getOrCreateDailyRound(dateKey);
  return createRound({
    startTitle: storedRound.startTitle,
    goalTitle: storedRound.goalTitle,
    dailyChallenge: true,
    persistedDailyChallenge: true,
    dailyDateKey: dateKey
  });
}

async function getOrCreateDailyRound(dateKey) {
  const cachedRound = dailyRoundCache.get(dateKey);
  if (cachedRound) return cachedRound;

  const store = await readDailyRoundStore();
  const existingRound = normalizeStoredDailyRound(dateKey, store[dateKey]);
  if (existingRound) {
    dailyRoundCache.set(dateKey, existingRound);
    return existingRound;
  }

  return queueDailyRoundWrite(async () => {
    const queuedCachedRound = dailyRoundCache.get(dateKey);
    if (queuedCachedRound) return queuedCachedRound;

    const latestStore = await readDailyRoundStore();
    const latestRound = normalizeStoredDailyRound(dateKey, latestStore[dateKey]);
    if (latestRound) {
      dailyRoundCache.set(dateKey, latestRound);
      return latestRound;
    }

    const startArticle = await pickArticleCandidate({
      role: "start",
      exceptTitles: [],
      minLinks: 12
    });
    const goalArticle = await pickArticleCandidate({
      role: "goal",
      exceptTitles: [startArticle.title],
      minLinks: 4
    });
    const dailyRound = {
      dateKey,
      startTitle: startArticle.title,
      goalTitle: goalArticle.title,
      createdAt: new Date().toISOString()
    };

    latestStore[dateKey] = dailyRound;
    dailyRoundCache.set(dateKey, dailyRound);
    try {
      await writeDailyRoundStore(pruneDailyRoundStore(latestStore));
    } catch (error) {
      console.warn(`Could not write daily round store to ${DAILY_ROUNDS_FILE}: ${error.message}`);
    }
    return dailyRound;
  });
}

function queueDailyRoundWrite(task) {
  dailyRoundWriteQueue = dailyRoundWriteQueue.then(task, task);
  return dailyRoundWriteQueue;
}

async function readDailyRoundStore() {
  try {
    return JSON.parse(await readFile(DAILY_ROUNDS_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeDailyRoundStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DAILY_ROUNDS_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

function normalizeStoredDailyRound(dateKey, round) {
  const startTitle = normalizeTitle(round?.startTitle);
  const goalTitle = normalizeTitle(round?.goalTitle);
  if (!startTitle || !goalTitle || sameTitle(startTitle, goalTitle)) return null;

  return {
    dateKey,
    startTitle,
    goalTitle,
    createdAt: String(round?.createdAt || "")
  };
}

function pruneDailyRoundStore(store) {
  const entries = Object.entries(store || {})
    .map(([dateKey, round]) => [normalizeDailyDateKey(dateKey), normalizeStoredDailyRound(dateKey, round)])
    .filter(([normalizedDateKey, round]) => normalizedDateKey && round)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 60);

  return Object.fromEntries(entries);
}

export async function handleClick(body) {
  const round = decodeRoundToken(String(body?.roundId || ""));
  if (!round) throw httpError(404, "Round not found");

  const nextTitle = normalizeTitle(body?.title);
  const currentArticle = await getArticle(round.currentTitle);
  const legalMove = currentArticle.links.some(
    (link) => normalizeTitle(link.title) === nextTitle
  );

  if (!legalMove) {
    throw httpError(400, "That article is not linked from the current page");
  }

  const nextArticle = await getArticle(nextTitle);
  round.currentTitle = nextArticle.title;
  round.path.push(nextArticle.title);
  round.clickCount += 1;

  const completed =
    normalizeTitle(nextArticle.title) === normalizeTitle(round.goalTitle);
  if (completed) {
    const completedAt = Number(round.completedAt);
    round.completedAt = Number.isSafeInteger(completedAt) && completedAt > 0
      ? completedAt
      : Date.now();
  } else {
    delete round.completedAt;
  }

  return {
    round: publicRound(round),
    article: nextArticle,
    completed
  };
}

export async function handleRewind(body) {
  const round = decodeRoundToken(String(body?.roundId || ""));
  if (!round) throw httpError(404, "Round not found");

  const index = Number.parseInt(body?.pathIndex, 10);
  if (!Number.isInteger(index) || index < 0 || index >= round.path.length) {
    throw httpError(400, "Path item not found");
  }

  const rewoundPath = round.path.slice(0, index + 1);
  const currentTitle = rewoundPath[rewoundPath.length - 1];
  const article = await getArticle(currentTitle);

  round.currentTitle = article.title;
  round.path = rewoundPath;
  round.path[round.path.length - 1] = article.title;
  round.clickCount = Math.max(0, round.path.length - 1);
  const completed = normalizeTitle(article.title) === normalizeTitle(round.goalTitle);
  if (!completed) delete round.completedAt;

  return {
    round: publicRound(round),
    article,
    completed
  };
}

export function verifyCompletedDailyRound(roundId, options = {}) {
  const round = decodeRoundToken(String(roundId || ""));
  if (!round) throw httpError(400, "유효하지 않은 라운드입니다.");
  if (!round.dailyChallenge) {
    throw httpError(400, "일일 챌린지 기록만 등록할 수 있습니다.");
  }

  const expectedDateKey = normalizeDailyDateKey(options.dateKey) || todayDateKey();
  const dailyDateKey = normalizeDailyDateKey(round.dailyDateKey);
  const startTitle = normalizeTitle(round.startTitle);
  const goalTitle = normalizeTitle(round.goalTitle);
  const currentTitle = normalizeTitle(round.currentTitle);
  const path = Array.isArray(round.path) ? round.path.map((title) => normalizeTitle(title)) : [];
  const clickCount = Number(round.clickCount);
  const startedAt = Number(round.startedAt);
  const attemptId = normalizeRoundAttemptId(round.attemptId);
  const hasCompletedAt =
    round.completedAt !== undefined &&
    round.completedAt !== null &&
    round.completedAt !== "";
  const completedAt = Number(round.completedAt);

  if (
    !startTitle ||
    !goalTitle ||
    !currentTitle ||
    path.length < 2 ||
    path.some((title) => !title)
  ) {
    throw httpError(400, "라운드 기록이 올바르지 않습니다.");
  }
  if (!sameTitle(path[0], startTitle)) {
    throw httpError(400, "라운드 기록이 올바르지 않습니다.");
  }
  if (!dailyDateKey || dailyDateKey !== expectedDateKey) {
    throw httpError(400, "오늘의 일일 챌린지 기록만 등록할 수 있습니다.");
  }
  if (!sameTitle(currentTitle, goalTitle) || !sameTitle(path[path.length - 1], goalTitle)) {
    throw httpError(400, "완료된 일일 챌린지만 등록할 수 있습니다.");
  }
  if (
    !Number.isSafeInteger(clickCount) ||
    clickCount < 0 ||
    clickCount !== path.length - 1
  ) {
    throw httpError(400, "라운드 클릭 기록이 일치하지 않습니다.");
  }
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0) {
    throw httpError(400, "라운드 시간이 올바르지 않습니다.");
  }
  if (
    hasCompletedAt &&
    (!Number.isSafeInteger(completedAt) || completedAt < startedAt)
  ) {
    throw httpError(400, "라운드 시간이 올바르지 않습니다.");
  }

  return {
    startTitle,
    goalTitle,
    currentTitle,
    path,
    clickCount,
    pathLength: path.length,
    startedAt,
    ...(attemptId ? { attemptId } : {}),
    ...(hasCompletedAt ? { completedAt } : {}),
    dailyDateKey,
    dailyChallenge: true
  };
}

async function pickRandomArticle() {
  try {
    const response = await fetch("https://namu.wiki/random", {
      signal: AbortSignal.timeout(NAMU_FETCH_TIMEOUT_MS)
    });
    const article = extractArticle(await response.text(), "");
    if (article.title && article.links.length > 0) {
      await cacheArticle(article, [article.title]);
      return article;
    }
  } catch {
    // Fall through to curated fallback.
  }

  return getArticle(pickCuratedTitle());
}

async function pickArticleCandidate({ role, exceptTitles, minLinks }) {
  const acceptedFallbacks = role === "goal" ? targetFallbackTitles : curatedFallbackTitles;
  const candidates = [];

  for (let attempt = 0; attempt < randomPickAttempts; attempt += 1) {
    try {
      const article = await pickRandomArticle();
      if (exceptTitles.some((exceptTitle) => sameTitle(article.title, exceptTitle))) continue;
      const quality = scoreArticleQuality(article, { minLinks, role });
      if (quality.accepted) {
        if (role !== "goal") return article;
        const backlinkStatus = await articleHasBacklinks(article);
        if (backlinkStatus === true) return article;
        if (backlinkStatus === false) {
          candidates.push({
            article,
            quality: scoreArticleQuality(withBacklinkStatus(article, false), { minLinks, role })
          });
        }
        continue;
      }
      candidates.push({ article, quality });
    } catch {
      // Try another candidate, then fall back to curated titles.
    }
  }

  const bestCandidate = candidates
    .filter(({ article }) => !exceptTitles.some((exceptTitle) => sameTitle(article.title, exceptTitle)))
    .sort((a, b) => b.quality.score - a.quality.score)[0];

  if (bestCandidate?.quality.accepted) return bestCandidate.article;

  if (role === "goal") {
    throw httpError(502, "목표 문서 후보를 확인하지 못했습니다. 다시 시작해 주세요.");
  }

  for (const fallbackTitle of shuffled(acceptedFallbacks)) {
    if (exceptTitles.some((exceptTitle) => sameTitle(fallbackTitle, exceptTitle))) continue;
    const article = await getArticle(fallbackTitle);
    const quality = scoreArticleQuality(article, {
      minLinks: Math.min(minLinks, 6),
      role
    });
    if (quality.score < 50) continue;
    if (role === "goal" && (await articleHasBacklinks(article)) !== true) continue;
    return article;
  }

  return getArticle(pickCuratedTitle(exceptTitles[0], acceptedFallbacks));
}

function pickCuratedTitle(exceptTitle = "", pool = curatedFallbackTitles) {
  const candidates = pool.filter(
    (title) => normalizeTitle(title) !== normalizeTitle(exceptTitle)
  );
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function getArticle(title) {
  const key = normalizeTitle(title);
  const now = Date.now();
  const cached = await getCachedArticle(key, now);

  if (cached) return cached;

  const attempts = [
    { url: makeArticleUrl(key) },
    { url: makeArticleUrl(key), headers: NAMU_HEADERS }
  ];
  let lastStatus = 0;
  let article = null;

  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      headers: attempt.headers,
      signal: AbortSignal.timeout(NAMU_FETCH_TIMEOUT_MS)
    });
    lastStatus = response.status;

    if (!response.ok) {
      continue;
    }

    const rawText = Buffer.from(await response.arrayBuffer()).toString("utf8");
    const candidate = extractArticle(rawText, key);
    if (!looksLikeClientShell(candidate)) {
      article = candidate;
      break;
    }
  }

  if (!article) {
    if (ALLOW_SYNTHETIC_FALLBACK && lastStatus === 403) {
      const article = syntheticArticle(key, lastStatus);
      await cacheArticle(article, [key], now);
      return article;
    }
    throw httpError(lastStatus || 502, `Could not fetch article: ${key}`);
  }

  await cacheArticle(article, [normalizeTitle(article.title), key], now);

  return article;
}

async function assertGoalArticleHasBacklinks(article) {
  const hasBacklinks = await articleHasBacklinks(article);
  if (hasBacklinks === true) return;
  if (hasBacklinks === null) {
    throw httpError(
      502,
      `목표 문서 "${article.title}"의 역링크를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.`
    );
  }
  throw httpError(
    400,
    `목표 문서 "${article.title}"은(는) 역링크가 없어 목표로 사용할 수 없습니다.`
  );
}

async function articleHasBacklinks(article) {
  if (typeof article?.hasBacklinks === "boolean") return article.hasBacklinks;

  const backlinkLinks = await fetchBacklinkLinks(article?.title);
  if (!backlinkLinks) return null;

  const backlinkCount = backlinkLinks.filter((link) =>
    isBacklinkSourceTitle(link.title, article.title)
  ).length;
  Object.assign(article, {
    hasBacklinks: backlinkCount > 0,
    backlinkCount
  });
  await cacheArticle(article, [article.title]);
  return backlinkCount > 0;
}

async function fetchBacklinkLinks(title) {
  const key = normalizeTitle(title);
  if (!key) return [];

  const attempts = [
    { url: makeBacklinkUrl(key) },
    { url: makeBacklinkUrl(key), headers: NAMU_BACKLINK_HEADERS }
  ];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        headers: attempt.headers,
        signal: AbortSignal.timeout(NAMU_FETCH_TIMEOUT_MS)
      });
      if (!response.ok) continue;

      const rawText = Buffer.from(await response.arrayBuffer()).toString("utf8");
      const links = extractInternalLinks(rawText, key);
      if (links.length > 0 || looksLikeEmptyBacklinkPage(rawText)) return links;
    } catch {
      // Try the next request shape, then treat it as unverified.
    }
  }

  return null;
}

function looksLikeEmptyBacklinkPage(html) {
  return /해당\s*문서의\s*역링크가\s*존재하지\s*않습니다/.test(String(html || ""));
}

function isBacklinkSourceTitle(sourceTitle, targetTitle) {
  const title = normalizeTitle(sourceTitle);
  if (!title || sameTitle(title, targetTitle)) return false;
  if (!isPlayableArticleTitle(title)) return false;
  return ![
    "최근 변경",
    "최근 토론",
    "특수 기능",
    "나무위키",
    "문의 게시판",
    "보존문서",
    "사용자 문서"
  ].some((chromeTitle) => sameTitle(title, chromeTitle));
}

function withBacklinkStatus(article, hasBacklinks) {
  return {
    ...article,
    hasBacklinks,
    backlinkCount: hasBacklinks ? Math.max(1, article?.backlinkCount || 0) : 0
  };
}

async function getCachedArticle(key, now = Date.now()) {
  const cached = documentCache.get(key);
  if (cached) {
    if (now - cached.fetchedAt >= DOCUMENT_TTL_MS) {
      documentCache.delete(key);
    } else {
      documentCache.delete(key);
      documentCache.set(key, cached);
      return cached.article;
    }
  }

  const diskCached = await readCachedArticleFromDisk(key, now);
  if (!diskCached) return null;

  cacheArticleInMemory(diskCached.article, [key], diskCached.fetchedAt);
  return diskCached.article;
}

async function cacheArticle(article, keys, now = Date.now()) {
  for (const key of new Set(keys.map(normalizeTitle).filter(Boolean))) {
    cacheArticleInMemory(article, [key], now);
    await writeCachedArticleToDisk(key, article, now);
  }

  pruneDocumentCache(now);
  await pruneDocumentCacheDirectory(now);
}

function cacheArticleInMemory(article, keys, fetchedAt = Date.now()) {
  for (const key of new Set(keys.map(normalizeTitle).filter(Boolean))) {
    documentCache.delete(key);
    documentCache.set(key, {
      fetchedAt,
      article
    });
  }
}

function pruneDocumentCache(now = Date.now()) {
  for (const [key, cached] of documentCache) {
    if (now - cached.fetchedAt >= DOCUMENT_TTL_MS) {
      documentCache.delete(key);
    }
  }

  while (documentCache.size > DOCUMENT_CACHE_MAX_ENTRIES) {
    const oldestKey = documentCache.keys().next().value;
    documentCache.delete(oldestKey);
  }
}

async function readCachedArticleFromDisk(key, now = Date.now()) {
  try {
    const payload = await readCachePayload(key);
    const fetchedAt = Number(payload.fetchedAt || 0);

    if (!fetchedAt || now - fetchedAt >= DOCUMENT_TTL_MS) {
      await unlinkCacheFiles(key);
      return null;
    }

    if (payload.version !== DOCUMENT_CACHE_VERSION) {
      await unlinkCacheFiles(key);
      return null;
    }

    if (!payload.article || normalizeTitle(payload.article.title) === "") {
      return null;
    }

    return {
      fetchedAt,
      article: payload.article
    };
  } catch {
    return null;
  }
}

async function writeCachedArticleToDisk(key, article, fetchedAt = Date.now()) {
  try {
    await mkdir(DOCUMENT_CACHE_DIR, { recursive: true });
    const payload = JSON.stringify({
      version: DOCUMENT_CACHE_VERSION,
      encoding: "br",
      key,
      fetchedAt,
      article
    });
    await writeFile(cacheFilePath(key, ".json.br"), await compressCachePayload(payload));
    await unlink(cacheFilePath(key, ".json")).catch(() => {});
  } catch (error) {
    console.warn(
      `Could not write document cache for "${key}" to ${DOCUMENT_CACHE_DIR}: ${error.message}`
    );
  }
}

async function pruneDocumentCacheDirectory(now = Date.now()) {
  try {
    const entries = await readdir(DOCUMENT_CACHE_DIR);
    const cacheEntries = [];

    for (const entry of entries) {
      if (!entry.endsWith(".json") && !entry.endsWith(".json.br")) continue;
      const filePath = join(DOCUMENT_CACHE_DIR, entry);
      const fileStat = await stat(filePath);
      if (now - fileStat.mtimeMs >= DOCUMENT_TTL_MS) {
        await unlink(filePath).catch(() => {});
        continue;
      }
      cacheEntries.push({ filePath, mtimeMs: fileStat.mtimeMs });
    }

    cacheEntries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    while (cacheEntries.length > DOCUMENT_CACHE_MAX_ENTRIES) {
      const oldest = cacheEntries.shift();
      await unlink(oldest.filePath).catch(() => {});
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not prune document cache in ${DOCUMENT_CACHE_DIR}: ${error.message}`);
    }
  }
}

async function readCachePayload(key) {
  try {
    const compressedPayload = await readFile(cacheFilePath(key, ".json.br"));
    return JSON.parse((await decompressCachePayload(compressedPayload)).toString("utf8"));
  } catch {
    const legacyPayload = JSON.parse(await readFile(cacheFilePath(key, ".json"), "utf8"));
    await writeFile(
      cacheFilePath(key, ".json.br"),
      await compressCachePayload(JSON.stringify({
        ...legacyPayload,
        encoding: "br"
      }))
    ).catch(() => {});
    await unlink(cacheFilePath(key, ".json")).catch(() => {});
    return legacyPayload;
  }
}

async function unlinkCacheFiles(key) {
  await Promise.all([
    unlink(cacheFilePath(key, ".json.br")).catch(() => {}),
    unlink(cacheFilePath(key, ".json")).catch(() => {})
  ]);
}

function cacheFilePath(key, extension = ".json.br") {
  const digest = createHash("sha256")
    .update(normalizeTitle(key))
    .digest("hex");
  return join(DOCUMENT_CACHE_DIR, `${digest}${extension}`);
}

function looksLikeClientShell(article) {
  const html = String(article?.html || "");
  return (article?.links || []).length === 0 && /id=["']app-loading["']|Loading\.\.\./i.test(html);
}

function syntheticArticle(title, upstreamStatus) {
  const key = normalizeTitle(title);
  const links = syntheticLinksFor(key);
  return {
    title: key,
    description: `나무위키가 배포 서버 요청을 ${upstreamStatus}으로 거부해 임시 문서를 표시합니다.`,
    imageUrl: "",
    canonicalUrl: makeArticleUrl(key),
    links,
    linkCount: links.length,
    quality: {
      accepted: true,
      score: 55,
      linkCount: links.length,
      reasons: ["synthetic-fallback"]
    },
    html: syntheticArticleHtml(key, links)
  };
}

function syntheticLinksFor(title) {
  const pool = uniqueTitles([
    ...curatedFallbackTitles,
    ...targetFallbackTitles,
    "프로그래밍",
    "자바스크립트",
    "웹 브라우저",
    "인터넷",
    "위키",
    "대한민국",
    "일본"
  ]).filter((candidate) => !sameTitle(candidate, title));

  return pool.map((candidate) => ({
    title: candidate,
    text: candidate,
    href: `/w/${encodeTitle(candidate)}`
  }));
}

function syntheticArticleHtml(title, links) {
  const linkHtml = links
    .map(
      (link) =>
        `<li><a href="#" data-game-title="${escapeHtml(link.title)}" class="game-wiki-link">${escapeHtml(link.text)}</a></li>`
    )
    .join("");

  return `
    <div class="wiki-paragraph">
      <p><strong>${escapeHtml(title)}</strong> 문서를 불러오는 중 나무위키가 배포 서버 요청을 거부했습니다.</p>
      <p>아래 링크는 배포 환경에서도 라운드를 계속 테스트할 수 있도록 제공되는 임시 게임 링크입니다.</p>
    </div>
    <h2>이동 가능한 문서</h2>
    <ul>${linkHtml}</ul>
  `;
}

function uniqueTitles(titles) {
  const seen = new Set();
  const unique = [];
  for (const title of titles) {
    const normalized = normalizeTitle(title);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function publicRound(round) {
  const completedAt = Number(round.completedAt);
  return {
    id: encodeRoundToken(round),
    startTitle: round.startTitle,
    goalTitle: round.goalTitle,
    currentTitle: round.currentTitle,
    path: round.path,
    clickCount: round.clickCount,
    startedAt: round.startedAt,
    ...(Number.isSafeInteger(completedAt) && completedAt > 0 ? { completedAt } : {}),
    dailyChallenge: Boolean(round.dailyChallenge),
    dailyDateKey: round.dailyDateKey || ""
  };
}

function encodeRoundToken(round) {
  const completedAt = Number(round.completedAt);
  const attemptId = normalizeRoundAttemptId(round.attemptId);
  const payload = Buffer.from(JSON.stringify({
    ...(attemptId ? { attemptId } : {}),
    startTitle: round.startTitle,
    goalTitle: round.goalTitle,
    currentTitle: round.currentTitle,
    path: round.path,
    clickCount: round.clickCount,
    startedAt: round.startedAt,
    ...(Number.isSafeInteger(completedAt) && completedAt > 0 ? { completedAt } : {}),
    dailyChallenge: Boolean(round.dailyChallenge),
    dailyDateKey: round.dailyDateKey || ""
  })).toString("base64url");
  return `${payload}.${signRoundPayload(payload)}`;
}

function createRoundAttemptId() {
  return randomUUID();
}

function normalizeRoundAttemptId(value) {
  const attemptId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(attemptId) ? attemptId : "";
}

function decodeRoundToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = signRoundPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const round = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      !round.startTitle ||
      !round.goalTitle ||
      !round.currentTitle ||
      !Array.isArray(round.path)
    ) {
      return null;
    }
    return round;
  } catch {
    return null;
  }
}

function signRoundPayload(payload) {
  return createHmac("sha256", ROUND_SECRET).update(payload).digest("base64url");
}

function compactArticle(article) {
  const preview = articlePreview(article);
  return {
    title: article.title,
    description: article.description,
    previewOverview: preview.overview,
    previewBody: preview.body,
    previewCategoriesHtml: preview.categoriesHtml,
    previewOverviewHtml: preview.overviewHtml,
    previewBodyHtml: preview.bodyHtml,
    previewText: preview.body,
    imageUrl: article.imageUrl,
    canonicalUrl: article.canonicalUrl,
    linkCount: article.links.length,
    quality: scoreArticleQuality(article)
  };
}

function articlePreview(article) {
  const description = normalizeTitle(article?.description);
  const title = normalizeTitle(article?.title);
  const sections = extractArticlePreviewSections(article?.html);
  const categoriesHtml = previewCategoryHtml(article?.html);
  const overviewSection =
    sections.find((section) => section.title === "개요") ||
    sections.find((section) => /개요|소개|설명/.test(section.title)) ||
    sections.find(isPreviewBodySection);
  const bodySection =
    sections.find((section) => section.start > (overviewSection?.start ?? -1) && isPreviewBodySection(section)) ||
    sections.find((section) => section !== overviewSection && isPreviewBodySection(section));
  const overviewHtml = previewSectionHtml(overviewSection, { maxBlocks: 2 });
  const bodyHtml = previewSectionHtml(bodySection, { maxBlocks: 3 });
  const overview = cleanDescriptionPreview(description, title);

  return {
    overview,
    body: "",
    categoriesHtml,
    overviewHtml,
    bodyHtml
  };
}

function previewCategoryHtml(html) {
  const articleHtml = String(html || "");
  const categoryPattern = />\s*분류\s*</g;
  let match;

  while ((match = categoryPattern.exec(articleHtml))) {
    const start = nearestElementStart(articleHtml, match.index);
    if (start < 0) continue;

    const block = extractBalancedElement(articleHtml, start);
    if (/>\s*분류\s*</.test(block) && /<(?:ul|ol)\b[\s\S]*?<li\b/i.test(block)) {
      return categoryListHtml(block);
    }
  }

  return "";
}

function categoryListHtml(html) {
  const items = [];
  const anchorPattern = /<a\b[^>]*data-game-title=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let anchorMatch;

  while ((anchorMatch = anchorPattern.exec(String(html || "")))) {
    const title = normalizeTitle(stripTags(anchorMatch[3])) || normalizeTitle(anchorMatch[2]);
    const gameTitle = normalizeTitle(anchorMatch[2]) || title;
    if (!title || title === "분류") continue;
    items.push({ title, gameTitle });
  }

  if (items.length === 0) {
    const itemPattern = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(String(html || "")))) {
      const title = normalizeTitle(stripTags(itemMatch[1])).replace(/^분류\s*/, "");
      if (title) items.push({ title, gameTitle: title });
    }
  }

  if (items.length === 0) return "";

  const itemHtml = items.slice(0, 8).map((item) =>
    `<li><a href="#" data-game-title="${escapeHtml(item.gameTitle)}" class="game-wiki-link">${escapeHtml(item.title)}</a></li>`
  ).join("");
  return `<ul>${itemHtml}</ul>`;
}

function nearestElementStart(html, index) {
  const prefix = String(html || "").slice(0, index);
  const starts = [...prefix.matchAll(/<(?:div|section|nav|ul|ol)\b[^>]*>/gi)];
  return starts.at(-1)?.index ?? -1;
}

function previewSectionHtml(section, options = {}) {
  if (!section) return "";

  return extractPreviewHtmlBlocks(section.html)
    .slice(0, options.maxBlocks ?? 2)
    .join("");
}

function extractPreviewHtmlBlocks(html) {
  const blocks = [];
  const articleHtml = String(html || "");
  const blockPattern = /<(?:p|ul|ol)\b[^>]*>|<div\b[^>]*class=(["'])[^"']*\bwiki-paragraph\b[^"']*\1[^>]*>/gi;
  let match;

  while ((match = blockPattern.exec(articleHtml))) {
    const block = extractBalancedElement(articleHtml, match.index);
    const text = normalizeTitle(stripTags(block));
    blockPattern.lastIndex = match.index + block.length;
    if (!isUsefulPreviewBlock(text)) continue;
    blocks.push(block);
  }

  return blocks;
}

function extractArticlePreviewSections(html) {
  const articleHtml = String(html || "");
  const headingPattern = /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi;
  const headings = [...articleHtml.matchAll(headingPattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    title: previewHeadingTitle(match[0])
  })).filter((heading) => heading.title);

  if (headings.length === 0) {
    return [{ title: "", html: articleHtml }];
  }

  return headings.map((heading, index) => ({
    start: heading.start,
    title: heading.title,
    html: articleHtml.slice(heading.end, headings[index + 1]?.start ?? articleHtml.length)
  }));
}

function previewHeadingTitle(html) {
  return normalizeTitle(stripTags(html))
    .replace(/\[\s*편집\s*\]/g, "")
    .replace(/^\d+(?:\.\d+)*\.\s*/, "")
    .trim();
}

function isPreviewBodySection(section) {
  return !/^(개요|관련 문서|둘러보기|각주|외부 링크|분류|참고 자료|여담)$/.test(section?.title || "");
}

function isUsefulPreviewBlock(text) {
  const normalized = normalizeTitle(text);
  if (normalized.length < 2) return false;
  if (/^(분류|목차|주의\.|문서가 존재하는|관련 문서|둘러보기)$/.test(normalized)) return false;
  if (/펼치기\s*·\s*접기/.test(normalized)) return false;
  return true;
}

function cleanDescriptionPreview(description, title) {
  const cleaned = normalizeTitle(description)
    .replace(title, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const sentences = cleaned
    .split(/(?<=[.!?。])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences[0] || cleaned;
}

export function scoreArticleQuality(article, options = {}) {
  const minLinks = options.minLinks ?? 6;
  const role = options.role || "start";
  const title = normalizeTitle(article?.title);
  const description = normalizeTitle(article?.description);
  const linkCount = article?.links?.length || 0;
  let score = 100;
  const reasons = [];

  if (!isPlayableArticleTitle(title)) {
    score -= 60;
    reasons.push("namespace");
  }

  if (title.length < 2 || title.length > 35) {
    score -= 15;
    reasons.push("title-length");
  }

  if (/[/:]하위 문서|\/등장인물|\/에피소드|\/역사|\/연재 작품|\/목록|\/에피소드 목록/.test(title)) {
    score -= 18;
    reasons.push("subpage");
  }

  if (role === "goal" && title.includes("/")) {
    score -= 28;
    reasons.push("goal-subpage");
  }

  if (role === "goal" && /일람|목록|등장인물|에피소드/.test(title)) {
    score -= 18;
    reasons.push("goal-index-like");
  }

  if (role === "goal" && isSingleHanCharacterTitle(title)) {
    score -= 80;
    reasons.push("goal-single-han-character");
  }

  const hasCheckedBacklinks = typeof article?.hasBacklinks === "boolean";
  if (role === "goal" && hasCheckedBacklinks && !article.hasBacklinks) {
    score -= 70;
    reasons.push("no-backlinks");
  }

  if (linkCount < minLinks) {
    score -= Math.min(45, (minLinks - linkCount) * 7);
    reasons.push("few-links");
  }

  if (linkCount > 450) {
    score -= 10;
    reasons.push("too-many-links");
  }

  if (description.length < 18) {
    score -= 12;
    reasons.push("short-description");
  }

  const textForSafety = `${title} ${description} ${(article?.links || [])
    .map((link) => link.title)
    .join(" ")}`;
  if (sensitiveTerms.some((term) => textForSafety.includes(term))) {
    score -= 35;
    reasons.push("sensitive-topic");
  }

  return {
    accepted:
      score >= 70 &&
      linkCount >= minLinks &&
      !(role === "goal" && title.includes("/")) &&
      !(role === "goal" && isSingleHanCharacterTitle(title)) &&
      !(role === "goal" && hasCheckedBacklinks && !article.hasBacklinks),
    score: Math.max(0, Math.min(100, score)),
    linkCount,
    reasons
  };
}

export function estimateDifficulty(startArticle, goalArticle) {
  const startLinks = startArticle.links.length;
  const goalLinks = goalArticle.links.length;
  const sharedLinks = countSharedLinks(startArticle, goalArticle);
  const sameToken = titleTokens(startArticle.title).some((token) =>
    titleTokens(goalArticle.title).includes(token)
  );

  let score = 50;
  if (startLinks < 25) score += 15;
  if (startLinks > 100) score -= 10;
  if (goalLinks < 10) score += 12;
  if (sharedLinks > 0) score -= Math.min(28, sharedLinks * 12);
  if (sameToken) score -= 12;

  const boundedScore = Math.max(1, Math.min(99, score));
  const label = boundedScore < 38 ? "쉬움" : boundedScore < 65 ? "보통" : "어려움";

  return {
    label,
    score: boundedScore,
    startLinkCount: startLinks,
    goalLinkCount: goalLinks,
    sharedLinkCount: sharedLinks
  };
}

function countSharedLinks(a, b) {
  const bTitles = new Set(b.links.map((link) => normalizeTitle(link.title)));
  return a.links.filter((link) => bTitles.has(normalizeTitle(link.title))).length;
}

function titleTokens(title) {
  return normalizeTitle(title)
    .split(/[()\s/·,:-]+/)
    .filter((token) => token.length >= 2);
}

function isSingleHanCharacterTitle(title) {
  return /^\p{Script=Han}$/u.test(normalizeTitle(title));
}

function sameTitle(a, b) {
  return normalizeTitle(a) === normalizeTitle(b);
}

function shuffled(values) {
  return [...values].sort(() => Math.random() - 0.5);
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
