import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function articleHtml(title, linkCount) {
  const links = Array.from({ length: linkCount }, (_, index) => {
    const linkTitle = `${title} 링크 ${index + 1}`;
    return `<a href="/w/${encodeURIComponent(linkTitle)}">${linkTitle}</a>`;
  }).join("");

  return `
    <html>
      <head>
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="충분한 설명이 들어 있는 안정적인 테스트 문서입니다.">
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

test("persists daily challenge rounds after the first random generation", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-daily-rounds-"));
  process.env.DATA_DIR = dataDir;

  const originalFetch = globalThis.fetch;
  const randomTitles = ["무작위 시작", "무작위 목표"];
  let randomCallCount = 0;

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href === "https://namu.wiki/random") {
      const title = randomTitles[randomCallCount] || "예비 문서";
      randomCallCount += 1;
      return new Response(articleHtml(title, 12), {
        headers: { "Content-Type": "text/html" }
      });
    }

    const encodedTitle = href.split("/w/")[1] || "";
    const title = decodeURIComponent(encodedTitle);
    const linkCount = title === "무작위 목표" ? 5 : 12;
    return new Response(articleHtml(title, linkCount), {
      headers: { "Content-Type": "text/html" }
    });
  };

  try {
    const moduleUrl = new URL(`../src/game.js?daily-rounds=${Date.now()}`, import.meta.url);
    const { createRound } = await import(moduleUrl.href);

    const firstRound = await createRound({ seed: "daily-2026-06-12" });
    const secondRound = await createRound({ seed: "daily-2026-06-12" });

    assert.equal(firstRound.round.startTitle, "무작위 시작");
    assert.equal(firstRound.round.goalTitle, "무작위 목표");
    assert.equal(secondRound.round.startTitle, firstRound.round.startTitle);
    assert.equal(secondRound.round.goalTitle, firstRound.round.goalTitle);
    assert.equal(randomCallCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
