/**
 * Demo: a scripted Claude Code session emitting real hook-shaped payloads
 * (the same JSON the hook script forwards), looping over a few projects.
 */

const SESSION = "demo-session";

const PROJECTS = [
  {
    prompt: "신제품 랜딩페이지 기획부터 출시 홍보 문구까지 진행해줘",
    todos: ["요구사항 정리 및 PRD 작성", "랜딩페이지 UI 디자인", "페이지 구현", "테스트 작성 및 실행", "출시 홍보 문구 작성", "코드 리뷰"],
    steps: [
      ["planner", "PRD 작성", [["Read", { file_path: "docs/brief.md" }], ["WebSearch", { query: "2026 SaaS 랜딩페이지 트렌드" }], ["Write", { file_path: "docs/PRD.md" }]], "PRD 완료: 핵심 기능 3개, 타깃 2그룹 정리"],
      ["designer", "히어로 섹션 디자인", [["Read", { file_path: "docs/PRD.md" }], ["Write", { file_path: "design/tokens.css" }], ["Edit", { file_path: "design/hero.html" }]], "디자인 토큰 + 히어로 시안 완성"],
      ["developer", "랜딩페이지 구현", [["Glob", { pattern: "src/**/*.tsx" }], ["Write", { file_path: "src/app/page.tsx" }], ["Edit", { file_path: "src/components/Hero.tsx" }], ["Bash", { command: "npm run build", description: "빌드" }]], "구현 완료, 빌드 통과"],
      ["tester", "E2E 테스트", [["Write", { file_path: "tests/landing.spec.ts" }], ["Bash", { command: "npx playwright test", description: "E2E 테스트 실행" }, true], ["Edit", { file_path: "tests/landing.spec.ts" }], ["Bash", { command: "npx playwright test", description: "E2E 재실행" }]], "테스트 12개 모두 통과 ✅"],
      ["marketer", "출시 홍보 문구", [["Read", { file_path: "docs/PRD.md" }], ["WebSearch", { query: "경쟁사 출시 카피 사례" }], ["Write", { file_path: "marketing/launch-copy.md" }]], "카피 3안 + SNS 문구 작성"],
      ["reviewer", "최종 코드 리뷰", [["Grep", { pattern: "TODO|FIXME" }], ["Read", { file_path: "src/app/page.tsx" }]], "리뷰 완료: 블로커 없음"],
    ],
  },
  {
    prompt: "로그인 API에 레이트 리밋 추가하고 문서도 업데이트해줘",
    todos: ["현재 인증 구조 분석", "레이트 리밋 미들웨어 구현", "부하 테스트", "API 문서 업데이트", "보안 리뷰"],
    steps: [
      ["Explore", "인증 구조 분석", [["Grep", { pattern: "login" }], ["Read", { file_path: "src/auth/login.ts" }], ["Read", { file_path: "src/middleware/index.ts" }]], "로그인 흐름 3단계 파악"],
      ["developer", "레이트 리밋 구현", [["Write", { file_path: "src/middleware/rateLimit.ts" }], ["Edit", { file_path: "src/auth/login.ts" }], ["Bash", { command: "npm test -- auth", description: "단위 테스트" }]], "슬라이딩 윈도우 방식으로 구현"],
      ["tester", "부하 테스트", [["Bash", { command: "k6 run load/login.js", description: "부하 테스트" }]], "초당 500 요청에서 429 정상 응답"],
      ["marketer", "API 문서 업데이트", [["Edit", { file_path: "docs/api/auth.md" }], ["Write", { file_path: "CHANGELOG.md" }]], "문서 + 체인지로그 반영"],
      ["security-reviewer", "보안 리뷰", [["Read", { file_path: "src/middleware/rateLimit.ts" }], ["Grep", { pattern: "x-forwarded-for" }]], "IP 스푸핑 대비 확인 완료"],
    ],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => a + Math.random() * (b - a);

export function startDemo(emit, { speed = 1 } = {}) {
  let stopped = false;
  let n = 0;
  const wait = (ms) => sleep(ms / speed);
  const base = { session_id: SESSION, cwd: "/workspace/acme-landing", _pixel: { repo: "acme-landing" } };
  const send = (o) => !stopped && emit({ ...base, ...o });
  let useId = 0;
  const tool = async (name, input, agent, fail = false) => {
    const id = `toolu_${++useId}`;
    const a = agent ? { agent_id: agent.id, agent_type: agent.type } : {};
    send({ hook_event_name: "PreToolUse", tool_name: name, tool_input: input, tool_use_id: id, ...a });
    await wait(jitter(900, 2400));
    if (fail) send({ hook_event_name: "PostToolUseFailure", tool_name: name, tool_use_id: id, error: "2 tests failed", ...a });
    else send({ hook_event_name: "PostToolUse", tool_name: name, tool_use_id: id, tool_response: { success: true }, ...a });
    await wait(jitter(300, 700));
  };

  (async () => {
    send({ hook_event_name: "SessionStart", source: "startup" });
    await wait(1500);
    while (!stopped) {
      const p = PROJECTS[n++ % PROJECTS.length];
      send({ hook_event_name: "UserPromptSubmit", prompt: p.prompt });
      await wait(1800);
      const todos = p.todos.map((content) => ({ content, status: "pending", activeForm: content }));
      await tool("TodoWrite", { todos }, null);
      // run steps; the 2nd and 3rd overlap to show parallel work
      const runStep = async (s, i) => {
        const [type, desc, calls, result] = s;
        todos[i].status = "in_progress";
        await tool("TodoWrite", { todos: todos.map((t) => ({ ...t })) }, null);
        const agent = { id: `agent_${n}_${i}`, type };
        const tid = `toolu_task_${n}_${i}`;
        send({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { subagent_type: type, description: desc, prompt: desc }, tool_use_id: tid });
        await wait(700);
        send({ hook_event_name: "SubagentStart", agent_id: agent.id, agent_type: type });
        await wait(1200);
        for (const [name, input, fail] of calls) {
          if (stopped) return;
          await tool(name, input, agent, !!fail);
        }
        send({ hook_event_name: "SubagentStop", agent_id: agent.id, agent_type: type, last_assistant_message: result });
        send({ hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: tid, tool_response: { success: true } });
        todos[i].status = "completed";
        await tool("TodoWrite", { todos: todos.map((t) => ({ ...t })) }, null);
      };
      await runStep(p.steps[0], 0);
      if (p.steps.length > 3) {
        await Promise.all([runStep(p.steps[1], 1), wait(1500).then(() => runStep(p.steps[2], 2))]);
        for (let i = 3; i < p.steps.length; i++) await runStep(p.steps[i], i);
      } else for (let i = 1; i < p.steps.length; i++) await runStep(p.steps[i], i);
      if (Math.random() < 0.5) {
        send({ hook_event_name: "Notification", message: "git push 실행 승인을 기다리고 있어요" });
        await wait(3500);
      }
      await tool("Bash", { command: "git commit -am 'feat: done'", description: "변경사항 커밋" }, null);
      send({ hook_event_name: "Stop", last_assistant_message: "모든 작업을 완료했어요! 결과를 확인해 주세요 🎉" });
      await wait(9000);
    }
  })();
  return () => {
    stopped = true;
  };
}
