import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap } from '../src/mapgen.js';
import { createState, addUnit, endTurn, cloneState, moveCostFor } from '../src/rules.js';
import { createMissionState } from '../src/missions.js';
import { initWeather, stepWeather, windVec } from '../src/weather.js';
import { snapshot, restoreState } from '../src/saves.js';
import { WEATHER } from '../src/config.js';

function flat(w = 16, h = 16, seed = 3) {
  const s = createState({ w, h, seed, tiles: new Array(w * h).fill('plain'), strongholds: { human: { x: 1, y: 15 }, orc: { x: 14, y: 0 } }, spawns: { human: [], orc: [] } });
  addUnit(s, 'human', 'infantry', 0, 15); addUnit(s, 'orc', 'infantry', 15, 0);
  return s;
}
const run = (s, n) => { for (let i = 0; i < n; i++) endTurn(s); return s; };

test('thời tiết: tái lập được theo seed', () => {
  const a = createMissionState(generateMap(11, 16, 20), 'skirmish');
  const b = createMissionState(generateMap(11, 16, 20), 'skirmish');
  run(a, 12); run(b, 12);
  assert.deepEqual(a.weather, b.weather);
  assert.deepEqual(a.map.tiles, b.map.tiles);
});

test('thời tiết: mây trôi đúng hướng gió, mây nhỏ nhanh hơn', () => {
  const s = flat(); initWeather(s);
  s.weather.clouds = [{ id: 1, x: 5, y: 5, size: 'big', raining: false }, { id: 2, x: 5, y: 8, size: 'small', raining: false }];
  WEATHER._wc = WEATHER.windChange; WEATHER.windChange = 0;
  try {
    const w = s.weather.wind, v = windVec(w);
    stepWeather(s);
    const big = s.weather.clouds.find((c) => c.id === 1), small = s.weather.clouds.find((c) => c.id === 2);
    assert.ok(Math.abs(big.x - (5 + v.x * WEATHER.bigSpeed)) < 1e-9 && Math.abs(big.y - (5 + v.y * WEATHER.bigSpeed)) < 1e-9);
    assert.ok(Math.hypot(small.x - 5, small.y - 8) > Math.hypot(big.x - 5, big.y - 5));
  } finally { WEATHER.windChange = WEATHER._wc; delete WEATHER._wc; }
});

test('mưa: chỉ đồng bằng dưới mây lớn đang mưa thành đầm lầy, rồi khô lại sau swampTurns lượt', () => {
  const s = flat(); initWeather(s);
  const keep = { ...WEATHER };
  Object.assign(WEATHER, { windChange: 0, rainStart: 1, rainStop: 0, swampChance: 1, spawnChance: 0, bigSpeed: 0, smallSpeed: 0 });
  try {
    s.map.tiles[8 * 16 + 9] = 'forest';
    s.weather.clouds = [{ id: 1, x: 8, y: 8, size: 'big', raining: false }, { id: 2, x: 2, y: 2, size: 'small', raining: false }];
    endTurn(s);                                    // người -> địch: bắt đầu mưa
    assert.equal(s.map.tiles[8 * 16 + 8], 'swamp');
    assert.equal(s.map.tiles[8 * 16 + 9], 'forest', 'rừng không thành đầm lầy');
    assert.equal(s.map.tiles[2 * 16 + 2], 'plain', 'mây nhỏ không mưa');
    assert.ok(!s.weather.clouds.find((c) => c.id === 2).raining);
    // ngừng mưa hẳn rồi đợi khô
    Object.assign(WEATHER, { rainStart: 0, rainStop: 1 });
    const t0 = s.turn;
    for (let i = 0; i < 20 && !(s.turn >= t0 + WEATHER.swampTurns && s.current === 'human'); i++) endTurn(s);
    assert.equal(s.current, 'human');
    assert.equal(s.map.tiles[8 * 16 + 8], 'plain', 'khô lại');
    assert.equal(s.weather.wet.length, 0);
  } finally { Object.assign(WEATHER, keep); }
});

test('mây tan ngoài mép và mây mới mọc từ phía đầu gió', () => {
  const s = flat(); initWeather(s);
  const keep = { ...WEATHER };
  Object.assign(WEATHER, { windChange: 0, spawnChance: 1 });
  try {
    s.weather.wind = 0;                            // gió thổi về +x
    s.weather.clouds = [{ id: 1, x: 15 + WEATHER.margin + 1.5, y: 5, size: 'big', raining: false }];
    s.weather.nextId = 2;
    stepWeather(s);
    assert.ok(!s.weather.clouds.some((c) => c.id === 1), 'mây ra khỏi bản đồ đã tan');
    const fresh = s.weather.clouds.filter((c) => c.id >= 2);
    assert.ok(fresh.length > 0 && fresh.every((c) => c.x < 0), 'mây mới ở mép trái (đầu gió)');
  } finally { Object.assign(WEATHER, keep); }
});

test('kỵ binh vào được đầm lầy nhưng chậm hơn bộ binh', () => {
  assert.ok(isFinite(moveCostFor('swamp', 'human', 'cavalry')));
  assert.ok(moveCostFor('swamp', 'human', 'cavalry') > moveCostFor('swamp', 'human', 'infantry'));
});

test('thời tiết: sao chép trạng thái và lưu / tải giữ nguyên', () => {
  const s = run(createMissionState(generateMap(5, 16, 20), 'skirmish'), 7);
  const c = cloneState(s);
  assert.deepEqual(c.weather, s.weather);
  c.weather.clouds[0].x += 99;
  assert.notEqual(c.weather.clouds[0].x, s.weather.clouds[0].x, 'bản sao độc lập');
  const r = restoreState(JSON.parse(JSON.stringify(snapshot(s))));
  assert.deepEqual(r.weather, s.weather);
  // bản lưu cũ không có thời tiết: vẫn tải được, trời quang
  const old = JSON.parse(JSON.stringify(snapshot(s))); delete old.state.weather;
  assert.equal(restoreState(old).weather, undefined);
});

test('tắt thời tiết khi dựng trận', () => {
  const s = createMissionState(generateMap(5, 16, 20), 'skirmish', 'human', 'orc', { weather: false });
  assert.equal(s.weather, undefined);
  assert.deepEqual(endTurn(s).filter((e) => ['clouds', 'rain', 'wind'].includes(e.type)), []);
});
