export function normalizeWikiArticleDom(root) {
  normalizeCategoryBoxes(root);
  normalizeThemeImageVariants(root);
  foldLeadingUtilityContent(root);
  foldDefaultCollapsedBrowseSection(root);
  normalizeHorizontalFoldingNavboxes(root);
  normalizeSquareImageGrids(root);
  normalizeCompactLinkGrids(root);
  setupAnimatedFolding(root);
}

function normalizeThemeImageVariants(root) {
  const images = [...root.querySelectorAll("img[alt]")];
  for (const image of images) {
    const baseAlt = themeVariantBaseAlt(image.getAttribute("alt"));
    if (!baseAlt) continue;

    const variantRoot = findThemeVariantRoot(image, root);
    if (!variantRoot) continue;

    const siblings = [...variantRoot.parentElement?.children || []].filter(
      (child) => child !== variantRoot
    );
    const hasBaseVariant = siblings.some((sibling) =>
      [...sibling.querySelectorAll("img[alt]")].some(
        (siblingImage) => normalizedAlt(siblingImage.getAttribute("alt")) === baseAlt
      )
    );
    if (hasBaseVariant) {
      variantRoot.classList.add("wiki-theme-image-hidden");
    }
  }
}

function findThemeVariantRoot(image, root) {
  let node = image.parentElement;
  let variantRoot = null;
  while (node && node !== root && node.parentElement) {
    const hasImageSibling = [...node.parentElement.children].some(
      (sibling) => sibling !== node && sibling.querySelector?.("img[alt]")
    );
    if (hasImageSibling) variantRoot = node;
    node = node.parentElement;
  }
  return variantRoot;
}

function themeVariantBaseAlt(value) {
  const alt = normalizedAlt(value);
  const baseAlt = alt
    .replace(/\s*(?:[\[(])?\s*(?:화이트|white)\s*(?:[\])])?\s*$/i, "")
    .trim();
  return baseAlt && baseAlt !== alt ? baseAlt : "";
}

function normalizedAlt(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeCategoryBoxes(root) {
  const candidates = [...root.querySelectorAll("div,section")];
  for (const candidate of candidates) {
    if (candidate.closest(".wiki-category-box")) continue;

    const label = [...candidate.children].find(
      (child) =>
        child instanceof HTMLElement &&
        child.textContent.replace(/\s+/g, " ").trim() === "분류"
    );
    const list = [...candidate.children].find(
      (child) => child instanceof HTMLElement && child.matches("ul,ol")
    );
    if (!label || !list || !list.querySelector("li")) continue;

    candidate.classList.add("wiki-category-box");
    label.classList.add("wiki-category-label");
    list.classList.add("wiki-category-list");
  }
}

export function syncArticleLinkState(root, { isMoving, hasVisited }) {
  const links = root.querySelectorAll("[data-game-title]");
  for (const link of links) {
    const visited = hasVisited(link.dataset.gameTitle);
    link.classList.toggle("is-visited", visited);
    link.setAttribute("aria-disabled", String(isMoving));
  }
}

function foldDefaultCollapsedBrowseSection(root) {
  const heading = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].find(
    (element) => /^20\.\s*둘러보기/.test(element.textContent.trim())
  );
  if (!heading || heading.closest(".wiki-section-folding")) return;

  const level = Number(heading.tagName.slice(1));
  const contentRoot = findArticleContentRoot(heading, root);
  const headingBlock = childWithinRoot(heading, contentRoot);
  if (headingBlock === contentRoot) return;
  const details = document.createElement("details");
  details.className = "wiki-section-folding wiki-section-folding-browse";

  const summary = document.createElement("summary");
  const content = document.createElement("div");
  content.className = "wiki-section-folding-content";

  headingBlock.before(details);
  summary.append(headingBlock);
  details.append(summary, content);

  let node = details.nextSibling;
  while (node) {
    const next = node.nextSibling;
    if (isBrowseSectionBoundary(node, level)) break;
    content.append(node);
    node = next;
  }

  moveFootnotesAfterBrowseSection(details, content);
}

function foldLeadingUtilityContent(root) {
  const firstSectionHeading = [...root.querySelectorAll("h1,h2,h3")].find(
    (element) => /^1\.\s*\S/.test(element.textContent.replace(/\s+/g, " ").trim())
  );
  if (!firstSectionHeading) return;

  const headingBlock = childWithinRoot(firstSectionHeading, root);
  if (headingBlock === root || headingBlock === root.firstElementChild) return;

  const leadingNodes = [];
  let node = root.firstChild;
  while (node && node !== headingBlock) {
    leadingNodes.push(node);
    node = node.nextSibling;
  }

  const leadingText = leadingNodes
    .map((leadingNode) => leadingNode.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    leadingText.length < 400 ||
    !/(분류|편집 보호|하위 문서|관련 문서|둘러보기)/.test(leadingText)
  ) {
    return;
  }

  const details = document.createElement("details");
  details.className = "wiki-section-folding wiki-leading-utility-folding";

  const summary = document.createElement("summary");
  summary.textContent = "상단 틀";

  const content = document.createElement("div");
  content.className = "wiki-section-folding-content";

  headingBlock.before(details);
  details.append(summary, content);
  for (const leadingNode of leadingNodes) {
    content.append(leadingNode);
  }
}

function childWithinRoot(node, root) {
  let child = node;
  while (child.parentElement && child.parentElement !== root) {
    child = child.parentElement;
  }
  return child;
}

function findArticleContentRoot(node, fallbackRoot) {
  let best = fallbackRoot;
  let current = node.parentElement;
  while (current && current !== fallbackRoot) {
    if (looksLikeArticleContentRoot(current)) best = current;
    current = current.parentElement;
  }
  return best;
}

function looksLikeArticleContentRoot(element) {
  if (!(element instanceof HTMLElement)) return false;
  const markerCount = element.querySelectorAll(
    ".wiki-paragraph, .wiki-heading, .wiki-macro-toc, .toc-item, .wiki-table, .footnote-list"
  ).length;
  if (markerCount < 2) return false;
  return !element.querySelector("nav, header, footer");
}

function containsHeadingAtOrAboveLevel(node, level) {
  if (!(node instanceof HTMLElement)) return false;
  const headings = node.matches("h1,h2,h3,h4,h5,h6")
    ? [node]
    : [...node.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  return headings.some((heading) => Number(heading.tagName.slice(1)) <= level);
}

function isBrowseSectionBoundary(node, level) {
  if (!(node instanceof HTMLElement)) return false;
  if (containsHeadingAtOrAboveLevel(node, level)) return true;
  return looksLikeMainFootnoteBlock(node);
}

function looksLikeMainFootnoteBlock(node) {
  if (!(node instanceof HTMLElement)) return false;
  const text = node.textContent.replace(/\s+/g, " ").trim();
  return /^\[\d+\]\s*\S/.test(text);
}

function moveFootnotesAfterBrowseSection(details, content) {
  let insertAfter = details;
  const footnotes = [...content.querySelectorAll(".wiki-macro-footnote")];
  for (const footnote of footnotes) {
    if (!content.contains(footnote)) continue;
    insertAfter.after(footnote);
    insertAfter = footnote;
  }
}

function normalizeHorizontalFoldingNavboxes(root) {
  const candidates = [...root.querySelectorAll(".wiki-paragraph > div")];
  for (const candidate of candidates) {
    const children = [...candidate.children];
    const tabWrappers = children.filter(isDirectFoldingWrapper);
    if (tabWrappers.length < 2 || tabWrappers.length > 8) continue;

    candidate.classList.add("wiki-horizontal-folding-navbox");
    candidate.style.setProperty("--folding-tab-count", String(tabWrappers.length));

    for (const child of children) {
      child.classList.toggle("wiki-horizontal-folding-heading", !isDirectFoldingWrapper(child));
    }

    tabWrappers.forEach((wrapper, index) => {
      const details = wrapper.firstElementChild;
      wrapper.classList.add("wiki-horizontal-folding-tab");
      wrapper.style.setProperty("--folding-tab-column", String(index + 1));
      wrapper.style.setProperty("--folding-tab-index", String(index));
      details.classList.add("wiki-horizontal-folding-details");
    });
  }
}

function isDirectFoldingWrapper(element) {
  return (
    element instanceof HTMLElement &&
    element.children.length === 1 &&
    element.firstElementChild?.matches("details.wiki-folding")
  );
}

function normalizeSquareImageGrids(root) {
  const candidates = [...root.querySelectorAll(".wiki-paragraph, .wiki-paragraph > div")];
  for (const candidate of candidates) {
    const children = [...candidate.children];
    const cardChildren = children.filter(isSquareImageCard);
    if (cardChildren.length < 2 || cardChildren.length !== children.length) continue;

    candidate.classList.add("wiki-square-image-grid");
    for (const child of cardChildren) {
      child.classList.add("wiki-square-image-card");
    }
  }
}

function isSquareImageCard(element) {
  return (
    element instanceof HTMLElement &&
    element.matches("div") &&
    Boolean(element.querySelector('img[alt*="정사각형"]'))
  );
}

function normalizeCompactLinkGrids(root) {
  const candidates = [...root.querySelectorAll(".wiki-horizontal-folding-details .wiki-paragraph")];
  for (const candidate of candidates) {
    const children = [...candidate.children];
    if (children.length < 3 || children.length > 12) continue;
    if (!children.every(isCompactGridLink)) continue;

    candidate.classList.add("wiki-compact-link-grid");
    candidate.style.setProperty("--compact-link-count", String(children.length));
  }
}

function isCompactGridLink(element) {
  if (!(element instanceof HTMLElement) || !element.matches("a.game-wiki-link")) return false;
  const text = element.textContent.replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= 12;
}

function setupAnimatedFolding(root) {
  const foldings = [
    ...root.querySelectorAll(
      "details.wiki-section-folding, details.wiki-folding, details.wiki-macro-toc > details"
    )
  ];

  for (const details of foldings) {
    if (!(details instanceof HTMLDetailsElement) || details.dataset.foldingAnimated === "true") {
      continue;
    }

    const summary = details.querySelector(":scope > summary");
    const content = ensureFoldingAnimationContent(details, summary);
    if (!summary || !content) continue;

    details.dataset.foldingAnimated = "true";
    content.classList.add("wiki-folding-animation-content");
    summary.setAttribute("aria-expanded", String(details.open));

    summary.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      toggleFolding(details, summary, content);
    });
  }
}

function ensureFoldingAnimationContent(details, summary) {
  if (!summary) return null;

  const existingContent = details.querySelector(":scope > .wiki-folding-animation-content");
  if (existingContent instanceof HTMLElement) return existingContent;

  const directContent = [...details.children].filter((child) => child !== summary);
  if (directContent.length === 1 && directContent[0] instanceof HTMLElement) {
    return directContent[0];
  }

  const wrapper = document.createElement("div");
  wrapper.className = "wiki-folding-animation-content";
  let node = summary.nextSibling;
  while (node) {
    const next = node.nextSibling;
    wrapper.append(node);
    node = next;
  }
  details.append(wrapper);
  return wrapper;
}

function toggleFolding(details, summary, content) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (details.dataset.foldingAnimating === "true") {
    content.getAnimations().forEach((animation) => animation.cancel());
  }

  if (details.open) {
    closeFolding(details, summary, content, prefersReducedMotion);
    return;
  }

  openFolding(details, summary, content, prefersReducedMotion);
}

function openFolding(details, summary, content, prefersReducedMotion) {
  details.dataset.foldingAnimating = "true";
  const animationId = nextFoldingAnimationId(details);
  details.open = true;
  summary.setAttribute("aria-expanded", "true");

  if (prefersReducedMotion) {
    finishFoldingAnimation(details, content);
    return;
  }

  content.style.maxHeight = "0px";
  content.style.opacity = "0";
  content.style.transform = "translateY(-2px)";

  requestAnimationFrame(() => {
    content.style.maxHeight = `${content.scrollHeight}px`;
    content.style.opacity = "1";
    content.style.transform = "translateY(0)";
  });

  finishAfterTransition(details, content, animationId);
}

function closeFolding(details, summary, content, prefersReducedMotion) {
  details.dataset.foldingAnimating = "true";
  const animationId = nextFoldingAnimationId(details);
  summary.setAttribute("aria-expanded", "false");

  if (prefersReducedMotion) {
    details.open = false;
    finishFoldingAnimation(details, content);
    return;
  }

  content.style.maxHeight = `${content.scrollHeight}px`;
  content.style.opacity = "1";
  content.style.transform = "translateY(0)";

  requestAnimationFrame(() => {
    content.style.maxHeight = "0px";
    content.style.opacity = "0";
    content.style.transform = "translateY(-2px)";
  });

  finishAfterTransition(details, content, animationId, () => {
    details.open = false;
  });
}

function nextFoldingAnimationId(details) {
  const animationId = String(Number(details.dataset.foldingAnimationId || 0) + 1);
  details.dataset.foldingAnimationId = animationId;
  return animationId;
}

function finishAfterTransition(details, content, animationId, callback) {
  window.setTimeout(() => {
    if (details.dataset.foldingAnimationId !== animationId) return;
    callback?.();
    finishFoldingAnimation(details, content);
  }, 180);
}

function finishFoldingAnimation(details, content) {
  details.dataset.foldingAnimating = "false";
  if (details.open) {
    content.style.maxHeight = "";
    content.style.opacity = "";
    content.style.transform = "";
  }
}
