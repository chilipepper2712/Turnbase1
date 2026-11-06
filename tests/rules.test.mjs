import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, connected, assess } from '../src/mapgen.js';
import {
  createState, addUnit, reachable, key, previewAttack, attackUnit, mergeUnits,
  splitUnit, moveUnit, endTurn, unitAt, defensePct, calcDamage,
} from '../src/rules.js';
import { CONFIG, TERRAIN } from '../src/config.js';

// map phẳng nhỏ để test luật
function flatMap(w = 12, h = 12, over = {}) {
  const tiles = new Array(w * h).fill('plain');
  for (const [k, v] of Object.entries(over)) { const [x, y] = k.split(',').map(Number); tiles[y * w + x] = v; }
  return {
    w, h, tiles,
    strongholds: { human: { x: 5, y: 11 }, orc: { x: 6, y: 0 } },
    spawns: { human: [], orc: [] },
  };
}
const blank = (over) => createState(flatMap(12, 12, over));

test('mapgen: không đối xứng, nhưng thông đường, cân bằng theo vùng, spawn hợp lệ', () => {
  let asym = 0, okCount = 0;
  const N = 80;
  for (let seed = 1; seed <= N; seed++) {
    const m = generateMap(seed);
    assert.equal(m.tiles.length, m.w * m.h);
    assert.ok(connected(m, false) && connected(m, true), 'seed ' + seed + ' không thông đường');
    for (const f of ['human', 'orc']) {
      assert.equal(m.spawns[f].length, 7);
      for (const p of m.spawns[f]) {
        const t = TERRAIN[m.tiles[p.y * m.w + p.x]];
        assert.ok(isFinite(t.cost) && !t.noCavalry, 'spawn ở ô không đi được: seed ' + seed);
      }
    }
    const keys = new Set([...m.spawns.human, ...m.spawns.orc].map((p) => key(p.x, p.y)));
    assert.equal(keys.size, 14, 'spawn không được trùng');
    if (assess(m).ok) okCount++;
    let sym = true;
    for (let y = 0; y < m.h && sym; y++) for (let x = 0; x < m.w; x++) {
      if (m.tiles[y * m.w + x] !== m.tiles[(m.h - 1 - y) * m.w + (m.w - 1 - x)]) { sym = false; break; }
    }
    if (!sym) asym++;
  }
  assert.ok(asym >= N * 0.95, 'map phải hầu như không đối xứng: ' + asym + '/' + N);
  assert.ok(okCount >= N * 0.9, 'đa số map phải qua kiểm tra công bằng: ' + okCount + '/' + N);
});

test('mapgen: cùng seed cho cùng map', () => {
  assert.deepEqual(generateMap(42).tiles, generateMap(42).tiles);
});

test('di chuyển: rừng tốn 2, orc giảm còn 1; sông chặn; kỵ binh không qua núi', () => {
  let s = blank({ '4,5': 'forest', '5,4': 'river', '3,5': 'mountain' });
  const h = addUnit(s, 'human', 'infantry', 3, 5);
  let r = reachable(s, h);
  assert.equal(r.tiles.get(key(4, 5)).cost, 2);
  assert.equal(r.tiles.get(key(3, 5)).cost, 0);
  const o = addUnit(s, 'orc', 'infantry', 3, 7);
  s.units = [o];
  r = reachable(s, o);
  s.map.tiles[7 * 12 + 4] = 'forest';
  r = reachable(s, o);
  assert.equal(r.tiles.get(key(4, 7)).cost, 1);
  const c = addUnit(s, 'human', 'cavalry', 2, 5);
  r = reachable(s, c);
  assert.ok(!r.tiles.has(key(3, 5)), 'kỵ binh không vào núi');
  assert.ok(!r.tiles.has(key(5, 4)), 'không vào sông');
});

test('ZOC: vào ô kề địch thì dừng, không đi tiếp qua ô đó', () => {
  // hành lang rộng 2 cột (5,6), các cột khác là sông
  const over = {};
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (x !== 5 && x !== 6) over[x + ',' + y] = 'river';
  const s = blank(over);
  const h = addUnit(s, 'human', 'infantry', 6, 2);
  addUnit(s, 'orc', 'infantry', 5, 5);
  const r = reachable(s, h);
  assert.ok(r.tiles.has(key(6, 5)), 'vào ô kề địch được');
  assert.ok(!r.tiles.has(key(6, 6)), 'nhưng không đi tiếp qua ô đó');
  assert.ok(!r.tiles.has(key(5, 5)), 'không đi xuyên địch');
});

test('địa hình: orc hưởng rừng, người hưởng công trình', () => {
  const s = blank({ '5,5': 'forest', '6,5': 'fort' });
  const hf = addUnit(s, 'human', 'infantry', 5, 5);
  const of = addUnit(s, 'orc', 'infantry', 5, 5 + 0);
  s.units = [hf];
  const hForest = defensePct(s, hf, 5, 5);
  s.units = [of];
  const oForest = defensePct(s, of, 5, 5);
  assert.ok(oForest > hForest, 'orc phải phòng thủ tốt hơn trong rừng');
  of.x = 6; of.y = 5; hf.x = 6; hf.y = 5;
  s.units = [hf]; const hFort = defensePct(s, hf, 6, 5);
  s.units = [of]; const oFort = defensePct(s, of, 6, 5);
  assert.ok(hFort > oFort, 'người phải phòng thủ tốt hơn ở công trình');
});

test('chiến đấu: deterministic, có phản công, cung thủ không phản công cận chiến', () => {
  const s = blank();
  const a = addUnit(s, 'human', 'infantry', 5, 5);
  const d = addUnit(s, 'orc', 'infantry', 5, 6);
  const p1 = previewAttack(s, a, d);
  const p2 = previewAttack(s, a, d);
  assert.deepEqual(p1, p2);
  assert.ok(p1.dmg > 0 && p1.counter > 0);
  const arch = addUnit(s, 'orc', 'archer', 8, 8);
  const att = addUnit(s, 'human', 'infantry', 8, 9);
  assert.equal(previewAttack(s, att, arch).counter, 0, 'cung thủ không phản công kề sát');
  // cung thủ bắn từ xa, mục tiêu cận chiến không phản công
  const h = addUnit(s, 'human', 'archer', 1, 1);
  const t = addUnit(s, 'orc', 'infantry', 1, 3);
  assert.equal(previewAttack(s, h, t).counter, 0);
});

test('flank: có đồng đội kề mục tiêu thì sát thương tăng', () => {
  const s = blank();
  const a = addUnit(s, 'human', 'infantry', 5, 5);
  const d = addUnit(s, 'orc', 'infantry', 5, 6);
  const solo = calcDamage(s, a, d).raw;
  addUnit(s, 'human', 'infantry', 4, 6);
  const flanked = calcDamage(s, a, d).raw;
  assert.ok(flanked > solo);
});

test('kỵ binh xung phong khi đi đủ xa', () => {
  const s = blank();
  const c = addUnit(s, 'human', 'cavalry', 5, 5);
  const d = addUnit(s, 'orc', 'militia', 5, 6);
  const still = calcDamage(s, c, d, 5, 5, 0).raw;
  const charged = calcDamage(s, c, d, 5, 5, 4).raw;
  assert.ok(charged > still);
});

test('morale: cùng mức morale và cùng đòn đánh, orc bỏ chạy còn người thì không', () => {
  const s = blank();
  const o = addUnit(s, 'orc', 'infantry', 5, 6);
  const h = addUnit(s, 'human', 'infantry', 8, 6);
  o.morale = 50; h.morale = 50;
  const a1 = addUnit(s, 'human', 'infantry', 5, 5, 3);   // đòn nhẹ
  const a2 = addUnit(s, 'orc', 'infantry', 8, 5, 3);
  attackUnit(s, a1, o);
  attackUnit(s, a2, h);
  assert.ok(o.strength < 10 && h.strength < 10);
  assert.ok(o.morale <= 45 && o.status === 'routed', 'orc phải bỏ chạy: morale ' + o.morale);
  assert.ok(h.morale > 25 && h.status === 'ok', 'người chưa bỏ chạy: morale ' + h.morale);
});

test('bỏ chạy: đầu lượt tự rút lui xa địch và không hành động được', () => {
  const s = blank();
  const o = addUnit(s, 'orc', 'militia', 5, 5);
  addUnit(s, 'human', 'infantry', 5, 7);
  o.status = 'routed'; o.morale = 10;
  const d0 = Math.abs(o.x - 5) + Math.abs(o.y - 7);
  s.current = 'human';
  endTurn(s);     // -> orc
  const d1 = Math.abs(o.x - 5) + Math.abs(o.y - 7);
  assert.ok(d1 > d0, 'phải rút xa địch');
  assert.ok(o.acted && o.moved);
});

test('gộp: dân quân vào bộ binh bù quân; tách chia đôi', () => {
  const s = blank();
  const inf = addUnit(s, 'human', 'infantry', 5, 5, 6);
  const mil = addUnit(s, 'human', 'militia', 5, 7, 8);
  const ev = mergeUnits(s, mil, inf);
  assert.ok(ev);
  assert.equal(inf.strength, 10);
  const left = s.units.find((u) => u.id === mil.id);
  assert.equal(left.strength, 4, 'phần dư dân quân ở lại');
  const big = addUnit(s, 'human', 'infantry', 1, 1, 10);
  big.moved = false; big.acted = false;
  const e2 = splitUnit(s, big, 1, 2);
  assert.ok(e2);
  assert.equal(big.strength, 5);
  assert.equal(unitAt(s, 1, 2).strength, 5);
});

test('chiếm thành: giữ 2 lượt thì thắng', () => {
  const s = blank();
  const hold = s.map.strongholds.orc;
  const u = addUnit(s, 'human', 'infantry', hold.x, hold.y);
  addUnit(s, 'orc', 'infantry', 0, 5);   // orc còn quân ở xa
  // lượt người kết thúc -> orc -> người
  endTurn(s);              // sang orc
  assert.equal(s.capture.human, 0);
  endTurn(s);              // đầu lượt người lần 1: tiến độ 1
  assert.equal(s.capture.human, 1);
  assert.equal(s.winner, null);
  endTurn(s); endTurn(s);  // lần 2
  assert.equal(s.winner, 'human');
  assert.equal(s.winReason, 'capture');
});

test('tiêu diệt hết quân thì thắng', () => {
  const s = blank();
  const a = addUnit(s, 'human', 'cavalry', 5, 5);
  const d = addUnit(s, 'orc', 'militia', 5, 6, 1);
  attackUnit(s, a, d);
  assert.equal(s.winner, 'human');
});

test('làng hồi quân đầu lượt', () => {
  const s = blank({ '5,5': 'village' });
  const u = addUnit(s, 'orc', 'infantry', 5, 5, 4);
  addUnit(s, 'human', 'infantry', 1, 1);
  endTurn(s);   // -> orc
  assert.equal(u.strength, 4 + CONFIG.healVillage);
});
