import type { BackendUser } from "../../lib/backend";
import type { PendingOperation } from "../../lib/pendingOperation";
import { emptyDraft } from "./emergencyDraft.ts";
import type { ClinicalDraft } from "./clinicalUpdates.ts";
import type { ResourceAttempt } from "../../lib/resourceOperation";

/** Volatile, owner-scoped state. Never serialized to browser storage. */
export class PortalMemory {
  private owner: string | null = null;
  private revision = 0;
  private suspended = true;
  draft = emptyDraft();
  creation: PendingOperation | null = null;
  creationUncertain = false;
  transitions = new Map<string, PendingOperation>();
  uncertainTransitions: Record<string, PendingOperation> = {};
  episodeDrafts = new Map<string, ClinicalDraft>();
  patientContextDrafts = new Map<string, { version: number; unknown: boolean; alias: string; age: string; unit: string; sex: string; reason: string }>();
  destinationDrafts = new Map<string, { version: number; destinationId: string; reason: string }>();
  resourceAttempts = new Map<string, { attempt: ResourceAttempt; uncertain: boolean }>();
  resourceDrafts = new Map<string, { version: number; fields: Record<string, string | boolean> }>();

  get token(): number { return this.revision; }

  bind(user: BackendUser): boolean {
    const scope = JSON.stringify([
      user.id, [...user.groups].sort(), user.institutions.map((item) => item.id).sort(),
      user.ambulance?.id ?? null,
    ]);
    const changed = this.owner !== scope;
    if (changed) this.clear();
    if (this.suspended || changed) this.revision += 1;
    this.owner = scope;
    this.suspended = false;
    return changed;
  }

  isCurrent(token: number): boolean {
    return !this.suspended && this.owner !== null && token === this.revision;
  }

  suspend(): void {
    this.suspended = true;
    this.revision += 1;
    if (this.creation) this.creationUncertain = true;
    this.uncertainTransitions = Object.fromEntries(this.transitions);
    for (const entry of this.resourceAttempts.values()) entry.uncertain = true;
  }

  clear(): void {
    this.owner = null;
    this.suspended = true;
    this.revision += 1;
    this.draft = emptyDraft();
    this.creation = null;
    this.creationUncertain = false;
    this.transitions = new Map();
    this.uncertainTransitions = {};
    this.episodeDrafts = new Map();
    this.patientContextDrafts = new Map();
    this.destinationDrafts = new Map();
    this.resourceAttempts = new Map();
    this.resourceDrafts = new Map();
  }
}
