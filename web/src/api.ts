import type { AdventureSummary, DirectorView, HintResult, KaneLive, KaneView, SessionView } from "../../shared/schema.ts";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  health: () => call<{ director: boolean; flux: boolean }>("/api/health"),
  adventures: () => call<AdventureSummary[]>("/api/adventures"),
  createAdventure: (theme: string) => call<AdventureSummary>("/api/adventures", { method: "POST", body: JSON.stringify({ theme }) }),
  adventure: (id: string) => call<AdventureSummary>(`/api/adventures/${encodeURIComponent(id)}`),
  director: (id: string) => call<DirectorView>(`/api/adventures/${encodeURIComponent(id)}/director`),
  createSession: (id: string) => call<SessionView>(`/api/adventures/${encodeURIComponent(id)}/sessions`, { method: "POST" }),
  session: (id: string) => call<SessionView>(`/api/sessions/${id}`),
  act: (sessionId: string, actionId: string, input?: string) =>
    call<SessionView>(`/api/sessions/${sessionId}/actions`, { method: "POST", body: JSON.stringify({ actionId, input }) }),
  use: (sessionId: string, itemId: string, actionIds: string[]) =>
    call<SessionView>(`/api/sessions/${sessionId}/use`, { method: "POST", body: JSON.stringify({ itemId, actionIds }) }),
  hint: (sessionId: string) => call<HintResult>(`/api/sessions/${sessionId}/hint`, { method: "POST" }),
  kane: (id: string) => call<KaneView>(`/api/adventures/${encodeURIComponent(id)}/kane`),
  kaneLive: (id: string) => call<KaneLive>(`/api/adventures/${encodeURIComponent(id)}/kane/live`),
  rehearse: (id: string) => call<{ queued: string[] }>(`/api/adventures/${encodeURIComponent(id)}/kane`, { method: "POST" }),
  explore: (id: string) => call<{ queued: string }>(`/api/adventures/${encodeURIComponent(id)}/explore`, { method: "POST" }),
  stopExplore: (id: string) => call<{ stopping: boolean }>(`/api/adventures/${encodeURIComponent(id)}/explore`, { method: "DELETE" }),
  exploreMap: (id: string) => call<{ url: string | null }>(`/api/adventures/${encodeURIComponent(id)}/explore/map`, { method: "POST" }),
  exploreSession: (id: string) => call<{ scenarioId: string; sessionId: string }>(`/api/explore/${encodeURIComponent(id)}/session`, { method: "POST" }),
  preview: (runId: string) => call<{ scenarioId: string; sessionId: string; version: number }>(`/api/preview/${encodeURIComponent(runId)}`),
};
