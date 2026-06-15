import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROUND_SECRET =
  process.env.ROUND_SECRET || "the-namuwiki-game-local-round-secret";
let importCounter = 0;

function todayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function importDailyScores(label) {
  const dataDir = await mkdtemp(join(tmpdir(), `namuwiki-daily-scores-${label}-`));
  process.env.DATA_DIR = dataDir;

  importCounter += 1;
  const moduleUrl = new URL(
    `../src/daily-scores.js?${label}=${Date.now()}-${importCounter}`,
    import.meta.url
  );
  return import(moduleUrl.href);
}

function signedRoundId(overrides = {}) {
  const round = {
    startTitle: "시작",
    goalTitle: "목표",
    currentTitle: "목표",
    path: ["시작", "목표"],
    clickCount: 1,
    startedAt: Date.now() - 5000,
    dailyChallenge: true,
    dailyDateKey: todayDateKey(),
    ...overrides
  };
  const payload = Buffer.from(JSON.stringify(round)).toString("base64url");
  const signature = createHmac("sha256", ROUND_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function articleHtml(title, linkTitles = []) {
  const links = linkTitles
    .map((linkTitle) => `<a href="/w/${encodeURIComponent(linkTitle)}">${linkTitle}</a>`)
    .join("");

  return `
    <html>
      <head>
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="충분한 설명이 들어 있는 테스트 문서입니다.">
        <link rel="canonical" href="https://namu.wiki/w/${encodeURIComponent(title)}">
      </head>
      <body>
        <main>
          <div class="wiki-paragraph">${links}</div>
        </main>
      </body>
    </html>
  `;
}

test("returns the submitted daily score rank", async () => {
  const { submitDailyScore } = await importDailyScores("rank");
  const dateKey = todayDateKey();
  const now = Date.now();

  await submitDailyScore({
    nickname: "빠른 사람",
    roundId: signedRoundId({
      path: ["시작", "중간", "목표"],
      clickCount: 2,
      startedAt: now - 20000,
      completedAt: now
    }),
    clickCount: 2,
    elapsedSeconds: 999,
    pathLength: 3
  }, { now });

  const submitted = await submitDailyScore({
    nickname: "두번째 사람",
    roundId: signedRoundId({
      path: ["시작", "하나", "둘", "목표"],
      clickCount: 3,
      startedAt: now - 15000,
      completedAt: now
    }),
    clickCount: 3,
    elapsedSeconds: 15,
    pathLength: 4
  }, { now });

  assert.equal(submitted.dateKey, dateKey);
  assert.equal(submitted.rank, 2);
  assert.equal(submitted.score.nickname, "두번째 사람");
  assert.equal(submitted.score.elapsedSeconds, 15);
  assert.equal(submitted.scores[1].id, submitted.score.id);
  assert.equal(Object.hasOwn(submitted.score, "roundTokenHash"), false);
});

test("archives stale daily scores before resetting for a new day", async () => {
  const { getDailyLeaderboard } = await importDailyScores("archive-stale-scores");
  const staleDateKey = "2000-01-01";
  const staleScore = {
    id: "stale-score",
    dateKey: staleDateKey,
    nickname: "어제 사람",
    clickCount: 2,
    elapsedSeconds: 15,
    pathLength: 3,
    path: ["시작", "중간", "목표"],
    completedAt: "2000-01-01T12:00:00.000Z",
    roundTokenHash: createHmac("sha256", ROUND_SECRET)
      .update("stale-round")
      .digest("base64url")
  };

  await writeFile(
    join(process.env.DATA_DIR, "daily-scores.json"),
    `${JSON.stringify({
      [staleDateKey]: [staleScore],
      _usedRoundTokenHashes: {
        [staleDateKey]: [staleScore.roundTokenHash]
      }
    }, null, 2)}\n`
  );

  const leaderboard = await getDailyLeaderboard();
  const activeStore = JSON.parse(
    await readFile(join(process.env.DATA_DIR, "daily-scores.json"), "utf8")
  );
  const archive = JSON.parse(
    await readFile(
      join(process.env.DATA_DIR, "daily-score-archives", `${staleDateKey}.json`),
      "utf8"
    )
  );

  assert.equal(leaderboard.dateKey, todayDateKey());
  assert.deepEqual(leaderboard.scores, []);
  assert.deepEqual(activeStore, {});
  assert.equal(archive.dateKey, staleDateKey);
  assert.equal(archive.scores[0].nickname, "어제 사람");
  assert.deepEqual(archive.scores[0].path, ["시작", "중간", "목표"]);
  assert.deepEqual(archive.usedRoundTokenHashes, [staleScore.roundTokenHash]);
});

test("ranks the same-click first completion first, then the rest by elapsed time", async () => {
  const { submitDailyScore } = await importDailyScores("same-click-first-completion");
  const now = Date.now();

  const earlySlow = await submitDailyScore({
    nickname: "먼저 찾은 사람",
    roundId: signedRoundId({
      path: ["시작", "하나", "둘", "셋", "넷", "목표"],
      clickCount: 5,
      startedAt: now - 60 * 60 * 1000,
      completedAt: now - 60 * 60 * 1000 + 10 * 60 * 1000
    }),
    clickCount: 5,
    elapsedSeconds: 600,
    pathLength: 6
  }, { now });

  const middleMedium = await submitDailyScore({
    nickname: "중간에 보통 사람",
    roundId: signedRoundId({
      path: ["시작", "ㄱ", "ㄴ", "ㄷ", "ㄹ", "목표"],
      clickCount: 5,
      startedAt: now - 45 * 60 * 1000,
      completedAt: now - 43 * 60 * 1000
    }),
    clickCount: 5,
    elapsedSeconds: 120,
    pathLength: 6
  }, { now });

  const lateFast = await submitDailyScore({
    nickname: "나중에 빠른 사람",
    roundId: signedRoundId({
      path: ["시작", "가", "나", "다", "라", "목표"],
      clickCount: 5,
      startedAt: now - 30 * 60 * 1000,
      completedAt: now - 29 * 60 * 1000
    }),
    clickCount: 5,
    elapsedSeconds: 60,
    pathLength: 6
  }, { now });

  assert.equal(earlySlow.rank, 1);
  assert.equal(middleMedium.rank, 2);
  assert.equal(lateFast.rank, 2);
  assert.equal(lateFast.scores[0].nickname, "먼저 찾은 사람");
  assert.equal(lateFast.scores[1].nickname, "나중에 빠른 사람");
  assert.equal(lateFast.scores[2].nickname, "중간에 보통 사람");
});

test("rejects scores without a valid signed round token", async () => {
  const { submitDailyScore } = await importDailyScores("unsigned");

  await assert.rejects(
    submitDailyScore({
      nickname: "위조 제출",
      roundId: "not-a-signed-round",
      clickCount: 0,
      elapsedSeconds: 0,
      pathLength: 1
    }),
    (error) => error.statusCode === 400 && error.message === "유효하지 않은 라운드입니다."
  );
});

test("rejects completed rounds that are not daily challenges", async () => {
  const { submitDailyScore } = await importDailyScores("not-daily");

  await assert.rejects(
    submitDailyScore({
      nickname: "일반 라운드",
      roundId: signedRoundId({ dailyChallenge: false }),
      clickCount: 1,
      elapsedSeconds: 5,
      pathLength: 2
    }),
    (error) => error.statusCode === 400 && error.message === "일일 챌린지 기록만 등록할 수 있습니다."
  );
});

test("rejects daily rounds that have not reached the goal", async () => {
  const { submitDailyScore } = await importDailyScores("incomplete");

  await assert.rejects(
    submitDailyScore({
      nickname: "미완료",
      roundId: signedRoundId({
        currentTitle: "중간",
        path: ["시작", "중간"],
        clickCount: 1
      }),
      clickCount: 1,
      elapsedSeconds: 5,
      pathLength: 2
    }),
    (error) => error.statusCode === 400 && error.message === "완료된 일일 챌린지만 등록할 수 있습니다."
  );
});

test("rejects submitted metrics that do not match the signed round", async () => {
  const { submitDailyScore } = await importDailyScores("metric-mismatch");

  await assert.rejects(
    submitDailyScore({
      nickname: "불일치",
      roundId: signedRoundId({
        path: ["시작", "중간", "목표"],
        clickCount: 2
      }),
      clickCount: 0,
      elapsedSeconds: 5,
      pathLength: 1
    }),
    (error) => error.statusCode === 400 && error.message === "제출된 라운드 기록이 일치하지 않습니다."
  );
});

test("rejects signed rounds with inconsistent click and path counts", async () => {
  const { submitDailyScore } = await importDailyScores("round-inconsistent");

  await assert.rejects(
    submitDailyScore({
      nickname: "라운드 불일치",
      roundId: signedRoundId({
        path: ["시작", "목표"],
        clickCount: 0
      }),
      clickCount: 0,
      elapsedSeconds: 5,
      pathLength: 2
    }),
    (error) => error.statusCode === 400 && error.message === "라운드 클릭 기록이 일치하지 않습니다."
  );
});

test("uses signed completion time instead of trusting submitted elapsed time", async () => {
  const { submitDailyScore } = await importDailyScores("signed-elapsed");
  const now = Date.now();
  const startedAt = now - 30000;
  const completedAt = now - 10000;

  const submitted = await submitDailyScore({
    nickname: "정상 기록",
    roundId: signedRoundId({ startedAt, completedAt }),
    clickCount: 1,
    elapsedSeconds: 1,
    pathLength: 2
  }, { now });

  assert.equal(submitted.score.elapsedSeconds, 20);
  assert.equal(submitted.score.completedAt, new Date(completedAt).toISOString());
});

test("stores verified daily path without exposing it publicly", async () => {
  const { getDailyLeaderboard, submitDailyScore } = await importDailyScores("stored-path");
  const dateKey = todayDateKey();
  const now = Date.now();
  const path = ["시작", "중간", "목표"];

  const submitted = await submitDailyScore({
    nickname: "경로 저장",
    roundId: signedRoundId({
      path,
      clickCount: 2,
      startedAt: now - 12000,
      completedAt: now
    }),
    clickCount: 2,
    elapsedSeconds: 12,
    pathLength: 3
  }, { now });

  const store = JSON.parse(await readFile(join(process.env.DATA_DIR, "daily-scores.json"), "utf8"));
  const leaderboard = await getDailyLeaderboard();

  assert.deepEqual(store[dateKey][0].path, path);
  assert.equal(Object.hasOwn(submitted.score, "path"), false);
  assert.equal(Object.hasOwn(submitted.scores[0], "path"), false);
  assert.equal(Object.hasOwn(leaderboard.scores[0], "path"), false);
});

test("uses server receipt time for legacy completed daily tokens", async () => {
  const { submitDailyScore } = await importDailyScores("legacy-elapsed");
  const now = Date.now();

  const submitted = await submitDailyScore({
    nickname: "레거시 기록",
    roundId: signedRoundId({ startedAt: now - 1800 }),
    clickCount: 1,
    elapsedSeconds: 0,
    pathLength: 2
  }, { now });

  assert.equal(submitted.score.elapsedSeconds, 1);
  assert.equal(submitted.score.completedAt, new Date(now).toISOString());
});

test("rejects repeated submissions with the same completed round token", async () => {
  const { getDailyLeaderboard, submitDailyScore } = await importDailyScores("duplicate-token");
  const now = Date.now();
  const roundId = signedRoundId({
    startedAt: now - 5000,
    completedAt: now
  });

  await submitDailyScore({
    nickname: "첫 제출",
    roundId,
    clickCount: 1,
    elapsedSeconds: 5,
    pathLength: 2
  }, { now });

  await assert.rejects(
    submitDailyScore({
      nickname: "재제출",
      roundId,
      clickCount: 1,
      elapsedSeconds: 5,
      pathLength: 2
    }, { now }),
    (error) => error.statusCode === 409 && error.message === "이미 등록된 라운드 기록입니다."
  );

  const leaderboard = await getDailyLeaderboard();
  assert.equal(leaderboard.scores.length, 1);
  assert.equal(leaderboard.scores[0].nickname, "첫 제출");
  assert.equal(Object.hasOwn(leaderboard.scores[0], "roundTokenHash"), false);
});

test("rejects repeated submissions from the same round attempt", async () => {
  const { getDailyLeaderboard, submitDailyScore } = await importDailyScores("duplicate-attempt");
  const now = Date.now();
  const attemptId = "attempt-duplicate-1";
  const firstRoundId = signedRoundId({
    attemptId,
    startedAt: now - 10000,
    completedAt: now - 5000
  });
  const replayedFinalClickRoundId = signedRoundId({
    attemptId,
    startedAt: now - 10000,
    completedAt: now
  });

  await submitDailyScore({
    nickname: "첫 완료",
    roundId: firstRoundId,
    clickCount: 1,
    elapsedSeconds: 5,
    pathLength: 2
  }, { now });

  await assert.rejects(
    submitDailyScore({
      nickname: "같은 시도",
      roundId: replayedFinalClickRoundId,
      clickCount: 1,
      elapsedSeconds: 10,
      pathLength: 2
    }, { now }),
    (error) => error.statusCode === 409 && error.message === "이미 등록된 라운드 기록입니다."
  );

  const leaderboard = await getDailyLeaderboard();
  assert.equal(leaderboard.scores.length, 1);
  assert.equal(leaderboard.scores[0].nickname, "첫 완료");
});

test("rejects repeated submissions stored with legacy token hashes", async () => {
  const { submitDailyScore } = await importDailyScores("legacy-token-hash");
  const dateKey = todayDateKey();
  const now = Date.now();
  const roundId = signedRoundId({
    startedAt: now - 5000,
    completedAt: now
  });
  const legacyRoundTokenHash = createHmac("sha256", ROUND_SECRET)
    .update(roundId)
    .digest("base64url");

  await writeFile(
    join(process.env.DATA_DIR, "daily-scores.json"),
    `${JSON.stringify({
      [dateKey]: [{
        id: "legacy",
        dateKey,
        nickname: "기존 기록",
        clickCount: 1,
        elapsedSeconds: 5,
        pathLength: 2,
        completedAt: new Date(now).toISOString(),
        roundTokenHash: legacyRoundTokenHash
      }]
    }, null, 2)}\n`
  );

  await assert.rejects(
    submitDailyScore({
      nickname: "재제출",
      roundId,
      clickCount: 1,
      elapsedSeconds: 5,
      pathLength: 2
    }, { now }),
    (error) => error.statusCode === 409 && error.message === "이미 등록된 라운드 기록입니다."
  );
});

test("rejects repeated legacy submissions from the same started round", async () => {
  const { getDailyLeaderboard, submitDailyScore } = await importDailyScores("legacy-replayed-final-click");
  const now = Date.now();
  const startedAt = now - 10000;
  const firstRoundId = signedRoundId({
    startedAt,
    completedAt: now - 5000
  });
  const replayedFinalClickRoundId = signedRoundId({
    path: ["시작", "우회", "목표"],
    clickCount: 2,
    startedAt,
    completedAt: now
  });

  await submitDailyScore({
    nickname: "레거시 첫 완료",
    roundId: firstRoundId,
    clickCount: 1,
    elapsedSeconds: 5,
    pathLength: 2
  }, { now });

  await assert.rejects(
    submitDailyScore({
      nickname: "레거시 재완료",
      roundId: replayedFinalClickRoundId,
      clickCount: 2,
      elapsedSeconds: 10,
      pathLength: 3
    }, { now }),
    (error) => error.statusCode === 409 && error.message === "이미 등록된 라운드 기록입니다."
  );

  const leaderboard = await getDailyLeaderboard();
  assert.equal(leaderboard.scores.length, 1);
  assert.equal(leaderboard.scores[0].nickname, "레거시 첫 완료");
});

test("rejects daily rounds from another date", async () => {
  const { submitDailyScore } = await importDailyScores("stale-daily");

  await assert.rejects(
    submitDailyScore({
      nickname: "어제 기록",
      roundId: signedRoundId({ dailyDateKey: "2000-01-01" }),
      clickCount: 1,
      elapsedSeconds: 5,
      pathLength: 2
    }),
    (error) => (
      error.statusCode === 400 &&
      error.message === "오늘의 일일 챌린지 기록만 등록할 수 있습니다."
    )
  );
});

test("rejects specified rounds requested with the daily flag", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-daily-specified-"));
  process.env.DATA_DIR = dataDir;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith("https://namu.wiki/backlink/")) {
      return new Response(articleHtml("목표 역링크", ["시작"]), {
        headers: { "Content-Type": "text/html" }
      });
    }

    const encodedTitle = href.split("/w/")[1] || "";
    const title = decodeURIComponent(encodedTitle);
    return new Response(articleHtml(title, title === "시작" ? ["목표"] : []), {
      headers: { "Content-Type": "text/html" }
    });
  };

  try {
    importCounter += 1;
    const gameUrl = new URL(
      `../src/game.js?specified-daily=${Date.now()}-${importCounter}`,
      import.meta.url
    );
    const { createRound, handleClick } = await import(gameUrl.href);
    const created = await createRound({
      startTitle: "시작",
      goalTitle: "목표",
      dailyChallenge: true
    });
    const completed = await handleClick({
      roundId: created.round.id,
      title: "목표"
    });
    const { submitDailyScore } = await importDailyScores("specified-daily-submit");

    assert.equal(created.round.dailyChallenge, false);
    assert.equal(completed.round.dailyChallenge, false);
    assert.equal(typeof completed.round.completedAt, "number");
    const completedPayload = JSON.parse(
      Buffer.from(completed.round.id.split(".")[0], "base64url").toString("utf8")
    );
    assert.equal(completedPayload.completedAt, completed.round.completedAt);
    await assert.rejects(
      submitDailyScore({
        nickname: "지정 일일",
        roundId: completed.round.id,
        clickCount: 1,
        elapsedSeconds: 5,
        pathLength: 2
      }),
      (error) => error.statusCode === 400 && error.message === "일일 챌린지 기록만 등록할 수 있습니다."
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
