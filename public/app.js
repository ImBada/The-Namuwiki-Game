import {
  escapeHtml,
  fetchJson,
  formatDuration,
  formatSeconds,
  normalizeClientTitle,
  secondsUntilNextDailyChallenge,
  todayDateKey,
  todayDisplayDate
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
const MULTIPLAYER_POLL_MS = 1000;
const SHORTCUT_WARNING_MS = 1800;

window.addEventListener("keydown", blockBrowserFindShortcut, { capture: true });

let shortcutWarningTimer = null;

const state = {
  round: null,
  goal: null,
  article: null,
  dailyPreview: null,
  dailyPreviewLoading: false,
  dailyPreviewDateKey: "",
  dailyScores: [],
  dailyScoresLoading: false,
  dailyScoresDateKey: "",
  hasStarted: false,
  homeView: "home",
  goalPreviewOpen: false,
  goalPreviewRenderKey: "",
  completedElapsedSeconds: 0,
  isMoving: false,
  savedHistoryRoundId: "",
  tick: null,
  multiplayer: createMultiplayerState()
};

const els = {
  homeScreen: document.querySelector("#homeScreen"),
  homeBoard: document.querySelector("#homeBoard"),
  historyScreen: document.querySelector("#historyScreen"),
  startGameButton: document.querySelector("#startGameButton"),
  multiplayerButton: document.querySelector("#multiplayerButton"),
  dailyChallengeButton: document.querySelector("#dailyChallengeButton"),
  historyButton: document.querySelector("#historyButton"),
  historyBackButton: document.querySelector("#historyBackButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  historyList: document.querySelector("#historyList"),
  storageNotes: document.querySelectorAll("[data-storage-note]"),
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
  multiplayerResultPanel: document.querySelector("#multiplayerResultPanel"),
  resultPathList: document.querySelector("#resultPathList"),
  shareResultButton: document.querySelector("#shareResultButton"),
  shareResultStatus: document.querySelector("#shareResultStatus"),
  gameModeDialog: document.querySelector("#gameModeDialog"),
  gameModeForm: document.querySelector("#gameModeForm"),
  randomGameButton: document.querySelector("#randomGameButton"),
  specifiedStartInput: document.querySelector("#specifiedStartInput"),
  specifiedGoalInput: document.querySelector("#specifiedGoalInput"),
  specifiedGameButton: document.querySelector("#specifiedGameButton"),
  specifiedGameStatus: document.querySelector("#specifiedGameStatus"),
  recentSpecifiedGames: document.querySelector("#recentSpecifiedGames"),
  recentSpecifiedGameList: document.querySelector("#recentSpecifiedGameList"),
  dailyScoreForm: document.querySelector("#dailyScoreForm"),
  dailyNicknameInput: document.querySelector("#dailyNicknameInput"),
  dailyScoreStatus: document.querySelector("#dailyScoreStatus"),
  dailyRankPanel: document.querySelector("#dailyRankPanel"),
  dailyRankText: document.querySelector("#dailyRankText"),
  roundStatus: document.querySelector("#roundStatus"),
  startTitle: document.querySelector("#startTitle"),
  goalTile: document.querySelector("#goalTile"),
  goalTitle: document.querySelector("#goalTitle"),
  goalPreview: document.querySelector("#goalPreview"),
  goalPreviewCategoriesSection: document.querySelector("#goalPreviewCategoriesSection"),
  goalPreviewCategories: document.querySelector("#goalPreviewCategories"),
  goalPreviewDescription: document.querySelector("#goalPreviewDescription"),
  goalPreviewExcerptSection: document.querySelector("#goalPreviewExcerptSection"),
  goalPreviewExcerpt: document.querySelector("#goalPreviewExcerpt"),
  goalPreviewMeta: document.querySelector("#goalPreviewMeta"),
  goalPreviewLink: document.querySelector("#goalPreviewLink"),
  timer: document.querySelector("#timer"),
  clickCount: document.querySelector("#clickCount"),
  opponentClickTile: document.querySelector("#opponentClickTile"),
  opponentClickCount: document.querySelector("#opponentClickCount"),
  articleTitle: document.querySelector("#articleTitle"),
  stickyGoalTitle: document.querySelector("#stickyGoalTitle"),
  sourceLink: document.querySelector("#sourceLink"),
  wikiArticle: document.querySelector("#wikiArticle"),
  pathCount: document.querySelector("#pathCount"),
  pathGoalTitle: document.querySelector("#pathGoalTitle"),
  pathList: document.querySelector("#pathList"),
  multiplayerDialog: document.querySelector("#multiplayerDialog"),
  createRoomButton: document.querySelector("#createRoomButton"),
  joinRoomInput: document.querySelector("#joinRoomInput"),
  joinRoomButton: document.querySelector("#joinRoomButton"),
  multiplayerLobby: document.querySelector("#multiplayerLobby"),
  roomCodeText: document.querySelector("#roomCodeText"),
  copyRoomCodeButton: document.querySelector("#copyRoomCodeButton"),
  multiplayerStatus: document.querySelector("#multiplayerStatus"),
  multiplayerStartTitle: document.querySelector("#multiplayerStartTitle"),
  multiplayerGoalTitle: document.querySelector("#multiplayerGoalTitle"),
  lockStartButton: document.querySelector("#lockStartButton"),
  lockGoalButton: document.querySelector("#lockGoalButton"),
  multiplayerRoundStatus: document.querySelector("#multiplayerRoundStatus"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  drawMultiplayerRoundButton: document.querySelector("#drawMultiplayerRoundButton"),
  multiplayerStartButton: document.querySelector("#multiplayerStartButton"),
  multiplayerDock: document.querySelector("#multiplayerDock"),
  multiplayerDockToggle: document.querySelector("#multiplayerDockToggle"),
  multiplayerDockBody: document.querySelector("#multiplayerDockBody"),
  dockOpponentClickCount: document.querySelector("#dockOpponentClickCount"),
  dockChatSummary: document.querySelector("#dockChatSummary"),
  dockChatLog: document.querySelector("#dockChatLog"),
  dockChatForm: document.querySelector("#dockChatForm"),
  dockChatInput: document.querySelector("#dockChatInput"),
  shortcutWarning: document.querySelector("#shortcutWarning")
};

function blockBrowserFindShortcut(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    event.stopPropagation();
    showShortcutWarning();
  }
}

function showShortcutWarning() {
  if (!els.shortcutWarning) return;

  els.shortcutWarning.hidden = false;
  els.shortcutWarning.classList.add("is-visible");
  clearTimeout(shortcutWarningTimer);
  shortcutWarningTimer = setTimeout(() => {
    els.shortcutWarning.classList.remove("is-visible");
    els.shortcutWarning.hidden = true;
  }, SHORTCUT_WARNING_MS);
}

els.startGameButton.addEventListener("click", openGameModeDialog);
els.multiplayerButton.addEventListener("click", openMultiplayerDialog);
els.dailyChallengeButton.addEventListener("click", startDailyChallenge);
els.historyButton.addEventListener("click", showHistory);
els.historyBackButton.addEventListener("click", showHomeBoard);
els.clearHistoryButton.addEventListener("click", clearHistory);
els.homeButton.addEventListener("click", returnHome);
els.newRoundButton.addEventListener("click", handleRoundAction);
els.dialogNewRoundButton.addEventListener("click", () => {
  els.resultDialog.close();
  if (state.multiplayer.inGame) {
    returnToMultiplayerLobby();
    return;
  }
  if (isDailyChallengeRound()) {
    returnHome();
  } else {
    startFreshRound();
  }
});
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
els.multiplayerDialog.querySelector("[data-multiplayer-close]").addEventListener("click", closeMultiplayerDialog);
els.createRoomButton.addEventListener("click", createMultiplayerRoom);
els.joinRoomButton.addEventListener("click", joinMultiplayerRoom);
els.joinRoomInput.addEventListener("input", () => {
  els.joinRoomInput.value = normalizeRoomCodeInput(els.joinRoomInput.value);
});
els.copyRoomCodeButton.addEventListener("click", copyRoomCode);
els.chatForm.addEventListener("submit", sendChatMessage);
els.dockChatForm.addEventListener("submit", sendDockChatMessage);
els.multiplayerDockToggle.addEventListener("click", toggleMultiplayerDock);
els.lockStartButton.addEventListener("click", () => toggleMultiplayerRouteLock("start"));
els.lockGoalButton.addEventListener("click", () => toggleMultiplayerRouteLock("goal"));
els.drawMultiplayerRoundButton.addEventListener("click", drawMultiplayerRound);
els.multiplayerStartButton.addEventListener("click", startHostMultiplayerRound);
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
els.goalTile.addEventListener("pointerenter", openGoalPreviewFromPointer);
els.goalTile.addEventListener("pointerleave", closeGoalPreviewFromPointer);
els.goalTile.addEventListener("focusin", openGoalPreviewFromFocus);
els.goalTile.addEventListener("focusout", closeGoalPreviewFromFocus);
els.goalTile.addEventListener("click", toggleGoalPreviewFromPointer);
els.goalTile.addEventListener("keydown", toggleGoalPreviewFromKeyboard);
els.goalPreview.addEventListener("click", preventGoalPreviewArticleLink);
document.addEventListener("click", closeGoalPreviewFromOutside);

render();
renderNickname();
startHomeClock();

function createMultiplayerState() {
  return {
    room: null,
    peerId: "",
    isHost: false,
    peerConnection: null,
    channel: null,
    pollTimer: null,
    roomPollTimer: null,
    lastSignalId: 0,
    pendingIceCandidates: [],
    connected: false,
    connecting: false,
    status: "대기 중",
    opponentClicks: 0,
    inGame: false,
    selectedStartTitle: "",
    selectedGoalTitle: "",
    lockStart: false,
    lockGoal: false,
    roundPreview: null,
    roundPreviewLoading: false,
    roundPreviewStatus: "",
    dockOpen: false,
    unreadChatCount: 0,
    chatMessages: [],
    localResult: null,
    opponentResult: null,
    opponentForfeited: false
  };
}

function startFreshRound() {
  clearRoundQueryParams();
  resetGoalPreviewState();
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
  resetGoalPreviewState();
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
  params.set("daily", "1");
  params.delete("start");
  params.delete("goal");
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
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
  if (state.multiplayer.inGame || isDailyChallengeRound()) {
    if (state.multiplayer.inGame && !state.completed) {
      sendDataChannelMessage({
        type: "forfeit",
        nickname: getNickname(),
        clickCount: state.round?.clickCount || 0,
        path: state.round?.path || []
      });
    }
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
  resetGoalPreviewState();
  state.savedHistoryRoundId = "";
  state.hasStarted = false;
  state.homeView = "home";
  state.multiplayer.inGame = false;
  state.multiplayer.opponentClicks = 0;
  state.multiplayer.dockOpen = false;
  state.multiplayer.unreadChatCount = 0;
  state.multiplayer.localResult = null;
  state.multiplayer.opponentResult = null;
  state.multiplayer.opponentForfeited = false;
  document.body.classList.remove("is-game", "is-loading");
  document.body.classList.add("is-home");
  clearRoundQueryParams();
  render();
  startHomeClock();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function returnToMultiplayerLobby() {
  stopTimer();
  state.round = null;
  state.goal = null;
  state.article = null;
  state.completed = false;
  state.completedElapsedSeconds = 0;
  state.isMoving = false;
  resetGoalPreviewState();
  state.savedHistoryRoundId = "";
  state.hasStarted = false;
  state.homeView = "home";
  state.multiplayer.inGame = false;
  state.multiplayer.opponentClicks = 0;
  state.multiplayer.dockOpen = false;
  state.multiplayer.unreadChatCount = 0;
  state.multiplayer.localResult = null;
  state.multiplayer.opponentResult = null;
  state.multiplayer.opponentForfeited = false;
  document.body.classList.remove("is-game", "is-loading");
  document.body.classList.add("is-home");
  clearRoundQueryParams();
  render();
  renderMultiplayerLobby();
  els.multiplayerDialog.showModal();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearRoundQueryParams() {
  const params = new URLSearchParams(window.location.search);
  params.delete("daily");
  params.delete("start");
  params.delete("goal");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function setSpecifiedRoundQuery(startTitle, goalTitle) {
  const params = new URLSearchParams(window.location.search);
  params.set("start", startTitle);
  params.set("goal", goalTitle);
  params.delete("daily");
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
  for (const key of ["start", "goal", "daily"]) {
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
  resetGoalPreviewState();
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
    const parsed = JSON.parse(readLocalStorage(SPECIFIED_GAMES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeSpecifiedGame).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeSpecifiedGames(games) {
  writeLocalStorage(SPECIFIED_GAMES_STORAGE_KEY, JSON.stringify(games));
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
    broadcastMultiplayerClicks();
    render();
    scrollToArticleTop();

    if (data.completed) {
      state.completed = true;
      state.completedElapsedSeconds = elapsedSecondsForRound();
      saveCompletedRoundHistory();
      stopTimer();
      if (isDailyChallengeRound()) {
        renderDailyResult();
      } else if (state.multiplayer.inGame) {
        state.multiplayer.localResult = createMultiplayerResult("local");
        sendDataChannelMessage({
          type: "finish",
          result: state.multiplayer.localResult
        });
        renderMultiplayerResult();
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
    broadcastMultiplayerClicks();
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
  for (const note of els.storageNotes) {
    note.hidden = state.homeView !== "home";
  }
  els.startTitle.textContent = round?.startTitle || "-";
  els.goalTitle.textContent = round?.goalTitle || "-";
  els.stickyGoalTitle.textContent = round?.goalTitle || "-";
  els.pathGoalTitle.textContent = round?.goalTitle || "-";
  renderGoalPreview();
  els.clickCount.textContent = String(round?.clickCount || 0);
  els.opponentClickCount.textContent = String(state.multiplayer.opponentClicks || 0);
  els.opponentClickTile.hidden = !state.multiplayer.inGame;
  els.gameBoard.querySelector(".round-strip")?.classList.toggle(
    "has-opponent",
    state.multiplayer.inGame
  );
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
  renderMultiplayerLobby();
  renderMultiplayerDock();
}

function renderGoalPreview() {
  const goal = state.goal;
  const description =
    goal?.previewOverview ||
    goal?.description ||
    (goal ? "이 문서는 별도 설명이 제공되지 않았습니다." : "라운드를 시작하면 목표 문서 미리보기가 표시됩니다.");
  const previewText = goal?.previewBody || goal?.previewText || "";
  const categoriesHtml = goal?.previewCategoriesHtml || "";
  const overviewHtml = goal?.previewOverviewHtml || "";
  const bodyHtml = goal?.previewBodyHtml || "";
  const linkCount = Number.isFinite(goal?.linkCount) ? goal.linkCount : 0;
  const sourceUrl = goal?.canonicalUrl || "https://namu.wiki/";
  const hasGoal = Boolean(goal && state.hasStarted);
  const renderKey = [
    hasGoal ? "1" : "0",
    goal?.title || "",
    categoriesHtml,
    overviewHtml,
    description,
    bodyHtml,
    previewText,
    String(linkCount),
    sourceUrl
  ].join("\u001f");

  if (state.goalPreviewRenderKey !== renderKey) {
    els.goalPreviewCategories.innerHTML = categoriesHtml;
    els.goalPreviewCategoriesSection.hidden = !categoriesHtml;
    els.goalPreviewDescription.innerHTML = overviewHtml || escapeHtml(description);
    els.goalPreviewExcerpt.innerHTML = bodyHtml || escapeHtml(previewText);
    els.goalPreviewExcerptSection.hidden = !(bodyHtml || previewText);
    els.goalPreviewExcerpt.hidden = !(bodyHtml || previewText);
    els.goalPreviewMeta.textContent = hasGoal
      ? `이동 가능한 내부 링크 ${linkCount}개`
      : "문서 정보 대기 중";
    els.goalPreviewLink.href = sourceUrl;
    els.goalPreviewLink.hidden = !hasGoal;
    normalizeWikiArticleDom(els.goalPreview);
    state.goalPreviewRenderKey = renderKey;
  }

  const isPreviewVisible = state.goalPreviewOpen && hasGoal;
  els.goalTile.classList.toggle("is-preview-open", isPreviewVisible);
  els.goalTile.setAttribute("aria-expanded", isPreviewVisible ? "true" : "false");
  els.goalPreview.setAttribute("aria-hidden", isPreviewVisible ? "false" : "true");
}

function resetGoalPreviewState() {
  state.goalPreviewOpen = false;
  state.goalPreviewRenderKey = "";
}

function openGoalPreview() {
  if (!state.goal || !state.hasStarted || state.goalPreviewOpen) return;

  state.goalPreviewOpen = true;
  renderGoalPreview();
}

function closeGoalPreview() {
  if (!state.goalPreviewOpen) return;

  state.goalPreviewOpen = false;
  renderGoalPreview();
}

function openGoalPreviewFromPointer() {
  if (!usesHoverGoalPreview()) return;

  openGoalPreview();
}

function closeGoalPreviewFromPointer() {
  if (!usesHoverGoalPreview() || els.goalTile.contains(document.activeElement)) return;

  closeGoalPreview();
}

function openGoalPreviewFromFocus() {
  if (usesCompactGoalPreview()) return;

  openGoalPreview();
}

function closeGoalPreviewFromFocus(event) {
  if (usesCompactGoalPreview() || els.goalTile.contains(event.relatedTarget)) return;

  closeGoalPreview();
}

function toggleGoalPreviewFromPointer(event) {
  if (event.target.closest("a")) return;
  if (!usesCompactGoalPreview()) return;
  if (!state.goal || !state.hasStarted) return;

  state.goalPreviewOpen = !state.goalPreviewOpen;
  renderGoalPreview();
}

function toggleGoalPreviewFromKeyboard(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (!state.goal || !state.hasStarted) return;

  event.preventDefault();
  state.goalPreviewOpen = !state.goalPreviewOpen;
  renderGoalPreview();
}

function closeGoalPreviewFromOutside(event) {
  if (!state.goalPreviewOpen || els.goalTile.contains(event.target)) return;

  closeGoalPreview();
}

function preventGoalPreviewArticleLink(event) {
  const link = event.target.closest(".game-wiki-link");
  if (!link) return;

  event.preventDefault();
}

function usesCompactGoalPreview() {
  return window.matchMedia("(max-width: 560px)").matches;
}

function usesHoverGoalPreview() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
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

function openMultiplayerDialog() {
  if (!window.RTCPeerConnection) {
    window.alert("이 브라우저는 상대방 연결을 지원하지 않습니다.");
    return;
  }

  renderMultiplayerLobby();
  els.multiplayerDialog.showModal();
}

function closeMultiplayerDialog() {
  els.multiplayerDialog.close();
  if (!state.multiplayer.inGame) {
    disconnectMultiplayer();
  }
}

async function createMultiplayerRoom() {
  setMultiplayerLoading(true);
  setMultiplayerStatus("방을 만드는 중입니다.");
  try {
    const data = await fetchJson("/api/multiplayer/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: getNickname() })
    });
    resetMultiplayerConnection();
    state.multiplayer.room = data.room;
    state.multiplayer.peerId = data.peerId;
    state.multiplayer.isHost = true;
    state.multiplayer.status = "상대를 기다리는 중";
    addChatSystemMessage("방이 만들어졌습니다. 공유 코드를 보내 주세요.");
    drawHostMultiplayerRound({ announce: false, broadcast: false });
    startRoomPoll();
    startSignalPoll();
    renderMultiplayerLobby();
  } catch (error) {
    setMultiplayerStatus(error.message);
  } finally {
    setMultiplayerLoading(false);
  }
}

async function joinMultiplayerRoom() {
  const code = normalizeRoomCodeInput(els.joinRoomInput.value);
  if (code.length !== 5) {
    els.joinRoomInput.focus();
    setMultiplayerStatus("방 코드 5자리를 입력해 주세요.");
    return;
  }

  setMultiplayerLoading(true);
  setMultiplayerStatus("방에 참가하는 중입니다.");
  try {
    const data = await fetchJson(`/api/multiplayer/rooms/${code}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: getNickname() })
    });
    resetMultiplayerConnection();
    state.multiplayer.room = data.room;
    state.multiplayer.peerId = data.peerId;
    state.multiplayer.isHost = false;
    state.multiplayer.status = "상대방 연결 중";
    state.multiplayer.roundPreviewStatus = "호스트가 고른 게임을 기다리는 중입니다.";
    addChatSystemMessage("방에 참가했습니다.");
    await setupPeerConnection(false);
    startSignalPoll();
    renderMultiplayerLobby();
  } catch (error) {
    setMultiplayerStatus(error.message);
  } finally {
    setMultiplayerLoading(false);
  }
}

function startRoomPoll() {
  stopRoomPoll();
  state.multiplayer.roomPollTimer = window.setInterval(async () => {
    const mp = state.multiplayer;
    if (!mp.room || !mp.peerId || !mp.isHost || mp.connected || mp.connecting) return;
    try {
      const data = await fetchJson(
        `/api/multiplayer/rooms/${mp.room.code}?peerId=${encodeURIComponent(mp.peerId)}`
      );
      mp.room = data.room;
      if (mp.room.hasGuest) {
        mp.status = "상대방 연결 중";
        renderMultiplayerLobby();
        await setupPeerConnection(true);
      }
    } catch (error) {
      mp.status = error.message;
      renderMultiplayerLobby();
    }
  }, MULTIPLAYER_POLL_MS);
}

function stopRoomPoll() {
  if (state.multiplayer.roomPollTimer) {
    window.clearInterval(state.multiplayer.roomPollTimer);
    state.multiplayer.roomPollTimer = null;
  }
}

async function setupPeerConnection(isHost) {
  const mp = state.multiplayer;
  if (mp.connecting || mp.connected) return;
  mp.connecting = true;

  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  mp.peerConnection = peerConnection;

  peerConnection.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      sendSignal("ice", event.candidate.toJSON());
    }
  });
  peerConnection.addEventListener("connectionstatechange", () => {
    if (["failed", "disconnected", "closed"].includes(peerConnection.connectionState)) {
      mp.connected = false;
      mp.status = "연결이 끊어졌습니다.";
    } else if (peerConnection.connectionState === "connected") {
      mp.status = "상대방 연결됨";
    }
    renderMultiplayerLobby();
    renderMultiplayerDock();
  });

  if (isHost) {
    bindDataChannel(peerConnection.createDataChannel("namuwiki-game"));
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendSignal("offer", offer);
  } else {
    peerConnection.addEventListener("datachannel", (event) => {
      bindDataChannel(event.channel);
    });
  }
}

function bindDataChannel(channel) {
  const mp = state.multiplayer;
  mp.channel = channel;
  channel.addEventListener("open", () => {
    mp.connected = true;
    mp.connecting = false;
    mp.status = "상대방 연결됨";
    stopRoomPoll();
    stopSignalPoll();
    addChatSystemMessage("상대방과 채팅이 연결되었습니다.");
    renderMultiplayerLobby();
    if (mp.isHost && mp.roundPreview) {
      sendDataChannelMessage(multiplayerDrawMessage());
    }
    broadcastMultiplayerClicks();
  });
  channel.addEventListener("message", (event) => {
    handleDataChannelMessage(event.data);
  });
  channel.addEventListener("close", () => {
    mp.connected = false;
    mp.status = "채널이 닫혔습니다.";
    renderMultiplayerLobby();
    renderMultiplayerDock();
  });
}

async function sendSignal(type, payload) {
  const mp = state.multiplayer;
  const to = mp.isHost ? mp.room?.guestPeerId : mp.room?.hostPeerId;
  if (!mp.room?.code || !mp.peerId || !to) return;
  await fetchJson(`/api/multiplayer/rooms/${mp.room.code}/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: mp.peerId, to, type, payload })
  });
}

function startSignalPoll() {
  stopSignalPoll();
  state.multiplayer.pollTimer = window.setInterval(pollSignals, MULTIPLAYER_POLL_MS);
  pollSignals();
}

function stopSignalPoll() {
  if (state.multiplayer.pollTimer) {
    window.clearInterval(state.multiplayer.pollTimer);
    state.multiplayer.pollTimer = null;
  }
}

async function pollSignals() {
  const mp = state.multiplayer;
  if (!mp.room?.code || !mp.peerId) return;
  try {
    const params = new URLSearchParams({
      peerId: mp.peerId,
      after: String(mp.lastSignalId || 0)
    });
    const data = await fetchJson(`/api/multiplayer/rooms/${mp.room.code}/signals?${params}`);
    if (data.room) mp.room = data.room;
    for (const signal of data.signals || []) {
      mp.lastSignalId = Math.max(mp.lastSignalId, signal.id || 0);
      await handleSignal(signal);
    }
  } catch (error) {
    mp.status = error.message;
    renderMultiplayerLobby();
  }
}

async function handleSignal(signal) {
  const mp = state.multiplayer;
  if (!mp.peerConnection && signal.type === "offer") {
    await setupPeerConnection(false);
  }
  const peerConnection = mp.peerConnection;
  if (!peerConnection) return;

  if (signal.type === "offer") {
    await peerConnection.setRemoteDescription(signal.payload);
    await flushPendingIceCandidates();
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await sendSignal("answer", answer);
    return;
  }

  if (signal.type === "answer") {
    await peerConnection.setRemoteDescription(signal.payload);
    await flushPendingIceCandidates();
    return;
  }

  if (signal.type === "ice") {
    if (!peerConnection.remoteDescription) {
      mp.pendingIceCandidates.push(signal.payload);
      return;
    }
    await peerConnection.addIceCandidate(signal.payload);
  }
}

async function flushPendingIceCandidates() {
  const mp = state.multiplayer;
  const peerConnection = mp.peerConnection;
  if (!peerConnection?.remoteDescription) return;
  const candidates = mp.pendingIceCandidates.splice(0);
  for (const candidate of candidates) {
    await peerConnection.addIceCandidate(candidate);
  }
}

function handleDataChannelMessage(rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    return;
  }

  if (message.type === "chat") {
    addChatMessage(message.nickname || "상대", message.text || "", "remote");
    if (state.multiplayer.inGame && !state.multiplayer.dockOpen) {
      state.multiplayer.unreadChatCount += 1;
      renderMultiplayerDock();
    }
    return;
  }

  if (message.type === "clicks") {
    state.multiplayer.opponentClicks = Number.parseInt(message.clickCount, 10) || 0;
    render();
    return;
  }

  if (message.type === "finish") {
    const result = normalizeMultiplayerResult(message.result, "opponent");
    if (!result) return;
    state.multiplayer.opponentResult = result;
    state.multiplayer.opponentForfeited = false;
    state.multiplayer.opponentClicks = result.clickCount;
    addChatSystemMessage(`${result.nickname} 님이 목표에 도착했습니다.`);
    render();
    if (state.completed && state.multiplayer.localResult) {
      renderMultiplayerResult();
    }
    return;
  }

  if (message.type === "forfeit") {
    state.multiplayer.opponentForfeited = true;
    state.multiplayer.opponentClicks = Number.parseInt(message.clickCount, 10) || state.multiplayer.opponentClicks;
    addChatSystemMessage(`${message.nickname || "상대"} 님이 게임을 포기했습니다.`);
    render();
    if (state.completed && state.multiplayer.localResult) {
      renderMultiplayerResult();
    }
    return;
  }

  if (message.type === "draw") {
    addChatSystemMessage("새 게임이 추첨되었습니다.");
    setMultiplayerRoundPreview(message.startTitle, message.goalTitle, "이 게임으로 시작할 수 있습니다.");
    applyMultiplayerLockState(message.lockStart, message.lockGoal, { broadcast: false });
    return;
  }

  if (message.type === "lock-state") {
    applyMultiplayerLockState(message.lockStart, message.lockGoal, { broadcast: false });
    return;
  }

  if (message.type === "draw-request" && state.multiplayer.isHost) {
    addChatSystemMessage("상대방이 추첨을 요청했습니다.");
    drawHostMultiplayerRound({ announce: true, broadcast: true });
    return;
  }

  if (message.type === "start") {
    addChatSystemMessage("호스트가 게임을 시작했습니다.");
    startMultiplayerRound(message);
  }
}

function sendDataChannelMessage(message) {
  const channel = state.multiplayer.channel;
  if (!channel || channel.readyState !== "open") return false;
  channel.send(JSON.stringify(message));
  return true;
}

function sendChatMessage(event) {
  sendChatMessageFromInput(event, els.chatInput);
}

function sendDockChatMessage(event) {
  sendChatMessageFromInput(event, els.dockChatInput);
}

function sendChatMessageFromInput(event, input) {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  if (!sendDataChannelMessage({ type: "chat", nickname: getNickname(), text })) {
    setMultiplayerStatus("상대방 채팅이 아직 연결되지 않았습니다.");
    return;
  }
  addChatMessage(getNickname(), text, "local");
  input.value = "";
}

function toggleMultiplayerDock() {
  state.multiplayer.dockOpen = !state.multiplayer.dockOpen;
  if (state.multiplayer.dockOpen) {
    state.multiplayer.unreadChatCount = 0;
  }
  renderMultiplayerDock();
}

async function startHostMultiplayerRound() {
  const { selectedStartTitle, selectedGoalTitle } = state.multiplayer;
  if (
    !state.multiplayer.isHost ||
    !state.multiplayer.connected ||
    !selectedStartTitle ||
    !selectedGoalTitle
  ) {
    return;
  }
  const message = {
    type: "start",
    startTitle: selectedStartTitle,
    goalTitle: selectedGoalTitle
  };
  sendDataChannelMessage(message);
  await startMultiplayerRound(message);
}

function drawMultiplayerRound() {
  if (!state.multiplayer.connected && !state.multiplayer.isHost) {
    setMultiplayerStatus("상대방 연결 후 추첨할 수 있습니다.");
    return;
  }
  if (state.multiplayer.isHost) {
    drawHostMultiplayerRound({ announce: true, broadcast: true });
    return;
  }
  if (sendDataChannelMessage({ type: "draw-request" })) {
    addChatSystemMessage("추첨을 요청했습니다.");
  }
}

async function drawHostMultiplayerRound({ announce, broadcast }) {
  if (!state.multiplayer.isHost) return;
  const mp = state.multiplayer;
  if (mp.lockStart && mp.lockGoal && mp.selectedStartTitle && mp.selectedGoalTitle) {
    mp.roundPreviewStatus = "시작과 도착이 모두 잠겨 있어 유지했습니다.";
    if (broadcast) {
      sendDataChannelMessage(multiplayerDrawMessage());
    }
    if (announce) addChatSystemMessage("잠긴 게임을 유지했습니다.");
    renderMultiplayerLobby();
    return;
  }

  mp.roundPreviewLoading = true;
  mp.roundPreviewStatus = "게임을 고르는 중입니다.";
  renderMultiplayerLobby();
  try {
    const data = await fetchJson(multiplayerDrawRequestUrl());
    setMultiplayerRoundPreview(
      data.round?.startTitle || "",
      data.round?.goalTitle || "",
      "이 게임으로 시작할 수 있습니다."
    );
    if (broadcast) {
      sendDataChannelMessage(multiplayerDrawMessage());
    }
    if (announce) addChatSystemMessage("새 게임을 추첨했습니다.");
  } catch (error) {
    mp.roundPreviewStatus = error.message || "게임을 고르지 못했습니다.";
  } finally {
    mp.roundPreviewLoading = false;
    renderMultiplayerLobby();
  }
}

function multiplayerDrawRequestUrl() {
  const params = new URLSearchParams();
  const mp = state.multiplayer;
  if (mp.lockStart && mp.selectedStartTitle) {
    params.set("start", mp.selectedStartTitle);
  }
  if (mp.lockGoal && mp.selectedGoalTitle) {
    params.set("goal", mp.selectedGoalTitle);
  }
  const query = params.toString();
  return query ? `/api/round?${query}` : "/api/round";
}

function multiplayerDrawMessage() {
  const mp = state.multiplayer;
  return {
    type: "draw",
    startTitle: mp.selectedStartTitle,
    goalTitle: mp.selectedGoalTitle,
    lockStart: mp.lockStart,
    lockGoal: mp.lockGoal
  };
}

function setMultiplayerRoundPreview(startTitle, goalTitle, status) {
  const normalizedStartTitle = normalizeTitleInput(startTitle);
  const normalizedGoalTitle = normalizeTitleInput(goalTitle);
  if (!normalizedStartTitle || !normalizedGoalTitle) return;
  state.multiplayer.selectedStartTitle = normalizedStartTitle;
  state.multiplayer.selectedGoalTitle = normalizedGoalTitle;
  state.multiplayer.roundPreview = {
    startTitle: normalizedStartTitle,
    goalTitle: normalizedGoalTitle
  };
  state.multiplayer.roundPreviewStatus = status || "";
  state.multiplayer.roundPreviewLoading = false;
  renderMultiplayerLobby();
}

function toggleMultiplayerRouteLock(kind) {
  const mp = state.multiplayer;
  if (!mp.roundPreview) return;
  if (kind === "start") {
    mp.lockStart = !mp.lockStart;
  } else {
    mp.lockGoal = !mp.lockGoal;
  }
  mp.roundPreviewStatus = multiplayerLockStatus();
  sendDataChannelMessage({
    type: "lock-state",
    lockStart: mp.lockStart,
    lockGoal: mp.lockGoal
  });
  renderMultiplayerLobby();
}

function applyMultiplayerLockState(lockStart, lockGoal, options = {}) {
  state.multiplayer.lockStart = Boolean(lockStart);
  state.multiplayer.lockGoal = Boolean(lockGoal);
  state.multiplayer.roundPreviewStatus = multiplayerLockStatus();
  if (options.broadcast) {
    sendDataChannelMessage({
      type: "lock-state",
      lockStart: state.multiplayer.lockStart,
      lockGoal: state.multiplayer.lockGoal
    });
  }
  renderMultiplayerLobby();
}

function multiplayerLockStatus() {
  const { lockStart, lockGoal } = state.multiplayer;
  if (lockStart && lockGoal) return "시작과 도착을 잠갔습니다.";
  if (lockStart) return "시작을 잠갔습니다. 추첨하면 도착만 바뀝니다.";
  if (lockGoal) return "도착을 잠갔습니다. 추첨하면 시작만 바뀝니다.";
  return "이 게임으로 시작할 수 있습니다.";
}

async function startMultiplayerRound(message) {
  const startTitle = normalizeTitleInput(message?.startTitle);
  const goalTitle = normalizeTitleInput(message?.goalTitle);
  if (!startTitle || !goalTitle) return;
  state.multiplayer.inGame = true;
  state.multiplayer.opponentClicks = 0;
  state.multiplayer.dockOpen = false;
  state.multiplayer.unreadChatCount = 0;
  state.multiplayer.localResult = null;
  state.multiplayer.opponentResult = null;
  state.multiplayer.opponentForfeited = false;
  setSpecifiedRoundQuery(startTitle, goalTitle);
  els.multiplayerDialog.close();
  await startRound();
  broadcastMultiplayerClicks();
}

function broadcastMultiplayerClicks() {
  if (!state.multiplayer.inGame) return;
  sendDataChannelMessage({
    type: "clicks",
    clickCount: state.round?.clickCount || 0
  });
}

function disconnectMultiplayer() {
  stopSignalPoll();
  stopRoomPoll();
  resetMultiplayerConnection();
  state.multiplayer = createMultiplayerState();
  renderMultiplayerLobby();
  renderMultiplayerDock();
}

function resetMultiplayerConnection() {
  stopSignalPoll();
  stopRoomPoll();
  state.multiplayer.channel?.close();
  state.multiplayer.peerConnection?.close();
  state.multiplayer.peerConnection = null;
  state.multiplayer.channel = null;
  state.multiplayer.connected = false;
  state.multiplayer.connecting = false;
  state.multiplayer.lastSignalId = 0;
  state.multiplayer.pendingIceCandidates = [];
}

function setMultiplayerStatus(message) {
  state.multiplayer.status = message || "";
  renderMultiplayerLobby();
}

function setMultiplayerLoading(isLoading) {
  els.createRoomButton.disabled = isLoading;
  els.joinRoomButton.disabled = isLoading;
}

function renderMultiplayerLobby() {
  const mp = state.multiplayer;
  const hasRoom = Boolean(mp.room?.code);
  els.multiplayerLobby.hidden = !hasRoom;
  els.roomCodeText.textContent = mp.room?.code || "-----";
  els.multiplayerStatus.textContent = mp.status || "대기 중";
  els.multiplayerStartTitle.textContent = mp.roundPreview?.startTitle || "추첨 대기 중";
  els.multiplayerGoalTitle.textContent = mp.roundPreview?.goalTitle || "추첨 대기 중";
  els.multiplayerRoundStatus.textContent = mp.roundPreviewStatus || "";
  renderRouteLockButton(els.lockStartButton, mp.lockStart, "시작");
  renderRouteLockButton(els.lockGoalButton, mp.lockGoal, "도착");
  els.lockStartButton.disabled = !mp.roundPreview || mp.roundPreviewLoading;
  els.lockGoalButton.disabled = !mp.roundPreview || mp.roundPreviewLoading;
  els.chatInput.disabled = !mp.connected;
  els.chatForm.querySelector("button").disabled = !mp.connected;
  els.drawMultiplayerRoundButton.disabled =
    (!mp.connected && !mp.isHost) || mp.roundPreviewLoading;
  els.multiplayerStartButton.hidden = !mp.isHost;
  els.multiplayerStartButton.disabled =
    !mp.isHost ||
    !mp.connected ||
    mp.roundPreviewLoading ||
    !mp.selectedStartTitle ||
    !mp.selectedGoalTitle ||
    !mp.roundPreview;
  renderChatLog(els.chatLog);
}

function renderMultiplayerDock() {
  const mp = state.multiplayer;
  els.multiplayerDock.hidden = !mp.inGame;
  document.body.classList.toggle("has-multiplayer-dock", mp.inGame);
  if (!mp.inGame) return;

  els.dockOpponentClickCount.textContent = String(mp.opponentClicks || 0);
  els.multiplayerDock.classList.toggle("is-open", mp.dockOpen);
  els.multiplayerDockToggle.setAttribute("aria-expanded", String(mp.dockOpen));
  els.multiplayerDockBody.hidden = !mp.dockOpen;
  els.dockChatSummary.textContent = multiplayerDockSummary();
  els.dockChatInput.disabled = !mp.connected;
  els.dockChatForm.querySelector("button").disabled = !mp.connected;
  renderChatLog(els.dockChatLog);
}

function renderChatLog(chatLog) {
  chatLog.replaceChildren(
    ...state.multiplayer.chatMessages.slice(-60).map(createChatMessageElement)
  );
  chatLog.scrollTop = chatLog.scrollHeight;
}

function multiplayerDockSummary() {
  const mp = state.multiplayer;
  if (mp.unreadChatCount > 0) return `채팅 ${mp.unreadChatCount}`;
  if (mp.opponentResult) return "상대 도착";
  if (mp.opponentForfeited) return "상대 포기";
  if (!mp.connected) return "연결 끊김";
  return "채팅";
}

function createChatMessageElement(message) {
  const item = document.createElement("div");
  item.className = `chat-message ${message.kind}`;
  const name = document.createElement("strong");
  const text = document.createElement("span");
  name.textContent = message.nickname;
  text.textContent = message.text;
  item.append(name, text);
  return item;
}

function renderRouteLockButton(button, isLocked, label) {
  button.classList.toggle("is-locked", isLocked);
  button.setAttribute("aria-pressed", String(isLocked));
  button.setAttribute("aria-label", `${label} 문서 ${isLocked ? "잠금 해제" : "잠금"}`);
  button.title = `${label} 문서 ${isLocked ? "잠금 해제" : "잠금"}`;
}

function addChatMessage(nickname, text, kind) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return;
  state.multiplayer.chatMessages.push({
    nickname: String(nickname || "익명").slice(0, 20),
    text: normalizedText.slice(0, 240),
    kind
  });
  renderMultiplayerLobby();
  renderMultiplayerDock();
}

function addChatSystemMessage(text) {
  addChatMessage("시스템", text, "system");
}

async function copyRoomCode() {
  const code = state.multiplayer.room?.code || "";
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    setMultiplayerStatus("방 코드를 복사했습니다.");
  } catch {
    setMultiplayerStatus("복사하지 못했습니다. 코드를 직접 선택해 주세요.");
  }
}

function normalizeRoomCodeInput(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function renderRoundAction() {
  const shouldForfeit = state.multiplayer.inGame || isDailyChallengeRound();
  els.homeButton.hidden = state.multiplayer.inGame;
  els.newRoundButton.textContent = shouldForfeit ? "게임 포기" : "새 무작위 라운드";
}

function renderHomeChallenge() {
  const dateKey = todayDateKey();
  if (state.dailyPreviewDateKey !== dateKey) {
    state.dailyPreview = null;
    state.dailyPreviewLoading = false;
    state.dailyPreviewDateKey = dateKey;
    state.dailyScores = [];
    state.dailyScoresLoading = false;
    state.dailyScoresDateKey = "";
  }
  els.dailyDateText.textContent = todayDisplayDate();
  renderDailyCountdown();
  els.leaderboardScope.textContent = todayDisplayDate();
  renderDailyPreview();
  ensureDailyChallengePreview();
  renderDailyLeaderboard();
  ensureDailyLeaderboard();
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

async function ensureDailyChallengePreview() {
  if (state.dailyPreview || state.dailyPreviewLoading) return;

  state.dailyPreviewLoading = true;
  renderDailyPreview();
  try {
    const data = await fetchJson("/api/round?daily=1");
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

function renderDailyLeaderboard() {
  const scores = state.dailyScoresDateKey === todayDateKey() ? state.dailyScores.slice(0, 5) : [];
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
    modeLabel: currentRoundModeLabel()
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
    const parsed = JSON.parse(readLocalStorage(HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeHistoryRecord).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeHistory(history) {
  writeLocalStorage(HISTORY_STORAGE_KEY, JSON.stringify(history));
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
    modeLabel: String(record.modeLabel || "랜덤")
  };
}

function clearHistory() {
  if (readHistory().length === 0) return;
  const confirmed = window.confirm("로컬에 저장된 플레이 히스토리를 모두 삭제할까요?");
  if (!confirmed) return;

  removeLocalStorage(HISTORY_STORAGE_KEY);
  renderHistory();
}

function currentRoundModeLabel() {
  if (state.round?.dailyChallenge) return "일일 챌린지";
  if (state.multiplayer.inGame) return "멀티플레이";
  const params = new URLSearchParams(window.location.search);
  if (params.get("start") || params.get("goal")) return "지정";
  return "랜덤";
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

async function ensureDailyLeaderboard() {
  const dateKey = todayDateKey();
  if (state.dailyScoresDateKey === dateKey || state.dailyScoresLoading) return;

  state.dailyScoresLoading = true;
  renderDailyLeaderboard();
  try {
    const data = await fetchJson("/api/daily-scores");
    state.dailyScores = Array.isArray(data.scores) ? data.scores.sort(compareScores) : [];
    state.dailyScoresDateKey = data.dateKey || dateKey;
  } catch {
    state.dailyScores = [];
    state.dailyScoresDateKey = dateKey;
  } finally {
    state.dailyScoresLoading = false;
    renderDailyLeaderboard();
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
  els.multiplayerResultPanel.hidden = true;
  els.multiplayerResultPanel.replaceChildren();
  els.dialogNewRoundButton.hidden = false;
  els.dialogNewRoundButton.textContent = "다음 라운드";
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
  els.multiplayerResultPanel.hidden = true;
  els.multiplayerResultPanel.replaceChildren();
  els.dailyNicknameInput.value = getNickname();
  els.dailyScoreStatus.textContent = "";
  els.dailyScoreForm.hidden = false;
  els.dailyRankPanel.hidden = true;
  els.dialogNewRoundButton.hidden = true;
  els.dialogNewRoundButton.textContent = "메인으로";
  els.resultPathList.replaceChildren(
    ...path.map((title) => {
      const item = document.createElement("li");
      item.textContent = title;
      item.title = title;
      return item;
    })
  );
}

function renderMultiplayerResult() {
  renderResult();
  const mp = state.multiplayer;
  const localResult = mp.localResult || createMultiplayerResult("local");
  mp.localResult = localResult;
  const opponentResult = mp.opponentResult;
  const outcome = multiplayerOutcome(localResult, opponentResult, mp.opponentForfeited);

  els.resultKicker.textContent = "멀티플레이 결과";
  els.resultTitle.textContent = outcome.title;
  els.resultSummary.textContent = outcome.summary;
  els.dialogNewRoundButton.textContent = "대기방으로";
  els.multiplayerResultPanel.hidden = false;
  els.multiplayerResultPanel.replaceChildren(
    createMultiplayerResultCard("나", localResult, outcome.localLabel),
    createMultiplayerResultCard("상대", opponentResult, outcome.opponentLabel)
  );
}

function createMultiplayerResult(side) {
  const path = Array.isArray(state.round?.path) ? state.round.path : [];
  return {
    side,
    nickname: getNickname(),
    clickCount: state.round?.clickCount || 0,
    elapsedSeconds: state.completedElapsedSeconds || elapsedSecondsForRound(),
    pathLength: path.length,
    path,
    completedAt: new Date().toISOString()
  };
}

function normalizeMultiplayerResult(result, side) {
  if (!result || typeof result !== "object") return null;
  const path = Array.isArray(result.path)
    ? result.path.map((title) => String(title || "")).filter(Boolean).slice(0, 200)
    : [];
  return {
    side,
    nickname: normalizeNickname(result.nickname) || "상대",
    clickCount: Number.parseInt(result.clickCount, 10) || 0,
    elapsedSeconds: Number.parseInt(result.elapsedSeconds, 10) || 0,
    pathLength: Number.parseInt(result.pathLength, 10) || path.length,
    path,
    completedAt: String(result.completedAt || "")
  };
}

function multiplayerOutcome(localResult, opponentResult, opponentForfeited) {
  if (opponentForfeited) {
    return {
      title: "상대 포기",
      summary: "상대가 게임을 나갔습니다. 내 기록은 저장되었습니다.",
      localLabel: "완주",
      opponentLabel: "포기"
    };
  }
  if (!opponentResult) {
    return {
      title: "먼저 도착",
      summary: "상대가 아직 플레이 중입니다. 결과는 도착하는 즉시 갱신됩니다.",
      localLabel: "도착",
      opponentLabel: "진행 중"
    };
  }

  const comparison = compareMultiplayerResults(localResult, opponentResult);
  if (comparison < 0) {
    return {
      title: "승리",
      summary: "클릭 수, 시간, 경로 길이 순서로 비교했습니다.",
      localLabel: "승리",
      opponentLabel: "완주"
    };
  }
  if (comparison > 0) {
    return {
      title: "패배",
      summary: "클릭 수, 시간, 경로 길이 순서로 비교했습니다.",
      localLabel: "완주",
      opponentLabel: "승리"
    };
  }
  return {
    title: "무승부",
    summary: "클릭 수와 시간이 같습니다.",
    localLabel: "동점",
    opponentLabel: "동점"
  };
}

function compareMultiplayerResults(a, b) {
  return (
    (a.clickCount || 0) - (b.clickCount || 0) ||
    (a.elapsedSeconds || 0) - (b.elapsedSeconds || 0) ||
    (a.pathLength || 0) - (b.pathLength || 0) ||
    String(a.completedAt || "").localeCompare(String(b.completedAt || ""))
  );
}

function createMultiplayerResultCard(label, result, statusLabel) {
  const card = document.createElement("article");
  card.className = `multiplayer-result-card ${result ? "" : "is-pending"}`;

  const heading = document.createElement("div");
  const title = document.createElement("strong");
  const badge = document.createElement("span");
  title.textContent = result?.nickname ? `${label} · ${result.nickname}` : label;
  badge.textContent = statusLabel;
  heading.append(title, badge);

  const stats = document.createElement("p");
  stats.textContent = result
    ? `${result.clickCount || 0} 클릭 · ${formatSeconds(result.elapsedSeconds || 0)} · ${result.pathLength || result.path.length} 문서`
    : "결과 대기 중";

  const path = document.createElement("ol");
  path.className = "multiplayer-result-path";
  for (const titleText of result?.path || []) {
    const item = document.createElement("li");
    item.textContent = titleText;
    item.title = titleText;
    path.append(item);
  }

  card.append(heading, stats);
  if (result?.path?.length) card.append(path);
  return card;
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
    modeLabel: currentRoundModeLabel()
  };
}

async function shareRecordToTwitter(record, options = {}) {
  const button = options.button;
  const statusElement = options.statusElement;
  const normalizedRecord = normalizeHistoryRecord(record);
  if (!normalizedRecord) return;

  const originalText = button?.textContent || "";
  setShareStatus(statusElement, canCopyImageToClipboard()
    ? "공유 이미지를 만들고 클립보드에 복사할 준비 중입니다."
    : "공유 이미지를 만드는 중입니다.");
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
      setShareStatus(statusElement, "이미지를 클립보드에 복사했습니다. X 작성창에 붙여넣어 주세요.");
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
  const route = shareTweetRouteText(record);
  const mode = record.modeLabel || "랜덤";
  return `나무위키 게임 ${mode} 클리어!\n${route}\n${record.clickCount || 0} 클릭 · ${formatSeconds(record.elapsedSeconds || 0)}\n#나무위키게임`;
}

function shareTweetRouteText(record) {
  const path = shareRoutePath(record);
  if (path.length <= 2) return path.join(" → ");
  return `${path[0]} → … → ${path[path.length - 1]}`;
}

function shareRoutePath(record) {
  const path = Array.isArray(record.path) && record.path.length > 0
    ? record.path
    : [record.startTitle || "-", record.goalTitle || "-"];
  return path.map((title) => title || "-");
}

function shareUrlForRecord(record) {
  const url = new URL(window.location.origin || window.location.href);
  url.pathname = "/";
  url.search = "";
  if (record.startTitle) url.searchParams.set("start", record.startTitle);
  if (record.goalTitle) url.searchParams.set("goal", record.goalTitle);
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
  const tweetText = url ? `${text}\n${url}` : text;
  const params = new URLSearchParams({ text: tweetText });
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
  bgGradient.addColorStop(0, "#123d36");
  bgGradient.addColorStop(0.52, "#071817");
  bgGradient.addColorStop(1, "#161d12");
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

  drawRoundedRect(ctx, 70, 58, 1060, 514, 24, "rgba(7, 29, 27, 0.92)", "rgba(120, 255, 226, 0.34)");
  drawBrandHeader(ctx, record);

  drawRouteTicket(ctx, record);

  const stats = [
    ["클릭", `${record.clickCount || 0}`],
    ["시간", formatSeconds(record.elapsedSeconds || 0)],
    ["문서", `${record.pathLength || record.path.length}`]
  ];
  stats.forEach((stat, index) => drawStatBox(ctx, 102 + index * 348, 306, 300, stat[0], stat[1]));

  drawPathPanel(ctx, record);

  drawShareFooter(ctx, record);
}

function drawBrandHeader(ctx, record) {
  ctx.fillStyle = "#87fff0";
  ctx.font = "900 38px Inter, system-ui, sans-serif";
  const mark = "N";
  const title = "나무위키 게임";
  const markWidth = ctx.measureText(mark).width;
  const brandGap = 24;

  ctx.fillStyle = "#ffcf7a";
  ctx.font = "900 25px Inter, system-ui, sans-serif";
  const titleWidth = ctx.measureText(title).width;
  const brandX = 1098 - markWidth - brandGap - titleWidth;

  ctx.fillStyle = "#87fff0";
  ctx.font = "900 38px Inter, system-ui, sans-serif";
  ctx.fillText(mark, brandX, 124);

  ctx.fillStyle = "#ffcf7a";
  ctx.font = "900 25px Inter, system-ui, sans-serif";
  ctx.fillText(title, brandX + markWidth + brandGap, 123);

  ctx.fillStyle = "#87fff0";
  ctx.font = "900 18px Inter, system-ui, sans-serif";
  ctx.fillText("클리어", 102, 122);
}

function drawRouteTicket(ctx, record) {
  const startTitle = record.startTitle || record.path?.[0] || "-";
  const goalTitle = record.goalTitle || record.path?.[record.path.length - 1] || "-";

  drawRoundedRect(ctx, 102, 156, 996, 118, 16, "rgba(0, 194, 173, 0.1)", "rgba(120, 255, 226, 0.28)");

  ctx.fillStyle = "#87fff0";
  ctx.font = "900 16px Inter, system-ui, sans-serif";
  ctx.fillText("출발", 132, 193);
  ctx.fillText("도착", 680, 193);

  ctx.fillStyle = "#f8fff9";
  ctx.font = "900 43px Inter, system-ui, sans-serif";
  drawFittedText(ctx, startTitle, 132, 242, 390);
  drawFittedText(ctx, goalTitle, 680, 242, 390);

  ctx.fillStyle = "#ffcf7a";
  ctx.font = "900 46px Inter, system-ui, sans-serif";
  drawCenteredFittedText(ctx, "→", 589, 242, 52);
}

function drawPathPanel(ctx, record) {
  drawRoundedRect(ctx, 102, 420, 996, 102, 14, "rgba(0, 194, 173, 0.055)", "rgba(120, 255, 226, 0.16)");

  ctx.fillStyle = "#87fff0";
  ctx.font = "900 18px Inter, system-ui, sans-serif";
  ctx.fillText("PATH", 126, 452);

  drawFullPathText(ctx, record.path, 126, 470, 948, 38);
}

function drawShareFooter(ctx, record) {
  ctx.strokeStyle = "rgba(120, 255, 226, 0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(102, 542);
  ctx.lineTo(1098, 542);
  ctx.stroke();
}

function drawStatBox(ctx, x, y, width, label, value) {
  drawRoundedRect(ctx, x, y, width, 80, 12, "rgba(255, 255, 255, 0.055)", "rgba(120, 255, 226, 0.22)");
  ctx.fillStyle = "#95bbb1";
  ctx.font = "900 17px Inter, system-ui, sans-serif";
  ctx.fillText(label, x + 20, y + 30);
  ctx.fillStyle = "#f8fff9";
  ctx.font = "900 30px Inter, system-ui, sans-serif";
  drawCenteredFittedText(ctx, value, x + width / 2, y + 64, width - 40);
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
        nickname,
        clickCount: state.round.clickCount || 0,
        elapsedSeconds: state.completedElapsedSeconds || elapsedSecondsForRound(),
        pathLength: (state.round.path || []).length
      })
    });
    state.dailyScores = Array.isArray(data.scores) ? data.scores.sort(compareScores) : [];
    state.dailyScoresDateKey = data.dateKey || todayDateKey();
    renderDailyLeaderboard();
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
  return Boolean(state.round?.dailyChallenge);
}

function editNickname() {
  const nextName = window.prompt("순위표에 표시할 닉네임을 입력하세요.", getNickname());
  if (nextName === null) return;

  const nickname = normalizeNickname(nextName);
  if (!nickname) return;

  setNickname(nickname);
}

function getNickname() {
  return getCookie("namuwiki_game_nickname") || readLocalStorage("namuwiki-game:nickname") || "익명";
}

function setNickname(nickname) {
  const normalized = normalizeNickname(nickname) || "익명";
  writeLocalStorage("namuwiki-game:nickname", normalized);
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

function readLocalStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return "";
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Cookies still preserve nickname, and other local-only features can fail silently.
  }
}

function removeLocalStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
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
    if (state.dailyPreviewDateKey && state.dailyPreviewDateKey !== todayDateKey()) {
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
  if (state.multiplayer.inGame && state.multiplayer.opponentForfeited) {
    els.roundStatus.textContent = "상대 포기";
    return;
  }
  if (state.multiplayer.inGame && state.multiplayer.opponentResult) {
    els.roundStatus.textContent = "상대 도착";
    return;
  }
  els.roundStatus.textContent = state.round ? "플레이 중" : "라운드 준비";
}

function renderError(error) {
  els.articleTitle.textContent = "오류";
  els.wikiArticle.innerHTML = `<p class="wiki-placeholder">${escapeHtml(error.message)}</p>`;
}
