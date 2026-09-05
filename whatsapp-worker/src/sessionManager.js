"use strict";

const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const pino = require("pino");
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("baileys");

const { AntibanGuard } = require("./antiban");
const webhook = require("./webhook");

const SESSIONS_DIR = process.env.SESSIONS_DIR || path.join(__dirname, "..", "sessions");
const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

/** workspaceId -> { sock, status, qrDataUrl, phone, guard, connectedAt } */
const sessions = new Map();

function authDir(workspaceId) {
  return path.join(SESSIONS_DIR, workspaceId);
}

/** Pulls plain text out of whichever message-content shape WhatsApp used —
 * mirrors the same "try every field name convention" approach already used
 * for the other social platforms (see backend's inbox_provider.py). */
function extractText(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ""
  );
}

function jidToE164(jid) {
  const digits = (jid || "").split("@")[0].split(":")[0];
  return digits ? `+${digits}` : null;
}

/** WhatsApp now addresses many 1:1 chats by an opaque "LID" (`<n>@lid`)
 * instead of the phone-number JID (`<phone>@s.whatsapp.net`) — a privacy
 * change rolled out through 2024/25. The digits in a LID are NOT a phone
 * number, so we must never format them as one, and — critically — a reply
 * has to go back to the *exact same* JID the message arrived on, not a
 * `@s.whatsapp.net` JID rebuilt from those digits (that lands nowhere).
 * Returns { jid, phone } — `jid` is always the real addressing identity to
 * reply to; `phone` is a genuine E.164 only when we actually know it. */
function resolveContact(key) {
  const rjid = key?.remoteJid || "";
  // `senderPn` is WhatsApp handing us the real phone JID alongside a LID.
  const pnJid = key?.senderPn || (rjid.endsWith("@s.whatsapp.net") ? rjid : null);
  return { jid: rjid, phone: pnJid ? jidToE164(pnJid) : null };
}

function e164ToJid(phone) {
  const digits = String(phone).replace(/[^\d]/g, "");
  return `${digits}@s.whatsapp.net`;
}

/** A reply target may be a raw JID we stored from an inbound message (could
 * be `@lid` or `@s.whatsapp.net`) or a plain phone number typed by the admin
 * (broadcasts, campaign groups). Pass JIDs straight through untouched. */
function toSendJid(to) {
  return String(to).includes("@") ? String(to) : e164ToJid(to);
}

async function connect(workspaceId) {
  let entry = sessions.get(workspaceId);
  if (entry && entry.status === "connected") return entry;
  if (entry && entry.status === "connecting") return entry;

  fs.mkdirSync(authDir(workspaceId), { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir(workspaceId));
  const { version } = await fetchLatestBaileysVersion();

  entry = sessions.get(workspaceId) || {};
  entry.status = "connecting";
  entry.qrDataUrl = null;
  entry.phone = entry.phone || null;
  entry.connectedAt = entry.connectedAt || null;
  entry.guard = entry.guard || new AntibanGuard(entry.connectedAt || Date.now());
  sessions.set(workspaceId, entry);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    // WhatsApp pushes recent chat history once, shortly after a fresh QR
    // link — without this, connecting only ever sees messages that arrive
    // AFTER the connection, and every prior conversation looks empty.
    syncFullHistory: true,
  });
  entry.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.qrDataUrl = await QRCode.toDataURL(qr);
      entry.status = "qr";
      await webhook.notifyStatus(workspaceId, "qr");
    }

    if (connection === "open") {
      entry.status = "connected";
      entry.qrDataUrl = null;
      entry.connectedAt = entry.connectedAt || Date.now();
      entry.guard = new AntibanGuard(entry.connectedAt);
      entry.phone = jidToE164(sock.user?.id);
      await webhook.notifyStatus(workspaceId, "connected", { phone: entry.phone });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      entry.status = loggedOut ? "logged_out" : "disconnected";
      await webhook.notifyStatus(workspaceId, entry.status);
      if (!loggedOut) {
        // Transient drop (network blip, server restart) — auto-reconnect.
        // A real logout must NOT auto-reconnect; the user has to re-scan.
        setTimeout(() => connect(workspaceId).catch((e) => logger.error(e, "reconnect failed")), 3000);
      } else {
        fs.rmSync(authDir(workspaceId), { recursive: true, force: true });
        sessions.delete(workspaceId);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid?.endsWith("@g.us")) continue; // skip group messages for now
      const text = extractText(msg.message);
      if (!text) continue;
      const { jid, phone } = resolveContact(msg.key);
      await webhook.notifyMessage(workspaceId, {
        external_id: msg.key.id,
        // `from` stays the addressing JID's digits — a stable per-conversation
        // key, unchanged by whether WhatsApp also handed us a real phone.
        from: jidToE164(jid),
        from_jid: jid, // exact identity to reply to (may be @lid)
        from_pn: phone, // genuine E.164 when known — display only
        from_name: msg.pushName || null,
        body: text,
        at: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
      });
    }
  });

  // One-time backfill of whatever conversation history WhatsApp hands over
  // right after linking — both directions, so a real back-and-forth shows
  // up as one, not just the other person's half of it.
  sock.ev.on("messaging-history.set", async ({ messages }) => {
    const batch = [];
    for (const msg of messages || []) {
      if (msg.key.remoteJid?.endsWith("@g.us")) continue; // skip groups for now
      const text = extractText(msg.message);
      if (!text) continue;
      const { jid, phone } = resolveContact(msg.key);
      batch.push({
        external_id: msg.key.id,
        contact: jidToE164(jid),
        contact_jid: jid,
        contact_pn: phone,
        contact_name: msg.pushName || null,
        direction: msg.key.fromMe ? "out" : "in",
        body: text,
        at: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
      });
    }
    if (batch.length) await webhook.notifyHistory(workspaceId, batch);
  });

  return entry;
}

function getStatus(workspaceId) {
  const entry = sessions.get(workspaceId);
  if (!entry) return { status: "disconnected", qr: null, phone: null };
  return { status: entry.status, qr: entry.qrDataUrl, phone: entry.phone };
}

async function sendMessage(workspaceId, to, text) {
  const entry = sessions.get(workspaceId);
  if (!entry || entry.status !== "connected") {
    const err = new Error("This workspace's WhatsApp session isn't connected.");
    err.code = "NOT_CONNECTED";
    throw err;
  }
  await entry.guard.gate(); // anti-ban pacing + daily cap — throws if refused
  const result = await entry.sock.sendMessage(toSendJid(to), { text });
  return { id: result?.key?.id || null };
}

/** Reconnects every workspace that has saved credentials on disk — called
 * once at process startup so a worker restart is invisible to already-linked
 * numbers instead of stranding them at "disconnected" until someone happens
 * to reopen the Messaging page. */
async function resumeAll() {
  let dirs;
  try {
    dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
  } catch {
    return; // no sessions dir yet — nothing to resume
  }
  for (const entry of dirs) {
    if (!entry.isDirectory()) continue;
    const credsPath = path.join(SESSIONS_DIR, entry.name, "creds.json");
    if (!fs.existsSync(credsPath)) continue; // an empty/abandoned dir, not a real session
    connect(entry.name).catch((e) => logger.error(e, `resume failed for ${entry.name}`));
  }
}

async function disconnect(workspaceId) {
  const entry = sessions.get(workspaceId);
  if (!entry) return;
  try {
    await entry.sock?.logout();
  } catch {
    /* already gone — fine */
  }
  fs.rmSync(authDir(workspaceId), { recursive: true, force: true });
  sessions.delete(workspaceId);
}

module.exports = { connect, getStatus, sendMessage, disconnect, resumeAll };
