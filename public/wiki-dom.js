export function normalizeWikiArticleDom(root) {
  foldLeadingUtilityContent(root);
  foldDefaultCollapsedBrowseSection(root);
  normalizeHorizontalFoldingNavboxes(root);
  normalizeSquareImageGrids(root);
  normalizeCompactLinkGrids(root);
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
  const contentRoot = heading.closest(".I5dX7KDP") || root;
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
