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
