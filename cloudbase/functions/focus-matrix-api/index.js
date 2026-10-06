'use strict';
// Focus Matrix 云端 API（CloudBase HTTP 云函数）
// 无第三方依赖，仅用 Node 内置 http / crypto / fetch。
// 数据库访问：经 PostgREST REST API（service_role 服务端密钥），客户端永不直连数据库。

const http = require('http');
const crypto = require('crypto');

const ENV = process.env.TCB_ENV || '';
const API_KEY = process.env.CLOUDBASE_API_KEY || '';
const WRITE_TOKEN = process.env.FOCUS_MATRIX_WRITE_TOKEN || '';
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || '';
const REST = `https://${ENV}.api.tcloudbasegateway.com/v1/rdb/rest`;

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
};
const MAX_BODY = 5_000_000;

// ---------- 基础工具 ----------
function sha256hex(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function equalToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function randomHex(bytes) { return crypto.randomBytes(bytes).toString('hex'); }
function bearer(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec((req.headers['authorization'] || ''));
  return m ? m[1] : '';
}
function owner(req) { return !!WRITE_TOKEN && equalToken(bearer(req), WRITE_TOKEN); }

function corsHeaders(req) {
  const h = { ...SECURITY_HEADERS };
  const origin = req.headers['origin'];
  if (origin) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Vary'] = 'Origin';
    h['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
  }
  return h;
}
function sendJson(req, res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req) });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function jsonOrNull(s) { try { return JSON.parse(s); } catch { return null; } }

// ---------- PostgREST 客户端 ----------
async function rest(method, table, opts = {}) {
  const url = new URL(`${REST}/${table}`);
  if (opts.select) url.searchParams.set('select', opts.select);
  for (const [col, val] of Object.entries(opts.filter || {})) url.searchParams.set(col, val);
  if (opts.order) url.searchParams.set('order', opts.order);
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));
  if (opts.onConflict) url.searchParams.set('on_conflict', opts.onConflict);
  const headers = { 'Authorization': 'Bearer ' + API_KEY };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const prefer = [];
  if (opts.preferRepresentation) prefer.push('return=representation');
  if (opts.upsert) prefer.push('resolution=merge-duplicates');
  if (prefer.length) headers['Prefer'] = prefer.join(',');
  const res = await fetch(url.toString(), { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  if (res.status === 204) return [];
  const text = await res.text();
  if (!text) return [];
  if (res.status >= 400) {
    let msg = text;
    try { msg = (JSON.parse(text).message) || text; } catch { /* keep raw */ }
    throw new Error(`REST ${method} ${table} ${res.status}: ${msg}`);
  }
  try { return JSON.parse(text); } catch { return []; }
}

// ---------- 同步合并逻辑（移植自 cloud-site/lib/syncModel.ts） ----------
const QUADRANTS = ['important-not-urgent', 'important-urgent', 'not-important-not-urgent', 'urgent-not-important'];
const TASK_FIELDS = ['text', 'completed', 'quadrant'];
const PERIODS = ['morning', 'afternoon', 'evening'];
function emptyContent() { return { tasks: [], dailyMemos: {} }; }
function same(a, b) {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  const L = a, R = b, keys = Object.keys(L);
  return keys.length === Object.keys(R).length && keys.every((k) => k in R && same(L[k], R[k]));
}
function stableId(value) {
  let a = 2166136261, b = 3339675911;
  for (const ch of JSON.stringify(value)) { a = Math.imul(a ^ ch.charCodeAt(0), 16777619); b = Math.imul(b ^ ch.charCodeAt(0), 2246822519); }
  return `conflict-${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}
const taskSame = (a, b) => TASK_FIELDS.every((f) => a[f] === b[f]);
function mergeContent(base, local, remote) {
  const original = new Map(base.tasks.map((t) => [t.id, t]));
  const edited = new Map(local.tasks.map((t) => [t.id, t]));
  const current = new Map(remote.tasks.map((t) => [t.id, t]));
  const result = new Map(); const conflictIds = [];
  const preserve = (task) => { const copy = { ...task, id: stableId(task) }; result.set(copy.id, copy); conflictIds.push(copy.id); };
  for (const id of new Set([...current.keys(), ...edited.keys(), ...original.keys()])) {
    const previous = original.get(id), mine = edited.get(id), theirs = current.get(id);
    if (!previous) { if (mine && theirs) { if (taskSame(mine, theirs)) result.set(id, theirs); else { result.set(id, theirs); preserve(mine); } } else if (mine || theirs) result.set(id, (mine || theirs)); continue; }
    if (!mine && !theirs) continue;
    if (!mine) { if (theirs && !taskSame(previous, theirs)) { result.set(id, theirs); conflictIds.push(id); } continue; }
    if (!theirs) { if (!taskSame(previous, mine)) preserve(mine); continue; }
    const merged = { ...theirs }; let conflict = false, localChanged = false;
    for (const field of TASK_FIELDS) {
      if (mine[field] === previous[field] || mine[field] === theirs[field]) continue;
      if (theirs[field] !== previous[field]) { conflict = true; continue; }
      Object.assign(merged, { [field]: mine[field] }); localChanged = true;
    }
    if (localChanged) merged.updatedAt = mine.updatedAt;
    result.set(id, merged); if (conflict) preserve(mine);
  }
  const order = remote.tasks.map((t) => t.id).filter((id) => result.has(id));
  for (let index = 0; index < local.tasks.length; index++) {
    const id = local.tasks[index].id;
    if (!result.has(id) || order.includes(id)) continue;
    let position = -1;
    for (let before = index - 1; before >= 0; before--) { position = order.indexOf(local.tasks[before].id); if (position >= 0) break; }
    order.splice(position >= 0 ? position + 1 : order.length, 0, id);
  }
  for (const id of result.keys()) if (!order.includes(id)) order.push(id);
  const memos = {};
  for (const date of new Set([...Object.keys(remote.dailyMemos), ...Object.keys(local.dailyMemos), ...Object.keys(base.dailyMemos)])) {
    const previous = base.dailyMemos[date], mine = local.dailyMemos[date], theirs = remote.dailyMemos[date];
    if (!mine && !theirs) continue;
    const memo = { morning: '', afternoon: '', evening: '', updatedAt: theirs ? theirs.updatedAt : (mine ? mine.updatedAt : '') };
    for (const period of PERIODS) {
      const old = previous ? previous[period] || '' : '', left = mine ? mine[period] || '' : '', right = theirs ? theirs[period] || '' : '';
      if (left === old || left === right) memo[period] = right;
      else if (right === old) { memo[period] = left; memo.updatedAt = mine ? mine.updatedAt || memo.updatedAt : memo.updatedAt; }
      else { memo[period] = `${right}\n\n—— 同时修改，已保留两份 ——\n${left}`; conflictIds.push(`memo:${date}:${period}`); }
    }
    if (PERIODS.some((p) => memo[p]) || mine || theirs) memos[date] = memo;
  }
  return { content: { tasks: order.map((id) => result.get(id)), dailyMemos: memos }, conflictIds };
}
function contentChanges(before, after, actor, source, at, conflicts = []) {
  const marks = []; const old = new Map(before.tasks.map((t) => [t.id, t])); const next = new Map(after.tasks.map((t) => [t.id, t]));
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const previous = old.get(id), current = next.get(id);
    const fields = !previous ? ['created'] : !current ? ['deleted'] : TASK_FIELDS.filter((f) => previous[f] !== current[f]);
    if (fields.length) marks.push({ entity: id, actor, source, at, fields, beforeText: previous ? previous.text : '', afterText: current ? current.text : '', ...(conflicts.includes(id) ? { conflict: true } : {}) });
  }
  for (const date of new Set([...Object.keys(before.dailyMemos), ...Object.keys(after.dailyMemos)])) {
    for (const period of PERIODS) {
      const left = before.dailyMemos[date] ? before.dailyMemos[date][period] || '' : '', right = after.dailyMemos[date] ? after.dailyMemos[date][period] || '' : '';
      if (left !== right) { const entity = `memo:${date}:${period}`; marks.push({ entity, actor, source, at, fields: [period], beforeText: left, afterText: right, ...(conflicts.includes(entity) ? { conflict: true } : {}) }); }
    }
  }
  return marks;
}
function isContent(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.tasks) && v.dailyMemos && typeof v.dailyMemos === 'object';
}

// ---------- 快照与身份 ----------
async function snapshot() {
  let rows = await rest('GET', 'sync_state', { select: 'id,content,revision,updated_at,marks', filter: { id: 'eq.main' } });
  let row = rows[0];
  if (!row) {
    const existing = await rest('GET', 'shared_plans', { select: 'content,updated_at', filter: { id: 'eq.main' } });
    const content = existing[0] ? jsonOrNull(existing[0].content) || emptyContent() : emptyContent();
    const now = Date.now();
    const init = { id: 'main', content: JSON.stringify(content), revision: 0, updated_at: existing[0] ? existing[0].updated_at : now, marks: '{}', last_commit: '' };
    await rest('POST', 'sync_state', { body: init, preferRepresentation: true, upsert: true, onConflict: 'id' });
    await rest('POST', 'sync_versions', { body: { revision: 0, content: JSON.stringify(content), updated_at: init.updated_at }, upsert: true, onConflict: 'revision' });
    row = init;
  }
  return { content: jsonOrNull(row.content) || emptyContent(), revision: row.revision, updatedAt: row.updated_at, marks: jsonOrNull(row.marks) || {} };
}
async function principal(req) {
  if (owner(req)) return { id: 'desktop', source: 'desktop', label: '电脑' };
  const token = bearer(req);
  if (!token) return null;
  const hashed = sha256hex(token);
  const devices = await rest('GET', 'sync_devices', { select: 'id,label', filter: { token_hash: 'eq.' + hashed, revoked: 'eq.0' } });
  if (devices[0]) return { id: devices[0].id, source: 'mobile', label: devices[0].label };
  const shares = await rest('GET', 'shared_plans', { select: 'editable', filter: { id: 'eq.main', view_token_hash: 'eq.' + hashed } });
  return (shares[0] && shares[0].editable) ? { id: `share-${hashed}`, source: 'share', label: '分享访客' } : null;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- 路由处理 ----------
async function health() {
  await rest('GET', 'sync_state', { select: 'id', limit: 1 });
  return { status: 200, body: { ok: true, service: 'focus-matrix', protocol: 1 } };
}
async function planGet(req) {
  const token = bearer(req);
  if (!token) return { status: 404, body: { error: '链接无效或分享已关闭' } };
  const hashed = sha256hex(token);
  const rows = await rest('GET', 'shared_plans', { select: '*', filter: { id: 'eq.main' } });
  const row = rows[0];
  if (!row || !equalToken(hashed, row.view_token_hash)) return { status: 404, body: { error: '链接无效或分享已关闭' } };
  const st = await rest('GET', 'sync_state', { select: 'content,revision,updated_at,marks', filter: { id: 'eq.main' } });
  const s = st[0];
  return { status: 200, body: { content: jsonOrNull(s ? s.content : row.content) || emptyContent(), updatedAt: s ? s.updated_at : row.updated_at, revision: s ? s.revision : 0, marks: s ? (jsonOrNull(s.marks) || {}) : {}, editable: !!row.editable } };
}
async function planPut(req) {
  if (!owner(req)) return { status: 401, body: { error: '无分享管理权限' } };
  const body = jsonOrNull(await readBody(req));
  if (!body) return { status: 400, body: { error: '无效数据' } };
  if (typeof body.viewToken === 'string' && /^[a-f0-9]{64}$/.test(body.viewToken) && typeof body.editingEnabled === 'boolean') {
    const cur = await snapshot();
    await rest('POST', 'shared_plans', { body: { id: 'main', content: JSON.stringify(cur.content), view_token_hash: sha256hex(body.viewToken), updated_at: cur.updatedAt, editable: body.editingEnabled ? 1 : 0 }, upsert: true, onConflict: 'id' });
    return { status: 200, body: { updatedAt: cur.updatedAt } };
  }
  if (typeof body.viewToken === 'string' && isContent(body.content)) {
    const st = await rest('GET', 'sync_state', { select: 'id', filter: { id: 'eq.main' } });
    if (st[0]) return { status: 409, body: { error: '请更新电脑客户端以启用双向同步' } };
    const now = Date.now();
    await rest('POST', 'shared_plans', { body: { id: 'main', content: JSON.stringify(body.content), view_token_hash: sha256hex(body.viewToken), updated_at: now, editable: 0 }, upsert: true, onConflict: 'id' });
    return { status: 200, body: { updatedAt: now } };
  }
  return { status: 400, body: { error: '分享格式无效' } };
}
async function planDelete(req) {
  if (!owner(req)) return { status: 401, body: { error: '无分享管理权限' } };
  await rest('DELETE', 'shared_plans', { filter: { id: 'eq.main' } });
  return { status: 200, body: { disabled: true } };
}
async function syncGet(req) {
  if (!await principal(req)) return { status: 401, body: { error: '无同步权限' } };
  return { status: 200, body: { snapshot: await snapshot() } };
}
async function syncPost(req) {
  const auth = await principal(req);
  if (!auth) return { status: 401, body: { error: '编辑权限无效或已撤销' } };
  const data = jsonOrNull(await readBody(req));
  if (!data || !isContent(data.base) || !isContent(data.content) || !/^[a-zA-Z0-9-]{8,80}$/.test(data.clientId || '') || !/^[a-zA-Z0-9-]{8,80}$/.test(data.requestId || '') || typeof data.actor !== 'string' || !data.actor.trim() || data.actor.length > 40) {
    return { status: 400, body: { error: '同步格式无效' } };
  }
  const receiptId = `${auth.id}:${data.clientId}`;
  const commitId = `${receiptId}:${data.requestId}`;
  const first = await rest('GET', 'sync_receipts', { select: 'request_id', filter: { id: 'eq.' + encodeURIComponent(receiptId) } });
  if (first[0] && first[0].request_id === data.requestId) return { status: 200, body: { snapshot: await snapshot(), conflicts: 0 } };
  for (let attempt = 0; attempt < 6; attempt++) {
    const seen = await rest('GET', 'sync_receipts', { select: 'request_id', filter: { id: 'eq.' + encodeURIComponent(receiptId) } });
    if (seen[0] && seen[0].request_id === data.requestId) return { status: 200, body: { snapshot: await snapshot(), conflicts: 0 } };
    const before = await snapshot();
    const merged = mergeContent(data.base, data.content, before.content);
    const now = Date.now();
    if (same(merged.content, before.content)) {
      await rest('POST', 'sync_receipts', { body: { id: receiptId, request_id: data.requestId, revision: before.revision }, upsert: true, onConflict: 'id' });
      return { status: 200, body: { snapshot: before, conflicts: 0 } };
    }
    const actor = auth.source === 'share' ? data.actor : auth.label;
    const changes = contentChanges(before.content, merged.content, actor, auth.source, now, merged.conflictIds);
    const marks = { ...before.marks };
    for (const change of changes) marks[change.entity] = change;
    const nextRevision = before.revision + 1;
    const updated = await rest('PATCH', 'sync_state', {
      filter: { id: 'eq.main', revision: 'eq.' + before.revision },
      body: { content: JSON.stringify(merged.content), revision: nextRevision, updated_at: now, marks: JSON.stringify(marks), last_commit: commitId },
      preferRepresentation: true,
    });
    if (!updated[0]) continue;
    await rest('POST', 'sync_versions', { body: { revision: nextRevision, content: JSON.stringify(merged.content), updated_at: now }, upsert: true, onConflict: 'revision' });
    await rest('POST', 'sync_receipts', { body: { id: receiptId, request_id: data.requestId, revision: nextRevision }, upsert: true, onConflict: 'id' });
    await rest('POST', 'sync_changes', { body: { id: commitId, revision: nextRevision, actor, source: auth.source, at: now, changes: JSON.stringify(changes) }, upsert: true, onConflict: 'id' });
    await rest('PATCH', 'shared_plans', { filter: { id: 'eq.main' }, body: { content: JSON.stringify(merged.content), updated_at: now } });
    return { status: 200, body: { snapshot: { content: merged.content, revision: nextRevision, updatedAt: now, marks }, conflicts: merged.conflictIds.length } };
  }
  return { status: 409, body: { error: '其他设备正在同步，请重试' } };
}
async function changesGet(req, url) {
  if (!await principal(req)) return { status: 401, body: { error: '无编辑记录访问权限' } };
  const beforeParam = url.searchParams.get('before');
  const before = beforeParam ? Number(beforeParam) : Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(before) || before < 0) return { status: 400, body: { error: '无效页码' } };
  const rows = await rest('GET', 'sync_changes', { select: 'revision,actor,source,at,changes', filter: { revision: 'lt.' + before }, order: 'revision.desc', limit: 30 });
  return { status: 200, body: { items: rows.map((r) => ({ revision: r.revision, actor: r.actor, source: r.source, at: r.at, changes: jsonOrNull(r.changes) || [] })) } };
}
async function devicesGet(req) {
  if (!owner(req)) return { status: 401, body: { error: '无设备管理权限' } };
  const rows = await rest('GET', 'sync_devices', { select: 'id,label,revoked', order: 'created_at.desc' });
  return { status: 200, body: { devices: rows } };
}
async function devicesDelete(req) {
  if (!owner(req)) return { status: 401, body: { error: '无设备管理权限' } };
  const body = jsonOrNull(await readBody(req));
  if (!body || typeof body.id !== 'string' || !UUID_RE.test(body.id)) return { status: 400, body: { error: '无效设备' } };
  await rest('PATCH', 'sync_devices', { filter: { id: 'eq.' + body.id }, body: { revoked: 1 } });
  return { status: 200, body: { revoked: true } };
}
async function pairPost(req) {
  if (!owner(req)) return { status: 401, body: { error: '只有电脑端可以配对新设备' } };
  const code = randomHex(32);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  await rest('POST', 'sync_pairings', { body: { id: crypto.randomUUID(), token_hash: sha256hex(code), expires_at: expiresAt, consumed: 0 } });
  const origin = PUBLIC_ORIGIN || `https://${ENV}.tcloudbaseapp.com`;
  return { status: 200, body: { pairingUrl: `${origin}/mobile/index.html#pair=${code}`, expiresAt } };
}
async function claimPost(req) {
  const code = bearer(req);
  if (!code) return { status: 401, body: { error: '请使用电脑生成的配对链接' } };
  const body = jsonOrNull(await readBody(req));
  if (!body || typeof body.label !== 'string' || !body.label.trim() || body.label.length > 40) return { status: 400, body: { error: '请填写设备名称' } };
  const hashed = sha256hex(code);
  // 消费配对链接：先读未消费且未过期的记录，再条件更新，保证只被领取一次
  const pair = await rest('GET', 'sync_pairings', { select: 'id', filter: { token_hash: 'eq.' + hashed, consumed: 'eq.0', expires_at: 'gt.' + Date.now() } });
  if (!pair[0]) return { status: 401, body: { error: '配对链接已过期或已使用，请在电脑上重新生成' } };
  const consumed = await rest('PATCH', 'sync_pairings', { filter: { id: 'eq.' + pair[0].id, consumed: 'eq.0' }, body: { consumed: 1 }, preferRepresentation: true });
  if (!consumed[0]) return { status: 401, body: { error: '配对链接已过期或已使用，请在电脑上重新生成' } };
  const token = randomHex(32);
  const id = crypto.randomUUID();
  await rest('POST', 'sync_devices', { body: { id, token_hash: sha256hex(token), label: body.label.trim(), revoked: 0, created_at: Date.now() } });
  return { status: 200, body: { deviceToken: token, deviceId: id, snapshot: await snapshot() } };
}
async function selfDelete(req) {
  const token = bearer(req);
  if (!token) return { status: 401, body: { error: '无手机连接凭据' } };
  const hashed = sha256hex(token);
  const devices = await rest('GET', 'sync_devices', { select: 'id', filter: { token_hash: 'eq.' + hashed } });
  if (!devices[0]) return { status: 401, body: { error: '无手机连接权限' } };
  await rest('PATCH', 'sync_devices', { filter: { id: 'eq.' + devices[0].id }, body: { revoked: 1 } });
  return { status: 200, body: { revoked: true } };
}

const ROUTES = {
  '/api/health': { GET: health },
  '/api/plan': { GET: planGet, PUT: planPut, DELETE: planDelete },
  '/api/sync': { GET: syncGet, POST: syncPost },
  '/api/changes': { GET: changesGet },
  '/api/devices': { GET: devicesGet, DELETE: devicesDelete },
  '/api/devices/pair': { POST: pairPost },
  '/api/devices/claim': { POST: claimPost },
  '/api/devices/self': { DELETE: selfDelete },
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req)); return res.end(); }
  const url = new URL(req.url || '/', 'http://localhost');
  const route = ROUTES[url.pathname];
  if (!route) return sendJson(req, res, 404, { error: '接口不存在' });
  const handler = route[req.method];
  if (!handler) return sendJson(req, res, 405, { error: '不允许的请求方法' });
  try {
    const result = await handler(req, url);
    sendJson(req, res, result.status, result.body);
  } catch (err) {
    if (err && err.message === 'too_large') return sendJson(req, res, 413, { error: '内容过大' });
    sendJson(req, res, 503, { error: '云端暂不可用，本地内容保留，请稍后重试' });
  }
});
server.listen(9000);
