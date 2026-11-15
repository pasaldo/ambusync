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
