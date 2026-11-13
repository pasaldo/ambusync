import assert from "node:assert/strict";
import test from "node:test";
import { partitionTriageQueue, rectificationDescription, cancellationLabel } from "../src/screens/local/queuePresentation.ts";

test("cancellation label distinguishes confirmed destination replacement from ordinary cancellation", () => {
  assert.equal(cancellationLabel({ status: "cancelada", replaced_by_id: "synthetic-replacement" }), "Cancelado por cambio de destino");
  for (const replaced_by_id of [null, undefined, ""]) assert.equal(cancellationLabel({ status: "cancelada", replaced_by_id }), "Cancelado");
  assert.equal(cancellationLabel({ status: "en_traslado", replaced_by_id: "synthetic-replacement" }), "Cancelado");
});

test("D007 orders classified by triage then oldest instant, not transport state", () => {
  const rows = [
    { id: "new", triage: "C2", status: "en_traslado", created_at: "2026-11-13T12:00:00Z" },
    { id: "first", triage: "C1", status: "llegado", created_at: "2026-11-13T13:00:00Z" },
    { id: "old", triage: "C2", status: "notificada", created_at: "2026-11-13T08:00:00-03:00" },
    { id: "last", triage: "C5", status: "en_traslado", created_at: "2025-01-01T12:00:00Z" },
    { id: "pending", triage: null, created_at: "2025-01-01T12:00:00Z" },
  ];
  const original = [...rows];
  const result = partitionTriageQueue(rows);
  assert.deepEqual(result.classified.map((item) => item.id), ["first", "old", "new", "last"]);
  assert.deepEqual(result.unclassified.map((item) => item.id), ["pending"]);
  assert.deepEqual(rows, original, "presentation cannot mutate API data");
});

test("ties use stable ID and missing/unrecognized categories remain separate from C5", () => {
  const rows = ["b", "a"].map((id) => ({ id, triage: "C1", created_at: "2026-11-13T12:00:00Z" }));
  const missing = [null, "", "unexpected"].map((triage, index) => ({ id: String(index), triage, created_at: "2026-11-13T12:00:00Z" }));
  const result = partitionTriageQueue([...rows, ...missing]);
  assert.deepEqual(result.classified.map((item) => item.id), ["a", "b"]);
  assert.equal(result.unclassified.length, 3);
});

test("rectification labels the replacement value separately from its record ID", () => {
  const original = { id: "44", value: 65, unit: "lpm", rectified_by_id: "45", is_current: false };
  const replacement = { id: "45", value: 75, unit: "lpm", rectifies_id: "44", rectified_by_id: "46", is_current: false };
  assert.equal(rectificationDescription(original, [original, replacement]), "Rectificada: reemplazo de 75 lpm (medición #45).");
  assert.equal(rectificationDescription(original, [original]), "Rectificada: reemplazo en medición #45; valor no disponible en este historial.");
  assert.equal(rectificationDescription({ id: "46", is_current: true }, []), null);
});
