"use strict";

/**
 * Anti-ban heuristics for self-hosted WhatsApp sessions.
 *
 * None of this makes automation "safe" — WhatsApp's own detection is a black
 * box and nothing here can guarantee a number never gets flagged (see the
 * real-world reports at github.com/WhiskeySockets/Baileys/issues/1869 and
 * /2075). What this DOES do is remove the most obvious tells: instant/robotic
 * timing, and a brand-new number blasting out messages at full volume from
 * day one. Both are exactly the signals the 2025-2026 ban research pointed to
 * (reply-ratio, contact-graph distance, temporal patterns).
 *
 * Per-session state lives in memory only (lost on restart, which just means
 * the warm-up ramp is conservatively recomputed from `connectedAt`, stored on
 * disk alongside the session's own auth state — see sessionManager.js).
 */

const MIN_DELAY_MS = 3000; // never send back-to-back faster than this...
const JITTER_MS = 5000; // ...plus a random 0-5s on top, so timing isn't a fixed interval

// Daily send caps by how many days the session has been connected. A brand
// new number gets the tightest cap; caps loosen as the number "ages in."
// Tune via env if real-world experience says otherwise.
const WARMUP_TIERS = [
  { afterDays: 0, dailyCap: 20 },
  { afterDays: 3, dailyCap: 50 },
  { afterDays: 7, dailyCap: 150 },
  { afterDays: 14, dailyCap: 500 },
];

function dailyCapFor(connectedAt) {
  const days = (Date.now() - connectedAt) / 86400000;
  let cap = WARMUP_TIERS[0].dailyCap;
  for (const tier of WARMUP_TIERS) {
    if (days >= tier.afterDays) cap = tier.dailyCap;
  }
  return cap;
}

function dayKeyFor(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

class AntibanGuard {
  constructor(connectedAt) {
    this.connectedAt = connectedAt || Date.now();
    this.lastSendAt = 0;
    this.sentToday = 0;
    this.dayKey = dayKeyFor(Date.now());
  }

  /** Throws if this send should be refused; otherwise records it and
   * resolves once it's safe to actually call sock.sendMessage. */
  async gate() {
    const now = Date.now();
    const todayKey = dayKeyFor(now);
    if (todayKey !== this.dayKey) {
      this.dayKey = todayKey;
      this.sentToday = 0;
    }

    const cap = dailyCapFor(this.connectedAt);
    if (this.sentToday >= cap) {
      const err = new Error(
        `Daily send limit reached for this session (${cap}/day while warming up). Try again tomorrow.`,
      );
      err.code = "DAILY_CAP_REACHED";
      throw err;
    }

    const minGap = MIN_DELAY_MS + Math.floor(Math.random() * JITTER_MS);
    const wait = this.lastSendAt + minGap - now;
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }

    this.lastSendAt = Date.now();
    this.sentToday += 1;
  }
}

module.exports = { AntibanGuard, dailyCapFor };
