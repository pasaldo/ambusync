/** An event notification or a timestamp alone is not proof of human acknowledgement. */
export function hasMilestoneProof(at: unknown, by: unknown): at is string {
  return typeof at === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(at)
    && Number.isFinite(Date.parse(at)) && typeof by === "string" && by.trim().length > 0;
}
