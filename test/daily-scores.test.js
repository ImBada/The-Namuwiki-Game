import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function todaySeed() {
  return `daily-${new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date())}`;
}

test("returns the submitted daily score rank", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-daily-scores-"));
  process.env.DATA_DIR = dataDir;

  const moduleUrl = new URL(`../src/daily-scores.js?rank=${Date.now()}`, import.meta.url);
  const { submitDailyScore } = await import(moduleUrl.href);
  const seed = todaySeed();

  await submitDailyScore({
    seed,
    nickname: "빠른 사람",
    clickCount: 2,
    elapsedSeconds: 20,
    pathLength: 3
  });

  const submitted = await submitDailyScore({
    seed,
    nickname: "두번째 사람",
    clickCount: 3,
    elapsedSeconds: 15,
    pathLength: 4
  });

  assert.equal(submitted.rank, 2);
  assert.equal(submitted.score.nickname, "두번째 사람");
  assert.equal(submitted.scores[1].id, submitted.score.id);
});
