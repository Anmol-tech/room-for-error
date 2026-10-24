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

Both director providers are supported. Set `LLM_PROVIDER=openai` or `LLM_PROVIDER=openrouter` to pick one; you can keep both keys in `.env` and switch by changing that one line (then restart). Without `LLM_PROVIDER`, OpenAI is used if its key is set, otherwise OpenRouter. Optional: `OPENAI_MODEL` (default `gpt-5.5`), `OPENROUTER_MODEL` (default `openai/gpt-5.5`), `BFL_MODEL` (default `flux-3-image-klein`).

## What works now

- **Prepared missions:** `missions/*.json` load at startup. Play the museum mission at `/play/museum`, and add `?director=1` to open the director panel.
- **Engine** (`server/src/engine.ts`): rooms, items, flags, locked actions, code locks, scene states and endings. Runs on the server, so answers never reach the browser.
- **Validator** (`server/src/validator.ts`): finds missing references, duplicate ids, broken intended solutions, items consumed before they're needed, and unreachable endings.
- **Director** (`server/src/director.ts`): theme → scenario JSON (JSON mode via OpenRouter or OpenAI), with one validator-driven revision round. `reviseScenario(..., { lockObjectives: true })` is ready for the repair loop and can't change test objectives.
- **Images** (`server/src/flux.ts`): FLUX generate for each room's default scene, then edits from it for the other scene states. Cached by prompt hash. The opening scene renders first.
- **Clickable scenes** (`server/src/hotspots.ts`): after each image renders, a vision model (`VISION_MODEL`, default `google/gemma-4-26b-a4b-it` on OpenRouter; `google/gemini-3.8-flash` is a more accurate alternative) finds the object for each action and stores boxes with the image. Players can click things in the picture; the labelled buttons stay as the accessible and Kane-friendly path.
- **Web:** start screen ("Every room has a way out."), arrival screen with real generation stages, and the game: a large room canvas, clickable objects with inspection panels, select-an-item-then-use-it, a keypad dialog, typewriter narration with history and staged hints (worked out on the server, codes never revealed), room transitions, pause menu, and an ending with stats and a mission recap. Hints on/off, narration speed and sound are player settings.
- **Director View:** real version, validator, route and scene data. Kane activity there is a clearly labelled **sample** for the museum mission (`web/src/kaneSample.ts`) until real Kane runs replace it on event day.

## Built on the day (Kane integration)

`server/src/kane.ts` (run kane-cli, parse `--agent` output), Kane run storage, preview session routes, the repair loop, route unlocking, live Kane results in the director panel, and (stretch) a picture-only Kane route that plays by clicking scene hotspots. See `docs/PLAN.md`. The schema for runs (`KaneRun`) is already in `shared/schema.ts`.

## Checks

```bash
npm test         # engine + validator tests
npm run typecheck
```
