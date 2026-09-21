/** Hands content from Content Studio (captions, images) over to the post
 * composer at /dashboard/publishing. sessionStorage carries the payload
 * across the navigation; the custom event lets an *already-mounted*
 * composer pick it up immediately too — sessionStorage's own "storage"
 * event only fires in other tabs, never the tab that wrote it, so relying
 * on it alone would miss same-tab handoffs. */
export const COMPOSER_PREFILL_KEY = "om:composer:prefill";
export const COMPOSER_PREFILL_EVENT = "om:composer-prefill";

export interface ComposerPrefill {
  body?: string;
  hashtags?: string[];
  platforms?: string[];
  title?: string;
  media?: { url: string; alt: string; type: "image" | "video" }[];
}

/** Returns true if the handoff was written, false if sessionStorage isn't
 * available (private browsing, etc.) — callers should tell the user either
 * way rather than assume success. */
export function sendToComposer(payload: ComposerPrefill): boolean {
  try {
    sessionStorage.setItem(COMPOSER_PREFILL_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(COMPOSER_PREFILL_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Reads and consumes the pending handoff, if any. */
export function readComposerPrefill(): ComposerPrefill | null {
  try {
    const raw = sessionStorage.getItem(COMPOSER_PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(COMPOSER_PREFILL_KEY);
    return JSON.parse(raw) as ComposerPrefill;
  } catch {
    return null;
  }
}

/** True if a handoff is waiting, without consuming it — used to warn the
 * user when it can't be applied right now (e.g. mid-edit on another post)
 * instead of silently discarding it. */
export function hasPendingComposerPrefill(): boolean {
  try {
    return sessionStorage.getItem(COMPOSER_PREFILL_KEY) !== null;
  } catch {
    return false;
  }
}
