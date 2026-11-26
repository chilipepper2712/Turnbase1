// Chạy AI vs AI headless để kiểm tra game kết thúc và đo cân bằng sơ bộ.
// node tools/simulate.mjs [số seed] [enemyLevel] [humanLevel] [small|medium|large] [orc|undead] [skirmish|hold|destroy|escort]
import { generateMap } from '../src/mapgen.js';
import { MAP_SIZES } from '../src/config.js';
import { endTurn } from '../src/rules.js';
import { createMissionState } from '../src/missions.js';
import { planNextAction } from '../src/ai.js';
import { executeAction } from '../src/actions.js';

const N = +process.argv[2] || 20;
const enemy = process.argv[6] || 'orc';
const mission = process.argv[7] || 'skirmish';
const levels = { [enemy]: process.argv[3] || 'tactical', human: process.argv[4] || 'tactical' };
const size = MAP_SIZES[process.argv[5] || 'small'];
const MAX_TURNS = 60;

const wins = { human: 0, [enemy]: 0, draw: 0 }, how = {};
let turns = 0, risen = 0, buried = 0, graves = 0, ignites = 0, spreads = 0, burns = 0, swamps = 0;
const t0 = Date.now();
for (let seed = 1; seed <= N; seed++) {
  const s = createMissionState(generateMap(seed, size.w, size.h), mission, 'human', enemy, { weather: !process.env.NOWEATHER, fog: !process.env.NOFOG });
  let guard = 0;
  const count = (ev) => {
    for (const e of ev || []) {
      if (e.type === 'rise') risen++;
      else if (e.type === 'bury') buried++;
      else if (e.type === 'grave') graves++;
      else if (e.type === 'ignite') ignites++;
      else if (e.type === 'fire' && e.spread) spreads++;
      else if (e.type === 'damage' && e.fire) burns += e.amount;
      else if (e.type === 'terrain' && e.changes) swamps += e.changes.filter((c) => c.to === 'swamp').length;
    }
  };
  while (!s.winner && s.turn <= MAX_TURNS && guard++ < 5000) {
    let a;
    while (!s.winner && (a = planNextAction(s, levels[s.current]))) count(executeAction(s, a));
    count(endTurn(s));
  }
  if (s.winner) { wins[s.winner]++; how[s.winReason] = (how[s.winReason] || 0) + 1; } else wins.draw++;
  turns += s.turn;
}
const wx = ` | hỏa công ${(ignites / N).toFixed(1)}/ván, lan ${(spreads / N).toFixed(1)}, quân cháy ${(burns / N).toFixed(1)}, ô ngập ${(swamps / N).toFixed(1)}`;
const extra = (enemy === 'undead' ? ` mộ ${(graves / N).toFixed(1)}/ván, trỗi dậy ${(risen / N).toFixed(1)}, an táng ${(buried / N).toFixed(1)}` : '') + wx;
console.log(`${enemy} ${mission} levels ${enemy}=${levels[enemy]} human=${levels.human}`, wins, how,
  `avg turns ${(turns / N).toFixed(1)}`, `${((Date.now() - t0) / N).toFixed(0)}ms/ván${extra}`);
