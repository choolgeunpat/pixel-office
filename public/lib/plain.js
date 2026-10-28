/**
 * Plain-language wording. Everything the office says about what someone is doing goes
 * through here, so a person who has never seen a terminal can read it ("파일을 고치고 있어요",
 * not "Edit src/auth/login.ts").
 */

const base = (p) => String(p || "").split(/[\\/]/).filter(Boolean).pop() || "";

const BASH = {
  test: ["테스트를 돌려 보고 있어요", "테스트 중", "🧪"],
  install: ["필요한 도구를 설치하고 있어요", "설치하는 중", "📦"],
  git: ["변경 내용을 저장하고 있어요", "저장하는 중", "💾"],
  build: ["결과물을 만들고 있어요", "결과물 만드는 중", "🏗️"],
  lint: ["코드를 점검하고 있어요", "점검하는 중", "🧹"],
  net: ["인터넷에 연결하고 있어요", "연결하는 중", "🌐"],
  look: ["파일을 둘러보고 있어요", "둘러보는 중", "👀"],
  run: ["프로그램을 실행하고 있어요", "실행하는 중", "⚙️"],
};

/**
 * @returns {{long:string, short:string, icon:string, detail:string}}
 *   long   – sentence for bubbles and the panel ("자료를 읽고 있어요")
 *   short  – 2–6 syllables for chips ("자료 읽는 중")
 *   detail – what it touches: a file name, a search phrase, a site
 */
export function action(tool, target, cmdKind) {
  const t = String(target || "");
  switch (tool) {
    case "Read":
      return { long: "자료를 읽고 있어요", short: "자료 읽는 중", icon: "📖", detail: base(t) };
    case "Write":
      return { long: "새 파일을 만들고 있어요", short: "파일 만드는 중", icon: "📝", detail: base(t) };
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return { long: "내용을 고치고 있어요", short: "수정하는 중", icon: "✏️", detail: base(t) };
    case "Bash": {
      const b = BASH[cmdKind] || BASH.run;
      return { long: b[0], short: b[1], icon: b[2], detail: "" };
    }
    case "Grep":
    case "Glob":
      return { long: "필요한 파일을 찾고 있어요", short: "찾는 중", icon: "🔍", detail: "" };
    case "WebSearch":
      return { long: "인터넷에서 조사하고 있어요", short: "조사하는 중", icon: "🔎", detail: t };
    case "WebFetch":
      return { long: "웹페이지를 읽고 있어요", short: "웹페이지 읽는 중", icon: "🌐", detail: t };
    case "Task":
    case "Agent":
      return { long: "동료에게 일을 맡기고 있어요", short: "일 맡기는 중", icon: "📨", detail: "" };
    case "TodoWrite":
      return { long: "할 일을 정리하고 있어요", short: "계획 세우는 중", icon: "📋", detail: "" };
    case "Skill":
      return { long: "전문 기능을 쓰고 있어요", short: "기능 쓰는 중", icon: "🧰", detail: "" };
    default:
      if (tool && tool.startsWith("mcp__")) return { long: "연결된 앱을 쓰고 있어요", short: "앱 쓰는 중", icon: "🔌", detail: "" };
      return { long: "작업하고 있어요", short: "작업 중", icon: "🛠️", detail: "" };
  }
}

export const STATUS = {
  think: "생각하는 중",
  thinkWorker: "업무 파악 중",
  wait: "대표님 확인 필요",
  done: "완료!",
  error: "다시 시도 중",
  idle: "대기 중",
  coffee: "커피 타임",
  sleep: "쉬는 중",
  off: "출근 전",
};

export const ago = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "방금";
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};

export const took = (ms) => {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}분 ${s % 60 ? `${s % 60}초` : ""}`.trim() : `${Math.floor(m / 60)}시간 ${m % 60}분`;
};
