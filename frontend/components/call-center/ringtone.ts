/**
 * A ringtone for inbound calls, synthesised with the Web Audio API so there's
 * no audio asset to ship. Classic double-ring cadence (two ~0.4s bursts, then
 * a ~2s gap), 440 + 480 Hz.
 *
 * Best-effort: if the browser won't let audio start (no prior interaction on
 * the page) it stays silent — the incoming-call card is still shown.
 */
export class Ringtone {
  private ctx: AudioContext | null = null;
  private loop: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  start(): void {
    if (this.running || typeof window === "undefined") return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.running = true;
    try {
      this.ctx = new Ctor();
      void this.ctx.resume?.();
    } catch {
      this.running = false;
      return;
    }
    const cycle = () => {
      if (!this.running || !this.ctx) return;
      this.burst(0);
      this.burst(0.4);
      this.loop = setTimeout(cycle, 3000);
    };
    cycle();
  }

  private burst(offset: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + offset;
    const dur = 0.4;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.03);
    gain.gain.setValueAtTime(0.14, t0 + dur - 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    for (const f of [440, 480]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start(t0);
      osc.stop(t0 + dur);
    }
  }

  stop(): void {
    this.running = false;
    if (this.loop) {
      clearTimeout(this.loop);
      this.loop = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}
