import { createOperationId } from "./operationId.ts";

/** In-memory identity of one logical write, including its original version/time. */
export interface PendingOperation {
  readonly path: string;
  readonly body: string;
}

export function prepareOperation(path: string, values: Record<string, unknown>): PendingOperation {
  return Object.freeze({
    path,
    body: JSON.stringify({ ...values, operation_id: createOperationId() }),
  });
}
