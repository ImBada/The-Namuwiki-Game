# Goal Balancing Rules

목표 문서는 무작위 라운드가 너무 허무하거나 불공정해지지 않도록 아래 기준으로 고른다.

## Random Goal Hard Reject

- 시작 문서와 같은 제목은 사용할 수 없다.
  - `createRound()`, `pickArticleCandidate()`, `sameTitle()`
- 나무위키 일반 문서가 아닌 네임스페이스 문서는 사용할 수 없다.
  - `scoreArticleQuality()`, `isPlayableArticleTitle()`
- 목표 문서에 역링크가 없으면 사용할 수 없다.
  - `pickArticleCandidate()`, `articleHasBacklinks()`
- 제목에 `/`가 들어간 하위 문서는 목표로 사용할 수 없다.
  - `scoreArticleQuality()`
- 제목이 한 글자 한자인 문서는 목표로 사용할 수 없다. 예: `凪`
  - `scoreArticleQuality()`, `isSingleHanCharacterTitle()`

## Random Goal Quality

무작위 목표 후보는 기본적으로 본문 링크가 4개 이상이어야 한다.

아래 조건은 점수를 낮춘다. 점수가 낮아지면 후보를 버리고 다시 뽑는다.

- 제목이 너무 짧거나 길다. `scoreArticleQuality()`
- 설명이 너무 짧다. `scoreArticleQuality()`
- 링크가 너무 적거나 지나치게 많다. `scoreArticleQuality()`
- 제목이나 링크에 민감한 주제가 포함된다. `scoreArticleQuality()`, `sensitiveTerms`
- `일람`, `목록`, `등장인물`, `에피소드` 같은 색인형 문서다. `scoreArticleQuality()`
- 흔한 하위 문서 패턴이다. 예: `/등장인물`, `/에피소드`, `/목록` `scoreArticleQuality()`

## Specified Goal

사용자가 직접 지정한 목표도 아래 제한은 그대로 적용한다.

- 시작 문서와 같은 제목
  - `createRound()`, `sameTitle()`
- 한 글자 한자 제목
  - `createRound()`, `isSingleHanCharacterTitle()`
- 역링크가 없는 문서
  - `assertGoalArticleHasBacklinks()`, `articleHasBacklinks()`

그 외 품질 점수는 무작위 목표를 고를 때만 사용한다.
