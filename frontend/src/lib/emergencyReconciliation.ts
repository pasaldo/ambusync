import type { BackendEmergency } from "./backend";

export function preserveNewerEmergencyVersions(
  current: BackendEmergency[],
  incoming: BackendEmergency[],
): BackendEmergency[] {
  const currentById = new Map(current.map((emergency) => [emergency.id, emergency]));
  return incoming.map((emergency) => {
    const previous = currentById.get(emergency.id);
    return previous && previous.version > emergency.version ? previous : emergency;
  });
}
