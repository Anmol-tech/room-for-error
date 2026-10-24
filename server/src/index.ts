import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import {
  act,
  createSession,
  directorView,
  getAdventure,
  getSessionView,
  hint,
  listAdventures,
  NotFound,
  resumeRendering,
  seedPreparedMissions,
  startAdventure,
  use,
} from "./adventures.ts";
import { ASSETS_DIR, LLM, PORT } from "./config.ts";
import { directorEnabled } from "./director.ts";
import { fluxEnabled, resetInterruptedRenders } from "./flux.ts";
import { getRun, kaneView, rehearse, resetInterruptedRuns } from "./rehearsal.ts";
import { kaneLive } from "./kaneLive.ts";
import { explore, exploreSession, openMap, resetInterruptedExplorations, stopExploration } from "./explore.ts";

const app = express();
app.use(express.json());
app.use("/assets", express.static(ASSETS_DIR, { maxAge: "1h" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, director: directorEnabled(), flux: fluxEnabled() });
});

app.get("/api/adventures", (_req, res) => {
  res.json(listAdventures());
});

app.post("/api/adventures", (req, res) => {
  const { theme } = z.object({ theme: z.string().trim().min(3).max(200) }).parse(req.body);
  if (!directorEnabled()) {
    res.status(503).json({ error: "No LLM key is set (OPENROUTER_API_KEY or OPENAI_API_KEY), so new adventures can't be generated. Play a prepared mission instead." });
    return;
  }
  res.status(201).json(startAdventure(theme));
});

app.get("/api/adventures/:id", (req, res) => {
  res.json(getAdventure(req.params.id));
});

app.get("/api/adventures/:id/director", (req, res) => {
  res.json(directorView(req.params.id));
});

app.post("/api/adventures/:id/sessions", (req, res) => {
  res.status(201).json(createSession(req.params.id, "player"));
});

app.get("/api/sessions/:id", (req, res) => {
  res.json(getSessionView(req.params.id));
});

app.post("/api/sessions/:id/actions", (req, res) => {
  const { actionId, input } = z.object({ actionId: z.string(), input: z.string().max(100).optional() }).parse(req.body);
  res.json(act(req.params.id, actionId, input));
});

app.post("/api/sessions/:id/use", (req, res) => {
  const { itemId, actionIds } = z.object({ itemId: z.string(), actionIds: z.array(z.string()).min(1).max(10) }).parse(req.body);
  res.json(use(req.params.id, itemId, actionIds));
});

app.post("/api/sessions/:id/hint", (req, res) => {
  res.json(hint(req.params.id));
});

// ---- Kane ----

app.get("/api/adventures/:id/kane", async (req, res) => {
  res.json(await kaneView(req.params.id));
});

app.post("/api/adventures/:id/kane", (req, res) => {
  res.status(202).json({ queued: rehearse(req.params.id) });
});

// ---- Kane explore: free exploration with no script ----

app.post("/api/adventures/:id/explore", (req, res) => {
  res.status(202).json({ queued: explore(req.params.id) });
});

app.delete("/api/adventures/:id/explore", (req, res) => {
  stopExploration(req.params.id);
  res.status(202).json({ stopping: true });
});

/** Starts Kane's interactive map viewer for the latest exploration and returns its local address. */
app.post("/api/adventures/:id/explore/map", async (req, res) => {
  res.json({ url: await openMap(req.params.id) });
});

/** The exploration's entry page asks for a fresh, tagged test session on every visit. */
app.post("/api/explore/:id/session", (req, res) => {
  res.json(exploreSession(req.params.id));
});

/** Kane at work: the current run and a live copy of the session it's playing. */
app.get("/api/adventures/:id/kane/live", async (req, res) => {
  res.json(await kaneLive(req.params.id));
});

/** Where a Kane preview URL leads: the run's own isolated session. */
app.get("/api/preview/:runId", (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) throw new NotFound(`No Kane run ${req.params.runId}`);
  res.json({ scenarioId: run.scenarioId, sessionId: run.sessionId, version: run.scenarioVersion });
});

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof NotFound) res.status(404).json({ error: err.message });
  else if (err instanceof z.ZodError) res.status(400).json({ error: err.issues.map((i) => i.message).join("; ") });
  else {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
app.use(onError);

resetInterruptedRenders();
resetInterruptedRuns();
resetInterruptedExplorations();
seedPreparedMissions();
resumeRendering();
app.listen(PORT, () => {
  console.log(`Room for Error API on http://localhost:${PORT} (director: ${directorEnabled() ? `on via ${LLM.provider} (${LLM.model})` : "off, no LLM key"}, flux: ${fluxEnabled() ? "on" : "off, using placeholders"})`);
});
