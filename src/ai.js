// AI hai mức. planNextAction trả về MỘT hành động cho lượt hiện tại (hoặc null khi xong),
// để lớp hiển thị chạy animation giữa các hành động.
//   action = { unit, to:{x,y}, target?:unit, merge?:unit }
import { CONFIG, UNIT_VALUE, FACTIONS, UNDEAD, FIRE } from './config.js';
import { fireAt } from './fire.js';
import { rememberedFoes } from './fog.js';
import {
  key, dist, reachable, targetsFrom, previewAttack, calcDamage, defensePct, statsOf,
  enemiesOf, alliesOf, moveCost, inBounds, DIRS, unitAt, terrainAt,
  canFortify, fortifyBonus, terrainDefense, canCapture, moraleState, terrainId, foeOf,
  graveAt, graveWait, igniteTiles, isWild, isAux, graveInRange,
} from './rules.js';
// hỏa công: lửa coi như gây thêm ~1.5 quân (1 ngay + có thể 1 nữa), tước chỗ thủ rừng; trừ giá trị giữ lại vì phải chờ hồi
const FIRE_AI_DMG = 1.5, FIRE_AI_DENY = 4, FIRE_AI_SAVE = 1.5;

// ----- trường khoảng cách tới mục tiêu (Dijkstra nhiều nguồn) -----
function goalField(s, u, mode = null) {
  const f = u.faction;
  const { w, h } = s.map;
  const field = new Float32Array(w * h).fill(Infinity);
  const open = [];
  const seed = (x, y, c) => { const i = y * w + x; if (c < field[i]) { field[i] = c; open.push({ x, y, c }); } };
  const m = s.mission;
  if (m.type === 'escort') {
    if (u.vip) {
      seed(m.goal.x, m.goal.y, 0);                       // tướng chỉ nhìn về đích
    } else if (f === m.escort) {
      for (const e of foesSeen(s, f)) seed(e.x, e.y, 1);   // hộ tống: vừa dọn đường vừa theo về đích
      seed(m.goal.x, m.goal.y, 3);
    } else {
      for (const e of foesSeen(s, f)) seed(e.x, e.y, e.vip ? 0 : 2);   // săn: nhắm tướng trước
      if (s.fog && !foesSeen(s, f).some((e) => e.vip)) seed(m.goal.x, m.goal.y, 1);   // chưa thấy tướng: chặn đầu ở đích
    }
  } else {
    const seen = foesSeen(s, f);
    const eh = s.map.strongholds[foeOf(s, f)];
    // cố thủ, mình là bên đánh: thành là đích chính, quân địch chỉ là đích phụ (không để bị dụ đi xa)
    const besieger = m.type === 'hold' && m.defender !== f;
    // âm binh giữ mộ: mộ là đích chính (đứng quanh mộ chặn người cầu siêu), quân địch là đích phụ
    const holdGraves = mode === 'graves';
    for (const e of seen) seed(e.x, e.y, (besieger ? HOLD_ENEMY_COST : 0) + (e.ghost ? 1 + e.age : 0) + (holdGraves ? 4 : 0));
    if (holdGraves) for (const g of s.graves || []) seed(g.x, g.y, 0);
    if (besieger) seed(eh.x, eh.y, 0);
    else if (canCapture(s, f)) seed(eh.x, eh.y, 3);
    else if (s.fog && !seen.length) {
      // sương mù, chưa thấy ai: bên giữ thành thì ở nhà chờ, còn lại tiến về phía thành địch mà dò
      const home = m.type === 'hold' && m.defender === f ? s.map.strongholds[f] : eh;
      seed(home.x, home.y, 0);
    }
  }
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

// AI chỉ biết những gì người chơi bên đó thấy: quân địch đang ẩn không có trong tính toán
const seenEnemies = (s, f) => enemiesOf(s, f).filter((e) => !e.hidden && !e.fogged);
// Quân địch AI biết: đang thấy + còn nhớ chỗ thấy lần cuối (bóng ma, ghost: true, age = số lượt từ lúc thấy).
// Dưới sương mù quân khuất đi không có nghĩa là biến mất, người chơi cũng nhớ được như vậy.
const knownEnemies = (s, f) => (s.fog ? seenEnemies(s, f).concat(rememberedFoes(s, f)) : seenEnemies(s, f));
// đối thủ thật để nhắm tới (goblin hoang chỉ là chướng ngại: đánh nó không được gì)
const foesSeen = (s, f) => knownEnemies(s, f).filter((e) => !isWild(s, e));
// bóng ma càng cũ càng kém tin: dùng cho cả mức đe doạ lẫn sức hút khi chọn đường
const ghostTrust = (e) => (e.ghost ? Math.max(0.25, 1 - 0.25 * e.age) : 1);

const valueOf = (u) => UNIT_VALUE[u.role] * (0.3 + 0.7 * (u.strength / CONFIG.maxStrength));

// ước lượng sát thương địch có thể gây cho "ghost" đứng ở (x,y) ở lượt sau
function threatAt(s, u, x, y, ignoreId) {
  const ghost = { ...u, x, y };
  const view = { ...s, units: s.units.map((q) => (q.id === u.id ? ghost : q)) };
  let total = 0;
  for (const e of knownEnemies(s, u.faction)) {
    if (e.id === ignoreId || e.status === 'routed') continue;
    const st = statsOf(e);
    const d = Math.abs(e.x - x) + Math.abs(e.y - y);
    if (d > st.move + st.range[1] + (e.ghost ? Math.min(e.age, 1) : 0)) continue;   // bóng ma: có thể đã nhích lại gần
    total += calcDamage(view, e, ghost, e.x, e.y, 0).dmg * 0.7 * ghostTrust(e);
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

// hệ số tiến của necromancer khi phe âm binh là bên tấn công trong cố thủ (bình thường 0.3: đứng sau)
const NECRO_PUSH = 1.0;
// âm binh (trừ necromancer): xác không biết sợ, xông lên, gần như không ngại phản đòn
const NECRO_GUARD = { huddle: 1.2, cover: 4, calm: 2 };   // calm: dưới mức đe doạ này (quân) thì chưa cần che
const UNDEAD_AI = { adv: 1.7, threat: 0.3, counter: 0.5 };   // trước: 1.3 / 0.6 / 1 (quá hiền)
// ----- Ý chí của necromancer: tư thế của cả đạo âm binh, chọn một lần đầu mỗi lượt -----
// Âm binh không có ý chí riêng, chỉ theo hai ý muốn của necromancer: thắng, hoặc giữ mạng.
//   probe  (thăm dò): sương mù, không biết quân người ở đâu -> một con rẻ nhất đi dò, cả đạo nhích theo thành khối
//   press  (ép): đông hơn rõ -> gom quân ngay ngoài tầm đe doạ, đủ quân trong tầm thì cùng lao vào một lượt (charge)
//   graves (giữ mộ): không còn trội nhưng có mộ đang đếm lùi -> lùi về quanh mộ, chặn quân người cầu siêu, chờ mộ dậy
//   guard  (co cụm): necromancer bị đe doạ, hoặc yếu thế mà hết mộ -> co về che necromancer
// Chống đổi qua đổi lại: tư thế giữ ít nhất minTurns lượt (trừ khi necromancer lâm nguy); ngưỡng vào ép cao hơn ngưỡng giữ ép.
// ĐANG THỬ, MẶC ĐỊNH TẮT: đo bằng `MIND=1 node tools/simulate.mjs ...` (đỡ được necromancer nhưng chưa thắng hơn, xem HANDOFF)
export const AI_FLAGS = { undeadMind: false };
const POSTURE = {
  pressAt: 1.3, pressKeep: 1.1,    // tỉ lệ sức mạnh (âm binh / người) để bắt đầu ép / để tiếp tục ép
  weakAt: 0.85,                    // dưới mức này là yếu thế
  guardDanger: 0.6,                // necromancer lâm nguy tới mức này thì co cụm ngay
  minTurns: 2,
  chargeShare: 0.6,                // ép: chừng này phần quân đã áp sát (tới được tầm đánh lượt sau) thì cùng lao vào
  gatherMax: 2,                    // gom quân tối đa chừng này lượt rồi cũng lao (không để bế tắc)
  unseenValue: 1.6,                // quân người không thấy, không nhớ: ước mỗi squad chừng này giá trị
  entrench: 1.5,                   // mỗi 10% phòng thủ vượt mức gốc (địa hình, trại, đội hình) làm quân đó nặng thêm 15%
};
const MIND = {
  probe: { adv: 0.5, scoutAdv: 2.2, scoutThreat: 0.2 },
  gather: { threat: 1.6, adv: 0.8 },
  charge: { threat: 0.2, adv: 1.9 },
  graves: { adv: 1.0, near: 1.6, deny: 3 },
  guard: { adv: 0.15, ring: 2.5, necroThreat: 2 },
  trade: 0.5,                      // giết quân người (để lại mộ dậy được) đáng thêm chừng này phần giá trị của nó
  wild: 0.3,                       // đánh goblin hoang: chẳng được gì, chỉ đánh khi tiện
};

function powerOf(units) { return units.reduce((a, u) => a + valueOf(u) * ghostTrust(u), 0); }
// quân địch đang thủ chắc (đồi, rừng, trại, đội hình) đáng gờm hơn quân đứng đồng trống: phần phòng thủ vượt mức gốc
function entrenchedPower(s, units) {
  return units.reduce((a, u) => a + valueOf(u) * ghostTrust(u) * (1 + POSTURE.entrench * Math.max(0, defensePct(s, u, u.x, u.y) - statsOf(u).def) / 100), 0);
}

export function undeadMind(s, f) {
  s.aiMind ||= {};
  const old = s.aiMind[f];
  if (old && old.turn === s.turn) return old;
  const mine = alliesOf(s, f).filter((u) => !u.static && u.role !== 'necromancer');
  const necro = alliesOf(s, f).find((u) => u.role === 'necromancer') || null;
  const known = foesSeen(s, f).filter((e) => !e.static);
  const foesAll = enemiesOf(s, f).filter((e) => s.sides.includes(e.faction) && !e.static && !isAux(e));
  // AI biết quân số ban đầu của địch và đếm được số đã chết: phần không thấy, không nhớ thì ước theo trung bình
  const unseen = Math.max(0, foesAll.length - known.length);
  const ratio = powerOf(mine) / Math.max(0.5, entrenchedPower(s, known) + unseen * POSTURE.unseenValue);
  const pending = (s.graves || []).filter((g) => g.faction !== f);
  const danger = necro ? Math.max(0, Math.min(1, (threatAt(s, necro, necro.x, necro.y, null) - NECRO_GUARD.calm) / 4)) : 0;
  const fresh = known.some((e) => !e.ghost || e.age < 1);
  // cố thủ, âm binh là bên đánh: có hạn lượt, không có đường lùi (chỉ co cụm khi necromancer lâm nguy thật)
  const mustAttack = s.mission.type === 'hold' && s.mission.defender !== f;
  const attack = fresh || !s.fog ? 'press' : 'probe';
  const strong = ratio >= POSTURE.pressAt || (old && old.posture === 'press' && ratio >= POSTURE.pressKeep);
  // mạnh thì thắng (đánh tan quân đang doạ necromancer là cách che tốt nhất), yếu thì giữ mạng
  let want;
  if (necro && danger >= 0.95 && !strong) want = 'guard';
  else if (mustAttack) want = attack;
  else if (strong) want = attack;
  else if (ratio < POSTURE.weakAt) want = pending.length ? 'graves' : 'guard';
  else want = pending.length ? 'graves' : necro && danger >= POSTURE.guardDanger ? 'guard' : attack;
  let posture = want, since = s.turn;
  if (old && old.posture !== want) {
    const urgent = want === 'guard' && danger >= 0.95;
    const discovered = old.posture === 'probe' && fresh;              // dò ra rồi thì thôi dò
    if (!urgent && !discovered && s.turn - old.since < POSTURE.minTurns) { posture = old.posture; since = old.since; }
  } else if (old) since = old.since;
  // ép: đủ quân áp sát thì lao vào cùng lượt, chưa đủ thì gom ở ngoài tầm (gom quá gatherMax lượt thì cũng lao)
  let charge = false, gatherSince = null;
  if (posture === 'press') {
    const close = mine.filter((u) => known.some((e) => dist(u, e) <= statsOf(u).move + statsOf(u).range[1] + 1)).length;
    gatherSince = old && old.posture === 'press' && old.gatherSince != null ? old.gatherSince : s.turn;
    charge = !known.length || close >= Math.max(1, Math.ceil(mine.length * POSTURE.chargeShare)) || s.turn - gatherSince >= POSTURE.gatherMax
      || (old && old.charge && old.posture === 'press');
    if (charge) gatherSince = null;
  }
  // con đi dò: rẻ nhất và nhanh nhất, giữ nguyên tới khi chết
  let scout = null;
  if (posture === 'probe') {
    scout = old && old.scout && mine.some((u) => u.id === old.scout) ? old.scout
      : mine.slice().sort((a, b) => valueOf(a) - valueOf(b) || statsOf(b).move - statsOf(a).move || a.id - b.id)[0]?.id ?? null;
  }
  const m = { turn: s.turn, posture, since, ratio, charge, gatherSince, scout, danger };
  s.aiMind[f] = m;
  return m;
}

// cố thủ: bên đánh coi quân địch xa hơn thực tế chừng này (ô) khi chọn đường, để bám thành
const HOLD_ENEMY_COST = 3;

const W = {
  tactical: { dmg: 1.0, kill: 0.9, counter: 1.0, threat: 0.45, terrain: 0.8, advance: 0.7, form: 0.2, capture: 8, guard: 0.6, rangedKeep: 0.5 },
  // chỉ để đo (tools/simulate.mjs): lối "rùa" của người chơi thật: thủ chắc quanh thành, chờ địch dồn lên rồi bắn
  turtle: { dmg: 1.0, kill: 0.9, counter: 1.0, threat: 0.45, terrain: 1.2, advance: 0.7, form: 0.4, capture: 8, guard: 1.2, rangedKeep: 0.5 },
  easy: { dmg: 1.0, kill: 0.0, counter: 0.0, threat: 0.0, terrain: 0.0, advance: 0.6, form: 0.0, capture: 3, guard: 0.0, rangedKeep: 0 },
};

function scoreOption(s, u, node, target, w, field, ownHold, enemyHold, danger, ctx) {
  let score = 0;
  const x = node.x, y = node.y;
  let killed = false;
  // đứng lại trong ô đang cháy: mất quân cuối lượt, ở lại thì mất tiếp
  if (s.fires && s.fires.length && fireAt(s, x, y)) score -= (FIRE.damage / CONFIG.maxStrength) * UNIT_VALUE[u.role] * 10 * 2 + 1;
  // sĩ khí đổi hành vi của AI: hăng hái thì xông lên, dao động thì dè chừng (người chơi chỉ bị đổi chỉ số)
  const ms = moraleState(u);
  let advMul = ms === 'eager' ? 1.1 : ms === 'wavering' ? 0.8 : 1;
  let thrMul = ms === 'eager' ? 0.9 : ms === 'wavering' ? 1.2 : 1;
  // âm binh: xác không biết sợ, cứ lao lên; necromancer thì đứng sau, giữ mạng là trên hết
  const commander = u.vip || u.role === 'necromancer';
  if (u.faction === 'undead' && !commander) { advMul = UNDEAD_AI.adv; thrMul = UNDEAD_AI.threat; }
  // necromancer thường đứng sau; khi phe mình phải tấn công có hạn lượt (cố thủ, mình là bên đánh) thì tiến theo quân
  if (u.role === 'necromancer') { advMul = ctx.necroPush ? NECRO_PUSH : 0.3; }
  // ý chí necromancer (tư thế của cả đạo) đè lên tính hung hãn mặc định của âm binh
  const mind = u.faction === 'undead' && w.threat ? ctx.mind : null;
  let gather = false;
  if (mind && !commander) {
    if (mind.posture === 'probe') {
      if (u.id === mind.scout) { advMul = MIND.probe.scoutAdv; thrMul = MIND.probe.scoutThreat; } else { advMul = MIND.probe.adv; thrMul = 1; }
    } else if (mind.posture === 'press') {
      if (mind.charge) { advMul = MIND.charge.adv; thrMul = MIND.charge.threat; } else { advMul = MIND.gather.adv; thrMul = MIND.gather.threat; gather = true; }
    } else if (mind.posture === 'graves') { advMul = MIND.graves.adv; thrMul = 0.8; }
    else if (mind.posture === 'guard') { advMul = MIND.guard.adv; thrMul = 0.6; }
  } else if (mind && u.role === 'necromancer' && mind.posture === 'guard') { advMul = 0; thrMul = MIND.guard.necroThreat; }
  if (target) {
    const pv = previewAttack(s, u, target, x, y, node.cost);
    const wild = isWild(s, target) ? MIND.wild : 1;          // goblin hoang: đánh chẳng được gì
    score += (pv.dmg / CONFIG.maxStrength) * UNIT_VALUE[target.role] * 10 * w.dmg * wild;
    const prize = target.vip || target.role === 'necromancer';      // hạ được là thắng (hoặc gần như thắng)
    if (pv.kills) { score += valueOf(target) * 10 * w.kill * (prize ? 2 : 1) * wild; killed = true; }
    // âm binh: giết quân sống là có thêm lính (mộ), nên đổi quân ngang ngửa vẫn lời
    if (mind && pv.kills && wild === 1 && !target.static && target.faction !== 'undead' && terrainId(s, target.x, target.y) !== 'river') {
      score += valueOf(target) * 10 * MIND.trade * (graveInRange(s, target) ? 1 : 0.6);
    }
    // chặn cầu siêu: quân người đang đứng trên / cạnh mộ là mục tiêu ưu tiên (đánh cho tan hoặc bỏ chạy thì không chôn được)
    if (mind && mind.posture !== 'guard' && s.graves && s.graves.length) {
      const g = s.graves.find((q) => q.faction !== 'undead' && Math.abs(q.x - target.x) + Math.abs(q.y - target.y) <= 1);
      if (g) score += MIND.graves.deny * UNIT_VALUE[g.role] * (mind.posture === 'graves' ? 1 : 0.5);
    }
    if (prize) score += pv.dmg * 1.5;
    if (pv.kills && target.role === 'necromancer') score += 40;
    if (target.static) score += pv.dmg * 3;               // thành mục tiêu: đánh vào là đang thắng
    score -= (pv.counter / CONFIG.maxStrength) * UNIT_VALUE[u.role] * 10 * w.counter * (u.faction === 'undead' && !commander ? UNDEAD_AI.counter : 1);
  }
  if (w.terrain) score += (defensePct(s, u, x, y) / 100) * 10 * w.terrain * (target ? 0.6 : 1);
  if (w.threat) {
    const th = threatAt(s, u, x, y, killed ? target.id : null);
    score -= (th / CONFIG.maxStrength) * UNIT_VALUE[u.role] * 10 * w.threat * (commander ? 2.2 : 1) * thrMul;
    // gom quân: không bước một mình vào tầm đe doạ (chờ cả đạo cùng vào một lượt)
    if (gather && !target && th >= 1 && field[y * s.map.w + x] < field[u.y * s.map.w + u.x]) score -= 3;
  }
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
  score += adv * w.advance * pressure * (ctx.defensive && !target ? 0.3 : 1) * advMul * (u.role === 'goblin' && !target ? 0.4 : 1);
  // chiếm thành địch
  // goblin: bám rừng, giữ thế ẩn, đứng gần squad Orc bị thương để tiếp quân
  if (u.role === 'goblin') {
    const forest = terrainId(s, x, y) === 'forest';
    if (forest) score += 1.5;
    if (u.hidden && !forest) score -= target ? 7 : 4;         // đang ẩn: không ra đồng trống, kể cả để đánh
    if (!u.hidden && !forest && target) score -= 3;           // đã lộ: vẫn ưu tiên đánh từ trong rừng
    let wounded = 0;
    for (const a of s.units) if (a.faction === u.faction && a.role !== 'goblin' && !a.static && a.strength < CONFIG.maxStrength && Math.abs(a.x - x) + Math.abs(a.y - y) <= 2) wounded++;
    score += Math.min(wounded, 3) * 0.6;
  }
  // mộ tử sĩ: necromancer đứng sao cho nhiều mộ nằm trong tầm triệu hồi; âm binh khác không đứng chặn lên mộ
  if (w.threat && s.graves && s.graves.length && u.faction === 'undead') {
    if (u.role === 'necromancer') {
      for (const g of s.graves) if (Math.abs(g.x - x) + Math.abs(g.y - y) <= UNDEAD.raiseRadius) score += UNIT_VALUE[g.role] * (graveWait(s, g) <= 1 ? 0.9 : 0.5);
    } else if (graveAt(s, x, y)) score -= 1.5;
  }
  // giữ mộ: đứng kề mộ (không đứng lên mộ: mộ cần ô trống mới dậy được), chắn đường quân người tới cầu siêu
  if (mind && !commander && mind.posture === 'graves' && s.graves && s.graves.length) {
    let near = 0;
    for (const g of s.graves) if (g.faction !== 'undead' && Math.abs(g.x - x) + Math.abs(g.y - y) === 1) near = Math.max(near, UNIT_VALUE[g.role]);
    score += near * MIND.graves.near;
  }
  // co cụm: vòng quanh necromancer
  if (mind && !commander && mind.posture === 'guard' && ctx.necro) {
    const d = Math.abs(x - ctx.necro.x) + Math.abs(y - ctx.necro.y);
    score += Math.max(0, 3 - d) * MIND.guard.ring;
  }
  // hộ vệ necromancer: nó đứng giữa quân mình; bị đe doạ thì quân âm binh quanh đó quay về che (chặn đường, vùng khống chế)
  if (w.threat && u.faction === 'undead' && ctx.necro) {
    if (u.role === 'necromancer') score += adjacentAllies(s, u, x, y) * NECRO_GUARD.huddle;
    else if (ctx.necroDanger > 0) {
      const d = Math.abs(x - ctx.necro.x) + Math.abs(y - ctx.necro.y);
      if (d <= 1) score += NECRO_GUARD.cover * ctx.necroDanger; else if (d === 2) score += NECRO_GUARD.cover * 0.4 * ctx.necroDanger;
    }
  }
  if (canCapture(s, u.faction) && x === enemyHold.x && y === enemyHold.y && u.status === 'ok') score += w.capture * 3;
  // phòng thủ thành nhà khi bị đe doạ (âm binh đang thủ / giữ mộ thì càng phải giữ thành: mất thành là thua)
  if (w.guard && danger) {
    const d = Math.abs(x - ownHold.x) + Math.abs(y - ownHold.y);
    if (d <= 3) score += w.guard * 4 * (mind && mind.posture !== 'press' && mind.posture !== 'probe' ? 3 : 1);
  }
  // co cụm: necromancer lui về thành nhà (cả đạo co về theo nó)
  if (mind && u.role === 'necromancer' && mind.posture === 'guard' && ownHold) {
    const d = Math.abs(x - ownHold.x) + Math.abs(y - ownHold.y);
    score += Math.max(0, 6 - d) * 0.8;
  }
  // bên giữ: bám quanh điểm cần giữ (thành nhà, hoặc công trình mục tiêu)
  if (ctx.defensive && w.guard) {
    const d = Math.abs(x - ctx.guardPos.x) + Math.abs(y - ctx.guardPos.y);
    score += Math.max(0, 6 - d) * 0.6;
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
  if (level !== 'easy' && u.fort === 2) {
    const th = threatAt(s, u, u.x, u.y, null);
    leavePenalty = (fortifyBonus(s, u) / 100) * th * UNIT_VALUE[u.role] * 2 + 1;
  }
  for (const node of reach.tiles.values()) {
    const tgts = targetsFrom(s, u, node.x, node.y);
    const base = scoreOption(s, u, node, null, w, field, ctx.ownHold, ctx.enemyHold, ctx.danger, ctx);
    const away = node.x !== u.x || node.y !== u.y;
    out.push({ unit: u, to: { x: node.x, y: node.y }, score: base - 0.01 * node.cost - (away ? leavePenalty : 0) });
    for (const t of tgts) {
      out.push({
        unit: u, to: { x: node.x, y: node.y }, target: t,
        score: scoreOption(s, u, node, t, w, field, ctx.ownHold, ctx.enemyHold, ctx.danger, ctx) + 2 - (away ? leavePenalty : 0),
      });
    }
  }
  if (level !== 'easy' && canFortify(s, u)) {
    // hạ trại khi địch có thể đánh tới mình và đứng chỗ đáng giữ
    const th = threatAt(s, u, u.x, u.y, null);
    if (th >= 0.5) {
      const here = { x: u.x, y: u.y, cost: 0 };
      const base = scoreOption(s, u, here, null, w, field, ctx.ownHold, ctx.enemyHold, ctx.danger, ctx);
      let gain = (fortifyBonus(s, u) / 100) * th * UNIT_VALUE[u.role] * 2;
      if (terrainDefense(s, u.faction, u.x, u.y) >= 10) gain += 0.8;
      if (ctx.danger && Math.abs(u.x - ctx.ownHold.x) + Math.abs(u.y - ctx.ownHold.y) <= 3) gain += 1.2;
      out.push({ unit: u, to: { x: u.x, y: u.y }, fortify: true, score: base + gain - 0.4 });
    }
  }
  if (level !== 'easy' && s.graves && s.graves.length && u.faction !== 'undead' && !u.static && u.role !== 'goblin' && !u.afloat) {
    // cầu siêu tử sĩ: chặn xác đồng đội trỗi dậy thành âm binh (necromancer còn sống thì cả bản đồ bị ếm).
    const necros = s.units.filter((n) => n.role === 'necromancer');
    // cả bản đồ bị ếm: mộ nào cũng sẽ dậy, mộ sắp dậy đáng chôn trước
    const live = necros.length ? s.graves : [];
    if (live.length) {
      for (const node of reach.tiles.values()) {
        let best = 0;
        for (const g of live) {
          if (Math.abs(g.x - node.x) + Math.abs(g.y - node.y) > 1) continue;
          best = Math.max(best, UNIT_VALUE[g.role] * 5 * (graveWait(s, g) <= 1 ? 1 : 0.6));
        }
        if (!best) continue;
        const base = scoreOption(s, u, node, null, w, field, ctx.ownHold, ctx.enemyHold, ctx.danger, ctx);
        out.push({ unit: u, to: { x: node.x, y: node.y }, bury: true, score: base + best });
      }
    }
  }
  if (level !== 'easy' && u.faction === 'human' && u.role === 'archer' && u.status === 'ok' && !u.acted) {
    // hỏa công: tên lửa vào ô rừng có địch = một phát bắn thường + lửa táp (mất thêm nếu đứng lại) + tước chỗ thủ rừng.
    // Hồi FIRE.cooldown lượt, nên trừ một khoản "giữ lại dùng sau" để không đốt khi lợi ít. Không đốt ô có quân mình.
    for (const node of reach.tiles.values()) {
      let best = -Infinity, tile = null;
      for (const p of igniteTiles(s, u, node.x, node.y)) {
        const v = unitAt(s, p.x, p.y);
        if (!v || v.faction === u.faction || v.static || v.hidden || v.fogged) continue;
        const val = scoreOption(s, u, node, v, w, field, ctx.ownHold, ctx.enemyHold, ctx.danger, ctx) + 2
          + (FIRE_AI_DMG / CONFIG.maxStrength) * UNIT_VALUE[v.role] * 10 * w.dmg + (terrainDefense(s, v.faction, p.x, p.y) / 100) * FIRE_AI_DENY - FIRE_AI_SAVE;
        if (val > best) { best = val; tile = p; }
      }
      if (!tile) continue;
      out.push({ unit: u, to: { x: node.x, y: node.y }, ignite: tile, score: best });
    }
  }
  if (level !== 'easy') {
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
  const enemyHold = s.map.strongholds[foeOf(s, f)];
  const danger = s.mission.type !== 'escort' && seenEnemies(s, f).some((e) => Math.abs(e.x - ownHold.x) + Math.abs(e.y - ownHold.y) <= 7);
  const fields = {};
  const m = s.mission;
  const defensive = (m.type === 'hold' && m.defender === f) || level === 'turtle';
  const guardPos = ownHold;
  const ctx = {
    ownHold, enemyHold, danger, defensive, guardPos,
    necroPush: m.type === 'hold' && m.defender !== f,
    necro: null, necroDanger: 0,
    fieldFor: (u) => {
      const k = u.vip ? 'v' : u.role === 'cavalry' ? 'c' : 'f';   // (necromancer đi bộ, dùng chung trường 'f')
      const mode = ctx.mind && ctx.mind.posture === 'graves' && u.role !== 'necromancer' ? 'graves' : null;
      return (fields[k + (mode || '')] ||= goalField(s, u, mode));
    },
    mind: null,
  };
  const ready = alliesOf(s, f).filter((u) => !u.acted && u.status === 'ok');
  if (!ready.length) return null;
  // necromancer đang bị đe doạ tới đâu (0..1): quân địch thấy được có thể đánh tới nó ở lượt sau
  ctx.necro = alliesOf(s, f).find((u) => u.role === 'necromancer') || null;
  if (f === 'undead' && level === 'tactical' && AI_FLAGS.undeadMind) ctx.mind = undeadMind(s, f);
  if (ctx.necro) ctx.necroDanger = Math.max(0, Math.min(1, (threatAt(s, ctx.necro, ctx.necro.x, ctx.necro.y, null) - NECRO_GUARD.calm) / 4));

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
      for (const o of unitOptions(s, u, level === 'turtle' ? 'turtle' : 'tactical', ctx)) {
        if (!best || o.score > best.score) best = o;
      }
    }
  }
  return best;
}
