/* TeeTrip map tile router (Web Worker). Map engine by Islandwise Technologies.
   Serves one seamless road map from several tile archives of different detail.
   For a requested tile it uses the most detailed archive that has it; where no archive goes
   that deep, it cuts the tile out of the nearest coarser parent and re-encodes it. */
'use strict';
let ARCH = [];        // {name, minz, maxz, bbox, chunks, tiles: Map(tileId -> [chunk, off, len])}
let BASE = '';
const parentCache = new Map();
const PARENT_MAX = 48;
const E_DEFAULT = 4096;
const chunkCache = new Map();   // name-ci -> ArrayBuffer (LRU)
const CHUNK_MAX = 30;
const inflight = new Map();
let INIT = null; // tile requests wait until the index is in

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'init') {
    let done; INIT = new Promise(r => { done = r; });
    try {
      BASE = m.base;
      const raw = await (await again(BASE + 'tiles/index.wasm')).arrayBuffer();
      const idx = JSON.parse(new TextDecoder().decode(await gunzip(raw)));
      ARCH = idx.archives.map(a => ({ name: a.name, minz: a.minz, maxz: a.maxz, bbox: a.bbox, chunks: a.chunks, gz: a.gz,
        tiles: a.lazy ? null : tileMap(a), lazy: a.lazy ? null : undefined }));
      ARCH.sort((a, b) => b.maxz - a.maxz);
      self.postMessage({ type: 'ready' }); done();
    } catch (e) { self.postMessage({ type: 'ready', err: String(e) }); done(); }
    return;
  }
  if (m.type === 'tile') {
    try {
      await INIT;
      const buf = await getTile(m.z, m.x, m.y);
      if (buf) self.postMessage({ type: 'tile', id: m.id, data: buf }, [buf]);
      else self.postMessage({ type: 'tile', id: m.id, data: null });
    } catch (e) {
      self.postMessage({ type: 'tile', id: m.id, data: null, err: String(e) });
    }
  }
};

async function gunzip(buf) {
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/* a download that fails is tried twice more, a little later each time */
async function again(url) {
  let err;
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (r.ok) return r; err = new Error(url + ' ' + r.status); if (r.status === 404) break; }
    catch (e) { err = e; }
    await new Promise(r => setTimeout(r, 400 * (i + 1) * (i + 1)));
  }
  throw err;
}

/* Hilbert tile id, as PMTiles defines it */
function tileId(z, x, y) {
  let acc = 0;
  for (let i = 0; i < z; i++) acc += 4 ** i;
  const n = 2 ** z;
  let rx = 0, ry = 0, d = 0, tx = x, ty = y;
  for (let s = n / 2; s > 0; s = Math.floor(s / 2)) {
    rx = (tx & s) > 0 ? 1 : 0; ry = (ty & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) { if (rx === 1) { tx = s - 1 - tx; ty = s - 1 - ty; } const t = tx; tx = ty; ty = t; }
  }
  return acc + d;
}

async function chunk(a, ci) {
  const key = a.name + '-' + ci;
  let c = chunkCache.get(key);
  if (c) { chunkCache.delete(key); chunkCache.set(key, c); return c; }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    let r;
    try { r = await again(BASE + 'tiles/' + key + '.wasm'); } catch (e) { inflight.delete(key); throw e; }
    const b = await r.arrayBuffer();
    chunkCache.set(key, b);
    if (chunkCache.size > CHUNK_MAX) chunkCache.delete(chunkCache.keys().next().value);
    inflight.delete(key);
    return b;
  })();
  inflight.set(key, p);
  return p;
}

function tileMap(a) {
  const tiles = new Map(); let id = 0;
  for (let i = 0; i < a.id.length; i++) { id += a.id[i]; tiles.set(id, [a.c[i], a.o[i], a.l[i]]); }
  return tiles;
}
// street-level archives load their tile list on first use
function ensure(a) {
  if (a.tiles) return null;
  if (!a.lazy) a.lazy = again(BASE + 'tiles/idx-' + a.name + '.wasm').then(r => r.arrayBuffer()).then(b => gunzip(b))
    .then(u => { a.tiles = tileMap(JSON.parse(new TextDecoder().decode(u))); }).catch(() => { a.lazy = null; throw new Error('tile list'); });
  return a.lazy;
}
async function fetchFrom(a, z, x, y) {
  if (!a.tiles) await ensure(a);
  const e = a.tiles.get(tileId(z, x, y));
  if (!e) return null;
  const b = await chunk(a, e[0]);
  const raw = b.slice(e[1], e[1] + e[2]);
  if (!a.gz) return raw;
  const u = new Uint8Array(raw);
  if (u[0] === 0x1f && u[1] === 0x8b) { const out = await gunzip(raw); return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength); }
  return raw;
}

function tileBBox(z, x, y) {
  const n = 2 ** z;
  const lon = v => v / n * 360 - 180;
  const lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}
function hits(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }


async function getTile(z, x, y) {
  const tb = tileBBox(z, x, y);
  // 1. an archive that has this exact zoom
  for (const a of ARCH) {
    if (z < a.minz || z > a.maxz || !hits(tb, a.bbox)) continue;
    const d = await fetchFrom(a, z, x, y);
    if (d) return d;
  }
  // 2. overzoom from the deepest stored ancestor. An archive may hold this zoom but skip a tile (empty wilderness
  //    at z13, the far north at z8-9), so look inside every archive that starts below this zoom.
  let best = null;
  for (const a of ARCH) {
    if (a.minz >= z || !hits(tb, a.bbox)) continue;
    if (best && Math.min(a.maxz, z - 1) <= best.pz) continue;
    if (!a.tiles) await ensure(a);
    for (let pz = Math.min(a.maxz, z - 1); pz >= a.minz && (!best || pz > best.pz); pz--) {
      const dz = z - pz;
      if (a.tiles.has(tileId(pz, x >> dz, y >> dz))) { best = { a, pz }; break; }
    }
  }
  if (best) {
    const { a, pz } = best, dz = z - pz, px = x >> dz, py = y >> dz;
    const key = a.name + '|' + pz + '/' + px + '/' + py;
    let dec = parentCache.get(key);
    if (dec === undefined) {
      const d = await fetchFrom(a, pz, px, py);
      dec = d ? decodeTile(new Uint8Array(d)) : null;
      parentCache.set(key, dec);
      if (parentCache.size > PARENT_MAX) parentCache.delete(parentCache.keys().next().value);
    } else { parentCache.delete(key); parentCache.set(key, dec); }
    if (dec) return overzoom(dec, dz, x - (px << dz), y - (py << dz));
  }
  return null;
}

/* ---------- minimal protobuf ---------- */
function readVarint(b, st) {
  let v = 0, s = 0, c;
  do {
    c = b[st.p++];
    if (s < 28) v |= (c & 0x7f) << s; else v += (c & 0x7f) * 2 ** s;
    s += 7;
  } while (c & 0x80);
  return v >>> 0 === v ? v : v; // may exceed 2^31 for large ints; fine for our use
}
function skip(b, st, wt) {
  if (wt === 0) readVarint(b, st);
  else if (wt === 1) st.p += 8;
  else if (wt === 2) { const l = readVarint(b, st); st.p += l; }
  else if (wt === 5) st.p += 4;
}

function decodeTile(b) {
  const st = { p: 0 }, layers = [];
  while (st.p < b.length) {
    const tag = readVarint(b, st), f = tag >> 3, wt = tag & 7;
    if (f === 3 && wt === 2) {
      const l = readVarint(b, st);
      layers.push(decodeLayer(b, st.p, st.p + l));
      st.p += l;
    } else skip(b, st, wt);
  }
  return layers;
}
function decodeLayer(b, start, end) {
  const st = { p: start };
  const L = { extent: E_DEFAULT, version: 2, name: null, keys: [], values: [], features: [] };
  while (st.p < end) {
    const tag = readVarint(b, st), f = tag >> 3, wt = tag & 7;
    if (wt === 2) {
      const l = readVarint(b, st), s0 = st.p;
      if (f === 1) L.name = b.subarray(s0, s0 + l);
      else if (f === 3) L.keys.push(b.subarray(s0, s0 + l));
      else if (f === 4) L.values.push(b.subarray(s0, s0 + l));
      else if (f === 2) L.features.push(decodeFeature(b, s0, s0 + l));
      st.p = s0 + l;
    } else if (f === 5 && wt === 0) L.extent = readVarint(b, st);
    else if (f === 15 && wt === 0) L.version = readVarint(b, st);
    else skip(b, st, wt);
  }
  return L;
}
function decodeFeature(b, start, end) {
  const st = { p: start };
  const F = { id: null, tags: null, type: 0, parts: [] };
  while (st.p < end) {
    const tag = readVarint(b, st), f = tag >> 3, wt = tag & 7;
    if (f === 1 && wt === 0) F.id = readVarint(b, st);
    else if (f === 2 && wt === 2) { const l = readVarint(b, st); F.tags = b.subarray(st.p, st.p + l); st.p += l; }
    else if (f === 3 && wt === 0) F.type = readVarint(b, st);
    else if (f === 4 && wt === 2) {
      const l = readVarint(b, st), e = st.p + l;
      let x = 0, y = 0, part = null;
      while (st.p < e) {
        const ci = readVarint(b, st), cmd = ci & 7, cnt = ci >> 3;
        if (cmd === 1 || cmd === 2) {
          for (let i = 0; i < cnt; i++) {
            const dx = readVarint(b, st), dy = readVarint(b, st);
            x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
            if (cmd === 1) { part = [x, y]; F.parts.push(part); } else part.push(x, y);
          }
        } else if (cmd === 7) { /* close path: ring is implicit */ }
      }
    } else skip(b, st, wt);
  }
  return F;
}

/* ---------- writer ---------- */
class W {
  constructor() { this.b = new Uint8Array(1 << 16); this.p = 0; }
  need(n) { if (this.p + n > this.b.length) { let s = this.b.length * 2; while (s < this.p + n) s *= 2; const nb = new Uint8Array(s); nb.set(this.b.subarray(0, this.p)); this.b = nb; } }
  varint(v) { this.need(10); while (v > 0x7f) { this.b[this.p++] = (v & 0x7f) | 0x80; v = Math.floor(v / 128); } this.b[this.p++] = v; }
  bytes(u8) { this.need(u8.length); this.b.set(u8, this.p); this.p += u8.length; }
  field(f, wt) { this.varint((f << 3) | wt); }
  out() { return this.b.slice(0, this.p); }
}
const zz = n => (n << 1) ^ (n >> 31);

function encodeGeom(type, parts) {
  const w = new W();
  let cx = 0, cy = 0;
  for (const p of parts) {
    const n = p.length / 2;
    if (type === 1) {
      w.varint((1 & 7) | (1 << 3)); w.varint(zz(p[0] - cx)); w.varint(zz(p[1] - cy)); cx = p[0]; cy = p[1];
      continue;
    }
    w.varint(1 | (1 << 3)); w.varint(zz(p[0] - cx)); w.varint(zz(p[1] - cy)); cx = p[0]; cy = p[1];
    if (n > 1) {
      w.varint(2 | ((n - 1) << 3));
      for (let i = 1; i < n; i++) { const x = p[2 * i], y = p[2 * i + 1]; w.varint(zz(x - cx)); w.varint(zz(y - cy)); cx = x; cy = y; }
    }
    if (type === 3) w.varint(7 | (1 << 3));
  }
  return w.out();
}

/* ---------- clipping ---------- */
function clipLine(p, lo, hi) {
  const out = []; let cur = null;
  const inside = (x, y) => x >= lo && x <= hi && y >= lo && y <= hi;
  for (let i = 0; i < p.length / 2 - 1; i++) {
    let x0 = p[2 * i], y0 = p[2 * i + 1], x1 = p[2 * i + 2], y1 = p[2 * i + 3];
    // Liang-Barsky
    let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0; let ok = true;
    const P = [-dx, dx, -dy, dy], Q = [x0 - lo, hi - x0, y0 - lo, hi - y0];
    for (let k = 0; k < 4; k++) {
      if (P[k] === 0) { if (Q[k] < 0) { ok = false; break; } }
      else { const r = Q[k] / P[k]; if (P[k] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
    }
    if (!ok) { if (cur) { out.push(cur); cur = null; } continue; }
    const ax = Math.round(x0 + t0 * dx), ay = Math.round(y0 + t0 * dy), bx = Math.round(x0 + t1 * dx), by = Math.round(y0 + t1 * dy);
    if (!cur) cur = [ax, ay];
    else if (cur[cur.length - 2] !== ax || cur[cur.length - 1] !== ay) { out.push(cur); cur = [ax, ay]; }
    cur.push(bx, by);
    if (t1 < 1) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter(q => q.length >= 4);
}
function clipRing(p, lo, hi) {
  let pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  const edges = [
    [q => q[0] >= lo, (a, b) => { const t = (lo - a[0]) / (b[0] - a[0]); return [lo, a[1] + t * (b[1] - a[1])]; }],
    [q => q[0] <= hi, (a, b) => { const t = (hi - a[0]) / (b[0] - a[0]); return [hi, a[1] + t * (b[1] - a[1])]; }],
    [q => q[1] >= lo, (a, b) => { const t = (lo - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), lo]; }],
    [q => q[1] <= hi, (a, b) => { const t = (hi - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), hi]; }],
  ];
  for (const [ins, cut] of edges) {
    if (!pts.length) break;
    const res = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = ins(a), ib = ins(b);
      if (ia) { res.push(a); if (!ib) res.push(cut(a, b)); }
      else if (ib) res.push(cut(a, b));
    }
    pts = res;
  }
  if (pts.length < 3) return null;
  const flat = [];
  let lx = null, ly = null;
  for (const q of pts) { const x = Math.round(q[0]), y = Math.round(q[1]); if (x === lx && y === ly) continue; flat.push(x, y); lx = x; ly = y; }
  if (flat.length >= 4 && flat[0] === flat[flat.length - 2] && flat[1] === flat[flat.length - 1]) flat.length -= 2;
  if (flat.length < 6) return null;
  let area = 0;
  for (let i = 0; i < flat.length; i += 2) { const j = (i + 2) % flat.length; area += flat[i] * flat[j + 1] - flat[j] * flat[i + 1]; }
  return area === 0 ? null : flat;
}

const OZK = new TextEncoder().encode('oz'), OZV = new Uint8Array([0x38, 0x01]); // key 'oz', value bool true
function overzoom(layers, dz, ox, oy) {
  const s = 2 ** dz;
  const w = new W();
  for (const L of layers) {
    const E = L.extent || E_DEFAULT;
    const buf = Math.round(E / 32);
    const lo = -buf, hi = E + buf;
    const lw = new W();
    lw.field(15, 0); lw.varint(L.version || 2);
    if (L.name) { lw.field(1, 2); lw.varint(L.name.length); lw.bytes(L.name); }
    let nf = 0;
    for (const F of L.features) {
      const parts = [];
      for (const p of F.parts) {
        const q = new Array(p.length);
        for (let i = 0; i < p.length; i += 2) { q[i] = p[i] * s - ox * E; q[i + 1] = p[i + 1] * s - oy * E; }
        if (F.type === 1) { if (q[0] >= lo && q[0] <= hi && q[1] >= lo && q[1] <= hi) parts.push(q); }
        else if (F.type === 2) { for (const c of clipLine(q, lo, hi)) parts.push(c); }
        else if (F.type === 3) { const c = clipRing(q, lo, hi); if (c) parts.push(c); }
      }
      if (!parts.length) continue;
      // polygons: drop holes whose outer ring vanished (first ring must be exterior)
      const g = encodeGeom(F.type, parts);
      const fw = new W();
      if (F.id !== null) { fw.field(1, 0); fw.varint(F.id); }
      // every overzoomed feature carries oz=true so the style can tell a cut-down coarse tile from a real one
      const tw = new W(); if (F.tags) tw.bytes(F.tags); tw.varint(L.keys.length); tw.varint(L.values.length);
      const tg = tw.out(); fw.field(2, 2); fw.varint(tg.length); fw.bytes(tg);
      fw.field(3, 0); fw.varint(F.type);
      fw.field(4, 2); fw.varint(g.length); fw.bytes(g);
      const fb = fw.out();
      lw.field(2, 2); lw.varint(fb.length); lw.bytes(fb); nf++;
    }
    if (!nf) continue;
    for (const k of L.keys) { lw.field(3, 2); lw.varint(k.length); lw.bytes(k); }
    lw.field(3, 2); lw.varint(OZK.length); lw.bytes(OZK);
    for (const v of L.values) { lw.field(4, 2); lw.varint(v.length); lw.bytes(v); }
    lw.field(4, 2); lw.varint(OZV.length); lw.bytes(OZV);
    lw.field(5, 0); lw.varint(E);
    const lb = lw.out();
    w.field(3, 2); w.varint(lb.length); w.bytes(lb);
  }
  return w.out().buffer;
}
