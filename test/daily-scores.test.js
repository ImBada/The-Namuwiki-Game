import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
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
      startedAt: now - 20000
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
      startedAt: now - 15000
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

test("uses server elapsed time instead of trusting a submitted zero", async () => {
  const { submitDailyScore } = await importDailyScores("elapsed");
  const now = Date.now();

  const submitted = await submitDailyScore({
    nickname: "정상 기록",
    roundId: signedRoundId({ startedAt: now - 1800 }),
    clickCount: 1,
    elapsedSeconds: 0,
    pathLength: 2
  }, { now });

  assert.equal(submitted.score.elapsedSeconds, 1);
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
