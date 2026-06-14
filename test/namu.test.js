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

test("treats absolute NamuWiki article URLs as playable internal links", () => {
  const source = `
    <a href="https://namu.wiki/w/%EC%84%B8%ED%82%A4%EB%A0%88%EC%9D%B4">절대 링크</a>
    <a href="//namu.wiki/w/%EC%95%84%EC%8B%9C%EC%B9%B4%EB%B9%84">프로토콜 생략 링크</a>
    <a href="https://example.com/w/%EC%99%B8%EB%B6%80">외부 링크</a>
  `;

  const links = extractInternalLinks(source, "히가 이즈미");
  assert.deepEqual(
    links.map((link) => link.title),
    ["세키레이", "아시카비"]
  );

  const html = sanitizeArticleHtml(source, "히가 이즈미");
  assert.match(html, /data-game-title="세키레이"/);
  assert.match(html, /data-game-title="아시카비"/);
  assert.match(html, /wiki-link-external-disabled/);
  assert.doesNotMatch(html, /data-disabled-href="https:\/\/namu\.wiki\/w\//);
});

test("rewrites internal links when href has surrounding spaces", () => {
  const source = `
    <a class="wiki-link-internal" href = "/w/%ED%95%9C%EA%B8%80">한글</a>
    <a href = "https://namu.wiki/w/%EC%9D%B8%ED%84%B0%EB%84%B7">인터넷</a>
  `;

  const links = extractInternalLinks(source, "현재");
  assert.deepEqual(
    links.map((link) => link.title),
    ["인터넷", "한글"]
  );

  const html = sanitizeArticleHtml(source, "현재");
  assert.match(html, /data-game-title="한글"/);
  assert.match(html, /data-game-title="인터넷"/);
});

test("promotes NamuWiki lazy images without keeping loading-only classes", () => {
  const html = sanitizeArticleHtml(`
    <span class="HuBzh58z" style="width:20px;">
      <span class="YHi307Mf" style="width: 100%;">
        <img class="LhxTIpX9 DeArQah4" width="100%" src="data:image/svg+xml;base64,placeholder" data-src="//i.namu.wiki/i/road.svg" alt="road">
      </span>
    </span>
  `);

  assert.match(html, /src="https:\/\/i\.namu\.wiki\/i\/road\.svg"/);
  assert.match(html, /class="LhxTIpX9"/);
  assert.doesNotMatch(html, /DeArQah4|wiki-image-loading/);
});

test("removes dangerous article tags and unsafe URL attributes", () => {
  const html = sanitizeArticleHtml(`
    <div>
      안전한 본문
      <object data="https://example.com/payload.swf"><param name="movie" value="x"></object>
      <embed src="https://example.com/payload.swf">
      <svg><a xlink:href="javascript:alert(1)"><text>svg payload</text></a></svg>
      <math><mtext>math payload</mtext></math>
      <video poster="https://example.com/poster.png"><source src="https://example.com/movie.mp4"></video>
      <link rel="stylesheet" href="https://example.com/payload.css">
      <meta http-equiv="refresh" content="0;javascript:alert(1)">
      <base href="https://example.com/">
      <img src="javascript:alert(1)" data-src="data:image/svg+xml;base64,placeholder">
      <img src="//evil.example/bad.png">
      <img src="//i.namu.wiki/i/safe.png" alt="safe">
    </div>
  `);

  assert.match(html, /안전한 본문/);
  assert.match(html, /src="https:\/\/i\.namu\.wiki\/i\/safe\.png"/);
  assert.doesNotMatch(html, /<(?:object|embed|svg|math|video|source|link|meta|base)\b/i);
  assert.doesNotMatch(html, /javascript:|data:image|xlink:href|evil\.example|svg payload|math payload/i);
});

test("keeps safe inline styles while dropping dangerous CSS and href schemes", () => {
  const html = sanitizeArticleHtml(`
    <span style="color: red; background-image: url(javascript:alert(1)); width: calc(100% - 1px); border-image: java
script:alert(1); behavior:url(#x); -moz-binding:url(x)">스타일</span>
    <a href="javascript:alert(1)">위험 링크</a>
    <a href="#s-2" style="color: green">목차</a>
  `);

  assert.match(html, /style="color: red; width: calc\(100% - 1px\)"/);
  assert.match(html, /href="#s-2"/);
  assert.match(html, /style="color: green"/);
  assert.doesNotMatch(html, /java\s*script\s*:|data:image|url\(|expression\s*\(|behavior\s*:|-moz-binding|data-disabled-href/i);
});

test("keeps safe template layout styles while constraining display and backgrounds", () => {
  const html = sanitizeArticleHtml(`
    <div style="display:flex; background:#42b4e6; color:#fff">상단 틀</div>
    <div style="display:inline-table; background:transparent; width:16.29%">멤버</div>
    <div style="display:inline-block; background-image:linear-gradient(to bottom, transparent 45%, #fff 45%, #fff 55%, transparent 55%)">구분선</div>
    <div style="display:none; background:url(javascript:alert(1)); background-image:url(https://example.com/x.png)">위험</div>
  `);

  assert.match(html, /style="display:flex; background:#42b4e6; color:#fff"/);
  assert.match(html, /style="display:inline-table; background:transparent; width:16.29%"/);
  assert.match(html, /style="display:inline-block; background-image:linear-gradient\(to bottom, transparent 45%, #fff 45%, #fff 55%, transparent 55%\)"/);
  assert.match(html, /<div>위험<\/div>/);
  assert.doesNotMatch(html, /display:none|url\(|javascript|example\.com/i);
});

test("allows only safe article style properties", () => {
  const html = sanitizeArticleHtml(`
    <div style="position: fixed; z-index: 9999; inset: 0; top: 0; left: 0; pointer-events: auto; transform: translateX(1px); margin-top: -10000px; margin-left: calc(0px - 10000px); width: 80%; max-width: 640px; min-height: 100vh; height: 100v\\68; width: 100v\\77; color: #123456; background-color: rgb(255, 255, 255); text-align: center; vertical-align: top; border: 1px solid #ccc; border-collapse: collapse">안전 스타일</div>
    <span style="position: sticky; bottom: 0; display: block">위험 스타일</span>
  `);

  assert.match(
    html,
    /style="width: 80%; max-width: 640px; color: #123456; background-color: rgb\(255, 255, 255\); text-align: center; vertical-align: top; border: 1px solid #ccc; border-collapse: collapse"/
  );
  assert.match(html, /<span style="display: block">위험 스타일<\/span>/);
  assert.doesNotMatch(
    html,
    /position|z-index|inset|top:|left:|bottom:|pointer-events|transform|fixed|sticky|margin-top|margin-left|-10000|100vh|100vw|100v\\(?:68|77)/i
  );
});

test("does not allow source HTML to forge playable link runtime attributes", () => {
  const html = sanitizeArticleHtml(`
    <a class="game-wiki-link wiki-link-disabled" data-game-title="가짜" href="#s-1">가짜 링크</a>
    <a class="game&#45;wiki-link" data-game-title="가짜" href="#s-2">엔티티 링크</a>
    <a class=game-wiki-link data-game-title="가짜" href="/w/%EC%A7%84%EC%A7%9C">진짜 링크</a>
  `);

  assert.match(html, /<a href="#s-1">가짜 링크<\/a>/);
  assert.match(html, /<a href="#s-2">엔티티 링크<\/a>/);
  assert.match(html, /data-game-title="진짜"/);
  assert.match(html, /class="game-wiki-link"/);
  assert.doesNotMatch(html, /data-game-title="가짜"|wiki-link-disabled/);
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

test("extracts the full article body from the newer NamuWiki content wrapper", () => {
  const html = `
    <main>
      <nav><a href="/w/%EC%B5%9C%EA%B7%BC%20%EB%B3%80%EA%B2%BD">최근 변경</a></nav>
      <div class="vbcUYWuj"><h1>히가 이즈미</h1></div>
      <div class="M2i3kfto fcJpnsCI">
        <div class="wiki-paragraph"><a href="/w/%EC%84%B8%ED%82%A4%EB%A0%88%EC%9D%B4">세키레이</a> 사방 아시카비</div>
        <h2 id="s-1">1. 개요</h2>
        <div class="wiki-paragraph">만화 <a href="/w/%EC%84%B8%ED%82%A4%EB%A0%88%EC%9D%B4">세키레이</a>의 등장인물.</div>
        <h2 id="s-2">2. 작중 행적</h2>
        <div class="wiki-paragraph"><a href="/w/%EC%95%84%EC%8B%9C%EC%B9%B4%EB%B9%84">아시카비</a>로서 등장한다.</div>
      </div>
      <script>window.__NUXT__ = "large payload";</script>
    </main>
  `;

  const articleHtml = extractPlayableArticleHtml(html, "히가 이즈미");
  assert.match(articleHtml, /1\. 개요/);
  assert.match(articleHtml, /2\. 작중 행적/);
  assert.match(articleHtml, /data-game-title="세키레이"/);
  assert.match(articleHtml, /data-game-title="아시카비"/);
  assert.doesNotMatch(articleHtml, /최근 변경|large payload|<h1>히가 이즈미/);
});

test("extracts article bodies by stable wiki markers instead of generated skin classes", () => {
  const html = `
    <main>
      <div class="top-shell"><h1>히가 이즈미</h1></div>
      <div class="generated-wrapper-a generated-wrapper-b">
        <div class="generated-content-block">
          <div class="wiki-paragraph"><a href="/w/%EC%84%B8%ED%82%A4%EB%A0%88%EC%9D%B4">세키레이</a> 사방 아시카비</div>
          <div class="wiki-macro-toc"><span class="toc-item"><a href="#s-1">1</a>. 개요</span></div>
        </div>
        <h2 class="wiki-heading" id="s-1">1. 개요</h2>
        <div class="wiki-paragraph">만화 세키레이의 등장인물.</div>
      </div>
      <footer>footer</footer>
    </main>
  `;

  const articleHtml = extractPlayableArticleHtml(html, "히가 이즈미");
  assert.match(articleHtml, /1\. 개요/);
  assert.match(articleHtml, /만화 세키레이의 등장인물/);
  assert.match(articleHtml, /data-game-title="세키레이"/);
  assert.doesNotMatch(articleHtml, /top-shell|footer/);
});

test("keeps category boxes when structural markers are inside a nested article block", () => {
  const html = `
    <main>
      <nav><a href="/w/%EC%B5%9C%EA%B7%BC%20%EB%B3%80%EA%B2%BD">최근 변경</a></nav>
      <div class="generated-article-wrapper">
        <div class="generated-page-actions">
          <a href="/edit/%ED%9E%88%EA%B0%80%20%EC%9D%B4%EC%A6%88%EB%AF%B8">편집</a>
          <img src="/skins/espejo/logo.png" alt="나무위키">
        </div>
        <div class="generated-category-box">
          <span>분류</span>
          <ul><li><a href="/w/%EB%B6%84%EB%A5%98:%EC%84%B8%ED%82%A4%EB%A0%88%EC%9D%B4">세키레이</a></li></ul>
        </div>
        <div class="generated-content-block">
          <div class="wiki-paragraph"><a href="/w/%EC%84%B8%ED%82%A4%EB%A0%88%EC%9D%B4">세키레이</a> 사방 아시카비</div>
          <div class="wiki-macro-toc"><span class="toc-item"><a href="#s-1">1</a>. 개요</span></div>
          <h2 class="wiki-heading" id="s-1">1. 개요</h2>
          <div class="wiki-paragraph">만화 세키레이의 등장인물.</div>
        </div>
      </div>
      <footer>footer</footer>
    </main>
  `;

  const articleHtml = extractPlayableArticleHtml(html, "히가 이즈미");
  assert.match(articleHtml, />분류</);
  assert.match(articleHtml, /data-disabled-title="분류:세키레이"/);
  assert.match(articleHtml, /1\. 개요/);
  assert.doesNotMatch(articleHtml, /최근 변경|편집|나무위키|logo\.png|footer/);
});

test("removes trailing NamuWiki license and footer chrome from extracted article bodies", () => {
  const html = `
    <main>
      <div class="generated-article-wrapper">
        <div class="generated-category-box">
          <span>분류</span>
          <ul><li><a href="/w/%EB%B6%84%EB%A5%98:%EC%98%81%EC%96%B4%20%EB%8B%A8%EC%96%B4">영어 단어</a></li></ul>
        </div>
        <div class="generated-content-block">
          <div class="wiki-paragraph">break의 과거분사형.</div>
          <h2 class="wiki-heading" id="s-1">1. break의 과거분사형</h2>
          <div class="wiki-paragraph"><a href="/w/BEMANI">BEMANI</a> 시리즈의 수록곡.</div>
        </div>
        <div class="generated-footer">
          <p>이 저작물은 CC BY-NC-SA 2.0 KR에 따라 이용할 수 있습니다.</p>
          <ul><li>namu.wiki</li><li>Operado por umanle S.R.L.</li></ul>
          <p>This site is protected by reCAPTCHA and hCaptcha.</p>
        </div>
        <div class="generated-floating-buttons">맨 위로 맨 아래로</div>
      </div>
    </main>
  `;

  const articleHtml = extractPlayableArticleHtml(html, "Broken");
  assert.match(articleHtml, />분류</);
  assert.match(articleHtml, /break의 과거분사형/);
  assert.match(articleHtml, /data-game-title="BEMANI"/);
  assert.doesNotMatch(articleHtml, /CC BY-NC-SA|Operado por umanle|reCAPTCHA|hCaptcha|맨 위로|맨 아래로/);
});

test("does not trim ordinary article text that only mentions works", () => {
  const html = `
    <main>
      <div class="generated-article-wrapper">
        <div class="generated-content-block">
          <div class="wiki-paragraph">이 저작물은 게임 안에서 중요한 단서로 등장한다.</div>
          <h2 class="wiki-heading" id="s-1">1. 개요</h2>
          <div class="wiki-paragraph"><a href="/w/%EA%B2%8C%EC%9E%84">게임</a> 관련 본문은 계속 보여야 한다.</div>
        </div>
      </div>
    </main>
  `;

  const articleHtml = extractPlayableArticleHtml(html, "예시");
  assert.match(articleHtml, /이 저작물은 게임 안에서 중요한 단서/);
  assert.match(articleHtml, /관련 본문은 계속 보여야 한다/);
  assert.match(articleHtml, /data-game-title="게임"/);
});
