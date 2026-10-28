#!/usr/bin/env node
/**
 * Pixel Office server — zero dependencies (Node ≥ 18).
 *
 *   POST /api/r/:key/events   Claude Code hook payloads (one object or an array)
 *   GET  /api/r/:key/stream   Server-Sent Events: a snapshot, then live events
 *   GET  /api/r/:key/events   JSON list (?since=<id>), for polling clients
 *   DELETE /api/r/:key        clear a room
 *   GET  /install.sh          the installer kit (kit/install.sh)
 *   GET  /r/:key/install.sh   the installer with that room's address built in
 *   GET  /r/:key, /, /demo    the office (public/index.html)
 *
 * Env: PORT (8787), HOST (0.0.0.0), DATA_DIR (optional persistence),
 *      PIXEL_OFFICE_ROOMS (optional comma list: only these room keys accept events)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "../public/lib/normalize.js";
import { Store, KEY_RE } from "./store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const MAX_BODY = 512 * 1024;
const ONLY_ROOMS = (process.env.PIXEL_OFFICE_ROOMS || "").split(",").map((s) => s.trim()).filter(Boolean);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".sh": "text/x-shellscript; charset=utf-8",
};

export function createServer({ store = new Store({ dataDir: process.env.DATA_DIR || null }) } = {}) {
  const server = http.createServer((req, res) => {
    handle(req, res, store).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: "internal" });
      else res.end();
    });
  });
  server.store = store;
  return server;
}

function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handle(req, res, store) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const cors = { "access-control-allow-origin": "*" };

  if (p === "/healthz") return send(res, 200, { ok: true, rooms: store.rooms.size });

  const m = p.match(/^\/api\/r\/([^/]+)(\/events|\/stream)?\/?$/);
  if (m) {
    const key = m[1];
    if (!KEY_RE.test(key)) return send(res, 400, { error: "room key must be 12-64 chars of A-Z a-z 0-9 _ -" }, cors);
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...cors, "access-control-allow-methods": "GET,POST,DELETE", "access-control-allow-headers": "content-type" });
      return res.end();
    }
    const sub = m[2];
    if (sub === "/events" && req.method === "POST") {
      if (ONLY_ROOMS.length && !ONLY_ROOMS.includes(key)) return send(res, 403, { error: "room not allowed on this server" }, cors);
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (err) {
        return send(res, err.status || 400, { error: err.status ? "body too large" : "invalid json" }, cors);
      }
      let accepted = 0;
      for (const raw of Array.isArray(body) ? body.slice(0, 100) : [body]) {
        const ev = normalize(raw, Date.now());
        if (!ev) continue;
        if (!store.allow(key)) return send(res, 429, { error: "slow down", accepted }, cors);
        store.add(key, ev);
        accepted++;
      }
      return send(res, 200, { accepted }, cors);
    }
    if (sub === "/events" && req.method === "GET") {
      return send(res, 200, { events: store.events(key, Number(url.searchParams.get("since")) || 0) }, cors);
    }
    if (sub === "/stream" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", ...cors });
      res.write(`retry: 3000\nevent: snapshot\ndata: ${JSON.stringify({ now: Date.now(), events: store.events(key) })}\n\n`);
      const unsub = store.subscribe(key, (ev) => res.write(`event: ev\ndata: ${JSON.stringify(ev)}\n\n`));
      const beat = setInterval(() => res.write(`: ♥\n\n`), 20_000);
      req.on("close", () => {
        clearInterval(beat);
        unsub();
      });
      return;
    }
    if (!sub && req.method === "DELETE") {
      store.clear(key);
      return send(res, 200, { ok: true }, cors);
    }
    return send(res, 405, { error: "method not allowed" }, cors);
  }

  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method not allowed" });

  // installer kit; /r/:key/install.sh has that room's address built in
  if (p === "/install.sh") return serveFile(res, path.join(ROOT, "kit", "install.sh"), req.method);
  const inst = p.match(/^\/r\/([^/]+)\/install\.sh$/);
  if (inst) {
    if (!KEY_RE.test(inst[1])) return send(res, 400, { error: "bad room key" });
    const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
    const room = `${proto}://${host}/r/${inst[1]}`;
    if (!/^https?:\/\/[A-Za-z0-9.:[\]-]+\/r\/[A-Za-z0-9_-]+$/.test(room)) return send(res, 400, { error: "bad host" });
    const body = fs.readFileSync(path.join(ROOT, "kit", "install.sh"), "utf8").replace("'__PRESET_URL__'", `'${room}'`);
    res.writeHead(200, { "content-type": TYPES[".sh"], "cache-control": "no-cache" });
    return res.end(req.method === "HEAD" ? undefined : body);
  }

  // SPA routes
  if (p === "/" || p === "/demo" || /^\/r\/[^/]+\/?$/.test(p)) return serveFile(res, path.join(PUBLIC, "index.html"), req.method);

  const file = path.normalize(path.join(PUBLIC, decodeURIComponent(p)));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, { error: "not found" });
  return serveFile(res, file, req.method);
}

function serveFile(res, file, method) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: "not found" });
    const ext = path.extname(file);
    const cache = ext === ".html" || ext === ".sh" || ext === ".js" ? "no-cache" : "public, max-age=86400";
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream", "content-length": st.size, "cache-control": cache });
    if (method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || "0.0.0.0";
  const server = createServer();
  server.listen(port, host, () => console.log(`🏢 Pixel Office on http://localhost:${port}`));
  const save = () => {
    try {
      server.store.save();
    } catch (e) {
      console.error("save failed", e);
    }
  };
  if (process.env.DATA_DIR) setInterval(save, 60_000).unref();
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () => {
      save();
      process.exit(0);
    });
}
