/**
 * In-memory rooms: the last N normalized events per room plus live subscribers.
 * A room is created by its first event and forgotten after ROOM_TTL of silence.
 * Optional persistence: set DATA_DIR and rooms are saved on shutdown / every minute.
 */
import fs from "node:fs";
import path from "node:path";

export const KEY_RE = /^[A-Za-z0-9_-]{12,64}$/;

export class Store {
  constructor({ maxEvents = 3000, maxRooms = 2000, roomTtlMs = 72 * 3600_000, dataDir = null } = {}) {
    this.maxEvents = maxEvents;
    this.maxRooms = maxRooms;
    this.roomTtlMs = roomTtlMs;
    this.dataDir = dataDir;
    this.rooms = new Map(); // key → { events, subs:Set, last, seq, bucket }
    if (dataDir) this.load();
  }

  room(key, create = true) {
    let r = this.rooms.get(key);
    if (!r && create) {
      if (this.rooms.size >= this.maxRooms) this.evict();
      r = { events: [], subs: new Set(), last: Date.now(), seq: 0, bucket: { tokens: 200, ts: Date.now() } };
      this.rooms.set(key, r);
    }
    return r;
  }

  /** token bucket: 200 burst, 40 events/s sustained per room */
  allow(key) {
    const b = this.room(key).bucket;
    const now = Date.now();
    b.tokens = Math.min(200, b.tokens + ((now - b.ts) / 1000) * 40);
    b.ts = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  add(key, ev) {
    const r = this.room(key);
    ev.id = ++r.seq;
    r.events.push(ev);
    if (r.events.length > this.maxEvents) r.events.splice(0, r.events.length - this.maxEvents);
    r.last = Date.now();
    for (const send of r.subs) send(ev);
    return ev;
  }

  subscribe(key, send) {
    const r = this.room(key);
    r.subs.add(send);
    return () => r.subs.delete(send);
  }

  events(key, since = 0) {
    const r = this.room(key, false);
    return r ? r.events.filter((e) => e.id > since) : [];
  }

  clear(key) {
    const r = this.room(key, false);
    if (r) {
      r.events = [];
      for (const send of r.subs) send({ kind: "_clear" });
    }
  }

  evict() {
    const now = Date.now();
    for (const [k, r] of this.rooms) if (!r.subs.size && now - r.last > this.roomTtlMs) this.rooms.delete(k);
    while (this.rooms.size >= this.maxRooms) {
      let oldest = null;
      for (const [k, r] of this.rooms) if (!r.subs.size && (!oldest || r.last < oldest[1].last)) oldest = [k, r];
      if (!oldest) break;
      this.rooms.delete(oldest[0]);
    }
  }

  file() {
    return path.join(this.dataDir, "rooms.json");
  }

  save() {
    if (!this.dataDir) return;
    const out = {};
    for (const [k, r] of this.rooms) if (r.events.length) out[k] = { seq: r.seq, last: r.last, events: r.events };
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.file() + ".tmp", JSON.stringify(out));
    fs.renameSync(this.file() + ".tmp", this.file());
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file(), "utf8"));
      for (const [k, v] of Object.entries(data)) {
        if (!KEY_RE.test(k)) continue;
        const r = this.room(k);
        Object.assign(r, { seq: v.seq || 0, last: v.last || Date.now(), events: v.events || [] });
      }
    } catch {
      // no saved rooms yet
    }
  }
}
