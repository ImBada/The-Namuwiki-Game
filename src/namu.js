const NAMU_BASE_URL = "https://namu.wiki";
const BLOCKED_NAMESPACES = [
  "파일",
  "분류",
  "틀",
  "사용자",
  "나무위키",
  "토론",
  "투표",
  "템플릿",
  "시스템",
  "특수기능",
  "특정판",
  "삭제된사용자",
  "아이피사용자"
];

export function normalizeTitle(title) {
  return decodeHtmlEntities(String(title || ""))
    .replace(/\s+/g, " ")
    .replace(/_/g, " ")
    .trim()
    .normalize("NFC");
}

export function encodeTitle(title) {
  return encodeURIComponent(normalizeTitle(title));
}

export function decodeTitleFromPath(pathPart) {
  const withoutHash = String(pathPart || "").split(/[?#]/)[0];
  try {
    return normalizeTitle(decodeURIComponent(withoutHash));
  } catch {
    return normalizeTitle(withoutHash);
  }
}

export function makeArticleUrl(title) {
  return `${NAMU_BASE_URL}/w/${encodeTitle(title)}`;
}

export function extractMetaContent(html, propertyName) {
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i"
  );
  return decodeHtmlEntities(html.match(pattern)?.[1] || "");
}

export function extractArticle(html, requestedTitle = "") {
  const title =
    normalizeTitle(extractMetaContent(html, "og:title")) ||
    normalizeTitle(requestedTitle);
  const description = normalizeTitle(extractMetaContent(html, "og:description"));
  const imageUrl = normalizeImageUrl(extractMetaContent(html, "og:image"));
  const canonicalUrl = extractCanonicalUrl(html) || makeArticleUrl(title);
  const links = extractInternalLinks(html, title);
  const articleHtml = extractPlayableArticleHtml(html, title);

  return {
    title,
    description,
    imageUrl,
    canonicalUrl,
    links,
    html: articleHtml
  };
}

export function extractPlayableArticleHtml(html, currentTitle = "") {
  const contentStart = findArticleContentStart(html);
  const rawContent =
    contentStart >= 0
      ? extractBalancedElement(html, contentStart)
      : fallbackArticleContent(html);

  return sanitizeArticleHtml(rawContent, currentTitle);
}

export function extractInternalLinks(html, currentTitle = "") {
  const current = normalizeTitle(currentTitle);
  const linksByTitle = new Map();
  const anchorPattern =
    /<a\b[^>]*href=(["'])\/w\/([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorPattern.exec(html))) {
    const title = decodeTitleFromPath(match[2]);
    if (!isPlayableArticleTitle(title, current)) continue;

    const text = normalizeTitle(stripTags(match[3])) || title;
    if (!linksByTitle.has(title)) {
      linksByTitle.set(title, {
        title,
        text,
        href: `/w/${encodeTitle(title)}`
      });
    }
  }

  return [...linksByTitle.values()].sort((a, b) =>
    a.title.localeCompare(b.title, "ko")
  );
}

export function isPlayableArticleTitle(title, currentTitle = "") {
  const normalized = normalizeTitle(title);
  if (!normalized) return false;
  if (normalized === normalizeTitle(currentTitle)) return false;
  if (normalized.startsWith("#")) return false;
  if (normalized.includes("\n")) return false;

  const namespace = normalized.split(":")[0];
  return !BLOCKED_NAMESPACES.includes(namespace);
}

export function sanitizeArticleHtml(html, currentTitle = "") {
  let sanitized = String(html || "")
    .replace(//g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<button[\s\S]*?<\/button>/gi, "")
    .replace(/<input\b[^>]*>/gi, "")
    .replace(/\s(on[a-z]+)=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:contenteditable|tabindex)=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<div\b[^>]*class=(["'])[^"']*(?:WU8NJg0C|SWT3F7nb)[^"']*\1[^>]*>\s*(?:&nbsp;)?\s*<\/div>/gi, "")
    .replace(/<div\b[^>]*>\s*(?:&nbsp;)?\s*<\/div>/gi, "")
    .replace(/<a\b([^>]*?)href=(["'])\/w\/([^"']+)\2([^>]*)>/gi, (match, before, quote, path, after) => {
      const title = decodeTitleFromPath(path);
      const textTitle = escapeAttribute(title);
      const attrs = `${before} ${after}`.replace(/\sclass=(["'])[\s\S]*?\1/gi, "");
      if (!isPlayableArticleTitle(title, currentTitle)) {
        return `<span class="wiki-link-disabled" data-disabled-title="${textTitle}">`;
      }
      return `<a${attrs} href="#" data-game-title="${textTitle}" class="game-wiki-link">`;
    })
    .replace(/<\/a>/gi, "</a>")
    .replace(/<span class="wiki-link-disabled"([^>]*)>([\s\S]*?)<\/a>/gi, "<span class=\"wiki-link-disabled\"$1>$2</span>")
    .replace(/<a\b([^>]*?)href=(["'])(?!#)([^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi, (match, before, quote, href, after, content) => {
      return `<span class="wiki-link-disabled wiki-link-external-disabled" data-disabled-href="${escapeAttribute(href)}">${content}</span>`;
    })
    .replace(/\s(src|href)=["']\/\/([^"']+)["']/gi, ' $1="https://$2"')
    .replace(/\ssrc=["']\/([^"']+)["']/gi, ' src="https://namu.wiki/$1"')
    .replace(/\shref=["']\/([^"']+)["']/gi, ' href="https://namu.wiki/$1"')
    .replace(/\[편집\]/g, "");

  // [수정 핵심 레이어] 나무위키의 Lazy Loading 이미지 태그 처리 로직 추가
  // <img ...> 내부에 data-src가 존재하면 기존 투명 대용 src를 data-src 주소로 치환합니다.
  sanitized = sanitized.replace(/<img\b([^>]*?)>/gi, (imgTag) => {
    const dataSrcMatch = imgTag.match(/data-src=(["'])([^"']+)\1/i);
    if (dataSrcMatch) {
      let realSrc = dataSrcMatch[2];
      // 프로토콜 생략형 경로일 경우 규격 강제 보정
      if (realSrc.startsWith("//")) {
        realSrc = `https:${realSrc}`;
      } else if (realSrc.startsWith("/")) {
        realSrc = `https://namu.wiki${realSrc}`;
      }
      
      // 기존 빈 src 주소를 실제 주소(realSrc)로 완전히 강제 덮어쓰기합니다.
      let updatedTag = imgTag.replace(/src=(["'])[^"']*\1/i, `src="${realSrc}"`);
      
      // 혹시 src 속성 자체가 누락된 특이 케이스가 있다면 강제로 주입합니다.
      if (!/src=/i.test(updatedTag)) {
        updatedTag = updatedTag.replace("<img", `<img src="${realSrc}"`);
      }
      return updatedTag;
    }
    return imgTag;
  });

  return sanitized.trim();
}

function extractCanonicalUrl(html) {
  const match = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  return match ? decodeHtmlEntities(match[1]) : "";
}

function findArticleContentStart(html) {
  const contentMatch = html.match(/<div\b[^>]*class=(["'])[^"']*\bI5dX7KDP\b[^"']*\1[^>]*>/i);
  if (contentMatch?.index !== undefined) return contentMatch.index;

  const paragraphMatch = html.match(/<div\b[^>]*class=(["'])[^"']*\bwiki-paragraph\b[^"']*\1[^>]*>/i);
  return paragraphMatch?.index ?? -1;
}

function extractBalancedElement(html, startIndex) {
  const openTag = html.slice(startIndex).match(/^<([a-z0-9-]+)\b[^>]*>/i);
  if (!openTag) return "";

  const tagName = openTag[1].toLowerCase();
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = startIndex;

  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    const isClosing = match[0].startsWith("</");
    depth += isClosing ? -1 : 1;
    if (depth === 0) {
      return html.slice(startIndex, tagPattern.lastIndex);
    }
  }

  return html.slice(startIndex);
}

function fallbackArticleContent(html) {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  return body
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeImageUrl(url) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://namu.wiki${url}`;
  return url;
}

function stripTags(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
  );
}

export function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    );
}