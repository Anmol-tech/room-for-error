import { EventEmitter } from "node:events";
import { IMAGE_MODERATION_MESSAGE } from "../../shared/imageModeration.ts";
import type { GenStage } from "../../shared/schema.ts";
import { db } from "./db.ts";

const events = new EventEmitter();
type BlockedScene = { scenarioId: string; version: number };

export function onImageModeration(listener: (scene: BlockedScene) => void): void {
  events.on("blocked", listener);
}

/** Keep the provider rejection visible, and stop spending Kane credits on an unillustrated mission. */
export function blockModeratedAdventure(scenarioId: string, version: number): void {
  const row = db.prepare("SELECT current_version, stages FROM adventures WHERE id = ?").get(scenarioId) as
    | { current_version: number; stages: string | null }
    | undefined;
  if (!row || row.current_version !== version) return;
  const stages: GenStage[] = row.stages ? JSON.parse(row.stages) : [];
  const blocked = stages.map((stage) => ({
    ...stage,
    status: stage.key === "painting" ? "failed" : stage.key === "placing" || stage.key === "entrance" ? "pending" : stage.status,
  }));
  const changed = db.prepare("UPDATE adventures SET status = 'failed', error = ?, stages = ? WHERE id = ? AND (status != 'failed' OR error IS NOT ?)")
    .run(IMAGE_MODERATION_MESSAGE, JSON.stringify(blocked), scenarioId, IMAGE_MODERATION_MESSAGE).changes;
  if (changed) events.emit("blocked", { scenarioId, version });
}
