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

export type KaneRunStatus = "queued" | "running" | "passed" | "failed" | "infra_error";

export interface KaneRun {
  id: Id;
  scenarioId: Id;
  scenarioVersion: number;
  routeId: Id;
  startState: GameState;
  objective: string;
  status: KaneRunStatus;
  exitCode?: number;
  /** Kane's final summary, shown in the director panel. */
  summary?: string;
  /** Raw NDJSON from kane-cli --agent, e.g. assets/runs/<id>.ndjson */
  evidencePath?: string;
  startedAt?: string;
  finishedAt?: string;
  /** True for results recorded before the demo. The UI must label these. */
  prior: boolean;
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

export interface DirectorView {
  adventure: AdventureSummary;
  validatorIssues: ValidatorIssue[];
  notes: string | null;
  routes: { routeId: Id; endingId: Id; objective: string }[];
  images: { roomId: Id; sceneStateId: Id; status: ImageStatus; url: string | null; error: string | null }[];
}

export type ImageStatus = "pending" | "rendering" | "ready" | "placeholder" | "failed";
