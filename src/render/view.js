// Lớp hiển thị Pixi: isometric, chunk bake cho nền, sprite có z-sort, camera, animation.
// Render-on-demand: không có gì thay đổi thì không vẽ lại (đỡ nóng máy).
import { CONFIG, FACTIONS } from '../config.js';
import { hash2, makeRng } from '../rng.js';
import { terrainId } from '../rules.js';
import { RES } from './assets.js';
import { drawGroundTile, makeCanvas, INK } from './doodle.js';

export const TW = 96, TH = 48;
const CHUNK = 8;
const FONT = '"Patrick Hand","Segoe Print","Comic Sans MS","Chalkboard SE",cursive';

export const tileToWorld = (x, y) => ({ x: ((x - y) * TW) / 2, y: ((x + y) * TH) / 2 });
export function worldToTile(wx, wy) {
  const a = wx / (TW / 2), b = wy / (TH / 2);
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class GameView {
  constructor(host, assets, t) {
    this.host = host;
    this.assets = assets;
    this.t = t;
    this.sprites = new Map();       // unitId -> UnitSprite
    this.tweens = [];
    this.raf = 0;
    this.hooks = {};
    this.overlay = {};
    this.speed = 1;
  }

  async init(state) {
    this.state = state;
    const app = new PIXI.Application();
    await app.init({
      resizeTo: this.host, background: '#e9e7de', antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, autoStart: false,
    });
    app.ticker.stop();
    this.app = app;
    this.host.appendChild(app.canvas);
    app.canvas.style.touchAction = 'none';
    app.renderer.on('resize', () => this.requestRender());

    this.world = new PIXI.Container();
    this.ground = new PIXI.Container();
    this.hl = new PIXI.Graphics();
    this.objects = new PIXI.Container();
    this.objects.sortableChildren = true;
    this.fx = new PIXI.Container();
    this.world.addChild(this.ground, this.hl, this.objects, this.fx);
    app.stage.addChild(this.world);
    this.zoom = 1;
    this.buildMap();
    this.reconcile();
    this.bindInput();
    this.fit();
    return this;
  }

  // Bắt đầu ván mới trên cùng renderer
  reset(state) {
    this.state = state;
    this.tweens.length = 0;
    this.overlay = {};
    this.hl.clear();
    this.buildMap();
    this.reconcile();
    this.focusStart();
  }

  // Cuộn camera nếu điểm nằm gần mép màn hình
  async ensureVisible(x, y) {
    const c = tileToWorld(x, y);
    const sx = c.x * this.zoom + this.world.position.x, sy = c.y * this.zoom + this.world.position.y;
    const W = this.app.screen.width, H = this.app.screen.height;
    if (sx < W * 0.18 || sx > W * 0.82 || sy < H * 0.18 || sy > H * 0.82) await this.focus(x, y, 300);
  }

  // ---------- Dựng bản đồ ----------
  buildMap() {
    const s = this.state, { w, h } = s.map;
    this.ground.removeChildren().forEach((c) => c.destroy());
    this.objects.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.sprites.clear();
    this.holdLabel = null;
    for (let j = 0; j < h; j += CHUNK) {
      for (let i = 0; i < w; i += CHUNK) this.bakeChunk(i, j);
    }
    this.drawBorder();
    // trang trí đối tượng
    this.deco = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.placeDeco(x, y);
  }

  bakeChunk(i0, j0) {
    const s = this.state, { w, h } = s.map;
    const i1 = Math.min(i0 + CHUNK, w), j1 = Math.min(j0 + CHUNK, h);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let y = j0; y < j1; y++) for (let x = i0; x < i1; x++) {
      const c = tileToWorld(x, y);
      minX = Math.min(minX, c.x - TW / 2 - 4); maxX = Math.max(maxX, c.x + TW / 2 + 4);
      minY = Math.min(minY, c.y - TH / 2 - 4); maxY = Math.max(maxY, c.y + TH / 2 + 4);
    }
    const canvas = makeCanvas((maxX - minX) * RES, (maxY - minY) * RES);
    const ctx = canvas.getContext('2d');
    ctx.scale(RES, RES);
    ctx.translate(-minX, -minY);
    const tid = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : terrainId(s, x, y));
    for (let y = j0; y < j1; y++) for (let x = i0; x < i1; x++) {
      const c = tileToWorld(x, y);
      const t = tid(x, y);
      // thứ tự cạnh: 0=-y 1=+x 2=+y 3=-x
      const neighbors = [tid(x, y - 1), tid(x + 1, y), tid(x, y + 1), tid(x - 1, y)];
      drawGroundTile(ctx, c.x, c.y, t, { TW, TH, neighbors, seed: Math.floor(hash2(s.map.seed || 1, x, y) * 1e9) });
    }
    // lưới mờ
    ctx.strokeStyle = 'rgba(120,118,105,0.28)'; ctx.lineWidth = 1;
    for (let y = j0; y < j1; y++) for (let x = i0; x < i1; x++) {
      const c = tileToWorld(x, y);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - TH / 2); ctx.lineTo(c.x + TW / 2, c.y); ctx.lineTo(c.x, c.y + TH / 2); ctx.lineTo(c.x - TW / 2, c.y);
      ctx.closePath(); ctx.stroke();
    }
    const tex = PIXI.Texture.from(canvas);
    const sp = new PIXI.Sprite(tex);
    sp.position.set(minX, minY);
    sp.scale.set(1 / RES);
    this.ground.addChild(sp);
  }

  drawBorder() {
    const s = this.state, { w, h } = s.map;
    const corners = [
      [tileToWorld(0, 0).x, tileToWorld(0, 0).y - TH / 2],
      [tileToWorld(w - 1, 0).x + TW / 2, tileToWorld(w - 1, 0).y],
      [tileToWorld(w - 1, h - 1).x, tileToWorld(w - 1, h - 1).y + TH / 2],
      [tileToWorld(0, h - 1).x - TW / 2, tileToWorld(0, h - 1).y],
    ];
    const rng = makeRng(77);
    const g = new PIXI.Graphics();
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const n = 28;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        pts.push(a[0] + (b[0] - a[0]) * t + (rng() - 0.5) * 2.2, a[1] + (b[1] - a[1]) * t + (rng() - 0.5) * 2.2);
      }
    }
    g.poly(pts.map((v, i) => v + (i % 2 ? 7 : 4))).fill({ color: 0x000000, alpha: 0.06 });
    g.poly(pts, true).stroke({ width: 3.2, color: 0x1b1b1b, join: 'round' });
    this.ground.addChild(g);
    this.mapBounds = {
      minX: corners[3][0], maxX: corners[1][0], minY: corners[0][1], maxY: corners[2][1],
    };
  }

  place(sprite, wx, wy, z) {
    sprite.position.set(wx, wy);
    sprite.zIndex = z ?? wy;
    this.objects.addChild(sprite);
    return sprite;
  }

  mk(res, scale = 1) {
    const sp = new PIXI.Sprite(res.texture);
    sp.anchor.set(res.anchor[0], res.anchor[1]);
    sp.scale.set(scale / RES);
    return sp;
  }

  placeDeco(x, y) {
    const s = this.state;
    const t = terrainId(s, x, y);
    const c = tileToWorld(x, y);
    const seed = Math.floor(hash2(s.map.seed || 1, x * 7 + 3, y * 13 + 5) * 1e9);
    const rng = makeRng(seed);
    const uv = (u, v) => [c.x + (u * TW) / 2 - (v * TW) / 2, c.y + (u * TH) / 2 + (v * TH) / 2];
    const A = this.assets;
    if (t === 'forest') {
      const n = 2 + rng.int(2);
      for (let i = 0; i < n; i++) {
        const [px, py] = uv((rng() - 0.5) * 0.7, (rng() - 0.5) * 0.7);
        const sc = 0.85 + rng() * 0.35;
        this.place(this.mk(A.deco('tree', rng.int(4)), sc), px, py + 8);
      }
    } else if (t === 'hill') {
      const n = 1 + rng.int(2);
      for (let i = 0; i < n; i++) {
        const [px, py] = uv((rng() - 0.5) * 0.45, (rng() - 0.5) * 0.45);
        this.place(this.mk(A.deco('hill', rng.int(3)), 0.95 + rng() * 0.3), px, py + 12);
      }
    } else if (t === 'mountain') {
      const [px, py] = uv((rng() - 0.5) * 0.2, (rng() - 0.5) * 0.2);
      this.place(this.mk(A.deco('mountain', rng.int(3)), 1.0), px, py + 16);
    } else if (t === 'mine') {
      this.place(this.mk(A.deco('mine', 0), 1.0), c.x, c.y + 14);
    } else if (t === 'village') {
      const name = ['village_a', 'village_b', 'cottages'][rng.int(3)];
      this.place(this.mk(A.building(name)), c.x, c.y + 14);
    } else if (t === 'fort') {
      this.place(this.mk(A.building(rng() < 0.5 ? 'tower_a' : 'tower_b')), c.x, c.y + 16);
    } else if (t === 'stronghold') {
      const own = this.state.map.strongholds;
      const isHuman = own.human.x === x && own.human.y === y;
      const f = isHuman ? 'human' : 'orc';
      const sp = this.mk(A.building(isHuman ? 'castle_town' : 'stronghold', FACTIONS[f].fill), 1.0);
      this.place(sp, c.x, c.y + 20);
      // cờ tiến độ chiếm
      const label = new PIXI.Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fill: 0xffffff, stroke: { color: 0x1b1b1b, width: 4 }, fontWeight: 'bold' } });
      label.anchor.set(0.5, 1);
      label.position.set(c.x, c.y - 44);
      label.zIndex = c.y + 999;
      this.objects.addChild(label);
      this.holdLabel = this.holdLabel || {};
      this.holdLabel[f] = label;
    } else if (t === 'plain' && rng() < 0.12) {
      // cỏ cho đỡ trống
      const [px, py] = uv((rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6);
      const g = new PIXI.Graphics();
      g.moveTo(-4, 0).lineTo(-1, -6).moveTo(0, 0).lineTo(0, -8).moveTo(4, 0).lineTo(1, -6).stroke({ width: 1.4, color: 0x4a4a42 });
      g.scale.set(0.7);
      this.place(g, px, py + 4);
    }
  }

  setHold(state) {
    if (!this.holdLabel) return;
    for (const f of ['human', 'orc']) {
      const lab = this.holdLabel[f];
      if (!lab) continue;
      // thành của f bị phe kia chiếm: tiến độ nằm ở capture[phe kia]
      const att = f === 'human' ? 'orc' : 'human';
      const p = state.capture[att];
      lab.text = p > 0 ? `${p}/${CONFIG.captureTurns}` : '';
      lab.style.fill = FACTIONS[att].fill;
    }
  }

  // ---------- Đơn vị ----------
  makeUnit(u) {
    const A = this.assets;
    const res = A.unit(u.role, u.faction);
    const root = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 0, 20, 7).fill({ color: 0x000000, alpha: 0.18 });
    const body = new PIXI.Container();
    const sprite = new PIXI.Sprite(res.texture);
    sprite.anchor.set(res.anchor[0], res.anchor[1]);
    sprite.scale.set(1 / RES);
    body.addChild(sprite);
    const badge = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.circle(0, 0, 11).fill(FACTIONS[u.faction].fill).stroke({ width: 2, color: 0x1b1b1b });
    const txt = new PIXI.Text({ text: String(u.strength), style: { fontFamily: FONT, fontSize: 15, fill: 0xffffff, fontWeight: 'bold' } });
    txt.anchor.set(0.5);
    badge.addChild(bg, txt);
    badge.position.set(24, -8);
    const flag = new PIXI.Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fill: 0xd8402f, fontWeight: 'bold', stroke: { color: 0xffffff, width: 4 } } });
    flag.anchor.set(0.5, 1);
    flag.position.set(0, -(sprite.height) - 4);
    root.addChild(shadow, body, badge, flag);
    const c = tileToWorld(u.x, u.y);
    root.position.set(c.x, c.y + 8);
    root.zIndex = c.y + 8 + 0.1;
    this.objects.addChild(root);
    const us = { id: u.id, root, body, sprite, badge, txt, flag, shown: u.strength, facing: u.faction === 'human' ? 1 : -1, bx: 0, by: 0 };
    us.sprite.scale.x = Math.abs(us.sprite.scale.x) * (us.facing < 0 ? -1 : 1);
    this.sprites.set(u.id, us);
    return us;
  }

  setShown(us, n) {
    us.shown = n;
    us.txt.text = String(Math.max(0, n));
  }

  face(us, dx) {
    if (!dx) return;
    us.facing = dx > 0 ? 1 : -1;
    us.sprite.scale.x = Math.abs(us.sprite.scale.x) * us.facing;
  }

  // đồng bộ cứng sprite với state
  reconcile() {
    const s = this.state;
    const live = new Set(s.units.map((u) => u.id));
    for (const [id, us] of this.sprites) {
      if (!live.has(id)) { us.root.destroy({ children: true }); this.sprites.delete(id); }
    }
    for (const u of s.units) {
      let us = this.sprites.get(u.id);
      if (!us) us = this.makeUnit(u);
      const c = tileToWorld(u.x, u.y);
      us.root.position.set(c.x, c.y + 8);
      us.root.zIndex = c.y + 8.1;
      us.body.position.set(0, 0);
      this.setShown(us, u.strength);
      const mine = u.faction === s.current;
      us.body.alpha = mine && u.acted && u.status === 'ok' && !s.winner ? 0.55 : 1;
      us.flag.text = u.status === 'routed' ? this.t('ui.routed') : '';
    }
    this.setHold(s);
    this.requestRender();
  }

  // ---------- Overlay ----------
  setOverlay(o) {
    this.overlay = o || {};
    this.drawOverlay();
    this.requestRender();
  }

  drawOverlay() {
    const g = this.hl;
    g.clear();
    const o = this.overlay;
    const dia = (x, y, k = 1) => {
      const c = tileToWorld(x, y);
      return [c.x, c.y - (TH / 2) * k, c.x + (TW / 2) * k, c.y, c.x, c.y + (TH / 2) * k, c.x - (TW / 2) * k, c.y];
    };
    const dashed = (pts, color, width) => {
      const n = pts.length / 2;
      for (let i = 0; i < n; i++) {
        const ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[((i + 1) % n) * 2], by = pts[((i + 1) % n) * 2 + 1];
        const len = Math.hypot(bx - ax, by - ay), segs = Math.round(len / 9);
        for (let k = 0; k < segs; k++) {
          const t0 = k / segs, t1 = (k + 0.58) / segs;
          g.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0).lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
        }
      }
      g.stroke({ width, color, cap: 'round' });
    };
    const paint = (list, fill, alpha, stroke, dash = true) => {
      for (const p of list || []) {
        g.poly(dia(p.x, p.y, 0.96)).fill({ color: fill, alpha });
      }
      for (const p of list || []) {
        if (dash) dashed(dia(p.x, p.y, 0.92), stroke, 2.2);
        else g.poly(dia(p.x, p.y, 0.94), true).stroke({ width: 2.4, color: stroke });
      }
    };
    paint(o.move, 0xf2c200, 0.2, 0xd9a800);
    paint(o.split, 0x3a78d8, 0.25, 0x2a5aa8);
    paint(o.merge, 0x3aa86a, 0.28, 0x23844f);
    paint(o.attack, 0xd8402f, 0.28, 0xb02a1c, false);
    paint(o.threat, 0xd8402f, 0.1, 0xd8402f);
    if (o.dest) paint([o.dest], 0xf2c200, 0.4, 0x1b1b1b, false);
    if (o.selected) {
      g.poly(dia(o.selected.x, o.selected.y, 1), true).stroke({ width: 3.2, color: 0xf2c200 });
    }
    if (o.hover) dashed(dia(o.hover.x, o.hover.y, 0.8), 0x1b1b1b, 1.6);
    if (o.path && o.path.length > 1) {
      const pts = o.path.map((p) => tileToWorld(p.x, p.y));
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke({ width: 3, color: 0x1b1b1b, alpha: 0.65, cap: 'round', join: 'round' });
    }
  }

  // ---------- Tween / render ----------
  requestRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  frame(now) {
    this.raf = 0;
    const done = [];
    for (const tw of this.tweens) {
      if (tw.start === null) tw.start = now;
      const k = Math.min(1, (now - tw.start) / tw.dur);
      tw.fn(k);
      if (k >= 1) done.push(tw);
    }
    for (const tw of done) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.resolve(); }
    this.app.render();
    if (this.tweens.length) this.requestRender();
  }

  tween(ms, fn) {
    return new Promise((resolve) => {
      this.tweens.push({ dur: Math.max(1, ms / this.speed), fn, resolve, start: null });
      this.requestRender();
    });
  }

  // ---------- Camera ----------
  fit() {
    const b = this.mapBounds, W = this.app.screen.width, H = this.app.screen.height;
    const pad = 60;
    const z = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxY - b.minY));
    this.minZoom = z * 0.7;
    this.maxZoom = Math.max(z * 3, 1.6);
    this.setCamera(z, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
  }

  // Vào ván: màn nhỏ thì phóng vào quân ta cho đọc được, màn lớn thì xem toàn cục
  focusStart(faction = 'human') {
    this.fit();
    const minReadable = 0.62;
    if (this.zoom < minReadable) {
      const h = this.state.map.strongholds[faction];
      const c = tileToWorld(h.x, h.y);
      this.setCamera(minReadable, c.x + 60, c.y - 90);
    }
  }

  setCamera(zoom, cx, cy) {
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
    const b = this.mapBounds, W = this.app.screen.width, H = this.app.screen.height;
    cx = Math.min(b.maxX, Math.max(b.minX, cx));
    cy = Math.min(b.maxY, Math.max(b.minY, cy));
    this.cam = { x: cx, y: cy };
    this.world.scale.set(this.zoom);
    this.world.position.set(W / 2 - cx * this.zoom, H / 2 - cy * this.zoom);
    this.requestRender();
  }

  focus(x, y, ms = 350) {
    const c = tileToWorld(x, y);
    const a = { ...this.cam };
    return this.tween(ms, (k) => this.setCamera(this.zoom, a.x + (c.x - a.x) * ease(k), a.y + (c.y - a.y) * ease(k)));
  }

  // Chọn đơn vị theo thân sprite (người chơi chạm vào hình lính chứ không phải ô dưới chân)
  pickUnit(sx, sy) {
    const wx = (sx - this.world.position.x) / this.zoom, wy = (sy - this.world.position.y) / this.zoom;
    let best = null;
    for (const us of this.sprites.values()) {
      const hw = Math.max(us.sprite.width / 2, 20) + 4, top = us.sprite.height + 6;
      const dx = wx - us.root.x, dy = wy - us.root.y;
      if (Math.abs(dx) <= hw && dy >= -top && dy <= 12) {
        if (!best || us.root.zIndex > best.root.zIndex) best = us;
      }
    }
    if (!best) return null;
    const t = worldToTile(best.root.x, best.root.y - 8);
    return { x: t.x, y: t.y };
  }

  screenToTile(sx, sy) {
    const wx = (sx - this.world.position.x) / this.zoom, wy = (sy - this.world.position.y) / this.zoom;
    const t = worldToTile(wx, wy - 0);
    const { w, h } = this.state.map;
    return t.x < 0 || t.y < 0 || t.x >= w || t.y >= h ? null : t;
  }

  bindInput() {
    const el = this.app.canvas;
    const ptrs = new Map();
    let drag = null, pinch = null, moved = false;
    const rect = () => el.getBoundingClientRect();
    const pos = (e) => ({ x: e.clientX - rect().left, y: e.clientY - rect().top });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.hooks.onCancel?.(); });
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, pos(e));
      if (ptrs.size === 1) { drag = { ...pos(e), cam: { ...this.cam }, id: e.pointerId, btn: e.button }; moved = false; }
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.zoom };
        moved = true;
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.setCamera(pinch.zoom * (d / pinch.d), this.cam.x, this.cam.y);
        return;
      }
      if (drag && e.pointerId === drag.id && ptrs.size === 1) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if (!moved && Math.hypot(dx, dy) > 6) moved = true;
        if (moved) this.setCamera(this.zoom, drag.cam.x - dx / this.zoom, drag.cam.y - dy / this.zoom);
      } else if (e.pointerType === 'mouse' && !ptrs.size) {
        this.hooks.onHover?.(this.pickUnit(p.x, p.y) || this.screenToTile(p.x, p.y));
      }
    });
    const up = (e) => {
      const had = ptrs.has(e.pointerId);
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (drag && e.pointerId === drag.id) {
        if (had && !moved && e.type === 'pointerup' && drag.btn === 0) this.hooks.onTap?.(this.pickUnit(drag.x, drag.y) || this.screenToTile(drag.x, drag.y));
        drag = null;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = pos(e);
      const before = { wx: (p.x - this.world.position.x) / this.zoom, wy: (p.y - this.world.position.y) / this.zoom };
      const z = this.zoom * Math.exp(-e.deltaY * 0.0012);
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, z));
      // giữ điểm dưới con trỏ đứng yên
      const W = this.app.screen.width, H = this.app.screen.height;
      this.setCamera(this.zoom, before.wx - (p.x - W / 2) / this.zoom, before.wy - (p.y - H / 2) / this.zoom);
    }, { passive: false });
    window.addEventListener('resize', () => this.requestRender());
  }

  // ---------- Hiệu ứng ----------
  float(text, x, y, color = 0xffffff, size = 24) {
    const tx = new PIXI.Text({
      text, style: { fontFamily: FONT, fontSize: size, fill: color, fontWeight: 'bold', stroke: { color: 0x1b1b1b, width: 5 } },
    });
    tx.anchor.set(0.5, 1);
    tx.position.set(x, y);
    this.fx.addChild(tx);
    return this.tween(900, (k) => {
      tx.y = y - 34 * ease(k);
      tx.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      if (k >= 1) tx.destroy();
    });
  }

  unitPos(id) {
    const us = this.sprites.get(id);
    return us ? { x: us.root.x, y: us.root.y } : null;
  }

  async lunge(aId, bId) {
    const a = this.sprites.get(aId), b = this.sprites.get(bId);
    if (!a || !b) return;
    const dx = b.root.x - a.root.x, dy = b.root.y - a.root.y;
    this.face(a, dx);
    const len = Math.hypot(dx, dy) || 1;
    const f = 18 / len;
    await this.tween(110, (k) => { a.body.position.set(dx * f * ease(k), dy * f * ease(k)); });
    await this.tween(130, (k) => { a.body.position.set(dx * f * (1 - ease(k)), dy * f * (1 - ease(k))); });
  }

  async shoot(aId, bId) {
    const a = this.sprites.get(aId), b = this.sprites.get(bId);
    if (!a || !b) return;
    this.face(a, b.root.x - a.root.x);
    const g = new PIXI.Graphics();
    this.fx.addChild(g);
    const ax = a.root.x, ay = a.root.y - 34, bx = b.root.x, by = b.root.y - 28;
    const arc = Math.hypot(bx - ax, by - ay) * 0.25;
    await this.tween(320, (k) => {
      const x = ax + (bx - ax) * k, y = ay + (by - ay) * k - Math.sin(k * Math.PI) * arc;
      const k2 = Math.max(0, k - 0.06);
      const x0 = ax + (bx - ax) * k2, y0 = ay + (by - ay) * k2 - Math.sin(k2 * Math.PI) * arc;
      g.clear().moveTo(x0, y0).lineTo(x, y).stroke({ width: 3, color: 0x1b1b1b, cap: 'round' });
    });
    g.destroy();
  }

  async hitFlash(id) {
    const us = this.sprites.get(id);
    if (!us) return;
    await this.tween(180, (k) => {
      us.body.position.set(Math.sin(k * Math.PI * 6) * 3 * (1 - k), 0);
      us.sprite.tint = k < 0.9 ? 0xff8a7a : 0xffffff;
    });
    us.body.position.set(0, 0);
    us.sprite.tint = 0xffffff;
  }

  async playEvents(events) {
    const s = this.state;
    for (const ev of events) {
      switch (ev.type) {
        case 'turn': break;
        case 'move': {
          const us = this.sprites.get(ev.unit);
          if (!us) break;
          const pts = ev.path.map((p) => tileToWorld(p.x, p.y + 0));
          const per = Math.min(130, 700 / Math.max(1, pts.length - 1));
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            this.face(us, b.x - a.x);
            const bob = (k) => Math.abs(Math.sin(k * Math.PI)) * 5;
            await this.tween(per, (k) => {
              us.root.position.set(a.x + (b.x - a.x) * k, a.y + 8 + (b.y - a.y) * k);
              us.root.zIndex = us.root.y + 0.1;
              us.body.position.set(0, -bob(k));
            });
          }
          us.body.position.set(0, 0);
          break;
        }
        case 'attack': {
          const ranged = ev.attackerRole === 'archer';
          if (ranged) await this.shoot(ev.attacker, ev.defender); else await this.lunge(ev.attacker, ev.defender);
          break;
        }
        case 'counter': {
          if (ev.attackerRole === 'archer') await this.shoot(ev.attacker, ev.defender); else await this.lunge(ev.attacker, ev.defender);
          break;
        }
        case 'damage': {
          const us = this.sprites.get(ev.unit);
          if (!us) break;
          this.setShown(us, us.shown - ev.amount);
          this.float(`-${ev.amount}`, us.root.x, us.root.y - 50, 0xff6a58, 26);
          await this.hitFlash(ev.unit);
          break;
        }
        case 'die': {
          const us = this.sprites.get(ev.unit);
          if (!us) break;
          this.float('✕', us.root.x, us.root.y - 40, 0xffffff, 28);
          await this.tween(380, (k) => { us.root.alpha = 1 - k; us.body.scale.set(1 - 0.3 * k); });
          us.root.destroy({ children: true });
          this.sprites.delete(ev.unit);
          break;
        }
        case 'rout': {
          const us = this.sprites.get(ev.unit);
          if (us) { us.flag.text = this.t('ui.routed'); this.float(this.t('ui.routed'), us.root.x, us.root.y - 56, 0xffd54a, 22); }
          await wait(250 / this.speed);
          break;
        }
        case 'recover': {
          const us = this.sprites.get(ev.unit);
          if (us) { us.flag.text = ''; this.float(this.t('ui.recovered'), us.root.x, us.root.y - 56, 0xa6e8b8, 20); }
          break;
        }
        case 'heal': {
          const us = this.sprites.get(ev.unit);
          if (us) { this.setShown(us, us.shown + ev.amount); this.float(`+${ev.amount}`, us.root.x, us.root.y - 50, 0x7be0a0, 24); }
          break;
        }
        case 'merge': {
          const tg = this.sprites.get(ev.target);
          if (tg) {
            this.setShown(tg, tg.shown + ev.amount);
            this.float(`+${ev.amount}`, tg.root.x, tg.root.y - 50, 0x7be0a0, 26);
            const src = this.sprites.get(ev.unit);
            if (src) this.setShown(src, src.shown - ev.amount);
          }
          await wait(250 / this.speed);
          break;
        }
        case 'vanish': {
          const us = this.sprites.get(ev.unit);
          if (us) { await this.tween(200, (k) => { us.root.alpha = 1 - k; }); us.root.destroy({ children: true }); this.sprites.delete(ev.unit); }
          break;
        }
        case 'split': {
          const src = this.sprites.get(ev.unit);
          const nu = s.units.find((u) => u.id === ev.newUnit);
          if (nu) {
            const us = this.makeUnit(nu);
            if (src) { this.setShown(src, src.shown - nu.strength); }
            us.root.alpha = 0;
            await this.tween(240, (k) => { us.root.alpha = k; });
          }
          break;
        }
        case 'capture': {
          const hold = s.map.strongholds[ev.faction === 'human' ? 'orc' : 'human'];
          const c = tileToWorld(hold.x, hold.y);
          this.setHold(s);
          await this.float(`${ev.progress}/${CONFIG.captureTurns}`, c.x, c.y - 60, 0xffd54a, 30);
          break;
        }
        default: break;
      }
    }
    this.reconcile();
  }
}
