import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap } from '../src/mapgen.js';
import { createMissionState } from '../src/missions.js';
import { endTurn } from '../src/rules.js';
import { planNextAction } from '../src/ai.js';
import { executeAction } from '../src/actions.js';
import { snapshot, restoreState, validate, parseSaveText, summarize, SaveStore, SLOTS } from '../src/saves.js';

const play = (s, turns) => {
  for (let i = 0; i < turns && !s.winner; i++) {
    let a, g = 0;
    while (!s.winner && (a = planNextAction(s, 'tactical')) && g++ < 100) executeAction(s, a);
    endTurn(s);
  }
};

test('lưu rồi tải: mọi loại nhiệm vụ cho lại đúng state, và chơi tiếp ra cùng kết quả', () => {
  for (const type of ['skirmish', 'hold', 'destroy', 'escort']) {
    const s = createMissionState(generateMap(7, 16, 20), type);
    play(s, 4);
    const snap = JSON.parse(JSON.stringify(snapshot(s, { difficulty: 'tactical' })));
    const r = restoreState(snap);
    assert.deepEqual(r.units, s.units, type + ': quân');
    assert.deepEqual(r.mission, s.mission, type + ': nhiệm vụ');
    assert.deepEqual(r.map.tiles, s.map.tiles, type + ': bản đồ');
    assert.equal(r.turn, s.turn); assert.equal(r.current, s.current); assert.equal(r.nextId, s.nextId);
    assert.deepEqual(r.capture, s.capture);
    // AI xác định: hai bên chơi tiếp 3 lượt phải ra y hệt
    play(s, 3); play(r, 3);
    assert.deepEqual(r.units, s.units, type + ': chơi tiếp lệch');
    assert.equal(r.winner, s.winner);
  }
});

test('lưu giữ cả cờ đặc biệt: tướng, trại tĩnh, trại đã dựng, xp', () => {
  const s = createMissionState(generateMap(7, 16, 20), 'escort');
  const vip = s.units.find((u) => u.vip); vip.fort = 2; vip.xp = 25;
  const r = restoreState(JSON.parse(JSON.stringify(snapshot(s))));
  const v2 = r.units.find((u) => u.id === vip.id);
  assert.ok(v2.vip && v2.fort === 2 && v2.xp === 25);
  const d = restoreState(JSON.parse(JSON.stringify(snapshot(createMissionState(generateMap(7, 16, 20), 'destroy')))));
  assert.ok(d.units.some((u) => u.static));
});

test('bản lưu hỏng hoặc không hợp lệ bị từ chối, không tạo state dở dang', () => {
  const s = createMissionState(generateMap(7, 16, 20), 'hold');
  const good = JSON.parse(JSON.stringify(snapshot(s)));
  const mut = (f) => { const c = JSON.parse(JSON.stringify(good)); f(c); return c; };
  assert.throws(() => validate(null));
  assert.throws(() => validate({ v: 99 }));
  assert.throws(() => validate(mut((c) => { c.map.tiles.pop(); })), 'thiếu ô bản đồ');
  assert.throws(() => validate(mut((c) => { c.state.units[0].x = 999; })), 'quân ngoài map');
  assert.throws(() => validate(mut((c) => { c.state.units[0].faction = 'elf'; })), 'phe lạ');
  assert.throws(() => validate(mut((c) => { delete c.state.mission; })), 'thiếu nhiệm vụ');
  assert.throws(() => parseSaveText('{không phải json'));
  assert.doesNotThrow(() => parseSaveText(JSON.stringify(good)));
});

// ---- SaveStore với db giả và localStorage giả ----
function fakeEnv({ db = true, failWrite = false, userId = 'u1', downloads = true } = {}) {
  const rows = new Map(), ls = new Map(), saved = [];
  const col = (path) => ({ doc: (id) => ({
    get: async () => ({ exists: rows.has(path + '/' + id), data: () => rows.get(path + '/' + id) }),
    set: async (d) => { if (failWrite) throw { code: 'unavailable' }; rows.set(path + '/' + id, d); },
    delete: async () => { rows.delete(path + '/' + id); },
  }) });
  const caps = { db: db ? { collection: col } : null, user: { id: async () => userId }, downloads: downloads ? { save: async (r) => { saved.push(r); return { status: 'saved' }; } } : null };
  const claude = { use: async (n) => caps[n] ?? null };
  const storage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, v); }, removeItem: (k) => { ls.delete(k); } };
  return { env: { claude, storage }, rows, ls, saved };
}
const mk = () => snapshot(createMissionState(generateMap(7, 16, 20), 'hold'));

test('SaveStore: có db thì ghi cả máy chủ lẫn cục bộ, đọc lại được, key nằm trong vùng riêng của người chơi', async () => {
  const f = fakeEnv();
  const st = new SaveStore(f.env);
  assert.deepEqual(await st.init(), { remote: true, local: true, download: true });
  const snap = mk();
  assert.deepEqual(await st.write('s1', snap), { remote: true, local: true });
  assert.ok([...f.rows.keys()].every((k) => k.startsWith('data/users/u1/')), 'chỉ ghi vào data/users/<id>');
  assert.equal((await st.read('s1')).savedAt, snap.savedAt);
  const list = await st.list();
  assert.deepEqual(Object.keys(list), SLOTS);
  assert.equal(list['s1'].mission, 'hold');
  assert.equal(list['s2'], null);
  await st.remove('s1');
  assert.equal(await st.read('s1'), null);
});

test('SaveStore: máy chủ mất thì còn cục bộ; cục bộ mất thì còn máy chủ; lấy bản mới hơn', async () => {
  const f = fakeEnv(); const st = new SaveStore(f.env); await st.init();
  const old = mk(); old.savedAt = 1000;
  const fresh = mk(); fresh.savedAt = 2000;
  await st.write('auto', old);
  f.ls.set('turnbase1.save.auto', JSON.stringify(fresh));          // cục bộ mới hơn
  assert.equal((await st.read('auto')).savedAt, 2000);
  f.ls.clear();                                                      // người chơi xoá dữ liệu trang
  assert.equal((await st.read('auto')).savedAt, 1000, 'vẫn còn bản trên máy chủ');
  f.rows.clear(); f.ls.set('turnbase1.save.auto', JSON.stringify(fresh));
  assert.equal((await st.read('auto')).savedAt, 2000, 'máy chủ trống thì dùng cục bộ');
});

test('SaveStore: không có db thì chạy cục bộ và báo đúng; ghi máy chủ lỗi thì báo remote=false', async () => {
  const f = fakeEnv({ db: false, downloads: false });
  const st = new SaveStore(f.env);
  assert.deepEqual(await st.init(), { remote: false, local: true, download: false });
  assert.deepEqual(await st.write('s2', mk()), { remote: false, local: true });
  assert.ok(await st.read('s2'));
  const g = fakeEnv({ failWrite: true }); const s2 = new SaveStore(g.env); await s2.init();
  assert.deepEqual(await s2.write('s3', mk()), { remote: false, local: true });
  const none = new SaveStore({ claude: null, storage: null });
  assert.deepEqual(await none.init(), { remote: false, local: false, download: false });
  assert.deepEqual(await none.write('s1', mk()), { remote: false, local: false });
});

test('SaveStore: xuất file đúng tên .json và nội dung đọc lại được', async () => {
  const f = fakeEnv(); const st = new SaveStore(f.env); await st.init();
  const snap = mk();
  await st.exportFile(snap);
  assert.match(f.saved[0].filename, /^turnbase1-.*\.json$/);
  assert.equal(parseSaveText(f.saved[0].data).savedAt, snap.savedAt);
  const none = new SaveStore(fakeEnv({ downloads: false }).env); await none.init();
  await assert.rejects(() => none.exportFile(snap), { code: 'unavailable' });
});

test('summarize: đếm quân không tính trại tĩnh', () => {
  const s = createMissionState(generateMap(7, 16, 20), 'destroy');
  const sum = summarize(snapshot(s));
  assert.equal(sum.units, s.units.filter((u) => !u.static).length);
});
