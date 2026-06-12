import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readJsonBody } from "../src/http.js";

function requestFromString(value) {
  return Readable.from([Buffer.from(value)]);
}

function requestFromTextChunk(value) {
  return Readable.from([value]);
}

test("reads an empty JSON request body as an empty object", async () => {
  assert.deepEqual(await readJsonBody(Readable.from([])), {});
});

test("parses valid JSON request bodies", async () => {
  assert.deepEqual(await readJsonBody(requestFromString('{"title":"나무위키"}')), {
    title: "나무위키"
  });
});

test("parses string chunks in JSON request bodies", async () => {
  assert.deepEqual(await readJsonBody(requestFromTextChunk('{"ok":true}')), {
    ok: true
  });
});

test("rejects invalid JSON request bodies with a 400", async () => {
  await assert.rejects(
    readJsonBody(requestFromString("{not json")),
    (error) => error.statusCode === 400 && error.message === "Invalid JSON body"
  );
});

test("rejects oversized JSON request bodies with a 413", async () => {
  await assert.rejects(
    readJsonBody(requestFromString(`{"value":"${"x".repeat(65536)}"}`)),
    (error) => error.statusCode === 413 && error.message === "JSON body is too large"
  );
});
