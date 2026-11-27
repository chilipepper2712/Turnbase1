import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, addUnit, endTurn, moveUnit, attackUnit, reachable, key, targetsFrom } from '../src/rules.js';
import { updateFog, seenMask, visionOf } from '../src/fog.js';
import { FOG } from '../src/config.js';
import { snapshot, restoreState } from '../src/saves.js';

function board(over = {}, w = 16, h = 16) {
  const tiles = new Array(w * h).fill('plain');
  for (const [k, v] of Object.entries(over)) { const [x, y] = k.split(',').map(Number); tiles[y * w + x] = v; }
  const s = createState({ w, h, seed: 4, tiles, strongholds: { human: { x: 0, y: 15 }, orc: { x: 15, y: 0 } }, spawns: { human: [], orc: [] } });
  s.fog = true;
  return s;
}

test('tầm nhìn: 3 ô, cung thủ +1, đồi/tháp +1, núi thấp +2', () => {
  const s = board({ '2,2': 'hill', '4,4': 'mountain', '6,6': 'fort' });
  assert.equal(visionOf(s, addUnit(s, 'human', 'infantry', 8, 8)), FOG.vision);
  assert.equal(visionOf(s, addUnit(s, 'human', 'archer', 9, 9)), FOG.vision + 1);
  assert.equal(visionOf(s, addUnit(s, 'human', 'infantry', 2, 2)), FOG.vision + 1);
  assert.equal(visionOf(s, addUnit(s, 'human', 'infantry', 4, 4)), FOG.vision + 2);
  assert.equal(visionOf(s, addUnit(s, 'human', 'cavalry', 6, 6)), FOG.vision + 1);
});

test('quân ngoài tầm nhìn bị khuất: không nhắm bắn được, không có vùng khống chế', () => {
  const s = board();
  const h = addUnit(s, 'human', 'infantry', 2, 8);
  const far = addUnit(s, 'orc', 'infantry', 9, 8);
  const near = addUnit(s, 'orc', 'archer', 5, 8);
  updateFog(s);
  assert.ok(far.fogged && !near.fogged);
  assert.ok(!h.fogged, 'orc thấy quân người trong tầm');
  const m = seenMask(s, 'human');
  assert.equal(m[15 * 16 + 0], 1, 'thành nhà luôn thấy');
  assert.equal(m[0 * 16 + 15], 1, 'thành địch luôn thấy');
  const a = addUnit(s, 'human', 'archer', 8, 12); updateFog(s);
  assert.ok(!targetsFrom(s, a, 8, 12).some((e) => e.id === far.id && far.fogged));
});

test('đâm vào quân khuất sương: dừng ngay trước nó, không bị đánh', () => {
  const s = board();
  const h = addUnit(s, 'human', 'cavalry', 2, 8);
  const o = addUnit(s, 'orc', 'infantry', 7, 8);
  addUnit(s, 'orc', 'infantry', 15, 2);
  updateFog(s);
  assert.ok(o.fogged);
  // trong mắt quân người ô (7,8) trống, đi tới được
  assert.ok(reachable(s, h).tiles.has(key(7, 8)));
  const before = h.strength;
  const ev = moveUnit(s, h, 7, 8);
  assert.ok(ev.some((e) => e.type === 'bump' && e.by === o.id));
  assert.equal(h.x, 6); assert.equal(h.strength, before);
  assert.ok(!o.fogged, 'giờ đã thấy');
});

test('Orc trong rừng chỉ là bóng đen; đi / đánh / bị đánh thì lộ, đầu lượt sau của nó ẩn lại', () => {
  const s = board({ '6,8': 'forest', '6,9': 'forest' });
  const a = addUnit(s, 'human', 'archer', 4, 8);
  const o = addUnit(s, 'orc', 'infantry', 6, 8);
  const g = addUnit(s, 'orc', 'goblin', 6, 9); g.hidden = true;
  updateFog(s);
  assert.ok(o.veiled && !o.fogged);
  assert.ok(!g.veiled, 'goblin ẩn hẳn, không thành bóng');
  attackUnit(s, a, o);
  assert.ok(!o.veiled, 'bị bắn thì lộ');
  endTurn(s);                       // sang lượt orc: hết lộ
  assert.ok(o.veiled);
  endTurn(s);
  assert.ok(o.veiled, 'đứng yên cả lượt vẫn là bóng');
});

test('bắn từ trong sương: bị định vị tới đầu lượt sau của nó', () => {
  const s = board({ '10,8': 'hill' });
  const h = addUnit(s, 'human', 'infantry', 6, 8);
  const o = addUnit(s, 'orc', 'archer', 10, 8);       // đứng đồi: tầm bắn 4, ngoài tầm nhìn 3 của bộ binh
  s.current = 'orc';
  updateFog(s);
  assert.ok(o.fogged);
  const ev = attackUnit(s, o, h);
  assert.ok(ev.some((e) => e.type === 'spotted'));
  assert.ok(!o.fogged);
  endTurn(s);                      // sang lượt người: vẫn thấy
  assert.ok(!o.fogged);
  endTurn(s);                      // sang lượt orc: hết bị định vị
  assert.ok(o.fogged);
});

test('sương mù: lưu / tải giữ cờ, tính lại tầm nhìn', () => {
  const s = board();
  addUnit(s, 'human', 'infantry', 2, 8);
  const o = addUnit(s, 'orc', 'infantry', 12, 8);
  updateFog(s);
  const r = restoreState(JSON.parse(JSON.stringify(snapshot(s))));
  assert.equal(r.fog, true);
  assert.ok(r.units.find((u) => u.id === o.id).fogged);
});

test('đi ngang qua cạnh quân vừa hiện khỏi sương: dừng lại (vùng khống chế)', () => {
  const s = board();
  const h = addUnit(s, 'human', 'cavalry', 2, 8);
  const o = addUnit(s, 'orc', 'infantry', 7, 9);
  addUnit(s, 'orc', 'infantry', 15, 2);
  updateFog(s);
  assert.ok(o.fogged);
  const node = reachable(s, h).tiles.get(key(9, 8));
  assert.ok(node);
  moveUnit(s, h, 9, 8);
  assert.ok(Math.abs(h.x - o.x) + Math.abs(h.y - o.y) === 1, 'dừng ở ô kề quân orc');
});

test('trí nhớ AI: quân địch khuất sương vẫn được nhớ chỗ thấy lần cuối; nhìn lại thấy trống thì quên; chết thì quên', async () => {
  const { rememberedFoes } = await import('../src/fog.js');
  const s = board();
  addUnit(s, 'human', 'infantry', 2, 13);
  const o = addUnit(s, 'orc', 'infantry', 8, 8);
  const eye = addUnit(s, 'orc', 'infantry', 4, 11);        // Orc nhìn thấy quân người ở (2,13)
  const h = addUnit(s, 'human', 'archer', 3, 12);
  updateFog(s);
  assert.equal(rememberedFoes(s, 'orc').length, 0, 'đang thấy thì không phải bóng ma');
  // quân người lùi khỏi tầm nhìn của Orc: còn nhớ chỗ cũ
  s.units = s.units.filter((u) => u.id !== eye.id);
  updateFog(s);
  let g = rememberedFoes(s, 'orc');
  assert.ok(g.some((r) => r.id === h.id && r.x === 3 && r.y === 12 && r.ghost), 'nhớ cung thủ ở chỗ cũ');
  // Orc nhìn lại chỗ cũ, không còn ai: quên
  h.x = 1; h.y = 14;
  s.units.push({ ...eye });
  updateFog(s);
  assert.ok(!rememberedFoes(s, 'orc').some((r) => r.id === h.id && r.x === 3 && r.y === 12), 'nhìn lại thấy trống thì quên');
  // quá FOG.memoryTurns lượt: quên
  s.units = s.units.filter((u) => u.id !== eye.id);
  updateFog(s);
  s.memory.orc[h.id] = { ...s.memory.orc[h.id], seen: s.turn - FOG.memoryTurns - 1, live: false };
  updateFog(s);
  assert.ok(!s.memory.orc[h.id], 'quá lâu thì quên');
  assert.ok(o);
});

test('trí nhớ AI: lưu / tải giữ nguyên', () => {
  const s = board();
  const h = addUnit(s, 'human', 'archer', 3, 12);
  const eye = addUnit(s, 'orc', 'infantry', 4, 11);
  addUnit(s, 'orc', 'infantry', 14, 1);
  updateFog(s);
  s.units = s.units.filter((u) => u.id !== eye.id);
  updateFog(s);
  const r = restoreState(snapshot(s, {}));
  assert.ok(r.memory.orc[h.id] && r.memory.orc[h.id].x === 3, 'bản lưu có trí nhớ');
});
