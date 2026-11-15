import assert from "node:assert/strict";
import test from "node:test";
import { haversineKm, positionAge, createGpsCapture } from "../src/lib/gps.ts";

test("Haversine handles zero coordinates, missing targets, antipodes and invalid numbers", () => {
  assert.equal(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
  assert.ok(Math.abs(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111.195) < 0.01);
  assert.ok(Math.abs(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }) - 20015.114) < 0.02);
  assert.equal(haversineKm(null, { latitude: 1, longitude: 1 }), null);
  assert.equal(haversineKm({ latitude: NaN, longitude: 2 }, { latitude: 1, longitude: 1 }), null);
});

test("freshness uses capture time and flags future or inconsistent clocks", () => {
  assert.deepEqual(positionAge({ captured_at: "2026-11-15T12:00:00Z", clock_consistent: true }, Date.parse("2026-11-15T12:00:31Z")), { seconds: 31, stale: true, inconsistent: false });
  assert.equal(positionAge({ captured_at: "2026-11-16T12:00:00Z", clock_consistent: false }, Date.parse("2026-11-15T12:00:00Z")).inconsistent, true);
});

test("stopping capture clears watch and invalidates callbacks even after restarting", () => {
  const watches = [], cleared = [], samples = [];
  const geo = { watchPosition(success, fail) { watches.push({ success, fail }); return watches.length; }, clearWatch(id) { cleared.push(id); } };
  const capture = createGpsCapture(geo, (p) => samples.push(p), () => {});
  capture.start();
  capture.stop();
  watches[0].success({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: Date.now() });
  assert.equal(samples.length, 0);
  capture.start();
  watches[0].success({ coords: { latitude: 9, longitude: 2, accuracy: 3 }, timestamp: Date.now() });
  watches[1].success({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: Date.now() });
  assert.equal(samples.length, 1);
  assert.equal(samples[0].latitude, 1);
  capture.stop();
  assert.deepEqual(cleared, [1, 2]);
});

function scheduler() {
  const jobs = new Map(); let next = 0;
  return {
    jobs, setInterval(fn, ms) { const id = ++next; jobs.set(id, { fn, ms }); return id; },
    clearInterval(id) { jobs.delete(id); },
    tick() { for (const { fn } of [...jobs.values()]) fn(); },
  };
}
const fix = (timestamp) => ({ coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp });

test("stationary GPS asks for a fresh fix every fifteen seconds without inventing capture time", () => {
  const timers = scheduler(), samples = [];
  let watch, now = 1000;
  const geo = {
    watchPosition(success) { watch = success; return 1; }, clearWatch() {},
    getCurrentPosition(success, _error, options) { success(fix(options.maximumAge === 0 ? now : 1000)); },
  };
  const capture = createGpsCapture(geo, (sample) => samples.push(sample), () => assert.fail("no GPS error"), { periodic: true, timers });
  capture.start(); watch(fix(1000));
  assert.equal(timers.jobs.size, 1);
  assert.equal([...timers.jobs.values()][0].ms, 15000);
  now = 16000; timers.tick();
  now = 31000; timers.tick();
  assert.deepEqual(samples.map((item) => item.captured_at), ["1970-01-01T00:00:01.000Z", "1970-01-01T00:00:16.000Z", "1970-01-01T00:00:31.000Z"]);
  capture.stop(); assert.equal(timers.jobs.size, 0);
});

test("periodic reads never overlap and late callbacks cannot survive stop or restart", () => {
  const timers = scheduler(), requests = [], samples = [], cleared = [];
  const geo = { watchPosition() { return 1; }, clearWatch(id) { cleared.push(id); }, getCurrentPosition(success, error) { requests.push({ success, error }); } };
  const capture = createGpsCapture(geo, (sample) => samples.push(sample), () => {}, { periodic: true, timers });
  capture.start(); timers.tick(); timers.tick();
  assert.equal(requests.length, 1);
  capture.stop(); capture.start();
  requests[0].success(fix(1000));
  assert.equal(samples.length, 0);
  timers.tick(); assert.equal(requests.length, 2);
  requests[1].success(fix(16000));
  assert.equal(samples.length, 1);
  capture.stop(); assert.equal(timers.jobs.size, 0);
  assert.deepEqual(cleared, [1, 1]);
});

test("provider returning the same old capture does not create a fresh-looking sample; errors stop polling", () => {
  const timers = scheduler(), samples = [], errors = [];
  let watch, reject = false;
  const geo = {
    watchPosition(success) { watch = success; return 1; }, clearWatch() {},
    getCurrentPosition(success, error) { if (reject) error({ code: 2 }); else success(fix(1000)); },
  };
  const capture = createGpsCapture(geo, (sample) => samples.push(sample), (message) => errors.push(message), { periodic: true, timers });
  capture.start(); watch(fix(1000)); timers.tick();
  assert.equal(samples.length, 1);
  reject = true; timers.tick();
  assert.equal(errors.length, 1); assert.equal(timers.jobs.size, 0);
  timers.tick(); assert.equal(errors.length, 1);
});

test("an immediate permission failure cannot leave a renewal timer or a registered watch behind", () => {
  const timers = scheduler(), errors = [], cleared = [];
  const geo = {
    watchPosition(_success, error) { error({ code: 1 }); return 7; },
    clearWatch(id) { cleared.push(id); },
    getCurrentPosition() { assert.fail("no acquisition after denied permission"); },
  };
  const capture = createGpsCapture(geo, () => assert.fail("no sample"), (message) => errors.push(message), { periodic: true, timers });
  capture.start();
  assert.equal(errors.length, 1);
  assert.equal(timers.jobs.size, 0);
  assert.deepEqual(cleared, [7]);
  capture.stop();
});
