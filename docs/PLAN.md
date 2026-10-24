# Room for Error — project plan

## Context
Kane CLI Hack Day is tomorrow (Sat Oct 24, SF). Theme: build with an agent, verify with Kane. The project: type a theme → an AI director generates a short illustrated escape game → Kane test-plays its routes in separate preview sessions while you play → the director repairs anything broken and Kane re-checks before the route unlocks.

The project folder `/Users/anmol/Work/Room for Error/` is empty except two old idea files (ProofLoop.md, ProofPort.md). Node 22 is installed; kane-cli is not. The FLUX benchmark runner from the proposal is not in this folder. Team: you + 1 teammate. You use Claude Code, the teammate uses Codex. Tonight = setup + schema only; all app code is written on the day so it counts as new work.

## Original idea vs this plan
| Area | Original proposal | This plan |
|---|---|---|
| Core idea | Theme → AI escape game; Kane test-plays ahead; director repairs | **Same** |
| Mission size | 3 rooms, 2 puzzles, 2 routes | **Same** |
| Generation | Draft up to 2 candidate continuations one step ahead, rank them, release when checked | Generate the **whole mission at once**; routes unlock when Kane passes them |
| Showcase bug | Badge consumed at archive but needed for rooftop | **Clue text says 4471, lock needs 4417** (validator can't see it, only a player can) |
| Kane's role | Tests paths (often ones the validator would also catch) | Tests **player-only problems**; panel shows validator vs Kane catches separately |
| Kane verifying the app itself | Implied (app defects go to coding agent) | Explicit **dev suite** in both coding agents' loops |
| Test integrity | "Repair must not weaken a test" | Enforced: objectives stored separately, repair can't edit them |
| Deployment | Public URL + laptop Kane worker | **Laptop first**, public URL is a stretch goal |
| Deadline | Ship 6 PM | Confirm 5 vs 6 PM with organizers at 10 AM |
| Kane benchmark | First hour of the event | **Tonight** |
| Kept unchanged | Stack (React/TS, Node, SQLite), FLUX 3 Image Klein, evidence/labeling rules, isolated preview sessions, director panel, 2-repair limit, prepared fallback mission, 2-person split, 3-min demo shape | — |

## Decisions (changes from the original proposal)
1. **Generate the whole mission at once** (3 rooms, 2 puzzles, 2 routes). Drop "two continuations one step ahead." Kane rehearses routes in the background while the player is in room 1; each route **unlocks when Kane passes it**.
2. **Two verification layers, shown separately in the director panel:**
   - Validator (instant, local): missing references, unreachable goals, consumed-but-needed items, circular dependencies.
   - Kane (player-level): things only a player can see — clue text vs lock code, puzzle solvable from on-screen text only, buttons present, inventory display, ending reachable by clicking.
3. **Showcase bug = clue mismatch.** The story model writes a prose clue ("the code is 4471"); the lock rule expects 4417. The validator can't read prose so it passes; Kane follows the clue, fails, director repairs, Kane re-runs. Panel line: "Validator caught N rule errors. Kane caught 1 only a player could find."
4. **Tests can't be weakened.** Kane objectives are derived from the scenario's `intendedSolution` and stored separately; the repair step may change scenario data only, never objectives.
5. **Kane also verifies the app itself** with a small dev suite (create adventure → play prepared mission → reach ending) run in both coding agents' loops.
6. **Demo from the laptop first.** Public deploy is a stretch goal after 4 PM.
7. **Confirm the submission lock time (5 PM vs 6 PM) with organizers at 10 AM** and adjust the schedule.

## Stack and layout
React + Vite + TypeScript (web), Node + Express + TypeScript (server), SQLite (better-sqlite3), local `assets/` folder, npm workspaces.

```
Room for Error/
├── AGENTS.md              # shared rules for Codex; CLAUDE.md imports it (@AGENTS.md)
├── CLAUDE.md
├── shared/schema.ts       # Scenario, Action, GameState, KaneRun types + zod validators
├── missions/museum.json   # handcrafted mission, contains the clue-mismatch bug (demo fallback)
├── server/
│   ├── engine.ts          # pure: applyAction(scenario, state, actionId) -> state
│   ├── validator.ts       # static checks (reachability simulation over the action graph)
│   ├── director.ts        # OpenAI: theme -> scenario JSON; failure -> repaired scenario
│   ├── flux.ts            # flux-3-image-klein generate/edit, cache by scenarioVersion+sceneState
│   ├── kane.ts            # spawn kane-cli --agent, parse NDJSON, classify infra vs game failure
│   ├── jobs.ts            # SQLite job queue: render, kane-test, repair
│   └── routes.ts          # /api/adventures, /api/sessions, /api/preview, /api/runs
├── web/src/
│   ├── Start.tsx          # theme prompt + examples
│   ├── Game.tsx           # illustration, narrative, 2–3 action buttons, inventory, progress
│   ├── DirectorPanel.tsx  # validator results, Kane runs (live/prior labels), repairs, evidence
│   └── Ending.tsx
├── kane/dev-suite.txt     # plain-English checks for the app itself
└── assets/                # generated images (gitignored)
```

## Scenario schema (agree on this tonight)
- `Scenario { id, version, theme, briefing, rooms[], items[], actions[], endings[], intendedSolutions[] }`
- `Room { id, name, description, sceneStates: { id, imagePrompt }[] }`
- `Action { id, roomId, label, requires: { items?, flags? }, effects: { addItems?, removeItems?, setFlags?, moveTo?, sceneState?, ending? }, input?: { kind: "code", answer } , narrative }`
- `Item { id, name, consumable }`, clues are free text inside `narrative`/`description`
- `GameState { roomId, inventory[], flags{}, sceneState, ended? }`
- `IntendedSolution { routeId, steps: actionId[], objective: string }` → becomes the Kane objective
- `KaneRun { id, scenarioVersion, routeId, startState, objective, status: queued|running|passed|failed|infra_error, evidencePath, startedAt, finishedAt, prior: boolean }`

Every action button gets `data-action-id` and a visible label so Kane (and screen readers) find it reliably.

## Preview sessions (isolation)
`/play/:sessionId` for players; `/preview/:runId` creates a fresh session from `(scenarioVersion, startState)`. Separate session rows; preview sessions never touch player state. Kane only ever gets a preview URL.

## Kane worker
`kane-cli run --url http://localhost:5180/preview/<runId> "<objective>" --agent` via child_process. Store exit code + final result + raw NDJSON to `assets/runs/<runId>.ndjson`. Classify login/network/browser/credit errors as `infra_error` (never sent to the director). Max 2 Kane runs at once (adjust after tonight's concurrency test). Max 2 repair attempts per route, then withhold the route.

## Tonight (setup + schema only)
- [ ] Both: `npm install -g @testmuai/kane-cli`, `kane-cli login`, run one example flow
- [ ] Save one `--agent` run's NDJSON output into the repo as `kane/sample-output.ndjson` (parser is built from it)
- [ ] Time a 5-step flow; try 2 runs at once
- [ ] Test the showcase: a static HTML page with a note "the code is 4471" and a keypad expecting 4417 — does Kane read the note, enter 4471, and report failure clearly?
- [ ] OpenAI API account set up for the $250 credits; BFL key available to whoever owns flux.ts
- [ ] Agree on `shared/schema.ts` and write `missions/museum.json` by hand (with the clue bug)
- [ ] Write AGENTS.md (conventions, schema location, "never edit Kane objectives in repair") and CLAUDE.md containing `@AGENTS.md`
- [ ] `git init`, push to a shared GitHub repo
- [ ] Bring the FLUX benchmark runner/results into `docs/` if you want to show the measurement work

What I'll do on approval (tonight only): write `AGENTS.md`, `CLAUDE.md`, `shared/schema.ts`, `missions/museum.json`, the static clue-test HTML page, a `.gitignore`, and move ProofLoop.md/ProofPort.md into `docs/old-ideas/`. Kane install and login are yours (login needs your account).

## Saturday schedule (shift 1 hour earlier if the lock is 5 PM)
| Time | Person A (Codex): engine + UI | Person B (Claude Code): director, FLUX, Kane |
|---|---|---|
| 10–11 | Scaffold web+server, engine.ts on museum.json | kane.ts runner + parser from sample output |
| 11–12 | Game.tsx plays museum.json start to end; data-action-ids | validator.ts; preview session route |
| 12–1:15 | Inventory, scene state switching, Ending | director.ts theme → scenario; flux.ts opening scene |
| 1:15–2:30 | DirectorPanel with live/prior labels | Kane tests a route on a preview session; results in DB |
| 2:30–3:30 | Kane dev suite in Codex loop; fix app bugs | Repair loop: clue bug → repair → rerun → route unlocks |
| 3:30–4:15 | Route locking UI, start screen examples | Scene edits for state changes, caching |
| 4:15–5 | Restart/persistence/failure handling | Record backup video of full repair cycle |
| 5–6 | Freeze, rehearse 3-min demo, submit | — |

**Cut order if behind:** picture-click Kane check (below) → generated themes (use museum.json only) → FLUX scene edits (static images per state) → second route. **Never cut:** playable mission, real Kane run on a preview session, one repair + rerun.

## Saturday add-on: Kane plays by clicking the picture (after the repair loop works)
Why: the labelled buttons always work, so a normal Kane route never touches the clickable scene hotspots. A route played only through the picture tests what players actually do there. Example of a bug only this finds: on the ghost ship deck, the vision model's huge "Ride ghost tide" box once covered "Descend to hold", so the hatch couldn't be clicked (fixed Friday in `shared/hotspotLayout.ts`, but new generated scenes could still put hotspots in odd places).

Build (all on the day; nothing Kane-related exists yet):
1. **Picture-only preview mode** (Person A): `/preview/<runId>?mode=picture` hides the dialogue choice buttons and shows hotspot labels permanently, so Kane can't fall back to the buttons. Hotspots are `aria-hidden` today; in this mode render them as normal labelled buttons (`aria-label` = action label) so Kane can find them either visually or in the DOM.
2. **Picture objective per route** (Person B): derive from `intendedSolutions[].steps`, phrased around objects, e.g. *"Using only the picture of the room, click the desk, then click the security door. In the archive, click the terminal and enter the code from the note. Click the open vault, take the memory core from the pedestal, then click the rooftop ladder. Verify the 'Rooftop Escape' ending is shown."* Never reveal codes.
3. **Run it as a separate check** in the director panel, labelled "Picture route", next to the normal route result. A failure here goes to the hotspot step (re-detect that scene's hotspots), not to the story director.
4. **Demo option:** a `?layout=raw` flag that skips `layoutHotspots` reproduces the ghost ship overlap, so Kane can be shown failing on "Descend to hold" and passing once the layout fix is on. Label it as a planted defect.

Risk: picture-only runs depend on Kane's vision and will be slower and flakier than button runs. Time one run before deciding to demo it live; otherwise show a recorded prior run.

## Demo (3 min)
0:00 theme typed, briefing streams, room 1 appears · 0:20 play puzzle, inventory, picture changes; panel shows Kane rehearsing the rooftop route live · 1:10 panel: validator results, Kane's clue-mismatch failure, repair diff, rerun pass (labeled prior if prepared) · 2:00 rooftop route unlocks, escape, ending · 2:40 "AI builds the room, Kane finds the error, you never see it."

## Verification
- `museum.json` plays start → both endings by clicking in the browser.
- Validator rejects a hand-broken scenario (badge consumed but needed later).
- `kane-cli run` against `/preview/<runId>` on the clue-bug mission fails; after repair the rerun passes and the route unlocks; player session inventory unchanged throughout.
- Kane dev suite passes against the running app.
- Generated theme (not museum) produces a valid scenario + opening image in under ~20 s end to end (measure).
