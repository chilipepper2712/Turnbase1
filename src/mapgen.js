// Sinh map procedural KHÔNG đối xứng. Công bằng được kiểm tra sau khi sinh (assess), không ép bằng gương:
//  - đường bộ thông giữa hai thành (cả kỵ binh),
//  - "vùng ảnh hưởng" (ô nào tới thành nào trước) chia gần đều,
//  - mỗi bên có làng và chỗ ẩn nấp thiên nhiên trong vùng của mình.
// Quy ước: orc ở phía trên (y nhỏ), người ở phía dưới (y lớn).
import { CONFIG, TERRAIN, MAPGEN, mapScale, armySize } from './config.js';
import { makeRng, hash2 } from './rng.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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

function stepCost(tid, cavalry) {
  const t = TERRAIN[tid];
  if (!isFinite(t.cost)) return Infinity;
  if (cavalry && t.noCavalry) return Infinity;
  return t.cost;
}

// Dijkstra chi phí di chuyển từ một ô, trả mảng khoảng cách
function costField(map, from, cavalry = false) {
  const { w, h, tiles } = map;
  const dist = new Float32Array(w * h).fill(Infinity);
  const open = [{ x: from.x, y: from.y, c: 0 }];
  dist[from.y * w + from.x] = 0;
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const cur = open.shift();
    if (cur.c > dist[cur.y * w + cur.x]) continue;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = stepCost(tiles[ny * w + nx], cavalry);
      if (!isFinite(c)) continue;
      const t = cur.c + c;
      if (t < dist[ny * w + nx]) { dist[ny * w + nx] = t; open.push({ x: nx, y: ny, c: t }); }
    }
  }
  return dist;
}

export function connected(map, cavalry) {
  const f = costField(map, map.strongholds.human, cavalry);
  const e = map.strongholds.orc;
  return isFinite(f[e.y * map.w + e.x]);
}

const COVER = new Set(['forest', 'hill', 'mountain']);
const ROUGH = new Set(['hill', 'mountain', 'peak']);
const BRIDGE_BLOCKERS = new Set(['swamp', 'hill', 'mountain', 'peak', 'mine']);

export function bridgeEndsClear(map) {
  const { w, h, tiles } = map;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (tiles[y * w + x] !== 'bridge') continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && BRIDGE_BLOCKERS.has(tiles[ny * w + nx])) return false;
    }
  }
  return true;
}

// Đánh giá độ cân bằng của map (không phụ thuộc đối xứng)
export function assess(map) {
  const { w, h, tiles } = map;
  const dh = costField(map, map.strongholds.human);
  const dorc = costField(map, map.strongholds.orc);
  const mk = () => ({ tiles: 0, village: 0, cover: 0, structure: 0, forest: 0, rough: 0, open: 0 });
  const side = { human: mk(), orc: mk() };
  const all = { forest: 0, rough: 0, peak: 0 };
  for (let i = 0; i < w * h; i++) {
    const t = tiles[i];
    if (t === 'forest') all.forest++;
    if (ROUGH.has(t)) all.rough++;
    if (t === 'peak') all.peak++;
    if (isFinite(dh[i]) && dh[i] <= 8) side.human.open++;
    if (isFinite(dorc[i]) && dorc[i] <= 8) side.orc.open++;
    if (!isFinite(dh[i]) || !isFinite(dorc[i])) continue;
    const f = dh[i] < dorc[i] ? 'human' : dorc[i] < dh[i] ? 'orc' : null;
    if (!f) continue;
    const s2 = side[f];
    s2.tiles++;
    if (t === 'village') s2.village++;
    if (COVER.has(t)) s2.cover++;
    if (t === 'village' || t === 'mine' || t === 'fort') s2.structure++;
    if (t === 'forest') s2.forest++;
    if (ROUGH.has(t)) s2.rough++;
  }
  const total = side.human.tiles + side.orc.tiles || 1;
  const share = side.human.tiles / total;
  const N = w * h;
  const comp = { peak: all.peak / N, rough: all.rough / N, forest: all.forest / N };
  const frac = (f, k) => side[f][k] / (side[f].tiles || 1);
  const diffForest = Math.abs(frac('human', 'forest') - frac('orc', 'forest'));
  const diffRough = Math.abs(frac('human', 'rough') - frac('orc', 'rough'));
  const reasons = [];
  if (!connected(map, false) || !connected(map, true)) reasons.push('không thông đường');
  if (share < 0.42 || share > 0.58) reasons.push('vùng ảnh hưởng lệch');
  if (side.human.village < 1 || side.orc.village < 1) reasons.push('thiếu làng');
  if (side.human.cover < 4 || side.orc.cover < 4) reasons.push('thiếu chỗ ẩn nấp');
  if (comp.peak > MAPGEN.maxPeakShare) reasons.push('quá nhiều núi cao');
  if (comp.rough > MAPGEN.maxRoughShare) reasons.push('quá nhiều đồi núi');
  if (comp.forest < MAPGEN.forestMin || comp.forest > MAPGEN.forestMax) reasons.push('tỉ lệ rừng lệch');
  if (diffForest > MAPGEN.sideDiff) reasons.push('rừng dồn một phía');
  if (diffRough > MAPGEN.sideDiff) reasons.push('đồi núi dồn một phía');
  if (!bridgeEndsClear(map)) reasons.push('đầu cầu bị chắn');
  if (side.human.open < MAPGEN.minOpenNearHold || side.orc.open < MAPGEN.minOpenNearHold) reasons.push('thành bị nhốt');
  return { ok: reasons.length === 0, reasons, share, side, comp };
}

export function generateOnce(seed, w, h) {
  const rng = makeRng(seed);
  const scale = mapScale(w, h), army = armySize(w, h);
  const tiles = new Array(w * h).fill('plain');
  const at = (x, y) => tiles[y * w + x];
  const set = (x, y, t) => { tiles[y * w + x] = t; };
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

  // địa hình nền
  const nF = rng.int(1e9), nH = rng.int(1e9), nM = rng.int(1e9);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = noise(nF, x, y, 3.4), hh = noise(nH, x, y, 4.5), m = noise(nM, x, y, 2.6);
      let t = 'plain';
      if (hh > 0.76 && m > 0.66) t = 'peak';          // núi cao: không đi qua được
      else if (hh > 0.7 && m > 0.58) t = 'mountain';  // núi thấp
      else if (hh > 0.63) t = 'hill';
      else if (f > 0.66) t = 'forest';
      set(x, y, t);
    }
  }

  // thành: vị trí ngẫu nhiên trong dải của mỗi phe
  const orc = { x: 3 + rng.int(w - 6), y: 1 + rng.int(2) };
  const human = { x: 3 + rng.int(w - 6), y: h - 2 - rng.int(2) };
  const clear = (c) => {
    for (let y = c.y - 3; y <= c.y + 3; y++) for (let x = c.x - 3; x <= c.x + 3; x++) {
      if (inb(x, y) && Math.abs(x - c.x) + Math.abs(y - c.y) <= 3) set(x, y, 'plain');
    }
  };
  clear(orc); clear(human);
  set(orc.x, orc.y, 'stronghold'); set(human.x, human.y, 'stronghold');
  const nearHold = (x, y, r = 3) => Math.abs(x - orc.x) + Math.abs(y - orc.y) <= r || Math.abs(x - human.x) + Math.abs(y - human.y) <= r;

  // ---- Nước: ngẫu nhiên hoàn toàn. Có thể không có sông, một sông chạy từ mép này sang mép kia theo hướng bất kỳ,
  // sông rẽ nhánh (chia map thành 3 vùng), và/hoặc hồ. Cầu đặt dọc đường sông; bộ lọc `assess` đảm bảo vẫn đi được giữa hai thành.
  const edgePoint = (side) => {
    if (side === 0) return { x: rng.int(w), y: 0 };
    if (side === 1) return { x: w - 1, y: rng.int(h) };
    if (side === 2) return { x: rng.int(w), y: h - 1 };
    return { x: 0, y: rng.int(h) };
  };
  const walkRiver = (from, to) => {
    const path = [{ ...from }];
    let { x, y } = from;
    for (let guard = 0; guard < 6 * (w + h); guard++) {
      if (x === to.x && y === to.y) break;
      const dx = to.x - x, dy = to.y - y;
      let mx = 0, my = 0;
      const wander = rng();
      if (wander < 0.28) { if (rng() < 0.5) mx = rng() < 0.5 ? -1 : 1; else my = rng() < 0.5 ? -1 : 1; }
      else if (Math.abs(dx) * rng() > Math.abs(dy) * rng()) mx = Math.sign(dx) || (rng() < 0.5 ? -1 : 1);
      else my = Math.sign(dy) || (rng() < 0.5 ? -1 : 1);
      const nx = x + mx, ny = y + my;
      if (!inb(nx, ny)) continue;
      x = nx; y = ny; path.push({ x, y, mx, my });
    }
    return path;
  };
  const rivers = [];
  const paintRiver = (path) => {
    const cells = [];
    path.forEach((p, i) => {
      const horiz = i > 0 ? path[i].mx !== 0 : path[1] && path[1].mx !== 0;
      for (const [cx, cy] of [[p.x, p.y], horiz ? [p.x, p.y + 1] : [p.x + 1, p.y]]) {
        if (!inb(cx, cy) || nearHold(cx, cy, 4)) continue;
        if (at(cx, cy) === 'stronghold') continue;
        set(cx, cy, 'river'); cells.push({ x: cx, y: cy, idx: i, horiz });
      }
    });
    rivers.push({ path, cells });
  };
  const waterRoll = rng();
  // 18% không nước · 44% chỉ sông · 16% sông + hồ · 22% chỉ hồ
  if (waterRoll >= 0.18 && waterRoll < 0.78) {
    const s0 = rng.int(4);
    const s1 = rng() < 0.6 ? (s0 + 2) % 4 : (s0 + 1 + rng.int(3)) % 4;
    const main = walkRiver(edgePoint(s0), edgePoint(s1));
    paintRiver(main);
    if (rng() < 0.4 && main.length > 12) {                // nhánh: chia map thành 3 vùng
      const from = main[Math.floor(main.length * (0.25 + rng() * 0.5))];
      let s2 = rng.int(4); if (s2 === s0 || s2 === s1) s2 = (s2 + 1) % 4;
      paintRiver(walkRiver({ x: from.x, y: from.y }, edgePoint(s2)));
    }
  }
  if (waterRoll >= 0.62) {                                  // hồ (có thể đi kèm sông)
    const lakes = rng() < 0.3 ? 2 : 1, nL = rng.int(1e9);
    for (let k = 0; k < lakes; k++) {
      const cx = 3 + rng.int(w - 6), cy = 4 + rng.int(h - 8), r = (1.6 + rng() * 2.2) * Math.sqrt(scale);
      if (nearHold(cx, cy, r + 4)) continue;
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        if (!inb(x, y) || nearHold(x, y, 4)) continue;
        const d = Math.hypot(x - cx, (y - cy) * 1.2) + (noise(nL, x, y, 2) - 0.5) * 2;
        if (d < r) set(x, y, 'river');
      }
    }
  }
  // cầu: dọc mỗi sông, cách nhau >= 5 ô đường sông, ít nhất 2 cầu cho mỗi sông dài
  for (const rv of rivers) {
    const want = Math.max(2, Math.round(rv.path.length / 9));
    const used = [];
    for (let tries = 0; used.length < want && tries < 80; tries++) {
      const i = 1 + rng.int(Math.max(1, rv.path.length - 2));
      if (used.some((u) => Math.abs(u - i) < 5)) continue;
      const here = rv.cells.filter((c) => c.idx === i);
      if (!here.length || here.some((c) => at(c.x, c.y) !== 'river')) continue;
      used.push(i);
      for (const c of here) set(c.x, c.y, 'bridge');
      // hai đầu cầu phải là đất đi được
      for (const c of here) for (const [dx, dy] of DIRS) {
        const nx = c.x + dx, ny = c.y + dy;
        if (inb(nx, ny) && ['mountain', 'peak', 'swamp'].includes(at(nx, ny))) set(nx, ny, 'plain');
      }
    }
  }

  // đầm lầy: lấn ra bờ sông và vài vùng trũng
  const nS = rng.int(1e9);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (at(x, y) !== 'plain' || nearHold(x, y, 4)) continue;
    let byRiver = false;
    for (const [dx, dy] of DIRS) if (inb(x + dx, y + dy) && at(x + dx, y + dy) === 'river') byRiver = true;
    const n = noise(nS, x, y, 2.8);
    if ((byRiver && n > 0.55) || n > 0.8) set(x, y, 'swamp');
  }

  const free = (x, y) => inb(x, y) && ['plain', 'forest', 'hill'].includes(at(x, y));
  const fieldsAround = (x, y) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (inb(nx, ny) && at(nx, ny) === 'plain' && rng() < 0.6) set(nx, ny, 'field');
    }
  };
  const placeVillage = (cx, cy, rmin, rmax) => {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * Math.PI * 2, r = rmin + rng() * (rmax - rmin);
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      if (!free(x, y) || nearHold(x, y, 2)) continue;
      set(x, y, 'village'); fieldsAround(x, y); return true;
    }
    return false;
  };
  placeVillage(orc.x, orc.y, 4, 7);       // mỗi bên có làng gần nhà
  placeVillage(human.x, human.y, 4, 7);
  const extra = Math.round((1 + rng.int(3)) * scale);
  for (let i = 0; i < extra; i++) placeVillage(w / 2, h / 2, 0, Math.min(w, h) * 0.45);

  // tháp / cứ điểm ở khu giữa
  const nFort = Math.round((1 + rng.int(2)) * scale);
  for (let i = 0, t = 0; i < nFort && t < 120; t++) {
    const x = 2 + rng.int(w - 4), y = Math.floor(h * 0.3) + rng.int(Math.max(2, Math.floor(h * 0.4)));
    if (free(x, y) && !nearHold(x, y, 3)) { set(x, y, 'fort'); i++; }
  }

  // hầm mỏ: đồi / chân núi
  const spots = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === 'hill' && !nearHold(x, y, 4)) spots.push({ x, y });
  for (let i = 0; i < Math.round(2 * scale) && spots.length; i++) {
    const p = spots.splice(rng.int(spots.length), 1)[0];
    set(p.x, p.y, 'mine');
  }

  // đầu cầu phải thông thoáng: đầm lầy / đồi / núi / hầm mỏ không được nằm ngay cạnh cầu
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (at(x, y) !== 'bridge') continue;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (inb(nx, ny) && BRIDGE_BLOCKERS.has(at(nx, ny))) set(nx, ny, 'plain');
    }
  }

  const map = { w, h, tiles, seed, strongholds: { orc, human }, spawns: { orc: [], human: [] } };
  // ô xuất phát: các ô đi được gần thành nhất (từ vòng 2 trở ra), đủ số quân; hàng gần địch nhất lên trước
  for (const [f, me, foe] of [['orc', orc, human], ['human', human, orc]]) {
    const cands = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = at(x, y);
      const tt = TERRAIN[t];
      if (!isFinite(tt.cost) || tt.noCavalry || t === 'stronghold' || t === 'bridge') continue;
      const d = Math.abs(x - me.x) + Math.abs(y - me.y);
      if (d >= 2) cands.push({ x, y, d, e: Math.abs(x - foe.x) + Math.abs(y - foe.y) });
    }
    cands.sort((a, b) => a.d - b.d || a.e - b.e || a.x - b.x);
    map.spawns[f] = cands.slice(0, army).map(({ x, y }) => ({ x, y }));
    map.spawns[f].sort((a, b) => (Math.abs(a.x - foe.x) + Math.abs(a.y - foe.y)) - (Math.abs(b.x - foe.x) + Math.abs(b.y - foe.y)));
  }
  return map;
}

export function generateMap(seed = 1, w = CONFIG.map.w, h = CONFIG.map.h) {
  let best = null, bestScore = Infinity;
  for (let i = 0; i < 120; i++) {
    const s = (seed + i * 7919) >>> 0;
    const m = generateOnce(s, w, h);
    const n = armySize(w, h);
    if (m.spawns.human.length < n || m.spawns.orc.length < n) continue;
    const a = assess(m);
    m.requestedSeed = seed;
    m.fairness = a;
    if (a.ok) return m;
    if (connected(m, false) && connected(m, true)) {
      const score = a.reasons.length + Math.abs(a.share - 0.5);
      if (score < bestScore) { best = m; bestScore = score; }
    }
  }
  if (best) return best;
  throw new Error('Không sinh được map hợp lệ cho seed ' + seed);
}
