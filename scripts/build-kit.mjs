#!/usr/bin/env node
/**
 * Builds the distributable kit from kit/:
 *   kit/install.sh            self-contained installer (hook + agents + team guide embedded)
 *   plugin/                   Claude Code plugin (hooks, agents) for /plugin install
 * `npm test` fails when these are out of date.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kit = (p) => path.join(ROOT, "kit", p);
const read = (p) => fs.readFileSync(p, "utf8");

export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "Notification",
  "PreCompact",
  "SessionEnd",
];

export function buildOutputs() {
  const version = JSON.parse(read(path.join(ROOT, "package.json"))).version;
  const hook = read(kit("pixel-office-hook.sh")).trimEnd();
  const guide = read(kit("team-guide.md")).trimEnd();
  const agents = fs
    .readdirSync(kit("agents"))
    .filter((f) => f.endsWith(".md"))
    .sort();
  const agentWrites = agents
    .map((f) => {
      const dest = `.claude/agents/${f}`;
      return [
        `  if [ -f ${dest} ] && [ "$FORCE" != 1 ]; then skip "${dest} exists (use --force to replace)"; else`,
        `    write ${dest} <<'PIXEL_OFFICE_EOF'`,
        read(kit(`agents/${f}`)).trimEnd(),
        `PIXEL_OFFICE_EOF`,
        `    ok "${dest}"`,
        `  fi`,
      ].join("\n");
    })
    .join("\n");
  const install = read(kit("install.template.sh"))
    .replace("__HOOK_EVENTS__", JSON.stringify(HOOK_EVENTS))
    .replace("__AGENT_NAMES__", agents.map((f) => f.replace(/\.md$/, "")).join(" "))
    .replace("__HOOK_SCRIPT__", () => hook)
    .replace("__AGENT_WRITES__", () => agentWrites)
    .replace("__TEAM_GUIDE__", () => guide);

  const out = { "kit/install.sh": install };
  const cmd = 'bash "${CLAUDE_PLUGIN_ROOT}/scripts/pixel-office-hook.sh"';
  const hooks = { hooks: Object.fromEntries(HOOK_EVENTS.map((e) => [e, [{ hooks: [{ type: "command", command: cmd, async: true, timeout: 10 }] }]])) };
  out["plugin/hooks/hooks.json"] = JSON.stringify(hooks, null, 2) + "\n";
  out["plugin/scripts/pixel-office-hook.sh"] = hook + "\n";
  for (const f of agents) out[`plugin/agents/${f}`] = read(kit(`agents/${f}`));
  out["plugin/.claude-plugin/plugin.json"] =
    JSON.stringify(
      {
        name: "pixel-office",
        version,
        description: "Stream your Claude Code session to a live pixel-art office, with a six-person subagent team (planner, developer, tester, marketer, designer, reviewer).",
        author: { name: "choolgeunpat" },
        homepage: "https://github.com/choolgeunpat/pixel-office",
        license: "MIT",
      },
      null,
      2,
    ) + "\n";
  out[".claude-plugin/marketplace.json"] =
    JSON.stringify(
      {
        name: "pixel-office",
        owner: { name: "choolgeunpat" },
        plugins: [{ name: "pixel-office", source: "./plugin", description: "Live pixel-art office for your Claude Code sessions + a six-person subagent team." }],
      },
      null,
      2,
    ) + "\n";
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [rel, content] of Object.entries(buildOutputs())) {
    const p = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    if (rel.endsWith(".sh")) fs.chmodSync(p, 0o755);
    console.log("wrote", rel);
  }
}
