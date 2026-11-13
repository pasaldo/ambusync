import assert from "node:assert/strict";
import { test } from "node:test";
import { PortalMemory } from "../src/screens/local/portalMemoryState.ts";
import { prepareOperation } from "../src/lib/pendingOperation.ts";

const user = {
  id: "synthetic-a", groups: ["ambulance", "institution_admin"],
  institutions: [{ id: "operator-a" }], ambulance: { id: "unit-a" },
};

test("pending operation captures nested values and keeps one UUID independently of later input edits", () => {
  const input = { expected_version: 1, vitals: { hr: 82, taken_at: "2026-11-12T12:00:00Z" } };
  const operation = prepareOperation("/api/v1/emergencies/", input);
  input.vitals.hr = 99;
  assert.equal(JSON.parse(operation.body).vitals.hr, 82);
  assert.equal(JSON.parse(operation.body).vitals.taken_at, "2026-11-12T12:00:00Z");
  assert.match(JSON.parse(operation.body).operation_id, /^[0-9a-f-]{36}$/i);
  assert.notEqual(JSON.parse(prepareOperation(operation.path, input).body).operation_id, JSON.parse(operation.body).operation_id);
  assert.throws(() => { operation.body = "{}"; }, TypeError);
});

test("suspending and rebinding the same scope preserves the draft but invalidates old callbacks", () => {
  const memory = new PortalMemory();
  memory.bind(user);
  const previous = memory.token;
  memory.draft.reason = "Dato sintético en memoria";
  memory.episodeDrafts.set("synthetic-episode", { version: 1, notes: "Antecedente sintético en memoria" });
  memory.destinationDrafts.set("synthetic-episode", { version: 1, destinationId: "synthetic-target", reason: "Cambio sintético" });
  memory.resourceDrafts.set("patient:synthetic", { version: 1, fields: { alias: "Paciente en memoria" } });
  memory.resourceAttempts.set("patient:synthetic", { attempt: { kind: "patient-update", targetId: "synthetic", operation: prepareOperation("/api/v1/patients/synthetic/update/", { expected_version: 1 }) }, uncertain: false });
  memory.creation = prepareOperation("/api/v1/emergencies/", { reason: "Dato sintético en memoria" });
  const body = memory.creation.body;
  memory.suspend();
  assert.equal(memory.isCurrent(previous), false);
  assert.equal(memory.bind(user), false);
  assert.equal(memory.draft.reason, "Dato sintético en memoria");
  assert.equal(memory.creation.body, body);
  assert.equal(memory.creationUncertain, true);
  assert.equal(memory.episodeDrafts.get("synthetic-episode").notes, "Antecedente sintético en memoria");
  assert.equal(memory.destinationDrafts.get("synthetic-episode").reason, "Cambio sintético");
  assert.equal(memory.resourceDrafts.get("patient:synthetic").fields.alias, "Paciente en memoria");
  assert.equal(memory.resourceAttempts.get("patient:synthetic").uncertain, true);
  assert.equal(memory.isCurrent(previous), false);
  assert.equal(memory.isCurrent(memory.token), true);
});

test("polling the same scope in another group order does not reset state or invalidate current work", () => {
  const memory = new PortalMemory();
  memory.bind(user);
  const token = memory.token;
  memory.draft.reason = "Borrador sintético";
  memory.bind({ ...user, groups: [...user.groups].reverse() });
  assert.equal(memory.draft.reason, "Borrador sintético");
  assert.equal(memory.isCurrent(token), true);
});

for (const [name, next] of [
  ["account", { ...user, id: "synthetic-b" }],
  ["unit", { ...user, ambulance: { id: "unit-b" } }],
  ["membership", { ...user, institutions: [{ id: "operator-b" }] }],
  ["permissions", { ...user, groups: ["urgencias"] }],
]) {
  test(`a ${name} change discards drafts and all pending writes`, () => {
    const memory = new PortalMemory();
    memory.bind(user);
    const token = memory.token;
    memory.draft.reason = "Borrador del ámbito anterior";
    memory.creation = prepareOperation("/api/v1/emergencies/", { reason: "Dato sintético" });
    memory.transitions.set("synthetic-episode", memory.creation);
    memory.episodeDrafts.set("synthetic-episode", { version: 1, notes: "No exponer en otro ámbito" });
    memory.destinationDrafts.set("synthetic-episode", { version: 1, destinationId: "synthetic-target", reason: "No exponer en otro ámbito" });
    memory.resourceDrafts.set("patient:synthetic", { version: 1, fields: { alias: "No exponer" } });
    memory.resourceAttempts.set("patient:synthetic", { attempt: { kind: "patient-update", targetId: "synthetic", operation: memory.creation }, uncertain: true });
    memory.suspend();
    memory.bind(next);
    assert.equal(memory.draft.reason, "");
    assert.equal(memory.creation, null);
    assert.equal(memory.transitions.size, 0);
    assert.equal(memory.episodeDrafts.size, 0);
    assert.equal(memory.destinationDrafts.size, 0);
    assert.equal(memory.resourceDrafts.size, 0);
    assert.equal(memory.resourceAttempts.size, 0);
    assert.deepEqual(memory.uncertainTransitions, {});
    assert.equal(memory.isCurrent(token), false);
  });
}

test("explicit clearing does not allow a same-account login to revive pending data", () => {
  const memory = new PortalMemory();
  memory.bind(user);
  memory.draft.reason = "Borrador sintético";
  memory.clear();
  memory.bind(user);
  assert.equal(memory.draft.reason, "");
  assert.equal(memory.creation, null);
});
