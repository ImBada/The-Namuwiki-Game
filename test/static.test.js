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

  await serveStatic("/", response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/html; charset=utf-8");
  assert.match(response.body.toString("utf8"), /<html/i);
});

test("rejects static paths outside the public directory", async () => {
  await assert.rejects(
    serveStatic("/../server.js", createResponseRecorder()),
    (error) => error.statusCode === 403
  );
});
