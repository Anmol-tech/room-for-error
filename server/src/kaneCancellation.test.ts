import { test } from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import { runKane } from "./kane.ts";

test("cancelling a Kane process settles without reporting a pass or leaving its launcher running", async (t) => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), pid: 987654321,
    kill: () => { queueMicrotask(() => child.emit("close", null)); return true; },
  });
  const launches: { command: string; args: string[] }[] = [];
  const spawn = t.mock.method(childProcess, "spawn", (command: string, args: string[]) => {
    launches.push({ command, args });
    if (launches.length === 1) return child;
    // Model taskkill closing both the wrapper and its Node child; never launch a real browser.
    queueMicrotask(() => child.emit("close", null));
    return new EventEmitter();
  });
  syncBuiltinESMExports();
  try {
    const controller = new AbortController();
    const result = runKane({
      runId: `unit-cancellation-${randomUUID()}`, url: "http://localhost/preview/unit-only",
      objective: "Unit-only subprocess simulation", signal: controller.signal,
    });
    child.stdout.write(`${JSON.stringify({ type: "run_end", status: "passed" })}\n`);
    controller.abort();
    assert.equal((await result).outcome, "infra_error");
    if (process.platform === "win32") {
      assert.equal(launches[1].command, "taskkill");
      assert.deepEqual(launches[1].args, ["/PID", String(child.pid), "/T", "/F"]);
    }
  } finally {
    spawn.mock.restore();
    syncBuiltinESMExports();
  }
});
