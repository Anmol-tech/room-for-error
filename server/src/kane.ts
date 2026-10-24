// Runs Kane CLI against a preview page and turns its --agent NDJSON stream into a result.
// Game failures (Kane couldn't finish the route) are told apart from infrastructure failures
// (sign-in, credits, browser, timeouts), which must never reach the director.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import type { KaneStep } from "../../shared/schema.ts";
import { ASSETS_DIR, KANE_HEADLESS, KANE_REPORT, KANE_TIMEOUT_S } from "./config.ts";

export const RUNS_DIR = path.join(ASSETS_DIR, "runs");
mkdirSync(RUNS_DIR, { recursive: true });

export interface KaneResult {
  outcome: "passed" | "failed" | "infra_error";
  exitCode: number | null;
  oneLiner: string | null;
  summary: string | null;
  reason: string | null;
  credits: number | null;
  durationS: number | null;
  testUrl: string | null;
  steps: KaneStep[];
}

interface RunOpts {
  runId: string;
  url: string;
  objective: string;
  onStep?: (steps: KaneStep[]) => void;
}

/** Stderr lines that mean Kane itself couldn't run, not that the game is broken. */
const INFRA_HINTS = /not authenticated|not logged in|login|credits?|unauthori[sz]ed|ECONNREFUSED|ENOTFOUND|chrome|browser.*(fail|crash|launch)|network/i;

export function runKane({ runId, url, objective, onStep }: RunOpts): Promise<KaneResult> {
  const kaneArgs = ["run", objective, "--agent", "--url", url, "--max-steps", "45", "--timeout", String(KANE_TIMEOUT_S)];
  if (KANE_HEADLESS) kaneArgs.push("--headless");
  // With KANE_REPORT=1 the run goes through the hackathon helper, which also sends a redacted summary.
  const [cmd, args] = KANE_REPORT
    ? ["kanehack", ["report", "--objective", objective, "--", "kane-cli", ...kaneArgs]]
    : ["kane-cli", kaneArgs];

  const evidence = createWriteStream(path.join(RUNS_DIR, `${runId}.ndjson`));
  const steps: KaneStep[] = [];
  let end: Record<string, unknown> | null = null;
  let errorMessage: string | null = null;
  let stderr = "";

  return new Promise((resolve) => {
    const child = spawn(cmd, args as string[], {
      env: { ...process.env, KANE_CLI_USER_AGENT: "room-for-error", PATH: `${process.env.HOME}/.kanehack/bin:${process.env.PATH}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Kane's own --timeout plus slack; past this the run is treated as an infrastructure problem.
    const killer = setTimeout(() => child.kill("SIGTERM"), (KANE_TIMEOUT_S + 60) * 1000);

    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      evidence.write(chunk);
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("{")) continue;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.type === "run_end") end = ev;
        else if (ev.type === "error") errorMessage = String(ev.message ?? "Kane reported an error");
        else if (!ev.type && typeof ev.step === "number") {
          // Progress lines have no type; a "running" line is replaced by its "done"/"failed" line.
          const status = String(ev.status) as KaneStep["status"];
          const step: KaneStep = { step: ev.step, status, remark: String(ev.remark ?? ""), at: new Date().toISOString() };
          const open = steps.findIndex((s) => s.step === step.step && s.status === "running");
          if (open >= 0) steps[open] = step;
          else steps.push(step);
          onStep?.([...steps]);
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    const finish = (exitCode: number | null) => {
      clearTimeout(killer);
      evidence.end();
      const e = end as Record<string, unknown> | null;
      const num = (v: unknown) => (typeof v === "number" ? v : null);
      const str = (v: unknown) => (typeof v === "string" && v ? v : null);
      // Exit codes: 0 passed · 1 failed · 2 auth/infra · 3 timeout/cancelled.
      let outcome: KaneResult["outcome"];
      if (exitCode === 0 && e?.status === "passed") outcome = "passed";
      else if (exitCode === 1 && e?.status === "failed") outcome = "failed";
      else outcome = "infra_error";
      const lastStderr = stderr.trim().split("\n").filter(Boolean).slice(-2).join(" ");
      resolve({
        outcome,
        exitCode,
        oneLiner: str(e?.one_liner),
        summary: str(e?.summary),
        reason:
          str(e?.reason) ??
          errorMessage ??
          (outcome === "infra_error" ? (INFRA_HINTS.test(lastStderr) ? lastStderr : `Kane exited with code ${exitCode}${lastStderr ? `: ${lastStderr}` : ""}`) : null),
        credits: num(e?.credits_consumed) ?? num(e?.credits),
        durationS: num(e?.duration),
        testUrl: str(e?.test_url),
        steps,
      });
    };
    child.on("error", (err) => {
      stderr += `\n${err.message}`;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

/** Quick sign-in check so the Director View can say why Kane isn't running. */
export function kaneReady(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("kane-cli", ["whoami"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, KANE_CLI_USER_AGENT: "room-for-error" } });
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.on("error", () => resolve("kane-cli is not installed"));
    child.on("close", (code) => resolve(code === 0 && !/not logged in|not authenticated/i.test(out) ? null : "Kane is not signed in (run kane-cli login)"));
  });
}
