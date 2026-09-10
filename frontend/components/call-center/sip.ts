/**
 * Thin wrapper around sip.js `SimpleUser` for the browser softphone.
 *
 * Only loaded when the workspace has an active SIP trunk AND the current agent
 * has a line assigned (see GET /call-center/softphone -> configured:true).
 * Everything else in the Call Center keeps working against the backend's
 * simulated provider when this isn't configured.
 */
import type { SoftphoneConfig } from "@/lib/api/callcenter";

export type SipState =
  | "idle"
  | "connecting"
  | "registered"
  | "ringing" // inbound, not yet answered
  | "calling" // outbound, not yet answered
  | "in-call"
  | "failed";

export interface SipEvents {
  onState?: (s: SipState) => void;
  onInbound?: (from: string) => void;
  onEnded?: () => void;
  onError?: (message: string) => void;
}

export class SipPhone {
  private user: import("sip.js/lib/platform/web").SimpleUser | null = null;
  private audio: HTMLAudioElement;
  private cfg: SoftphoneConfig;
  private events: SipEvents;
  private _state: SipState = "idle";

  constructor(cfg: SoftphoneConfig, audio: HTMLAudioElement, events: SipEvents = {}) {
    this.cfg = cfg;
    this.audio = audio;
    this.events = events;
  }

  get state(): SipState {
    return this._state;
  }

  private setState(s: SipState) {
    this._state = s;
    this.events.onState?.(s);
  }

  async start(): Promise<void> {
    if (!this.cfg.ws_url || !this.cfg.domain || !this.cfg.extension) {
      throw new Error("Incomplete SIP configuration");
    }
    const { SimpleUser } = await import("sip.js/lib/platform/web");
    this.setState("connecting");

    const aor = `sip:${this.cfg.extension}@${this.cfg.domain}`;
    this.user = new SimpleUser(this.cfg.ws_url, {
      aor,
      media: { remote: { audio: this.audio } },
      userAgentOptions: {
        authorizationUsername: this.cfg.extension,
        authorizationPassword: this.cfg.password ?? "",
        displayName: this.cfg.display_name ?? this.cfg.extension,
        // Without a STUN server the browser only offers its LAN address as an
        // ICE candidate, so the PBX can't send audio back to an agent behind
        // NAT — the call connects but is silent. Public STUN lets the browser
        // discover its own public address.
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
            ],
          },
          iceGatheringTimeout: 3000,
        },
      },
      delegate: {
        onCallReceived: async () => {
          this.setState("ringing");
          this.events.onInbound?.("Incoming call");
        },
        onCallAnswered: () => this.setState("in-call"),
        onCallHangup: () => {
          this.setState(this.user ? "registered" : "idle");
          this.events.onEnded?.();
        },
        onRegistered: () => this.setState("registered"),
        onUnregistered: () => this.setState("idle"),
        onServerConnect: () => {
          /* connected — registration follows */
        },
      },
    });

    try {
      await this.user.connect();
      await this.user.register();
    } catch (e) {
      this.setState("failed");
      this.events.onError?.(e instanceof Error ? e.message : "SIP connection failed");
      throw e;
    }
  }

  async call(target: string): Promise<void> {
    if (!this.user) throw new Error("SIP phone not started");
    const dest = target.includes("@") ? `sip:${target}` : `sip:${target}@${this.cfg.domain}`;
    this.setState("calling");
    try {
      await this.user.call(dest);
    } catch (e) {
      this.setState("registered");
      this.events.onError?.(e instanceof Error ? e.message : "Call failed");
      throw e;
    }
  }

  async answer(): Promise<void> {
    await this.user?.answer();
    this.setState("in-call");
  }

  async hangup(): Promise<void> {
    try {
      await this.user?.hangup();
    } catch {
      /* already gone */
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.user) return;
    if (muted) this.user.mute();
    else this.user.unmute();
  }

  async setHold(hold: boolean): Promise<void> {
    if (!this.user) return;
    try {
      if (hold) await this.user.hold();
      else await this.user.unhold();
    } catch {
      /* no active session */
    }
  }

  async stop(): Promise<void> {
    try {
      await this.user?.unregister();
      await this.user?.disconnect();
    } catch {
      /* ignore */
    }
    this.user = null;
    this.setState("idle");
  }
}
