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
    { text: "a", status: "completed" },
    { text: "b", status: "pending" },
  ]);
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
