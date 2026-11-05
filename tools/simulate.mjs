// Chạy AI vs AI headless để kiểm tra game kết thúc và đo cân bằng sơ bộ.
// node tools/simulate.mjs [số seed] [orcLevel] [humanLevel] [small|medium|large]
import { generateMap } from '../src/mapgen.js';
import { MAP_SIZES } from '../src/config.js';
import { createState, endTurn } from '../src/rules.js';
import { planNextAction } from '../src/ai.js';
import { executeAction } from '../src/actions.js';

const N = +process.argv[2] || 20;
const levels = { orc: process.argv[3] || 'tactical', human: process.argv[4] || 'tactical' };
const size = MAP_SIZES[process.argv[5] || 'small'];
const MAX_TURNS = 60;

let wins = { human: 0, orc: 0, draw: 0 }, turns = 0, how = {};
const t0 = Date.now();
for (let seed = 1; seed <= N; seed++) {
  const s = createState(generateMap(seed, size.w, size.h));
  let guard = 0;
  while (!s.winner && s.turn <= MAX_TURNS && guard++ < 5000) {
    let a;
    while (!s.winner && (a = planNextAction(s, levels[s.current]))) executeAction(s, a);
    endTurn(s);
  }
  if (s.winner) { wins[s.winner]++; how[s.winReason] = (how[s.winReason] || 0) + 1; } else wins.draw++;
  turns += s.turn;
}
console.log(`levels orc=${levels.orc} human=${levels.human}`, wins, how,
  `avg turns ${(turns / N).toFixed(1)}`, `${((Date.now() - t0) / N).toFixed(0)}ms/ván`);
