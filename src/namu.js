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
  for (const tag of String(html || "").matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseHtmlAttributes(tag[0]);
    if (attrs.property === propertyName || attrs.name === propertyName) {
      return decodeHtmlEntities(attrs.content || "");
    }
  }
  return "";
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
  let rawContent =
    contentStart >= 0
      ? extractBalancedElement(html, contentStart)
      : fallbackArticleContent(html);
  rawContent = prependPreviousCategoryBox(html, contentStart, rawContent);
  rawContent = trimLeadingChromeBeforeCategory(rawContent);
  rawContent = trimTrailingPageChrome(rawContent);

  return sanitizeArticleHtml(rawContent, currentTitle);
}

export function extractInternalLinks(html, currentTitle = "") {
  const current = normalizeTitle(currentTitle);
  const linksByTitle = new Map();
  const anchorPattern =
    /<a\b[^>]*href=(["'])(?:(?:https?:)?\/\/namu\.wiki)?\/w\/([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
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
    .replace(/<!--[\s\S]*?-->/g, "")
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
    .replace(/<a\b([^>]*?)href=(["'])(?:(?:https?:)?\/\/namu\.wiki)?\/w\/([^"']+)\2([^>]*)>/gi, (match, before, quote, path, after) => {
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

  sanitized = sanitized.replace(/<img\b([^>]*?)>/gi, (imgTag) => {
    const dataSrcMatch = imgTag.match(/data-src=(["'])([^"']+)\1/i);
    if (dataSrcMatch) {
      let realSrc = dataSrcMatch[2];
      if (realSrc.startsWith("//")) {
        realSrc = `https:${realSrc}`;
      } else if (realSrc.startsWith("/")) {
        realSrc = `https://namu.wiki${realSrc}`;
      }
      
      let updatedTag = imgTag.replace(/src=(["'])[^"']*\1/i, `src="${realSrc}"`);
      if (!/src=/i.test(updatedTag)) {
        updatedTag = updatedTag.replace("<img", `<img src="${realSrc}"`);
      }
      return removeClassNames(updatedTag, ["DeArQah4", "wiki-image-loading"]);
    }
    return imgTag;
  });

  return sanitized.trim();
}

function extractCanonicalUrl(html) {
  for (const tag of String(html || "").matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseHtmlAttributes(tag[0]);
    if (attrs.rel?.split(/\s+/).includes("canonical")) {
      return decodeHtmlEntities(attrs.href || "");
    }
  }
  return "";
}

function parseHtmlAttributes(tag) {
  const attrs = {};
  const attrPattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrPattern.exec(tag))) {
    const name = match[1].toLowerCase();
    if (name === tag.match(/^<\/?([^\s>]+)/)?.[1]?.toLowerCase()) continue;
    attrs[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function findArticleContentStart(html) {
  const contentMatch = html.match(/<div\b[^>]*class=(["'])[^"']*\bI5dX7KDP\b[^"']*\1[^>]*>/i);
  if (contentMatch?.index !== undefined) return contentMatch.index;

  const espejoContentMatch = html.match(/<div\b[^>]*class=(["'])[^"']*\bwL2ljWQc\b[^"']*\1[^>]*>/i);
  if (espejoContentMatch?.index !== undefined) return espejoContentMatch.index;

  const structuralContentStart = findArticleContentStartByMarkers(html);
  if (structuralContentStart >= 0) return structuralContentStart;

  const paragraphMatch = html.match(/<div\b[^>]*class=(["'])[^"']*\bwiki-paragraph\b[^"']*\1[^>]*>/i);
  return paragraphMatch?.index ?? -1;
}

function findArticleContentStartByMarkers(html) {
  const markerMatch = html.match(
    /<(?:div|h[1-6]|table|span)\b[^>]*(?:wiki-paragraph|wiki-heading|wiki-table|wiki-macro-toc|footnote-list|toc-item)[^>]*>/i
  );
  if (markerMatch?.index === undefined) return -1;

  const ancestors = findOpenDivAncestors(html, markerMatch.index);
  let articleStart = -1;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const start = ancestors[index];
    const candidate = extractBalancedElement(html, start);
    if (looksLikePageShell(candidate)) {
      if (articleStart >= 0) break;
      continue;
    }
    if (looksLikeArticleContent(candidate)) {
      articleStart = start;
    }
  }

  return articleStart;
}

function findOpenDivAncestors(html, endIndex) {
  const ancestors = [];
  const tagPattern = /<\/?div\b[^>]*>/gi;
  let match;

  while ((match = tagPattern.exec(html)) && match.index < endIndex) {
    if (match[0].startsWith("</")) {
      ancestors.pop();
    } else {
      ancestors.push(match.index);
    }
  }

  return ancestors;
}

function looksLikeArticleContent(html) {
  const paragraphCount = countMatches(html, /\bwiki-paragraph\b/gi);
  const headingCount =
    countMatches(html, /\bwiki-heading\b/gi) +
    countMatches(html, /<h[1-6]\b[^>]*\bid=(["'])s-\d+\1/gi);
  const tableCount = countMatches(html, /\bwiki-table\b/gi);
  const hasToc = /\bwiki-macro-toc\b|\btoc-item\b/i.test(html);
  const textLength = normalizeTitle(stripTags(html)).length;

  if (headingCount > 0 && paragraphCount > 0) return true;
  if (hasToc && paragraphCount > 1) return true;
  if (paragraphCount >= 3 && textLength >= 80) return true;
  return tableCount > 0 && paragraphCount > 1 && textLength >= 80;
}

function looksLikePageShell(html) {
  return /<(?:nav|header|footer|script)\b/i.test(html);
}

function countMatches(value, pattern) {
  return [...String(value || "").matchAll(pattern)].length;
}

function trimLeadingChromeBeforeCategory(html) {
  const categoryStart = findLeadingCategoryBoxStart(html);
  return categoryStart >= 0 ? html.slice(categoryStart) : html;
}

function findLeadingCategoryBoxStart(html) {
  const firstContentMarkerIndex = findFirstArticleMarkerIndex(html);
  if (firstContentMarkerIndex < 0) return -1;

  const categoryLabelPattern = />\s*분류\s*</g;
  let match;
  while ((match = categoryLabelPattern.exec(html)) && match.index < firstContentMarkerIndex) {
    const ancestors = findOpenDivAncestors(html, match.index);
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      const start = ancestors[index];
      const candidate = extractBalancedElement(html, start);
      if (looksLikeCategoryBox(candidate)) return start;
    }
  }

  return -1;
}

function findFirstArticleMarkerIndex(html) {
  const markerMatch = html.match(
    /<(?:div|h[1-6]|table|span)\b[^>]*(?:wiki-paragraph|wiki-heading|wiki-table|wiki-macro-toc|footnote-list|toc-item)[^>]*>/i
  );
  return markerMatch?.index ?? -1;
}

function looksLikeCategoryBox(html) {
  return />\s*분류\s*</.test(html) && /<(?:ul|ol)\b[\s\S]*?<li\b/i.test(html);
}

function findPreviousCategoryBoxStart(html, articleStart) {
  if (articleStart < 0) return -1;

  const beforeArticle = html.slice(0, articleStart);
  const categoryLabelPattern = />\s*분류\s*</g;
  let categoryStart = -1;
  let match;

  while ((match = categoryLabelPattern.exec(beforeArticle))) {
    const ancestors = findOpenDivAncestors(html, match.index);
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      const start = ancestors[index];
      const candidate = extractBalancedElement(html, start);
      if (
        looksLikeCategoryBox(candidate) &&
        !looksLikePageShell(html.slice(start, articleStart))
      ) {
        categoryStart = start;
        break;
      }
    }
  }

  return categoryStart;
}

function prependPreviousCategoryBox(html, articleStart, rawContent) {
  const categoryStart = findPreviousCategoryBoxStart(html, articleStart);
  if (categoryStart < 0) return rawContent;

  const categoryHtml = extractBalancedElement(html, categoryStart);
  if (!categoryHtml || rawContent.includes(categoryHtml)) return rawContent;
  return `${categoryHtml}${rawContent}`;
}

function trimTrailingPageChrome(html) {
  const pageChromeStart = findTrailingPageChromeStart(html);
  return pageChromeStart >= 0 ? html.slice(0, pageChromeStart) : html;
}

function findTrailingPageChromeStart(html) {
  const markerPattern =
    /이\s*저작물은[\s\S]{0,500}?CC\s*BY-NC-SA|기여하신\s*문서의\s*저작권|Operado\s+por\s+umanle|Impulsado\s+por\s+the\s+seed|This\s+site\s+is\s+protected\s+by\s+(?:reCAPTCHA|hCaptcha)/i;
  const markerMatch = markerPattern.exec(html);
  if (!markerMatch) return -1;

  const ancestors = findOpenDivAncestors(html, markerMatch.index);
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const start = ancestors[index];
    const candidate = extractBalancedElement(html, start);
    if (looksLikeFooterChrome(candidate)) return start;
  }

  return markerMatch.index;
}

function looksLikeFooterChrome(html) {
  return /이\s*저작물은[\s\S]{0,500}?CC\s*BY-NC-SA|기여하신\s*문서의\s*저작권|namu\.wiki|Operado\s+por\s+umanle|Impulsado\s+por\s+the\s+seed|This\s+site\s+is\s+protected\s+by\s+(?:reCAPTCHA|hCaptcha)/i.test(
    html
  );
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

function removeClassNames(tag, classNames) {
  return String(tag || "").replace(/\sclass=(["'])([^"']*)\1/i, (match, quote, value) => {
    const remaining = value
      .split(/\s+/)
      .filter((className) => className && !classNames.includes(className))
      .join(" ");

    return remaining ? ` class=${quote}${remaining}${quote}` : "";
  });
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
