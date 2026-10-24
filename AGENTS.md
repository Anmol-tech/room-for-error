# Room for Error

AI-generated escape adventures. A director model turns a theme into a short illustrated escape game; Kane CLI test-plays its routes in isolated preview sessions; failures go back to the director for repair; a route unlocks for the player only after Kane passes it on that exact scenario version.

Built at Kane CLI Hack Day SF (Oct 24, 2026). Full plan: `docs/PLAN.md`.

## Team and ownership
- **Person A (Codex):** game engine, UI, inventory, state rules, preview session isolation. Owns `web/` and `server/engine.ts`.
- **Person B (Claude Code):** director (OpenAI), FLUX images, Kane worker, repair loop. Owns `server/director.ts`, `flux.ts`, `kane.ts`, `jobs.ts`, `validator.ts`.
- `shared/schema.ts` is the contract. Change it only when both agree, in its own commit.

## Stack
React + Vite + TypeScript (`web/`), Node + Express + TypeScript (`server/`), SQLite via better-sqlite3, generated files in `assets/` (gitignored). npm workspaces.

## Layout
```
shared/schema.ts      Scenario, Action, GameState, KaneRun types
missions/museum.json  handcrafted mission with a planted demo defect (see its "notes")
server/               engine, validator, director, flux, kane, jobs, routes
web/src/              Start, Game, DirectorPanel, Ending
kane/                 Kane dev suite, clue test page, sample --agent output
assets/               generated images and Kane run evidence
```

## Rules
1. **The engine owns game state; images only illustrate it.** Never change rules to match a wrong picture. Report visual mismatches separately.
2. **Repairs never touch tests.** The director may change scenario data only. `intendedSolutions` (and the Kane objectives derived from them) are read-only to the repair step.
3. **A pass belongs to one version.** Every Kane result stores `scenarioId` + `scenarioVersion`. Bump `version` on every repair; old results don't unlock new versions.
4. **Preview sessions are isolated.** Kane only ever gets `/preview/<runId>` URLs. Nothing a test does may touch a player's session.
5. **Honest evidence.** Never show a queued or running Kane run as passed. Results recorded before the demo have `prior: true` and the UI labels them "Prior run".
6. **Infra errors aren't game bugs.** Login, network, browser, or credit failures from kane-cli are `infra_error` and never go to the director.
7. **Kane-friendly UI.** Every action is a real `<button>` with a visible label and `data-action-id="<action.id>"`. Inventory and the current ending are visible text, not only images. Clickable scene hotspots are a shortcut on top of these buttons, never a replacement: Kane objectives and accessibility rely on the buttons. With hints off (the default for players) buttons for actions that have a hotspot are visually hidden but stay in the DOM; Kane runs should load pages with `?hints=1` so every option is visible.
8. **Secrets stay on the server.** `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`), `BFL_API_KEY` in `.env` (never committed). Each person uses their own.
9. **Bounded work.** One Kane run at a time, headless or not (two concurrent runs were seen sharing a session; headless isolation is unverified); max 2 repair attempts per route, after which the route is withheld.

## Kane
- Product runs: `kane-cli run --url http://localhost:5180/preview/<runId> "<objective>" --agent`, raw NDJSON saved to `assets/runs/<runId>.ndjson`.
- Dev suite: `kane/dev-suite.txt` (create adventure, play the prepared mission, reach an ending). Run it after app changes and fix the app until it passes.
- Parser is built from the real output in `kane/sample-output.ndjson`.
