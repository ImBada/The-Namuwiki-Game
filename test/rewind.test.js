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

test("rewinds a round to the selected path item", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-rewind-"));
  process.env.DATA_DIR = dataDir;

  const originalFetch = globalThis.fetch;
  const articles = new Map([
    ["시작", articleHtml("시작", ["중간"])],
    ["중간", articleHtml("중간", ["목표"])],
    ["목표", articleHtml("목표", [])]
  ]);

  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith("https://namu.wiki/backlink/")) {
      return new Response(articleHtml("목표 역링크", ["중간"]), {
        headers: { "Content-Type": "text/html" }
      });
    }

    const encodedTitle = href.split("/w/")[1] || "";
    const title = decodeURIComponent(encodedTitle);
    return new Response(articles.get(title) || articleHtml(title), {
      headers: { "Content-Type": "text/html" }
    });
  };

  try {
    const moduleUrl = new URL(`../src/game.js?rewind=${Date.now()}`, import.meta.url);
    const { createRound, handleClick, handleRewind } = await import(moduleUrl.href);

    const created = await createRound({ startTitle: "시작", goalTitle: "목표" });
    const movedToMiddle = await handleClick({
      roundId: created.round.id,
      title: "중간"
    });
    const movedToGoal = await handleClick({
      roundId: movedToMiddle.round.id,
      title: "목표"
    });

    const rewound = await handleRewind({
      roundId: movedToGoal.round.id,
      pathIndex: 1
    });

    assert.equal(rewound.article.title, "중간");
    assert.deepEqual(rewound.round.path, ["시작", "중간"]);
    assert.equal(rewound.round.currentTitle, "중간");
    assert.equal(rewound.round.clickCount, 1);
    assert.equal(rewound.completed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
