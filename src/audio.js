// Âm thanh: Web Audio. Chạy được khi KHÔNG có file nào (thiếu file thì im lặng).
//   assets/audio/sfx/<tên>.(mp3|ogg|m4a|wav)    hiệu ứng, tên theo SFX_LIST
//   assets/audio/music/battle_*.(mp3|ogg|...)   nhạc nền, loop; có nhiều bài thì xoay vòng
// Danh sách file nằm ở assets/audio/index.json (tools/build_audio_index.mjs tự sinh; bản đóng gói một file nhúng sẵn).

// Tên SFX -> các tên thay thế (thử lần lượt) khi file chính chưa có
export const FALLBACK = {
  step_horse: ['step_foot'],
  attack_spear: ['attack_melee'],
  attack_charge: ['attack_melee'],
  arrow_hit: ['hit_flesh'],
  turn_enemy: ['turn_player'],
  ui_deny: ['ui_cancel'],
  rout: ['hit_flesh'],
  heal: ['levelup'],
  merge: ['ui_confirm'],
  split: ['ui_confirm'],
  capture: ['ui_confirm'],
  defeat: ['unit_die'],
  end_turn: ['ui_confirm'],
};

// Chọn tên file thực sự tồn tại cho một SFX (đi theo chuỗi thay thế). Hàm thuần để test.
export function resolveSfx(name, available) {
  if (available[name]) return name;
  for (const alt of FALLBACK[name] || []) if (available[alt]) return alt;
  return null;
}

const EXT_PREF = ['mp3', 'ogg', 'm4a', 'wav'];
const b64ToBuf = (uri) => {
  const bin = atob(uri.slice(uri.indexOf(',') + 1)), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
};

export class AudioManager {
  constructor(settings) {
    this.s = settings;
    this.ctx = null; this.unlocked = false;
    this.index = { sfx: {}, music: {} };
    this.buf = new Map(); this.loading = new Map();
    this.last = new Map();
    this.cur = null;             // { name, src, gain }
    this.rotateT = 0;
  }

  get ready() { return this.unlocked && !!this.ctx; }

  // Phải gọi từ một cú chạm/bấm của người chơi (quy định của Safari/Chrome)
  async unlock() {
    if (this.unlocked) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    this.unlocked = true;
    this.applyVolumes();
    try { await this.ctx.resume(); } catch { /* bỏ qua */ }
    // iOS tự treo ngữ cảnh khi chuyển tab / khoá màn hình: mở lại ở lần chạm kế tiếp
    const again = () => this.resume();
    window.addEventListener('pointerdown', again, true);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.resume(); });
    await this.loadIndex();
    for (const n of Object.keys(this.index.sfx)) this.load('sfx', n);
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  async loadIndex() {
    try {
      if (globalThis.__AUDIO_INDEX__) this.index = globalThis.__AUDIO_INDEX__;
      else {
        const r = await fetch('assets/audio/index.json');
        if (r.ok) this.index = await r.json();
      }
    } catch { /* chưa có file âm thanh nào */ }
    this.index.sfx ||= {}; this.index.music ||= {};
  }

  async bytes(rel) {
    const emb = globalThis.__AUDIO_DATA__;
    if (emb) return emb[rel] ? b64ToBuf(emb[rel]) : null;
    const r = await fetch('assets/audio/' + rel);
    return r.ok ? r.arrayBuffer() : null;
  }

  load(kind, name) {
    const key = kind + ':' + name;
    if (this.buf.has(key)) return Promise.resolve(this.buf.get(key));
    if (this.loading.has(key)) return this.loading.get(key);
    const rel = this.index[kind]?.[name];
    if (!rel) return Promise.resolve(null);
    const p = (async () => {
      try {
        const ab = await this.bytes(rel);
        if (!ab) return null;
        const b = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));   // dạng callback: chạy cả trên Safari cũ
        this.buf.set(key, b);
        return b;
      } catch (e) { console.warn('[audio] không giải mã được', rel, e && e.message); return null; }
    })();
    this.loading.set(key, p);
    return p;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const sq = (v) => Math.pow(Math.max(0, Math.min(1, v)), 2);           // thang cảm nhận
    this.master.gain.value = this.s.muted ? 0 : 1;
    this.musicBus.gain.value = sq(this.s.musicVol ?? 0.5);
    this.sfxBus.gain.value = sq(this.s.sfxVol ?? 0.8);
  }

  setMuted(m) { this.s.muted = !!m; this.applyVolumes(); }

  // ---- SFX ----
  play(name, opts = {}) {
    if (!this.ready || this.s.muted) return;
    const real = resolveSfx(name, this.index.sfx);
    if (!real) return;
    const now = performance.now();
    if (now - (this.last.get(real) || 0) < (opts.gap ?? 45)) return;      // chống dồn tiếng
    this.last.set(real, now);
    const b = this.buf.get('sfx:' + real);
    if (!b) { this.load('sfx', real); return; }
    const src = this.ctx.createBufferSource(); src.buffer = b;
    src.playbackRate.value = opts.rate ?? (0.96 + Math.random() * 0.08);   // lệch nhẹ để không nghe lặp máy móc
    const g = this.ctx.createGain(); g.gain.value = opts.vol ?? 1;
    src.connect(g); g.connect(this.sfxBus); src.start();
  }

  // ---- Nhạc ----
  tracks() { return Object.keys(this.index.music).filter((n) => n.startsWith('battle')).sort(); }

  async playMusic(name, fade = 2) {
    if (!this.ready) return;
    if (this.cur && this.cur.name === name) return;
    const b = await this.load('music', name);
    if (!b) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g); g.connect(this.musicBus); src.start();
    g.gain.linearRampToValueAtTime(1, t + fade);
    if (this.cur) {
      const old = this.cur;
      old.gain.gain.cancelScheduledValues(t); old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => { try { old.src.stop(); } catch { /* đã dừng */ } }, fade * 1000 + 200);
    }
    this.cur = { name, src, gain: g };
  }

  // Bắt đầu phát nhạc nền: chọn một bài, mỗi ~4 phút chuyển sang bài khác nếu có nhiều bài
  startPlaylist() {
    clearInterval(this.rotateT);
    const list = this.tracks();
    if (!list.length) return;
    const pick = (avoid) => { const c = list.filter((n) => n !== avoid); return (c.length ? c : list)[Math.floor(Math.random() * (c.length || list.length))]; };
    this.playMusic(pick(this.cur?.name));
    if (list.length > 1) this.rotateT = setInterval(() => this.playMusic(pick(this.cur?.name)), 240000);
  }
}
