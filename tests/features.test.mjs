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
  assert.ok(canCapture(h, 'human') && canCapture(h, 'orc'), 'cố thủ: ai chiếm được thành đối phương cũng thắng');
  assert.ok(h.mission.waves.some((w) => w.faction === 'human') && h.mission.waves.some((w) => w.faction === 'orc'), 'cả hai bên có tiếp viện');
  const d = createMissionState(mmap(), 'destroy');
  for (const f of ['human', 'orc']) {
    const t = d.units.find((u) => u.id === d.mission.targets[f]);
    const hold = d.map.strongholds[f];
    assert.ok(t && t.static && t.faction === f && t.x === hold.x && t.y === hold.y, 'trại ' + f + ' là mục tiêu tĩnh');
    assert.equal(d.map.tiles[hold.y * d.map.w + hold.x], 'plain', 'không còn thành');
  }
  assert.ok(!canCapture(d, 'human') && !canCapture(d, 'orc'), 'phá trại: không chiếm đóng');
  const e = createMissionState(mmap(), 'escort');
  assert.ok(e.units.find((u) => u.id === e.mission.vipId).vip);
  assert.ok(!canCapture(e, 'human') && !canCapture(e, 'orc'));
  for (const f of ['human', 'orc']) {
    const hs = e.map.strongholds[f];
    assert.equal(e.map.tiles[hs.y * e.map.w + hs.x], 'plain', 'hộ tống: không có thành');
  }
  assert.ok(!e.mission.turns, 'hộ tống không hạn giờ');
});

test('cố thủ: hết số lượt thì bên giữ thắng; bên nào chiếm thành đối phương 2 lượt cũng thắng', () => {
  const s = createMissionState(mmap(), 'hold');
  s.turn = s.mission.turns;
  endTurn(s); endTurn(s);
  assert.equal(s.winner, 'human');
  assert.equal(s.winReason, 'survive');
  const c = createMissionState(mmap(), 'hold');
  const hold = c.map.strongholds.human;
  c.units = c.units.filter((u) => !(u.x === hold.x && u.y === hold.y));
  const orc = c.units.find((u) => u.faction === 'orc');
  orc.x = hold.x; orc.y = hold.y;
  endTurn(c); endTurn(c); endTurn(c);
  assert.equal(c.winner, 'orc');
  assert.equal(c.winReason, 'capture');
  // phe người chiếm thành orc cũng thắng
  const p = createMissionState(mmap(), 'hold');
  const oh = p.map.strongholds.orc;
  p.units = p.units.filter((u) => !(u.x === oh.x && u.y === oh.y));
  const mine = p.units.find((u) => u.faction === 'human');
  mine.x = oh.x; mine.y = oh.y;
  endTurn(p); endTurn(p); endTurn(p); endTurn(p);
  assert.equal(p.winner, 'human');
  assert.equal(p.winReason, 'capture');
});

test('phá trại: quân sát trại nhà hồi quân, quân xa thì không', () => {
  const s = createMissionState(mmap(), 'destroy');
  const camp = s.units.find((u) => u.id === s.mission.targets.human);
  const mine = s.units.filter((u) => u.faction === 'human' && !u.static);
  const near = mine[0], far = mine[1];
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: camp.x + dx, y: camp.y + dy })).find((p) => !s.units.some((u) => u.x === p.x && u.y === p.y));
  near.x = spot.x; near.y = spot.y; near.strength = 5;
  far.x = 0; far.y = 0; far.strength = 5;
  endTurn(s); endTurn(s);                    // tới đầu lượt phe người
  assert.equal(near.strength, 5 + CONFIG.healStronghold);
  assert.equal(far.strength, 5);
});

test('phá trại: đánh được trại, không đánh trả, không gây ZOC; phá thành địch thắng, thành mình bị phá thì thua', () => {
  const s = createMissionState(mmap(), 'destroy');
  const tgt = s.units.find((u) => u.id === s.mission.targets.orc);
  const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: tgt.x + dx, y: tgt.y + dy }))
    .find((p) => !s.units.some((u) => u.x === p.x && u.y === p.y));
  const a = s.units.find((u) => u.faction === 'human' && u.role === 'infantry');
  a.x = free.x; a.y = free.y; a.acted = false;
  const before = tgt.strength;
  const ev = attackUnit(s, a, tgt);
  assert.ok(tgt.strength < before, 'thành mất máu');
  assert.ok(!ev.some((e) => e.type === 'counter'), 'không đánh trả');
  assert.equal(tgt.status, 'ok', 'không bỏ chạy');
  tgt.strength = 1; a.acted = false;
  attackUnit(s, a, tgt);
  assert.equal(s.winner, 'human');
  assert.equal(s.winReason, 'destroyed');

  const r = createMissionState(mmap(), 'destroy');
  const mine = r.units.find((u) => u.id === r.mission.targets.human);
  const foe = r.units.find((u) => u.faction === 'orc' && u.role === 'infantry');
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: mine.x + dx, y: mine.y + dy }))
    .find((p) => !r.units.some((u) => u.x === p.x && u.y === p.y));
  foe.x = spot.x; foe.y = spot.y; mine.strength = 1;
  attackUnit(r, foe, mine);
  assert.equal(r.winner, 'orc');
  assert.equal(r.winReason, 'destroyed');
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
    if (ev.some((e) => e.type === 'reinforce' && e.faction === 'orc')) { seen++; assert.equal(s.turn, wave.at); assert.ok(count() > before); }
  }
  assert.ok(wave.done);
  assert.ok(seen >= 1 && count() >= n0, 'có tiếp viện');
  const waveCount = s.mission.waves.filter((w) => w.done).length;
  assert.ok(waveCount <= s.mission.waves.length);
});

// ---------- Sĩ khí và bỏ chạy ----------
import { moraleState, fleePlan, rearEdgeY } from '../src/rules.js';
import { MORALE, FACTIONS } from '../src/config.js';

test('sĩ khí: bốn mức theo ngưỡng của từng phe (Orc dải "vững" hẹp hơn người)', () => {
  const s = flat();
  const h = addUnit(s, 'human', 'infantry', 3, 3), o = addUnit(s, 'orc', 'infantry', 7, 3);
  const at = (u, m) => { u.morale = m; u.status = 'ok'; return moraleState(u); };
  const R = FACTIONS.human.routAt, Ro = FACTIONS.orc.routAt;
  assert.equal(at(h, 100), 'eager');
  assert.equal(at(h, MORALE.eagerAt), 'steady');
  assert.equal(at(h, R + MORALE.waverMargin + 1), 'steady');
  assert.equal(at(h, R + MORALE.waverMargin), 'wavering');
  assert.equal(at(h, R + 1), 'wavering');
  assert.equal(at(o, Ro + MORALE.waverMargin + 1), 'steady');
  assert.equal(at(o, Ro + MORALE.waverMargin), 'wavering');
  assert.ok(MORALE.eagerAt - (Ro + MORALE.waverMargin) < MORALE.eagerAt - (R + MORALE.waverMargin), 'dải vững của Orc hẹp hơn');
  h.morale = 10; h.status = 'routed';
  assert.equal(moraleState(h), 'routed');
});

test('sĩ khí đổi chỉ số: hăng hái đánh mạnh hơn, dao động đánh yếu và thủ kém hơn; có trong xem trước', () => {
  const s = flat();
  const a = addUnit(s, 'human', 'infantry', 5, 5), d = addUnit(s, 'orc', 'infantry', 5, 6);
  const dmg = (m) => { a.morale = m; return calcDamage(s, a, d).raw; };
  const eager = dmg(100), steady = dmg(60), waver = dmg(30);
  assert.ok(eager > steady && steady > waver, 'sát thương tăng theo sĩ khí');
  assert.ok(Math.abs(eager / steady - (1 + MORALE.eager.atk)) < 0.02, 'đúng hệ số trong config');
  d.morale = 100; const defHigh = defensePct(s, d, d.x, d.y);
  d.morale = FACTIONS.orc.routAt + 5; const defLow = defensePct(s, d, d.x, d.y);
  assert.equal(defHigh - defLow, -MORALE.wavering.def, 'dao động mất phòng thủ');
});

test('bỏ chạy: ưu tiên thành nhà gần, rồi hậu quân có tiếp viện, rồi ra khỏi map; kẹt thì đứng yên', () => {
  const mk = () => { const s = flat(); addUnit(s, 'orc', 'infantry', 10, 0); return s; };
  // 1. thành nhà trong 2 lượt đi
  let s = mk(); let u = addUnit(s, 'human', 'infantry', 5, 5); u.status = 'routed';
  assert.equal(fleePlan(s, u).kind, 'home');
  // 2. xa thành, có squad ở phía sau -> hậu quân
  s = mk(); u = addUnit(s, 'human', 'infantry', 5, 1); u.status = 'routed';
  const ally = addUnit(s, 'human', 'infantry', 5, 7);
  let p = fleePlan(s, u);
  assert.equal(p.kind, 'rear'); assert.deepEqual(p.dest, { x: 5, y: 7 });
  // squad cùng phe cũng đang bỏ chạy, hoặc ở phía trước, thì không phải hậu quân
  ally.status = 'routed';
  assert.equal(fleePlan(s, u).kind, 'exit');
  ally.status = 'ok'; ally.y = 0; ally.x = 0;
  assert.equal(fleePlan(s, u).kind, 'exit', 'đồng đội ở phía trước không tính');
  // 3. ra khỏi map qua mép sau lưng
  p = fleePlan(s, u);
  assert.equal(p.dest.y, rearEdgeY(s, 'human'));
  assert.equal(rearEdgeY(s, 'orc'), 0);
  // tướng không bao giờ rời trận
  u.vip = true;
  assert.equal(fleePlan(s, u).kind, 'none');
  // thành đã bị địch chiếm thì không chạy về
  s = mk(); u = addUnit(s, 'human', 'infantry', 5, 9); u.status = 'routed';
  s.units = s.units.filter((x) => x.id !== u.id || true);
  const e = addUnit(s, 'orc', 'infantry', 5, 11);
  assert.notEqual(fleePlan(s, u).kind, 'home');
  // kẹt: bốn phía là núi cao
  s = flat({ '5,4': 'peak', '4,5': 'peak', '6,5': 'peak', '5,6': 'peak' }); addUnit(s, 'orc', 'infantry', 10, 0);
  u = addUnit(s, 'human', 'infantry', 5, 5); u.status = 'routed';
  assert.equal(fleePlan(s, u).kind, 'none');
});

// bản đồ phẳng mà thành nhà lệch khỏi đường thoát về mép sau (để kiểm tra nhánh "ra khỏi map")
function flatSide() {
  const w = 12, h = 12;
  const s = createState({ w, h, tiles: new Array(w * h).fill('plain'), strongholds: { human: { x: 11, y: 6 }, orc: { x: 11, y: 0 } }, spawns: { human: [], orc: [] } });
  addUnit(s, 'orc', 'infantry', 8, 0);
  return s;
}

test('bỏ chạy: chạy theo kế hoạch mỗi lượt, tới mép thì rời map, không tính là chết, elite bị giáng 1 cấp', () => {
  const s = flatSide();
  const u = addUnit(s, 'human', 'infantry', 0, 2); u.status = 'routed'; u.morale = 0; u.xp = LEVEL.xp[1] + 3;   // cấp 2
  const startLv = levelOf(u.xp); assert.equal(startLv, 2);
  const events = [];
  for (let i = 0; i < 12 && s.units.some((x) => x.id === u.id); i++) { endTurn(s); events.push(...endTurn(s)); }
  assert.ok(!s.units.some((x) => x.id === u.id), 'đã rời bản đồ');
  assert.ok(events.some((e) => e.type === 'escape' && e.levelBefore === 2 && e.levelAfter === 1));
  const rec = s.escaped[0];
  assert.equal(rec.id, u.id);
  assert.equal(levelOf(rec.xp), 1, 'bị giáng đúng 1 cấp');
  assert.equal(rec.xp, LEVEL.xp[0], 'xp về mốc của cấp thấp hơn');
  assert.ok(!s.units.some((x) => x.id === u.id) && s.units.filter((x) => x.faction === 'human').length === 0);
  assert.equal(s.winner, 'orc', 'hết quân trên bàn thì thua (elimination)');
});

test('bỏ chạy: cấp 1 giáng xuống 0, squad thường không mất gì; tới thành thì dừng lại ở đó', () => {
  const s = flatSide();
  const u = addUnit(s, 'human', 'infantry', 0, 2); u.status = 'routed'; u.morale = 0; u.xp = LEVEL.xp[0];
  const w = addUnit(s, 'human', 'infantry', 2, 2); w.status = 'routed'; w.morale = 0; w.xp = 3;
  for (let i = 0; i < 12; i++) { endTurn(s); endTurn(s); }
  const byId = (id) => s.escaped.find((e) => e.id === id);
  assert.equal(byId(u.id).xp, 0, 'cấp 1 -> 0');
  assert.equal(byId(w.id).xp, 3, 'chưa có cấp thì không bị trừ');
  const h = flat(); addUnit(h, 'orc', 'infantry', 10, 0);
  const near = addUnit(h, 'human', 'infantry', 5, 8); near.status = 'routed'; near.morale = 0;
  endTurn(h); endTurn(h);
  assert.deepEqual([near.x, near.y], [5, 11], 'chạy về tới thành');
  endTurn(h); endTurn(h);
  assert.deepEqual([near.x, near.y], [5, 11], 'về thành rồi thì ở lại');
  assert.ok(h.units.includes(near));
});

test('bỏ chạy: hồi tỉnh giữa đường thì ngừng chạy; phá trại thì chạy về ô kề trại nhà', () => {
  const s = flat(); addUnit(s, 'orc', 'infantry', 10, 0);
  const u = addUnit(s, 'human', 'infantry', 5, 1); u.status = 'routed'; u.morale = FACTIONS.human.routAt;
  endTurn(s); endTurn(s);
  assert.ok(u.y > 1, 'đã chạy đi');
  u.morale = 100;                                 // được cứu
  const y = u.y; endTurn(s);
  endTurn(s);
  assert.equal(u.status, 'ok', 'hồi tỉnh');
  assert.equal(u.y, y, 'không chạy tiếp');
  const d = createMissionState(mmap(), 'destroy');
  const camp = d.units.find((x) => x.id === d.mission.targets.human);
  const r = d.units.find((x) => x.faction === 'human' && !x.static);
  r.x = Math.min(d.map.w - 1, camp.x + 1); r.y = camp.y - 2 < 0 ? camp.y + 2 : camp.y - 2;
  r.status = 'routed';
  const p = fleePlan(d, r);
  assert.equal(p.kind, 'home');
  assert.equal(Math.abs(p.dest.x - camp.x) + Math.abs(p.dest.y - camp.y), 1, 'ô kề trại');
  const e = createMissionState(mmap(), 'escort');
  const v = e.units.find((x) => x.faction === 'orc');
  v.status = 'routed';
  assert.notEqual(fleePlan(e, v).kind, 'home', 'hộ tống không có thành để chạy về');
});

test('bỏ chạy: lưu và tải giữ danh sách squad đã rời trận', () => {
  const s = flatSide();
  const u = addUnit(s, 'human', 'infantry', 0, 2); u.status = 'routed'; u.morale = 0; u.xp = LEVEL.xp[0];
  for (let i = 0; i < 12; i++) { endTurn(s); endTurn(s); }
  assert.equal(s.escaped.length, 1);
  const r = restoreState(JSON.parse(JSON.stringify(snapshot(s))));
  assert.deepEqual(r.escaped, s.escaped);
});
import { snapshot, restoreState } from '../src/saves.js';

// ---------- Goblin ----------
import { placeGoblins } from '../src/mapgen.js';
import { GOBLIN } from '../src/config.js';
import { targetsFrom, inEnemyZoc, checkVictory as checkWin, pathTo } from '../src/rules.js';

test('goblin: đặt trong cụm rừng lớn, xa thành, không đè ô xuất phát, xác định theo bản đồ', () => {
  for (const [seed, w, h] of [[3, 16, 20], [9, 22, 28], [21, 26, 36]]) {
    const m = generateMap(seed, w, h);
    assert.deepEqual(placeGoblins(m), m.goblins, 'gọi lại ra y hệt');
    assert.ok(m.goblins.length <= GOBLIN.maxBands);
    for (const g of m.goblins) {
      assert.equal(m.tiles[g.y * m.w + g.x], 'forest');
      for (const f of ['human', 'orc']) {
        const hd = m.strongholds[f];
        assert.ok(Math.abs(hd.x - g.x) + Math.abs(hd.y - g.y) >= GOBLIN.minHoldDist);
      }
      assert.ok(![...m.spawns.human, ...m.spawns.orc].some((p) => p.x === g.x && p.y === g.y));
    }
    const s = createState(m);
    const gs = s.units.filter((u) => u.role === 'goblin');
    assert.equal(gs.length, m.goblins.length);
    assert.ok(gs.every((u) => u.faction === 'orc' && u.hidden && u.strength === GOBLIN.strength));
  }
});

// bản đồ phẳng, một ô rừng ở (5,5) có một toán goblin ẩn
function goblinMap() {
  const s = flat({ '5,5': 'forest' });
  const g = addUnit(s, 'orc', 'goblin', 5, 5, GOBLIN.strength); g.hidden = true;
  addUnit(s, 'orc', 'infantry', 10, 1);
  return { s, g };
}

test('goblin ẩn: quân người không thấy, không bị ZOC chặn, không nhắm bắn được', () => {
  const { s, g } = goblinMap();
  const a = addUnit(s, 'human', 'archer', 5, 8);
  assert.ok(!targetsFrom(s, a, 5, 7).some((e) => e.id === g.id), 'không nhắm được quân ẩn');
  assert.ok(!inEnemyZoc(s, 'human', 5, 6), 'quân ẩn không gây ZOC');
  const r = reachable(s, a);
  assert.ok(r.tiles.has(key(5, 6)) && r.tiles.has(key(5, 5)), 'đường và ô đứng tính như không có gì');
});

test('goblin phục kích: quân người đi vào ô kề thì bị chặn lại, goblin lộ diện và đánh ngay', () => {
  const { s, g } = goblinMap();
  const a = addUnit(s, 'human', 'cavalry', 3, 6);
  const node = reachable(s, a).tiles.get(key(7, 5));
  const path = pathTo(node);
  const first = path.findIndex((p, i) => i > 0 && (Math.abs(p.x - 5) + Math.abs(p.y - 5) <= 1));
  assert.ok(first > 0 && first < path.length - 1, 'đường đi ngang qua sát chỗ goblin');
  const ev = moveUnit(s, a, 7, 5);
  const stopAt = Math.abs(path[first].x - 5) + Math.abs(path[first].y - 5) === 0 ? path[first - 1] : path[first];
  assert.deepEqual([a.x, a.y], [stopAt.x, stopAt.y], 'dừng ở ô kề đầu tiên trên đường');
  assert.equal(g.hidden, false, 'goblin lộ diện');
  assert.ok(ev.some((e) => e.type === 'reveal' && e.ambush && e.unit === g.id));
  assert.ok(ev.some((e) => e.type === 'attack' && e.attacker === g.id && e.defender === a.id), 'goblin đánh trước');
  assert.ok(a.moved && !a.acted, 'quân bị phục kích vẫn còn ra đòn được');
  assert.ok(!ev.some((e) => e.type === 'counter'), 'bị bất ngờ nên không đánh trả');
  assert.ok(s.units.includes(g), 'goblin sống sót sau đòn phục kích');
  if (s.units.includes(g)) assert.ok(targetsFrom(s, a, a.x, a.y).some((e) => e.id === g.id), 'lộ diện rồi thì đánh trả được');
});

test('goblin: tự ra khỏi rừng hoặc ra đòn thì lộ diện; cuối lượt Orc trong rừng, vắng quân người thì ẩn lại', () => {
  const { s, g } = goblinMap();
  const h = addUnit(s, 'human', 'infantry', 9, 9);
  s.current = 'orc';
  const ev = moveUnit(s, g, 5, 8);                // ra đồng trống
  assert.ok(ev, 'goblin đi được');
  assert.equal(g.hidden, false, 'ra khỏi rừng thì lộ');
  g.x = 5; g.y = 5;
  endTurn(s);                                     // hết lượt Orc: trong rừng, không ai trong 2 ô -> ẩn
  assert.equal(g.hidden, true, 'ẩn lại');
  s.current = 'orc'; h.x = 5; h.y = 7; g.hidden = false;
  endTurn(s);
  assert.equal(g.hidden, false, 'có quân người trong 2 ô thì không ẩn được');
  const { s: s2, g: g2 } = goblinMap(); s2.current = 'orc';
  const v = addUnit(s2, 'human', 'militia', 5, 6);
  const ev2 = attackUnit(s2, g2, v);
  assert.equal(g2.hidden, false);
  assert.equal(ev2[0].type, 'reveal', 'lộ diện trước khi ra đòn');
});

test('goblin tiếp quân: squad Orc trong bán kính 2 hồi thêm 1 quân mỗi lượt, không cộng dồn, xa thì không', () => {
  const { s, g } = goblinMap();
  const g2 = addUnit(s, 'orc', 'goblin', 6, 5, 5); g2.hidden = true;
  const near = addUnit(s, 'orc', 'infantry', 5, 3, 5);     // cách goblin 2 ô
  const far = addUnit(s, 'orc', 'infantry', 9, 5, 5);
  s.current = 'human';
  endTurn(s);                                      // sang lượt Orc
  assert.equal(near.strength, 5 + GOBLIN.heal, 'hồi đúng 1, hai toán không cộng dồn');
  assert.equal(far.strength, 5);
  assert.equal(g.strength, GOBLIN.strength, 'goblin không tự hồi');
});

test('goblin là quân phụ: Orc hết quân chính thì thua dù goblin còn; goblin không chiếm thành', () => {
  const { s } = goblinMap();
  s.units = s.units.filter((u) => u.role === 'goblin');
  addUnit(s, 'human', 'infantry', 1, 10);
  checkWin(s);
  assert.equal(s.winner, 'human');
  assert.equal(s.winReason, 'elimination');
  const { s: c, g } = goblinMap();
  addUnit(c, 'human', 'infantry', 1, 10);
  const hold = c.map.strongholds.human;
  g.x = hold.x; g.y = hold.y; g.hidden = false;
  c.current = 'human'; endTurn(c); endTurn(c); endTurn(c); endTurn(c);
  assert.equal(c.capture.orc, 0, 'goblin đứng trên thành cũng không tính chiếm');
});

// ---------- Âm binh ----------
import { foeOf, statsOf, moraleState as mstate } from '../src/rules.js';
import { UNDEAD, STATS } from '../src/config.js';

const undeadGame = (type = 'skirmish') => createMissionState(generateMap(7, 16, 20), type, 'human', 'undead');

test('âm binh: trận người đấu âm binh có đúng hai phe, một necromancer, có cả gốc người và gốc Orc, không có Orc (chỉ goblin hoang)', () => {
  const s = undeadGame();
  assert.deepEqual(s.sides, ['human', 'undead']);
  assert.equal(foeOf(s, 'human'), 'undead');
  assert.ok(s.units.filter((u) => u.faction === 'orc').every((u) => u.role === 'goblin' && u.lair), 'không còn Orc, chỉ còn goblin hoang có hang');
  const und = s.units.filter((u) => u.faction === 'undead');
  assert.equal(und.filter((u) => u.role === 'necromancer').length, 1);
  assert.ok(und.some((u) => u.origin === 'human') && und.some((u) => u.origin === 'orc'));
  const human = s.units.filter((u) => u.faction === 'human');
  assert.equal(und.length, human.length + UNDEAD.extra + 1, 'đông hơn: thêm squad + necromancer');
});

test('âm binh: chỉ số lấy từ phe gốc, sát thương theo UNDEAD.atkMul, chậm hơn 1 ô', () => {
  const s = undeadGame();
  for (const o of ['human', 'orc']) {
    const u = s.units.find((x) => x.faction === 'undead' && x.origin === o && x.role === 'infantry')
      || addUnit(s, 'undead', 'infantry', 0, 0);
    u.origin = o;
    const st = statsOf(u), live = STATS[o].infantry;
    assert.ok(Math.abs(st.atk - live.atk * UNDEAD.atkMul) < 1e-9);
    assert.equal(st.move, live.move - UNDEAD.moveLoss);
    assert.equal(st.def, live.def);
  }
});

test('âm binh: không có sĩ khí, không bỏ chạy dù bị đánh tơi tả', () => {
  const s = flat(); s.sides = ['human', 'undead'];
  const z = addUnit(s, 'undead', 'infantry', 5, 5); z.origin = 'human';
  addUnit(s, 'undead', 'necromancer', 0, 0);
  const a = addUnit(s, 'human', 'cavalry', 5, 6);
  z.strength = 3; z.morale = 0;
  attackUnit(s, a, z);
  assert.notEqual(z.status, 'routed');
  assert.equal(mstate(z), 'steady');
});

test('âm binh: necromancer chết thì cả đạo quân đổ sụp, bên kia thắng', () => {
  const s = undeadGame();
  const n = s.units.find((u) => u.role === 'necromancer');
  const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: n.x + dx, y: n.y + dy }))
    .find((p) => p.x >= 0 && p.y >= 0 && p.x < s.map.w && p.y < s.map.h && !s.units.some((u) => u.x === p.x && u.y === p.y));
  const a = s.units.find((u) => u.faction === 'human' && u.role === 'cavalry');
  a.x = spot.x; a.y = spot.y; n.strength = 1;
  const ev = attackUnit(s, a, n);
  assert.ok(ev.some((e) => e.type === 'collapse'));
  assert.ok(!s.units.some((u) => u.faction === 'undead'));
  assert.equal(s.winner, 'human');
  assert.equal(s.winReason, 'necromancer');
});

test('âm binh: mọi nhiệm vụ chạy được với âm binh, AI đánh tới cùng, lưu/tải giữ phe gốc', () => {
  for (const type of ['skirmish', 'hold', 'destroy', 'escort']) {
    const s = undeadGame(type);
    assert.deepEqual(s.sides, ['human', 'undead'], type);
    let g = 0;
    while (!s.winner && s.turn <= 40 && g++ < 3000) {
      let a, g2 = 0;
      while (!s.winner && (a = planNextAction(s, 'tactical')) && g2++ < 200) executeAction(s, a);
      endTurn(s);
    }
    assert.ok(s.winner, type);
  }
  const s = undeadGame();
  const r = restoreState(JSON.parse(JSON.stringify(snapshot(s))));
  assert.deepEqual(r.sides, ['human', 'undead']);
  assert.deepEqual(r.units.map((u) => u.origin), s.units.map((u) => u.origin));
});

// ---------- Mộ tử sĩ: necromancer triệu hồi xác quân địch ----------
import { graveAt, graveWait, canBury, buryGrave } from '../src/rules.js';

// bản đồ phẳng người đấu âm binh, xoá quân mặc định để tự đặt
// ---------- Goblin hoang (trận âm binh) ----------
function wildMap() {
  const w = 12, h = 16;
  const tiles = new Array(w * h).fill('plain');
  for (let y = 6; y <= 8; y++) for (let x = 3; x <= 6; x++) tiles[y * w + x] = 'forest';   // cụm rừng 4×3
  const s = createState({ w, h, tiles, strongholds: { human: { x: 5, y: 15 }, undead: { x: 6, y: 0 } }, spawns: { human: [], undead: [] } });
  s.units = [];
  addUnit(s, 'undead', 'necromancer', 11, 0);
  addUnit(s, 'human', 'infantry', 11, 15);
  const g = addUnit(s, 'orc', 'goblin', 4, 7, GOBLIN.strength); g.hidden = true; g.lair = { x: 4, y: 7 };
  return { s, g };
}

test('goblin hoang: tỉ lệ như thú dữ, ván có ván không; toán nào cũng có hang trong rừng', () => {
  let none = 0, some = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const s = createMissionState(generateMap(seed, 16, 20), 'skirmish', 'human', 'undead');
    const g = s.units.filter((u) => u.role === 'goblin');
    if (g.length) some++; else none++;
    for (const u of g) assert.ok(u.hidden && u.lair && s.map.tiles[u.lair.y * s.map.w + u.lair.x] === 'forest');
  }
  assert.ok(none > 0 && some > 0, `có ván không gặp (${none}) và có ván gặp (${some})`);
  const o = createMissionState(generateMap(3, 16, 20), 'skirmish', 'human', 'orc');
  assert.ok(o.units.filter((u) => u.role === 'goblin').every((u) => !u.lair), 'trận Orc: goblin vẫn theo Orc');
});

test('goblin hoang: cuối lượt âm binh đánh úp xác đứng trong rừng của nó (không bị đánh trả)', () => {
  const { s, g } = wildMap();
  const z = addUnit(s, 'undead', 'infantry', 6, 6); z.origin = 'human';
  s.current = 'undead';
  const before = z.strength, gs = g.strength;
  const ev = endTurn(s);
  assert.ok(ev.some((e) => e.type === 'attack' && e.attacker === g.id && e.defender === z.id && e.surprise));
  assert.ok(z.strength < before, 'âm binh mất quân');
  assert.equal(g.strength, gs, 'đòn phục kích không bị đánh trả');
  assert.ok(s.map.tiles[g.y * s.map.w + g.x] === 'forest', 'goblin vẫn trong rừng nhà');
});

test('goblin hoang: đánh cả quân người trong rừng; quân đứng ngoài rừng (không kề) thì yên', () => {
  const { s, g } = wildMap();
  const out = addUnit(s, 'human', 'archer', 8, 7);        // đồng bằng, cách rừng 2 ô
  let ev = endTurn(s);                                     // hết lượt người
  assert.ok(!ev.some((e) => e.type === 'attack' && e.attacker === g.id), 'không ra khỏi rừng để đánh');
  assert.ok(g.hidden, 'vẫn ẩn');
  endTurn(s);                                              // hết lượt âm binh
  const inn = addUnit(s, 'human', 'archer', 3, 6);
  ev = endTurn(s);
  assert.ok(ev.some((e) => e.type === 'attack' && e.attacker === g.id && e.defender === inn.id), 'đánh quân người vào rừng');
  assert.ok(!ev.some((e) => e.type === 'attack' && e.defender === out.id));
});

test('goblin hoang: không ai trong rừng thì ẩn lại; không bị tính là quân của phe nào', () => {
  const { s, g } = wildMap();
  g.hidden = false;
  endTurn(s);
  assert.ok(g.hidden, 'ẩn lại');
  s.units = s.units.filter((u) => u.faction !== 'undead');
  checkVictory(s);
  assert.equal(s.winner, 'human', 'hết âm binh là thắng, goblin không giữ trận cho ai');
});

function graveMap() {
  const w = 12, h = 16;
  const s = createState({ w, h, tiles: new Array(w * h).fill('plain'), strongholds: { human: { x: 5, y: 15 }, undead: { x: 6, y: 0 } }, spawns: { human: [], undead: [] } });
  s.units = [];
  return s;
}
// đẩy tới đầu lượt âm binh của lượt t
function toUndeadTurn(s, t) {
  let g = 0;
  while (!(s.current === 'undead' && s.turn === t) && g++ < 20) endTurn(s);
}

test('mộ tử sĩ: quân phe sống chết thì để lại mộ; âm binh chết thì tan hẳn; trận người - Orc không có mộ', () => {
  const s = graveMap();
  addUnit(s, 'undead', 'necromancer', 6, 1);
  const v = addUnit(s, 'human', 'archer', 5, 8); v.strength = 1;
  const z = addUnit(s, 'undead', 'infantry', 5, 7); z.origin = 'orc';
  const ev = attackUnit(s, z, v);
  assert.ok(ev.some((e) => e.type === 'grave'), 'có sự kiện đào mộ');
  const g = graveAt(s, 5, 8);
  assert.ok(g && g.faction === 'human' && g.role === 'archer' && g.turn === 1);
  const h = addUnit(s, 'human', 'cavalry', 4, 7); z.strength = 1;
  attackUnit(s, h, z);
  assert.ok(!graveAt(s, 5, 7), 'âm binh chết không để lại mộ');
  const o = flat(); const a = addUnit(o, 'human', 'cavalry', 5, 5); const d = addUnit(o, 'orc', 'militia', 5, 6); d.strength = 1;
  attackUnit(o, a, d);
  assert.equal((o.graves || []).length, 0, 'không có âm binh thì không có mộ');
});

test('mộ tử sĩ: trong vùng ếm của necromancer dậy sau raiseDelay lượt, ngoài vùng sau raiseDelayFar lượt, ô trống mới dậy', () => {
  const s = graveMap();
  const R = UNDEAD.raiseRadius, yIn = 1 + R, yOut = 2 + R;
  addUnit(s, 'undead', 'necromancer', 6, 1);
  addUnit(s, 'human', 'militia', 0, 15);                     // còn quân người để ván chưa kết thúc
  s.graves.push({ x: 6, y: yIn, faction: 'human', role: 'cavalry', turn: 1 });                // đúng mép vùng ếm
  s.graves.push({ x: 6, y: yOut, faction: 'human', role: 'infantry', turn: 1 });              // ngoài vùng: chậm hơn
  s.graves.push({ x: 3, y: 4, faction: 'human', role: 'archer', turn: 1 });                   // trong vùng nhưng bị chặn
  const blocker = addUnit(s, 'undead', 'militia', 3, 4); blocker.origin = 'orc';
  toUndeadTurn(s, 2);
  assert.equal(s.units.filter((u) => u.x === 6 && u.y === yIn).length, 0, 'chưa đủ lượt thì chưa dậy');
  assert.equal(graveWait(s, graveAt(s, 6, yIn)), UNDEAD.raiseDelay - 1);
  assert.equal(graveWait(s, graveAt(s, 6, yOut)), UNDEAD.raiseDelayFar - 1);
  endTurn(s); const ev = endTurn(s);                         // sang đầu lượt âm binh của lượt 3
  assert.equal(s.current, 'undead'); assert.equal(s.turn, 3);
  const r = s.units.find((u) => u.x === 6 && u.y === yIn);
  assert.ok(r, 'trỗi dậy');
  assert.equal(r.faction, 'undead'); assert.equal(r.role, 'cavalry'); assert.equal(r.origin, 'human');
  assert.equal(r.strength, Math.round(CONFIG.maxStrength * UNDEAD.raiseStrength));
  assert.ok(ev.some((e) => e.type === 'rise' && e.unit === r.id));
  assert.ok(!r.acted && !r.moved, 'trỗi dậy đầu lượt thì hành động được ngay');
  assert.ok(!graveAt(s, 6, yIn), 'mộ đã dậy thì mất');
  assert.ok(graveAt(s, 6, yOut), 'ngoài vùng ếm: chưa tới lượt');
  assert.ok(graveAt(s, 3, 4), 'ô có quân đứng: chưa dậy');
  blocker.x = 0; blocker.y = 0;
  endTurn(s); endTurn(s);
  assert.ok(s.units.some((u) => u.x === 3 && u.y === 4 && u.faction === 'undead' && u.role === 'archer'), 'ô trống lại thì dậy');
  while (s.turn < 1 + UNDEAD.raiseDelayFar) { endTurn(s); endTurn(s); }
  assert.ok(s.units.some((u) => u.x === 6 && u.y === yOut && u.faction === 'undead'), 'ngoài vùng ếm vẫn dậy, chậm hơn');
});

test('mộ tử sĩ: an táng mất lượt của squad, được làm sau khi đi, chặn trỗi dậy; âm binh không an táng', () => {
  const s = graveMap();
  addUnit(s, 'undead', 'necromancer', 6, 1);
  s.graves.push({ x: 5, y: 8, faction: 'human', role: 'infantry', turn: 1 });
  const u = addUnit(s, 'human', 'militia', 5, 11);
  assert.ok(!canBury(s, u), 'xa mộ thì không');
  moveUnit(s, u, 5, 9);
  assert.ok(canBury(s, u), 'đi tới cạnh mộ rồi vẫn an táng được');
  const ev = buryGrave(s, u);
  assert.ok(ev && ev[0].type === 'bury');
  assert.ok(!graveAt(s, 5, 8));
  assert.ok(u.acted && u.moved, 'mất lượt');
  s.graves.push({ x: 2, y: 2, faction: 'human', role: 'militia', turn: 1 });
  const z = addUnit(s, 'undead', 'infantry', 2, 3); z.origin = 'orc';
  assert.ok(!canBury(s, z), 'âm binh không an táng');
  const done = addUnit(s, 'human', 'archer', 1, 2); done.acted = true;
  assert.ok(!canBury(s, done), 'đã ra đòn thì không còn lượt để an táng');
});

test('mộ tử sĩ: âm binh trỗi dậy chết lần nữa thì tan hẳn; lưu/tải giữ mộ, bỏ mộ hỏng', () => {
  const s = graveMap();
  addUnit(s, 'undead', 'necromancer', 6, 1);
  addUnit(s, 'human', 'militia', 0, 15);
  s.graves.push({ x: 6, y: 5, faction: 'human', role: 'militia', turn: 1 });
  toUndeadTurn(s, 3);
  const r = s.units.find((u) => u.x === 6 && u.y === 5 && u.faction === 'undead');
  assert.ok(r);
  const k = addUnit(s, 'human', 'cavalry', 6, 6); r.strength = 1;
  attackUnit(s, k, r);
  assert.ok(!graveAt(s, 6, 5), 'không có mộ thứ hai');
  s.graves.push({ x: 1, y: 1, faction: 'human', role: 'archer', turn: 2 });
  const snap = JSON.parse(JSON.stringify(snapshot(s)));
  snap.state.graves.push({ x: 99, y: 1, faction: 'human', role: 'archer', turn: 1 }, { x: 1, y: 2, faction: 'undead', role: 'archer', turn: 1 }, { x: 1, y: 3, faction: 'human', role: 'necromancer', turn: 1 });
  const back = restoreState(snap);
  assert.deepEqual(back.graves, [{ x: 1, y: 1, faction: 'human', role: 'archer', turn: 2 }]);
});

// ---------- Cố thủ trước âm binh: tiếp viện bọc sườn ----------
import { MISSIONS } from '../src/config.js';

test('cố thủ: tiếp viện âm binh có cờ ở mép bản đồ bên hông thành, sớm và đông hơn; Orc giữ đợt thường', () => {
  for (const size of [[16, 20], [22, 28], [26, 36]]) {
    const s = createMissionState(generateMap(5, size[0], size[1]), 'hold', 'human', 'undead');
    const hold = s.map.strongholds.human;
    const att = s.mission.waves.filter((w) => w.faction === 'undead');
    assert.equal(att.length, 2);
    for (const w of att) {
      assert.ok(w.spot, 'có điểm cờ ' + size);
      assert.ok(w.spot.x === 0 || w.spot.x === s.map.w - 1, 'ở mép trái / phải');
      assert.ok(Math.abs(w.spot.y - hold.y) <= MISSIONS.hold.flankRows, 'ngang tầm thành');
      assert.ok(Math.abs(w.spot.x - hold.x) + Math.abs(w.spot.y - hold.y) >= MISSIONS.hold.flankMinDist, 'không sát thành');
      assert.equal(w.n, 2);
    }
    assert.notEqual(att[0].spot.x, att[1].spot.x, 'hai đợt ở hai bên');
    const orcFirst = createMissionState(generateMap(5, size[0], size[1]), 'hold', 'human', 'orc').mission.waves.find((w) => w.faction === 'orc');
    assert.ok(att[0].at < orcFirst.at, 'sớm hơn đợt thường cùng bản đồ');
  }
  const o = createMissionState(generateMap(5, 16, 20), 'hold', 'human', 'orc');
  const ow = o.mission.waves.filter((w) => w.faction === 'orc');
  assert.ok(ow.every((w) => !w.spot && w.n === 1), 'Orc: đợt thường quanh thành nhà');
  assert.equal(o.mission.turns, MISSIONS.hold.turns);
});

test('cố thủ: âm binh có thêm lượt trên bản đồ dài; tiếp viện xuất hiện quanh cờ và gỡ cờ', () => {
  const small = createMissionState(generateMap(5, 16, 20), 'hold', 'human', 'undead');
  assert.equal(small.mission.turns, MISSIONS.hold.turns, 'bản nhỏ không thêm lượt');
  const med = createMissionState(generateMap(5, 22, 28), 'hold', 'human', 'undead');
  const medOrc = createMissionState(generateMap(5, 22, 28), 'hold', 'human', 'orc');
  assert.equal(med.mission.turns, medOrc.mission.turns + Math.round(8 * MISSIONS.hold.slowTurns.undead));
  const s = small;
  const w = s.mission.waves.find((x) => x.faction === 'undead');
  const before = s.units.filter((u) => u.faction === 'undead').length;
  let g = 0;
  while (!(s.current === 'undead' && s.turn === w.at) && g++ < 40) endTurn(s);
  assert.ok(w.done);
  const fresh = s.units.filter((u) => u.faction === 'undead').slice(before);
  assert.equal(fresh.length, w.n);
  for (const u of fresh) assert.ok(Math.abs(u.x - w.spot.x) + Math.abs(u.y - w.spot.y) <= 2, 'xuất hiện sát cờ');
});

// ---------- Thủy binh ----------
import { canChop, chopTree, canLaunch, launchBoat, boatAt, isTransition } from '../src/rules.js';
import { MARINE } from '../src/config.js';

// sông dọc cột x=6 (có cầu ở y=3), rừng ở (3,5)
function riverMap() {
  const over = { '3,5': 'forest' };
  for (let y = 0; y < 12; y++) over[`6,${y}`] = y === 3 ? 'bridge' : 'river';
  const s = flat(over);
  addUnit(s, 'orc', 'infantry', 11, 0);
  return s;
}

test('thủy binh: có trong đội hình khi bản đồ có sông hồ (thay một dân quân), không có thì thôi', () => {
  let found = false;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const m = generateMap(seed, 16, 20);
    const water = m.tiles.filter((t) => t === 'river').length;
    const s = createState(m);
    const marines = s.units.filter((u) => u.role === 'marine');
    if (water >= MARINE.minWater) { assert.equal(marines.length, 1, 'seed ' + seed); found = true; } else assert.equal(marines.length, 0);
    assert.ok(marines.every((u) => u.faction === 'human'));
  }
  assert.ok(found, 'ít nhất một bản đồ có sông');
});

test('thủy binh: chặt cây (rừng thành đất trống) rồi hạ thủy thành cung thủ trên sông', () => {
  const s = riverMap();
  const m = addUnit(s, 'human', 'marine', 4, 5);
  assert.equal(statsOf(m).move, STATS.human.militia.move + 1, 'đi xa hơn dân quân 1 ô');
  assert.ok(canChop(s, m), 'cạnh rừng thì chặt được');
  assert.ok(!canLaunch(s, m), 'chưa có gỗ thì chưa hạ thủy');
  chopTree(s, m);
  assert.equal(s.map.tiles[5 * 12 + 3], 'plain', 'ô rừng bị chặt trụi');
  assert.ok(m.timber && m.acted);
  m.moved = false; m.acted = false;
  assert.ok(!canLaunch(s, m), 'chưa ở sát nước');
  m.x = 5; m.y = 5;
  assert.ok(canLaunch(s, m));
  launchBoat(s, m);
  assert.ok(m.afloat && m.x === 6, 'xuống nước ở ô sông kề bên');
  assert.deepEqual(statsOf(m).range, STATS.human.marineboat.range, 'tầm bắn như cung thủ');
});

test('thủy binh trên thuyền: chỉ đi trên sông, không qua gầm cầu; lên bờ bỏ thuyền lại, đi vào thuyền thì xuống lại', () => {
  const s = riverMap();
  const m = addUnit(s, 'human', 'marine', 6, 8); m.afloat = true;
  const r = reachable(s, m);
  assert.ok(r.tiles.has(key(6, 5)) && r.tiles.has(key(6, 11)), 'đi dọc sông');
  assert.ok(!r.tiles.has(key(6, 2)), 'cầu ở y=3 chặn thuyền');
  assert.ok(r.tiles.has(key(5, 8)), 'lên bờ ngay sát được');
  assert.ok(!r.tiles.has(key(4, 8)), 'lên bờ là bước cuối, không đi tiếp trên cạn');
  moveUnit(s, m, 5, 7);
  assert.ok(!m.afloat, 'đã lên bờ');
  assert.ok(boatAt(s, 6, 7), 'thuyền nằm lại ô nước cuối cùng');
  assert.equal(statsOf(m).range[1], 1, 'trên bộ thành bộ binh nhẹ lại');
  m.moved = false; m.acted = false;
  m.x = 4; m.y = 7;
  assert.ok(isTransition(s, m, 6, 7));
  moveUnit(s, m, 6, 7);
  assert.ok(m.afloat && !boatAt(s, 6, 7), 'xuống thuyền lại, thuyền đi theo quân');
});

test('thủy binh: khắc chế theo dạng (trên thuyền như cung thủ, trên bộ như dân quân); lưu/tải giữ thuyền', () => {
  const s = riverMap();
  const m = addUnit(s, 'human', 'marine', 6, 8); m.afloat = true;
  const o = addUnit(s, 'orc', 'cavalry', 8, 8);
  const d1 = calcDamage(s, o, m, 7, 8, 0).match;
  assert.equal(d1, 1.4, 'kỵ binh khắc cung thủ');
  m.afloat = false; m.x = 5;
  assert.equal(calcDamage(s, o, m, 7, 8, 0).match, 1.3, 'kỵ binh đánh dân quân');
  s.boats.push({ x: 6, y: 2, faction: 'human' });
  const r = restoreState(JSON.parse(JSON.stringify(snapshot(s))));
  assert.deepEqual(r.boats, s.boats);
});

// ---------- Hướng dẫn tân thủ ----------
import { LESSONS } from '../src/tutorial.js';

test('hướng dẫn bài 1: bộ binh lên đồi được, cung thủ đánh được Orc phỉ, đánh tiếp thì thắng', () => {
  const { state: s, refs: r } = LESSONS[0].build();
  assert.deepEqual(s.sides, ['human', 'orc']);
  const inf = s.units.find((u) => u.id === r.inf.id), arc = s.units.find((u) => u.id === r.arc.id);
  assert.ok(reachable(s, inf).tiles.has(key(r.hill.x, r.hill.y)), 'đồi trong tầm đi');
  moveUnit(s, inf, r.hill.x, r.hill.y);
  assert.equal(inf.x, r.hill.x); assert.equal(inf.y, r.hill.y);
  waitUnit(s, inf);
  const reach = reachable(s, arc);
  const spot = [...reach.tiles.values()].find((n) => targetsFrom(s, arc, n.x, n.y).some((t) => t.id === r.e1.id));
  assert.ok(spot, 'cung thủ có chỗ bắn được Orc phỉ');
  moveUnit(s, arc, spot.x, spot.y);
  attackUnit(s, arc, s.units.find((u) => u.id === r.e1.id));
  endTurn(s);
  let g = 0;
  while (!s.winner && s.turn <= 15 && g++ < 200) {
    let a, g2 = 0;
    while (!s.winner && (a = planNextAction(s, s.current === 'human' ? 'tactical' : 'easy')) && g2++ < 50) executeAction(s, a);
    endTurn(s);
  }
  assert.equal(s.winner, 'human');
});

test('necromancer bỏ trốn: tới mép bản đồ thì rời trận, đạo âm binh đổ sụp, phe người thắng luôn', async () => {
  const { necroEscape, canNecroEscape } = await import('../src/rules.js');
  const { executeAction } = await import('../src/actions.js');
  const s = graveMap();
  const n = addUnit(s, 'undead', 'necromancer', 3, 3);
  const z = addUnit(s, 'undead', 'infantry', 4, 4); z.origin = 'human';
  addUnit(s, 'human', 'infantry', 6, 12);
  assert.ok(!canNecroEscape(s, n), 'chưa ở mép thì chưa trốn được');
  assert.equal(necroEscape(s, n), null);
  s.current = 'undead';
  const ev = executeAction(s, { unit: n, to: { x: 0, y: 3 }, escape: true });
  assert.ok(ev.some((e) => e.type === 'escape' && e.unit === n.id));
  assert.ok(ev.some((e) => e.type === 'collapse' && e.unit === z.id));
  assert.equal(s.winner, 'human');
  assert.equal(s.winReason, 'necro_fled');
  assert.ok(!s.units.some((u) => u.faction === 'undead'));
});

test('necromancer bỏ trốn: AI còn ≤ 2 squad thì chạy về mép bản đồ và thoát (giao tranh)', async () => {
  const { planNextAction, AI_FLAGS } = await import('../src/ai.js');
  const { executeAction } = await import('../src/actions.js');
  assert.ok(AI_FLAGS.undeadMind);
  const s = graveMap();
  s.mission = { type: 'skirmish' };
  addUnit(s, 'undead', 'necromancer', 2, 2);
  const z = addUnit(s, 'undead', 'infantry', 3, 3); z.origin = 'human';
  for (const x of [4, 5, 6, 7]) addUnit(s, 'human', 'infantry', x, 9);
  s.current = 'undead';
  let a, g = 0;
  for (let t = 0; t < 6 && !s.winner; t++) {
    while (!s.winner && (a = planNextAction(s, 'tactical')) && g++ < 50) executeAction(s, a);
    if (!s.winner) { endTurn(s); endTurn(s); }
  }
  assert.equal(s.aiMind.undead.posture, 'flee');
  assert.equal(s.winReason, 'necro_fled');
});
