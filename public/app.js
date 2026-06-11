const state = {
  round: null,
  goal: null,
  article: null,
  dailyPreview: null,
  dailyPreviewLoading: false,
  dailyPreviewSeed: "",
  hasStarted: false,
  isMoving: false,
  tick: null
};

const els = {
  homeScreen: document.querySelector("#homeScreen"),
  startGameButton: document.querySelector("#startGameButton"),
  dailyChallengeButton: document.querySelector("#dailyChallengeButton"),
  dailySeedText: document.querySelector("#dailySeedText"),
  dailyTimeLeft: document.querySelector("#dailyTimeLeft"),
  dailyStartTitle: document.querySelector("#dailyStartTitle"),
  dailyGoalTitle: document.querySelector("#dailyGoalTitle"),
  dailyPreviewStatus: document.querySelector("#dailyPreviewStatus"),
  leaderboardScope: document.querySelector("#leaderboardScope"),
  dailyLeaderboard: document.querySelector("#dailyLeaderboard"),
  gameBoard: document.querySelector(".game-board"),
  homeButton: document.querySelector("#homeButton"),
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
els.dailyChallengeButton.addEventListener("click", startDailyChallenge);
els.homeButton.addEventListener("click", returnHome);
els.newRoundButton.addEventListener("click", handleRoundAction);
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
startHomeClock();

async function startRound() {
  stopTimer();
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

function startDailyChallenge() {
  const params = new URLSearchParams(window.location.search);
  params.set("seed", todaySeed());
  params.delete("start");
  params.delete("goal");
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  startRound();
}

function handleRoundAction() {
  if (isDailyChallengeRound()) {
    returnHome();
    return;
  }
  startRound();
}

function returnHome() {
  stopTimer();
  state.round = null;
  state.goal = null;
  state.article = null;
  state.completed = false;
  state.isMoving = false;
  state.hasStarted = false;
  document.body.classList.remove("is-game", "is-loading");
  document.body.classList.add("is-home");
  clearRoundQueryParams();
  render();
  startHomeClock();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearRoundQueryParams() {
  const params = new URLSearchParams(window.location.search);
  params.delete("seed");
  params.delete("start");
  params.delete("goal");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function roundRequestUrl() {
  const params = new URLSearchParams(window.location.search);
  const requestParams = new URLSearchParams();
  for (const key of ["start", "goal", "seed"]) {
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
      saveDailyScore();
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
  renderHomeChallenge();
  renderRoundAction();
  renderTimer();
  renderStatus();
}

function renderRoundAction() {
  els.newRoundButton.textContent = isDailyChallengeRound() ? "게임 포기" : "새 라운드";
}

function renderHomeChallenge() {
  const seed = todaySeed();
  if (state.dailyPreviewSeed !== seed) {
    state.dailyPreview = null;
    state.dailyPreviewLoading = false;
    state.dailyPreviewSeed = seed;
  }
  els.dailySeedText.textContent = seed;
  renderDailyCountdown();
  els.leaderboardScope.textContent = todayDisplayDate();
  renderDailyPreview();
  ensureDailyChallengePreview(seed);
  renderDailyLeaderboard(seed);
}

function renderDailyPreview() {
  const preview = state.dailyPreview;
  els.dailyStartTitle.textContent = preview?.startTitle || "불러오는 중";
  els.dailyGoalTitle.textContent = preview?.goalTitle || "불러오는 중";

  if (preview) {
    els.dailyPreviewStatus.textContent = `${preview.difficultyLabel || "난이도"} · ${preview.difficultyScore || "-"}점`;
    return;
  }

  els.dailyPreviewStatus.textContent = state.dailyPreviewLoading
    ? "오늘의 문제를 준비하고 있습니다."
    : "문제를 불러오지 못했습니다.";
}

async function ensureDailyChallengePreview(seed) {
  if (state.dailyPreview || state.dailyPreviewLoading) return;

  state.dailyPreviewLoading = true;
  renderDailyPreview();
  try {
    const data = await fetchJson(`/api/round?seed=${encodeURIComponent(seed)}`);
    state.dailyPreview = {
      startTitle: data.round?.startTitle || "-",
      goalTitle: data.round?.goalTitle || "-",
      difficultyLabel: data.round?.difficulty?.label || "",
      difficultyScore: data.round?.difficulty?.score || ""
    };
  } catch {
    state.dailyPreview = null;
  } finally {
    state.dailyPreviewLoading = false;
    renderDailyPreview();
  }
}

function renderDailyLeaderboard(seed = todaySeed()) {
  const scores = getDailyScores(seed).slice(0, 5);
  if (scores.length === 0) {
    const item = document.createElement("li");
    item.className = "leaderboard-empty";
    item.textContent = "아직 기록이 없습니다.";
    els.dailyLeaderboard.replaceChildren(item);
    return;
  }

  els.dailyLeaderboard.replaceChildren(
    ...scores.map((score, index) => {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const title = document.createElement("strong");
      const meta = document.createElement("em");

      rank.textContent = String(index + 1);
      title.textContent = `${score.clickCount} 클릭`;
      meta.textContent = `${formatSeconds(score.elapsedSeconds)} · ${score.pathLength} 문서`;

      item.append(rank, title, meta);
      return item;
    })
  );
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

function saveDailyScore() {
  if (!state.round?.seed || state.round.seed !== todaySeed()) return;

  const seed = state.round.seed;
  const elapsedSeconds = elapsedSecondsForRound();
  const score = {
    seed,
    clickCount: state.round.clickCount || 0,
    elapsedSeconds,
    pathLength: (state.round.path || []).length,
    completedAt: new Date().toISOString()
  };
  const scores = [...getDailyScores(seed), score]
    .sort(compareScores)
    .slice(0, 20);

  localStorage.setItem(scoreStorageKey(seed), JSON.stringify(scores));
  renderDailyLeaderboard(seed);
}

function getDailyScores(seed) {
  try {
    const scores = JSON.parse(localStorage.getItem(scoreStorageKey(seed)) || "[]");
    return Array.isArray(scores) ? scores.sort(compareScores) : [];
  } catch {
    return [];
  }
}

function compareScores(a, b) {
  return (
    (a.clickCount || 0) - (b.clickCount || 0) ||
    (a.elapsedSeconds || 0) - (b.elapsedSeconds || 0) ||
    (a.pathLength || 0) - (b.pathLength || 0)
  );
}

function scoreStorageKey(seed) {
  return `namuwiki-game:daily-scores:${seed}`;
}

function isDailyChallengeRound() {
  return state.round?.seed === todaySeed();
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

function startHomeClock() {
  stopTimer();
  state.tick = window.setInterval(() => {
    renderDailyCountdown();
    if (state.dailyPreviewSeed && state.dailyPreviewSeed !== todaySeed()) {
      renderHomeChallenge();
    }
  }, 1000);
  renderDailyCountdown();
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

function renderDailyCountdown() {
  els.dailyTimeLeft.textContent = formatDuration(secondsUntilNextDailyChallenge());
}

function formatElapsed() {
  return formatSeconds(elapsedSecondsForRound());
}

function elapsedSecondsForRound() {
  if (!state.round?.startedAt) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - state.round.startedAt) / 1000)
  );
}

function formatSeconds(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDuration(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function secondsUntilNextDailyChallenge() {
  const now = new Date();
  const kstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const nextMidnightKst = new Date(kstNow);
  nextMidnightKst.setHours(24, 0, 0, 0);
  return Math.max(0, Math.ceil((nextMidnightKst - kstNow) / 1000));
}

function todaySeed() {
  return `daily-${todayDateKey()}`;
}

function todayDateKey() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function todayDisplayDate() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric"
  }).format(new Date());
}

function setLoading(isLoading) {
  document.body.classList.toggle("is-loading", isLoading);
  els.startGameButton.disabled = isLoading;
  els.dailyChallengeButton.disabled = isLoading;
  els.homeButton.disabled = isLoading;
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
