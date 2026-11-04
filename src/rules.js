// Luật chơi thuần logic (không đụng DOM/Pixi). Mọi hàm đổi state đều trả về mảng sự kiện
// để lớp hiển thị diễn lại bằng animation.
import {
  CONFIG, TERRAIN, FACTIONS, FORMATION_MAX, STATS, MATCHUP, ROSTER, FORTIFY, LEVEL,
} from './config.js';

export const key = (x, y) => x + ',' + y;
export const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const other = (f) => (f === 'human' ? 'orc' : 'human');

// ---------- Khởi tạo ----------
export function createState(map) {
  const state = {
    map, units: [], current: 'human', turn: 1, nextId: 1,
    capture: { human: 0, orc: 0 }, winner: null, winReason: null,
  };
  for (const f of ['human', 'orc']) {
    map.spawns[f].forEach((p, i) => addUnit(state, f, ROSTER[i], p.x, p.y));
  }
  for (const u of state.units) { u.moved = false; u.acted = false; }
  return state;
}

export function addUnit(state, faction, role, x, y, strength = CONFIG.maxStrength) {
  const u = {
    id: state.nextId++, faction, role, x, y, strength,
    morale: CONFIG.startMorale, status: 'ok',
    moved: false, acted: false, movedDist: 0,
    xp: 0, fort: 0,          // fort: 0 không, 1 đang chuẩn bị, 2 đã dựng trại (có hiệu lực)
  };
  state.units.push(u);
  return u;
}

export function cloneState(s) {
  return {
    ...s,
    units: s.units.map((u) => ({ ...u })),
    capture: { ...s.capture },
  };
}

// ---------- Truy vấn ----------
export const terrainId = (s, x, y) => s.map.tiles[y * s.map.w + x];
export const terrainAt = (s, x, y) => TERRAIN[terrainId(s, x, y)];
export const inBounds = (s, x, y) => x >= 0 && y >= 0 && x < s.map.w && y < s.map.h;
export const unitAt = (s, x, y) => s.units.find((u) => u.x === x && u.y === y) || null;
export const statsOf = (u) => STATS[u.faction][u.role];
export const isRegular = (u) => u.role !== 'militia';

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
  return adjacentUnits(s, x, y).some((u) => u.faction !== f);
}

// Chi phí vào một loại địa hình theo phe + vai trò (không cần state)
export function moveCostFor(tid, faction, role) {
  const t = TERRAIN[tid];
  if (!isFinite(t.cost)) return Infinity;
  if (role === 'cavalry' && t.noCavalry) return Infinity;
  let c = t.cost;
  if (t.nat > 0) c = Math.max(1, c - FACTIONS[faction].natMoveDiscount);
  if (role === 'cavalry' && tid === 'forest') c += 1;
  return c;
}

// Chi phí vào một ô cho một unit
export function moveCost(s, u, x, y) {
  return moveCostFor(terrainId(s, x, y), u.faction, u.role);
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
  let pct = st.def + levelOf(u.xp || 0) * LEVEL.defPerLevel + terrainDefense(s, u.faction, x, y);
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
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(s, nx, ny)) continue;
      const occ = unitAt(s, nx, ny);
      if (occ && occ.faction !== f) continue;
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
    if (occ && occ.id !== u.id) continue;
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
    if (e.faction === u.faction) continue;
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
  const match = MATCHUP[atk.role][def.role];
  const melee = st.range[1] === 1;
  const flank = melee ? flankCount(s, atk, def, fx, fy) : 0;
  const charge = atk.role === 'cavalry' && movedDist >= CONFIG.chargeDist ? 1 + CONFIG.chargeBonus : 1;
  const defPct = defensePct(s, def, def.x, def.y);
  const lvl = 1 + levelOf(atk.xp || 0) * LEVEL.atkPerLevel;
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
  for (const a of adjacentUnits(s, u.x, u.y)) {
    if (a.faction === u.faction) {
      a.morale = Math.max(0, a.morale - CONFIG.moraleAllyDeath);
      checkRout(a, events);
    }
  }
  return true;
}

function gainXp(u, amount, events) {
  if (amount <= 0 || u.strength <= 0) return;
  const before = levelOf(u.xp);
  u.xp += amount;
  const after = levelOf(u.xp);
  if (after > before) events.push({ type: 'levelup', unit: u.id, level: after });
}

function checkElimination(s) {
  for (const f of ['human', 'orc']) {
    if (!s.units.some((u) => u.faction === f)) {
      s.winner = other(f);
      s.winReason = 'elimination';
    }
  }
}

// Atk phải đứng đúng vị trí tấn công. Trả về events.
export function attackUnit(s, atk, def) {
  const events = [];
  const pv = previewAttack(s, atk, def);
  events.push({ type: 'attack', attacker: atk.id, defender: def.id, attackerRole: atk.role, preview: pv });
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
    // bị tan vỡ trong lúc ra đòn: hết lượt
  }
  checkElimination(s);
  return events;
}

// ---------- Hành động ----------
export function waitUnit(s, u) { u.acted = true; u.moved = true; return [{ type: 'wait', unit: u.id }]; }

export function moveUnit(s, u, x, y) {
  const reach = reachable(s, u);
  const node = reach.tiles.get(key(x, y));
  if (!node || u.moved) return null;
  const path = pathTo(node);
  const events = [{ type: 'move', unit: u.id, path }];
  u.x = x; u.y = y; u.moved = true; u.movedDist = node.cost; u.fort = 0;
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
    events.push({ type: 'move', unit: u.id, path: pathTo(via) });
    u.x = via.x; u.y = via.y;
  }
  const room = CONFIG.maxStrength - tgt.strength;
  const move = Math.min(room, u.strength);
  // morale trung bình có trọng số
  tgt.morale = Math.round((tgt.morale * tgt.strength + u.morale * move) / (tgt.strength + move));
  tgt.xp = Math.round((tgt.xp * tgt.strength + u.xp * move) / (tgt.strength + move));
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
  return events;
}

// Hạ trại: thay cho cả lượt hành động (không di chuyển, không tấn công). Có hiệu lực từ đầu lượt sau của phe này.
export function canFortify(s, u) {
  return !u.moved && !u.acted && u.status === 'ok' && u.fort === 0;
}

export function fortifyUnit(s, u) {
  if (!canFortify(s, u)) return null;
  u.fort = 1; u.moved = true; u.acted = true;
  return [{ type: 'fortify', unit: u.id }];
}

export function canSplit(s, u) {
  return !u.moved && !u.acted && u.strength >= 2 && u.status === 'ok';
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
  n.morale = u.morale; n.xp = u.xp; n.moved = true; n.acted = true;
  u.moved = true; u.acted = true; u.fort = 0;
  return [{ type: 'split', unit: u.id, newUnit: n.id, x, y }];
}

// ---------- Lượt ----------
function retreatTile(s, u) {
  const reach = reachable(s, u);
  const own = s.map.strongholds[u.faction];
  const foes = enemiesOf(s, u.faction);
  let best = null, bestScore = -Infinity;
  for (const n of reach.tiles.values()) {
    const md = foes.length ? Math.min(...foes.map((e) => Math.abs(e.x - n.x) + Math.abs(e.y - n.y))) : 0;
    const score = md * 2 - (Math.abs(own.x - n.x) + Math.abs(own.y - n.y)) * 0.5;
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best;
}

export function endTurn(s) {
  const events = [];
  if (s.winner) return events;
  const next = other(s.current);
  s.current = next;
  if (next === 'human') s.turn++;
  events.push({ type: 'turn', faction: next, turn: s.turn });
  const fac = FACTIONS[next];
  const own = s.map.strongholds[next];

  for (const u of alliesOf(s, next)) {
    const t = terrainAt(s, u.x, u.y);
    const onOwnHold = u.x === own.x && u.y === own.y;
    let heal = 0;
    if (t.heal) heal = CONFIG.healVillage;
    if (onOwnHold) heal = CONFIG.healStronghold;
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
    else if (u.fort === 1) { u.fort = 2; events.push({ type: 'entrench', unit: u.id }); }
  }
  // tan vỡ: tự rút lui
  for (const u of alliesOf(s, next)) {
    if (u.status !== 'routed') continue;
    u.moved = true; u.acted = true;
    const n = retreatTile(s, u);
    if (n && (n.x !== u.x || n.y !== u.y)) {
      events.push({ type: 'move', unit: u.id, path: pathTo(n), routed: true });
      u.x = n.x; u.y = n.y;
    }
  }
  // chiếm thành
  const enemyHold = s.map.strongholds[other(next)];
  const holder = unitAt(s, enemyHold.x, enemyHold.y);
  if (holder && holder.faction === next && holder.status === 'ok') {
    s.capture[next]++;
    events.push({ type: 'capture', faction: next, progress: s.capture[next] });
    if (s.capture[next] >= CONFIG.captureTurns) {
      s.winner = next; s.winReason = 'capture';
    }
  } else {
    s.capture[next] = 0;
  }
  checkElimination(s);
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
