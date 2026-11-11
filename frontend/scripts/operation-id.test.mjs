import assert from "node:assert/strict";
import test from "node:test";

import { createOperationId } from "../src/lib/operationId.ts";

test("creates an RFC 4122 v4 operation ID when randomUUID is unavailable", () => {
  const insecureContextCrypto = {
    getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
  };

  const operationId = createOperationId(insecureContextCrypto);

  assert.match(
    operationId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test("prefers the platform randomUUID implementation when it exists", () => {
  const expected = "40f03aa7-d704-497e-96a4-1c88f35243aa";
  const secureContextCrypto = {
    randomUUID: () => expected,
    getRandomValues: () => {
      throw new Error("getRandomValues should not be used when randomUUID exists");
    },
  };

  assert.equal(createOperationId(secureContextCrypto), expected);
});
