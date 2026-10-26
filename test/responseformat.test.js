import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

// Offline test: runs server.cjs against a local mock upstream to verify the optional
// responseFormat field and that legacy (format-less) requests are forwarded unchanged.

const SERVER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server.cjs");
const STRUCTURED_TEXT = JSON.stringify({ project: "{}", main: "class A {\n}", patch: "", turtle: "", doc: "it's" });

let upstream;
let proxy;
let proxyBase;
const received = [];

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function freePort() {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

before(async () => {
  upstream = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      received.push({ path: req.url, raw: body });
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.url.startsWith("/gemini")) {
        res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: STRUCTURED_TEXT }] } }] }));
      } else {
        res.end(JSON.stringify({ choices: [{ message: { content: STRUCTURED_TEXT } }] }));
      }
    });
  });
  const upstreamBase = `http://127.0.0.1:${await listen(upstream)}`;
  const port = await freePort();
  proxyBase = `http://127.0.0.1:${port}`;
  proxy = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      PORT: String(port),
      GEMINI_API_KEY: "test", GEMINI_URL: `${upstreamBase}/gemini`,
      GITHUB_TOKEN: "test", GH_URL: `${upstreamBase}/gh`
    },
    stdio: ["ignore", "pipe", "inherit"]
  });
  await new Promise((resolve, reject) => {
    proxy.stdout.on("data", (d) => { if (String(d).includes("running")) resolve(); });
    proxy.on("exit", (code) => reject(new Error(`proxy exited with ${code}`)));
  });
});

after(() => {
  proxy?.kill();
  upstream?.close();
});

async function post(urlPath, raw) {
  received.length = 0;
  const response = await fetch(`${proxyBase}${urlPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw
  });
  return { status: response.status, data: await response.json(), upstream: received[0] };
}

test("legacy Gemini request is forwarded byte-for-byte", async () => {
  const raw = '{ "contents": [ {"role":"user","parts":[{"text":"hi"}]} ] }';
  const { status, upstream: sent } = await post("/api/gemprompt", raw);
  assert.equal(status, 200);
  assert.equal(sent.raw, raw);
});

test("legacy OpenAI-style request keeps body and text unescaping", async () => {
  const raw = '{"model":"m","messages":[]}';
  const { data, upstream: sent } = await post("/api/ghprompt", raw);
  assert.equal(sent.raw, raw);
  assert.notEqual(data.text, STRUCTURED_TEXT);
  assert.ok(data.text.includes("class A {\n}"));
});

test("Gemini responseFormat is merged into generationConfig and stripped", async () => {
  const responseFormat = { responseMimeType: "application/json", responseSchema: { type: "OBJECT" } };
  const { status, data, upstream: sent } = await post("/api/gemprompt", JSON.stringify({
    contents: [], generationConfig: { temperature: 0.2 }, responseFormat
  }));
  assert.equal(status, 200);
  const forwarded = JSON.parse(sent.raw);
  assert.equal(forwarded.responseFormat, undefined);
  assert.deepEqual(forwarded.generationConfig, { temperature: 0.2, ...responseFormat });
  assert.deepEqual(JSON.parse(data.text), JSON.parse(STRUCTURED_TEXT));
});

test("OpenAI responseFormat becomes response_format and text is returned verbatim", async () => {
  const responseFormat = { type: "json_schema", json_schema: { name: "x", schema: { type: "object" } } };
  const { status, data, upstream: sent } = await post("/api/ghprompt", JSON.stringify({
    model: "m", messages: [], responseFormat
  }));
  assert.equal(status, 200);
  const forwarded = JSON.parse(sent.raw);
  assert.equal(forwarded.responseFormat, undefined);
  assert.deepEqual(forwarded.response_format, responseFormat);
  assert.equal(data.text, STRUCTURED_TEXT);
});

test("null responseFormat is stripped and treated as legacy", async () => {
  const { upstream: sent } = await post("/api/ghprompt", JSON.stringify({ model: "m", messages: [], responseFormat: null }));
  assert.deepEqual(JSON.parse(sent.raw), { model: "m", messages: [] });
});

test("non-object responseFormat is rejected with 400", async () => {
  const { status, data, upstream: sent } = await post("/api/gemprompt", JSON.stringify({ contents: [], responseFormat: "json" }));
  assert.equal(status, 400);
  assert.match(data.error, /responseFormat/);
  assert.equal(sent, undefined);
});
