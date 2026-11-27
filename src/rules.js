// Luật chơi thuần logic (không đụng DOM/Pixi). Mọi hàm đổi state đều trả về mảng sự kiện
// để lớp hiển thị diễn lại bằng animation.
import {
  CONFIG, TERRAIN, FACTIONS, FORMATION_MAX, STATS, MATCHUP, ROSTER, FORTIFY, LEVEL, MORALE, GOBLIN, UNDEAD, MARINE, FIRE, UNIT_VALUE,
} from './config.js';
import { stepWeather } from './weather.js';
import { stepFire, startFire, fireAt, rainingAt } from './fire.js';
import { updateFog } from './fog.js';

export const key = (x, y) => x + ',' + y;
export const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const other = (f) => (f === 'human' ? 'orc' : 'human');   // chỉ dùng khi không có state (trận mặc định người - Orc)
// Mỗi trận có đúng hai phe: s.sides = ['human', 'orc' | 'undead']
export const foeOf = (s, f) => (s.sides[0] === f ? s.sides[1] : s.sides[0]);

// ---------- Khởi tạo ----------
export function createState(map) {
  const sides = ['human', Object.keys(map.spawns).find((f) => f !== 'human') || 'orc'];
  const state = {
    map, sides, units: [], boats: [], graves: [], fires: [], current: 'human', turn: 1, nextId: 1,
    capture: { human: 0, orc: 0 }, winner: null, winReason: null,
    mission: { type: 'skirmish' },
  };
  const water = map.tiles.filter((t) => t === 'river').length >= MARINE.minWater;
  for (const f of sides) {
    map.spawns[f].forEach((p, i) => {
      let role = ROSTER[i % ROSTER.length];
      if (f === 'human' && water && i % ROSTER.length === MARINE.rosterSlot) role = 'marine';   // có sông hồ: thủy binh thay một dân quân
      const u = addUnit(state, f, role, p.x, p.y);
      if (f === 'undead') u.origin = UNDEAD.origins[i % UNDEAD.origins.length];
    });
    if (f === 'undead') { placeNecromancer(state, f); spawnSquads(state, f, UNDEAD.extra); }
  }
  // toán goblin ẩn trong rừng (phe Orc). Trận không có Orc: goblin hoang, giữ hang trong cụm rừng, không theo phe nào
  for (const g of map.goblins || []) {
    if (state.units.some((u) => u.x === g.x && u.y === g.y)) continue;
    const u = addUnit(state, 'orc', 'goblin', g.x, g.y, GOBLIN.strength);
    u.hidden = true;
    if (!sides.includes('orc')) u.lair = { x: g.x, y: g.y };
  }
  for (const u of state.units) { u.moved = false; u.acted = false; }
  return state;
}

// Necromancer đứng sau đạo quân: ô trống kề thành nhà, xa địch nhất (thành để trống cho nhiệm vụ cần ô thành)
function placeNecromancer(s, f) {
  const hold = s.map.strongholds[f], foe = s.map.strongholds[foeOf(s, f)];
  const cands = [];
  for (let r = 1; r <= 4 && !cands.length; r++) {
    for (let y = hold.y - r; y <= hold.y + r; y++) for (let x = hold.x - r; x <= hold.x + r; x++) {
      if (Math.abs(x - hold.x) + Math.abs(y - hold.y) !== r || !inBounds(s, x, y) || unitAt(s, x, y)) continue;
      const t = TERRAIN[terrainId(s, x, y)];
      if (!isFinite(t.cost) || terrainId(s, x, y) === 'stronghold') continue;
      cands.push({ x, y, e: Math.abs(x - foe.x) + Math.abs(y - foe.y) });
    }
  }
  cands.sort((a, b) => b.e - a.e || a.y - b.y || a.x - b.x);
  if (cands[0]) addUnit(s, f, 'necromancer', cands[0].x, cands[0].y);
}

export function addUnit(state, faction, role, x, y, strength = CONFIG.maxStrength) {
  const u = {
    id: state.nextId++, faction, role, x, y, strength,
    morale: CONFIG.startMorale, status: 'ok',
    moved: false, acted: false, movedDist: 0,
    xp: 0, fort: 0,          // fort: 2 = đã hạ trại (có hiệu lực), 0 = không
  };
  state.units.push(u);
  return u;
}

// Thêm n squad cho phe f vào các ô trống đi được gần thành nhà nhất (dùng cho đợt tiếp viện và quân thêm lúc đầu)
export function spawnSquads(s, f, n) {
  const hold = s.map.strongholds[f], foe = s.map.strongholds[foeOf(s, f)];
  const cands = [];
  for (let y = 0; y < s.map.h; y++) for (let x = 0; x < s.map.w; x++) {
    const t = terrainId(s, x, y);
    if (t === 'stronghold' || t === 'bridge' || unitAt(s, x, y)) continue;
    const tt = TERRAIN[t];
    if (!isFinite(tt.cost) || tt.noCavalry) continue;
    cands.push({ x, y, d: Math.abs(x - hold.x) + Math.abs(y - hold.y), e: Math.abs(x - foe.x) + Math.abs(y - foe.y) });
  }
  cands.sort((a, b) => a.d - b.d || a.e - b.e || a.x - b.x || a.y - b.y);
  const out = [];
  for (let i = 0; i < n && i < cands.length; i++) {
    const u = addUnit(s, f, ROSTER[i % ROSTER.length], cands[i].x, cands[i].y);
    if (f === 'undead') u.origin = UNDEAD.origins[(s.nextId + i) % UNDEAD.origins.length];
    out.push(u);
  }
  return out;
}

// Thêm n squad cho phe f vào các ô trống đi được gần điểm p nhất (tiếp viện bọc sườn có cờ báo trước)
export function spawnSquadsAt(s, f, n, p) {
  const cands = [];
  for (let y = 0; y < s.map.h; y++) for (let x = 0; x < s.map.w; x++) {
    const t = terrainId(s, x, y);
    if (t === 'stronghold' || t === 'bridge' || unitAt(s, x, y)) continue;
    const tt = TERRAIN[t];
    if (!isFinite(tt.cost) || tt.noCavalry) continue;
    cands.push({ x, y, d: Math.abs(x - p.x) + Math.abs(y - p.y) });
  }
  cands.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const out = [];
  for (let i = 0; i < n && i < cands.length; i++) {
    const u = addUnit(s, f, ROSTER[i % ROSTER.length], cands[i].x, cands[i].y);
    if (f === 'undead') u.origin = UNDEAD.origins[(s.nextId + i) % UNDEAD.origins.length];
    out.push(u);
  }
  return out;
}

export function cloneState(s) {
  return {
    ...s,
    units: s.units.map((u) => ({ ...u })),
    capture: { ...s.capture },
    boats: (s.boats || []).map((b) => ({ ...b })),
    graves: (s.graves || []).map((g) => ({ ...g })),
    fires: (s.fires || []).map((f) => ({ ...f })),
    weather: s.weather && { ...s.weather, clouds: s.weather.clouds.map((c) => ({ ...c })), wet: s.weather.wet.map((p) => ({ ...p })) },
    mission: { ...s.mission, waves: s.mission.waves && s.mission.waves.map((w) => ({ ...w, spot: w.spot && { ...w.spot } })) },
  };
}

// ---------- Truy vấn ----------
export const terrainId = (s, x, y) => s.map.tiles[y * s.map.w + x];
export const terrainAt = (s, x, y) => TERRAIN[terrainId(s, x, y)];
export const inBounds = (s, x, y) => x >= 0 && y >= 0 && x < s.map.w && y < s.map.h;
export const unitAt = (s, x, y) => s.units.find((u) => u.x === x && u.y === y) || null;
const UNDEAD_STATS = {};
// Chỉ số: âm binh thường lấy từ phe gốc lúc còn sống, sát thương giảm và chậm hơn
export const statsOf = (u) => {
  if (u.role === 'marine' && u.afloat) return STATS.human.marineboat;
  if (u.faction === 'undead' && STATS.undead[u.role] === undefined) {
    const k = (u.origin || 'human') + ':' + u.role;
    if (!UNDEAD_STATS[k]) {
      const b = STATS[u.origin || 'human'][u.role];
      UNDEAD_STATS[k] = { ...b, atk: b.atk * UNDEAD.atkMul, move: Math.max(1, b.move - UNDEAD.moveLoss) };
    }
    return UNDEAD_STATS[k];
  }
  return STATS[u.faction][u.role];
};
export const isRegular = (u) => u.role !== 'militia';
// Vai trò dùng cho bảng khắc chế: thủy binh trên thuyền đánh và chịu đòn như cung thủ, trên bộ như dân quân
export const matchRole = (u) => (u.role === 'marine' ? (u.afloat ? 'archer' : 'militia') : u.role);
export const boatAt = (s, x, y) => (s.boats || []).find((b) => b.x === x && b.y === y) || null;
const isWater = (s, x, y) => terrainId(s, x, y) === 'river';
// Quân phụ: không tính vào việc quét sạch, không chiếm thành (trại tĩnh, toán goblin)
export const isAux = (u) => !!u.static || u.role === 'goblin';
// Goblin hoang: thuộc "phe" không có trong trận (không có Orc sống để theo), đánh bất kỳ ai vào rừng của nó
export const isWild = (s, u) => u.role === 'goblin' && !s.sides.includes(u.faction);
// Quân ẩn (goblin) hoặc khuất trong sương mù: phe kia không thấy
export const hiddenFrom = (u, f) => (!!u.hidden || !!u.fogged) && u.faction !== f;

export function enemiesOf(s, f) { return s.units.filter((u) => u.faction !== f); }
export function alliesOf(s, f) { return s.units.filter((u) => u.faction === f); }

export function adjacentUnits(s, x, y) {
  const out = [];
  for (const [dx, dy] of DIRS) {
    const u = unitAt(s, x + dx, y + dy);
    if (u) out.push(u);
  }
  return out;
}

export function inEnemyZoc(s, f, x, y) {
  return adjacentUnits(s, x, y).some((u) => u.faction !== f && !u.static && !u.hidden && !u.fogged);
}

// Chi phí vào một loại địa hình theo phe + vai trò (không cần state)
export function moveCostFor(tid, faction, role) {
  const t = TERRAIN[tid];
  if (!isFinite(t.cost)) return Infinity;
  if (role === 'cavalry' && t.noCavalry) return Infinity;
  let c = t.cost;
  if (t.nat > 0) c = Math.max(1, c - FACTIONS[faction].natMoveDiscount);
  if (role === 'cavalry' && tid === 'forest') c += 1;
  if (role === 'cavalry' && t.cavExtra) c += t.cavExtra;
  return c;
}

// Chi phí vào một ô cho một unit
export function moveCost(s, u, x, y) {
  if (s.fires && s.fires.length && fireAt(s, x, y)) return Infinity;        // ô đang cháy: không ai bước vào
  if (u.role === 'marine') {
    if (u.afloat) {
      if (isWater(s, x, y)) return boatAt(s, x, y) ? Infinity : 1;          // đi trên sông hồ như bộ binh trên cạn; cầu chặn
      return isFinite(moveCostFor(terrainId(s, x, y), u.faction, 'militia')) ? 1 : Infinity;   // lên bờ (chỉ là bước cuối)
    }
    const b = boatAt(s, x, y);
    if (b && b.faction === u.faction) return 1;                            // bước vào thuyền của phe mình (bước cuối)
    return moveCostFor(terrainId(s, x, y), u.faction, 'militia');
  }
  return moveCostFor(terrainId(s, x, y), u.faction, u.role);
}

// Ô chuyển trạng thái của thủy binh (lên bờ / xuống thuyền): đi tới được nhưng không đi tiếp từ đó trong cùng lượt
export function isTransition(s, u, x, y) {
  if (u.role !== 'marine') return false;
  return u.afloat ? !isWater(s, x, y) : !!boatAt(s, x, y);
}

// Mô tả hiệu ứng địa hình cho UI (mọi con số lấy từ config, không hard-code)
export function terrainFacts(tid) {
  const t = TERRAIN[tid];
  const defOf = (f) => Math.round(t.nat * FACTIONS[f].natAffinity + t.str * FACTIONS[f].strAffinity + (t.mod || 0));
  return {
    passable: isFinite(t.cost),
    cost: { human: moveCostFor(tid, 'human', 'infantry'), orc: moveCostFor(tid, 'orc', 'infantry'),
      cavHuman: moveCostFor(tid, 'human', 'cavalry'), cavOrc: moveCostFor(tid, 'orc', 'cavalry') },
    def: { human: defOf('human'), orc: defOf('orc') },
    atk: t.atk || 0,
    rangeBonus: t.rangeBonus || 0,
    heal: t.heal ? CONFIG.healVillage : 0,
    noCavalry: !!t.noCavalry,
    structure: t.str > 0,
  };
}

// Mức sĩ khí: 'eager' | 'steady' | 'wavering' | 'routed'
export function moraleState(u) {
  if (u.static || FACTIONS[u.faction].noMorale) return 'steady';     // âm binh: không có sĩ khí
  if (u.status === 'routed') return 'routed';
  const R = FACTIONS[u.faction].routAt;
  if (u.morale > MORALE.eagerAt) return 'eager';
  if (u.morale <= R + MORALE.waverMargin) return 'wavering';
  return 'steady';
}
const moraleMod = (u) => MORALE[moraleState(u)] || { atk: 0, def: 0 };

export const levelOf = (xp) => LEVEL.xp.filter((t) => xp >= t).length;
export const nextLevelXp = (u) => LEVEL.xp[levelOf(u.xp)] ?? null;

// Phòng thủ do địa hình (thiên nhiên/công trình theo phe, cộng/trừ chung) tại (x,y)
export function terrainDefense(s, faction, x, y) {
  const fac = FACTIONS[faction];
  const t = terrainAt(s, x, y);
  return t.nat * fac.natAffinity + t.str * fac.strAffinity + (t.mod || 0);
}

// Mức cộng của hạ trại: cố định theo phe, nhân hệ số địa hình
export function fortifyBonus(s, u, x = u.x, y = u.y) {
  const scale = Math.min(FORTIFY.scaleMax, Math.max(FORTIFY.scaleMin, 1 + terrainDefense(s, u.faction, x, y) / 100));
  return FORTIFY[u.faction] * scale;
}

// % giảm sát thương unit nhận được khi đứng ở (x,y) (âm = chịu thêm sát thương)
export function defensePct(s, u, x, y) {
  const st = statsOf(u);
  const fac = FACTIONS[u.faction];
  let pct = st.def + levelOf(u.xp || 0) * LEVEL.defPerLevel + terrainDefense(s, u.faction, x, y) + moraleMod(u).def;
  if (fac.formation) {
    let n = 0;
    for (const a of adjacentUnits(s, x, y)) if (a.faction === u.faction && a.id !== u.id) n++;
    pct += Math.min(n, FORMATION_MAX) * fac.formation;
  }
  if (u.fort === 2) pct += fortifyBonus(s, u, x, y);
  return Math.max(-30, Math.min(pct, CONFIG.defCap));
}

export function rangeAt(s, u, x, y) {
  const st = statsOf(u);
  const [mn, mx] = st.range;
  const bonus = mx > 1 ? (terrainAt(s, x, y).rangeBonus || 0) : 0;
  return [mn, mx + bonus];
}

export function canMerge(src, tgt) {
  if (src.id === tgt.id || src.faction !== tgt.faction) return false;
  if (src.status === 'routed' || tgt.status === 'routed') return false;
  if (src.vip || src.static || tgt.static) return false;     // tướng hộ tống không bị gộp mất
  if (src.afloat || tgt.afloat) return false;                // đang trên thuyền thì không gộp
  if (tgt.strength >= CONFIG.maxStrength) return false;
  if (src.role === tgt.role) return true;
  return src.role === 'militia' && (tgt.role === 'infantry' || tgt.role === 'archer');
}

// ---------- Di chuyển ----------
// Trả về { tiles: Map key->{x,y,cost,prev,stop}, merges: Map unitId->{via,cost} }
export function reachable(s, u) {
  const f = u.faction;
  const st = statsOf(u);
  const best = new Map();
  const start = { x: u.x, y: u.y, cost: 0, prev: null };
  best.set(key(u.x, u.y), start);
  const open = [start];
  const merges = new Map();
  while (open.length) {
    open.sort((a, b) => a.cost - b.cost);
    const cur = open.shift();
    if (cur.done) continue;
    cur.done = true;
    const atStart = cur.x === u.x && cur.y === u.y;
    // ZOC: vào ô kề địch thì dừng
    if (!atStart && inEnemyZoc(s, f, cur.x, cur.y)) continue;
    if (!atStart && isTransition(s, u, cur.x, cur.y)) continue;      // lên bờ / xuống thuyền là bước cuối
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(s, nx, ny)) continue;
      const occ = unitAt(s, nx, ny);
      if (occ && occ.faction !== f && !occ.hidden && !occ.fogged) continue;     // quân địch đang ẩn / khuất sương: người đi không biết, nên vẫn tính đường
      const c = moveCost(s, u, nx, ny);
      if (!isFinite(c)) continue;
      const total = cur.cost + c;
      if (total > st.move) {
        // vẫn có thể là mục tiêu gộp quân nếu đứng sát (đã tính ở dưới)
        continue;
      }
      const k = key(nx, ny);
      const ex = best.get(k);
      if (!ex || total < ex.cost) {
        const node = { x: nx, y: ny, cost: total, prev: cur };
        best.set(k, node);
        open.push(node);
      }
    }
  }
  // ô dừng hợp lệ: không bị đồng đội chiếm (trừ ô đang đứng)
  const tiles = new Map();
  for (const [k, n] of best) {
    const occ = unitAt(s, n.x, n.y);
    if (occ && occ.id !== u.id && !hiddenFrom(occ, f)) continue;
    tiles.set(k, n);
  }
  // mục tiêu gộp: đồng đội kề một ô dừng được
  for (const tgt of s.units) {
    if (!canMerge(u, tgt)) continue;
    let bestVia = null;
    for (const [dx, dy] of DIRS) {
      const n = tiles.get(key(tgt.x + dx, tgt.y + dy));
      if (!n) continue;
      if (u.moved && !(n.x === u.x && n.y === u.y)) continue;
      if (!bestVia || n.cost < bestVia.cost) bestVia = n;
    }
    if (bestVia) merges.set(tgt.id, { via: bestVia, cost: bestVia.cost });
  }
  return { tiles, merges };
}

export function pathTo(node) {
  const p = [];
  for (let n = node; n; n = n.prev) p.push({ x: n.x, y: n.y });
  return p.reverse();
}

// Mục tiêu có thể bắn/đánh từ (x,y)
export function targetsFrom(s, u, x, y) {
  const [mn, mx] = rangeAt(s, u, x, y);
  const out = [];
  for (const e of s.units) {
    if (e.faction === u.faction || e.hidden || e.fogged) continue;
    const d = Math.abs(e.x - x) + Math.abs(e.y - y);
    if (d >= mn && d <= mx) out.push(e);
  }
  return out;
}

// ---------- Chiến đấu ----------
function flankCount(s, atk, def, fromX, fromY) {
  let n = 0;
  for (const a of adjacentUnits(s, def.x, def.y)) {
    if (a.faction !== atk.faction) continue;
    if (a.id === atk.id) continue;
    if (a.x === fromX && a.y === fromY) continue;
    n++;
  }
  return Math.min(n, CONFIG.flankMax);
}

// Tính sát thương atk gây cho def khi atk đứng ở (fx,fy). Không đổi state.
export function calcDamage(s, atk, def, fx = atk.x, fy = atk.y, movedDist = atk.movedDist || 0, strengthOverride) {
  const st = statsOf(atk);
  const str = strengthOverride ?? atk.strength;
  const ratio = str / CONFIG.maxStrength;
  const match = MATCHUP[matchRole(atk)][matchRole(def)];
  const melee = st.range[1] === 1;
  const flank = melee ? flankCount(s, atk, def, fx, fy) : 0;
  const charge = atk.role === 'cavalry' && movedDist >= CONFIG.chargeDist ? 1 + CONFIG.chargeBonus : 1;
  const defPct = defensePct(s, def, def.x, def.y);
  const lvl = 1 + levelOf(atk.xp || 0) * LEVEL.atkPerLevel + moraleMod(atk).atk;
  const high = 1 + (terrainAt(s, fx, fy).atk || 0) / 100;
  const raw = st.atk * lvl * high * ratio * match * (1 + flank * CONFIG.flankBonus) * charge * (1 - defPct / 100);
  const dmg = raw <= 0 ? 0 : Math.max(1, Math.round(raw));
  return { dmg, raw, match, flank, charge, defPct, ratio, lvl, high };
}

// Xem trước kết quả: sát thương + phản công
export function previewAttack(s, atk, def, fx = atk.x, fy = atk.y, movedDist = atk.movedDist || 0) {
  const a = calcDamage(s, atk, def, fx, fy, movedDist);
  const dmg = Math.min(a.dmg, def.strength);
  const defLeft = def.strength - dmg;
  let counter = 0;
  if (defLeft > 0) {
    const [mn, mx] = rangeAt(s, def, def.x, def.y);
    const d = Math.abs(def.x - fx) + Math.abs(def.y - fy);
    if (d >= mn && d <= mx) {
      // phản công tính theo vị trí attacker sau khi đã di chuyển
      const ghost = { ...atk, x: fx, y: fy };
      const view = { ...s, units: s.units.map((x) => (x.id === atk.id ? ghost : x)) };
      const c = calcDamage(view, def, ghost, def.x, def.y, 0, defLeft);
      counter = Math.min(c.dmg, atk.strength);
    }
  }
  return {
    dmg, counter, defLeft, atkLeft: atk.strength - counter,
    kills: defLeft <= 0, counterKills: atk.strength - counter <= 0, detail: a,
  };
}

function checkRout(u, events) {
  if (u.static || FACTIONS[u.faction].noMorale) return;              // âm binh không bao giờ bỏ chạy
  const f = FACTIONS[u.faction];
  if (u.status === 'ok' && u.morale <= f.routAt) {
    u.status = 'routed';
    u.acted = true;
    events.push({ type: 'rout', unit: u.id });
  }
}

function damageUnit(s, u, dmg, events) {
  const before = u.strength;
  u.strength = Math.max(0, u.strength - dmg);
  const lost = before - u.strength;
  u.morale = Math.max(0, u.morale - (lost / CONFIG.maxStrength) * 100 * CONFIG.moraleLoss);
  events.push({ type: 'damage', unit: u.id, amount: lost, x: u.x, y: u.y });
}

function removeIfDead(s, u, events) {
  if (u.strength > 0) return false;
  s.units = s.units.filter((x) => x.id !== u.id);
  events.push({ type: 'die', unit: u.id, x: u.x, y: u.y, faction: u.faction, role: u.role });
  digGrave(s, u, events);
  // necromancer chết: cả đạo âm binh mất phép điều khiển, đổ sụp thành xác vô hồn
  if (u.role === 'necromancer') {
    for (const x of s.units.filter((q) => q.faction === u.faction && !q.static)) {
      events.push({ type: 'collapse', unit: x.id, x: x.x, y: x.y });
    }
    s.units = s.units.filter((q) => q.faction !== u.faction || q.static);
    win(s, foeOf(s, u.faction), 'necromancer');
    return true;
  }
  for (const a of adjacentUnits(s, u.x, u.y)) {
    if (a.faction === u.faction) {
      a.morale = Math.max(0, a.morale - CONFIG.moraleAllyDeath);
      checkRout(a, events);
    }
  }
  return true;
}

function gainXp(u, amount, events) {
  if (amount <= 0 || u.strength <= 0 || u.static) return;
  const before = levelOf(u.xp);
  u.xp += amount;
  const after = levelOf(u.xp);
  if (after > before) events.push({ type: 'levelup', unit: u.id, level: after });
}

const win = (s, f, reason) => { if (!s.winner) { s.winner = f; s.winReason = reason; } };

// Bên f có được chiếm thành địch không (tuỳ nhiệm vụ)
export function canCapture(s, f) {
  const m = s.mission;
  return m.type === 'skirmish' || m.type === 'hold';      // phá thành và hộ tống không có chiếm đóng
}

// Mọi điều kiện thắng ngoài chuyện hết lượt. Gọi sau mỗi hành động có thể quyết định ván.
export function checkVictory(s) {
  if (s.winner) return;
  const m = s.mission;
  for (const f of s.sides) {
    if (!s.units.some((u) => u.faction === f && !isAux(u))) { win(s, foeOf(s, f), 'elimination'); return; }
  }
  if (m.type === 'destroy') {
    for (const f of s.sides) if (!s.units.some((u) => u.id === m.targets[f])) { win(s, foeOf(s, f), 'destroyed'); return; }
  }
  if (m.type === 'escort') {
    const vip = s.units.find((u) => u.id === m.vipId);
    if (!vip) win(s, m.hunter, 'vip_dead');
    else if (vip.x === m.goal.x && vip.y === m.goal.y && vip.status === 'ok') win(s, m.escort, 'vip_arrived');
  }
}

// Hết số lượt: bên giữ thành thắng (chỉ nhiệm vụ cố thủ có hạn giờ)
function checkTimeLimit(s) {
  const m = s.mission;
  if (s.winner || !m.turns || s.turn <= m.turns) return;
  if (m.type === 'hold') win(s, m.defender, 'survive');
}

// Atk phải đứng đúng vị trí tấn công. Trả về events.
// surprise = đòn phục kích: mục tiêu bị bất ngờ, không đánh trả
export function attackUnit(s, atk, def, surprise = false) {
  const events = [];
  if (atk.hidden) { atk.hidden = false; events.push({ type: 'reveal', unit: atk.id, x: atk.x, y: atk.y }); }   // ra đòn thì lộ diện
  expose(atk, events); expose(def, events);
  if (atk.fogged) events.push({ type: 'spotted', unit: atk.id, x: atk.x, y: atk.y });
  atk.spotted = true; atk.fogged = false;      // ra đòn: bị định vị dù đứng trong sương
  const pv = previewAttack(s, atk, def);
  if (surprise) { pv.counter = 0; pv.atkLeft = atk.strength; pv.counterKills = false; }
  events.push({ type: 'attack', attacker: atk.id, defender: def.id, attackerRole: atk.role, preview: pv, surprise });
  atk.fort = 0;                         // ra đòn thì phá trại
  damageUnit(s, def, pv.dmg, events);
  atk.morale = Math.min(100, atk.morale + CONFIG.moraleHit);
  gainXp(atk, pv.dmg * LEVEL.perDamage, events);
  const dead = removeIfDead(s, def, events);
  if (dead) {
    atk.morale = Math.min(100, atk.morale + CONFIG.moraleKill);
    gainXp(atk, LEVEL.kill, events);
  } else {
    gainXp(def, LEVEL.survive, events);
    checkRout(def, events);
    if (pv.counter > 0) {
      events.push({ type: 'counter', attacker: def.id, defender: atk.id, attackerRole: def.role });
      damageUnit(s, atk, pv.counter, events);
      gainXp(def, pv.counter * LEVEL.perDamage, events);
      if (removeIfDead(s, atk, events)) gainXp(def, LEVEL.kill, events);
    }
  }
  if (s.units.some((u) => u.id === atk.id)) {
    atk.acted = true;
    atk.moved = true;
    checkRout(atk, events);
    // bị bỏ chạy trong lúc ra đòn: hết lượt
  }
  checkVictory(s);
  updateFog(s);
  return events;
}

// ---------- Phục kích ----------
// Đi theo đường đã chọn, dừng lại ngay khi bước vào ô kề quân địch đang ẩn (hoặc sắp bước vào ô của nó).
// Ghi sự kiện 'move' cho đoạn đã đi. Trả về { cost, ambushers }.
function walkPath(s, u, path, events, routed = false) {
  const f = u.faction;
  let stop = path.length - 1, ambushers = [], bumped = null;
  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    const occ = unitAt(s, p.x, p.y);
    if (occ && occ.faction !== f && occ.hidden) { stop = i - 1; ambushers = [occ]; break; }
    // khuất trong sương mù: đâm sầm vào thì dừng ngay trước nó (không bị đánh úp)
    if (occ && occ.faction !== f && occ.fogged) { stop = i - 1; bumped = occ; break; }
    const adj = adjacentUnits(s, p.x, p.y).filter((a) => a.faction !== f && a.hidden);
    if (adj.length) { stop = i; ambushers = adj.sort((a, b) => a.id - b.id); break; }
    // bước tới cạnh quân địch vừa hiện ra khỏi sương: vùng khống chế, dừng lại
    const near = i < path.length - 1 && adjacentUnits(s, p.x, p.y).find((a) => a.faction !== f && a.fogged && !a.static);
    if (near) { stop = i; bumped = near; break; }
  }
  const walked = path.slice(0, stop + 1);
  let cost = 0;
  for (let i = 1; i < walked.length; i++) cost += moveCost(s, u, walked[i].x, walked[i].y);
  if (walked.length > 1) {
    events.push(routed ? { type: 'move', unit: u.id, path: walked, routed: true } : { type: 'move', unit: u.id, path: walked });
    const end = walked[walked.length - 1];
    u.x = end.x; u.y = end.y;
    expose(u, events);
  }
  if (bumped) events.push({ type: 'bump', unit: u.id, by: bumped.id, x: bumped.x, y: bumped.y });
  // quân ẩn tự đi ra khỏi rừng thì lộ diện
  if (u.hidden && terrainId(s, u.x, u.y) !== 'forest') { u.hidden = false; events.push({ type: 'reveal', unit: u.id, x: u.x, y: u.y }); }
  return { cost, ambushers, bumped };
}

// Quân lộ ra (đi / đánh / bị đánh): phe kia thấy rõ nó cho tới đầu lượt sau của chính phe nó
function expose(u, events) {
  if (u.veiled) events.push({ type: 'unveil', unit: u.id, x: u.x, y: u.y });
  u.exposed = true; u.veiled = false;
}

// Các toán ẩn kề bên lộ diện và lần lượt đánh vào quân vừa đi tới (bị đánh trả như thường)
function ambush(s, ambushers, victim, events) {
  for (const g of ambushers) {
    if (!s.units.includes(g) || !s.units.includes(victim)) break;
    g.hidden = false;
    events.push({ type: 'reveal', unit: g.id, x: g.x, y: g.y, ambush: true, target: victim.id });
    events.push(...attackUnit(s, g, victim, true));
  }
}

// ---------- Thủy binh ----------
// Sau khi đi: thủy binh đứng trên ô thuyền thì xuống thuyền; đang trên thuyền mà đứng trên đất thì lên bờ, thuyền nằm lại ô nước cuối cùng
function boardOrLand(s, u, path, events) {
  if (u.role !== 'marine') return;
  if (!u.afloat) {
    const b = boatAt(s, u.x, u.y);
    if (b && b.faction === u.faction) {
      s.boats = s.boats.filter((q) => q !== b);
      u.afloat = true;
      events.push({ type: 'embark', unit: u.id, x: u.x, y: u.y });
    }
    return;
  }
  if (!isWater(s, u.x, u.y)) {
    let i = path.findIndex((p) => p.x === u.x && p.y === u.y);
    if (i < 1) i = path.length - 1;
    const prev = path[i - 1];
    if (prev && isWater(s, prev.x, prev.y)) s.boats.push({ x: prev.x, y: prev.y, faction: u.faction });
    u.afloat = false;
    events.push({ type: 'disembark', unit: u.id, x: u.x, y: u.y, boat: prev ? { x: prev.x, y: prev.y } : null });
  }
}

const freeWaterNear = (s, u) => DIRS.map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy }))
  .filter((p) => inBounds(s, p.x, p.y) && isWater(s, p.x, p.y) && !unitAt(s, p.x, p.y) && !boatAt(s, p.x, p.y));
const forestNear = (s, u) => [{ x: u.x, y: u.y }, ...DIRS.map(([dx, dy]) => ({ x: u.x + dx, y: u.y + dy }))]
  .find((p) => inBounds(s, p.x, p.y) && terrainId(s, p.x, p.y) === 'forest') || null;
const readyToAct = (u) => !u.moved && !u.acted && u.status === 'ok';

// Chặt cây làm thuyền (1 lượt): đứng trên hoặc cạnh ô rừng; ô rừng đó thành đất trống
export function canChop(s, u) {
  return u.role === 'marine' && !u.afloat && !u.timber && readyToAct(u) && !!forestNear(s, u);
}
export function chopTree(s, u) {
  if (!canChop(s, u)) return null;
  const p = forestNear(s, u);
  s.map.tiles[p.y * s.map.w + p.x] = 'plain';
  u.timber = true; u.moved = true; u.acted = true; u.fort = 0;
  return [{ type: 'chop', unit: u.id, x: p.x, y: p.y }, { type: 'terrain', x: p.x, y: p.y, to: 'plain' }];
}

// ---------- Hỏa công ----------
// Lửa táp một squad: mất quân (và sĩ khí), quân ẩn bị lộ, có thể tháo chạy hoặc chết
function burnUnit(s, u, events) {
  if (u.static) return;
  if (u.hidden) { u.hidden = false; events.push({ type: 'reveal', unit: u.id, x: u.x, y: u.y }); }
  damageUnit(s, u, FIRE.damage, events);
  events[events.length - 1].fire = true;
  if (!removeIfDead(s, u, events)) checkRout(u, events);
}

// Ô rừng cung thủ đốt được từ chỗ đang đứng: trong tầm bắn (kể cả ô kề), chưa cháy, không đang mưa
export function igniteTiles(s, u, fx = u.x, fy = u.y) {
  if (u.faction !== 'human' || u.role !== 'archer' || u.acted || u.status !== 'ok' || u.afloat || fireWait(s, u) > 0) return [];
  const mx = rangeAt(s, u, fx, fy)[1], out = [];
  for (let y = fy - mx; y <= fy + mx; y++) for (let x = fx - mx; x <= fx + mx; x++) {
    const d = Math.abs(x - fx) + Math.abs(y - fy);
    if (d < 1 || d > mx || !inBounds(s, x, y) || terrainId(s, x, y) !== 'forest') continue;
    if (fireAt(s, x, y) || rainingAt(s, x, y)) continue;
    out.push({ x, y });
  }
  return out;
}
export const canIgnite = (s, u) => igniteTiles(s, u).length > 0;
// còn bao nhiêu lượt nữa mới dùng lại hỏa công (0 = sẵn sàng)
export const fireWait = (s, u) => Math.max(0, (u.fireReady || 0) - s.turn);

// Bắn tên lửa vào ô rừng (bắn mù cũng được): ô bén lửa ngay. Có quân trong đó (kể cả quân đang ẩn) thì
// trúng một mũi tên như bắn thường (có phản đòn nếu với tới) rồi bị lửa táp. Hết lượt cung thủ, chờ hồi FIRE.cooldown lượt.
export function igniteForest(s, u, x, y) {
  if (!igniteTiles(s, u).some((p) => p.x === x && p.y === y)) return null;
  const events = [{ type: 'ignite', unit: u.id, x, y }];
  if (u.hidden) { u.hidden = false; events.push({ type: 'reveal', unit: u.id, x: u.x, y: u.y }); }
  startFire(s, x, y);
  events.push({ type: 'fire', x, y });
  u.fireReady = s.turn + FIRE.cooldown;
  const v = unitAt(s, x, y);
  if (v && !v.static && v.faction !== u.faction) {
    if (v.hidden) { v.hidden = false; events.push({ type: 'reveal', unit: v.id, x: v.x, y: v.y, fire: true }); }
    const ev = attackUnit(s, u, v);
    for (const e of ev) { if (e.type === 'attack') e.fireShot = true; events.push(e); }
    if (s.units.includes(v) && !s.winner) burnUnit(s, v, events);
  } else if (v && !s.winner) burnUnit(s, v, events);
  u.acted = true; u.moved = true;
  checkVictory(s);
  updateFog(s);
  return events;
}

// Đóng thuyền, hạ thủy (1 lượt): có gỗ, đứng sát ô nước trống; xuống thuyền luôn ở ô nước đó
export function canLaunch(s, u) {
  return u.role === 'marine' && !u.afloat && !!u.timber && readyToAct(u) && freeWaterNear(s, u).length > 0;
}
export function launchBoat(s, u) {
  if (!canLaunch(s, u)) return null;
  const foe = s.map.strongholds[foeOf(s, u.faction)];
  const p = freeWaterNear(s, u).sort((a, b) => dist(a, foe) - dist(b, foe) || a.y - b.y || a.x - b.x)[0];
  const from = { x: u.x, y: u.y };
  u.x = p.x; u.y = p.y; u.afloat = true; u.timber = false; u.moved = true; u.acted = true; u.fort = 0;
  updateFog(s);
  return [{ type: 'move', unit: u.id, path: [from, { x: p.x, y: p.y }] }, { type: 'embark', unit: u.id, x: p.x, y: p.y, launch: true }];
}

// ---------- Mộ tử sĩ (necromancer triệu hồi âm binh) ----------
// Có phe âm binh trong trận thì quân phe sống chết đi để lại mộ ở ô nó ngã xuống.
// Âm binh chết là tan hẳn; trại tĩnh và goblin không để lại mộ; mỗi ô chỉ một mộ.
export const graveAt = (s, x, y) => (s.graves || []).find((g) => g.x === x && g.y === y) || null;
// loại quân khi trỗi dậy: thủy binh đứng trên bộ thì thành dân quân (âm binh không có thuyền)
const raisedRole = (role) => (role === 'marine' ? 'militia' : role);

function digGrave(s, u, events) {
  if (!s.sides.includes('undead') || u.faction === 'undead' || u.static || u.role === 'goblin') return;
  if (graveAt(s, u.x, u.y) || terrainId(s, u.x, u.y) === 'river') return;   // chết dưới nước: không có mộ
  s.graves ||= [];
  const g = { x: u.x, y: u.y, faction: u.faction, role: raisedRole(u.role), turn: s.turn };
  s.graves.push(g);
  events.push({ type: 'grave', ...g });
}

// Số lượt còn lại trước khi mộ trỗi dậy (0 = đầu lượt âm binh tới là dậy). Cả bản đồ bị ếm khi necromancer
// còn sống; trong vùng ếm của nó thì nhanh (raiseDelay), ngoài vùng thì chậm (raiseDelayFar). Tính theo vị trí hiện tại.
export const graveWait = (s, g) => Math.max(0, g.turn + (graveInRange(s, g) ? UNDEAD.raiseDelay : UNDEAD.raiseDelayFar) - s.turn);
// Mộ đang nằm trong tầm triệu hồi của necromancer nào đó
export function graveInRange(s, g) {
  return s.units.some((n) => n.role === 'necromancer' && dist(n, g) <= UNDEAD.raiseRadius);
}

// Đầu lượt phe có necromancer: mộ đủ lượt chờ, trong tầm, ô trống thì trỗi dậy thành âm binh
function raiseGraves(s, f, events) {
  const necros = s.units.filter((n) => n.faction === f && n.role === 'necromancer');
  if (!necros.length || !(s.graves || []).length) return;
  const keep = [];
  for (const g of s.graves) {
    const ready = graveWait(s, g) === 0 && !unitAt(s, g.x, g.y);
    if (!ready) { keep.push(g); continue; }
    const u = addUnit(s, f, g.role, g.x, g.y, Math.max(1, Math.round(CONFIG.maxStrength * UNDEAD.raiseStrength)));
    u.origin = g.faction;
    events.push({ type: 'rise', unit: u.id, x: g.x, y: g.y, origin: g.faction });
  }
  s.graves = keep;
}

// Cầu siêu tử sĩ: squad phe sống đứng trên hoặc cạnh mộ, chưa ra đòn trong lượt (đi rồi vẫn được),
// bỏ lượt đó để chôn cất, làm lễ cầu siêu: mộ mất, necromancer không triệu hồi được nữa.
const graveNear = (s, u) => (s.graves || [])
  .filter((g) => dist(g, u) <= 1)
  .sort((a, b) => graveWait(s, a) - graveWait(s, b) || a.turn - b.turn || a.y - b.y || a.x - b.x)[0] || null;
export function canBury(s, u) {
  return u.faction !== 'undead' && !u.static && u.role !== 'goblin' && !u.afloat && !u.acted && u.status === 'ok' && !!graveNear(s, u);
}
export function buryGrave(s, u) {
  if (!canBury(s, u)) return null;
  const g = graveNear(s, u);
  s.graves = s.graves.filter((q) => q !== g);
  u.moved = true; u.acted = true; u.fort = 0;
  return [{ type: 'bury', unit: u.id, x: g.x, y: g.y, faction: g.faction }];
}

// ---------- Hành động ----------
export function waitUnit(s, u) { u.acted = true; u.moved = true; return [{ type: 'wait', unit: u.id }]; }

export function moveUnit(s, u, x, y) {
  const reach = reachable(s, u);
  const node = reach.tiles.get(key(x, y));
  if (!node || u.moved) return null;
  const events = [];
  const path = pathTo(node);
  const res = walkPath(s, u, path, events);
  boardOrLand(s, u, path, events);
  u.moved = true; u.movedDist = res.cost; u.fort = 0;
  if (res.ambushers.length) ambush(s, res.ambushers, u, events);
  checkVictory(s);
  updateFog(s);
  return events;
}

// Gộp u vào tgt (u di chuyển tới sát tgt rồi gộp)
export function mergeUnits(s, u, tgt) {
  const reach = reachable(s, u);
  const m = reach.merges.get(tgt.id);
  if (!m) return null;
  const events = [];
  const via = m.via;
  if (via.x !== u.x || via.y !== u.y) {
    const res = walkPath(s, u, pathTo(via), events);
    if (res.ambushers.length || res.bumped) {        // bị phục kích / đâm vào quân khuất sương giữa đường: không gộp được nữa
      u.moved = true; u.movedDist = res.cost; u.fort = 0;
      if (res.ambushers.length) ambush(s, res.ambushers, u, events);
      checkVictory(s);
      updateFog(s);
      return events;
    }
  }
  const room = CONFIG.maxStrength - tgt.strength;
  const move = Math.min(room, u.strength);
  // morale trung bình có trọng số
  tgt.morale = Math.round((tgt.morale * tgt.strength + u.morale * move) / (tgt.strength + move));
  // pha loãng một phần: lệch về trung bình theo quân số chỉ một nửa; cấp không tụt vì gộp
  const avgXp = (tgt.xp * tgt.strength + u.xp * move) / (tgt.strength + move);
  const floorXp = LEVEL.xp[levelOf(tgt.xp) - 1] ?? 0;
  tgt.xp = Math.max(floorXp, Math.round(tgt.xp + CONFIG.mergeXpBlend * (avgXp - tgt.xp)));
  u.fort = 0;
  tgt.strength += move;
  u.strength -= move;
  events.push({ type: 'merge', unit: u.id, target: tgt.id, amount: move });
  if (u.strength <= 0) {
    s.units = s.units.filter((x) => x.id !== u.id);
    events.push({ type: 'vanish', unit: u.id });
  } else {
    u.moved = true; u.acted = true;
  }
  updateFog(s);
  return events;
}

// Hạ trại: thay cho cả lượt hành động (không di chuyển, không tấn công). Có hiệu lực ngay lập tức,
// giữ nguyên cho tới khi quân di chuyển, tấn công, gộp/tách hoặc bỏ chạy.
export function canFortify(s, u) {
  return !u.afloat && !u.moved && !u.acted && u.status === 'ok' && u.fort === 0;
}

export function fortifyUnit(s, u) {
  if (!canFortify(s, u)) return null;
  u.fort = 2; u.moved = true; u.acted = true;
  return [{ type: 'fortify', unit: u.id }];
}

export function canSplit(s, u) {
  return !u.afloat && !u.moved && !u.acted && u.strength >= 2 && u.status === 'ok';
}

export function splitTiles(s, u) {
  const out = [];
  for (const [dx, dy] of DIRS) {
    const x = u.x + dx, y = u.y + dy;
    if (!inBounds(s, x, y) || unitAt(s, x, y)) continue;
    if (!isFinite(moveCost(s, u, x, y))) continue;
    out.push({ x, y });
  }
  return out;
}

export function splitUnit(s, u, x, y) {
  if (!canSplit(s, u)) return null;
  if (!splitTiles(s, u).some((p) => p.x === x && p.y === y)) return null;
  const give = Math.floor(u.strength / 2);
  u.strength -= give;
  const n = addUnit(s, u.faction, u.role, x, y, give);
  n.morale = u.morale; n.xp = 0; n.moved = true; n.acted = true;
  u.moved = true; u.acted = true; u.fort = 0;
  updateFog(s);
  return [{ type: 'split', unit: u.id, newUnit: n.id, x, y }];
}

// ---------- Bỏ chạy ----------
const FLEE_SAFETY = 0.6, FLEE_DETOUR = 1;
// Quy tắc xác định (không xác suất), xét lại mỗi lượt:
//   1. thành nhà (nhiệm vụ phá trại: ô kề trại nhà) trong tầm <= fleeHomeTurns lượt đi -> chạy về đó
//   2. không thì chạy về phía hậu quân nếu có squad cùng phe không bỏ chạy ở phía sau trong tầm 3 lượt đi
//   3. không thì chạy ra khỏi bản đồ qua mép sau lưng (tướng hộ tống thì không bao giờ rời trận)
//   kẹt (không có đường) thì đứng yên.
// Trường chi phí từ các ô đích: chi phí đi từ mỗi ô tới đích; quân địch chặn đường, quân mình thì không.
function costFieldFrom(s, u, goals) {
  const { w, h } = s.map;
  const field = new Float32Array(w * h).fill(Infinity);
  const open = [];
  for (const g of goals) { field[g.y * w + g.x] = 0; open.push({ x: g.x, y: g.y, c: 0 }); }
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const cur = open.shift();
    if (cur.c > field[cur.y * w + cur.x]) continue;
    const step = moveCost(s, u, cur.x, cur.y);        // đi từ ô kề vào cur tốn chi phí của cur
    if (!isFinite(step)) continue;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(s, nx, ny)) continue;
      const occ = unitAt(s, nx, ny);
      if (occ && occ.faction !== u.faction) continue;
      const t = cur.c + step, i = ny * w + nx;
      if (t < field[i]) { field[i] = t; open.push({ x: nx, y: ny, c: t }); }
    }
  }
  return field;
}

function homeTile(s, u) {
  const m = s.mission;
  if (m.type === 'escort') return null;
  const hold = s.map.strongholds[u.faction];
  const free = (x, y) => { const o = unitAt(s, x, y); return inBounds(s, x, y) && isFinite(moveCost(s, u, x, y)) && (!o || o.id === u.id); };
  const at = unitAt(s, hold.x, hold.y);
  if (at && at.faction !== u.faction) return null;                    // thành đã mất: đừng chạy về đó
  if (m.type !== 'destroy' && free(hold.x, hold.y)) return { x: hold.x, y: hold.y };
  const cands = DIRS.map(([dx, dy]) => ({ x: hold.x + dx, y: hold.y + dy })).filter((p) => free(p.x, p.y));
  cands.sort((a, b) => dist(a, u) - dist(b, u) || a.x - b.x || a.y - b.y);
  return cands[0] || null;
}

// Mép sau lưng: hàng trên hoặc dưới, phía xa thành địch
export function rearEdgeY(s, f) {
  const own = s.map.strongholds[f], foe = s.map.strongholds[foeOf(s, f)];
  return own.y >= foe.y ? s.map.h - 1 : 0;
}

// Trả về { kind: 'home'|'rear'|'exit'|'none', dest, field, edgeY? }. Không đổi state.
export function fleePlan(s, u) {
  const { w, h } = s.map, f = u.faction, move = statsOf(u).move;
  const own = s.map.strongholds[f];
  const here = (fld) => fld[u.y * w + u.x];
  const home = homeTile(s, u);
  if (home) {
    const fld = costFieldFrom(s, u, [home]);
    if (here(fld) <= move * MORALE.fleeHomeTurns) return { kind: 'home', dest: home, field: fld };
  }
  const dU = Math.abs(u.x - own.x) + Math.abs(u.y - own.y);
  // chỗ nương tựa: squad cùng phe không bỏ chạy, ở phía sau (gần thành nhà hơn) hoặc ngay sát bên (trong fleeAllyRadius ô)
  const allies = s.units.filter((a) => a.faction === f && a.id !== u.id && !a.static && a.status === 'ok'
    && (Math.abs(a.x - own.x) + Math.abs(a.y - own.y) < dU || dist(a, u) <= MORALE.fleeAllyRadius));
  if (allies.length) {
    const fld = costFieldFrom(s, u, allies.map((a) => ({ x: a.x, y: a.y })));
    if (here(fld) <= move * 3) {
      const near = allies.slice().sort((a, b) => dist(a, u) - dist(b, u) || a.id - b.id)[0];
      return { kind: 'rear', dest: { x: near.x, y: near.y }, field: fld };
    }
  }
  if (!u.vip) {
    const edgeY = rearEdgeY(s, f);
    const goals = [];
    for (let x = 0; x < w; x++) if (isFinite(moveCost(s, u, x, edgeY)) && (!unitAt(s, x, edgeY) || unitAt(s, x, edgeY).id === u.id)) goals.push({ x, y: edgeY });
    if (goals.length) {
      const fld = costFieldFrom(s, u, goals);
      if (isFinite(here(fld))) {
        const dest = goals.slice().sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x) || a.x - b.x)[0];
        return { kind: 'exit', dest, field: fld, edgeY };
      }
    }
  }
  return { kind: 'none', dest: null, field: null };
}

// Squad rời hẳn bản đồ: không tính là chết. Elite bị giáng 1 cấp (xp về mốc cấp thấp hơn), ghi vào s.escaped để chiến dịch dùng sau.
function escapeUnit(s, u, events) {
  const before = levelOf(u.xp || 0);
  const xp = before > 0 ? (LEVEL.xp[before - 2] ?? 0) : u.xp;
  s.units = s.units.filter((x) => x.id !== u.id);
  (s.escaped ||= []).push({ ...u, xp, turn: s.turn, levelBefore: before, levelAfter: levelOf(xp) });
  events.push({ type: 'escape', unit: u.id, x: u.x, y: u.y, faction: u.faction, role: u.role, levelBefore: before, levelAfter: levelOf(xp) });
}

function runFlee(s, u, events) {
  const plan = fleePlan(s, u);
  if (plan.kind === 'none') return;
  if (plan.kind === 'exit' && u.y === plan.edgeY) { escapeUnit(s, u, events); return; }
  const reach = reachable(s, u);
  const cur = plan.field[u.y * s.map.w + u.x];
  const foes = enemiesOf(s, u.faction).filter((e) => !e.static);
  const safe = (x, y) => Math.min(8, foes.length ? Math.min(...foes.map((e) => Math.abs(e.x - x) + Math.abs(e.y - y))) : 8);
  // vừa tiến về đích vừa thoát khỏi kẻ đuổi: chi phí còn lại tới đích trừ thưởng cho ô xa địch
  let best = null, bestScore = cur - FLEE_SAFETY * safe(u.x, u.y);
  for (const n of reach.tiles.values()) {
    const c = plan.field[n.y * s.map.w + n.x];
    if (!isFinite(c) || c > cur + FLEE_DETOUR) continue;      // không đi vòng xa khỏi đích
    const sc = c - FLEE_SAFETY * safe(n.x, n.y);
    if (sc < bestScore - 1e-9) { bestScore = sc; best = n; }
  }
  if (best && (best.x !== u.x || best.y !== u.y)) {
    const fp = pathTo(best);
    const res = walkPath(s, u, fp, events, true);
    boardOrLand(s, u, fp, events);
    if (res.ambushers.length) { ambush(s, res.ambushers, u, events); return; }
  }
  if (plan.kind === 'exit' && u.y === plan.edgeY) escapeUnit(s, u, events);
}

// ---------- Goblin hoang ----------
// Lãnh địa: cụm rừng (nối 4 hướng) chứa hang; hang bị đốt trụi thì lấy cụm rừng nó đang đứng.
export function wildLand(s, g) {
  const { w } = s.map, out = new Set();
  const forest = (x, y) => inBounds(s, x, y) && terrainId(s, x, y) === 'forest';
  const start = g.lair && forest(g.lair.x, g.lair.y) ? g.lair : forest(g.x, g.y) ? g : null;
  if (!start) return out;
  const q = [[start.x, start.y]]; out.add(start.y * w + start.x);
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (forest(nx, ny) && !out.has(ny * w + nx)) { out.add(ny * w + nx); q.push([nx, ny]); }
    }
  }
  return out;
}

// Cuối lượt của mỗi phe, từng toán goblin hoang đánh một quân của phe đó đang đứng trong rừng của nó (hoặc kề nó).
// Goblin biết rõ rừng nhà (không bị sương mù che). Đang ẩn thì là đòn phục kích (không bị đánh trả). Chỉ đi trong rừng nhà.
// Không ai trong rừng thì ẩn lại. Mỗi vòng chạy hai lần (sau lượt người, sau lượt âm binh) nên sĩ khí hồi nửa mức.
function wildGoblinPhase(s, events) {
  const side = s.current, { w } = s.map;
  for (const g of s.units.filter((u) => isWild(s, u))) {
    if (!s.units.includes(g) || s.winner) continue;
    const engaged = adjacentUnits(s, g.x, g.y).some((a) => a.faction !== g.faction);
    g.morale = Math.min(100, g.morale + (engaged ? CONFIG.moraleRecoverEngaged : CONFIG.moraleRecoverCalm) / 2);
    if (g.status === 'routed' && g.morale > FACTIONS[g.faction].routAt + CONFIG.routRecoverMargin) {
      g.status = 'ok';
      events.push({ type: 'recover', unit: g.id });
    }
    g.moved = false; g.acted = false; g.movedDist = 0;
    const land = wildLand(s, g);
    if (g.status === 'ok') {
      const intruders = s.units.filter((e) => e.faction === side && !e.static && !e.afloat && (land.has(e.y * w + e.x) || dist(e, g) <= 1));
      let best = null;
      if (intruders.length) {
        const reach = reachable(s, g);
        for (const n of reach.tiles.values()) {
          if (!land.has(n.y * w + n.x) && (n.x !== g.x || n.y !== g.y)) continue;
          if (n.prev && pathTo(n).some((p, i) => i > 0 && !land.has(p.y * w + p.x))) continue;   // không ra khỏi rừng nhà
          for (const e of intruders) {
            if (Math.abs(e.x - n.x) + Math.abs(e.y - n.y) !== 1) continue;
            const pv = previewAttack(s, g, e, n.x, n.y, n.cost);
            const sc = pv.dmg * UNIT_VALUE[e.role] - (g.hidden ? 0 : pv.counter) * UNIT_VALUE.goblin * 1.5 - n.cost * 0.01;
            if (pv.dmg >= 1 && (!best || sc > best.sc)) best = { n, e, sc };
          }
        }
      }
      if (best && best.sc > 0) {
        const { n, e } = best;
        if (n.x !== g.x || n.y !== g.y) {
          const ev = moveUnit(s, g, n.x, n.y);
          if (ev) events.push(...ev);
        }
        if (s.units.includes(g) && s.units.includes(e) && dist(g, e) === 1) {
          const surprise = !!g.hidden;
          if (surprise) { g.hidden = false; events.push({ type: 'reveal', unit: g.id, x: g.x, y: g.y, ambush: true, target: e.id }); }
          events.push(...attackUnit(s, g, e, surprise));
        }
      }
    }
    if (!s.units.includes(g) || g.hidden || terrainId(s, g.x, g.y) !== 'forest') continue;
    if (s.units.some((e) => e.faction !== g.faction && !e.static && dist(e, g) <= GOBLIN.hideRadius)) continue;
    g.hidden = true;
    events.push({ type: 'hide', unit: g.id });
  }
}

// ---------- Lượt ----------
export function endTurn(s) {
  const events = [];
  if (s.winner) return events;
  // cuối lượt: toán goblin còn trong rừng, không có quân địch trong tầm thì ẩn lại
  for (const g of s.units) {
    if (g.faction !== s.current || g.role !== 'goblin' || g.hidden) continue;
    if (terrainId(s, g.x, g.y) !== 'forest') continue;
    if (s.units.some((e) => e.faction !== g.faction && !e.static && dist(e, g) <= GOBLIN.hideRadius)) continue;
    g.hidden = true;
    events.push({ type: 'hide', unit: g.id });
  }
  // goblin hoang: đánh quân của phe vừa đi xong đang đứng trong rừng của nó
  wildGoblinPhase(s, events);
  if (s.winner) return events;
  // quân còn đứng trong ô cháy cuối lượt của mình: mất quân
  if (s.fires && s.fires.length) {
    for (const u of alliesOf(s, s.current).filter((q) => fireAt(s, q.x, q.y))) burnUnit(s, u, events);
  }
  if (s.winner) return events;
  const next = foeOf(s, s.current);
  s.current = next;
  if (next === 'human') s.turn++;
  for (const u of s.units) if (u.faction === next) { u.exposed = false; u.spotted = false; }      // đầu lượt: quân phe này hết lộ
  events.push({ type: 'turn', faction: next, turn: s.turn });
  // thời tiết: gió, mây trôi, mưa, đầm lầy tạm thời
  for (const e of stepWeather(s)) events.push(e);
  // lửa rừng: mưa dập, lan theo gió, tàn thành rừng cháy
  const fr = stepFire(s);
  for (const e of fr.events) events.push(e);
  for (const p of fr.ignited) { const v = unitAt(s, p.x, p.y); if (v) burnUnit(s, v, events); }
  if (s.winner) return events;
  // đợt tiếp viện: xuất hiện đầu lượt của phe được tiếp viện, quanh thành nhà
  for (const w of s.mission.waves || []) {
    if (w.done || w.faction !== next || s.turn < w.at) continue;
    w.done = true;
    const made = w.spot ? spawnSquadsAt(s, next, w.n, w.spot) : spawnSquads(s, next, w.n);
    if (made.length) events.push({ type: 'reinforce', faction: next, units: made.map((u) => u.id) });
  }
  raiseGraves(s, next, events);
  const fac = FACTIONS[next];
  const own = s.map.strongholds[next];

  for (const u of alliesOf(s, next)) {
    if (u.static) { u.acted = true; u.moved = true; continue; }
    const t = terrainAt(s, u.x, u.y);
    const onOwnHold = u.x === own.x && u.y === own.y && terrainId(s, u.x, u.y) === 'stronghold';   // nhiệm vụ hộ tống bỏ thành
    let heal = 0;
    if (t.heal) heal = CONFIG.healVillage;
    if (onOwnHold) heal = CONFIG.healStronghold;
    // phá trại: quân đứng sát trại nhà (không ai đứng lên trại được) thì hồi quân như ở thành
    if (s.mission.type === 'destroy') {
      const camp = s.units.find((c) => c.id === s.mission.targets[next]);
      if (camp && dist(camp, u) === 1) heal = Math.max(heal, CONFIG.healStronghold);
    }
    // toán goblin gần đó tiếp thêm quân cho squad Orc (không cộng dồn nhiều toán)
    if (u.role !== 'goblin' && s.units.some((g) => g.faction === next && g.role === 'goblin' && dist(g, u) <= GOBLIN.healRadius)) heal += GOBLIN.heal;
    if (heal && u.strength < CONFIG.maxStrength) {
      const add = Math.min(heal, CONFIG.maxStrength - u.strength);
      u.strength += add;
      events.push({ type: 'heal', unit: u.id, amount: add });
    }
    const engaged = inEnemyZoc(s, next, u.x, u.y);
    u.morale = Math.min(100, u.morale + (engaged ? CONFIG.moraleRecoverEngaged : CONFIG.moraleRecoverCalm));
    if (u.status === 'routed' && u.morale > fac.routAt + CONFIG.routRecoverMargin) {
      u.status = 'ok';
      events.push({ type: 'recover', unit: u.id });
    }
    u.moved = false; u.acted = false; u.movedDist = 0;
    if (u.status === 'routed') u.fort = 0;
  }
  // bỏ chạy: mỗi squad đang bỏ chạy tự chạy theo kế hoạch (về thành / hậu quân / ra khỏi bản đồ)
  for (const u of alliesOf(s, next).filter((x) => x.status === 'routed')) {
    u.moved = true; u.acted = true;
    runFlee(s, u, events);
  }
  // chiếm thành
  const enemyHold = s.map.strongholds[foeOf(s, next)];
  const holder = unitAt(s, enemyHold.x, enemyHold.y);
  if (!canCapture(s, next)) {
    s.capture[next] = 0;
  } else if (holder && holder.faction === next && holder.status === 'ok' && !isAux(holder)) {
    s.capture[next]++;
    events.push({ type: 'capture', faction: next, progress: s.capture[next] });
    if (s.capture[next] >= CONFIG.captureTurns) {
      s.winner = next; s.winReason = 'capture';
    }
  } else {
    s.capture[next] = 0;
  }
  checkVictory(s);
  checkTimeLimit(s);
  updateFog(s);
  return events;
}

// Các ô nằm trong tầm đánh của unit nếu nó đứng ở (x,y)
export function tilesInRange(s, u, x, y) {
  const [mn, mx] = rangeAt(s, u, x, y);
  if (mx <= 1) return [];
  const out = [];
  for (let yy = y - mx; yy <= y + mx; yy++) for (let xx = x - mx; xx <= x + mx; xx++) {
    if (!inBounds(s, xx, yy)) continue;
    const d = Math.abs(xx - x) + Math.abs(yy - y);
    if (d >= mn && d <= mx) out.push({ x: xx, y: yy });
  }
  return out;
}

// Vùng một unit (thường là địch) có thể đánh tới ở lượt của nó: đi tối đa rồi bắn/đánh
export function threatTiles(s, u) {
  const seen = new Map();
  const probe = { ...u, moved: false };
  const reach = reachable(s, probe);
  for (const n of reach.tiles.values()) {
    const [mn, mx] = rangeAt(s, u, n.x, n.y);
    for (let yy = n.y - mx; yy <= n.y + mx; yy++) for (let xx = n.x - mx; xx <= n.x + mx; xx++) {
      if (!inBounds(s, xx, yy)) continue;
      const d = Math.abs(xx - n.x) + Math.abs(yy - n.y);
      if (d >= mn && d <= mx) seen.set(key(xx, yy), { x: xx, y: yy });
    }
  }
  return [...seen.values()];
}
