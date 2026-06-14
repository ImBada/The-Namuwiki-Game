import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleRequest } from "../server.js";

function createRequest(method, url) {
  const request = Readable.from([]);
  request.method = method;
  request.url = url;
  request.headers = {
    host: "example.com"
  };
  return request;
}

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

test("returns 404 for missing assets without rejecting the request handler", async () => {
  const response = createResponseRecorder();

  await assert.doesNotReject(
    handleRequest(createRequest("GET", "/favicon.ico"), response)
  );

  assert.equal(response.statusCode, 404);
  assert.equal(response.headers["Content-Type"], "application/json; charset=utf-8");
  assert.deepEqual(JSON.parse(response.body.toString("utf8")), {
    error: "Not found"
  });
});
