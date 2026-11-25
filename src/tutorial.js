// Bài hướng dẫn cho tân thủ: bản đồ nhỏ dựng sẵn, quân đặt sẵn, các bước dẫn dắt có khoá hành động.
// Mỗi bước: text (khoá i18n), focus (ô / quân cần chú ý: vẽ vòng sáng), glow (nút cần bấm: nhấp nháy),
// allow (hành động được phép ở bước này; ngoài ra bị chặn kèm lời nhắc), next (bước chỉ đọc: hiện nút Tiếp),
// done(ctx) (điều kiện sang bước sau, xét sau mỗi lần giao diện cập nhật).
// Luật chơi không đổi: tutorial chỉ dựng trận và lọc thao tác của người chơi; lượt địch dùng AI dễ.
import { createState, addUnit } from './rules.js';
import { t } from './i18n.js';

const plainMap = (w, h, over, strongholds) => {
  const tiles = new Array(w * h).fill('plain');
  for (const [k, v] of Object.entries(over)) { const [x, y] = k.split(',').map(Number); tiles[y * w + x] = v; }
  for (const p of Object.values(strongholds)) tiles[p.y * w + p.x] = 'stronghold';
  return { w, h, tiles, seed: 0, strongholds, spawns: { human: [], orc: [] }, goblins: [] };
};

const at = (u, p) => !!u && u.x === p.x && u.y === p.y;

export const LESSONS = [
  {
    id: 'basics',
    build() {
      const hill = { x: 4, y: 5 };
      const map = plainMap(10, 9, {
        '4,5': 'hill', '5,5': 'hill', '6,2': 'forest', '7,2': 'forest', '7,3': 'forest', '1,6': 'village', '8,6': 'forest', '0,2': 'forest',
      }, { human: { x: 1, y: 8 }, orc: { x: 8, y: 0 } });
      const s = createState(map);
      const inf = addUnit(s, 'human', 'infantry', 3, 7);
      const arc = addUnit(s, 'human', 'archer', 2, 7);
      const e1 = addUnit(s, 'orc', 'militia', 5, 3, 4);
      const e2 = addUnit(s, 'orc', 'militia', 6, 1, 3);
      for (const u of s.units) { u.moved = false; u.acted = false; }
      return { state: s, refs: { inf, arc, e1, e2, hill } };
    },
    steps: [
      { text: 'tut.basics.intro', next: true },
      { text: 'tut.basics.inspect', focus: 'hill', allow: { inspect: ['hill'] }, done: (c) => at(c.g.inspectTile, c.r.hill) },
      { text: 'tut.basics.hill', next: true, focus: 'hill' },
      { text: 'tut.basics.select', focus: 'inf', allow: { select: ['inf'] }, done: (c) => c.g.sel?.id === c.r.inf.id },
      { text: 'tut.basics.move', focus: 'hill', glow: 'movebtn', allow: { select: ['inf'], move: ['hill'] }, done: (c) => at(c.unit('inf'), c.r.hill) },
      { text: 'tut.basics.wait', glow: 'wait', allow: { select: ['inf'], wait: true }, done: (c) => c.unit('inf')?.acted },
      { text: 'tut.basics.archer', focus: 'arc', allow: { select: ['arc'] }, done: (c) => c.g.sel?.id === c.r.arc.id },
      { text: 'tut.basics.target', focus: 'e1', allow: { select: ['arc'], attack: ['e1'] }, done: (c) => c.g.pending?.target.id === c.r.e1.id || c.unit('arc')?.acted },
      { text: 'tut.basics.preview', glow: 'confirm', allow: { select: ['arc'], attack: ['e1'] }, done: (c) => c.unit('arc')?.acted },
      { text: 'tut.basics.end', glow: 'endturn', allow: { endturn: true }, done: (c) => c.s.turn >= 2 && c.s.current === 'human' },
      { text: 'tut.basics.free', allow: { free: true }, done: (c) => !!c.s.winner },
    ],
  },
];

export class Tutorial {
  constructor(game, lesson) {
    this.g = game; this.lesson = lesson; this.i = 0;
    const b = lesson.build();
    this.state = b.state; this.r = b.refs;
  }

  get step() { return this.lesson.steps[this.i]; }
  get s() { return this.g.state; }
  // quân theo tên trong bài (đã chết thì null)
  unit(tag) { const ref = this.r[tag]; return ref && ref.id ? this.s.units.find((u) => u.id === ref.id) || null : null; }

  // ô / quân đang được chỉ vào (vẽ vòng sáng)
  focusTile() {
    const f = this.step?.focus;
    if (!f) return null;
    const u = this.unit(f);
    if (u) return { x: u.x, y: u.y };
    const p = this.r[f];
    return p && p.id === undefined ? { x: p.x, y: p.y } : null;
  }

  matches(list, arg) {
    if (list === true) return true;
    if (!Array.isArray(list) || !arg) return false;
    return list.some((tag) => {
      const u = this.unit(tag);
      if (u) return arg.id !== undefined ? arg.id === u.id : at(u, arg);
      const p = this.r[tag];
      return p && p.id === undefined && at(arg, p);
    });
  }

  // hành động kind với đối số arg (quân hoặc ô) có được phép ở bước này không
  allows(kind, arg) {
    const a = this.step?.allow;
    if (!a) return false;
    if (a.free) return true;
    return a[kind] !== undefined && this.matches(a[kind], arg);
  }

  // sau mỗi lần giao diện cập nhật: sang bước tiếp nếu xong, vẽ lại khung lời dẫn
  update() {
    const st = this.step;
    if (st && st.done && st.done({ g: this.g, s: this.s, r: this.r, unit: (t) => this.unit(t) })) { this.i++; this.g.snd('ui_confirm'); }
    this.render();
  }

  next() { if (this.step?.next) { this.i++; this.g.refreshAll(); } }

  render() {
    const el = document.getElementById('tut');
    if (!el) return;
    const st = this.step, tr = t;
    document.body.dataset.tutGlow = st?.glow || '';
    if (!st) { el.hidden = true; return; }
    const n = this.lesson.steps.length;
    el.hidden = false;
    el.innerHTML = `<div class="t-head"><span class="t-step">${tr('tut.step', { i: this.i + 1, n })}</span><button data-tut="skip" class="t-skip">${tr('tut.skip')}</button></div>`
      + `<p>${tr(st.text)}</p>`
      + (st.next ? `<div class="t-btns"><button data-tut="next" class="primary">${tr('tut.next')}</button></div>` : '');
  }
}
