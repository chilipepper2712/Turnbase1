// Lưu / tải ván. Hai phần tách rời:
//   1. snapshot() / restoreState(): chuyển state <-> JSON thuần (không đụng DOM, test được bằng node).
//      Bản lưu chứa cả bản đồ (không sinh lại từ seed) nên đổi bản mã sinh map về sau không làm hỏng save cũ.
//   2. SaveStore: nơi lưu. Ưu tiên `db` của nền tảng Artifact (phía máy chủ, riêng từng người, sống qua republish),
//      luôn ghi thêm localStorage làm bản sao nhanh. Không có db thì chỉ còn localStorage (có thể mất khi xoá dữ liệu trang).
import { createState } from './rules.js';

export const SAVE_VERSION = 1;
export const SLOTS = ['auto', 's1', 's2', 's3'];       // chữ cái đầu để thứ tự khoá không bị JS xếp lại

const clone = (x) => JSON.parse(JSON.stringify(x));

// meta: { difficulty, mapSize } do lớp giao diện cung cấp
export function snapshot(state, meta = {}) {
  const { w, h, tiles, seed, strongholds, spawns } = state.map;
  return {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    meta: { difficulty: meta.difficulty || 'tactical', mapSize: meta.mapSize || null },
    map: clone({ w, h, tiles, seed, strongholds, spawns }),
    state: clone({
      turn: state.turn, current: state.current, nextId: state.nextId, capture: state.capture,
      mission: state.mission, units: state.units, escaped: state.escaped || [],
    }),
  };
}

// Tóm tắt để hiện trong danh sách ô lưu (không cần giải nén cả bản lưu)
export function summarize(snap) {
  return { savedAt: snap.savedAt, turn: snap.state.turn, mission: snap.state.mission.type, units: snap.state.units.filter((u) => !u.static).length };
}

const isNum = (x) => typeof x === 'number' && isFinite(x);

// Kiểm tra bản lưu (có thể đến từ file người dùng nhập): sai thì ném lỗi, không bao giờ trả về state dở dang
export function validate(snap) {
  const bad = (m) => { throw new Error('save: ' + m); };
  if (!snap || typeof snap !== 'object') bad('không phải đối tượng');
  if (snap.v !== SAVE_VERSION) bad('phiên bản ' + snap.v + ' không hỗ trợ');
  const m = snap.map, s = snap.state;
  if (!m || !isNum(m.w) || !isNum(m.h) || !Array.isArray(m.tiles) || m.tiles.length !== m.w * m.h) bad('bản đồ');
  if (!m.strongholds?.human || !m.strongholds?.orc) bad('thành');
  if (!s || !isNum(s.turn) || !['human', 'orc'].includes(s.current) || !isNum(s.nextId)) bad('trạng thái');
  if (!s.mission || typeof s.mission.type !== 'string') bad('nhiệm vụ');
  if (!Array.isArray(s.units)) bad('quân');
  for (const u of s.units) {
    if (!u || !isNum(u.id) || !['human', 'orc'].includes(u.faction) || typeof u.role !== 'string') bad('một squad');
    if (!isNum(u.x) || !isNum(u.y) || u.x < 0 || u.y < 0 || u.x >= m.w || u.y >= m.h || !isNum(u.strength)) bad('vị trí squad');
  }
  return snap;
}

export function restoreState(snap) {
  validate(snap);
  const map = clone(snap.map);
  const st = createState(map);
  const s = clone(snap.state);
  st.units = s.units;
  st.turn = s.turn; st.current = s.current; st.nextId = s.nextId;
  st.capture = { human: 0, orc: 0, ...s.capture };
  st.mission = s.mission;
  st.escaped = s.escaped || [];
  st.winner = null; st.winReason = null;
  return st;
}

// ---------------------------------------------------------------------------------------------
const LS = 'turnbase1.save.';
const DOC = (slot) => 'save_' + slot;

export class SaveStore {
  // env: { claude, storage } để test thay được; mặc định lấy từ trình duyệt
  constructor(env = {}) {
    this.claude = env.claude !== undefined ? env.claude : (typeof window !== 'undefined' ? window.claude : null);
    this.storage = env.storage !== undefined ? env.storage : (() => { try { return window.localStorage; } catch { return null; } })();
    this.col = null;           // collection db của riêng người chơi
    this.downloads = null;
    this.ready = false;
  }

  // Trả về { remote: bool }: remote = có chỗ lưu phía máy chủ
  async init() {
    if (this.ready) return this.status();
    this.ready = true;
    try {
      const timeout = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), 4000))]);
      if (this.claude?.use) {
        const [db, user, dl] = await Promise.all([timeout(this.claude.use('db')), timeout(this.claude.use('user')), timeout(this.claude.use('downloads'))]);
        this.downloads = dl || null;
        const id = db && user ? await user.id() : null;
        if (db && id) this.col = db.collection('data/users/' + id);
      }
    } catch { this.col = null; }
    return this.status();
  }

  status() { return { remote: !!this.col, local: !!this.storage, download: !!this.downloads }; }

  _lsGet(slot) { try { const t = this.storage?.getItem(LS + slot); return t ? JSON.parse(t) : null; } catch { return null; } }
  _lsSet(slot, snap) { if (!this.storage) return false; try { this.storage.setItem(LS + slot, JSON.stringify(snap)); return true; } catch { return false; } }
  _lsDel(slot) { try { this.storage?.removeItem(LS + slot); } catch { /* bỏ qua */ } }

  async _remoteGet(slot) {
    if (!this.col) return null;
    try {
      const d = await this.col.doc(DOC(slot)).get();
      if (!d.exists) return null;
      const body = d.data();
      return body && typeof body.json === 'string' ? JSON.parse(body.json) : null;
    } catch { return null; }
  }

  // Ghi máy chủ và bản sao cục bộ. Trả về { remote, local } cho biết nơi nào thật sự ghi được
  async write(slot, snap) {
    const out = { remote: false, local: this._lsSet(slot, snap) };
    if (this.col) {
      try { await this.col.doc(DOC(slot)).set({ v: snap.v, savedAt: snap.savedAt, json: JSON.stringify(snap) }); out.remote = true; } catch { /* rơi về local */ }
    }
    return out;
  }

  // Đọc: lấy bản mới hơn giữa máy chủ và cục bộ (đề phòng một nơi bị mất hoặc ghi hỏng)
  async read(slot) {
    const [r, l] = [await this._remoteGet(slot), this._lsGet(slot)];
    const pick = !r ? l : !l ? r : (l.savedAt > r.savedAt ? l : r);
    return pick || null;
  }

  async remove(slot) {
    this._lsDel(slot);
    if (this.col) { try { await this.col.doc(DOC(slot)).delete(); } catch { /* bỏ qua */ } }
  }

  async list() {
    const out = {};
    for (const slot of SLOTS) {
      const snap = await this.read(slot);
      if (!snap) { out[slot] = null; continue; }
      try { validate(snap); out[slot] = summarize(snap); } catch { out[slot] = { broken: true }; }
    }
    return out;
  }

  // Xuất ra file cho người chơi giữ (viewer có thể từ chối; ném lỗi { code } nếu không lưu được)
  async exportFile(snap) {
    if (!this.downloads) throw Object.assign(new Error('no downloads'), { code: 'unavailable' });
    const stamp = new Date(snap.savedAt).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return this.downloads.save({ filename: `turnbase1-${stamp}.json`, data: JSON.stringify(snap) });
  }
}

export function parseSaveText(text) {
  let snap;
  try { snap = JSON.parse(text); } catch { throw new Error('save: không đọc được file'); }
  return validate(snap);
}
