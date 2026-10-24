// Shared contract between the game engine/UI (Person A) and the
// director/FLUX/Kane side (Person B). Change it only when both agree.
import { z } from "zod";

export type Id = string;

export const SceneStateSchema = z.object({
  id: z.string(),
  /** Prompt for FLUX: a full generation for the first state, an edit for the rest. */
  imagePrompt: z.string(),
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** First entry is the default scene state for the room. */
  sceneStates: z.array(SceneStateSchema).min(1),
});

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Consumable items are removed when an action lists them in effects.removeItems. */
  consumable: z.boolean(),
  /** A single emoji shown in the inventory. */
  icon: z.string().max(8).optional(),
});

export const RequirementsSchema = z.object({
  items: z.array(z.string()).optional(),
  flags: z.array(z.string()).optional(),
});

export const CodeInputSchema = z.object({
  kind: z.literal("code"),
  prompt: z.string(),
  answer: z.string(),
  failMessage: z.string(),
});

export const EffectsSchema = z.object({
  addItems: z.array(z.string()).optional(),
  removeItems: z.array(z.string()).optional(),
  setFlags: z.array(z.string()).optional(),
  moveTo: z.string().optional(),
  /** Scene state to switch to, in the room the player is in after moveTo. */
  sceneState: z.string().optional(),
  ending: z.string().optional(),
});

export const ActionSchema = z.object({
  /** Stable ID, rendered as data-action-id on the button. */
  id: z.string(),
  roomId: z.string(),
  /** Visible button text. Must be unique within a room. */
  label: z.string(),
  requires: RequirementsSchema.optional(),
  /** Shown when the player tries the action without meeting `requires`. */
  lockedMessage: z.string().optional(),
  /** If present, the player must type an answer before the effects apply. */
  input: CodeInputSchema.optional(),
  effects: EffectsSchema,
  /** Shown after the action succeeds. Clues live here as free text. */
  narrative: z.string(),
  /** Hide the action once it has succeeded (e.g. "Search desk"). */
  once: z.boolean().optional(),
});

export const EndingSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
});

export const IntendedSolutionSchema = z.object({
  routeId: z.string(),
  /** The ending this route must reach. */
  endingId: z.string(),
  /** Action IDs in order. Used by the validator; Kane only sees the objective. */
  steps: z.array(z.string()).min(1),
  /** Plain-English Kane objective, written from the player's point of view. */
  objective: z.string(),
});

export const ScenarioSchema = z.object({
  id: z.string(),
  /** Bumped on every repair. Kane results belong to exactly one version. */
  version: z.number().int(),
  theme: z.string(),
  title: z.string(),
  /** Shown to the player while the opening scene renders. */
  briefing: z.string(),
  startRoomId: z.string(),
  rooms: z.array(RoomSchema).min(1),
  items: z.array(ItemSchema),
  actions: z.array(ActionSchema).min(1),
  endings: z.array(EndingSchema).min(1),
  /** Source of Kane objectives. The repair step must never edit these. */
  intendedSolutions: z.array(IntendedSolutionSchema).min(1),
  /** Free-form notes, e.g. a deliberately planted demo defect. Not shown to players. */
  notes: z.string().optional(),
});

export type SceneState = z.infer<typeof SceneStateSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Requirements = z.infer<typeof RequirementsSchema>;
export type CodeInput = z.infer<typeof CodeInputSchema>;
export type Effects = z.infer<typeof EffectsSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Ending = z.infer<typeof EndingSchema>;
export type IntendedSolution = z.infer<typeof IntendedSolutionSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

export interface GameState {
  roomId: Id;
  inventory: Id[];
  flags: Id[];
  /** Current scene state per room, keyed by room ID. */
  sceneStates: Record<Id, Id>;
  /** Actions with once: true that have already succeeded. */
  usedActions: Id[];
  endingId?: Id;
}

/** off_route: Kane finished through a different exit than the route it was testing (not a game problem). */
export type KaneRunStatus = "queued" | "running" | "passed" | "failed" | "off_route" | "infra_error" | "cancelled";

export interface KaneStep {
  step: number;
  status: "running" | "done" | "failed";
  remark: string;
  at: string;
}

export interface KaneRun {
  id: Id;
  scenarioId: Id;
  scenarioVersion: number;
  routeId: Id;
  /** The ending this route must reach. */
  endingId: Id;
  objective: string;
  status: KaneRunStatus;
  exitCode: number | null;
  /** Kane's own short description of the run. */
  oneLiner: string | null;
  summary: string | null;
  /** Why the run stopped, from Kane or from the runner (timeouts, sign-in problems). */
  reason: string | null;
  steps: KaneStep[];
  credits: number | null;
  durationS: number | null;
  /** Test Manager link for the run, when Kane uploaded it. */
  testUrl: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** True for results recorded before the demo. The UI must label these. */
  prior: boolean;
}

/** One automatic repair: a failed Kane run on `fromVersion` produced `toVersion`. */
export interface Repair {
  id: Id;
  scenarioId: Id;
  routeId: Id;
  runId: Id;
  fromVersion: number;
  toVersion: number | null;
  status: "repairing" | "repaired" | "gave_up";
  /** Human-readable changes between the versions (spoiler-bearing). */
  changes: { field: string; before: string; after: string }[];
  note: string | null;
  createdAt: string;
}

/** Route readiness for one scenario version, as players and the Director View see it. */
export type RouteReadiness = "untested" | "testing" | "repairing" | "passed" | "withheld";

export interface KaneView {
  enabled: boolean;
  /** Why Kane can't run, e.g. not signed in. */
  problem: string | null;
  currentVersion: number;
  routes: { routeId: Id; endingId: Id; label: string; readiness: RouteReadiness; latestRunId: Id | null }[];
  runs: KaneRun[];
  repairs: Repair[];
}

/** What Kane is doing right now, for the floating "Kane at work" window. */
export interface KaneLive {
  /** The run in progress, or the most recent one when nothing is running. */
  run: KaneRun | null;
  /** Route label for that run, e.g. "Route A · Rooftop Escape". */
  routeLabel: string | null;
  /** A live copy of the game session Kane is playing (what Kane sees). */
  session: SessionView | null;
  /** Runs waiting their turn (Kane plays one route at a time). */
  queued: number;
  currentVersion: number;
  routes: KaneView["routes"];
  /** Why Kane can't run, e.g. not signed in. */
  problem: string | null;
  /** Kane's latest free exploration of this adventure, if any. */
  exploration: ExplorationView | null;
}

export type ExplorationStatus = "queued" | "running" | "completed" | "stopped" | "failed";

/** What Kane reached while exploring with no script, measured from its own test sessions. */
export interface ExploreCoverage {
  rooms: {
    id: Id;
    name: string;
    visited: boolean;
    actions: { id: Id; label: string; tried: boolean; succeeded: boolean; onRoute: boolean }[];
  }[];
  endings: { id: Id; title: string; reached: boolean }[];
  items: { id: Id; name: string; found: boolean }[];
  totals: { rooms: number; roomsVisited: number; actions: number; actionsTried: number; endings: number; endingsReached: number };
}

/** One run of `kane-cli explore` over an adventure version. */
export interface ExplorationView {
  id: Id;
  scenarioId: Id;
  scenarioVersion: number;
  status: ExplorationStatus;
  /** Kane's own plain-language reason the run stopped (e.g. "completed", "budget"). */
  remark: string | null;
  /** Kane's exploration plan, as it summarised it. */
  plan: string | null;
  /** Kane's counters: screens it has visited, and places it still means to try. */
  visited: number;
  frontier: number;
  /** Newest last: what Kane is trying and doing. */
  feed: { at: string; text: string; kind: "intent" | "action" | "finding" | "info" }[];
  /** Fresh game sessions Kane opened while exploring. */
  sessions: number;
  coverage: ExploreCoverage;
  startedAt: string | null;
  finishedAt: string | null;
  /** Kane's interactive map of the exploration, once its viewer is running. */
  mapUrl: string | null;
}

export interface ValidatorIssue {
  kind:
    | "invalid_shape"
    | "missing_reference"
    | "duplicate_id"
    | "unreachable_ending"
    | "broken_solution"
    | "consumed_needed_item";
  message: string;
  refs: Id[];
}

// ---- API shapes (what the server sends the browser; never includes answers) ----

export type AdventureStatus = "planning" | "rendering" | "ready" | "failed";

export type GenStageKey = "writing" | "checking" | "painting" | "placing" | "entrance";
export type GenStageStatus = "pending" | "active" | "complete" | "retrying" | "failed";
export interface GenStage {
  key: GenStageKey;
  status: GenStageStatus;
}

/** Clickable area on a scene image, as fractions (0–1) of the image's width and height. */
export interface Hotspot {
  actionId: Id;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Short name of the object as drawn, e.g. "Curator's desk". */
  object?: string;
  /** One sentence about how the object looks in the picture. Never a solution. */
  look?: string;
}

export interface ActionView {
  id: Id;
  label: string;
  locked: boolean;
  /** Present when the action needs a typed code. */
  inputPrompt?: string;
}

export interface SessionView {
  sessionId: Id;
  scenarioId: Id;
  scenarioVersion: number;
  title: string;
  roomId: Id;
  roomName: string;
  roomDescription: string;
  roomIndex: number;
  roomCount: number;
  /** URL of the current scene image, or null while it renders. */
  imageUrl: string | null;
  /** Clickable areas on the shown image for actions available right now. */
  hotspots: Hotspot[];
  actions: ActionView[];
  inventory: { id: Id; name: string; description: string; icon: string | null; imageUrl: string | null }[];
  /** Clues the player has actually found (derived notes), kept apart from usable items. */
  notebook: { id: Id; title: string; text: string; where: string }[];
  /** Result of the last action: narrative, locked message, or failed code. */
  message: string | null;
  messageKind: "info" | "success" | "error" | null;
  ending: Ending | null;
  /** First sentence of the room description, for room title cards. */
  roomTagline: string;
  /** The room has changed but its new picture is still being painted. */
  sceneUpdating: boolean;
  stats: SessionStats;
  /** Narration so far, oldest first (most recent 60). */
  log: LogEntry[];
  endingCount: number;
  /** Set only on a use-item response that needs a code: open the keypad for this action. */
  openInputFor?: Id;
  /** Kane's state for the routes of this version; null when Kane has never run on it. */
  kane: { state: "testing" | "repairing" | "passed" | "delayed"; newerVersion: boolean } | null;
}

export interface SessionStats {
  moves: number;
  hintsUsed: number;
  startedAt: string;
  endedAt: string | null;
  itemsFound: number;
  itemsTotal: number;
}

export interface LogEntry {
  at: string;
  roomName: string;
  /** What the player did, e.g. "Search desk"; null for arriving in the game. */
  action: string | null;
  text: string;
  kind: "info" | "success" | "error";
  /** Item names picked up by this action. */
  found: string[];
}

export interface HintResult {
  level: 1 | 2 | 3;
  text: string;
}

export interface AdventureSummary {
  id: Id;
  version: number;
  theme: string;
  title: string | null;
  briefing: string | null;
  status: AdventureStatus;
  error: string | null;
  prepared: boolean;
  /** Opening scene image, once rendered. */
  coverUrl: string | null;
  /** Real progress of generation, in order. */
  stages: GenStage[];
}

/** A saved room in the library: its summary plus what players and Kane have done with it. */
export interface LibraryEntry extends AdventureSummary {
  createdAt: string;
  rooms: string[];
  /** Player sessions that made at least one move, and how many of them escaped. */
  plays: number;
  escapes: number;
  kane: "testing" | "repairing" | "passed" | "delayed" | null;
}

export interface DirectorView {
  adventure: AdventureSummary;
  validatorIssues: ValidatorIssue[];
  notes: string | null;
  routes: { routeId: Id; endingId: Id; objective: string }[];
  images: { roomId: Id; sceneStateId: Id; status: ImageStatus; url: string | null; error: string | null }[];
}

export type ImageStatus = "pending" | "rendering" | "ready" | "placeholder" | "failed";
