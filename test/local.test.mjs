import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "bin/pixel-office.mjs");

test("npx launcher sets up ~/.claude, serves the local office, and uninstalls cleanly", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "po-home-"));
  fs.mkdirSync(path.join(home, ".claude"));
  const mine = { model: "opus", hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } };
  fs.writeFileSync(path.join(home, ".claude/settings.json"), JSON.stringify(mine));
  fs.writeFileSync(path.join(home, ".claude/CLAUDE.md"), "# my notes\n");
  const env = { ...process.env, HOME: home, USERPROFILE: home, PIXEL_OFFICE_URL: "" };
  const port = 8800 + Math.floor(Math.random() * 100);

  const proc = spawn(process.execPath, [BIN, "--port", String(port), "--no-open"], { env });
  try {
    let out = "";
    await new Promise((resolve, reject) => {
      proc.stdout.on("data", (d) => (out += d) && /사무실이 열렸어요/.test(out) && resolve());
      proc.on("exit", () => reject(new Error(out)));
    });
    const s = JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8"));
    assert.equal(s.model, "opus");
    assert.equal(s.hooks.Stop.length, 2);
    assert.match(s.hooks.PreToolUse[0].hooks[0].command, /\.pixel-office\/hook\.mjs"$/);
    assert.ok(fs.existsSync(path.join(home, ".claude/agents/tester.md")));
    assert.match(fs.readFileSync(path.join(home, ".claude/CLAUDE.md"), "utf8"), /^# my notes\n\n<!-- pixel-office:team -->/);

    // the installed hook finds the local office through ~/.pixel-office/config.json
    execFileSync(process.execPath, [path.join(home, ".pixel-office/hook.mjs")], {
      env,
      input: JSON.stringify({ session_id: "s", hook_event_name: "UserPromptSubmit", prompt: "hi", cwd: "/x/proj" }),
    });
    const list = await (await fetch(`http://127.0.0.1:${port}/api/r/my-local-office/events`)).json();
    assert.equal(list.events[0].kind, "prompt");
  } finally {
    proc.kill();
  }

  execFileSync(process.execPath, [BIN, "uninstall"], { env });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, ".claude/settings.json"), "utf8")), mine);
  assert.ok(!fs.existsSync(path.join(home, ".claude/agents/tester.md")));
  assert.ok(!fs.existsSync(path.join(home, ".pixel-office")));
  assert.doesNotMatch(fs.readFileSync(path.join(home, ".claude/CLAUDE.md"), "utf8"), /pixel-office/);
});
