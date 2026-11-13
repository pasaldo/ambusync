import assert from "node:assert/strict";
import test from "node:test";
import { isResourceResult } from "../src/lib/resourceOperation.ts";
import { prepareOperation } from "../src/lib/pendingOperation.ts";

const patient = { identity_unknown: false, alias: "Paciente sintético", age_value: 8, age_unit: "months", recorded_sex: null };
const update = { kind: "patient-update", targetId: "patient-g", operation: prepareOperation("/api/v1/patients/patient-g/update/", { expected_version: 1 }) };

test("resource proof requires exact target, version advance and complete master snapshot", () => {
  const valid = { id: "patient-g", enabled: true, version: 2, patient };
  assert.equal(isResourceResult(valid, update), true);
  for (const patch of [{ id: "alien" }, { version: 1 }, { patient: null }, { patient: { identity_unknown: false } }, { enabled: null }]) assert.equal(isResourceResult({ ...valid, ...patch }, update), false);
  assert.equal(isResourceResult({ ...valid, enabled: false, version: 4 }, update), true, "confirmed replay may reflect later deactivation");
});

test("deactivation proof is minimal but bound to patient; catalog proof also checks institution", () => {
  const deactivation = { kind: "patient-deactivate", targetId: "patient-g", operation: prepareOperation("/api/v1/emergencies/episode-g/patient-deactivate/", { expected_version: 1 }) };
  assert.equal(isResourceResult({ id: "patient-g", enabled: false, version: 2 }, deactivation), true);
  assert.equal(isResourceResult({ id: "patient-g", enabled: true, version: 2 }, deactivation), false);
  assert.equal(isResourceResult({ id: "episode-g", enabled: false, version: 2 }, deactivation), false);
  const symptom = { kind: "symptom-create", targetId: "", institutionId: "institution-g", operation: prepareOperation("/api/v1/institutions/symptoms/", { expected_version: 1, description: " Síntoma   sintético " }) };
  const result = { id: "new-symptom", enabled: true, version: 1, institution_id: "institution-g", description: "Síntoma sintético" };
  assert.equal(isResourceResult(result, symptom), true);
  assert.equal(isResourceResult({ ...result, institution_id: "foreign" }, symptom), false);
  assert.equal(isResourceResult({ ...result, description: "Otro síntoma" }, symptom), false);
});
