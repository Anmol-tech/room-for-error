// Kane drives one browser at a time: two runs at once were seen sharing a tab. Route runs
// (rehearsal.ts) and free explorations (explore.ts) both take their turn through this lock.

let routeRuns = 0;
let exploring = false;
const waiting: (() => void)[] = [];

export const browserBusy = () => routeRuns > 0 || exploring;
export const exploringNow = () => exploring;

export function routeRunStarted() {
  routeRuns++;
}

export function routeRunEnded() {
  routeRuns--;
  wake();
}

export function exploreStarted() {
  exploring = true;
}

export function exploreEnded() {
  exploring = false;
  wake();
}

/** Called whenever the browser frees up, so queued work of either kind can start. */
export function onBrowserFree(fn: () => void) {
  waiting.push(fn);
}

function wake() {
  if (browserBusy()) return;
  for (const fn of waiting) fn();
}
