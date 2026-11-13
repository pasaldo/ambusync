import assert from "node:assert/strict";
import test from "node:test";
import { hasMilestoneProof } from "../src/lib/milestoneProof.ts";

test("milestone proof requires an actor and a parseable timezone-aware timestamp", () => {
  for (const at of ["2026-11-13T12:00:00Z", "2026-11-13T09:00:00-03:00"]) {
    assert.equal(hasMilestoneProof(at, "synthetic-reader"), true);
  }
  for (const [at, by] of [[null, null], ["2026-11-13T12:00:00Z", null], [null, "reader"], ["badZ", "reader"], ["2026-11-13T12:00:00", "reader"], ["2026-11-13T12:00:00Z", " "], [123, "reader"], ["2026-11-13T12:00:00Z", 123]]) {
    assert.equal(hasMilestoneProof(at, by), false);
  }
});
