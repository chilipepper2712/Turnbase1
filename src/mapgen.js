// Sinh map procedural đối xứng xoay 180° để hai phe công bằng.
// Quy ước: orc ở phía trên (y nhỏ), người ở phía dưới (y lớn).
import { CONFIG, TERRAIN, ROSTER } from './config.js';
import { makeRng, hash2 } from './rng.js';

const rot = (w, h, x, y) => ({ x: w - 1 - x, y: h - 1 - y });

// value-noise mịn, [0,1)
function noise(seed, x, y, scale) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const s = (t) => t * t * (3 - 2 * t);
  const a = hash2(seed, x0, y0), b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1), d = hash2(seed, x0 + 1, y0 + 1);
  const u = s(tx), v = s(ty);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function generateOnce(seed, w, h) {
  const rng = makeRng(seed);
  const tiles = new Array(w * h).fill('plain');
  const at = (x, y) => tiles[y * w + x];
  const set = (x, y, t) => { tiles[y * w + x] = t; };
  const half = Math.floor(h / 2); // các hàng 0..half-1 là nửa orc

  // thành orc
  const sx = Math.floor(w / 2) - 1 + rng.int(3) - 1; // lệch nhẹ
  const sy = 1;
  const stronghold = { x: sx, y: sy };

  // nhiễu địa hình cho nửa orc
  const nF = rng.int(1e9), nH = rng.int(1e9), nM = rng.int(1e9);
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < w; x++) {
      const f = noise(nF, x, y, 3.2);
      const hh = noise(nH, x, y, 4.0);
      const m = noise(nM, x, y, 2.5);
      let t = 'plain';
      if (hh > 0.66) t = m > 0.7 ? 'mountain' : 'hill';
      else if (f > 0.68) t = 'forest';
      set(x, y, t);
    }
  }

  // vùng trống quanh thành
  for (let y = 0; y <= 3; y++) {
    for (let x = 0; x < w; x++) {
      if (Math.abs(x - sx) + Math.abs(y - sy) <= 3) set(x, y, 'plain');
    }
  }
  set(sx, sy, 'stronghold');

  // làng + ruộng
  const occupied = (x, y) => at(x, y) !== 'plain' && at(x, y) !== 'forest' && at(x, y) !== 'hill';
  const placeVillage = (x0, x1, y0, y1) => {
    for (let tries = 0; tries < 30; tries++) {
      const x = x0 + rng.int(x1 - x0 + 1), y = y0 + rng.int(y1 - y0 + 1);
      if (y >= half - 1) continue;
      if (occupied(x, y) || Math.abs(x - sx) + Math.abs(y - sy) < 3) continue;
      set(x, y, 'village');
      // ruộng quanh làng
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= half - 1) continue;
        if (at(nx, ny) === 'plain' && rng() < 0.7) set(nx, ny, 'field');
      }
      return;
    }
  };
  placeVillage(1, 5, 3, 6);
  placeVillage(w - 6, w - 2, 4, 7);

  // tháp / cứ điểm giữa đường
  for (let tries = 0; tries < 30; tries++) {
    const x = 5 + rng.int(w - 10), y = half - 4 + rng.int(2);
    if (!occupied(x, y)) { set(x, y, 'fort'); break; }
  }

  // hầm mỏ: biến 1-2 ô đồi thành mỏ (địa hình công trình)
  const hills = [];
  for (let y = 2; y < half - 1; y++) for (let x = 0; x < w; x++) if (at(x, y) === 'hill') hills.push({ x, y });
  for (let i = 0; i < 2 && hills.length; i++) {
    const k = rng.int(hills.length);
    const p = hills.splice(k, 1)[0];
    set(p.x, p.y, 'mine');
  }

  // sông: hàng half-1 (nửa orc) + ảnh xoay của nó là hàng half (nửa người)
  const bridgeCols = new Set();
  const bc = 2 + rng.int(Math.floor(w / 2) - 3); // 2..(w/2-2)
  bridgeCols.add(bc);
  bridgeCols.add(w - 1 - bc);
  if (rng() < 0.5) { bridgeCols.add(Math.floor(w / 2) - 1); bridgeCols.add(Math.floor(w / 2)); }
  const bridgeNear = (x) => [...bridgeCols].some((c) => Math.abs(c - x) <= 1);
  for (let x = 0; x < w; x++) set(x, half - 1, bridgeCols.has(x) ? 'bridge' : 'river');
  // vài khúc cong
  for (let x = 0; x < w; x++) {
    if (bridgeNear(x)) continue;
    if (hash2(seed + 7, x, 3) > 0.62) set(x, half - 2, 'river');
  }

  // xoay 180° nửa orc -> nửa người
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < w; x++) {
      const r = rot(w, h, x, y);
      set(r.x, r.y, at(x, y));
    }
  }
  // nếu h lẻ thì hàng giữa: không xảy ra với h=20, nhưng đề phòng
  if (h % 2 === 1) for (let x = 0; x < w; x++) set(x, half, 'plain');

  const human = rot(w, h, sx, sy);
  set(human.x, human.y, 'stronghold');

  // ô xuất phát của orc: ô đi được gần thành nhất, ưu tiên phía trước (gần sông)
  const cands = [];
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < w; x++) {
      const t = at(x, y);
      if (t === 'river' || t === 'mountain' || t === 'stronghold' || t === 'bridge') continue;
      const d = Math.abs(x - sx) + Math.abs(y - sy);
      if (d >= 2 && d <= 5) cands.push({ x, y, d });
    }
  }
  cands.sort((a, b) => a.d - b.d || b.y - a.y || a.x - b.x);
  const orcSpawns = cands.slice(0, ROSTER.length);
  // xếp lại: hàng trước (y lớn) cho bộ binh, kỵ binh ở rìa
  orcSpawns.sort((a, b) => b.y - a.y || Math.abs(a.x - sx) - Math.abs(b.x - sx));
  const humanSpawns = orcSpawns.map((p) => rot(w, h, p.x, p.y));

  return {
    w, h, tiles, seed,
    strongholds: { orc: stronghold, human },
    spawns: { orc: orcSpawns, human: humanSpawns },
  };
}

// BFS: có đường bộ từ thành này tới thành kia không (cả kỵ binh)
export function connected(map, cavalry) {
  const { w, h, tiles } = map;
  const ok = (x, y) => {
    const t = TERRAIN[tiles[y * w + x]];
    if (!isFinite(t.cost)) return false;
    if (cavalry && t.noCavalry) return false;
    return true;
  };
  const s = map.strongholds.human, e = map.strongholds.orc;
  const seen = new Set([s.x + ',' + s.y]);
  const q = [s];
  while (q.length) {
    const p = q.shift();
    if (p.x === e.x && p.y === e.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = nx + ',' + ny;
      if (seen.has(k) || !ok(nx, ny)) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  return false;
}

export function generateMap(seed = 1, w = CONFIG.map.w, h = CONFIG.map.h) {
  for (let i = 0; i < 40; i++) {
    const s = (seed + i * 7919) >>> 0;
    const m = generateOnce(s, w, h);
    if (connected(m, false) && connected(m, true)) { m.requestedSeed = seed; return m; }
  }
  throw new Error('Không sinh được map hợp lệ cho seed ' + seed);
}
