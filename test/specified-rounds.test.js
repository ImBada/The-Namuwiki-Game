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

function emptyBacklinkHtml(title) {
  return `
    <html>
      <head>
        <title>${title} (역링크) - 나무위키</title>
      </head>
      <body>
        <main>
          <div>해당 문서의 역링크가 존재하지 않습니다.</div>
        </main>
      </body>
    </html>
  `;
}

function previewArticleHtml(title) {
  return `
    <html>
      <head>
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${title}에 대해 서술한 문서.">
        <link rel="canonical" href="https://namu.wiki/w/${encodeURIComponent(title)}">
      </head>
      <body>
        <main>
          <div class="wiki-content">
            <div>
              <span>분류</span>
              <ul>
                <li>동아시아의 전쟁</li>
                <li>11세기</li>
              </ul>
            </div>
            <div class="wiki-macro-toc">목차</div>
            <h2 class="wiki-heading">1. 개요</h2>
            <div class="wiki-paragraph"><p><a href="/w/부소">부소</a>와 서하 사이에서 벌어진 전투.</p></div>
            <h2 class="wiki-heading">2. 경과</h2>
            <table><tbody><tr><td>틀에 가까운 표 내용</td></tr></tbody></table>
            <div class="wiki-paragraph">1082년 벌어진 전투의 경과를 설명하는 본문 문단.</div>
            <ul>
              <li><a href="/w/서하">서하</a>의 진군</li>
              <li><a href="/w/송나라">송나라</a>의 대응</li>
            </ul>
          </div>
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

test("rejects specified goal articles without backlinks", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-specified-no-backlinks-"));
  process.env.DATA_DIR = dataDir;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith("https://namu.wiki/backlink/")) {
      return new Response(emptyBacklinkHtml("목표"), {
        headers: { "Content-Type": "text/html" }
      });
    }

    const encodedTitle = href.split("/w/")[1] || "";
    const title = decodeURIComponent(encodedTitle);
    return new Response(articleHtml(title, title === "시작" ? ["목표"] : ["시작"]), {
      headers: { "Content-Type": "text/html" }
    });
  };

  try {
    const moduleUrl = new URL(`../src/game.js?specified-no-backlinks=${Date.now()}`, import.meta.url);
    const { createRound } = await import(moduleUrl.href);

    await assert.rejects(
      createRound({ startTitle: "시작", goalTitle: "목표" }),
      (error) => (
        error.statusCode === 400 &&
        error.message === "목표 문서 \"목표\"은(는) 역링크가 없어 목표로 사용할 수 없습니다."
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts specified goal articles with backlinks", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-specified-with-backlinks-"));
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
    return new Response(articleHtml(title, title === "시작" ? ["목표"] : ["시작"]), {
      headers: { "Content-Type": "text/html" }
    });
  };

  try {
    const moduleUrl = new URL(`../src/game.js?specified-with-backlinks=${Date.now()}`, import.meta.url);
    const { createRound } = await import(moduleUrl.href);
    const created = await createRound({ startTitle: "시작", goalTitle: "목표" });

    assert.equal(created.round.goalTitle, "목표");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns goal preview from original article sections", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-specified-preview-"));
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
    return new Response(title === "목표" ? previewArticleHtml(title) : articleHtml(title, ["목표"]), {
      headers: { "Content-Type": "text/html" }
    });
  };

  try {
    const moduleUrl = new URL(`../src/game.js?specified-preview=${Date.now()}`, import.meta.url);
    const { createRound } = await import(moduleUrl.href);
    const created = await createRound({ startTitle: "시작", goalTitle: "목표" });

    assert.match(created.goal.previewCategoriesHtml, /동아시아의 전쟁/);
    assert.match(created.goal.previewOverviewHtml, /부소/);
    assert.equal((created.goal.previewOverviewHtml.match(/서하 사이에서 벌어진 전투/g) || []).length, 1);
    assert.doesNotMatch(created.goal.previewOverviewHtml, /동아시아의 전쟁/);
    assert.match(created.goal.previewBodyHtml, /1082년 벌어진 전투의 경과/);
    assert.match(created.goal.previewBodyHtml, /data-game-title="서하"[\s\S]*서하[\s\S]*의 진군/);
    assert.doesNotMatch(created.goal.previewBodyHtml, /틀에 가까운 표 내용/);
    assert.doesNotMatch(created.goal.previewOverviewHtml, /목차/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reuses cached backlink checks for repeated specified goals", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-specified-cached-backlinks-"));
  process.env.DATA_DIR = dataDir;

  const originalFetch = globalThis.fetch;
  let backlinkCallCount = 0;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith("https://namu.wiki/backlink/")) {
      backlinkCallCount += 1;
      return new Response(articleHtml("목표 역링크", ["시작"]), {
        headers: { "Content-Type": "text/html" }
      });
    }

    const encodedTitle = href.split("/w/")[1] || "";
    const title = decodeURIComponent(encodedTitle);
    return new Response(articleHtml(title, title === "시작" ? ["목표"] : ["시작"]), {
      headers: { "Content-Type": "text/html" }
    });
  };

  try {
    const moduleUrl = new URL(`../src/game.js?specified-cached-backlinks=${Date.now()}`, import.meta.url);
    const { createRound } = await import(moduleUrl.href);

    await createRound({ startTitle: "시작", goalTitle: "목표" });
    await createRound({ startTitle: "시작", goalTitle: "목표" });

    assert.equal(backlinkCallCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not cache backlink check failures as missing backlinks", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "namuwiki-specified-backlink-failure-"));
  process.env.DATA_DIR = dataDir;

  const originalFetch = globalThis.fetch;
  let shouldFailBacklinkCheck = true;
  let backlinkCallCount = 0;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith("https://namu.wiki/backlink/")) {
      backlinkCallCount += 1;
      if (shouldFailBacklinkCheck) {
        throw new Error("temporary DNS failure");
      }
      return new Response(articleHtml("목표 역링크", ["시작"]), {
        headers: { "Content-Type": "text/html" }
      });
    }

    const encodedTitle = href.split("/w/")[1] || "";
    const title = decodeURIComponent(encodedTitle);
    return new Response(articleHtml(title, title === "시작" ? ["목표"] : ["시작"]), {
      headers: { "Content-Type": "text/html" }
    });
  };

  try {
    const moduleUrl = new URL(`../src/game.js?specified-backlink-failure=${Date.now()}`, import.meta.url);
    const { createRound } = await import(moduleUrl.href);

    await assert.rejects(
      createRound({ startTitle: "시작", goalTitle: "목표" }),
      (error) => (
        error.statusCode === 502 &&
        error.message === "목표 문서 \"목표\"의 역링크를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."
      )
    );

    shouldFailBacklinkCheck = false;
    const created = await createRound({ startTitle: "시작", goalTitle: "목표" });

    assert.equal(created.round.goalTitle, "목표");
    assert.equal(backlinkCallCount, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
