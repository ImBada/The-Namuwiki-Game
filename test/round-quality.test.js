import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateDifficulty,
  scoreArticleQuality
} from "../server.js";

function article(title, linkTitles, description = "충분한 설명이 들어 있는 문서입니다.") {
  return {
    title,
    description,
    links: linkTitles.map((linkTitle) => ({ title: linkTitle }))
  };
}

test("scores healthy article candidates highly", () => {
  const quality = scoreArticleQuality(
    article("대한민국", ["서울특별시", "부산광역시", "역사", "정치", "경제", "문화"]),
    { minLinks: 4 }
  );

  assert.equal(quality.accepted, true);
  assert.equal(quality.score, 100);
});

test("penalizes namespace and sparse articles", () => {
  const quality = scoreArticleQuality(article("분류:예시", ["하나"], "짧음"), {
    minLinks: 8
  });

  assert.equal(quality.accepted, false);
  assert.ok(quality.reasons.includes("namespace"));
  assert.ok(quality.reasons.includes("few-links"));
});

test("rejects otherwise healthy articles below the minimum link count", () => {
  const quality = scoreArticleQuality(
    article("평범한 문서", ["하나", "둘", "셋", "넷"], "충분한 설명이 들어 있는 일반 문서입니다."),
    { minLinks: 6 }
  );

  assert.equal(quality.accepted, false);
  assert.ok(quality.reasons.includes("few-links"));
});

test("penalizes index-like subpages as goals", () => {
  const quality = scoreArticleQuality(
    article("챠오(잡지)/연재 작품 일람", [
      "작품",
      "잡지",
      "만화",
      "일본",
      "출판",
      "캐릭터",
      "연재",
      "목록"
    ]),
    { minLinks: 4, role: "goal" }
  );

  assert.equal(quality.accepted, false);
  assert.ok(quality.reasons.includes("goal-subpage"));
  assert.ok(quality.reasons.includes("goal-index-like"));
});

test("rejects slash subpages as goals even when the score is high", () => {
  const quality = scoreArticleQuality(
    article("나나미 마미/인간관계", [
      "하나",
      "둘",
      "셋",
      "넷",
      "다섯",
      "여섯",
      "일곱",
      "여덟",
      "아홉",
      "열",
      "열하나",
      "열둘",
      "열셋"
    ]),
    { minLinks: 4, role: "goal" }
  );

  assert.equal(quality.accepted, false);
  assert.ok(quality.reasons.includes("goal-subpage"));
});

test("penalizes sensitive random candidates", () => {
  const quality = scoreArticleQuality(
    article("예시 인물", [
      "대한민국",
      "게임",
      "성폭행",
      "컴퓨터",
      "음악",
      "영화",
      "축구",
      "서울특별시"
    ]),
    { minLinks: 6 }
  );

  assert.equal(quality.accepted, false);
  assert.ok(quality.reasons.includes("sensitive-topic"));
});

test("estimates lower difficulty for related articles", () => {
  const start = article("서울특별시", ["대한민국", "한강", "경기도", "부산광역시"]);
  const goal = article("부산광역시", ["대한민국", "한강", "경상남도"]);

  const difficulty = estimateDifficulty(start, goal);

  assert.equal(difficulty.sharedLinkCount, 2);
  assert.ok(difficulty.score < 65);
});
