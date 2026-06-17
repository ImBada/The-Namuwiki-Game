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
const SAFE_ARTICLE_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "rb",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "var",
  "wbr"
]);
const VOID_ARTICLE_TAGS = new Set(["br", "col", "hr", "img", "wbr"]);
const BLOCKED_ARTICLE_TAGS = new Set([
  "applet",
  "audio",
  "base",
  "button",
  "canvas",
  "embed",
  "fieldset",
  "form",
  "frame",
  "frameset",
  "iframe",
  "input",
  "link",
  "math",
  "meta",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "param",
  "plaintext",
  "script",
  "select",
  "source",
  "style",
  "svg",
  "template",
  "textarea",
  "track",
  "video",
  "xmp"
]);
const VOID_BLOCKED_ARTICLE_TAGS = new Set([
  "base",
  "embed",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track"
]);
const GLOBAL_ARTICLE_ATTRS = new Set([
  "class",
  "dir",
  "id",
  "lang",
  "role",
  "style",
  "title"
]);
const URL_ARTICLE_ATTRS = new Set([
  "action",
  "data",
  "formaction",
  "href",
  "poster",
  "src",
  "xlink:href"
]);
const IMAGE_HOSTS = new Set(["namu.wiki", "i.namu.wiki"]);
const GAME_RUNTIME_CLASS_NAMES = new Set([
  "game-wiki-link",
  "wiki-link-disabled",
  "wiki-link-external-disabled"
]);
const SAFE_ARTICLE_STYLE_PROPERTIES = new Set([
  "aspect-ratio",
  "background",
  "background-color",
  "background-image",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-collapse",
  "border-color",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-spacing",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "box-sizing",
  "caption-side",
  "color",
  "display",
  "empty-cells",
  "font",
  "font-family",
  "font-size",
  "font-stretch",
  "font-style",
  "font-variant",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "list-style",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "object-fit",
  "object-position",
  "overflow-wrap",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness",
  "vertical-align",
  "white-space",
  "width",
  "word-break",
  "word-spacing",
  "word-wrap"
]);
const SAFE_ARTICLE_DISPLAY_VALUES = new Set([
  "block",
  "contents",
  "flex",
  "grid",
  "inline",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "inline-table",
  "list-item",
  "table",
  "table-caption",
  "table-cell",
  "table-column",
  "table-column-group",
  "table-footer-group",
  "table-header-group",
  "table-row",
  "table-row-group"
]);

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

export function makeBacklinkUrl(title) {
  return `${NAMU_BASE_URL}/backlink/${encodeTitle(title)}`;
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
    /<a\b[^>]*href\s*=\s*(["'])(?:(?:https?:)?\/\/namu\.wiki)?\/w\/([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
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
    .replace(/\sdata-(?:game-title|disabled-title|disabled-href)=("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\sclass=("[^"]*"|'[^']*'|[^\s>]+)/gi, stripGameRuntimeClassAttribute)
    .replace(/<div\b[^>]*class=(["'])[^"']*(?:WU8NJg0C|SWT3F7nb)[^"']*\1[^>]*>\s*(?:&nbsp;)?\s*<\/div>/gi, "")
    .replace(/<div\b[^>]*>\s*(?:&nbsp;)?\s*<\/div>/gi, "")
    .replace(/<a\b([^>]*?)href\s*=\s*(["'])(?:(?:https?:)?\/\/namu\.wiki)?\/w\/([^"']+)\2([^>]*)>/gi, (match, before, quote, path, after) => {
      const title = decodeTitleFromPath(path);
      const textTitle = escapeAttribute(title);
      const attrs = `${before} ${after}`.replace(/\sclass=("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      if (!isPlayableArticleTitle(title, currentTitle)) {
        return `<span${attrs} class="wiki-link-disabled" data-disabled-title="${textTitle}">`;
      }
      return `<a${attrs} href="#" data-game-title="${textTitle}" class="game-wiki-link">`;
    })
    .replace(/<\/a>/gi, "</a>")
    .replace(
      /(<span\b(?=[^>]*\bclass=(["'])[^"']*\bwiki-link-disabled\b[^"']*\2)[^>]*>)([\s\S]*?)<\/a>/gi,
      "$1$3</span>"
    )
    .replace(/<a\b([^>]*?)href\s*=\s*(["'])(?!#)([^"']+)\2([^>]*)>([\s\S]*?)<\/a>/gi, (match, before, quote, href, after, content) => {
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

  return sanitizeAllowedArticleHtml(sanitized).trim();
}

function stripGameRuntimeClassAttribute(match, rawValue) {
  const quote = rawValue.startsWith('"') || rawValue.startsWith("'") ? rawValue[0] : "";
  const value = decodeHtmlEntities(quote ? rawValue.slice(1, -1) : rawValue);
  const classNames = value
    .split(/\s+/)
    .filter((className) => className && !GAME_RUNTIME_CLASS_NAMES.has(className));

  return classNames.length ? ` class=${quote}${classNames.join(" ")}${quote}` : "";
}

function sanitizeAllowedArticleHtml(html) {
  const input = String(html || "");
  const blockedStack = [];
  let sanitized = "";
  let index = 0;

  while (index < input.length) {
    const tagStart = input.indexOf("<", index);
    if (tagStart < 0) {
      if (blockedStack.length === 0) sanitized += input.slice(index);
      break;
    }

    if (blockedStack.length === 0) {
      sanitized += input.slice(index, tagStart);
    }

    if (input.startsWith("<!--", tagStart)) {
      const commentEnd = input.indexOf("-->", tagStart + 4);
      index = commentEnd < 0 ? input.length : commentEnd + 3;
      continue;
    }

    const tagEnd = findHtmlTagEnd(input, tagStart);
    if (tagEnd < 0) {
      if (blockedStack.length === 0) sanitized += "&lt;";
      index = tagStart + 1;
      continue;
    }

    const tag = input.slice(tagStart, tagEnd + 1);
    const tagName = htmlTagName(tag);
    index = tagEnd + 1;

    if (!tagName) continue;

    const localName = htmlLocalName(tagName);
    const isClosing = /^<\s*\//.test(tag);
    const isBlocked = isBlockedArticleTag(tagName);

    if (blockedStack.length > 0) {
      if (!isClosing && isBlocked && !VOID_BLOCKED_ARTICLE_TAGS.has(localName)) {
        blockedStack.push(localName);
      } else if (isClosing && localName === blockedStack.at(-1)) {
        blockedStack.pop();
      }
      continue;
    }

    if (isBlocked) {
      if (!isClosing && !VOID_BLOCKED_ARTICLE_TAGS.has(localName)) {
        blockedStack.push(localName);
      }
      continue;
    }

    if (!SAFE_ARTICLE_TAGS.has(tagName)) continue;

    if (isClosing) {
      if (!VOID_ARTICLE_TAGS.has(tagName)) sanitized += `</${tagName}>`;
      continue;
    }

    sanitized += sanitizeArticleStartTag(tagName, tag);
  }

  return sanitized;
}

function findHtmlTagEnd(html, startIndex) {
  let quote = "";
  for (let index = startIndex + 1; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index;
    }
  }
  return -1;
}

function htmlTagName(tag) {
  return tag.match(/^<\s*\/?\s*([a-z][\w:-]*)/i)?.[1]?.toLowerCase() || "";
}

function htmlLocalName(tagName) {
  return String(tagName || "").split(":").pop();
}

function isBlockedArticleTag(tagName) {
  const localName = htmlLocalName(tagName);
  return BLOCKED_ARTICLE_TAGS.has(tagName) || BLOCKED_ARTICLE_TAGS.has(localName);
}

function sanitizeArticleStartTag(tagName, tag) {
  const attrs = [];
  const seenAttrs = new Set();

  for (const attr of parseHtmlAttributeEntries(tag)) {
    if (seenAttrs.has(attr.name)) continue;
    const sanitized = sanitizeArticleAttribute(tagName, attr.name, attr.value);
    if (!sanitized) continue;

    seenAttrs.add(sanitized.name);
    attrs.push(`${sanitized.name}="${escapeAttribute(sanitized.value)}"`);
  }

  if (tagName === "img" && !seenAttrs.has("src")) return "";

  return `<${tagName}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
}

function parseHtmlAttributeEntries(tag) {
  const tagPrefix = tag.match(/^<\s*\/?\s*[^\s/>]+/);
  if (!tagPrefix) return [];

  const attrs = [];
  const source = tag
    .slice(tagPrefix[0].length, tag.endsWith("/>") ? -2 : -1)
    .trim();
  const attrPattern =
    /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = attrPattern.exec(source))) {
    attrs.push({
      name: match[1].toLowerCase(),
      value: decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "")
    });
  }

  return attrs;
}

function sanitizeArticleAttribute(tagName, name, value) {
  if (!isAllowedArticleAttribute(tagName, name)) return null;
  if (name.startsWith("on")) return null;
  if (name.includes(":")) return null;
  if (name === "contenteditable" || name === "tabindex") return null;
  if (URL_ARTICLE_ATTRS.has(name) && !isAllowedUrlArticleAttribute(tagName, name)) {
    return null;
  }

  if (name === "class") return sanitizeTokenListAttribute(name, value);
  if (name === "id") return sanitizeIdentifierAttribute(name, value);
  if (name === "style") return sanitizeStyleArticleAttribute(value);
  if (name === "dir") return sanitizeEnumAttribute(name, value, ["auto", "ltr", "rtl"]);
  if (name === "role") return sanitizeTokenAttribute(name, value);
  if (name === "href") return sanitizeHrefArticleAttribute(value);
  if (name === "src") return sanitizeImageSourceArticleAttribute(value);
  if (name === "data-disabled-href") return sanitizeDisabledHrefArticleAttribute(value);
  if (name === "width" || name === "height") return sanitizeDimensionAttribute(name, value);
  if (name === "colspan" || name === "rowspan") return sanitizeIntegerAttribute(name, value, 1, 99);
  if (name === "start" || name === "value") return sanitizeIntegerAttribute(name, value, -9999, 9999);
  if (name === "type") return sanitizeEnumAttribute(name, value, ["1", "a", "A", "i", "I"]);
  if (name === "loading") return sanitizeEnumAttribute(name, value, ["eager", "lazy"]);
  if (name === "decoding") return sanitizeEnumAttribute(name, value, ["async", "auto", "sync"]);
  if (name === "open") return { name, value: "" };

  return sanitizePlainArticleAttribute(name, value);
}

function isAllowedArticleAttribute(tagName, name) {
  if (GLOBAL_ARTICLE_ATTRS.has(name)) return true;
  if (/^aria-[a-z0-9_-]+$/.test(name)) return true;

  if (tagName === "a") {
    return name === "href" || name === "data-game-title";
  }
  if (tagName === "span") {
    return (
      name === "data-disabled-href" ||
      name === "data-disabled-title" ||
      name === "data-game-title"
    );
  }
  if (tagName === "img") {
    return ["alt", "decoding", "height", "loading", "src", "width"].includes(name);
  }
  if (tagName === "details") return name === "open";
  if (tagName === "td" || tagName === "th") {
    return ["colspan", "headers", "rowspan", "scope"].includes(name);
  }
  if (tagName === "ol") return name === "start" || name === "type";
  if (tagName === "li") return name === "value";

  return false;
}

function isAllowedUrlArticleAttribute(tagName, name) {
  return (tagName === "a" && name === "href") || (tagName === "img" && name === "src");
}

function sanitizeTokenListAttribute(name, value) {
  const tokens = String(value || "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => /^[^\s"'`<>/=\\]+$/.test(token));

  return tokens.length ? { name, value: tokens.join(" ") } : null;
}

function sanitizeTokenAttribute(name, value) {
  const token = String(value || "").trim();
  return /^[a-z0-9_-]+$/i.test(token) ? { name, value: token } : null;
}

function sanitizeIdentifierAttribute(name, value) {
  const id = String(value || "").trim();
  return id && /^[^\s"'`<>]+$/.test(id) ? { name, value: id } : null;
}

function sanitizePlainArticleAttribute(name, value) {
  const sanitized = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return sanitized && !/[<>`]/.test(sanitized) ? { name, value: sanitized } : null;
}

function sanitizeStyleArticleAttribute(value) {
  const declarations = String(value || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter(isSafeStyleDeclaration);

  return declarations.length ? { name: "style", value: declarations.join("; ") } : null;
}

function isSafeStyleDeclaration(declaration) {
  const separatorIndex = declaration.indexOf(":");
  if (separatorIndex <= 0) return false;

  const property = declaration.slice(0, separatorIndex).trim();
  const value = declaration.slice(separatorIndex + 1).trim();
  const normalizedProperty = property.toLowerCase();
  const decodedValue = decodeCssEscapes(value).toLowerCase();
  const decoded = decodeCssEscapes(`${property}:${value}`).toLowerCase();
  const compactDecoded = decoded.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  const dangerousPattern =
    /(?:url\s*\(|expression\s*\(|@import\b|-moz-binding\b|behavior\s*:|javascript\s*:|data\s*:|vbscript\s*:)/i;
  const compactDangerousPattern =
    /(?:url\(|expression\(|@import|-moz-binding|behavior:|javascript:|data:|vbscript:)/i;

  if (!/^(?:-?[a-z_][a-z0-9_-]*|--[a-z0-9_-]+)$/i.test(property)) return false;
  if (!SAFE_ARTICLE_STYLE_PROPERTIES.has(normalizedProperty)) return false;
  if (!value || /[<>`]/.test(value)) return false;
  if (hasViewportCssUnit(decodedValue)) return false;
  if (normalizedProperty === "margin" || normalizedProperty.startsWith("margin-")) {
    if (hasNegativeCssLength(decodedValue)) return false;
    if (/\bcalc\s*\(/i.test(decodedValue)) return false;
  }
  if (dangerousPattern.test(decoded) || compactDangerousPattern.test(compactDecoded)) {
    return false;
  }
  if (normalizedProperty === "display") {
    return isSafeDisplayCssValue(decodedValue);
  }
  if (normalizedProperty === "background") {
    return isSafeBackgroundCssValue(decodedValue);
  }
  if (normalizedProperty === "background-image") {
    return isSafeBackgroundImageCssValue(decodedValue);
  }
  return true;
}

function isSafeDisplayCssValue(value) {
  return SAFE_ARTICLE_DISPLAY_VALUES.has(normalizeCssValue(value));
}

function isSafeBackgroundCssValue(value) {
  const normalized = normalizeCssValue(value);
  return (
    isSafeCssColorValue(normalized) ||
    isSafeCssGradientValue(normalized) ||
    ["none", "transparent", "currentcolor", "inherit", "initial", "unset"].includes(normalized)
  );
}

function isSafeBackgroundImageCssValue(value) {
  const normalized = normalizeCssValue(value);
  if (normalized === "none") return true;
  return isSafeCssGradientValue(normalized);
}

function isSafeCssGradientValue(value) {
  return /^(?:repeating-)?(?:linear|radial)-gradient\([\s\S]+\)$/.test(value);
}

function isSafeCssColorValue(value) {
  const normalized = normalizeCssValue(value);
  return (
    /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized) ||
    /^(?:rgb|rgba|hsl|hsla)\([0-9.%\s,/-]+\)$/i.test(normalized) ||
    /^(?:black|white|red|green|blue|gray|grey|silver|maroon|purple|fuchsia|lime|olive|yellow|navy|teal|aqua|orange)$/.test(
      normalized
    )
  );
}

function normalizeCssValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function hasViewportCssUnit(value) {
  return /(?:^|[^a-z0-9_-])-?(?:\d+|\d*\.\d+)v(?:w|h|i|b|min|max)\b/i.test(String(value || ""));
}

function hasNegativeCssLength(value) {
  return /(?:^|[\s(,])-+\s*(?:\d+|\d*\.\d+)(?:[a-z%]+)?\b/i.test(String(value || ""));
}

function decodeCssEscapes(value) {
  return String(value || "").replace(/\\([0-9a-f]{1,6}\s?|.)/gi, (match, escape) => {
    if (!/^[0-9a-f]/i.test(escape)) return escape;
    return String.fromCodePoint(Number.parseInt(escape.trim(), 16));
  });
}

function sanitizeEnumAttribute(name, value, allowedValues) {
  const sanitized = String(value || "").trim();
  return allowedValues.includes(sanitized) ? { name, value: sanitized } : null;
}

function sanitizeIntegerAttribute(name, value, min, max) {
  const number = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return { name, value: String(number) };
}

function sanitizeDimensionAttribute(name, value) {
  const sanitized = String(value || "").trim();
  return /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?%?$/.test(sanitized)
    ? { name, value: sanitized }
    : null;
}

function sanitizeHrefArticleAttribute(value) {
  const href = normalizeUrlLikeAttribute(value);
  return href.startsWith("#") && isSafeFragmentHref(href) ? { name: "href", value: href } : null;
}

function sanitizeImageSourceArticleAttribute(value) {
  const src = normalizeImageArticleUrl(value);
  return src ? { name: "src", value: src } : null;
}

function sanitizeDisabledHrefArticleAttribute(value) {
  const href = normalizeUrlLikeAttribute(value);
  if (!href) return null;
  if (href.startsWith("#")) {
    return isSafeFragmentHref(href) ? { name: "data-disabled-href", value: href } : null;
  }
  if (href.startsWith("/") && !href.startsWith("//") && !/[<>"'`\s]/.test(href)) {
    return { name: "data-disabled-href", value: href };
  }

  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:"
      ? { name: "data-disabled-href", value: url.href }
      : null;
  } catch {
    return null;
  }
}

function normalizeUrlLikeAttribute(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f\s]+/g, "")
    .trim();
}

function isSafeFragmentHref(value) {
  return /^#[A-Za-z0-9_.:%-]*$/.test(value);
}

function normalizeImageArticleUrl(value) {
  const rawUrl = normalizeUrlLikeAttribute(value);
  if (!rawUrl || rawUrl.startsWith("#")) return "";

  let normalizedUrl = rawUrl;
  if (normalizedUrl.startsWith("//")) {
    normalizedUrl = `https:${normalizedUrl}`;
  } else if (normalizedUrl.startsWith("/")) {
    normalizedUrl = `https://namu.wiki${normalizedUrl}`;
  }

  try {
    const url = new URL(normalizedUrl);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (!IMAGE_HOSTS.has(url.hostname)) return "";
    url.protocol = "https:";
    return url.href;
  } catch {
    return "";
  }
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
  if (paragraphCount > 0 && /<a\b[^>]*href\s*=\s*(["'])(?:(?:https?:)?\/\/namu\.wiki)?\/w\//i.test(html)) {
    return true;
  }
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

export function extractBalancedElement(html, startIndex) {
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

export function stripTags(value) {
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
