// Dựng ván theo loại nhiệm vụ. Logic thắng/thua nằm ở rules.js (checkVictory, checkTimeLimit);
// file này chỉ đặt công trình mục tiêu / tướng hộ tống / ô đích lên bản đồ.
//   actor = phe người chơi giữ vai chính của nhiệm vụ:
//     hold    -> actor là bên phòng thủ
//     destroy -> actor là bên tấn công (phải phá công trình của phe kia)
//     escort  -> actor là bên hộ tống tướng
import { MISSIONS, LEVEL } from './config.js';
import { createState, addUnit, unitAt, spawnSquads, foeOf } from './rules.js';
import { costField } from './mapgen.js';
import { initWeather } from './weather.js';
import { updateFog } from './fog.js';

export const MISSION_TYPES = Object.keys(MISSIONS);

const OPEN = new Set(['plain', 'field']);

function pickTile(map, state, field, lo, hi, prefer) {
  let best = null;
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const c = field[y * map.w + x];
    if (!(c >= lo && c <= hi)) continue;
    if (!OPEN.has(map.tiles[y * map.w + x]) || unitAt(state, x, y)) continue;
    const score = Math.abs(c - prefer) + (x * 0.001 + y * 0.0001);   // tie-break xác định
    if (!best || score < best.score) best = { x, y, score };
  }
  return best && { x: best.x, y: best.y };
}

// Đổi chỗ "orc" của bản đồ (mapgen luôn sinh hai phe người / Orc) sang phe địch thật của trận
export function setEnemy(map, enemy) {
  if (enemy === 'orc' || !map.spawns.orc) return map;
  map.strongholds = { human: map.strongholds.human, [enemy]: map.strongholds.orc };
  map.spawns = { human: map.spawns.human, [enemy]: map.spawns.orc };
  map.goblins = [];                                   // goblin chỉ đi theo Orc
  return map;
}

// Điểm tiếp viện bọc sườn: ô đi được ở mép trái / phải bản đồ, lệch hàng với thành phòng thủ không quá flankRows,
// cách thành ít nhất flankMinDist ô; càng ngang tầm và càng gần càng tốt. Đã dùng mép nào thì đợt sau ưu tiên mép kia. Xác định theo bản đồ (không random).
export function flankSpot(map, s, hold, cfg, used = []) {
  const usedSide = new Set(used.map((p) => (p.x === 0 ? 'L' : 'R')));
  let best = null;
  for (const x of [0, map.w - 1]) {
    const side = x === 0 ? 'L' : 'R';
    for (let y = 0; y < map.h; y++) {
      const t = map.tiles[y * map.w + x];
      if (!OPEN.has(t) && t !== 'forest' && t !== 'hill') continue;
      if (unitAt(s, x, y)) continue;
      const d = Math.abs(x - hold.x) + Math.abs(y - hold.y);
      if (d < cfg.flankMinDist || Math.abs(y - hold.y) > cfg.flankRows) continue;   // ngang tầm thành, không sát thành
      const score = Math.abs(y - hold.y) * 2 + d + (usedSide.has(side) ? 100 : 0) + y * 0.001;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  return best && { x: best.x, y: best.y };
}

export function createMissionState(map, type = 'skirmish', actor = 'human', enemy = 'orc', opts = {}) {
  setEnemy(map, enemy);
  const s = createState(map);
  if (opts.weather !== false) initWeather(s);
  s.fog = opts.fog !== false;
  const cfg = { ...(MISSIONS[type] || {}) };
  if (cfg.turns) cfg.turns = Math.round(cfg.turns * Math.pow(map.h / 20, 0.6));   // bản đồ dài hơn thì cần nhiều lượt hơn
  const foe = foeOf(s, actor);
  if (type === 'hold') {
    const k = cfg.turns / MISSIONS.hold.turns;      // giãn mốc tiếp viện theo bản đồ (trước khi cộng lượt cho phe chậm)
    const slow = (cfg.slowTurns || {})[foe];
    if (slow) cfg.turns += Math.max(0, Math.round((map.h - 20) * slow));
    const used = [];
    s.mission = { type, defender: actor, attacker: foe, turns: cfg.turns,
      waves: cfg.waves.map((w) => {
        const faction = w.side === 'attacker' ? foe : actor;
        // tiếp viện bọc sườn (chỉ phe trong flankFor): xuất hiện ở mép bản đồ bên hông thành phòng thủ, sớm hơn và đông hơn;
        // đợt sau sang mép bên kia. Không tìm được chỗ thì là đợt thường.
        const fl = w.flank && (cfg.flankFor || []).includes(faction) ? w.flank : null;
        const spot = fl && flankSpot(map, s, map.strongholds[actor], cfg, used);
        const src = spot ? fl : w;
        const out = { at: Math.round(src.at * k), n: src.n, faction, done: false };
        if (spot) { out.spot = spot; used.push(spot); }
        return out;
      }) };
    spawnSquads(s, foe, cfg.extra);
  } else if (type === 'destroy') {
    // mỗi bên có một trại: đơn vị tĩnh có máu, đặt đúng chỗ thành cũ
    const targets = {};
    for (const f of s.sides) {
      const h = map.strongholds[f];
      const t = addUnit(s, f, 'objective', h.x, h.y);
      t.static = true; t.acted = true; t.moved = true;
      targets[f] = t.id;
      map.tiles[h.y * map.w + h.x] = 'plain';          // không còn thành: chỉ có trại (đơn vị tĩnh) trên ô này
    }
    s.mission = { type, targets };
  } else if (type === 'escort') {
    const vip = s.units.find((u) => u.faction === actor && u.role === 'infantry');
    const from = costField(map, map.strongholds[actor], false);
    const to = map.strongholds[foe];
    const total = from[to.y * map.w + to.x];
    const goal = pickTile(map, s, from, total * 0.7, total * 0.9, total * 0.8);
    if (!vip || !goal) return createMissionState(map, 'skirmish', actor, enemy, opts);
    // không có thành: ô thành thành đất trống, quân đã xuất hiện sẵn giữa map
    for (const f of s.sides) { const h = map.strongholds[f]; map.tiles[h.y * map.w + h.x] = 'plain'; }
    vip.vip = true;
    vip.xp = LEVEL.xp[0];                       // tướng đã là cựu binh
    s.mission = { type, escort: actor, hunter: foe, vipId: vip.id, goal };
  }
  updateFog(s);
  return s;
}
