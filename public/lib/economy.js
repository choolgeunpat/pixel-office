/**
 * The company: coins earned by finished work, and the level they add up to.
 * Coins are counted once per event (events carry a timestamp, and a replay of old events
 * after a page reload does not count again). Stored in this browser only.
 */

export const LEVELS = [
  { lv: 1, name: "1인 기업", at: 0, unlock: "" },
  { lv: 2, name: "스타트업", at: 40, unlock: "책장에 트로피가 생겼어요" },
  { lv: 3, name: "성장 기업", at: 120, unlock: "벽에 인증서 액자가 걸렸어요" },
  { lv: 4, name: "유망 기업", at: 300, unlock: "사무실에 조명이 달렸어요" },
  { lv: 5, name: "중견 기업", at: 700, unlock: "팀장실에 카펫이 깔렸어요" },
  { lv: 6, name: "유니콘", at: 1500, unlock: "황금 유니콘 동상이 들어왔어요" },
];

export const levelFor = (coins) => [...LEVELS].reverse().find((l) => coins >= l.at) || LEVELS[0];

export class Economy {
  /** @param key  localStorage key; null keeps everything in memory (demo) */
  constructor(key) {
    this.key = key;
    this.data = { coins: 0, lastTs: 0, n: 0, name: "내 회사" };
    this.seen = { ts: 0, c: 0 };
    if (key) {
      try {
        Object.assign(this.data, JSON.parse(localStorage.getItem(key) || "{}"));
      } catch {
        // private mode or blocked storage: stay in memory
      }
    }
  }

  get coins() {
    return this.data.coins;
  }

  get name() {
    return this.data.name;
  }

  get level() {
    return levelFor(this.data.coins);
  }

  /** 0..1 progress towards the next level (1 at the top level) */
  get progress() {
    const cur = this.level;
    const next = LEVELS[cur.lv];
    return next ? (this.data.coins - cur.at) / (next.at - cur.at) : 1;
  }

  get next() {
    return LEVELS[this.level.lv] || null;
  }

  /** @returns {{counted:boolean, levelUp:object|null}} */
  add(amount, ts) {
    const d = this.data;
    if (ts < d.lastTs) return { counted: false, levelUp: null };
    if (ts === d.lastTs) {
      if (this.seen.ts !== ts) this.seen = { ts, c: 0 };
      this.seen.c++;
      if (this.seen.c <= d.n) return { counted: false, levelUp: null };
      d.n++;
    } else {
      d.lastTs = ts;
      d.n = 1;
      this.seen = { ts, c: 1 };
    }
    const before = this.level.lv;
    d.coins += amount;
    this.save();
    const after = this.level;
    return { counted: true, levelUp: after.lv > before ? after : null };
  }

  rename(name) {
    this.data.name = String(name || "").trim().slice(0, 14) || "내 회사";
    this.save();
  }

  save() {
    if (!this.key) return;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      // ignore
    }
  }
}
