#!/usr/bin/env node
/**
 * One command for your own PC:  npx -y github:choolgeunpat/pixel-office
 *
 *  1. sets up Claude Code for every project on this PC (user settings in ~/.claude):
 *     the hook, the six team subagents and the team guide in ~/.claude/CLAUDE.md
 *  2. starts the office on http://localhost:8787 and opens it in the browser
 *
 *  npx -y github:choolgeunpat/pixel-office uninstall   removes everything again
 *  options: --port <n>, --no-open, --no-team-guide
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "../server/index.mjs";
import { Store } from "../server/store.mjs";
import { HOOK_EVENTS } from "../scripts/build-kit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => args.includes(name);
const port = Number(args[args.indexOf("--port") + 1]) || Number(process.env.PORT) || 8787;
const ROOM = "my-local-office";
const officeUrl = `http://localhost:${port}/r/${ROOM}`;

const HOME = os.homedir();
const APP = path.join(HOME, ".pixel-office");
const CLAUDE = path.join(HOME, ".claude");
const SETTINGS = path.join(CLAUDE, "settings.json");
const HOOK = path.join(APP, "hook.mjs");
const MARK = "pixel-office";

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, o: (s) => `\x1b[38;5;209m${s}\x1b[0m` };
const ok = (s) => console.log(`  ${c.g("✓")} ${s}`);

function readSettings() {
  if (!fs.existsSync(SETTINGS)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, "utf8") || "{}");
  } catch {
    console.error(`\n${c.y("!")} ${SETTINGS} 파일을 읽을 수 없어요 (JSON 형식 오류). 파일을 고친 뒤 다시 실행해 주세요.`);
    process.exit(1);
  }
}

function editHooks(add) {
  const s = readSettings();
  const ours = (g) => (g.hooks || []).some((h) => String(h.command || "").includes(MARK));
  s.hooks = s.hooks || {};
  for (const ev of Object.keys(s.hooks)) {
    s.hooks[ev] = s.hooks[ev].filter((g) => !ours(g));
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (add) {
    const command = `node "${HOOK.replace(/\\/g, "/")}"`;
    for (const ev of HOOK_EVENTS) (s.hooks[ev] = s.hooks[ev] || []).push({ hooks: [{ type: "command", command, async: true, timeout: 10 }] });
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  fs.mkdirSync(CLAUDE, { recursive: true });
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + ".before-pixel-office");
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + "\n");
}

const agentFiles = () => fs.readdirSync(path.join(ROOT, "kit", "agents")).filter((f) => f.endsWith(".md"));
const GUIDE_RE = /\n?<!-- pixel-office:team -->[\s\S]*?<!-- \/pixel-office:team -->\n?/;

function setup() {
  console.log(`\n${c.o("▸")} ${c.b("Pixel Office 준비 중…")}`);
  fs.mkdirSync(APP, { recursive: true });
  fs.copyFileSync(path.join(ROOT, "kit", "pixel-office-hook.mjs"), HOOK);
  fs.writeFileSync(path.join(APP, "config.json"), JSON.stringify({ url: officeUrl }, null, 2) + "\n");
  editHooks(true);
  ok("Claude Code 연결 (모든 프로젝트에 적용)");

  const agentsDir = path.join(CLAUDE, "agents");
  fs.mkdirSync(agentsDir, { recursive: true });
  let added = 0;
  for (const f of agentFiles()) {
    const dest = path.join(agentsDir, f);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(ROOT, "kit", "agents", f), dest);
      added++;
    }
  }
  ok(`팀원 6명 (기획·개발·테스트·마케팅·디자인·리뷰)${added ? "" : " — 이미 있음"}`);

  if (!opt("--no-team-guide")) {
    const md = path.join(CLAUDE, "CLAUDE.md");
    const cur = fs.existsSync(md) ? fs.readFileSync(md, "utf8") : "";
    if (!cur.includes("pixel-office:team")) fs.writeFileSync(md, (cur.trim() ? cur.replace(/\s*$/, "\n\n") : "") + fs.readFileSync(path.join(ROOT, "kit", "team-guide.md"), "utf8"));
    ok("Claude가 팀원에게 일을 나눠 맡기도록 안내");
  }
}

function uninstall() {
  console.log(`\n${c.o("▸")} ${c.b("Pixel Office 제거 중…")}`);
  if (fs.existsSync(SETTINGS)) editHooks(false);
  ok("Claude Code 연결 해제");
  for (const f of agentFiles()) {
    const p = path.join(CLAUDE, "agents", f);
    if (fs.existsSync(p) && fs.readFileSync(p, "utf8").includes("small product team")) fs.rmSync(p);
  }
  ok("팀원 6명 제거");
  const md = path.join(CLAUDE, "CLAUDE.md");
  if (fs.existsSync(md)) fs.writeFileSync(md, fs.readFileSync(md, "utf8").replace(GUIDE_RE, "\n"));
  ok("CLAUDE.md 안내 제거");
  fs.rmSync(APP, { recursive: true, force: true });
  ok("~/.pixel-office 삭제");
  console.log(`\n깨끗하게 지웠어요. 👋\n`);
}

function openBrowser(url) {
  if (opt("--no-open")) return;
  const cmd = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // no browser here; the address is printed anyway
  }
}

async function alreadyRunning() {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(800) });
    return r.ok && (await r.json()).ok === true;
  } catch {
    return false;
  }
}

async function start() {
  if (await alreadyRunning()) {
    console.log(`\n사무실이 이미 열려 있어요 → ${c.b(officeUrl)}\n`);
    openBrowser(officeUrl);
    return;
  }
  const store = new Store({ dataDir: path.join(APP, "data") });
  const server = createServer({ store });
  server.on("error", (e) => {
    console.error(`\n${c.y("!")} ${port}번 포트를 쓸 수 없어요 (${e.code}). 다른 번호로 실행해 보세요:  npx -y github:choolgeunpat/pixel-office --port 8790`);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`\n${c.o("🏢")} ${c.b("사무실이 열렸어요!")}  ${officeUrl}\n`);
    console.log(`   이제 평소처럼 Claude Code를 쓰면 팀원들이 출근해요.`);
    console.log(`   (이미 켜져 있던 Claude Code는 한 번 껐다 켜 주세요)`);
    console.log(`   이 창을 닫으면 사무실도 닫혀요. 다음에 볼 때는 같은 명령을 다시 실행하세요.\n`);
    openBrowser(officeUrl);
  });
  const save = () => {
    try {
      store.save();
    } catch {
      // nothing to save
    }
  };
  setInterval(save, 60_000).unref();
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () => {
      save();
      process.exit(0);
    });
}

if (args[0] === "uninstall") uninstall();
else {
  setup();
  await start();
}
