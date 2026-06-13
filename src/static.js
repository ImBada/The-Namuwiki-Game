import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { httpError } from "./http.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

export async function serveStatic(requestPath, response) {
  const requestUrl = requestPath instanceof URL ? requestPath : new URL(String(requestPath), "http://localhost");
  const pathname = requestPath instanceof URL ? requestUrl.pathname : String(requestPath).split(/[?#]/, 1)[0];
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(PUBLIC_DIR, safePath));

  const relativePath = relative(PUBLIC_DIR, filePath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw httpError(403, "Forbidden");
  }

  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(filePath.endsWith(`${sep}index.html`) ? renderIndexHtml(data, requestUrl) : data);
  } catch {
    const fallback = await readFile(join(PUBLIC_DIR, "index.html"));
    response.writeHead(200, { "Content-Type": mimeTypes[".html"] });
    response.end(renderIndexHtml(fallback, requestUrl));
  }
}

function renderIndexHtml(data, requestUrl) {
  const html = data.toString("utf8");
  return html.replace("<!-- share-meta -->", buildShareMeta(requestUrl));
}

function buildShareMeta(requestUrl) {
  const startTitle = cleanTitle(requestUrl.searchParams.get("start"));
  const goalTitle = cleanTitle(requestUrl.searchParams.get("goal"));
  const routeTitle = startTitle && goalTitle ? `${startTitle} → ${goalTitle}` : "";
  const title = routeTitle ? `${routeTitle} | 나무위키 게임` : "나무위키 게임";
  const description = routeTitle
    ? `${startTitle}에서 ${goalTitle}까지, 링크만 타고 도착하는 경로 찾기 게임입니다.`
    : "시작 문서와 목표 문서를 받은 뒤, 실제 나무위키 문서 본문 링크만 눌러 길을 찾습니다.";
  const shareUrl = `${requestUrl.origin}${requestUrl.pathname}${requestUrl.search}`;
  const imageUrl = `${requestUrl.origin}/share-card.png`;

  return [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="나무위키 게임" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(shareUrl)}" />`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`
  ].join("\n    ");
}

function cleanTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}
