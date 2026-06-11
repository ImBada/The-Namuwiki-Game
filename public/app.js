const state = {
  round: null,
  goal: null,
  article: null,
  hasStarted: false,
  isMoving: false,
  tick: null
};

const els = {
  homeScreen: document.querySelector("#homeScreen"),
  startGameButton: document.querySelector("#startGameButton"),
  gameBoard: document.querySelector(".game-board"),
  newRoundButton: document.querySelector("#newRoundButton"),
  dialogNewRoundButton: document.querySelector("#dialogNewRoundButton"),
  resultDialog: document.querySelector("#resultDialog"),
  resultTitle: document.querySelector("#resultTitle"),
  resultSummary: document.querySelector("#resultSummary"),
  resultPathList: document.querySelector("#resultPathList"),
  roundStatus: document.querySelector("#roundStatus"),
  startTitle: document.querySelector("#startTitle"),
  goalTitle: document.querySelector("#goalTitle"),
  timer: document.querySelector("#timer"),
  clickCount: document.querySelector("#clickCount"),
  difficultyLabel: document.querySelector("#difficultyLabel"),
  articleTitle: document.querySelector("#articleTitle"),
  stickyGoalTitle: document.querySelector("#stickyGoalTitle"),
  sourceLink: document.querySelector("#sourceLink"),
  wikiArticle: document.querySelector("#wikiArticle"),
  pathCount: document.querySelector("#pathCount"),
  pathGoalTitle: document.querySelector("#pathGoalTitle"),
  pathList: document.querySelector("#pathList")
};

els.startGameButton.addEventListener("click", startRound);
els.newRoundButton.addEventListener("click", startRound);
els.dialogNewRoundButton.addEventListener("click", () => {
  els.resultDialog.close();
  startRound();
});
els.wikiArticle.addEventListener("click", (event) => {
  const link = event.target.closest("[data-game-title]");
  if (!link) return;

  event.preventDefault();
  moveTo(link.dataset.gameTitle);
});

render();

async function startRound() {
  state.hasStarted = true;
  document.body.classList.remove("is-home");
  document.body.classList.add("is-game");
  render();
  setLoading(true);
  try {
    const data = await fetchJson(roundRequestUrl());
    state.round = data.round;
    state.goal = data.goal;
    state.article = data.article;
    state.completed = false;
    startTimer();
    render();
  } catch (error) {
    renderError(error);
  } finally {
    setLoading(false);
  }
}

function roundRequestUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestParams = new URLSearchParams();
  for (const key of ["start", "goal"]) {
    const value = params.get(key);
    if (value) requestParams.set(key, value);
  }
  const query = requestParams.toString();
  return query ? `/api/round?${query}` : "/api/round";
}

async function moveTo(title) {
  if (!state.round || state.isMoving) return;
  state.isMoving = true;
  setLoading(true);
  try {
    const data = await fetchJson("/api/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: state.round.id, title })
    });
    state.round = data.round;
    state.article = data.article;
    render();
    scrollToArticleTop();

    if (data.completed) {
      state.completed = true;
      stopTimer();
      renderResult();
      els.resultDialog.showModal();
    }
  } catch (error) {
    renderError(error);
  } finally {
    state.isMoving = false;
    setLoading(false);
    syncArticleLinkState();
  }
}

function render() {
  const round = state.round;
  const article = state.article;

  els.homeScreen.hidden = state.hasStarted;
  els.gameBoard.hidden = !state.hasStarted;
  els.startTitle.textContent = round?.startTitle || "-";
  els.goalTitle.textContent = round?.goalTitle || "-";
  els.stickyGoalTitle.textContent = round?.goalTitle || "-";
  els.pathGoalTitle.textContent = round?.goalTitle ? `목표 ${round.goalTitle}` : "-";
  els.clickCount.textContent = String(round?.clickCount || 0);
  els.difficultyLabel.textContent = round?.difficulty?.label || "-";
  els.articleTitle.textContent = article?.title || "라운드를 시작하세요";
  els.sourceLink.href = article?.canonicalUrl || "https://namu.wiki/";
  els.wikiArticle.innerHTML =
    article?.html || '<p class="wiki-placeholder">문서를 불러오는 중입니다.</p>';

  foldDefaultCollapsedBrowseSection();
  syncArticleLinkState();
  renderPath();
  renderTimer();
  renderStatus();
}

function renderPath() {
  const path = state.round?.path || [];
  els.pathCount.textContent = String(path.length);
  els.pathList.replaceChildren(
    ...path.map((title, index) => {
      const item = document.createElement("li");
      item.textContent = title;
      item.title = title;
      if (index === path.length - 1) {
        item.setAttribute("aria-current", "page");
      }
      return item;
    })
  );
}

function renderResult() {
  const path = state.round?.path || [];
  els.resultTitle.textContent = state.round?.goalTitle || "도착";
  els.resultSummary.textContent = `${formatElapsed()} · ${state.round?.clickCount || 0} 클릭 · ${path.length} 문서`;
  els.resultPathList.replaceChildren(
    ...path.map((title) => {
      const item = document.createElement("li");
      item.textContent = title;
      item.title = title;
      return item;
    })
  );
}

function syncArticleLinkState() {
  const links = els.wikiArticle.querySelectorAll("[data-game-title]");
  for (const link of links) {
    const visited = hasVisited(link.dataset.gameTitle);
    link.classList.toggle("is-visited", visited);
    link.setAttribute("aria-disabled", String(state.isMoving));
  }
}

function foldDefaultCollapsedBrowseSection() {
  const heading = [...els.wikiArticle.querySelectorAll("h1,h2,h3,h4,h5,h6")].find(
    (element) => /^20\.\s*둘러보기/.test(element.textContent.trim())
  );
  if (!heading || heading.closest(".wiki-section-folding")) return;

  const level = Number(heading.tagName.slice(1));
  const contentRoot = heading.closest(".I5dX7KDP") || els.wikiArticle;
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

function hasVisited(title) {
  const normalized = normalizeClientTitle(title);
  return (state.round?.path || []).some(
    (pathTitle) => normalizeClientTitle(pathTitle) === normalized
  );
}

function normalizeClientTitle(title) {
  return String(title || "")
    .replace(/\s+/g, " ")
    .replace(/_/g, " ")
    .trim()
    .normalize("NFC");
}

function scrollToArticleTop() {
  document.querySelector(".wiki-stage")?.scrollIntoView({
    block: "start",
    behavior: "smooth"
  });
}

function startTimer() {
  stopTimer();
  state.tick = window.setInterval(renderTimer, 1000);
  renderTimer();
}

function stopTimer() {
  if (state.tick) {
    window.clearInterval(state.tick);
    state.tick = null;
  }
}

function renderTimer() {
  els.timer.textContent = formatElapsed();
}

function formatElapsed() {
  if (!state.round?.startedAt) return "00:00";
  const totalSeconds = Math.max(
    0,
    Math.floor((Date.now() - state.round.startedAt) / 1000)
  );
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function setLoading(isLoading) {
  document.body.classList.toggle("is-loading", isLoading);
  els.startGameButton.disabled = isLoading;
  els.newRoundButton.disabled = isLoading;
  els.dialogNewRoundButton.disabled = isLoading;
  syncArticleLinkState();
  renderStatus(isLoading);
}

function renderStatus(isLoading = false) {
  if (isLoading && state.isMoving) {
    els.roundStatus.textContent = "이동 중";
    return;
  }
  if (isLoading) {
    els.roundStatus.textContent = "라운드 생성 중";
    return;
  }
  if (state.completed) {
    els.roundStatus.textContent = "도착";
    return;
  }
  els.roundStatus.textContent = state.round ? "플레이 중" : "라운드 준비";
}

function renderError(error) {
  els.articleTitle.textContent = "오류";
  els.wikiArticle.innerHTML = `<p class="wiki-placeholder">${escapeHtml(error.message)}</p>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("API가 JSON 대신 HTML을 반환했습니다. Vercel API 라우팅을 확인하세요.");
  }
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  }
  return payload;
}
