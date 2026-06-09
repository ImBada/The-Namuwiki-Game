import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  encodeTitle,
  extractArticle,
  makeArticleUrl,
  isPlayableArticleTitle,
  normalizeTitle
} from "./src/namu.js";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const DOCUMENT_TTL_MS = 1000 * 60 * 60 * 6;
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
const ROUND_SECRET =
  process.env.ROUND_SECRET || "the-namuwiki-game-local-round-secret";
const ALLOW_SYNTHETIC_FALLBACK =
  process.env.ALLOW_SYNTHETIC_FALLBACK === "1" || process.env.VERCEL === "1";

const documentCache = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const curatedFallbackTitles = [
  "대한민국",
  "서울특별시",
  "인터넷",
  "게임",
  "컴퓨터",
  "한글",
  "위키",
  "과학",
  "역사",
  "음악",
  "영화",
  "축구",
  "스타크래프트",
  "부산광역시",
  "일본",
  "미국",
  "유럽",
  "철도",
  "자동차",
  "스마트폰",
  "프로그래밍"
];

const targetFallbackTitles = [
  "대한민국",
  "서울특별시",
  "인터넷",
  "게임",
  "컴퓨터",
  "한글",
  "영화",
  "음악",
  "축구",
  "부산광역시",
  "일본",
  "미국",
  "철도",
  "자동차"
];

const randomPickAttempts = 6;
const sensitiveTerms = [
  "강간",
  "성폭행",
  "성추행",
  "능욕",
  "자살",
  "살인",
  "고문",
  "학살",
  "아동학대"
];

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/api/health") {
      return sendJson(response, { ok: true });
    }

    if (url.pathname === "/api/probe" && request.method === "GET") {
      return sendJson(response, await probeUpstream(url.searchParams.get("title")));
    }

    if (url.pathname === "/api/round" && request.method === "GET") {
      return sendJson(response, await createRound({
        startTitle: url.searchParams.get("start"),
        goalTitle: url.searchParams.get("goal")
      }));
    }

    if (url.pathname === "/api/click" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, await handleClick(body));
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, { error: error.message || "Server error" }, status);
  }
}

export const app = createServer(handleRequest);
export default app;

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  app.listen(PORT, HOST, () => {
    console.log(`The Namuwiki Game is running at http://${HOST}:${PORT}`);
  });
}

async function createRound(options = {}) {
  const requestedStartTitle = normalizeTitle(options.startTitle);
  const requestedGoalTitle = normalizeTitle(options.goalTitle);
  const startArticle = requestedStartTitle
    ? await getArticle(requestedStartTitle)
    : await pickArticleCandidate({
        role: "start",
        exceptTitles: [],
        minLinks: 12
      });
  let goalArticle = requestedGoalTitle
    ? await getArticle(requestedGoalTitle)
    : await pickArticleCandidate({
        role: "goal",
        exceptTitles: [startArticle.title],
        minLinks: 4
      });

  if (normalizeTitle(goalArticle.title) === normalizeTitle(startArticle.title)) {
    goalArticle = await getArticle(pickCuratedTitle(startArticle.title, targetFallbackTitles));
  }

  const difficulty = estimateDifficulty(startArticle, goalArticle);

  const round = {
    startTitle: startArticle.title,
    goalTitle: goalArticle.title,
    currentTitle: startArticle.title,
    path: [startArticle.title],
    startedAt: Date.now(),
    clickCount: 0,
    difficulty
  };

  return {
    round: publicRound(round),
    article: startArticle,
    goal: compactArticle(goalArticle)
  };
}

async function handleClick(body) {
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

  return {
    round: publicRound(round),
    article: nextArticle,
    completed
  };
}

async function pickRandomTitle() {
  try {
    const response = await fetch(`${process.env.NAMU_PROXY_BASE}/article?title=${encodeURIComponent(key)}`);
    const article = extractArticle(await response.text(), "");
    if (article.title && article.links.length > 0) return article.title;
  } catch {
    // Fall through to curated fallback.
  }

  return pickCuratedTitle();
}

async function pickArticleCandidate({ role, exceptTitles, minLinks }) {
  const acceptedFallbacks = role === "goal" ? targetFallbackTitles : curatedFallbackTitles;
  const candidates = [];

  for (let attempt = 0; attempt < randomPickAttempts; attempt += 1) {
    try {
      const title = await pickRandomTitle();
      if (exceptTitles.some((exceptTitle) => sameTitle(title, exceptTitle))) continue;

      const article = await getArticle(title);
      const quality = scoreArticleQuality(article, { minLinks, role });
      if (quality.accepted) return article;
      candidates.push({ article, quality });
    } catch {
      // Try another candidate, then fall back to curated titles.
    }
  }

  const bestCandidate = candidates
    .filter(({ article }) => !exceptTitles.some((exceptTitle) => sameTitle(article.title, exceptTitle)))
    .sort((a, b) => b.quality.score - a.quality.score)[0];

  if (bestCandidate?.quality.accepted) return bestCandidate.article;

  for (const fallbackTitle of shuffled(acceptedFallbacks)) {
    if (exceptTitles.some((exceptTitle) => sameTitle(fallbackTitle, exceptTitle))) continue;
    const article = await getArticle(fallbackTitle);
    const quality = scoreArticleQuality(article, {
      minLinks: Math.min(minLinks, 6),
      role
    });
    if (quality.score >= 50) return article;
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
  const cached = documentCache.get(key);

  if (cached && Date.now() - cached.fetchedAt < DOCUMENT_TTL_MS) {
    return cached.article;
  }

  const response = await fetch(makeArticleUrl(key), {
    headers: NAMU_HEADERS
  });

  if (!response.ok) {
    if (ALLOW_SYNTHETIC_FALLBACK && response.status === 403) {
      const article = syntheticArticle(key, response.status);
      documentCache.set(key, {
        fetchedAt: Date.now(),
        article
      });
      return article;
    }
    throw httpError(response.status, `Could not fetch article: ${key}`);
  }

  const article = extractArticle(await response.text(), key);
  documentCache.set(normalizeTitle(article.title), {
    fetchedAt: Date.now(),
    article
  });
  documentCache.set(key, {
    fetchedAt: Date.now(),
    article
  });

  return article;
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

async function probeUpstream(title = "일본") {
  const key = normalizeTitle(title) || "일본";
  const articleUrl = makeArticleUrl(key);
  const encodedArticleUrl = encodeURIComponent(articleUrl);
  const targets = [
    {
      name: "namu-direct-default",
      url: articleUrl
    },
    {
      name: "namu-direct-browser-headers",
      url: articleUrl,
      headers: NAMU_HEADERS
    },
    {
      name: "namu-random-browser-headers",
      url: "https://namu.wiki/random",
      headers: NAMU_HEADERS
    },
    {
      name: "jina-reader-https",
      url: `https://r.jina.ai/http://${articleUrl}`
    },
    {
      name: "jina-reader-no-protocol-prefix",
      url: `https://r.jina.ai/http://https://namu.wiki/w/${encodeTitle(key)}`
    },
    {
      name: "allorigins-raw",
      url: `https://api.allorigins.win/raw?url=${encodedArticleUrl}`
    }
  ];

  return {
    title: key,
    runtime: {
      vercel: process.env.VERCEL || "",
      region: process.env.VERCEL_REGION || "",
      node: process.version
    },
    generatedAt: new Date().toISOString(),
    results: await Promise.all(targets.map(probeTarget))
  };
}

async function probeTarget(target) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(target.url, {
      headers: target.headers,
      redirect: "follow",
      signal: controller.signal
    });
    const text = await response.text();
    return {
      name: target.name,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      elapsedMs: Date.now() - startedAt,
      contentType: response.headers.get("content-type") || "",
      cfRay: response.headers.get("cf-ray") || "",
      xNamuSource: response.headers.get("x-namu-source") || "",
      bodySample: text.slice(0, 220)
    };
  } catch (error) {
    return {
      name: target.name,
      ok: false,
      error: error.name || "Error",
      message: error.message,
      elapsedMs: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timeout);
  }
}

function publicRound(round) {
  return {
    id: encodeRoundToken(round),
    startTitle: round.startTitle,
    goalTitle: round.goalTitle,
    currentTitle: round.currentTitle,
    path: round.path,
    clickCount: round.clickCount,
    startedAt: round.startedAt,
    difficulty: round.difficulty
  };
}

function encodeRoundToken(round) {
  const payload = Buffer.from(JSON.stringify({
    startTitle: round.startTitle,
    goalTitle: round.goalTitle,
    currentTitle: round.currentTitle,
    path: round.path,
    clickCount: round.clickCount,
    startedAt: round.startedAt,
    difficulty: round.difficulty
  })).toString("base64url");
  return `${payload}.${signRoundPayload(payload)}`;
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
  return {
    title: article.title,
    description: article.description,
    imageUrl: article.imageUrl,
    canonicalUrl: article.canonicalUrl,
    linkCount: article.links.length,
    quality: scoreArticleQuality(article)
  };
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
      !(role === "goal" && title.includes("/")),
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

function sameTitle(a, b) {
  return normalizeTitle(a) === normalizeTitle(b);
}

function shuffled(values) {
  return [...values].sort(() => Math.random() - 0.5);
}

async function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    throw httpError(403, "Forbidden");
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  } catch {
    const fallback = await readFile(join(PUBLIC_DIR, "index.html"));
    response.writeHead(200, { "Content-Type": mimeTypes[".html"] });
    response.end(fallback);
  }
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, payload, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
