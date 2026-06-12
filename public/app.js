import {
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
const SPECIFIED_GAMES_STORAGE_KEY = "namuwiki-game:specified-games";
const HISTORY_LIMIT = 50;
const VISIBLE_HISTORY_LIMIT = 30;
const SPECIFIED_GAMES_LIMIT = 5;

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
  shareResultButton: document.querySelector("#shareResultButton"),
  shareResultStatus: document.querySelector("#shareResultStatus"),
  seedDialog: document.querySelector("#seedDialog"),
  gameModeDialog: document.querySelector("#gameModeDialog"),
  gameModeForm: document.querySelector("#gameModeForm"),
  randomGameButton: document.querySelector("#randomGameButton"),
  specifiedStartInput: document.querySelector("#specifiedStartInput"),
  specifiedGoalInput: document.querySelector("#specifiedGoalInput"),
  specifiedGameButton: document.querySelector("#specifiedGameButton"),
  specifiedGameStatus: document.querySelector("#specifiedGameStatus"),
  recentSpecifiedGames: document.querySelector("#recentSpecifiedGames"),
  recentSpecifiedGameList: document.querySelector("#recentSpecifiedGameList"),
  seedFromModeButton: document.querySelector("#seedFromModeButton"),
  seedForm: document.querySelector("#seedForm"),
  seedInput: document.querySelector("#seedInput"),
  seedStartButton: document.querySelector("#seedStartButton"),
  dailyScoreForm: document.querySelector("#dailyScoreForm"),
  dailyNicknameInput: document.querySelector("#dailyNicknameInput"),
  dailyScoreStatus: document.querySelector("#dailyScoreStatus"),
  dailyRankPanel: document.querySelector("#dailyRankPanel"),
  dailyRankText: document.querySelector("#dailyRankText"),
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

els.startGameButton.addEventListener("click", openGameModeDialog);
els.dailyChallengeButton.addEventListener("click", startDailyChallenge);
els.historyButton.addEventListener("click", showHistory);
els.historyBackButton.addEventListener("click", showHomeBoard);
els.clearHistoryButton.addEventListener("click", clearHistory);
els.homeButton.addEventListener("click", returnHome);
els.newRoundButton.addEventListener("click", handleRoundAction);
els.dialogNewRoundButton.addEventListener("click", () => {
  els.resultDialog.close();
  if (isDailyChallengeRound()) {
    returnHome();
  } else {
    startFreshRound();
  }
});
els.copySeedButton.addEventListener("click", copyRoundSeed);
els.shareResultButton.addEventListener("click", shareCurrentResult);
els.randomGameButton.addEventListener("click", () => {
  els.gameModeDialog.close();
  startFreshRound();
});
els.gameModeForm.addEventListener("submit", startSpecifiedRoundFromDialog);
for (const input of [els.specifiedStartInput, els.specifiedGoalInput]) {
  input.addEventListener("input", () => setSpecifiedGameStatus(""));
}
els.gameModeDialog.querySelector("[data-game-mode-cancel]").addEventListener("click", () => {
  els.gameModeDialog.close();
});
els.seedFromModeButton.addEventListener("click", () => {
  els.gameModeDialog.close();
  openSeedDialog();
});
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
  clearRoundQueryParams();
  startRound();
}

function openGameModeDialog() {
  const params = new URLSearchParams(window.location.search);
  const recentGame = readSpecifiedGames()[0];
  els.specifiedStartInput.value = params.get("start") || recentGame?.startTitle || "";
  els.specifiedGoalInput.value = params.get("goal") || recentGame?.goalTitle || "";
  setSpecifiedGameStatus("");
  renderRecentSpecifiedGames();
  els.gameModeDialog.showModal();
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

async function startSpecifiedRoundFromDialog(event) {
  event.preventDefault();
  const startTitle = normalizeTitleInput(els.specifiedStartInput.value);
  const goalTitle = normalizeTitleInput(els.specifiedGoalInput.value);
  if (!startTitle) {
    setSpecifiedGameStatus("시작 문서를 입력해 주세요.");
    els.specifiedStartInput.focus();
    return;
  }
  if (!goalTitle) {
    setSpecifiedGameStatus("목표 문서를 입력해 주세요.");
    els.specifiedGoalInput.focus();
    return;
  }
  if (normalizeClientTitle(startTitle) === normalizeClientTitle(goalTitle)) {
    setSpecifiedGameStatus("시작 문서와 목표 문서는 서로 달라야 합니다.");
    els.specifiedGoalInput.focus();
    return;
  }

  setSpecifiedGameLoading(true);
  setSpecifiedGameStatus("문서를 확인하는 중입니다.");
  try {
    const data = await fetchJson(specifiedRoundRequestUrl(startTitle, goalTitle));
    rememberSpecifiedGame(startTitle, goalTitle);
    setSpecifiedRoundQuery(startTitle, goalTitle);
    els.gameModeDialog.close();
    beginRound(data);
  } catch (error) {
    setSpecifiedGameStatus(error.message);
  } finally {
    setSpecifiedGameLoading(false);
  }
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

function setSpecifiedRoundQuery(startTitle, goalTitle) {
  const params = new URLSearchParams(window.location.search);
  params.set("start", startTitle);
  params.set("goal", goalTitle);
  params.delete("seed");
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
}

function normalizeTitleInput(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
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

function specifiedRoundRequestUrl(startTitle, goalTitle) {
  const params = new URLSearchParams({
    start: startTitle,
    goal: goalTitle
  });
  return `/api/round?${params}`;
}

function beginRound(data) {
  stopTimer();
  state.hasStarted = true;
  document.body.classList.remove("is-home");
  document.body.classList.add("is-game");
  state.round = data.round;
  state.goal = data.goal;
  state.article = data.article;
  state.completed = false;
  state.completedElapsedSeconds = 0;
  state.savedHistoryRoundId = "";
  startTimer();
  render();
}

function setSpecifiedGameStatus(message) {
  els.specifiedGameStatus.textContent = message || "";
  els.specifiedGameStatus.hidden = !message;
}

function setSpecifiedGameLoading(isLoading) {
  els.specifiedGameButton.disabled = isLoading;
  els.specifiedStartInput.disabled = isLoading;
  els.specifiedGoalInput.disabled = isLoading;
  els.specifiedGameButton.textContent = isLoading ? "확인 중" : "지정된 게임 시작";
}

function readSpecifiedGames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SPECIFIED_GAMES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeSpecifiedGame).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeSpecifiedGames(games) {
  localStorage.setItem(SPECIFIED_GAMES_STORAGE_KEY, JSON.stringify(games));
}

function normalizeSpecifiedGame(game) {
  const startTitle = normalizeTitleInput(game?.startTitle);
  const goalTitle = normalizeTitleInput(game?.goalTitle);
  if (!startTitle || !goalTitle) return null;
  if (normalizeClientTitle(startTitle) === normalizeClientTitle(goalTitle)) return null;
  return {
    startTitle,
    goalTitle,
    updatedAt: String(game?.updatedAt || "")
  };
}

function rememberSpecifiedGame(startTitle, goalTitle) {
  const record = {
    startTitle,
    goalTitle,
    updatedAt: new Date().toISOString()
  };
  const nextGames = [
    record,
    ...readSpecifiedGames().filter(
      (game) => (
        normalizeClientTitle(game.startTitle) !== normalizeClientTitle(startTitle) ||
        normalizeClientTitle(game.goalTitle) !== normalizeClientTitle(goalTitle)
      )
    )
  ].slice(0, SPECIFIED_GAMES_LIMIT);
  try {
    writeSpecifiedGames(nextGames);
  } catch (error) {
    console.warn("최근 지정 게임을 저장하지 못했습니다.", error);
  }
}

function renderRecentSpecifiedGames() {
  const games = readSpecifiedGames();
  els.recentSpecifiedGames.hidden = games.length === 0;
  els.recentSpecifiedGameList.replaceChildren(
    ...games.map((game) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${game.startTitle} → ${game.goalTitle}`;
      button.title = button.textContent;
      button.addEventListener("click", () => {
        els.specifiedStartInput.value = game.startTitle;
        els.specifiedGoalInput.value = game.goalTitle;
        setSpecifiedGameStatus("");
        els.specifiedStartInput.focus();
      });
      return button;
    })
  );
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

async function rewindToPathIndex(pathIndex) {
  if (!state.round || state.isMoving) return;
  const path = state.round.path || [];
  if (pathIndex < 0 || pathIndex >= path.length) return;

  state.isMoving = true;
  setLoading(true);
  try {
    const data = await fetchJson("/api/rewind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: state.round.id, pathIndex })
    });
    state.round = data.round;
    state.article = data.article;
    state.completed = false;
    state.completedElapsedSeconds = 0;
    render();
    scrollToArticleTop();
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
  els.articleTitle.textContent = article?.title || "라운드를 시작합니다";
  els.sourceLink.href = article?.canonicalUrl || "https://namu.wiki/";
  els.wikiArticle.innerHTML =
    article?.html || '<p class="wiki-placeholder">문서를 불러오는 중입니다.</p>';

  normalizeWikiArticleDom(els.wikiArticle);
  syncArticleLinkState();
  renderPath();
  if (!state.hasStarted && state.homeView === "home") {
    renderHomeChallenge();
  }
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
  els.newRoundButton.textContent = isDailyChallengeRound() ? "게임 포기" : "새 무작위 라운드";
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
      const topLine = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("div");
      const route = document.createElement("p");
      const path = document.createElement("details");
      const summary = document.createElement("summary");
      const pathList = document.createElement("ol");
      const actions = document.createElement("div");
      const shareButton = document.createElement("button");

      main.className = "history-main";
      topLine.className = "history-top-line";
      title.textContent = record.goalTitle || "목표";
      meta.className = "history-meta";
      for (const value of [
        record.modeLabel || "일반",
        formatHistoryDate(record.completedAt),
        `${record.clickCount || 0} 클릭`,
        formatSeconds(record.elapsedSeconds || 0)
      ]) {
        const chip = document.createElement("span");
        chip.textContent = value;
        meta.append(chip);
      }
      route.textContent = `${record.startTitle || "-"} → ${record.goalTitle || "-"}`;

      summary.textContent = `${record.pathLength || record.path?.length || 0}개 문서 경로 보기`;
      pathList.className = "history-path-list";
      for (const pathTitle of record.path || []) {
        const pathItem = document.createElement("li");
        pathItem.textContent = pathTitle;
        pathList.append(pathItem);
      }
      path.append(summary, pathList);
      shareButton.className = "secondary-button history-share-button";
      shareButton.type = "button";
      shareButton.textContent = "X 공유";
      shareButton.title = `${record.goalTitle || "클리어 기록"} 공유`;
      shareButton.addEventListener("click", () => {
        shareRecordToTwitter(record, { button: shareButton });
      });
      actions.className = "history-card-actions";
      actions.append(path, shareButton);
      topLine.append(title, meta);
      main.append(topLine, route);
      item.append(main, actions);
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
      const button = document.createElement("button");

      button.type = "button";
      button.textContent = title;
      button.title = `${title} 문서로 되돌리기`;
      button.addEventListener("click", () => rewindToPathIndex(index));
      item.append(button);
      item.title = title;
      if (index === path.length - 1) {
        item.setAttribute("aria-current", "page");
        button.setAttribute("aria-current", "page");
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
  els.shareResultStatus.textContent = "";
  els.dailyScoreForm.hidden = true;
  els.dailyRankPanel.hidden = true;
  els.dialogNewRoundButton.hidden = false;
  els.dialogNewRoundButton.textContent = "다음 라운드";
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
  els.shareResultStatus.textContent = "";
  els.dailyNicknameInput.value = getNickname();
  els.dailyScoreStatus.textContent = "";
  els.dailyScoreForm.hidden = false;
  els.dailyRankPanel.hidden = true;
  els.dialogNewRoundButton.hidden = true;
  els.dialogNewRoundButton.textContent = "메인으로";
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

async function shareCurrentResult() {
  const record = currentResultRecord();
  if (!record) return;
  await shareRecordToTwitter(record, {
    button: els.shareResultButton,
    statusElement: els.shareResultStatus
  });
}

function currentResultRecord() {
  if (!state.round) return null;
  const path = Array.isArray(state.round.path) ? state.round.path : [];
  return {
    id: state.round.id || "current",
    completedAt: new Date().toISOString(),
    startTitle: state.round.startTitle || path[0] || "",
    goalTitle: state.round.goalTitle || path[path.length - 1] || "",
    clickCount: state.round.clickCount || 0,
    elapsedSeconds: state.completedElapsedSeconds || elapsedSecondsForRound(),
    pathLength: path.length,
    path,
    seed: state.round.seed || "",
    difficultyLabel: state.round.difficulty?.label || "",
    modeLabel: historyModeLabel(state.round.seed || "")
  };
}

async function shareRecordToTwitter(record, options = {}) {
  const button = options.button;
  const statusElement = options.statusElement;
  const normalizedRecord = normalizeHistoryRecord(record);
  if (!normalizedRecord) return;

  const originalText = button?.textContent || "";
  setShareStatus(statusElement, "공유 이미지를 만드는 중입니다.");
  if (button) {
    button.disabled = true;
    button.textContent = "준비 중";
  }

  try {
    const blob = await createShareImageBlob(normalizedRecord);
    const shareText = shareTextForRecord(normalizedRecord);
    const shareUrl = shareUrlForRecord(normalizedRecord);

    if (canCopyImageToClipboard()) {
      await copyImageToClipboard(blob);
      openTwitterIntent(shareText, shareUrl);
      setShareStatus(statusElement, "이미지를 클립보드에 복사하고 X 작성창을 열었습니다.");
      return;
    }

    downloadBlob(blob, shareImageFilename(normalizedRecord));
    openTwitterIntent(shareText, shareUrl);
    setShareStatus(statusElement, "이미지를 다운로드하고 X 작성창을 열었습니다.");
  } catch (error) {
    console.warn("공유 이미지를 만들지 못했습니다.", error);
    openTwitterIntent(shareTextForRecord(normalizedRecord), shareUrlForRecord(normalizedRecord));
    setShareStatus(statusElement, "이미지는 만들지 못했지만 X 작성창을 열었습니다.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function setShareStatus(statusElement, message) {
  if (statusElement) statusElement.textContent = message;
}

function shareTextForRecord(record) {
  const route = shareRouteText(record);
  const mode = record.modeLabel || historyModeLabel(record.seed || "");
  return `나무위키 게임 ${mode} 클리어!\n${route}\n${record.clickCount || 0} 클릭 · ${formatSeconds(record.elapsedSeconds || 0)}\n`;
}

function shareRouteText(record) {
  const path = Array.isArray(record.path) && record.path.length > 0
    ? record.path
    : [record.startTitle || "-", record.goalTitle || "-"];
  return path.join(" → ");
}

function shareUrlForRecord(record) {
  const url = new URL(window.location.origin || window.location.href);
  url.pathname = "/";
  url.search = "";
  if (record.seed) {
    url.searchParams.set("seed", record.seed);
  } else {
    if (record.startTitle) url.searchParams.set("start", record.startTitle);
    if (record.goalTitle) url.searchParams.set("goal", record.goalTitle);
  }
  return url.toString();
}

function shareImageFilename(record) {
  const safeGoal = (record.goalTitle || "result")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 36);
  return `namuwiki-game-${safeGoal || "result"}.png`;
}

function openTwitterIntent(text, url) {
  const params = new URLSearchParams({ text, url });
  window.open(`https://twitter.com/intent/tweet?${params}`, "_blank", "noopener,noreferrer");
}

function canCopyImageToClipboard() {
  return Boolean(window.ClipboardItem && navigator.clipboard?.write);
}

async function copyImageToClipboard(blob) {
  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type]: blob
    })
  ]);
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}

function createShareImageBlob(record) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = 1200 * scale;
  canvas.height = 630 * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  drawShareCard(ctx, record);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("이미지 생성에 실패했습니다."));
    }, "image/png");
  });
}

function drawShareCard(ctx, record) {
  ctx.fillStyle = "#071312";
  ctx.fillRect(0, 0, 1200, 630);

  const bgGradient = ctx.createLinearGradient(0, 0, 1200, 630);
  bgGradient.addColorStop(0, "#12352f");
  bgGradient.addColorStop(0.45, "#081817");
  bgGradient.addColorStop(1, "#191d13");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, 1200, 630);

  ctx.strokeStyle = "rgba(120, 255, 226, 0.18)";
  ctx.lineWidth = 1;
  for (let x = 40; x < 1200; x += 58) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 630);
    ctx.stroke();
  }
  for (let y = 34; y < 630; y += 58) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }

  drawRoundedRect(ctx, 70, 58, 1060, 514, 24, "rgba(9, 31, 28, 0.9)", "rgba(120, 255, 226, 0.32)");
  drawBrandHeader(ctx, record);

  drawRouteTicket(ctx, record);

  const stats = [
    ["클릭", `${record.clickCount || 0}`],
    ["시간", formatSeconds(record.elapsedSeconds || 0)],
    ["문서", `${record.pathLength || record.path.length}`]
  ];
  stats.forEach((stat, index) => drawStatBox(ctx, 102 + index * 210, 338, stat[0], stat[1]));

  ctx.fillStyle = "#87fff0";
  ctx.font = "800 20px Inter, system-ui, sans-serif";
  ctx.fillText("PATH", 102, 482);

  drawFullPathText(ctx, record.path, 102, 504, 955, 52);

  drawShareFooter(ctx, record);
}

function drawBrandHeader(ctx, record) {
  drawBadge(ctx, 102, 96, record.modeLabel || "클리어");
  ctx.fillStyle = "#5fffea";
  ctx.font = "900 34px Inter, system-ui, sans-serif";
  ctx.fillText("N", 908, 124);
  ctx.fillStyle = "#ffcf7a";
  ctx.font = "800 24px Inter, system-ui, sans-serif";
  ctx.fillText("나무위키 게임", 950, 123);

  const seedText = record.seed ? `seed: ${record.seed}` : "random round";
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.font = "700 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const seedWidth = Math.min(338, Math.ceil(ctx.measureText(seedText).width) + 44);
  const seedX = 1098 - seedWidth;
  drawRoundedRect(ctx, seedX, 148, seedWidth, 34, 8, "rgba(255, 255, 255, 0.05)", "rgba(120, 255, 226, 0.16)");
  drawFittedText(ctx, seedText, seedX + 22, 171, seedWidth - 44);
}

function drawRouteTicket(ctx, record) {
  const startTitle = record.startTitle || record.path?.[0] || "-";
  const goalTitle = record.goalTitle || record.path?.[record.path.length - 1] || "-";

  drawRoundedRect(ctx, 102, 198, 996, 102, 16, "rgba(0, 194, 173, 0.08)", "rgba(120, 255, 226, 0.24)");

  ctx.fillStyle = "#87fff0";
  ctx.font = "800 15px Inter, system-ui, sans-serif";
  ctx.fillText("출발", 132, 228);
  ctx.fillText("도착", 680, 228);

  ctx.fillStyle = "#f8fff9";
  ctx.font = "900 40px Inter, system-ui, sans-serif";
  drawFittedText(ctx, startTitle, 132, 270, 380);
  drawFittedText(ctx, goalTitle, 680, 270, 390);

  ctx.fillStyle = "#ffcf7a";
  ctx.font = "900 42px Inter, system-ui, sans-serif";
  drawCenteredFittedText(ctx, "→", 589, 270, 48);
}

function drawShareFooter(ctx, record) {
  ctx.strokeStyle = "rgba(120, 255, 226, 0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(102, 562);
  ctx.lineTo(1098, 562);
  ctx.stroke();
}

function drawStatBox(ctx, x, y, label, value) {
  drawRoundedRect(ctx, x, y, 166, 92, 12, "rgba(255, 255, 255, 0.06)", "rgba(120, 255, 226, 0.22)");
  ctx.fillStyle = "#95bbb1";
  ctx.font = "800 18px Inter, system-ui, sans-serif";
  ctx.fillText(label, x + 20, y + 32);
  ctx.fillStyle = "#f8fff9";
  ctx.font = "900 32px Inter, system-ui, sans-serif";
  drawCenteredFittedText(ctx, value, x + 83, y + 70, 126);
}

function drawBadge(ctx, x, y, text) {
  ctx.font = "800 18px Inter, system-ui, sans-serif";
  const width = Math.min(260, Math.max(112, ctx.measureText(text).width + 34));
  drawRoundedRect(ctx, x, y, width, 38, 19, "rgba(0, 194, 173, 0.16)", "rgba(0, 194, 173, 0.5)");
  ctx.fillStyle = "#87fff0";
  ctx.fillText(text, x + 17, y + 25);
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawFittedText(ctx, text, x, y, maxWidth, lineHeight) {
  const content = String(text || "");
  if (ctx.measureText(content).width <= maxWidth) {
    ctx.fillText(content, x, y);
    return;
  }

  let next = content;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  ctx.fillText(`${next}…`, x, y);
}

function drawCenteredFittedText(ctx, text, centerX, y, maxWidth) {
  const content = String(text || "");
  if (ctx.measureText(content).width <= maxWidth) {
    ctx.fillText(content, centerX - ctx.measureText(content).width / 2, y);
    return;
  }

  let next = content;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  const fitted = `${next}…`;
  ctx.fillText(fitted, centerX - ctx.measureText(fitted).width / 2, y);
}

function drawFullPathText(ctx, path, x, y, maxWidth, maxHeight) {
  const items = Array.isArray(path) ? path.filter(Boolean) : [];
  const text = (items.length > 0 ? items : ["-"]).join(" → ");
  let fontSize = 20;
  let lines = [];
  let lineHeight = 24;

  while (fontSize >= 10) {
    ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
    lineHeight = Math.ceil(fontSize * 1.18);
    lines = wrapPathText(ctx, text, maxWidth);
    if (lines.length * lineHeight <= maxHeight) break;
    fontSize -= 1;
  }

  ctx.fillStyle = "#bad5cd";
  ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  for (let index = 0; index < lines.length; index += 1) {
    ctx.fillText(lines[index], x, y + index * lineHeight + fontSize);
  }
}

function wrapPathText(ctx, text, maxWidth) {
  const words = String(text || "").split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = word;
      continue;
    }
    line = nextLine;
  }

  if (line) lines.push(...breakLongLine(ctx, line, maxWidth));
  return lines.flatMap((item) => breakLongLine(ctx, item, maxWidth));
}

function breakLongLine(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const char of String(text || "")) {
    const nextLine = `${line}${char}`;
    if (line && ctx.measureText(nextLine).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = nextLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawRightAlignedFittedText(ctx, text, rightX, y, maxWidth) {
  const content = String(text || "");
  if (ctx.measureText(content).width <= maxWidth) {
    ctx.fillText(content, rightX - ctx.measureText(content).width, y);
    return;
  }

  let next = content;
  while (next.length > 1 && ctx.measureText(`…${next}`).width > maxWidth) {
    next = next.slice(1);
  }
  const fitted = `…${next}`;
  ctx.fillText(fitted, rightX - ctx.measureText(fitted).width, y);
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
    renderDailyRank(data.rank, data.scores?.length || 0);
  } catch (error) {
    els.dailyScoreStatus.textContent = error.message;
  } finally {
    els.dailyScoreForm.querySelector("button").disabled = false;
  }
}

function renderDailyRank(rank, visibleScoreCount) {
  const normalizedRank = Number.parseInt(rank, 10);
  els.dailyScoreForm.hidden = true;
  els.dailyRankPanel.hidden = false;
  els.dialogNewRoundButton.hidden = false;
  els.dialogNewRoundButton.textContent = "메인으로";

  if (Number.isFinite(normalizedRank) && normalizedRank > 0) {
    els.dailyRankText.textContent = `${normalizedRank}위`;
    els.dailyScoreStatus.textContent = visibleScoreCount >= normalizedRank
      ? "기록이 오늘의 순위표에 등록되었습니다."
      : "기록이 등록되었습니다.";
    return;
  }

  els.dailyRankText.textContent = "-";
  els.dailyScoreStatus.textContent = "기록이 등록되었습니다.";
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
