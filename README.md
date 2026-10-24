# Room for Error

AI builds the room. Kane finds the error. You never see it.

Type an escape-game theme, and an AI director builds a short illustrated escape adventure. Kane CLI test-plays its routes before you reach them, and the director repairs anything broken. Built for Kane CLI Hack Day SF (Oct 24, 2026). See `AGENTS.md` for project rules and `docs/PLAN.md` for the full plan.

## Run it

```bash
npm install
cp .env.example .env   # then add your keys
npm run dev
```

Open http://localhost:5180. The API runs on port 3001, and Vite proxies `/api` and `/assets` to it.

| Key in `.env` | Without it |
|---|---|
| `OPENAI_API_KEY` or `OPENROUTER_API_KEY` (whichever `LLM_PROVIDER` picks) | "Create adventure" is disabled. Prepared missions still play. |
| `BFL_API_KEY` | Scenes use generated placeholder images instead of FLUX. |

Both director providers are supported. Set `LLM_PROVIDER=openai` or `LLM_PROVIDER=openrouter` to pick one; you can keep both keys in `.env` and switch by changing that one line (then restart). Without `LLM_PROVIDER`, OpenAI is used if its key is set, otherwise OpenRouter. Optional: `OPENAI_MODEL` (default `gpt-6-luna`: valid rooms in about 17 s in tests), `OPENROUTER_MODEL` (default `openai/gpt-5.5`), `BFL_MODEL` (default `flux-3-image-klein`).

## What works now

- **Prepared missions:** `missions/*.json` load at startup. Play the museum mission at `/play/museum`, and add `?director=1` to open the director panel.
- **Engine** (`server/src/engine.ts`): rooms, items, flags, locked actions, code locks, scene states and endings. Runs on the server, so answers never reach the browser.
- **Validator** (`server/src/validator.ts`): finds missing references, duplicate ids, broken intended solutions, items consumed before they're needed, and unreachable endings.
- **Director** (`server/src/director.ts`): theme → scenario JSON (JSON mode via OpenRouter or OpenAI), with up to four draft/revise rounds. Repairs use `reviseScenario(..., { lockObjectives: true })`, which can't change test objectives.
- **Images** (`server/src/flux.ts`): FLUX generate for each room's default scene, then edits from it for the other scene states. Cached by prompt hash. The opening scene renders first.
- **Clickable scenes** (`server/src/hotspots.ts`): after each image renders, a vision model (`VISION_MODEL`, default `google/gemma-4-26b-a4b-it` on OpenRouter; `google/gemini-3.8-flash` is a more accurate alternative) finds the object for each action and stores boxes with the image. Players can click things in the picture; the labelled buttons stay as the accessible and Kane-friendly path.
- **Web:** start screen ("Every room has a way out."), arrival screen with real generation stages, and the game: a large room canvas, clickable objects with inspection panels, select-an-item-then-use-it, a keypad dialog, typewriter narration with history and staged hints (worked out on the server, codes never revealed), room transitions, pause menu, and an ending with stats and a mission recap. Hints on/off, narration speed and sound are player settings.
- **Director View:** real version, validator, route, Kane run, repair and scene data (see below).

## Kane integration

Kane CLI test-plays every escape route before players can finish through it.

- **Runner** (`server/src/kane.ts`): starts `kane-cli run "<objective>" --agent --url <preview>` and reads its NDJSON stream. Exit 0 is a pass, exit 1 a game failure, anything else (sign-in, credits, browser, timeout) an infrastructure error that never triggers a repair. The raw stream is saved to `assets/runs/<runId>.ndjson`.
- **Preview pages**: Kane only opens `/preview/<runId>`, a fresh isolated session in test mode (`?test=1`: every option listed, instant narration, no room transitions).
- **Rehearsal and repair** (`server/src/rehearsal.ts`): new adventures are rehearsed automatically when ready (the Director View also has "Run Kane on every route"). A failed route goes to the director with Kane's evidence; it may change game data only, never the route objectives. The repaired version is validated, saved as a new version, and every route is played again on it. At most 2 repairs per route. Kane runs one at a time with a visible browser (parallel visible runs collided in one session) and two at a time with `KANE_HEADLESS=1`.
- **Off-route runs**: a pass must reach the route's own ending in its test session. If Kane finishes through a different exit, the run is marked "took another exit" and replayed (up to twice) instead of triggering a repair. Test sessions hide restart buttons.
- **Gating**: once Kane has started on a version, players can only finish through endings whose route passed on that exact version.
- **Director View**: real runs, steps, Test Manager links, the timeline, and before/after repair tables (spoilers hidden until revealed).

Settings (`.env`): `KANE_HEADLESS=1` hides the browser, `KANE_AUTO=0` stops automatic rehearsal, `KANE_REPORT=1` runs through `kanehack report` (after `kanehack consent yes`), `KANE_APP_URL` if the web app isn't on `http://localhost:5180`, `KANE_TIMEOUT_S` (default 420).

## Checks

```bash
npm test         # engine + validator tests
npm run typecheck
```
