import assert from "node:assert/strict";
import test from "node:test";
import { currentMeasurements, localMeasurementTime, reconcileClinicalDraft } from "../src/screens/local/clinicalUpdates.ts";

test("excludes rectified original even when its capture date is later than replacement", () => {
  const original = { id: "1", kind: "heart_rate", value: 70, measured_at: "2026-11-12T12:00:00Z", is_current: false, rectified_by_id: "2" };
  const replacement = { id: "2", kind: "heart_rate", value: 80, measured_at: "2026-11-12T10:00:00Z", is_current: true };
  assert.deepEqual(currentMeasurements([replacement, original]), [replacement]);
});

test("current chains sort chronologically with recording and numeric id as stable ties", () => {
  const measurements = ["10", "2"].map((id) => ({ id, measured_at: "2026-11-12T12:00:00Z", recorded_at: "2026-11-12T12:00:01Z", kind: "heart_rate", value: Number(id) }));
  assert.deepEqual(currentMeasurements(measurements).map((item) => item.id), ["2", "10"]);
});

test("editing a measurement preserves capture seconds and milliseconds", () => {
  assert.match(localMeasurementTime("2026-11-12T12:00:45.123Z"), /:45\.123$/);
});

test("a replay newer than the acknowledged next version does not silently rebase another form", () => {
  const draft = { version: 1, notes: "Sin enviar", value: "70" };
  const next = reconcileClinicalDraft(draft, { version: 3 }, "measurements", 1);
  assert.equal(next.version, 1);
  assert.equal(next.notes, "Sin enviar");
});
