#!/usr/bin/env node
/**
 * Pixel Office hook (Node, cross-platform) — used by `npx github:choolgeunpat/pixel-office`.
 *
 * Reads the hook JSON on stdin, drops bulky fields (file contents, tool output) and POSTs it
 * to the office: $PIXEL_OFFICE_URL, else ~/.pixel-office/config.json (the local office).
 * Never blocks or fails Claude: errors are ignored and it always exits 0.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function roomUrl() {
  if (process.env.PIXEL_OFFICE_URL) return process.env.PIXEL_OFFICE_URL;
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".pixel-office", "config.json"), "utf8")).url;
  } catch {
    return null;
  }
}

function slim(j, clip = (v, n) => (typeof v === "string" && v.length > n ? v.slice(0, n) : v)) {
  const r = j.tool_response;
  if (r !== undefined) j.tool_response = r && typeof r === "object" ? { is_error: r.is_error, success: r.success, error: clip(r.error, 300) } : {};
  if (j.tool_input && typeof j.tool_input === "object") {
    for (const k of Object.keys(j.tool_input)) {
      const v = j.tool_input[k];
      if (k === "todos") continue;
      if (["content", "old_string", "new_string", "new_source"].includes(k)) delete j.tool_input[k];
      else if (typeof v === "string") j.tool_input[k] = clip(v, 400);
      else if (v && typeof v === "object") delete j.tool_input[k];
    }
  }
  for (const k of ["prompt", "last_assistant_message", "message", "error"]) if (j[k]) j[k] = clip(j[k], 600);
  delete j.transcript_path;
  j._pixel = { repo: j.cwd ? path.basename(j.cwd) : undefined, remote: process.env.CLAUDE_CODE_REMOTE_SESSION_ID || undefined };
  return j;
}

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", async () => {
  try {
    const m = String(roomUrl() || "").match(/^(https?:\/\/[^/?#]+)\/r\/([A-Za-z0-9_-]+)/);
    if (m) {
      await fetch(`${m[1]}/api/r/${m[2]}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(slim(JSON.parse(input))),
        signal: AbortSignal.timeout(2500),
      });
    }
  } catch {
    // the office may simply not be open right now
  }
  process.exit(0);
});
