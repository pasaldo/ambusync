import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const publicDir = new URL("../public/", import.meta.url);
async function exists(name) {
  try { await access(new URL(name, publicDir)); return true; } catch { return false; }
}

test("installable identity opens the authenticated entry and supplies actual PNG icons", async () => {
  assert.ok(await exists("manifest.webmanifest"), "installation manifest is missing");
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", publicDir), "utf8"));
  assert.equal(manifest.name, "AmbuSync");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}`);
    assert.ok(icon, `missing ${size}px icon`);
    const png = await readFile(new URL(`.${icon.src}`, publicDir));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

async function worker(fetch) {
  assert.ok(await exists("sw.js"), "service worker is missing");
  const handlers = new Map();
  const forbidden = () => { throw new Error("persistent storage or forced activation attempted"); };
  const self = {
    addEventListener(name, fn) { handlers.set(name, fn); },
    skipWaiting: forbidden, clients: { claim: forbidden },
  };
  vm.runInNewContext(await readFile(new URL("sw.js", publicDir), "utf8"), {
    self, fetch, Response, caches: new Proxy({}, { get: forbidden }),
    indexedDB: new Proxy({}, { get: forbidden }),
  });
  return handlers;
}

test("API, writes and assets are not intercepted, queued or persisted by the worker", async () => {
  const handlers = await worker(() => assert.fail("network interception outside navigation"));
  assert.deepEqual([...handlers.keys()], ["fetch"]);
  for (const request of [
    { method: "GET", mode: "cors", url: "https://example.test/api/v1/emergencies/" },
    { method: "POST", mode: "cors", url: "https://example.test/api/v1/emergencies/" },
    { method: "GET", mode: "no-cors", url: "https://example.test/assets/app.js" },
  ]) {
    handlers.get("fetch")({ request, respondWith: () => assert.fail("must stay outside worker") });
  }
});

test("navigation always fetches without HTTP cache and preserves real HTTP errors", async () => {
  const response = new Response("server denied", { status: 401 });
  const handlers = await worker(async (_request, options) => {
    assert.equal(options.cache, "no-store");
    return response;
  });
  let result;
  handlers.get("fetch")({ request: { mode: "navigate", method: "GET" }, respondWith(promise) { result = promise; } });
  assert.equal(await result, response);
});

test("failed navigation returns a generic 503 without revealing path, credentials or clinical shell", async () => {
  const handlers = await worker(async () => { throw new Error("network unavailable"); });
  let result;
  handlers.get("fetch")({ request: { mode: "navigate", method: "GET", url: "https://example.test/restablecer-cuenta#private-token" }, respondWith(promise) { result = promise; } });
  const response = await result;
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /Sin conexión/);
  assert.doesNotMatch(html, /private-token|restablecer|<script|id="root"/);
});
