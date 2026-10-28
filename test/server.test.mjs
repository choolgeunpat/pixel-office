import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../server/index.mjs";
import { Store } from "../server/store.mjs";
import { buildOutputs } from "../scripts/build-kit.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let server;
let url;
const KEY = "testroomkey123456";

before(async () => {
  server = createServer({ store: new Store() });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test("hook payloads are normalized, stored and listed", async () => {
  const res = await fetch(`${url}/api/r/${KEY}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([
      { session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "hi" },
      { session_id: "s", hook_event_name: "Unknown" },
    ]),
  });
  assert.deepEqual(await res.json(), { accepted: 1 });
  const list = await (await fetch(`${url}/api/r/${KEY}/events`)).json();
  assert.equal(list.events.length, 1);
  assert.equal(list.events[0].kind, "prompt");
  assert.equal(list.events[0].id, 1);
});

test("SSE stream sends a snapshot then live events", async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${url}/api/r/${KEY}/stream`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const until = async (re) => {
    while (!re.test(buf)) buf += dec.decode((await reader.read()).value);
  };
  await until(/event: snapshot/);
  await fetch(`${url}/api/r/${KEY}/events`, { method: "POST", body: JSON.stringify({ session_id: "s", hook_event_name: "Stop" }) });
  await until(/event: ev\ndata: .*"kind":"stop"/);
  ctrl.abort();
});

test("bad keys, bad json and the SPA routes", async () => {
  assert.equal((await fetch(`${url}/api/r/short/events`, { method: "POST", body: "{}" })).status, 400);
  assert.equal((await fetch(`${url}/api/r/${KEY}/events`, { method: "POST", body: "{nope" })).status, 400);
  for (const p of ["/", "/demo", `/r/${KEY}`]) assert.match(await (await fetch(url + p)).text(), /Pixel Office/);
  assert.equal((await fetch(`${url}/../package.json`)).status, 404);
  assert.match(await (await fetch(`${url}/install.sh`)).text(), /Pixel Office installer/);
});

test("generated kit files are up to date (run npm run build:kit)", () => {
  for (const [rel, content] of Object.entries(buildOutputs())) assert.equal(fs.readFileSync(path.join(ROOT, rel), "utf8"), content, rel);
});

test("hook script forwards to the room derived from PIXEL_OFFICE_URL and stays silent without it", async () => {
  const hook = path.join(ROOT, "kit/pixel-office-hook.sh");
  const input = JSON.stringify({ session_id: "h", hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "/a/b.txt", content: "SECRET" }, cwd: "/w/proj" });
  execFileSync("bash", [hook], { input, env: { ...process.env, PIXEL_OFFICE_URL: "" } });
  // run asynchronously: the server lives in this process
  await new Promise((resolve, reject) => {
    import("node:child_process").then(({ execFile }) => {
      const p = execFile("bash", [hook], { env: { ...process.env, PIXEL_OFFICE_URL: `${url}/r/hookroom12345678?x=1` } }, (err) => (err ? reject(err) : resolve()));
      p.stdin.end(input);
    });
  });
  const list = await (await fetch(`${url}/api/r/hookroom12345678/events`)).json();
  assert.equal(list.events.length, 1);
  assert.equal(list.events[0].target, "a/b.txt");
  assert.equal(list.events[0].project, "proj");
});

test("installer adds hooks idempotently and uninstalls cleanly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "po-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  fs.mkdirSync(path.join(dir, ".claude"));
  fs.writeFileSync(path.join(dir, ".claude/settings.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } }));
  const env = { ...process.env, PIXEL_OFFICE_URL: "" };
  const sh = path.join(ROOT, "kit/install.sh");
  execFileSync("bash", [sh, "--team-guide"], { cwd: dir, env });
  execFileSync("bash", [sh], { cwd: dir, env });
  const s = JSON.parse(fs.readFileSync(path.join(dir, ".claude/settings.json"), "utf8"));
  assert.equal(s.hooks.Stop.length, 2);
  assert.equal(s.hooks.PreToolUse.length, 1);
  assert.ok(fs.existsSync(path.join(dir, ".claude/agents/planner.md")));
  assert.match(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), /^<!-- pixel-office:team -->/);
  execFileSync("bash", [sh, "--uninstall"], { cwd: dir, env });
  const u = JSON.parse(fs.readFileSync(path.join(dir, ".claude/settings.json"), "utf8"));
  assert.deepEqual(u, { hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } });
  assert.ok(!fs.existsSync(path.join(dir, ".claude/agents/planner.md")));
  assert.ok(!fs.existsSync(path.join(dir, ".claude/hooks/pixel-office.sh")));
  assert.doesNotMatch(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), /pixel-office/);
});
