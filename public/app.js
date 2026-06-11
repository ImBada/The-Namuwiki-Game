import {
  createShareSeed,
  escapeHtml,
  fetchJson,
  formatDuration,
  formatSeconds,
  normalizeClientTitle,
  normalizeSeedInput,
  secondsUntilNextDailyChallenge,
  todayDisplayDate,
  todaySeed
} from "./client-utils.js";
import {
  normalizeWikiArticleDom,
  syncArticleLinkState as syncWikiArticleLinkState
} from "./wiki-dom.js";

const HISTORY_STORAGE_KEY = "namuwiki-game:play-history";
const HISTORY_LIMIT = 50;
const VISIBLE_HISTORY_LIMIT = 30;

const state = {
  round: null,
  goal: null,
  article: null,
  dailyPreview: null,
  dailyPreviewLoading: false,
  dailyPreviewSeed: "",
  dailyScores: [],
  dailyScoresLoading: false,
  dailyScoresSeed: "",
  hasStarted: false,
  homeView: "home",
  completedElapsedSeconds: 0,
  isMoving: false,
  savedHistoryRoundId: "",
  tick: null
};

const els = {
  homeScreen: document.querySelector("#homeScreen"),
  homeBoard: document.querySelector("#homeBoard"),
  historyScreen: document.querySelector("#historyScreen"),
  startGameButton: document.querySelector("#startGameButton"),
  seedGameButton: document.querySelector("#seedGameButton"),
  dailyChallengeButton: document.querySelector("#dailyChallengeButton"),
  historyButton: document.querySelector("#historyButton"),
  historyBackButton: document.querySelector("#historyBackButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  historyList: document.querySelector("#historyList"),
  storageNote: document.querySelector("#storageNote"),
  dailyDateText: document.querySelector("#dailyDateText"),
  dailyTimeLeft: document.querySelector("#dailyTimeLeft"),
  dailyStartTitle: document.querySelector("#dailyStartTitle"),
  dailyGoalTitle: document.querySelector("#dailyGoalTitle"),
  dailyPreviewStatus: document.querySelector("#dailyPreviewStatus"),
  leaderboardScope: document.querySelector("#leaderboardScope"),
  dailyLeaderboard: document.querySelector("#dailyLeaderboard"),
  gameBoard: document.querySelector(".game-board"),
  nicknameButtons: document.querySelectorAll("[data-nickname-button]"),
  nicknameLabels: document.querySelectorAll("[data-nickname-label]"),
  homeButton: document.querySelector("#homeButton"),
  newRoundButton: document.querySelector("#newRoundButton"),
  dialogNewRoundButton: document.querySelector("#dialogNewRoundButton"),
  resultDialog: document.querySelector("#resultDialog"),
  resultKicker: document.querySelector(".result-kicker"),
  resultTitle: document.querySelector("#resultTitle"),
  resultSummary: document.querySelector("#resultSummary"),
  resultSeedPanel: document.querySelector("#resultSeedPanel"),
  resultSeedValue: document.querySelector("#resultSeedValue"),
  copySeedButton: document.querySelector("#copySeedButton"),
  copySeedStatus: document.querySelector("#copySeedStatus"),
  resultPathList: document.querySelector("#resultPathList"),
  seedDialog: document.querySelector("#seedDialog"),
  seedForm: document.querySelector("#seedForm"),
  seedInput: document.querySelector("#seedInput"),
  seedStartButton: document.querySelector("#seedStartButton"),
  dailyScoreForm: document.querySelector("#dailyScoreForm"),
  dailyNicknameInput: document.querySelector("#dailyNicknameInput"),
  dailyScoreStatus: document.querySelector("#dailyScoreStatus"),
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

els.startGameButton.addEventListener("click", startFreshRound);
els.seedGameButton.addEventListener("click", openSeedDialog);
els.dailyChallengeButton.addEventListener("click", startDailyChallenge);
els.historyButton.addEventListener("click", showHistory);
els.historyBackButton.addEventListener("click", showHomeBoard);
els.clearHistoryButton.addEventListener("click", clearHistory);
els.homeButton.addEventListener("click", returnHome);
els.newRoundButton.addEventListener("click", handleRoundAction);
els.dialogNewRoundButton.addEventListener("click", () => {
  els.resultDialog.close();
  startFreshRound();
});
els.copySeedButton.addEventListener("click", copyRoundSeed);
els.seedForm.addEventListener("submit", startSeededRoundFromDialog);
els.seedDialog.querySelector("[data-seed-cancel]").addEventListener("click", () => {
  els.seedDialog.close();
});
els.dailyScoreForm.addEventListener("submit", submitDailyScoreFromDialog);
for (const button of els.nicknameButtons) {
  button.addEventListener("click", editNickname);
}
els.wikiArticle.addEventListener("click", (event) => {
  const link = event.target.closest("[data-game-title]");
  if (!link) return;

  event.preventDefault();
  moveTo(link.dataset.gameTitle);
});

render();
renderNickname();
startHomeClock();

function startFreshRound() {
  setRoundSeedQuery(createShareSeed());
  startRound();
}

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
    state.completedElapsedSeconds = 0;
    state.savedHistoryRoundId = "";
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

function openSeedDialog() {
  els.seedInput.value = "";
  els.seedDialog.showModal();
  window.setTimeout(() => els.seedInput.focus(), 0);
}

function startSeededRoundFromDialog(event) {
  event.preventDefault();
  const seed = normalizeSeedInput(els.seedInput.value);
  if (!seed) {
    els.seedInput.focus();
    return;
  }

  setRoundSeedQuery(seed);
  els.seedDialog.close();
  startRound();
}

function handleRoundAction() {
  if (isDailyChallengeRound()) {
    returnHome();
    return;
  }
  startFreshRound();
}

function returnHome() {
  stopTimer();
  state.round = null;
  state.goal = null;
  state.article = null;
  state.completed = false;
  state.completedElapsedSeconds = 0;
  state.isMoving = false;
  state.savedHistoryRoundId = "";
  state.hasStarted = false;
  state.homeView = "home";
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

function setRoundSeedQuery(seed) {
  const params = new URLSearchParams(window.location.search);
  params.set("seed", seed);
  params.delete("start");
  params.delete("goal");
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
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
      state.completedElapsedSeconds = elapsedSecondsForRound();
      saveCompletedRoundHistory();
      stopTimer();
      if (isDailyChallengeRound()) {
        renderDailyResult();
      } else {
        renderResult();
      }
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
  els.homeBoard.hidden = state.homeView !== "home";
  els.historyScreen.hidden = state.homeView !== "history";
  els.storageNote.hidden = state.homeView !== "home";
  els.startTitle.textContent = round?.startTitle || "-";
  els.goalTitle.textContent = round?.goalTitle || "-";
  els.stickyGoalTitle.textContent = round?.goalTitle || "-";
  els.pathGoalTitle.textContent = round?.goalTitle || "-";
  els.clickCount.textContent = String(round?.clickCount || 0);
  els.difficultyLabel.textContent = round?.difficulty?.label || "-";
  els.articleTitle.textContent = article?.title || "라운드를 시작하세요";
  els.sourceLink.href = article?.canonicalUrl || "https://namu.wiki/";
  els.wikiArticle.innerHTML =
    article?.html || '<p class="wiki-placeholder">문서를 불러오는 중입니다.</p>';

  normalizeWikiArticleDom(els.wikiArticle);
  syncArticleLinkState();
  renderPath();
  renderHomeChallenge();
  renderHistory();
  renderRoundAction();
  renderTimer();
  renderStatus();
}

function showHistory() {
  state.homeView = "history";
  stopTimer();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHomeBoard() {
  state.homeView = "home";
  render();
  startHomeClock();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    state.dailyScores = [];
    state.dailyScoresLoading = false;
    state.dailyScoresSeed = "";
  }
  els.dailyDateText.textContent = todayDisplayDate();
  renderDailyCountdown();
  els.leaderboardScope.textContent = todayDisplayDate();
  renderDailyPreview();
  ensureDailyChallengePreview(seed);
  renderDailyLeaderboard(seed);
  ensureDailyLeaderboard(seed);
}

function renderDailyPreview() {
  const preview = state.dailyPreview;
  els.dailyStartTitle.textContent = preview?.startTitle || "불러오는 중";
  els.dailyGoalTitle.textContent = preview?.goalTitle || "불러오는 중";

  if (preview) {
    els.dailyPreviewStatus.textContent = "";
    els.dailyPreviewStatus.hidden = true;
    return;
  }

  els.dailyPreviewStatus.hidden = false;
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
      goalTitle: data.round?.goalTitle || "-"
    };
  } catch {
    state.dailyPreview = null;
  } finally {
    state.dailyPreviewLoading = false;
    renderDailyPreview();
  }
}

function renderDailyLeaderboard(seed = todaySeed()) {
  const scores = state.dailyScoresSeed === seed ? state.dailyScores.slice(0, 5) : [];
  if (scores.length === 0) {
    const item = document.createElement("li");
    item.className = "leaderboard-empty";
    item.textContent = state.dailyScoresLoading ? "순위표를 불러오는 중입니다." : "아직 기록이 없습니다.";
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
      title.textContent = score.nickname || "익명";
      meta.textContent = `${score.clickCount} 클릭 · ${formatSeconds(score.elapsedSeconds || 0)}`;

      item.append(rank, title, meta);
      return item;
    })
  );
}

function renderHistory() {
  const history = readHistory().slice(0, VISIBLE_HISTORY_LIMIT);
  els.clearHistoryButton.disabled = history.length === 0;

  if (history.length === 0) {
    const item = document.createElement("li");
    item.className = "history-empty";
    item.textContent = "아직 클리어한 기록이 없습니다.";
    els.historyList.replaceChildren(item);
    return;
  }

  els.historyList.replaceChildren(
    ...history.map((record) => {
      const item = document.createElement("li");
      const main = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      const route = document.createElement("p");
      const path = document.createElement("details");
      const summary = document.createElement("summary");
      const pathList = document.createElement("ol");

      main.className = "history-main";
      title.textContent = record.goalTitle || "목표";
      meta.textContent = [
        record.modeLabel || "일반",
        formatHistoryDate(record.completedAt),
        `${record.clickCount || 0} 클릭`,
        formatSeconds(record.elapsedSeconds || 0)
      ].join(" · ");
      route.textContent = `${record.startTitle || "-"} → ${record.goalTitle || "-"}`;

      summary.textContent = `${record.pathLength || record.path?.length || 0}개 문서 경로`;
      pathList.className = "history-path-list";
      for (const pathTitle of record.path || []) {
        const pathItem = document.createElement("li");
        pathItem.textContent = pathTitle;
        pathList.append(pathItem);
      }
      path.append(summary, pathList);
      main.append(title, meta, route);
      item.append(main, path);
      return item;
    })
  );
}

function saveCompletedRoundHistory() {
  if (!state.round || state.savedHistoryRoundId === state.round.id) return;

  const path = Array.isArray(state.round.path) ? state.round.path : [];
  const record = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    roundId: state.round.id,
    completedAt: new Date().toISOString(),
    startTitle: state.round.startTitle || path[0] || "",
    goalTitle: state.round.goalTitle || "",
    clickCount: state.round.clickCount || 0,
    elapsedSeconds: state.completedElapsedSeconds || elapsedSecondsForRound(),
    pathLength: path.length,
    path,
    seed: state.round.seed || "",
    difficultyLabel: state.round.difficulty?.label || "",
    modeLabel: historyModeLabel(state.round.seed || "")
  };

  const nextHistory = [
    record,
    ...readHistory().filter((item) => item.roundId !== record.roundId)
  ].slice(0, HISTORY_LIMIT);
  try {
    writeHistory(nextHistory);
    state.savedHistoryRoundId = state.round.id;
  } catch (error) {
    console.warn("플레이 히스토리를 저장하지 못했습니다.", error);
  }
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeHistoryRecord).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
}

function normalizeHistoryRecord(record) {
  if (!record || typeof record !== "object") return null;
  const path = Array.isArray(record.path)
    ? record.path.map((title) => String(title || "")).filter(Boolean)
    : [];
  return {
    id: String(record.id || record.completedAt || Math.random()),
    roundId: String(record.roundId || ""),
    completedAt: String(record.completedAt || ""),
    startTitle: String(record.startTitle || path[0] || ""),
    goalTitle: String(record.goalTitle || path[path.length - 1] || ""),
    clickCount: Number.parseInt(record.clickCount, 10) || 0,
    elapsedSeconds: Number.parseInt(record.elapsedSeconds, 10) || 0,
    pathLength: Number.parseInt(record.pathLength, 10) || path.length,
    path,
    seed: String(record.seed || ""),
    difficultyLabel: String(record.difficultyLabel || ""),
    modeLabel: String(record.modeLabel || historyModeLabel(record.seed || ""))
  };
}

function clearHistory() {
  if (readHistory().length === 0) return;
  const confirmed = window.confirm("로컬에 저장된 플레이 히스토리를 모두 삭제할까요?");
  if (!confirmed) return;

  localStorage.removeItem(HISTORY_STORAGE_KEY);
  renderHistory();
}

function historyModeLabel(seed) {
  if (!seed) return "랜덤";
  if (seed === todaySeed()) return "일일 챌린지";
  return "시드";
}

function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

async function ensureDailyLeaderboard(seed) {
  if (state.dailyScoresSeed === seed || state.dailyScoresLoading) return;

  state.dailyScoresLoading = true;
  renderDailyLeaderboard(seed);
  try {
    const data = await fetchJson(`/api/daily-scores?seed=${encodeURIComponent(seed)}`);
    state.dailyScores = Array.isArray(data.scores) ? data.scores.sort(compareScores) : [];
    state.dailyScoresSeed = seed;
  } catch {
    state.dailyScores = [];
    state.dailyScoresSeed = seed;
  } finally {
    state.dailyScoresLoading = false;
    renderDailyLeaderboard(seed);
  }
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
  els.resultKicker.textContent = "목표 도착";
  els.resultTitle.textContent = state.round?.goalTitle || "도착";
  els.resultSummary.textContent = `${formatElapsed()} · ${state.round?.clickCount || 0} 클릭 · ${path.length} 문서`;
  els.dailyScoreForm.hidden = true;
  els.dialogNewRoundButton.hidden = false;
  renderResultSeed();
  els.resultPathList.replaceChildren(
    ...path.map((title) => {
      const item = document.createElement("li");
      item.textContent = title;
      item.title = title;
      return item;
    })
  );
}

function renderDailyResult() {
  const path = state.round?.path || [];
  els.resultKicker.textContent = "일일 챌린지 완료";
  els.resultTitle.textContent = "기록 등록";
  els.resultSummary.textContent = `${formatElapsed()} · ${state.round?.clickCount || 0} 클릭 · ${path.length} 문서`;
  els.dailyNicknameInput.value = getNickname();
  els.dailyScoreStatus.textContent = "";
  els.dailyScoreForm.hidden = false;
  els.dialogNewRoundButton.hidden = true;
  renderResultSeed();
  els.resultPathList.replaceChildren(
    ...path.map((title) => {
      const item = document.createElement("li");
      item.textContent = title;
      item.title = title;
      return item;
    })
  );
}

function renderResultSeed() {
  const seed = state.round?.seed || "";
  els.resultSeedPanel.hidden = !seed;
  els.resultSeedValue.textContent = seed || "-";
  els.copySeedStatus.textContent = "";
}

async function copyRoundSeed() {
  const seed = state.round?.seed || "";
  if (!seed) return;

  try {
    await navigator.clipboard.writeText(seed);
    els.copySeedStatus.textContent = "시드를 복사했습니다.";
  } catch {
    els.copySeedStatus.textContent = "복사하지 못했습니다. 시드를 직접 선택해 주세요.";
  }
}

function compareScores(a, b) {
  return (
    (a.clickCount || 0) - (b.clickCount || 0) ||
    (a.elapsedSeconds || 0) - (b.elapsedSeconds || 0) ||
    (a.pathLength || 0) - (b.pathLength || 0)
  );
}

async function submitDailyScoreFromDialog(event) {
  event.preventDefault();
  if (!state.round || !isDailyChallengeRound()) return;

  const nickname = normalizeNickname(els.dailyNicknameInput.value);
  if (!nickname) {
    els.dailyScoreStatus.textContent = "닉네임을 입력해 주세요.";
    els.dailyNicknameInput.focus();
    return;
  }

  setNickname(nickname);
  els.dailyScoreStatus.textContent = "기록을 등록하는 중입니다.";
  els.dailyScoreForm.querySelector("button").disabled = true;

  try {
    const data = await fetchJson("/api/daily-scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seed: state.round.seed,
        nickname,
        clickCount: state.round.clickCount || 0,
        elapsedSeconds: state.completedElapsedSeconds || elapsedSecondsForRound(),
        pathLength: (state.round.path || []).length
      })
    });
    state.dailyScores = Array.isArray(data.scores) ? data.scores.sort(compareScores) : [];
    state.dailyScoresSeed = state.round.seed;
    renderDailyLeaderboard(state.round.seed);
    els.resultDialog.close();
    returnHome();
  } catch (error) {
    els.dailyScoreStatus.textContent = error.message;
  } finally {
    els.dailyScoreForm.querySelector("button").disabled = false;
  }
}

function isDailyChallengeRound() {
  return state.round?.seed === todaySeed();
}

function editNickname() {
  const nextName = window.prompt("순위표에 표시할 닉네임을 입력하세요.", getNickname());
  if (nextName === null) return;

  const nickname = normalizeNickname(nextName);
  if (!nickname) return;

  setNickname(nickname);
}

function getNickname() {
  return getCookie("namuwiki_game_nickname") || localStorage.getItem("namuwiki-game:nickname") || "익명";
}

function setNickname(nickname) {
  const normalized = normalizeNickname(nickname) || "익명";
  localStorage.setItem("namuwiki-game:nickname", normalized);
  document.cookie = `namuwiki_game_nickname=${encodeURIComponent(normalized)}; Max-Age=31536000; Path=/; SameSite=Lax`;
  renderNickname();
}

function renderNickname() {
  const nickname = getNickname();
  for (const label of els.nicknameLabels) {
    label.textContent = nickname;
  }
}

function normalizeNickname(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

function getCookie(name) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}

function syncArticleLinkState() {
  syncWikiArticleLinkState(els.wikiArticle, {
    isMoving: state.isMoving,
    hasVisited
  });
}

function hasVisited(title) {
  const normalized = normalizeClientTitle(title);
  return (state.round?.path || []).some(
    (pathTitle) => normalizeClientTitle(pathTitle) === normalized
  );
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
  if (state.completed && state.completedElapsedSeconds) {
    return state.completedElapsedSeconds;
  }
  if (!state.round?.startedAt) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - state.round.startedAt) / 1000)
  );
}

function setLoading(isLoading) {
  document.body.classList.toggle("is-loading", isLoading);
  els.startGameButton.disabled = isLoading;
  els.seedGameButton.disabled = isLoading;
  els.seedStartButton.disabled = isLoading;
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
