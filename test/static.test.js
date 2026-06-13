import test from "node:test";
import assert from "node:assert/strict";
import { serveStatic } from "../src/static.js";

function createResponseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: Buffer.alloc(0),
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(data) {
      this.body = Buffer.isBuffer(data) ? data : Buffer.from(String(data || ""));
    }
  };
}

test("serves the app entry point", async () => {
  const response = createResponseRecorder();

  await serveStatic(new URL("https://example.com/"), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(response.body.toString("utf8"), /<html/i);
});

test("injects share metadata for route links", async () => {
  const response = createResponseRecorder();

  await serveStatic(new URL("https://example.com/?start=나흐체르르%20킹&goal=고스트"), response);

  const html = response.body.toString("utf8");
  assert.match(html, /<meta property="og:title" content="나흐체르르 킹 → 고스트 \| 나무위키 게임" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/example.com\/\?start=/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
});

test("rejects static paths outside the public directory", async () => {
  await assert.rejects(
    serveStatic("/../server.js", createResponseRecorder()),
    (error) => error.statusCode === 403
  );
});
