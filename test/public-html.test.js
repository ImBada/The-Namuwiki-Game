import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("public HTML does not repeat element ids", async () => {
  const html = await readFile(join(process.cwd(), "public", "index.html"), "utf8");
  const ids = [...html.matchAll(/\sid=(["'])([^"']+)\1/g)].map((match) => match[2]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

  assert.deepEqual(duplicates, []);
});

test("client blocks the browser find shortcut", async () => {
  const html = await readFile(join(process.cwd(), "public", "index.html"), "utf8");
  const script = await readFile(join(process.cwd(), "public", "app.js"), "utf8");
  const styles = await readFile(join(process.cwd(), "public", "styles.css"), "utf8");

  assert.match(html, /id="shortcutWarning"/);
  assert.match(html, /검색 기능은 사용할 수 없습니다\./);
  assert.match(script, /addEventListener\("keydown", blockBrowserFindShortcut, \{ capture: true \}\)/);
  assert.match(script, /showShortcutWarning\(\)/);
  assert.match(script, /SHORTCUT_WARNING_MS/);
  assert.match(script, /event\.preventDefault\(\)/);
  assert.match(script, /event\.stopPropagation\(\)/);
  assert.match(script, /event\.key\.toLowerCase\(\) === "f"/);
  assert.match(styles, /\.shortcut-warning/);
  assert.match(styles, /\.shortcut-warning\.is-visible/);
});

test("public HTML includes the round loading screen and instructions", async () => {
  const html = await readFile(join(process.cwd(), "public", "index.html"), "utf8");
  const script = await readFile(join(process.cwd(), "public", "app.js"), "utf8");
  const styles = await readFile(join(process.cwd(), "public", "styles.css"), "utf8");

  assert.match(html, /id="roundLoadingScreen"/);
  assert.match(html, /id="roundLoadingCountdown">3</);
  assert.match(html, /id="roundLoadingStartButton"/);
  assert.match(html, /문서를 불러오는 중입니다/);
  assert.match(html, /다음 플레이부턴 시간이 끝나면 자동으로 게임이 시작됩니다\./);
  assert.match(html, /목표 부분에 마우스를 대거나 클릭하면 해당 문서의 일부를 미리볼 수 있습니다\./);
  assert.match(html, /경로 부분에서 이전 경로 블록을 클릭하면 그 문서로 되돌아갈 수 있습니다\./);
  assert.match(html, /브라우저 Ctrl\/Cmd\+F 찾기는 사용할 수 없습니다\./);
  assert.match(script, /ROUND_LOADING_SEEN_STORAGE_KEY/);
  assert.match(script, /ROUND_LOADING_COUNTDOWN_SECONDS = 3/);
  assert.match(script, /startRoundWithLoading/);
  assert.match(script, /startRoundLoadingCountdown/);
  assert.match(script, /조금만 더 기다려주세요! 문서를 읽고 있습니다\./);
  assert.match(script, /startFirstRoundAfterLoading/);
  assert.match(styles, /\.round-loading-screen/);
  assert.match(styles, /\.round-loading-start-button/);
  assert.match(styles, /\.round-loading-tips/);
});
