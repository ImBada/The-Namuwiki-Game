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
