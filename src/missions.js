// Dựng ván theo loại nhiệm vụ. Logic thắng/thua nằm ở rules.js (checkVictory, checkTimeLimit);
// file này chỉ đặt công trình mục tiêu / tướng hộ tống / ô đích lên bản đồ.
//   actor = phe người chơi giữ vai chính của nhiệm vụ:
//     hold    -> actor là bên phòng thủ
//     destroy -> actor là bên tấn công (phải phá công trình của phe kia)
//     escort  -> actor là bên hộ tống tướng
import { MISSIONS, LEVEL } from './config.js';
import { createState, addUnit, other, unitAt, spawnSquads } from './rules.js';
import { costField } from './mapgen.js';

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

export function createMissionState(map, type = 'skirmish', actor = 'human') {
  const s = createState(map);
  const cfg = { ...(MISSIONS[type] || {}) };
  if (cfg.turns) cfg.turns = Math.round(cfg.turns * Math.pow(map.h / 20, 0.6));   // bản đồ dài hơn thì cần nhiều vòng hơn
  const foe = other(actor);
  if (type === 'hold') {
    const k = cfg.turns / MISSIONS.hold.turns;
    s.mission = { type, defender: actor, attacker: foe, turns: cfg.turns,
      waves: (cfg.waves || []).map((w) => ({ at: Math.round(w.at * k), n: w.n, faction: foe, done: false })) };
    spawnSquads(s, foe, cfg.extra);
  } else if (type === 'destroy') {
    // công trình của phe bị đánh, đặt cách thành nhà chừng 6 ô đường đi
    const field = costField(map, map.strongholds[foe], false);
    const at = pickTile(map, s, field, 4, 9, 6) || pickTile(map, s, field, 2, 12, 6);
    if (!at) return createMissionState(map, 'skirmish', actor);
    const t = addUnit(s, foe, 'objective', at.x, at.y);
    t.static = true; t.acted = true; t.moved = true;
    s.mission = { type, attacker: actor, defender: foe, turns: cfg.turns, targetId: t.id, target: at };
    spawnSquads(s, actor, cfg.extra);
  } else if (type === 'escort') {
    const vip = s.units.find((u) => u.faction === actor && u.role === 'infantry');
    const from = costField(map, map.strongholds[actor], false);
    const to = map.strongholds[foe];
    const total = from[to.y * map.w + to.x];
    const goal = pickTile(map, s, from, total * 0.7, total * 0.9, total * 0.8);
    if (!vip || !goal) return createMissionState(map, 'skirmish', actor);
    vip.vip = true;
    vip.xp = LEVEL.xp[0];                       // tướng đã là cựu binh
    s.mission = { type, escort: actor, hunter: foe, turns: cfg.turns, vipId: vip.id, goal };
  }
  return s;
}
