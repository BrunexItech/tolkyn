/** Prompt length caps — mirror the backend Pydantic `max_length` on
 *  `app/schemas/studio.py` so we can reject an over-long prompt in the UI
 *  before it's ever sent. */
export const PROMPT_LIMITS = {
  image: 6000,
  copy: 4000,
  brief: 3000,
} as const;

export const MIN_PROMPT = 3;

/** Returns a human message if the value can't be submitted, else null. */
export function promptIssue(value: string, limit: number): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null; // empty is "not ready", not an error to show
  if (trimmed.length < MIN_PROMPT) return "Add a few more words.";
  if (value.length > limit)
    return `Too long by ${value.length - limit} — keep it under ${limit.toLocaleString()} characters.`;
  return null;
}

export function canSubmitPrompt(value: string, limit: number): boolean {
  const trimmed = value.trim();
  return trimmed.length >= MIN_PROMPT && value.length <= limit;
}
