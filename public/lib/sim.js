/**
 * Demo: a scripted Claude Code session emitting real hook-shaped payloads
 * (the same JSON the hook script forwards), looping over a few projects.
 */

const SESSION = "demo-session";

const PROJECTS = [
  {
    prompt: "신제품 랜딩페이지 기획부터 출시 홍보 문구까지 진행해줘",
    todos: [
      ["요구사항 정리하기", "요구사항을 정리하는 중"],
      ["랜딩페이지 화면 디자인", "화면을 디자인하는 중"],
      ["페이지 만들기", "페이지를 만드는 중"],
      ["잘 되는지 테스트하기", "테스트를 돌리는 중"],
      ["출시 홍보 문구 쓰기", "홍보 문구를 쓰는 중"],
      ["마지막 점검", "마지막으로 점검하는 중"],
    ],
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
    todos: [
      ["로그인 구조 살펴보기", "로그인 구조를 살펴보는 중"],
      ["요청 횟수 제한 만들기", "요청 횟수 제한을 만드는 중"],
      ["많이 몰려도 괜찮은지 테스트", "부하 테스트를 하는 중"],
      ["사용 설명서 업데이트", "설명서를 고치는 중"],
      ["보안 점검", "보안을 점검하는 중"],
    ],
    steps: [
      ["Explore", "인증 구조 분석", [["Grep", { pattern: "login" }], ["Read", { file_path: "src/auth/login.ts" }], ["Read", { file_path: "src/middleware/index.ts" }]], "로그인 흐름 3단계 파악"],
      ["developer", "레이트 리밋 구현", [["Write", { file_path: "src/middleware/rateLimit.ts" }], ["Edit", { file_path: "src/auth/login.ts" }], ["Bash", { command: "npm test -- auth", description: "단위 테스트" }]], "슬라이딩 윈도우 방식으로 구현"],
      ["tester", "부하 테스트", [["Bash", { command: "k6 run load/login.js", description: "부하 테스트" }]], "초당 500 요청에서 429 정상 응답"],
      ["marketer", "API 문서 업데이트", [["Edit", { file_path: "docs/api/auth.md" }], ["Write", { file_path: "CHANGELOG.md" }]], "문서 + 체인지로그 반영"],
      ["security-reviewer", "보안 리뷰", [["Read", { file_path: "src/middleware/rateLimit.ts" }], ["Grep", { pattern: "x-forwarded-for" }]], "IP 스푸핑 대비 확인 완료"],
    ],
  },
];

/** plain questions and writing — no code, just the lead working */
const CHATS = [
  { prompt: "다음 주 팀 회식 장소 후보 3곳만 추천해줘", search: "강남역 단체 회식 맛집", answer: "예산과 분위기별로 3곳 골랐어요. 1) 고기집 2) 이자카야 3) 한식 코스 — 비교표도 같이 드렸어요." },
  { prompt: "이 이메일 좀 더 정중하게 고쳐줘", answer: "문장을 부드럽게 다듬고, 첫 인사와 마무리를 정리했어요. 바로 보내셔도 돼요." },
  { prompt: "엑셀 매출 파일에서 지난달 제일 많이 팔린 상품이 뭐야?", read: "매출_정리.xlsx", answer: "지난달 1위는 '프리미엄 세트'예요. 전체 매출의 31%를 차지했어요." },
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

  const chat = async (c) => {
    send({ hook_event_name: "UserPromptSubmit", prompt: c.prompt });
    await wait(2600);
    if (c.search) await tool("WebSearch", { query: c.search }, null);
    if (c.read) await tool("Read", { file_path: `/work/${c.read}` }, null);
    await wait(1500);
    send({ hook_event_name: "Stop", last_assistant_message: c.answer });
    await wait(9000);
  };

  (async () => {
    send({ hook_event_name: "SessionStart", source: "startup" });
    await wait(1500);
    while (!stopped) {
      if (n % 3 === 1) {
        await chat(CHATS[Math.floor(n / 3) % CHATS.length]);
        n++;
        continue;
      }
      const p = PROJECTS[n++ % PROJECTS.length];
      send({ hook_event_name: "UserPromptSubmit", prompt: p.prompt });
      await wait(1800);
      const todos = p.todos.map(([content, activeForm]) => ({ content, status: "pending", activeForm }));
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
