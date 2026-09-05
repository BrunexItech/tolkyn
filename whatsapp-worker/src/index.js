"use strict";

const express = require("express");
const sessionManager = require("./sessionManager");

const PORT = process.env.PORT || 4001;
const SECRET = process.env.INTERNAL_SHARED_SECRET || "";

const app = express();
app.use(express.json());

// This service is only ever reached from the backend over the internal
// Docker network (see docker-compose.yml — no published port), but the
// shared-secret check is cheap defense in depth.
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (!SECRET || req.header("X-Internal-Secret") !== SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/sessions/:workspaceId/connect", async (req, res) => {
  try {
    await sessionManager.connect(req.params.workspaceId);
    res.json(sessionManager.getStatus(req.params.workspaceId));
  } catch (exc) {
    res.status(500).json({ error: exc.message });
  }
});

app.get("/sessions/:workspaceId/status", (req, res) => {
  res.json(sessionManager.getStatus(req.params.workspaceId));
});

app.post("/sessions/:workspaceId/send", async (req, res) => {
  const { to, text } = req.body || {};
  if (!to || !text) return res.status(400).json({ error: "'to' and 'text' are required" });
  try {
    const result = await sessionManager.sendMessage(req.params.workspaceId, to, text);
    res.json(result);
  } catch (exc) {
    const status = exc.code === "NOT_CONNECTED" ? 409 : exc.code === "DAILY_CAP_REACHED" ? 429 : 500;
    res.status(status).json({ error: exc.message, code: exc.code || null });
  }
});

app.delete("/sessions/:workspaceId", async (req, res) => {
  await sessionManager.disconnect(req.params.workspaceId);
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`[whatsapp-worker] listening on :${PORT}`);
});

// A restart of this process (crash, deploy, `docker compose restart`) must
// never force every already-connected workspace to re-scan a QR code — their
// credentials are safely on disk (see sessionManager's SESSIONS_DIR), just
// not loaded into memory yet. Reconnect all of them on boot.
sessionManager.resumeAll().catch((e) => console.error("[whatsapp-worker] resumeAll failed:", e));
