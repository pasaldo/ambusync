import assert from "node:assert/strict";
import test from "node:test";

import { preserveNewerEmergencyVersions } from "../src/lib/emergencyReconciliation.ts";

const emergency = (version, status) => ({
  id: "40f03aa7-d704-497e-96a4-1c88f35243aa",
  version,
  status,
});

test("authoritative reconciliation accepts newer data without regressing versions", () => {
  const current = [emergency(4, "cerrada")];
  const incoming = [emergency(3, "llegado"), { ...emergency(1, "notificada"), id: "new" }];
  const result = preserveNewerEmergencyVersions(current, incoming);

  assert.equal(result[0], current[0]);
  assert.deepEqual(result[1], incoming[1]);
});

test("authoritative reconciliation adopts an advanced API version", () => {
  const incoming = [emergency(5, "cerrada")];
  assert.deepEqual(preserveNewerEmergencyVersions([emergency(4, "llegado")], incoming), incoming);
});
