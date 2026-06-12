import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeTitleFromPath,
  extractArticle,
  extractPlayableArticleHtml,
  extractInternalLinks,
  isPlayableArticleTitle,
  normalizeTitle,
  sanitizeArticleHtml
} from "../src/namu.js";

const sampleHtml = `
  <html>
    <head>
      <meta property="og:title" content="나무위키">
      <meta property="og:description" content="여러분이 가꾸어 나가는 지식의 나무">
      <meta property="og:image" content="//i.namu.wiki/i/example.svg">
      <link rel="canonical" href="https://namu.wiki/w/%EB%82%98%EB%AC%B4%EC%9C%84%ED%82%A4">
    </head>
    <body>
      <a class="wiki-link-internal" href="/w/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD">대한민국</a>
      <a class="wiki-link-internal" href="/w/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C#s-1">서울특별시</a>
      <a class="wiki-link-internal" href="/w/%EB%B6%84%EB%A5%98:%EB%82%98%EB%AC%B4%EC%9C%84%ED%82%A4">분류</a>
      <a class="wiki-link-internal" href="/w/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD">중복</a>
    </body>
  </html>
`;

test("normalizes titles", () => {
  assert.equal(normalizeTitle("  대한민국_역사  "), "대한민국 역사");
});

test("decodes title paths", () => {
  assert.equal(
    decodeTitleFromPath("%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C#s-1"),
    "서울특별시"
  );
  assert.equal(
    decodeTitleFromPath("%28%EC%A3%BC%29%ED%95%9C%EC%96%91?noredirect=1"),
    "(주)한양"
  );
});

test("filters playable article titles", () => {
  assert.equal(isPlayableArticleTitle("대한민국"), true);
  assert.equal(isPlayableArticleTitle("분류:나무위키"), false);
  assert.equal(isPlayableArticleTitle("파일:예시.png"), false);
});

test("extracts unique playable links", () => {
  const links = extractInternalLinks(sampleHtml, "나무위키");
  assert.deepEqual(
    links.map((link) => link.title),
    ["대한민국", "서울특별시"]
  );
});

test("extracts article metadata", () => {
  const article = extractArticle(sampleHtml);
  assert.equal(article.title, "나무위키");
  assert.equal(article.description, "여러분이 가꾸어 나가는 지식의 나무");
  assert.equal(article.imageUrl, "https://i.namu.wiki/i/example.svg");
  assert.equal(article.links.length, 2);
  assert.match(article.html, /data-game-title="대한민국"/);
});

test("extracts metadata when attributes are not in the usual order", () => {
  const article = extractArticle(`
    <meta content="순서 테스트" property="og:title">
    <meta content="속성 순서가 바뀌어도 읽히는 설명입니다." name="og:description">
    <link href="https://namu.wiki/w/%EC%88%9C%EC%84%9C%20%ED%85%8C%EC%8A%A4%ED%8A%B8" rel="canonical alternate">
  `);

  assert.equal(article.title, "순서 테스트");
  assert.equal(article.description, "속성 순서가 바뀌어도 읽히는 설명입니다.");
  assert.equal(article.canonicalUrl, "https://namu.wiki/w/%EC%88%9C%EC%84%9C%20%ED%85%8C%EC%8A%A4%ED%8A%B8");
});

test("normalizes relative OpenGraph image URLs", () => {
  const article = extractArticle(`
    <meta property="og:title" content="상대 이미지">
    <meta property="og:image" content="/img/apple_icon.png">
  `);

  assert.equal(article.imageUrl, "https://namu.wiki/img/apple_icon.png");
});

test("sanitizes article HTML and rewrites playable links", () => {
  const html = sanitizeArticleHtml(
    `
      <script>alert(1)</script>
      <a class="wiki-link-internal" onclick="bad()" href="/w/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD">대한민국</a>
      <a href="/w/%ED%8C%8C%EC%9D%BC:%EC%98%88%EC%8B%9C.png">파일</a>
      <a class="wiki-link-external" href="https://example.com/news">외부</a>
      <a href="/acl/%EB%82%98%EB%AC%B4%EC%9C%84%ED%82%A4">ACL</a>
      <a href="#s-1">목차</a>
      <div class="WU8NJg0C">&nbsp;</div>
      <img src="/img/example.png" onerror="bad()">
    `,
    "나무위키"
  );

  assert.doesNotMatch(html, /script|onclick|onerror/);
  assert.match(html, /href="#"/);
  assert.match(html, /data-game-title="대한민국"/);
  assert.match(html, /wiki-link-disabled/);
  assert.match(html, /wiki-link-external-disabled/);
  assert.match(html, /data-disabled-href="https:\/\/example\.com\/news"/);
  assert.match(html, /data-disabled-href="\/acl\/%EB%82%98%EB%AC%B4%EC%9C%84%ED%82%A4"/);
  assert.match(html, /href="#s-1"/);
  assert.doesNotMatch(html, /<a[^>]+href="https:\/\/example\.com\/news"/);
  assert.doesNotMatch(html, /<a[^>]+href="https:\/\/namu\.wiki\/acl\//);
  assert.match(html, /src="https:\/\/namu\.wiki\/img\/example\.png"/);
  assert.doesNotMatch(html, /WU8NJg0C|&nbsp;<\/div>/);
});

test("extracts the article body when a NamuWiki content container exists", () => {
  const html = `
    <main>
      <div class="noise"><a href="/w/%EC%9E%A1%EC%9D%8C">잡음</a></div>
      <div class="I5dX7KDP _7cFKdWbY">
        <div class="wiki-paragraph"><a href="/w/%ED%95%9C%EA%B8%80">한글</a></div>
      </div>
      <footer>footer</footer>
    </main>
  `;

  const articleHtml = extractPlayableArticleHtml(html, "현재");
  assert.match(articleHtml, /data-game-title="한글"/);
  assert.doesNotMatch(articleHtml, /잡음|footer/);
});

test("extracts the article body from the current NamuWiki skin content wrapper", () => {
  const html = `
    <main>
      <nav><a href="/w/%EC%B5%9C%EA%B7%BC%20%EB%B3%80%EA%B2%BD">최근 변경</a></nav>
      <div class="wL2ljWQc _2hRbcvxd">
        <div>한국 영화에 대해 서술한 문서.</div>
        <a href="/w/%EC%98%81%ED%99%94">영화</a>
      </div>
      <script>window.__NUXT__ = "large payload";</script>
    </main>
  `;

  const articleHtml = extractPlayableArticleHtml(html, "한국 영화");
  assert.match(articleHtml, /한국 영화에 대해 서술한 문서/);
  assert.match(articleHtml, /data-game-title="영화"/);
  assert.doesNotMatch(articleHtml, /최근 변경|large payload/);
});
