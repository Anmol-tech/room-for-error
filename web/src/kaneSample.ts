// SAMPLE DATA, not real Kane output. Real Kane runs are built on event day (hackathon rule) and
// will replace this module with data from the server. Until then the Director View shows this
// recorded-style sample for the museum mission so the layout can be judged, and labels it "Sample".

export type RouteState = "passed" | "failed" | "running" | "outdated" | "queued";
export type PlayerKaneState = "testing" | "repairing" | "passed" | "delayed";

export interface RouteRun {
  routeId: string;
  label: string;
  state: RouteState;
  version: number;
  note: string;
}

export interface TimelineEvent {
  at: string;
  kind: "kane" | "director" | "validator" | "fail" | "pass";
  title: string;
  /** Spoiler-bearing evidence, shown only after the reveal. */
  evidence?: string;
}

export interface RepairRow {
  field: string;
  before: string;
  after: string;
}

export interface KaneFeed {
  sample: true;
  playableVersion: number;
  testedVersion: number;
  latestRepair: string;
  player: PlayerKaneState;
  routes: RouteRun[];
  timeline: TimelineEvent[];
  repair: RepairRow[];
}

const MUSEUM: KaneFeed = {
  sample: true,
  playableVersion: 2,
  testedVersion: 3,
  latestRepair: "21:14:52",
  player: "passed",
  routes: [
    { routeId: "rooftop", label: "Route A · Main exit", state: "outdated", version: 2, note: "Failed at the archive terminal" },
    { routeId: "rooftop", label: "Route A · Main exit", state: "passed", version: 3, note: "Rerun on the repaired version" },
    { routeId: "service", label: "Route B · Alternate exit", state: "running", version: 3, note: "Rerun in progress" },
  ],
  timeline: [
    { at: "21:13:40", kind: "kane", title: "Kane started Route A on version 2", evidence: "Preview session, starting state: Lobby, empty inventory." },
    { at: "21:13:58", kind: "kane", title: "Kane read the note on the curator's desk", evidence: "Note text: \"Archive terminal: 4471. Don't forget again!\"" },
    { at: "21:14:21", kind: "kane", title: "Kane reached the archive terminal" },
    { at: "21:14:27", kind: "fail", title: "Code rejected", evidence: "Kane entered 4471 as the note said. The terminal answered ACCESS DENIED." },
    { at: "21:14:44", kind: "director", title: "Director updated the clue", evidence: "The note now gives the code the terminal expects. Route objectives were not changed." },
    { at: "21:14:52", kind: "validator", title: "Validator passed version 3" },
    { at: "21:15:03", kind: "kane", title: "Kane started a new preview session on version 3" },
    { at: "21:15:49", kind: "pass", title: "Route A passed on version 3", evidence: "Ending reached: Rooftop Escape. Badge still in inventory." },
    { at: "21:15:50", kind: "kane", title: "Kane started Route B on version 3" },
  ],
  repair: [
    { field: "Notebook clue", before: "4471", after: "4417" },
    { field: "Expected code", before: "4417", after: "4417" },
    { field: "Verification", before: "Failed on version 2", after: "Passed on version 3" },
  ],
};

export function kaneSample(scenarioId: string): KaneFeed | null {
  return scenarioId === "museum" ? MUSEUM : null;
}

export const PLAYER_COPY: Record<PlayerKaneState, string> = {
  testing: "Checking the route ahead",
  repairing: "Preparing the next passage",
  passed: "Route ready",
  delayed: "This passage needs a little longer",
};
