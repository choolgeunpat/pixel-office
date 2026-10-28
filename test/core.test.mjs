import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../public/lib/normalize.js";
import { roleFor } from "../public/lib/roles.js";
import { apply, createOffice, deskLook, listSessions } from "../public/lib/state.js";

const T0 = 1_700_000_000_000;
const base = { session_id: "s1", cwd: "/work/acme" };

test("roleFor maps bundled, built-in and plugin agent types to desks", () => {
  assert.equal(roleFor(null), "lead");
  assert.equal(roleFor("planner"), "plan");
  assert.equal(roleFor("Plan"), "plan");
  assert.equal(roleFor("Explore"), "plan");
  assert.equal(roleFor("developer"), "dev");
  assert.equal(roleFor("general-purpose"), "dev");
  assert.equal(roleFor("tester"), "test");
  assert.equal(roleFor("debugger"), "test");
  assert.equal(roleFor("marketer"), "mkt");
  assert.equal(roleFor("designer"), "design");
  assert.equal(roleFor("reviewer"), "review");
  assert.equal(roleFor("pixel-office:reviewer"), "review");
  assert.equal(roleFor("security-reviewer"), "review");
  assert.ok(["plan", "dev", "test", "mkt", "design", "review"].includes(roleFor("something-unknown")));
});

test("normalize clips content and never keeps tool output", () => {
  const ev = normalize({ ...base, hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "/work/acme/src/a/b.ts", content: "x".repeat(10000) } }, T0);
  assert.equal(ev.kind, "tool_start");
  assert.equal(ev.target, "a/b.ts");
  assert.ok(!JSON.stringify(ev).includes("xxxx"));
  const post = normalize({ ...base, hook_event_name: "PostToolUse", tool_name: "Read", tool_response: { file: { content: "secret" } } }, T0);
  assert.equal(post.ok, true);
  assert.ok(!JSON.stringify(post).includes("secret"));
  assert.equal(normalize({ ...base, hook_event_name: "SomethingNew" }), null);
  assert.equal(normalize("nope"), null);
});

test("normalize reads delegation and todos", () => {
  const ev = normalize({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { subagent_type: "planner", description: "PRD 작성", prompt: "long" } }, T0);
  assert.deepEqual(ev.delegate, { type: "planner", description: "PRD 작성" });
  const td = normalize({ ...base, hook_event_name: "PreToolUse", tool_name: "TodoWrite", tool_input: { todos: [{ content: "a", status: "completed" }, { content: "b", status: "weird" }] } }, T0);
  assert.deepEqual(td.todos, [
    { text: "a", active: "a", status: "completed" },
    { text: "b", active: "b", status: "pending" },
  ]);
  const act = normalize({ ...base, hook_event_name: "PreToolUse", tool_name: "TodoWrite", tool_input: { todos: [{ content: "Fix login", activeForm: "Fixing login", status: "in_progress" }] } }, T0);
  assert.equal(act.todos[0].active, "Fixing login");
  const bash = (command) => normalize({ ...base, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }, T0).cmdKind;
  assert.equal(bash("npm test -- auth"), "test");
  assert.equal(bash("npm install lodash"), "install");
  assert.equal(bash("git commit -m x"), "git");
  assert.equal(bash("npm run build"), "build");
  assert.equal(bash("ls -la"), "look");
  assert.equal(bash("node server.js"), "run");
});

function run(raws) {
  const o = createOffice("s1");
  raws.forEach((r, i) => apply(o, normalize({ ...base, ...r }, T0 + i * 1000)));
  return o;
}

test("a delegated subagent arrives, works, finishes", () => {
  const o = run([
    { hook_event_name: "UserPromptSubmit", prompt: "랜딩 만들어줘" },
    { hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { subagent_type: "developer", description: "구현" } },
    { hook_event_name: "SubagentStart", agent_id: "a1", agent_type: "developer" },
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "src/x.ts" }, agent_id: "a1", agent_type: "developer" },
  ]);
  const dev = o.desks.dev;
  assert.equal(dev.phase, "tool");
  assert.equal(dev.task, "구현");
  assert.equal(deskLook(dev, T0 + 4000).anim, "interact");
  assert.equal(o.request, "랜딩 만들어줘");
  assert.equal(o.stats.delegations, 1);

  apply(o, normalize({ ...base, hook_event_name: "PostToolUse", tool_name: "Edit", agent_id: "a1", agent_type: "developer" }, T0 + 5000));
  apply(o, normalize({ ...base, hook_event_name: "SubagentStop", agent_id: "a1", agent_type: "developer", last_assistant_message: "끝" }, T0 + 6000));
  assert.equal(deskLook(dev, T0 + 7000).anim, "happy");
  assert.equal(deskLook(dev, T0 + 20_000).anim, "sit");
  assert.equal(deskLook(dev, T0 + 6000 + 120_000).anim, "sleep");
  assert.equal(deskLook(dev, T0 + 6000 + 600_000).present, false);
  assert.equal(deskLook(o.desks.test, T0).present, false);
});

test("failures make the desk sad, then recover", () => {
  const o = run([
    { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm test" } },
    { hook_event_name: "PostToolUseFailure", tool_name: "Bash", error: "exit 1" },
  ]);
  assert.equal(deskLook(o.desks.lead, T0 + 1500).anim, "sad");
  assert.equal(o.stats.errors, 1);
  assert.notEqual(deskLook(o.desks.lead, T0 + 10_000).anim, "sad");
});

test("listSessions orders by latest activity and picks the first prompt as title", () => {
  const evs = [
    normalize({ session_id: "a", hook_event_name: "UserPromptSubmit", prompt: "first" }, 1),
    normalize({ session_id: "b", hook_event_name: "SessionStart" }, 2),
    normalize({ session_id: "a", hook_event_name: "UserPromptSubmit", prompt: "second" }, 3),
  ];
  const s = listSessions(evs);
  assert.deepEqual(
    s.map((x) => [x.id, x.title, x.count]),
    [
      ["a", "first", 2],
      ["b", "", 1],
    ],
  );
});

test("requests become tickets, finished work earns coins and the company levels up", async () => {
  const { Economy, levelFor } = await import("../public/lib/economy.js");
  const o = run([
    { hook_event_name: "UserPromptSubmit", prompt: "질문이에요" },
    { hook_event_name: "Stop", last_assistant_message: "답변이에요" },
    { hook_event_name: "UserPromptSubmit", prompt: "코드 고쳐줘" },
    { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "a.ts" } },
    { hook_event_name: "PreToolUse", tool_name: "TodoWrite", tool_input: { todos: [{ content: "a", status: "completed" }, { content: "b", status: "completed" }] } },
    { hook_event_name: "Stop", last_assistant_message: "고쳤어요" },
  ]);
  assert.deepEqual(
    o.tickets.map((t) => [t.title, t.status, t.tools]),
    [
      ["질문이에요", "done", 0],
      ["코드 고쳐줘", "done", 2],
    ],
  );
  // plain question 5 + request with tools 10 + two checked-off to-dos 2×2
  assert.equal(o.earned, 5 + 10 + 4);

  const e = new Economy(null);
  assert.equal(e.level.name, "1인 기업");
  const first = e.add(45, 1000);
  assert.equal(first.levelUp.name, "스타트업");
  assert.equal(levelFor(1500).name, "유니콘");
});

test("coins are counted once even when the same events are replayed", async () => {
  const { Economy } = await import("../public/lib/economy.js");
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) };
  try {
    const a = new Economy("k");
    a.add(10, 5);
    a.add(10, 5); // same millisecond, a second reward
    a.add(10, 6);
    assert.equal(a.coins, 30);
    const b = new Economy("k"); // page reload: the server replays the same events
    b.add(10, 5);
    b.add(10, 5);
    b.add(10, 6);
    assert.equal(b.coins, 30);
    b.add(10, 7);
    assert.equal(b.coins, 40);
  } finally {
    delete globalThis.localStorage;
  }
});

test("idle workers take a coffee break, then nap", () => {
  const o = run([
    { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "a.md" }, agent_id: "a1", agent_type: "planner" },
    { hook_event_name: "SubagentStop", agent_id: "a1", agent_type: "planner" },
  ]);
  const plan = o.desks.plan;
  const t = plan.lastTs;
  assert.equal(deskLook(plan, t + 10_000).coffee, false);
  assert.equal(deskLook(plan, t + 30_000).coffee, true);
  assert.equal(deskLook(plan, t + 30_000).status, "커피 타임");
  assert.equal(deskLook(plan, t + 100_000).anim, "sleep");
});

test("tool wording is plain language", async () => {
  const { action } = await import("../public/lib/plain.js");
  assert.equal(action("Read", "/w/src/a/b.ts").long, "자료를 읽고 있어요");
  assert.equal(action("Read", "/w/src/a/b.ts").detail, "b.ts");
  assert.equal(action("Bash", "", "test").short, "테스트 중");
  assert.equal(action("Edit", "x/login.tsx").short, "수정하는 중");
  assert.equal(action("mcp__slack__post", "").long, "연결된 앱을 쓰고 있어요");
});

test("cat sprites: five breeds with the animation rows the behaviour needs", async () => {
  const fs = await import("node:fs");
  const meta = JSON.parse(fs.readFileSync(new URL("../public/assets/cats/metadata.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(meta.cats).length, 5);
  for (const a of ["walk", "sit", "wash", "sleep", "stretch", "jump"]) assert.ok(meta.animations[a], a);
  for (const c of Object.values(meta.cats)) assert.ok(fs.existsSync(new URL(`../public/assets/cats/${c.file}`, import.meta.url)), c.file);
});
