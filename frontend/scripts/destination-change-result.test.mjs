import assert from "node:assert/strict";
import test from "node:test";
import { isDestinationChangeResult } from "../src/lib/destinationChangeResult.ts";
import { hasPatientContextOperation } from "../src/lib/patientContextProof.ts";

const sent = { expected_version: 3, destination_id: "hospital-b", reason: "Cambio sintético" };
function pair() {
  const common = { ambulance_id: "unit-f", operating_institution_id: "operator-f", ambulance_code: "SYN-F", patient: { identity_unknown: true, alias: null, age_value: null, age_unit: null, recorded_sex: null }, reason: "Motivo sintético", created_at: "2026-11-13T10:00:00Z", symptoms: [], vital_measurements: [] };
  return { original: { ...common, id: "old-f", version: 4, status: "cancelada", destination_id: "hospital-a", destination_name: "A sintético", replaced_by_id: "new-f", cancelled_at: "2026-11-13T11:00:00Z", cancelled_by_id: "operator-f", cancellation_reason: sent.reason }, replacement: { ...common, id: "new-f", replaces_id: "old-f", version: 1, status: "en_traslado", destination_id: "hospital-b", destination_name: "B sintético" } };
}

test("pair proof accepts current replacement states during exact replay, not just initial state", () => {
  for (const status of ["notificada", "en_traslado", "llegado", "cerrada", "cancelada"]) {
    const value = pair(); value.replacement.status = status; value.replacement.version = 5;
    assert.equal(isDestinationChangeResult(value, "old-f", sent), true);
  }
});

test("pair proof rejects partial, alien, broken link, unit/scope/destination or cancellation proof", () => {
  const mutations = [
    (v) => { delete v.replacement; }, (v) => { v.original.id = "alien"; }, (v) => { v.replacement.id = "old-f"; },
    (v) => { v.replacement.replaces_id = "alien"; }, (v) => { v.original.replaced_by_id = "alien"; },
    (v) => { v.original.version = 3; }, (v) => { v.original.status = "en_traslado"; },
    (v) => { v.original.cancelled_by_id = null; }, (v) => { v.original.cancelled_at = "not-a-date"; },
    (v) => { v.original.cancellation_reason = "Otro motivo"; }, (v) => { v.replacement.destination_id = "hospital-a"; },
    (v) => { v.replacement.ambulance_id = "foreign-unit"; }, (v) => { v.replacement.operating_institution_id = "foreign-operator"; },
    (v) => { v.replacement.patient = null; }, (v) => { v.replacement.version = 0; },
  ];
  for (const mutate of mutations) { const value = pair(); mutate(value); assert.equal(isDestinationChangeResult(value, "old-f", sent), false); }
  for (const value of [null, false, {}, pair().original]) assert.equal(isDestinationChangeResult(value, "old-f", sent), false);
});

test("pair proof rejects a different patient even when links, unit and destination match", () => {
  for (const patch of [{ identity_unknown: false }, { alias: "Otro paciente sintético" }, { age_value: 8, age_unit: "months" }, { recorded_sex: "F" }]) {
    const value = pair();
    value.replacement.patient = { ...value.original.patient, ...patch };
    assert.equal(isDestinationChangeResult(value, "old-f", sent), false);
  }
});

test("pair replay accepts only coherent replacement-local identification corrections", () => {
  const value = pair();
  const previous = structuredClone(value.original.patient);
  value.replacement.patient = { ...previous, identity_unknown: false, alias: "Identificación sintética corregida" };
  value.replacement.version = 3;
  value.replacement.patient_context_corrections = [{ id: "1", previous_patient: previous, corrected_patient: value.replacement.patient, reason: "Error de identificación", recorded_by_id: "actor-g", recorded_at: "2026-11-13T12:00:00Z", operation_id: "10000000-0000-4000-8000-000000000001", episode_version: 2 }];
  assert.equal(isDestinationChangeResult(value, "old-f", sent), true);
  for (const mutate of [
    (v) => { v.replacement.patient_context_corrections[0].previous_patient.alias = "Ajeno"; },
    (v) => { v.replacement.patient_context_corrections[0].corrected_patient = { ...v.replacement.patient, alias: "Ajeno" }; },
    (v) => { v.replacement.patient_context_corrections[0].episode_version = 9; },
    (v) => { v.replacement.patient_context_corrections[0].recorded_by_id = null; },
    (v) => { v.replacement.patient_context_corrections[0].recorded_at = "bad"; },
    (v) => { v.replacement.patient_context_corrections[0].operation_id = ""; },
  ]) { const copy = structuredClone(value); mutate(copy); assert.equal(isDestinationChangeResult(copy, "old-f", sent), false); }
});

test("episode correction proof binds UUID, acknowledged version, requested fields and current lineage", () => {
  const episode = pair().replacement;
  const previous = episode.patient;
  const sent = { operation_id: "10000000-0000-4000-8000-000000000001", expected_version: 1, patient_identity_unknown: false, patient_alias: "Caso sintético", age_value: 0, age_unit: "days", reason: "Corregir identificación" };
  episode.patient = { ...previous, identity_unknown: false, alias: "Caso sintético", age_value: 0, age_unit: "days" };
  episode.version = 2;
  episode.patient_context_corrections = [{ id: "1", previous_patient: previous, corrected_patient: structuredClone(episode.patient), reason: sent.reason, recorded_by_id: "actor", recorded_at: "2026-11-13T12:00:00Z", operation_id: sent.operation_id, episode_version: 2 }];
  assert.equal(hasPatientContextOperation(episode, sent), true);
  assert.equal(hasPatientContextOperation(episode, { ...sent, reason: `  ${sent.reason}  ` }), true);
  for (const extra of [{ operation_id: "10000000-0000-4000-8000-000000000002" }, { age_value: 1 }, { reason: "Otro motivo" }, { expected_version: 2 }]) assert.equal(hasPatientContextOperation(episode, { ...sent, ...extra }), false);
  const copy = structuredClone(episode); copy.patient.alias = "Otro";
  assert.equal(hasPatientContextOperation(copy, sent), false);
});
