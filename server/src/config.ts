import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ASSETS_DIR = path.join(ROOT, "assets");
export const MISSIONS_DIR = path.join(ROOT, "missions");
/** The built web app (npm run build). When it exists, the API server serves it too. */
export const WEB_DIST = path.join(ROOT, "web", "dist");
export const DB_PATH = path.join(ASSETS_DIR, "room-for-error.db");

// Not PORT: dev launchers set PORT to the web port (5180), which would clash with Vite.
export const PORT = Number(process.env.API_PORT ?? 3001);

// Kane CLI: where its browser reaches the game, and how runs are launched.
export const KANE_APP_URL = (process.env.KANE_APP_URL || "http://localhost:5180").replace(/\/$/, "");
/** Show the browser while Kane plays unless KANE_HEADLESS=1. */
export const KANE_HEADLESS = process.env.KANE_HEADLESS === "1";
/** Run through `kanehack report` so the hackathon gets a redacted run summary (needs `kanehack consent yes`). */
export const KANE_REPORT = process.env.KANE_REPORT === "1";
/** Rehearse new adventures automatically once they're ready (KANE_AUTO=0 to only run from the Director View). */
export const KANE_AUTO = process.env.KANE_AUTO !== "0";
export const KANE_TIMEOUT_S = Number(process.env.KANE_TIMEOUT_S || 420);
/**
 * Visible Kane runs share one Chrome, and two at once were seen playing in the same test session,
 * so visible runs go one at a time. Headless runs each get their own browser.
 */
// One run at a time: two concurrent runs were seen driving the same browser tab, and nobody has
// verified that headless runs are isolated from each other.
export const KANE_CONCURRENCY = 1;
export const KANE_MAX_REPAIRS = 2;

// Director LLM. Both providers are configured side by side; LLM_PROVIDER picks one.
// Without LLM_PROVIDER: OpenAI if its key is set, else OpenRouter.
const PROVIDERS = {
  openai: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: undefined,
    model: process.env.OPENAI_MODEL || "gpt-6.1-sol",
  },
  openrouter: {
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY || "",
    baseURL: "https://openrouter.ai/api/v1",
    model: process.env.OPENROUTER_MODEL || "openai/gpt-5.5",
  },
} as const;

const requested = process.env.LLM_PROVIDER?.trim().toLowerCase();
if (requested && !(requested in PROVIDERS)) {
  throw new Error(`LLM_PROVIDER must be "openai" or "openrouter", got "${requested}"`);
}
export const LLM =
  PROVIDERS[(requested as keyof typeof PROVIDERS | undefined) ?? (PROVIDERS.openai.apiKey ? "openai" : "openrouter")];

/**
 * Vision model that finds clickable objects in scene images; VISION_PROVIDER can send it elsewhere
 * than the director. Compared on three scenes: gpt-6.1-sol (high image detail, medium reasoning)
 * and google/gemini-3.8-flash put boxes on the objects; gpt-5.4-mini was visibly off.
 */
const visionRequested = process.env.VISION_PROVIDER?.trim().toLowerCase();
if (visionRequested && !(visionRequested in PROVIDERS)) {
  throw new Error(`VISION_PROVIDER must be "openai" or "openrouter", got "${visionRequested}"`);
}
const visionProvider = PROVIDERS[(visionRequested as keyof typeof PROVIDERS | undefined) ?? LLM.provider];
export const VISION = {
  ...visionProvider,
  model: process.env.VISION_MODEL || (visionProvider.provider === "openrouter" ? "google/gemini-3.8-flash" : "gpt-6.1-sol"),
};
export const VISION_MODEL = VISION.model;

/**
 * Reasoning effort for models that support it ("none", "low", "medium", "high"). Lower is faster:
 * with deepseek-v4.1-flash, "none" planned a valid mission in ~7 s versus ~36 s at "low".
 */
export const LLM_REASONING_EFFORT = process.env.LLM_REASONING_EFFORT || "none";

export const BFL_API_KEY = process.env.BFL_API_KEY ?? "";
export const BFL_MODEL = process.env.BFL_MODEL ?? "flux-3-image-klein";
export const IMAGE_WIDTH = 1024;
export const IMAGE_HEIGHT = 576;
/** Max FLUX jobs in flight at once. */
export const IMAGE_CONCURRENCY = 2;
