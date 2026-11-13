import assert from "node:assert/strict";
import test from "node:test";
import { isDestinationChangeResult } from "../src/lib/destinationChangeResult.ts";

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
