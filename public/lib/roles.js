/**
 * The six desks and the team lead. A subagent's `agent_type` picks its desk by
 * keyword, so the bundled agents (planner, developer, …), built-ins (Explore,
 * Plan, general-purpose) and plugin agents (`my-plugin:reviewer`) all land
 * somewhere sensible.
 *
 * `look` is a palette config of the pixel-distric characters
 * (base male/female + hair/skin/outfit tints, see public/office/sprites.js).
 */

export const LEAD = {
  key: "lead",
  name: "팀장",
  en: "Claude",
  color: "#e8835a",
  look: { base: "female", hair: "chestnut", skin: "original", outfit: "gold" },
};

export const ROLES = [
  {
    key: "plan",
    name: "기획",
    en: "Planner",
    color: "#a78bfa",
    look: { base: "female", hair: "lavender", skin: "original", outfit: "purple" },
    keywords: ["plan", "pm", "product", "spec", "architect", "explore", "research", "analyst", "기획"],
  },
  {
    key: "dev",
    name: "개발",
    en: "Developer",
    color: "#60a5fa",
    look: { base: "male", hair: "original", skin: "original", outfit: "original" },
    keywords: ["dev", "engineer", "builder", "code", "implement", "frontend", "backend", "general", "fix", "개발"],
  },
  {
    key: "test",
    name: "테스트",
    en: "Tester",
    color: "#34d399",
    look: { base: "female", hair: "teal", skin: "light", outfit: "green" },
    keywords: ["test", "qa", "debug", "verif", "valid", "e2e", "테스트"],
  },
  {
    key: "mkt",
    name: "마케팅",
    en: "Marketer",
    color: "#f472b6",
    look: { base: "female", hair: "pink", skin: "tan", outfit: "pink" },
    keywords: ["market", "growth", "copy", "seo", "content", "writer", "social", "brand", "마케팅"],
  },
  {
    key: "design",
    name: "디자인",
    en: "Designer",
    color: "#fbbf24",
    look: { base: "male", hair: "blonde", skin: "light", outfit: "gold" },
    keywords: ["design", "ui", "ux", "art", "visual", "figma", "디자인"],
  },
  {
    key: "review",
    name: "리뷰",
    en: "Reviewer",
    color: "#94a3b8",
    look: { base: "male", hair: "silver", skin: "tan", outfit: "charcoal" },
    keywords: ["review", "security", "audit", "critic", "lint", "리뷰"],
  },
];

export const ALL_DESKS = [LEAD, ...ROLES];
export const deskByKey = Object.fromEntries(ALL_DESKS.map((d) => [d.key, d]));

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Desk key for a subagent type; unknown types are spread over the desks deterministically. */
export function roleFor(agentType) {
  if (!agentType) return "lead";
  const t = agentType.toLowerCase().split(":").pop();
  // "reviewer" contains "view", "tester" contains "test"… check the most specific roles first
  const order = ["review", "test", "design", "mkt", "plan", "dev"];
  for (const key of order) {
    const role = ROLES.find((r) => r.key === key);
    if (role.keywords.some((k) => t.includes(k))) return key;
  }
  return ROLES[hash(t) % ROLES.length].key;
}
