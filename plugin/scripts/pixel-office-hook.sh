#!/usr/bin/env bash
# Pixel Office hook — forwards Claude Code hook events to your Pixel Office room.
#
# Reads the hook JSON on stdin and POSTs it to your room page (e.g.
# https://office.example.com/r/abc123…), taken from $PIXEL_OFFICE_URL or, if that is
# unset, from .claude/pixel-office.url. Without either it does nothing.
# It never blocks or fails Claude: every error is swallowed and it always exits 0.
# Large fields (tool output, file contents) are dropped before sending when node is available;
# the server clips everything again and never stores raw payloads.

url="${PIXEL_OFFICE_URL:-}"
if [ -z "$url" ]; then
  for f in "${CLAUDE_PROJECT_DIR:-.}/.claude/pixel-office.url" "$(dirname "$0")/../pixel-office.url"; do
    if [ -f "$f" ]; then
      url="$(head -n 1 "$f" | tr -d '[:space:]')"
      break
    fi
  done
fi
if [ -z "$url" ]; then
  cat >/dev/null
  exit 0
fi

url="${url%%\?*}"
url="${url%%#*}"
case "$url" in
  */r/*) ;;
  *) cat >/dev/null; exit 0 ;;
esac
base="${url%%/r/*}"
key="${url##*/r/}"
key="${key%%/*}"
endpoint="$base/api/r/$key/events"

payload="$(cat)"

if command -v node >/dev/null 2>&1; then
  slim="$(printf '%s' "$payload" | node -e '
let s = "";
process.stdin.on("data", (c) => (s += c)).on("end", () => {
  try {
    const j = JSON.parse(s);
    const clip = (v, n) => (typeof v === "string" && v.length > n ? v.slice(0, n) : v);
    const r = j.tool_response;
    if (r !== undefined) {
      j.tool_response = r && typeof r === "object" ? { is_error: r.is_error, success: r.success, error: clip(r.error, 300) } : {};
    }
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
    const path = require("path");
    j._pixel = { repo: j.cwd ? path.basename(j.cwd) : undefined, remote: process.env.CLAUDE_CODE_REMOTE_SESSION_ID || undefined };
    process.stdout.write(JSON.stringify(j));
  } catch {
    process.stdout.write(s);
  }
});' 2>/dev/null)" && [ -n "$slim" ] && payload="$slim"
fi

printf '%s' "$payload" | curl -sS -m 4 -o /dev/null -X POST -H 'content-type: application/json' --data-binary @- "$endpoint" >/dev/null 2>&1 || true
exit 0
