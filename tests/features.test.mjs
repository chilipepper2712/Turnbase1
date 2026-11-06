import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap, assess, bridgeEndsClear, bridgesValid } from '../src/mapgen.js';
import {
  createState, addUnit, reachable, key, attackUnit, endTurn, fortifyUnit, canFortify, defensePct, calcDamage,
  moveUnit, levelOf, terrainFacts, moveCost, fortifyBonus, mergeUnits, splitUnit, waitUnit,
} from '../src/rules.js';
import { CONFIG, LEVEL, FORTIFY, MAPGEN, TERRAIN } from '../src/config.js';

function flat(over = {}, w = 12, h = 12) {
  const tiles = new Array(w * h).fill('plain');
  for (const [k, v] of Object.entries(over)) { const [x, y] = k.split(',').map(Number); tiles[y * w + x] = v; }
  return createState({ w, h, tiles, strongholds: { human: { x: 5, y: 11 }, orc: { x: 6, y: 0 } }, spawns: { human: [], orc: [] } });
}

test('núi cao: không đi qua được (kể cả leo), núi thấp thì đi được', () => {
  const s = flat({ '4,5': 'peak', '3,5': 'mountain' });
  const u = addUnit(s, 'human', 'infantry', 3, 6);
  const r = reachable(s, u);
  assert.ok(!r.tiles.has(key(4, 5)), 'núi cao chặn hẳn');
  assert.ok(r.tiles.has(key(3, 5)), 'núi thấp đi được');
  assert.equal(moveCost(s, u, 4, 5), Infinity);
  assert.equal(terrainFacts('peak').passable, false);
});

test('địa hình: thế cao cộng sát thương, đầm lầy trừ thủ + trừ sát thương, kỵ binh không vào đầm lầy', () => {
  const s = flat({ '5,5': 'hill', '2,2': 'swamp' });
  const a = addUnit(s, 'human', 'infantry', 5, 5);
  const d = addUnit(s, 'orc', 'infantry', 5, 6);
  const onHill = calcDamage(s, a, d, 5, 5).raw;
  const onPlain = calcDamage(s, a, d, 7, 7).raw;
  assert.ok(onHill > onPlain, 'đánh từ đồi mạnh hơn');
  const swampDef = defensePct(s, addUnit(s, 'human', 'militia', 2, 2), 2, 2);
  assert.ok(swampDef < 0, 'đầm lầy làm chịu thêm sát thương: ' + swampDef);
  const cav = addUnit(s, 'human', 'cavalry', 2, 3);
  assert.ok(!reachable(s, cav).tiles.has(key(2, 2)), 'kỵ binh không vào đầm lầy');
  assert.equal(TERRAIN.swamp.nat, 0, 'orc không được hưởng gì từ đầm lầy');
});

test('kinh nghiệm: gây sát thương -> lên cấp, có trần, cấp cao đánh mạnh và thủ cao hơn', () => {
  const s = flat();
  const a = addUnit(s, 'human', 'infantry', 5, 5);
  const base = calcDamage(s, a, addUnit(s, 'orc', 'militia', 5, 6), 5, 5);
  const d0 = defensePct(s, a, 5, 5);
  a.xp = LEVEL.xp[0];
  assert.equal(levelOf(a.xp), 1);
  assert.ok(defensePct(s, a, 5, 5) > d0, 'cấp cao thủ cao hơn');
  assert.ok(calcDamage(s, a, s.units.find((u) => u.faction === 'orc'), 5, 5).raw > base.raw);
  a.xp = 9999;
  assert.equal(levelOf(a.xp), LEVEL.xp.length, 'có cấp tối đa');
  // lên cấp qua chiến đấu
  const s2 = flat();
  const x = addUnit(s2, 'human', 'cavalry', 5, 5);
  const y = addUnit(s2, 'orc', 'militia', 5, 6);
  x.xp = LEVEL.xp[0] - 2;
  const ev = attackUnit(s2, x, y);
  assert.ok(x.xp > LEVEL.xp[0] - 2, 'nhận xp');
  assert.ok(ev.some((e) => e.type === 'levelup' && e.unit === x.id) || levelOf(x.xp) >= 1, 'lên cấp');
});

test('kinh nghiệm: gộp pha loãng một nửa và không tụt cấp, tách thì phần tách ra xp về 0', () => {
  const s = flat();
  const inf = addUnit(s, 'human', 'infantry', 5, 5, 5); inf.xp = 50;
  const mil = addUnit(s, 'human', 'militia', 5, 7, 3); mil.xp = 0;
  mergeUnits(s, mil, inf);
  // trung bình theo quân số = 31,25; lệch một nửa về đó: 50 - 9,4 = 40,6 -> 41, vẫn cấp 2
  assert.equal(inf.xp, 41);
  assert.equal(levelOf(inf.xp), 2);
  // đúng mốc cấp thì pha loãng không kéo xuống dưới mốc
  const a = addUnit(s, 'human', 'infantry', 8, 5, 5); a.xp = LEVEL.xp[1];
  const m2 = addUnit(s, 'human', 'militia', 8, 7, 5); m2.xp = 0;
  mergeUnits(s, m2, a);
  assert.equal(a.xp, LEVEL.xp[1], 'cấp không tụt vì gộp');
  const big = addUnit(s, 'human', 'infantry', 1, 1, 10); big.xp = 20;
  splitUnit(s, big, 1, 2);
  assert.equal(s.units.find((u) => u.x === 1 && u.y === 2).xp, 0, 'phần tách ra là squad thường');
  assert.equal(big.xp, 20, 'squad gốc giữ xp');
});

import { rankIcon } from '../src/icons.js';
test('quân hàm: n vạch ^ chồng nhau, 0 cấp thì không vẽ', () => {
  assert.equal(rankIcon(0), '');
  const n = (k) => (rankIcon(k).match(/M/g) || []).length;
  assert.deepEqual([n(1), n(2), n(3)], [1, 2, 3]);
  assert.ok(!/#[0-9a-f]{3,6}|rgb/i.test(rankIcon(3)));
});

test('hạ trại: có hiệu lực ngay, cố định 15%/12%, giữ khi đứng yên, phá khi di chuyển', () => {
  const s = flat();
  const u = addUnit(s, 'human', 'infantry', 5, 5);
  addUnit(s, 'orc', 'infantry', 9, 9);
  const d0 = defensePct(s, u, 5, 5);
  assert.ok(canFortify(s, u));
  fortifyUnit(s, u);
  assert.equal(u.fort, 2, 'hiệu lực ngay lập tức');
  assert.equal(u.acted, true, 'hạ trại dùng hết lượt');
  assert.equal(Math.round(defensePct(s, u, 5, 5) - d0), FORTIFY.human, 'cộng đúng 15% trên đồng bằng');
  assert.ok(!canFortify(s, u), 'không hạ trại hai lần');
  endTurn(s);                       // pha địch: vẫn đang được bảo vệ
  assert.equal(u.fort, 2);
  endTurn(s);                       // lượt mình: giữ nguyên, không tự mất
  assert.equal(u.fort, 2);
  const keep = defensePct(s, u, 5, 5);
  waitUnit(s, u);
  assert.equal(u.fort, 2, 'đứng yên thì giữ trại');
  assert.equal(defensePct(s, u, 5, 5), keep);
  endTurn(s); endTurn(s);
  moveUnit(s, u, 6, 5);
  assert.equal(u.fort, 0, 'di chuyển thì mất trại');
  // orc thấp hơn người
  const so = flat();
  const o = addUnit(so, 'orc', 'infantry', 5, 5); addUnit(so, 'human', 'infantry', 9, 9);
  assert.ok(fortifyBonus(so, o) < fortifyBonus(so, addUnit(so, 'human', 'infantry', 6, 6)));
});

test('hạ trại: địch đánh ngay sau lệnh đã bị giảm sát thương', () => {
  const s = flat();
  const t = addUnit(s, 'human', 'infantry', 5, 5);
  const atk = addUnit(s, 'orc', 'infantry', 5, 6);
  const before = calcDamage(s, atk, t).raw;
  fortifyUnit(s, t);
  endTurn(s);                       // sang pha orc
  assert.ok(calcDamage(s, atk, t).raw < before, 'sát thương nhận vào giảm ngay trong pha địch kế tiếp');
});

test('hạ trại: mạnh hơn ở địa hình cộng thủ, yếu hơn ở địa hình trừ thủ; tấn công phá trại', () => {
  const s = flat({ '3,3': 'fort', '4,4': 'swamp' });
  const on = (x, y) => { const u = addUnit(s, 'human', 'infantry', x, y); u.fort = 2; return fortifyBonus(s, u); };
  const plain = on(8, 8), fort = on(3, 3), swamp = on(4, 4);
  assert.ok(fort > plain && plain > swamp, `${fort} > ${plain} > ${swamp}`);
  const a = addUnit(s, 'human', 'cavalry', 9, 9); a.fort = 2;
  attackUnit(s, a, addUnit(s, 'orc', 'militia', 9, 10));
  assert.equal(a.fort, 0, 'ra đòn thì phá trại');
});

test('mapgen: có ràng buộc thành phần địa hình, không nhốt thành, không dồn về một phía', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const m = generateMap(seed);
    const a = assess(m);
    assert.ok(a.ok, `seed ${seed}: ${a.reasons.join(', ')}`);
    assert.ok(a.comp.peak <= MAPGEN.maxPeakShare, 'núi cao quá nhiều');
    assert.ok(a.comp.rough <= MAPGEN.maxRoughShare, 'đồi núi quá nhiều');
    assert.ok(a.comp.forest >= MAPGEN.forestMin && a.comp.forest <= MAPGEN.forestMax, 'rừng lệch');
    assert.ok(a.side.human.open >= MAPGEN.minOpenNearHold && a.side.orc.open >= MAPGEN.minOpenNearHold, 'thành bị nhốt');
  }
});

test('mapgen: đầu cầu thông thoáng (không đầm lầy / đồi / núi / hầm mỏ kề cầu)', () => {
  const blockers = new Set(['swamp', 'hill', 'mountain', 'peak', 'mine']);
  let bridges = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const m = generateMap(seed);
    assert.ok(bridgeEndsClear(m), 'seed ' + seed);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (m.tiles[y * m.w + x] !== 'bridge') continue;
      bridges++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        assert.ok(!blockers.has(m.tiles[ny * m.w + nx]), `seed ${seed}: ${m.tiles[ny * m.w + nx]} kề cầu (${x},${y})`);
      }
    }
  }
  assert.ok(bridges > 100, 'phải thực sự có cầu để kiểm: ' + bridges);
});

import { MAP_SIZES, armySize, mapScale } from '../src/config.js';

test('cỡ bản đồ: khung dọc, quân tăng theo diện tích, mọi cỡ qua bộ lọc công bằng', () => {
  for (const [name, { w, h }] of Object.entries(MAP_SIZES)) {
    assert.ok(h > w, name + ' phải là khung dọc');
    for (let seed = 1; seed <= 25; seed++) {
      const m = generateMap(seed, w, h);
      assert.equal(m.w, w); assert.equal(m.h, h);
      assert.equal(m.spawns.human.length, armySize(w, h));
      assert.equal(m.spawns.orc.length, armySize(w, h));
      const a = assess(m);
      assert.ok(a.ok, `${name} seed ${seed}: ${a.reasons.join(', ')}`);
    }
  }
  assert.ok(armySize(24, 30) > armySize(16, 20) && armySize(32, 40) > armySize(24, 30));
  assert.equal(armySize(16, 20), 7);
  assert.deepEqual([MAP_SIZES.medium.w, MAP_SIZES.medium.h, MAP_SIZES.large.w, MAP_SIZES.large.h], [22, 28, 26, 36]);
});

test('nước ngẫu nhiên: có map không nước, có map rẽ nhánh/hồ, sông không luôn nằm giữa ngang', () => {
  let none = 0, some = 0; const centers = new Set(); const vertical = { v: 0 };
  for (let seed = 1; seed <= 120; seed++) {
    const m = generateMap(seed);
    const water = []; m.tiles.forEach((t, i) => { if (t === 'river' || t === 'bridge') water.push([i % m.w, Math.floor(i / m.w)]); });
    if (!water.length) { none++; continue; }
    some++;
    const ys = water.map((p) => p[1]), xs = water.map((p) => p[0]);
    centers.add(Math.round(ys.reduce((a, b) => a + b, 0) / ys.length));
    if (Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs)) vertical.v++;
  }
  assert.ok(none >= 120 * 0.1, 'phải có map không có nước: ' + none);
  assert.ok(some >= 120 * 0.5, 'đa số có nước');
  assert.ok(centers.size >= 6, 'vị trí nước phải đa dạng, thấy ' + centers.size + ' vị trí');
  assert.ok(vertical.v >= 10, 'phải có sông chạy dọc: ' + vertical.v);
});

test('cầu: không bao giờ nằm trơ giữa nước, mọi cầu có đất ở cả hai đầu (mọi cỡ)', () => {
  let bridges = 0;
  for (const { w, h } of Object.values(MAP_SIZES)) {
    for (let seed = 1; seed <= 80; seed++) {
      const m = generateMap(seed, w, h);
      assert.ok(bridgesValid(m), `cầu sai: ${w}x${h} seed ${seed}`);
      bridges += m.tiles.filter((t) => t === 'bridge').length;
    }
  }
  assert.ok(bridges > 300, 'phải thực sự có cầu để kiểm: ' + bridges);
});

test('cù lao: làng/tháp/mỏ chỉ tồn tại trên đất liền hoặc cù lao có cầu nối, không có công trình bị cô lập', () => {
  let islandsSeen = 0;
  for (const { w, h } of Object.values(MAP_SIZES)) {
    for (let seed = 1; seed <= 80; seed++) {
      const m = generateMap(seed, w, h);
      const pass = (x, y) => x >= 0 && y >= 0 && x < w && y < h && isFinite(TERRAIN[m.tiles[y * w + x]].cost);
      const seen = new Set(), start = m.strongholds.human; const q = [[start.x, start.y]]; seen.add(start.x + ',' + start.y);
      while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; const k = nx + ',' + ny; if (pass(nx, ny) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); } } }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const t = m.tiles[y * w + x];
        if (['village', 'fort', 'mine'].includes(t)) assert.ok(seen.has(x + ',' + y), `${t} bị cô lập tại ${x},${y} (${w}x${h} seed ${seed})`);
        if (pass(x, y) && !seen.has(x + ',' + y)) islandsSeen++;
      }
    }
  }
  assert.ok(islandsSeen > 0, 'phải có cù lao hoang trong tập mẫu (đất đi được nhưng không nối)');
});

import { icon, ICON_NAMES } from '../src/icons.js';

test('icon: mọi tên có hình, hình dùng currentColor (không hard-code màu), tên lạ thì rỗng', () => {
  assert.ok(ICON_NAMES.length >= 15);
  for (const n of ICON_NAMES) {
    const s = icon(n);
    assert.ok(s.startsWith('<svg') && s.includes('<path d="'), n);
    assert.ok(!/#[0-9a-f]{3,6}|rgb/i.test(s), n + ' không được chứa màu cố định');
  }
  assert.equal(icon('khong-ton-tai'), '');
});

import fs from 'node:fs';

test('giao diện không dùng emoji hay ký tự trang trí rời (chỉ dùng bộ icon SVG)', () => {
  const bad = /[\u2190-\u21ff\u2300-\u23ff\u25a0-\u27bf\u2b00-\u2bff\u{1F300}-\u{1FAFF}]/u;
  for (const file of ['index.html', 'lang/vi.json', 'lang/en.json', 'src/game.js', 'src/main.js']) {
    fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8').split('\n').forEach((l, i) => {
      if (l.trim().startsWith('//')) return;
      assert.ok(!bad.test(l), `${file}:${i + 1} có ký tự trang trí: ${l.trim().slice(0, 70)}`);
    });
  }
});

// ---------- Nhiệm vụ ----------
import { createMissionState, MISSION_TYPES } from '../src/missions.js';
import { checkVictory, canCapture, canMerge } from '../src/rules.js';
import { planNextAction } from '../src/ai.js';
import { executeAction } from '../src/actions.js';

const mmap = () => generateMap(5, 16, 20);

test('nhiệm vụ: mọi loại dựng được, có đủ thông số, skirmish giữ luật cũ', () => {
  assert.deepEqual(MISSION_TYPES.sort(), ['destroy', 'escort', 'hold', 'skirmish']);
  const sk = createMissionState(mmap(), 'skirmish');
  assert.equal(sk.mission.type, 'skirmish');
  assert.ok(canCapture(sk, 'human') && canCapture(sk, 'orc'));
  const h = createMissionState(mmap(), 'hold');
  assert.equal(h.mission.defender, 'human');
  assert.ok(h.units.filter((u) => u.faction === 'orc').length > h.units.filter((u) => u.faction === 'human').length, 'bên tấn công đông hơn');
  assert.ok(!canCapture(h, 'human') && canCapture(h, 'orc'), 'chỉ bên tấn công chiếm thành');
  const d = createMissionState(mmap(), 'destroy');
  const tgt = d.units.find((u) => u.id === d.mission.targetId);
  assert.ok(tgt && tgt.static && tgt.faction === 'orc' && tgt.acted);
  const e = createMissionState(mmap(), 'escort');
  assert.ok(e.units.find((u) => u.id === e.mission.vipId).vip);
  assert.ok(!canCapture(e, 'human') && !canCapture(e, 'orc'));
});

test('cố thủ: hết số vòng thì bên giữ thắng, thành bị chiếm thì bên tấn công thắng', () => {
  const s = createMissionState(mmap(), 'hold');
  s.turn = s.mission.turns;
  endTurn(s); endTurn(s);                       // sang vòng turns+1
  assert.equal(s.winner, 'human');
  assert.equal(s.winReason, 'survive');
  const c = createMissionState(mmap(), 'hold');
  const hold = c.map.strongholds.human;
  c.units = c.units.filter((u) => !(u.x === hold.x && u.y === hold.y));
  const orc = c.units.find((u) => u.faction === 'orc');
  orc.x = hold.x; orc.y = hold.y;
  endTurn(c);                                    // sang lượt orc: tiến độ chiếm 1
  endTurn(c); endTurn(c);                        // orc đứng yên, tới lượt orc lần nữa
  assert.equal(c.winner, 'orc');
  assert.equal(c.winReason, 'capture');
});

test('phá công trình: đánh được, không đánh trả, không gây ZOC, hạ xong là bên tấn công thắng', () => {
  const s = createMissionState(mmap(), 'destroy');
  const tgt = s.units.find((u) => u.id === s.mission.targetId);
  // đặt một squad người sát công trình
  const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: tgt.x + dx, y: tgt.y + dy }))
    .find((p) => !s.units.some((u) => u.x === p.x && u.y === p.y));
  const a = s.units.find((u) => u.faction === 'human' && u.role === 'infantry');
  a.x = free.x; a.y = free.y; a.acted = false;
  const before = tgt.strength;
  const ev = attackUnit(s, a, tgt);
  assert.ok(tgt.strength < before, 'công trình mất máu');
  assert.ok(!ev.some((e) => e.type === 'counter'), 'không đánh trả');
  assert.equal(tgt.status, 'ok', 'không bỏ chạy');
  assert.equal(levelOf(tgt.xp), 0);
  // hạ nốt
  tgt.strength = 1; a.acted = false;
  attackUnit(s, a, tgt);
  assert.equal(s.winner, 'human');
  assert.equal(s.winReason, 'destroyed');
});

test('phá công trình: hết hạn mà chưa phá được thì bên giữ thắng', () => {
  const s = createMissionState(mmap(), 'destroy');
  s.turn = s.mission.turns;
  endTurn(s); endTurn(s);
  assert.equal(s.winner, 'orc');
  assert.equal(s.winReason, 'time');
});

test('hộ tống: tướng tới đích thì thắng, tướng chết thì thua, tướng không bị gộp mất', () => {
  const s = createMissionState(mmap(), 'escort');
  const vip = s.units.find((u) => u.id === s.mission.vipId);
  const other = s.units.find((u) => u.faction === 'human' && u.id !== vip.id && u.role === 'infantry');
  vip.strength = 3; other.strength = 3;
  assert.ok(!canMerge(vip, other), 'tướng không bị gộp vào squad khác');
  vip.x = s.mission.goal.x; vip.y = s.mission.goal.y;
  checkVictory(s);
  assert.equal(s.winner, 'human');
  assert.equal(s.winReason, 'vip_arrived');

  const d = createMissionState(mmap(), 'escort');
  const v2 = d.units.find((u) => u.id === d.mission.vipId);
  v2.strength = 1;
  const foe = d.units.find((u) => u.faction === 'orc');
  foe.x = v2.x; foe.y = v2.y - 1;
  attackUnit(d, foe, v2);
  assert.equal(d.winner, 'orc');
  assert.equal(d.winReason, 'vip_dead');
});

test('AI chơi hết các nhiệm vụ mà không treo, luôn ra kết quả hợp lệ', () => {
  for (const type of ['hold', 'destroy', 'escort']) {
    const s = createMissionState(mmap(), type);
    let guard = 0;
    while (!s.winner && s.turn <= 40 && guard++ < 3000) {
      let a, g2 = 0;
      while (!s.winner && (a = planNextAction(s, 'tactical')) && g2++ < 200) executeAction(s, a);
      endTurn(s);
    }
    assert.ok(s.winner, type + ' phải có người thắng trong 40 vòng');
    assert.ok(s.winReason, type);
  }
});

test('cố thủ: đợt tiếp viện xuất hiện đúng vòng, đúng phe, đúng một lần', () => {
  const s = createMissionState(mmap(), 'hold');
  const wave = s.mission.waves[0];
  assert.ok(s.mission.waves.length >= 1 && wave.faction === 'orc' && !wave.done);
  const count = () => s.units.filter((u) => u.faction === 'orc').length;
  const n0 = count();
  let seen = 0;
  for (let i = 0; i < 2 * (wave.at + 1) && !s.winner; i++) {
    const before = count();
    const ev = endTurn(s);
    if (ev.some((e) => e.type === 'reinforce')) { seen++; assert.equal(s.turn, wave.at); assert.ok(count() > before); }
  }
  assert.ok(wave.done);
  assert.ok(seen >= 1 && count() >= n0, 'có tiếp viện');
  const waveCount = s.mission.waves.filter((w) => w.done).length;
  assert.ok(waveCount <= s.mission.waves.length);
});
