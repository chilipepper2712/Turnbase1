import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addUnit, endTurn, moveCost, reachable, key, canIgnite, igniteTiles, igniteForest, cloneState, previewAttack, fireWait } from '../src/rules.js';
import { initWeather } from '../src/weather.js';
import { snapshot, restoreState } from '../src/saves.js';
import { FIRE, WEATHER } from '../src/config.js';
import { fireAt } from '../src/fire.js';

function board(forest = [], w = 12, h = 12) {
  const tiles = new Array(w * h).fill('plain');
  for (const [x, y] of forest) tiles[y * w + x] = 'forest';
  const s = createState({ w, h, seed: 9, tiles, strongholds: { human: { x: 0, y: 11 }, orc: { x: 11, y: 0 } }, spawns: { human: [], orc: [] } });
  return s;
}

test('hỏa công: chỉ cung thủ người, chỉ ô rừng trong tầm', () => {
  const s = board([[5, 3], [5, 9]]);
  const a = addUnit(s, 'human', 'archer', 5, 5);
  const i = addUnit(s, 'human', 'infantry', 4, 3);
  addUnit(s, 'orc', 'archer', 11, 11);
  assert.ok(canIgnite(s, a));
  assert.deepEqual(igniteTiles(s, a), [{ x: 5, y: 3 }], 'rừng ngoài tầm không tính');
  assert.ok(!canIgnite(s, i));
  const o = addUnit(s, 'orc', 'archer', 6, 3);
  assert.ok(!canIgnite(s, o), 'orc không dùng hỏa công');
  assert.equal(igniteForest(s, a, 6, 3), null, 'ô không phải rừng');
});

test('đốt ô có địch: mất quân ngay, ô không đi vào được, đứng lại cuối lượt mất tiếp', () => {
  const s = board([[5, 3], [5, 2]]);
  const a = addUnit(s, 'human', 'archer', 5, 5);
  const e = addUnit(s, 'orc', 'infantry', 5, 3);
  const shot = previewAttack(s, a, e).dmg;
  const ev = igniteForest(s, a, 5, 3);
  assert.ok(ev.some((x) => x.type === 'fire'));
  assert.ok(ev.some((x) => x.type === 'attack' && x.fireShot), 'trúng một mũi tên như bắn thường');
  assert.ok(shot > 0);
  assert.equal(e.strength, 10 - shot - FIRE.damage);
  assert.ok(a.acted, 'hết lượt cung thủ');
  assert.ok(fireAt(s, 5, 3));
  // quân khác không vào được ô cháy
  const h = addUnit(s, 'human', 'infantry', 4, 4);
  assert.equal(moveCost(s, h, 5, 3), Infinity);
  assert.ok(!reachable(s, h).tiles.has(key(5, 3)));
  const after = e.strength;
  endTurn(s);                 // sang lượt orc: orc chưa bị đốt thêm
  assert.equal(e.strength, after);
  endTurn(s);                 // orc đứng lì cả lượt: mất thêm
  assert.equal(e.strength, after - FIRE.damage);
});

test('lửa tàn sau burnTurns lượt: rừng thành rừng cháy (đi như đồng bằng)', () => {
  const s = board([[5, 3]]);
  const a = addUnit(s, 'human', 'archer', 5, 5);
  addUnit(s, 'orc', 'archer', 11, 0);
  const keep = FIRE.spread; FIRE.spread = 0;
  try {
    igniteForest(s, a, 5, 3);
    const t0 = s.turn;
    for (let i = 0; i < 20 && fireAt(s, 5, 3); i++) endTurn(s);
    assert.equal(s.turn, t0 + FIRE.burnTurns);
    assert.equal(s.map.tiles[3 * 12 + 5], 'burnt');
    assert.equal(moveCost(s, a, 5, 3), 1);
  } finally { FIRE.spread = keep; }
});

test('lửa lan sang ô rừng theo chiều gió, không lan ngược gió', () => {
  const s = board([[5, 3], [6, 3], [4, 3]]);
  initWeather(s);
  s.weather.clouds = []; s.weather.wind = 0;                  // gió thổi +x
  const k = { ...WEATHER }; Object.assign(WEATHER, { windChange: 0, spawnChance: 0 });
  const keep = FIRE.spread; FIRE.spread = 1;
  try {
    const a = addUnit(s, 'human', 'archer', 5, 5);
    addUnit(s, 'orc', 'archer', 11, 11);
    igniteForest(s, a, 5, 3);
    endTurn(s); endTurn(s);                                     // tới đầu lượt người: lan
    assert.ok(fireAt(s, 6, 3), 'bén sang ô xuôi gió');
    assert.ok(!fireAt(s, 4, 3), 'không lan ngược gió');
  } finally { FIRE.spread = keep; Object.assign(WEATHER, k); }
});

test('mưa dập lửa (ô vẫn là rừng), và không đốt được ô đang mưa', () => {
  const s = board([[5, 3], [5, 2]]);
  initWeather(s);
  const k = { ...WEATHER }; Object.assign(WEATHER, { windChange: 0, spawnChance: 0, bigSpeed: 0, smallSpeed: 0, rainStart: 1, rainStop: 0, swampChance: 0 });
  try {
    s.weather.clouds = [];
    const a = addUnit(s, 'human', 'archer', 5, 5);
    addUnit(s, 'orc', 'archer', 11, 11);
    igniteForest(s, a, 5, 3);
    s.weather.clouds = [{ id: 1, x: 5, y: 3, size: 'big', raining: false }];
    endTurn(s);
    assert.ok(!fireAt(s, 5, 3), 'mưa tắt lửa');
    assert.equal(s.map.tiles[3 * 12 + 5], 'forest');
    endTurn(s);
    assert.ok(!igniteTiles(s, a).some((p) => p.x === 5 && p.y === 2), 'đang mưa không đốt được');
  } finally { Object.assign(WEATHER, k); }
});

test('lửa: sao chép và lưu / tải giữ nguyên', () => {
  const s = board([[5, 3]]);
  const a = addUnit(s, 'human', 'archer', 5, 5);
  addUnit(s, 'orc', 'archer', 11, 11);
  igniteForest(s, a, 5, 3);
  assert.deepEqual(cloneState(s).fires, s.fires);
  const r = restoreState(JSON.parse(JSON.stringify(snapshot(s))));
  assert.deepEqual(r.fires, s.fires);
});

test('bắn mù: tên lửa trúng goblin đang ẩn, goblin lộ diện', () => {
  const s = board([[5, 3]]);
  const a = addUnit(s, 'human', 'archer', 5, 5);
  const g = addUnit(s, 'orc', 'goblin', 5, 3); g.hidden = true;
  const ev = igniteForest(s, a, 5, 3);
  assert.ok(!g.hidden || !s.units.includes(g));
  assert.ok(ev.some((x) => x.type === 'reveal' && x.unit === g.id));
  assert.ok(ev.some((x) => x.type === 'attack' && x.defender === g.id));
});

test('hỏa công phải chờ hồi FIRE.cooldown lượt', () => {
  const s = board([[5, 3], [5, 2]]);
  const a = addUnit(s, 'human', 'archer', 5, 5);
  addUnit(s, 'orc', 'archer', 11, 11);
  igniteForest(s, a, 5, 3);
  assert.equal(fireWait(s, a), FIRE.cooldown);
  for (let i = 1; i < FIRE.cooldown; i++) { endTurn(s); endTurn(s); assert.ok(!canIgnite(s, a), 'chưa hồi sau ' + i + ' lượt'); }
  endTurn(s); endTurn(s);
  assert.equal(fireWait(s, a), 0);
  assert.ok(igniteTiles(s, a).some((p) => p.x === 5 && p.y === 2));
});
