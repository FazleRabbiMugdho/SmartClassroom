// FastRobox 1.0 platform, Level 2 scope.
//   POST /api/ingest/telemetry   device -> platform, Authorization: Bearer <device token>
//   POST /api/ingest/event       device -> platform, same token
//   GET  /api/devices|telemetry|events   read-only, Authorization: Bearer <ADMIN_TOKEN>
//   GET  /records                simple page that shows the stored records (asks for the admin token)
//   GET  /health                 liveness probe
// Secrets come only from environment variables (see .env.example). Nothing secret is in this repo.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { openDb } from "./db.mjs";

const PORT = Number(process.env.PORT || 8080);
const DB_PATH = process.env.DB_PATH || "./data/fastrobox.db";
const OFFLINE_AFTER_S = Number(process.env.OFFLINE_AFTER_S || 20); // marks a silent device offline
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
// DEVICE_TOKENS="T01-D1:token1,T02-D1:token2"
const DEVICE_HASHES = new Map();
for (const pair of (process.env.DEVICE_TOKENS || "").split(",").map((s) => s.trim()).filter(Boolean)) {
  const i = pair.indexOf(":");
  if (i > 0) DEVICE_HASHES.set(pair.slice(0, i), sha(pair.slice(i + 1)));
}

function sha(s) { return createHash("sha256").update(String(s)).digest(); }
function safeEq(a, b) { return a.length === b.length && timingSafeEqual(a, b); }
const nowS = () => Math.floor(Date.now() / 1000);

if (DB_PATH !== ":memory:") fs.mkdirSync(DB_PATH.replace(/[/\\][^/\\]*$/, "") || ".", { recursive: true });
const db = openDb(DB_PATH);

const q = {
  seq: db.prepare("INSERT INTO seqs (device_id, seq, kind) VALUES (?, ?, ?)"),
  tel: db.prepare(`INSERT INTO telemetry (device_id, seq, room_id, ts, uptime_s, temp_c, rh, heat_index_c, flame, door,
      status, heat_trend, rssi, heap_kb, chip_temp_c, fw, quality, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  ev: db.prepare(`INSERT INTO events (device_id, seq, room_id, ts, type, detail, source, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  dev: db.prepare("SELECT online FROM devices WHERE device_id = ?"),
  upDev: db.prepare(`INSERT INTO devices (device_id, room_id, last_seen, online, fw) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(device_id) DO UPDATE SET room_id = excluded.room_id, last_seen = excluded.last_seen, online = 1, fw = COALESCE(excluded.fw, fw)`),
  stale: db.prepare("SELECT device_id, room_id FROM devices WHERE online = 1 AND last_seen < ?"),
  off: db.prepare("UPDATE devices SET online = 0 WHERE device_id = ?"),
  cmdNew: db.prepare("INSERT INTO commands (device_id, type, issued_by, created_at) VALUES (?, ?, ?, ?)"),
  cmdPending: db.prepare("SELECT id, type FROM commands WHERE device_id = ? AND delivered_at IS NULL ORDER BY id"),
  cmdDone: db.prepare("UPDATE commands SET delivered_at = ? WHERE id = ?"),
};

// Commands the platform may send to a device. Level 3 adds RESET_FIRE; later levels add more here.
const COMMAND_TYPES = ["RESET_FIRE"];

function serverEvent(device_id, room_id, type, detail) {
  q.ev.run(device_id, null, room_id ?? null, nowS(), type, detail ?? "", "server", nowS());
}

function touchDevice(device_id, room_id, fw) {
  const prev = q.dev.get(device_id);
  q.upDev.run(device_id, room_id ?? null, nowS(), fw ?? null);
  if (!prev || !prev.online) serverEvent(device_id, room_id, "DEVICE_ONLINE", "");
}

// A device that has been silent for OFFLINE_AFTER_S seconds is marked offline.
setInterval(() => {
  for (const d of q.stale.all(nowS() - OFFLINE_AFTER_S)) {
    q.off.run(d.device_id);
    serverEvent(d.device_id, d.room_id, "DEVICE_OFFLINE", `silent for more than ${OFFLINE_AFTER_S} s`);
    console.log(`[platform] ${d.device_id} OFFLINE`);
  }
}, 2000).unref();

// ---------------- helpers
function send(res, code, obj) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": typeof obj === "string" ? "text/html; charset=utf-8" : "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

function bearer(req) {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

function deviceFromToken(req) {
  const t = bearer(req);
  if (!t) return null;
  const h = sha(t);
  for (const [id, hash] of DEVICE_HASHES) if (safeEq(h, hash)) return id;
  return null;
}

function isAdmin(req) {
  return ADMIN_TOKEN !== "" && safeEq(sha(bearer(req)), sha(ADMIN_TOKEN));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on("data", (c) => { n += c.length; if (n > 8192) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new Error("bad json")); } });
    req.on("error", reject);
  });
}

const isInt = (v) => Number.isInteger(v);
const numOrNull = (v) => (v === null || v === undefined ? null : (typeof v === "number" && Number.isFinite(v) ? v : undefined));
const oneOf = (v, list) => list.includes(v);

function validateTelemetry(b) {
  if (typeof b.device_id !== "string" || !isInt(b.seq) || b.seq < 1 || !isInt(b.ts)) return "device_id, seq and ts are required";
  for (const k of ["temp_c", "rh", "heat_index_c", "rssi", "chip_temp_c"]) if (numOrNull(b[k]) === undefined) return `${k} must be a number or null`;
  for (const k of ["uptime_s", "heap_kb"]) if (!isInt(b[k])) return `${k} must be a whole number`;
  if (typeof b.flame !== "boolean") return "flame must be true or false";
  if (!oneOf(b.door, ["LOCKED", "UNLOCKED"])) return "door must be LOCKED or UNLOCKED";
  if (!oneOf(b.status, ["SAFE", "WARNING", "DANGER", "FIRE"])) return "status is not valid";
  if (!oneOf(b.heat_trend, ["RISING", "STABLE", "FALLING"])) return "heat_trend is not valid";
  if (!oneOf(b.quality, ["good", "bad"])) return "quality must be good or bad";
  if (typeof b.fw !== "string" || typeof b.room_id !== "string") return "fw and room_id must be text";
  return null;
}

function validateEvent(b) {
  if (typeof b.device_id !== "string" || !isInt(b.seq) || b.seq < 1 || !isInt(b.ts)) return "device_id, seq and ts are required";
  if (typeof b.type !== "string" || !/^[A-Z_]{2,32}$/.test(b.type)) return "type is not valid";
  if (typeof b.detail !== "string" || typeof b.room_id !== "string") return "detail and room_id must be text";
  return null;
}

// Stores a message once. Returns "stored" or "replay".
function storeOnce(kind, b, insert) {
  db.exec("BEGIN");
  try {
    q.seq.run(b.device_id, b.seq, kind);   // fails when (device_id, seq) already exists
    insert();
    db.exec("COMMIT");
    return "stored";
  } catch (e) {
    db.exec("ROLLBACK");
    if (String(e.message).includes("UNIQUE")) return "replay";
    throw e;
  }
}

async function ingest(req, res, kind) {
  const dev = deviceFromToken(req);
  if (!dev) return send(res, 401, { error: "unauthorized" });
  let b;
  try { b = await readJson(req); } catch (e) { return send(res, 400, { error: e.message }); }
  if (b.device_id !== dev) return send(res, 403, { error: "device_id does not match the token" });
  const bad = kind === "telemetry" ? validateTelemetry(b) : validateEvent(b);
  if (bad) return send(res, 400, { error: bad });
  const rx = nowS();
  const result = storeOnce(kind, b, () => {
    if (kind === "telemetry") {
      q.tel.run(b.device_id, b.seq, b.room_id, b.ts, b.uptime_s, b.temp_c ?? null, b.rh ?? null, b.heat_index_c ?? null,
        b.flame ? 1 : 0, b.door, b.status, b.heat_trend, b.rssi ?? null, b.heap_kb, b.chip_temp_c ?? null, b.fw, b.quality, rx);
    } else {
      q.ev.run(b.device_id, b.seq, b.room_id, b.ts, b.type, b.detail, "device", rx);
    }
  });
  if (result === "replay") return send(res, 409, { error: "replay", detail: "this (device_id, seq) is already stored" });
  touchDevice(b.device_id, b.room_id, kind === "telemetry" ? b.fw : null);
  return send(res, 201, { ok: true });
}

const RECORDS_PAGE = `<!doctype html><meta charset="utf-8"><title>FastRobox records</title>
<style>body{font-family:Arial;margin:16px;background:#f4f6fb}table{border-collapse:collapse;background:#fff;margin-bottom:20px}
td,th{border:1px solid #e2e8f0;padding:4px 8px;font-size:13px;font-variant-numeric:tabular-nums}th{background:#eef2ff}
.on{color:#065f46;font-weight:bold}.off{color:#991b1b;font-weight:bold}</style>
<h2>FastRobox records</h2><div id=m></div>
<p>Send to device <input id=dev value="T01-D1"> <button onclick="resetFire()">Reset fire</button> <span id=cmdmsg></span></p>
<h3>Devices</h3><table id=d></table><h3>Telemetry (latest 30)</h3><table id=t></table><h3>Events (latest 30)</h3><table id=e></table>
<script>
let tok=sessionStorage.getItem("tok")||prompt("Admin token");sessionStorage.setItem("tok",tok||"");
const H={Authorization:"Bearer "+tok};
function tbl(el,rows){if(!rows.length){el.innerHTML="<tr><td>no records</td></tr>";return;}
 const k=Object.keys(rows[0]);el.innerHTML="<tr>"+k.map(x=>"<th>"+x+"</th>").join("")+"</tr>"+
 rows.map(r=>"<tr>"+k.map(x=>"<td>"+(x==="ts"||x==="received_at"||x==="last_seen"?new Date(r[x]*1000).toLocaleString():(r[x]===null?"":r[x]))+"</td>").join("")+"</tr>").join("");}
async function load(){try{
 const [d,t,e]=await Promise.all(["/api/devices","/api/telemetry?limit=30","/api/events?limit=30"].map(u=>fetch(u,{headers:H}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();})));
 tbl(document.getElementById("d"),d.map(x=>({...x,online:x.online?"ONLINE":"OFFLINE"})));tbl(document.getElementById("t"),t);tbl(document.getElementById("e"),e);
 document.getElementById("m").textContent="";}catch(x){document.getElementById("m").textContent="Cannot load: "+x.message;}}
async function resetFire(){
 const r=await fetch("/api/admin/commands",{method:"POST",headers:{...H,"Content-Type":"application/json"},body:JSON.stringify({device_id:document.getElementById("dev").value,type:"RESET_FIRE"})});
 document.getElementById("cmdmsg").textContent=r.ok?"Reset fire sent":"Failed: "+r.status;}
load();setInterval(load,2000);
</script>`;

const server = (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  const lim = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 500);
  (async () => {
    if (req.method === "GET" && p === "/health") return send(res, 200, { ok: true });
    if (req.method === "GET" && p === "/records") return send(res, 200, RECORDS_PAGE);
    if (req.method === "POST" && p === "/api/ingest/telemetry") return ingest(req, res, "telemetry");
    if (req.method === "POST" && p === "/api/ingest/event") return ingest(req, res, "event");
    // Device fetches its pending commands (each is handed over once).
    if (req.method === "GET" && p === "/api/device/commands") {
      const dev = deviceFromToken(req);
      if (!dev) return send(res, 401, { error: "unauthorized" });
      const rows = q.cmdPending.all(dev);
      for (const r of rows) q.cmdDone.run(nowS(), r.id);
      return send(res, 200, rows);
    }
    // An admin (Level 4 adds Teacher logins) sends a command, for example RESET_FIRE.
    if (req.method === "POST" && p === "/api/admin/commands") {
      if (!isAdmin(req)) return send(res, 401, { error: "unauthorized" });
      let b;
      try { b = await readJson(req); } catch (e) { return send(res, 400, { error: e.message }); }
      if (typeof b.device_id !== "string" || !COMMAND_TYPES.includes(b.type)) return send(res, 400, { error: `type must be one of ${COMMAND_TYPES.join(", ")}` });
      const r = q.cmdNew.run(b.device_id, b.type, "admin", nowS());
      return send(res, 201, { ok: true, id: Number(r.lastInsertRowid) });
    }
    if (req.method === "GET" && p.startsWith("/api/")) {
      if (!isAdmin(req)) return send(res, 401, { error: "unauthorized" });
      if (p === "/api/devices") return send(res, 200, db.prepare("SELECT * FROM devices ORDER BY device_id").all());
      if (p === "/api/telemetry") {
        const d = url.searchParams.get("device_id");
        const rows = d ? db.prepare("SELECT * FROM telemetry WHERE device_id = ? ORDER BY received_at DESC, seq DESC LIMIT ?").all(d, lim)
                       : db.prepare("SELECT * FROM telemetry ORDER BY received_at DESC, seq DESC LIMIT ?").all(lim);
        return send(res, 200, rows);
      }
      if (p === "/api/commands") return send(res, 200, db.prepare("SELECT * FROM commands ORDER BY id DESC LIMIT ?").all(lim));
      if (p === "/api/events") {
        const t = url.searchParams.get("type");
        const rows = t ? db.prepare("SELECT * FROM events WHERE type = ? ORDER BY id DESC LIMIT ?").all(t, lim)
                       : db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?").all(lim);
        return send(res, 200, rows);
      }
    }
    return send(res, 404, { error: "not found" });
  })().catch((e) => { console.error(e); send(res, 500, { error: "server error" }); });
};

const keyFile = process.env.TLS_KEY_FILE, certFile = process.env.TLS_CERT_FILE;
const srv = keyFile && certFile
  ? https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, server)
  : http.createServer(server);   // behind a TLS-terminating host (Render, Fly, Cloudflare Tunnel, ...)
srv.listen(PORT, () => {
  console.log(`[platform] listening on ${keyFile ? "https" : "http"}://0.0.0.0:${PORT}`);
  if (!DEVICE_HASHES.size) console.log("[platform] WARNING: DEVICE_TOKENS is empty, no device can send data");
  if (!ADMIN_TOKEN) console.log("[platform] WARNING: ADMIN_TOKEN is empty, reading is disabled");
});
