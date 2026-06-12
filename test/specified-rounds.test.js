import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

test("reports friendly errors for missing specified articles", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-specified-rounds-"));
  process.env.DATA_DIR = dataDir;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const encodedTitle = String(url).split("/w/")[1] || "";
    const title = decodeURIComponent(encodedTitle);
    if (title === "없는 문서") {
      return new Response("not found", { status: 404 });
    }
    return new Response(articleHtml(title, ["목표"]), {
      headers: { "Content-Type": "text/html" }
    });
  };

  try {
    const moduleUrl = new URL(`../src/game.js?specified=${Date.now()}`, import.meta.url);
    const { createRound } = await import(moduleUrl.href);

    await assert.rejects(
      createRound({ startTitle: "없는 문서", goalTitle: "목표" }),
      (error) => (
        error.statusCode === 404 &&
        error.message === "시작 문서 \"없는 문서\"을(를) 불러오지 못했습니다. 문서 제목이 정확한지 확인해 주세요."
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects specified rounds with the same start and goal", async () => {
  const moduleUrl = new URL(`../src/game.js?same-specified=${Date.now()}`, import.meta.url);
  const { createRound } = await import(moduleUrl.href);

  await assert.rejects(
    createRound({ startTitle: "대한민국", goalTitle: "대한민국" }),
    (error) => (
      error.statusCode === 400 &&
      error.message === "시작 문서와 목표 문서는 서로 달라야 합니다."
    )
  );
});
