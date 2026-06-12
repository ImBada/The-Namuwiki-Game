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
