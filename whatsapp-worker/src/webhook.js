"use strict";

/** Pushes events (inbound messages, connection status changes) to the
 * FastAPI backend. Internal service-to-service call, authenticated with a
 * shared secret — this worker is never exposed publicly (see
 * docker-compose.yml: no published port), but the secret is defense in depth
 * in case that ever changes. */

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
const SECRET = process.env.INTERNAL_SHARED_SECRET || "";

async function postToBackend(path, body) {
  const url = `${BACKEND_URL}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SECRET,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[webhook] backend rejected ${path}: ${res.status} ${await res.text()}`);
    }
  } catch (exc) {
    console.error(`[webhook] failed to reach backend at ${url}:`, exc.message);
  }
}

function notifyMessage(workspaceId, message) {
  return postToBackend("/api/v1/messaging/whatsapp-web/webhook/message", {
    workspace_id: workspaceId,
    ...message,
  });
}

function notifyStatus(workspaceId, status, extra) {
  return postToBackend("/api/v1/messaging/whatsapp-web/webhook/status", {
    workspace_id: workspaceId,
    status,
    ...(extra || {}),
  });
}

function notifyHistory(workspaceId, messages) {
  return postToBackend("/api/v1/messaging/whatsapp-web/webhook/history", {
    workspace_id: workspaceId,
    messages,
  });
}

module.exports = { notifyMessage, notifyStatus, notifyHistory };
