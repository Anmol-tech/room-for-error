import { test } from "node:test";
import assert from "node:assert/strict";
import { IMAGE_MODERATION_MESSAGE, isImageModeration } from "../../shared/imageModeration.ts";

test("FLUX request and content moderation are recognized, including persisted public warnings", () => {
  for (const message of ["FLUX status: Request Moderated", "FLUX status: Content Moderated", "request_moderated", IMAGE_MODERATION_MESSAGE]) {
    assert.equal(isImageModeration(message), true, message);
  }
});

test("transient image and game failures are not mistaken for moderation", () => {
  for (const message of [null, undefined, "FLUX timed out after 90 s", "FLUX poll 503", "Wrong code", "Server restarted", "Content-Type: image/jpeg"]) {
    assert.equal(isImageModeration(message), false, String(message));
  }
});
