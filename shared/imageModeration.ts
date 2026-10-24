/** Recognize provider moderation separately from game bugs and transient image errors. */
export const IMAGE_MODERATION_MESSAGE = "Image moderation: FLUX couldn't generate one or more room illustrations for this scenario. Please try another scenario.";

export function isImageModeration(message: string | null | undefined): boolean {
  return !!message && /image moderation:|(?:content|request)[ _-]+moderated|(?:content|request)[ _-]+moderation/i.test(message);
}
