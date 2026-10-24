import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ASSETS_DIR = path.join(ROOT, "assets");
export const MISSIONS_DIR = path.join(ROOT, "missions");
export const DB_PATH = path.join(ASSETS_DIR, "room-for-error.db");

// Not PORT: dev launchers set PORT to the web port (5180), which would clash with Vite.
export const PORT = Number(process.env.API_PORT ?? 3001);

// Director LLM. Both providers are configured side by side; LLM_PROVIDER picks one.
// Without LLM_PROVIDER: OpenAI if its key is set, else OpenRouter.
const PROVIDERS = {
  openai: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY || "",
    baseURL: undefined,
    model: process.env.OPENAI_MODEL || "gpt-5.5",
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

/** Vision model that finds clickable objects in scene images. Must accept images. */
export const VISION_MODEL = process.env.VISION_MODEL || (LLM.provider === "openrouter" ? "google/gemma-4-26b-a4b-it" : "gpt-5.5");

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
