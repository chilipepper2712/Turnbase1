// AI hai mức. planNextAction trả về MỘT hành động cho lượt hiện tại (hoặc null khi xong),
// để lớp hiển thị chạy animation giữa các hành động.
//   action = { unit, to:{x,y}, target?:unit, merge?:unit }
import { CONFIG, UNIT_VALUE, FACTIONS } from './config.js';
import {
  key, dist, reachable, targetsFrom, previewAttack, calcDamage, defensePct, statsOf,
  enemiesOf, alliesOf, moveCost, inBounds, DIRS, unitAt, other, terrainAt,
  canFortify, fortifyBonus, terrainDefense,
} from './rules.js';

// ----- trường khoảng cách tới mục tiêu (Dijkstra nhiều nguồn) -----
function goalField(s, u) {
  const f = u.faction;
  const { w, h } = s.map;
  const field = new Float32Array(w * h).fill(Infinity);
  const open = [];
  const seed = (x, y, c) => { const i = y * w + x; if (c < field[i]) { field[i] = c; open.push({ x, y, c }); } };
  for (const e of enemiesOf(s, f)) seed(e.x, e.y, 0);
  const eh = s.map.strongholds[other(f)];
  seed(eh.x, eh.y, 3);
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const cur = open.shift();
    if (cur.c > field[cur.y * w + cur.x]) continue;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(s, nx, ny)) continue;
      const c = moveCost(s, u, nx, ny);
      if (!isFinite(c)) continue;
      const t = cur.c + c;
      const i = ny * w + nx;
      if (t < field[i]) { field[i] = t; open.push({ x: nx, y: ny, c: t }); }
    }
  }
  return field;
}

const valueOf = (u) => UNIT_VALUE[u.role] * (0.3 + 0.7 * (u.strength / CONFIG.maxStrength));

// ước lượng sát thương địch có thể gây cho "ghost" đứng ở (x,y) ở lượt sau
function threatAt(s, u, x, y, ignoreId) {
  const ghost = { ...u, x, y };
  const view = { ...s, units: s.units.map((q) => (q.id === u.id ? ghost : q)) };
  let total = 0;
  for (const e of enemiesOf(s, u.faction)) {
    if (e.id === ignoreId || e.status === 'routed') continue;
    const st = statsOf(e);
    const d = Math.abs(e.x - x) + Math.abs(e.y - y);
    if (d > st.move + st.range[1]) continue;
    total += calcDamage(view, e, ghost, e.x, e.y, 0).dmg * 0.7;
  }
  return Math.min(total, u.strength);
}

function adjacentAllies(s, u, x, y) {
  let n = 0;
  for (const [dx, dy] of DIRS) {
    const a = unitAt(s, x + dx, y + dy);
    if (a && a.faction === u.faction && a.id !== u.id) n++;
  }
  return n;
}

const W = {
  tactical: { dmg: 1.0, kill: 0.9, counter: 1.0, threat: 0.45, terrain: 0.8, advance: 0.7, form: 0.2, capture: 8, guard: 0.6, rangedKeep: 0.5 },
  easy: { dmg: 1.0, kill: 0.0, counter: 0.0, threat: 0.0, terrain: 0.0, advance: 0.6, form: 0.0, capture: 3, guard: 0.0, rangedKeep: 0 },
};

function scoreOption(s, u, node, target, w, field, ownHold, enemyHold, danger) {
  let score = 0;
  const x = node.x, y = node.y;
  let killed = false;
  if (target) {
    const pv = previewAttack(s, u, target, x, y, node.cost);
    score += (pv.dmg / CONFIG.maxStrength) * UNIT_VALUE[target.role] * 10 * w.dmg;
    if (pv.kills) { score += valueOf(target) * 10 * w.kill; killed = true; }
    score -= (pv.counter / CONFIG.maxStrength) * UNIT_VALUE[u.role] * 10 * w.counter;
  }
  if (w.terrain) score += (defensePct(s, u, x, y) / 100) * 10 * w.terrain * (target ? 0.6 : 1);
  if (w.threat) score -= (threatAt(s, u, x, y, killed ? target.id : null) / CONFIG.maxStrength) * UNIT_VALUE[u.role] * 10 * w.threat;
  if (w.form && FACTIONS[u.faction].formation) score += adjacentAllies(s, u, x, y) * w.form * 3;
  // tiến về phía mục tiêu
  const here = field[u.y * s.map.w + u.x], there = field[y * s.map.w + x];
  let adv = here - there;
  if (statsOf(u).range[1] > 1 && w.rangedKeep) {
    // cung thủ không lao vào cận chiến khi chưa bắn được
    adv *= target ? 1 : 0.5;
  }
  // càng về sau càng phải tiến (chống bế tắc)
  const pressure = 1 + Math.max(0, s.turn - 4) * 0.12;
  score += adv * w.advance * pressure;
  // chiếm thành địch
  if (x === enemyHold.x && y === enemyHold.y && u.status === 'ok') score += w.capture * 3;
  // phòng thủ thành nhà khi bị đe doạ
  if (w.guard && danger) {
    const d = Math.abs(x - ownHold.x) + Math.abs(y - ownHold.y);
    if (d <= 3) score += w.guard * 4;
  }
  return score;
}

function unitOptions(s, u, level, ctx) {
  const w = W[level];
  const out = [];
  const reach = reachable(s, u);
  const field = ctx.fieldFor(u);
  // quân đã dựng trại thì rời chỗ là mất lợi thế: trừ điểm các lựa chọn đi nơi khác
  let leavePenalty = 0;
  if (level === 'tactical' && u.fort === 2) {
    const th = threatAt(s, u, u.x, u.y, null);
    leavePenalty = (fortifyBonus(s, u) / 100) * th * UNIT_VALUE[u.role] * 2 + 1;
  }
  for (const node of reach.tiles.values()) {
    const tgts = targetsFrom(s, u, node.x, node.y);
    const base = scoreOption(s, u, node, null, w, field, ctx.ownHold, ctx.enemyHold, ctx.danger);
    const away = node.x !== u.x || node.y !== u.y;
    out.push({ unit: u, to: { x: node.x, y: node.y }, score: base - 0.01 * node.cost - (away ? leavePenalty : 0) });
    for (const t of tgts) {
      out.push({
        unit: u, to: { x: node.x, y: node.y }, target: t,
        score: scoreOption(s, u, node, t, w, field, ctx.ownHold, ctx.enemyHold, ctx.danger) + 2 - (away ? leavePenalty : 0),
      });
    }
  }
  if (level === 'tactical' && canFortify(s, u)) {
    // hạ trại khi địch có thể đánh tới mình và đứng chỗ đáng giữ
    const th = threatAt(s, u, u.x, u.y, null);
    if (th >= 0.5) {
      const here = { x: u.x, y: u.y, cost: 0 };
      const base = scoreOption(s, u, here, null, w, field, ctx.ownHold, ctx.enemyHold, ctx.danger);
      let gain = (fortifyBonus(s, u) / 100) * th * UNIT_VALUE[u.role] * 2;
      if (terrainDefense(s, u.faction, u.x, u.y) >= 10) gain += 0.8;
      if (ctx.danger && Math.abs(u.x - ctx.ownHold.x) + Math.abs(u.y - ctx.ownHold.y) <= 3) gain += 1.2;
      out.push({ unit: u, to: { x: u.x, y: u.y }, fortify: true, score: base + gain - 0.4 });
    }
  }
  if (level === 'tactical') {
    // dân quân bổ sung cho squad chính quy bị thương
    for (const [id, m] of reach.merges) {
      const tgt = s.units.find((q) => q.id === id);
      const gain = Math.min(CONFIG.maxStrength - tgt.strength, u.strength);
      if (gain < 2) continue;
      const calm = !tgt.status || tgt.status === 'ok';
      out.push({
        unit: u, to: { x: m.via.x, y: m.via.y }, merge: tgt,
        score: gain * UNIT_VALUE[tgt.role] * 1.2 + (calm ? 1 : 0),
      });
    }
  }
  return out;
}

export function planNextAction(s, level = 'tactical') {
  const f = s.current;
  const ownHold = s.map.strongholds[f];
  const enemyHold = s.map.strongholds[other(f)];
  const danger = enemiesOf(s, f).some((e) => Math.abs(e.x - ownHold.x) + Math.abs(e.y - ownHold.y) <= 7);
  const fields = {};
  const ctx = {
    ownHold, enemyHold, danger,
    fieldFor: (u) => {
      const k = u.role === 'cavalry' ? 'c' : 'f';
      return (fields[k] ||= goalField(s, u));
    },
  };
  const ready = alliesOf(s, f).filter((u) => !u.acted && u.status === 'ok');
  if (!ready.length) return null;

  let best = null;
  if (level === 'easy') {
    // đơn giản: unit gần địch nhất hành động trước; ưu tiên đòn đánh gây nhiều sát thương nhất
    const field = (u) => ctx.fieldFor(u)[u.y * s.map.w + u.x];
    ready.sort((a, b) => field(a) - field(b));
    const u = ready[0];
    const opts = unitOptions(s, u, 'easy', ctx);
    opts.sort((a, b) => b.score - a.score);
    best = opts[0];
  } else {
    for (const u of ready) {
      for (const o of unitOptions(s, u, 'tactical', ctx)) {
        if (!best || o.score > best.score) best = o;
      }
    }
  }
  return best;
}
