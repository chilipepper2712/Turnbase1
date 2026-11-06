// Lớp hiển thị Pixi: isometric, chunk bake cho nền, sprite có z-sort, camera, animation.
// Render-on-demand: không có gì thay đổi thì không vẽ lại (đỡ nóng máy).
import { CONFIG, FACTIONS } from '../config.js';
import { hash2, makeRng } from '../rng.js';
import { terrainId, levelOf } from '../rules.js';
import { RES } from './assets.js';
import { drawGroundTile, makeCanvas, drawCloud, INK } from './doodle.js';

export const TW = 96, TH = 48;
const CHUNK = 8;
const PAPER = '#f6f5f0';
// Pha màu phe với giấy: thành tô nhạt để quân cùng màu đứng cạnh không bị lẫn vào
function mixPaper(hex, t) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), p = [1, 3, 5].map((i) => parseInt(PAPER.slice(i, i + 2), 16));
  return '#' + c.map((v, i) => Math.round(v * (1 - t) + p[i] * t).toString(16).padStart(2, '0')).join('');
}
const FONT = '-apple-system,"Segoe UI",Roboto,"Noto Sans","Helvetica Neue",Arial,sans-serif';

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
    this.features = [];             // sprite công trình / núi / đồi, để chọn theo hình
    this.tweens = [];
    this.raf = 0;
    this.hooks = {};
    this.snd = () => {};            // Game gắn hàm phát âm thanh vào đây
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
    this.cloudShadow = new PIXI.Container();   // bóng mây đổ lên nền: dưới ô tô màu và quân
    this.cloudLayer = new PIXI.Container();    // mây: trên cùng
    this.world.addChild(this.ground, this.cloudShadow, this.hl, this.objects, this.fx, this.cloudLayer);
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
    this.features = [];
    this.holdLabel = null;
    for (let j = 0; j < h; j += CHUNK) {
      for (let i = 0; i < w; i += CHUNK) this.bakeChunk(i, j);
    }
    this.drawBorder();
    this.buildClouds();
    // trang trí đối tượng
    this.deco = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.placeDeco(x, y);
    this.drawGoal();
  }

  // Ô đích của nhiệm vụ hộ tống: ô vàng nhạt + cờ cắm giữa ô
  drawGoal() {
    const m = this.state.mission;
    if (!m || !m.goal) return;
    const c = tileToWorld(m.goal.x, m.goal.y);
    const g = new PIXI.Graphics();
    const hw = TW / 2, hh = TH / 2;
    g.poly([c.x, c.y - hh, c.x + hw, c.y, c.x, c.y + hh, c.x - hw, c.y], true)
      .fill({ color: 0xe0a800, alpha: 0.32 }).stroke({ width: 3, color: 0xe0a800, join: 'round' });
    g.moveTo(c.x, c.y + 4).lineTo(c.x, c.y - 34).stroke({ width: 2.6, color: 0x1b1b1b, cap: 'round' });
    g.poly([c.x, c.y - 34, c.x + 20, c.y - 27, c.x, c.y - 19], true).fill(0xe0a800).stroke({ width: 1.8, color: 0x1b1b1b, join: 'round' });
    g.zIndex = c.y + 1;
    this.objects.addChild(g);
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

  place(sprite, wx, wy, z, tile) {
    sprite.position.set(wx, wy);
    sprite.zIndex = z ?? wy;
    this.objects.addChild(sprite);
    // sprite cao hơn ô (lâu đài, tháp, núi...): nhớ lại để chạm vào hình thì trúng đúng ô của nó
    if (tile) this.features.push({ sprite, x: tile.x, y: tile.y });
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
        const [px, py] = uv((rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5);
        if (A.has('treePine')) {
          const name = ['treePine', 'treePineLarge', 'treePineLarge', 'treePine'][rng.int(4)];
          this.place(this.mk(A.building(name, PAPER, 0.97), 0.85 + rng() * 0.25), px, py + 7);
        } else {
          this.place(this.mk(A.deco('tree', rng.int(4)), 0.78 + rng() * 0.2), px, py + 8);
        }
      }
    } else if (t === 'hill') {
      // đúng một nấm đồi nằm gọn giữa ô
      this.place(this.mk(A.deco('hill', rng.int(3)), 0.72), c.x, c.y + 12, c.y + 2, { x, y });
    } else if (t === 'peak') {
      if (A.has('rocksMountain')) this.place(this.mk(A.building(['rocksMountain', 'rocksTall', 'rocksA'][rng.int(3)], PAPER, 0.97), 1), c.x, c.y + 14, undefined, { x, y });
      else this.place(this.mk(A.deco('mountain', rng.int(3)), 0.66), c.x, c.y + 16, undefined, { x, y });
    } else if (t === 'mountain') {
      // núi thấp: nhỏ, nằm sau quân đứng cùng ô để quân vẫn lấp ló khi đi vào
      if (A.has('rocks')) this.place(this.mk(A.building(['rocks', 'rocksB'][rng.int(2)], PAPER, 0.97), 0.9), c.x, c.y + 11, c.y + 2, { x, y });
      else this.place(this.mk(A.deco('mountain', rng.int(3)), 0.46), c.x, c.y + 11, c.y + 2, { x, y });
    } else if (t === 'mine') {
      if (A.has('mine')) this.place(this.mk(A.building('mine', PAPER, 0.97), 1), c.x, c.y + 12, c.y + 2, { x, y });
      else this.place(this.mk(A.deco('mine', 0), 0.72), c.x, c.y + 12, c.y + 2, { x, y });
    } else if (t === 'village') {
      if (A.has('houses')) {
        const kname = ['houses', 'houseChimney', 'houseViking', 'houseTall', 'houses', 'mill'][rng.int(6)];
        this.place(this.mk(A.building(kname, PAPER, 0.97), 1), c.x, c.y + 12, c.y + 2, { x, y });
      } else {
        const name = ['village_a', 'village_b', 'cottages'][rng.int(3)];
        this.place(this.mk(A.building(name)), c.x, c.y + 14, c.y + 2, { x, y });
      }
    } else if (t === 'fort') {
      if (A.has('towerWatch')) {
        this.place(this.mk(A.building(['towerWatch', 'tower', 'watchtower'][rng.int(3)], PAPER, 0.97), 1), c.x, c.y + 12, c.y + 2, { x, y });
      } else {
        this.place(this.mk(A.building(rng() < 0.5 ? 'tower_a' : 'tower_b')), c.x, c.y + 16, c.y + 2, { x, y });
      }
    } else if (t === 'stronghold') {
      const own = this.state.map.strongholds;
      const isHuman = own.human.x === x && own.human.y === y;
      const f = isHuman ? 'human' : 'orc';
      const kenney = A.has('castle') && A.has('castleTall');
      const sp = kenney
        ? this.mk(A.building(isHuman ? 'castle' : 'castleTall', mixPaper(FACTIONS[f].fill, 0.55), 0.97), 1.0)
        : this.mk(A.building(isHuman ? 'castle_town' : 'stronghold', FACTIONS[f].fill), 1.0);
      this.place(sp, c.x, c.y + (kenney ? 14 : 20), c.y + 2, { x, y });
      // cờ tiến độ chiếm
      const label = new PIXI.Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fill: 0xffffff, stroke: { color: 0x1b1b1b, width: 4 }, fontWeight: 'bold' } });
      label.anchor.set(0.5, 1);
      label.position.set(c.x, sp.y - sp.height * sp.anchor.y - 4);
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
    // thành mục tiêu (nhiệm vụ phá thành) là đơn vị tĩnh nằm đúng trên ô thành: hình thành đã có sẵn, ở đây chỉ hiện huy hiệu máu
    const res = A.unit(u.static ? 'infantry' : u.role, u.faction);
    const root = new PIXI.Container();
    // bóng xám nhẹ dưới chân (phe được phân biệt bằng hình quân và huy hiệu số)
    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 0, 22, 7).fill({ color: 0x000000, alpha: 0.14 });
    const body = new PIXI.Container();
    const sprite = new PIXI.Sprite(res.texture);
    sprite.anchor.set(res.anchor[0], res.anchor[1]);
    sprite.scale.set(1 / RES);
    if (u.static) { sprite.visible = false; shadow.visible = false; }
    body.addChild(sprite);
    const badge = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.circle(0, 0, 11).fill(FACTIONS[u.faction].fill).stroke({ width: 2, color: 0x1b1b1b });
    const txt = new PIXI.Text({ text: String(u.strength), style: { fontFamily: FONT, fontSize: 15, fill: 0xffffff, fontWeight: 'bold' } });
    txt.anchor.set(0.5);
    badge.addChild(bg, txt);
    badge.position.set(24, -8);
    const fortG = new PIXI.Container();
    const stars = new PIXI.Graphics();          // quân hàm: các vạch ^ vẽ bằng code
    stars.position.set(24, -22);
    const flag = new PIXI.Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fill: 0xd8402f, fontWeight: 'bold', stroke: { color: 0xffffff, width: 4 } } });
    flag.anchor.set(0.5, 1);
    flag.position.set(0, -(sprite.height) - 4);
    root.addChild(shadow, body, fortG, badge, stars, flag);
    if (u.vip) {
      // cờ vàng của tướng hộ tống: cán + cờ tam giác, viền mực
      const vg = new PIXI.Graphics();
      vg.moveTo(-22, 2).lineTo(-22, -34).stroke({ width: 2.4, color: 0x1b1b1b, cap: 'round' });
      vg.poly([-22, -34, -4, -28, -22, -21], true).fill(0xe0a800).stroke({ width: 1.6, color: 0x1b1b1b, join: 'round' });
      root.addChild(vg);
    }
    const c = tileToWorld(u.x, u.y);
    root.position.set(c.x, c.y + 8);
    root.zIndex = c.y + 8 + 0.1;
    this.objects.addChild(root);
    const us = { id: u.id, root, body, sprite, badge, txt, flag, fortG, stars, fort: -1, shown: u.strength, facing: u.static || u.faction === 'human' ? 1 : -1, bx: 0, by: 0 };
    us.sprite.scale.x = Math.abs(us.sprite.scale.x) * (us.facing < 0 ? -1 : 1);
    this.sprites.set(u.id, us);
    return us;
  }

  // Quân hàm: n vạch ^ vàng viền mực xếp chồng (vạch trên cùng là vạch cuối), đáy neo ngay trên huy hiệu số quân
  drawStars(us, n) {
    if (us.starN === n) return;
    us.starN = n;
    const g = us.stars; g.clear();
    const W = 6.5, H = 4.5, gap = 5.2;
    const draw = (width, color) => {
      for (let i = 0; i < n; i++) {
        const y = -i * gap;
        g.moveTo(-W, y).lineTo(0, y - H).lineTo(W, y).stroke({ width, color, join: 'round', cap: 'round' });
      }
    };
    draw(5, 0x1b1b1b);      // viền mực trước, rồi vàng đè lên để các vạch không ăn vào nhau
    draw(2.6, 0xe0a800);
  }

  // Hàng rào trước chân khi đã hạ trại (sprite Kenney; không có thì vẽ cọc bằng code)
  drawFort(us, mode) {
    if (us.fort === mode) return;
    us.fort = mode;
    const box = us.fortG;
    box.removeChildren().forEach((c) => c.destroy());
    if (!mode) return;
    if (this.assets.has('fence')) {
      const sp = this.mk(this.assets.building('fence', PAPER, 0.8), 0.95);
      sp.position.set(0, 9);
      box.addChild(sp);
      return;
    }
    const g = new PIXI.Graphics();
    for (let i = -3; i <= 3; i++) {
      const x = i * 6.5;
      g.moveTo(x, 9).lineTo(x - 0.8, -4).lineTo(x + 2.2, 9);
    }
    g.stroke({ width: 1.8, color: 0x1b1b1b, join: 'round' });
    g.moveTo(-21, 4).lineTo(21, 4).stroke({ width: 1.6, color: 0x1b1b1b });
    box.addChild(g);
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
      this.drawStars(us, levelOf(u.xp || 0));
      this.drawFort(us, u.fort || 0);
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

  // Quy ước màu (chỉ tô ô, không viền nét đứt):
  //   vàng = đi được · đỏ = đánh được · xanh lá = gộp quân · xanh dương = chỗ đặt đội tách
  //   chấm tròn đỏ ở giữa ô = tầm bắn, nằm chồng lên ô vàng mà vẫn đọc được cả hai
  drawOverlay() {
    const g = this.hl;
    g.clear();
    const o = this.overlay;
    const dia = (x, y, k = 1) => {
      const c = tileToWorld(x, y);
      return [c.x, c.y - (TH / 2) * k, c.x + (TW / 2) * k, c.y, c.x, c.y + (TH / 2) * k, c.x - (TW / 2) * k, c.y];
    };
    const paint = (list, color, alpha, k = 0.97) => {
      for (const p of list || []) g.poly(dia(p.x, p.y, k)).fill({ color, alpha });
    };
    paint(o.threat, 0xd8402f, 0.16);
    paint(o.move, 0xf2c200, 0.38);
    paint(o.split, 0x3a78d8, 0.38);
    paint(o.merge, 0x3aa86a, 0.42);
    paint(o.attack, 0xd8402f, 0.42);
    for (const p of o.range || []) {
      const c = tileToWorld(p.x, p.y);
      g.ellipse(c.x, c.y, 13, 6.5).fill({ color: 0xd8402f, alpha: 0.88 });      // oval 2:1 nằm trên mặt đất isometric
    }
    if (o.dest) paint([o.dest], 0xf2c200, 0.6);
    if (o.selected) g.poly(dia(o.selected.x, o.selected.y, 1), true).stroke({ width: 3, color: 0xf2c200 });
    if (o.hover) g.poly(dia(o.hover.x, o.hover.y, 0.9), true).stroke({ width: 1.6, color: 0x1b1b1b, alpha: 0.55 });
    if (o.path && o.path.length > 1) {
      const pts = o.path.map((p) => tileToWorld(p.x, p.y));
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke({ width: 3, color: 0x1b1b1b, alpha: 0.65, cap: 'round', join: 'round' });
    }
  }

  // ---------- Tween / render ----------
  // ---------- Chuyển động nền (idle thở + mây) ----------
  // Một vòng lặp chung ~10 khung/giây cho cả hai. Dừng khi tab ẩn. Cả hai tắt thì không vẽ gì (cơ chế vẽ-khi-cần).
  setIdle(on) { this.idleOn = !!on; if (!on) { for (const us of this.sprites.values()) us.body.scale.y = 1; this.requestRender(); } this.startAmbient(); }
  setClouds(on) { this.cloudsOn = !!on; this.cloudLayer.visible = this.cloudShadow.visible = this.cloudsOn; this.requestRender(); this.startAmbient(); }

  startAmbient() {
    clearTimeout(this._ambT);
    if (!this.idleOn && !this.cloudsOn) return;
    const tick = () => {
      if (!this.idleOn && !this.cloudsOn) return;
      if (!document.hidden && this.app && !this.tweens.length) {
        if (this.idleOn) this.updateIdle();
        if (this.cloudsOn) this.updateClouds();
        this.app.render();
      }
      this._ambT = setTimeout(tick, 100);
    };
    tick();
  }

  updateIdle() {
    const W = this.app.screen.width, H = this.app.screen.height, t = performance.now() / 1000;
    for (const us of this.sprites.values()) {
      const sx = us.root.x * this.zoom + this.world.position.x, sy = us.root.y * this.zoom + this.world.position.y;
      if (sx < -80 || sx > W + 80 || sy < -120 || sy > H + 80) continue;
      us.body.scale.y = 1 + 0.018 * Math.sin(t * 2.2 + (us.id * 1.7) % 6.283);
    }
  }

  // Mây: vị trí là hàm của thời gian (không giữ trạng thái), nên vẽ lúc nào cũng khớp. Trôi theo một hướng gió,
  // mờ dần khi ra khỏi / vào mép bản đồ rồi quay lại từ phía đầu gió.
  buildClouds() {
    for (const c of [this.cloudShadow, this.cloudLayer]) c.removeChildren().forEach((x) => x.destroy());
    this.clouds = [];
    const { w, h } = this.state.map;
    const rng = makeRng((this.state.map.seed || 1) * 31 + 7);
    const n = Math.max(4, Math.round((w * h) / 70));
    const imgs = this.assets.cloudImgs || [];
    let tex;
    if (imgs.length) {
      tex = imgs.map((im) => ({ cloud: PIXI.Texture.from(im), w: im.width, h: im.height }));
    } else {                                              // dự phòng: mây vẽ bằng code
      tex = [0, 1, 2, 3].map((i) => { const v = drawCloud(500 + i * 17, RES); return { cloud: PIXI.Texture.from(v.cloud), w: v.w * RES, h: v.h * RES }; });
    }
    // bóng: hình oval xám đặc (dẹt theo phối cảnh isometric), độ đục chỉnh bằng alpha của sprite
    const oc = makeCanvas(256, 128), octx = oc.getContext('2d');
    octx.translate(128, 64); octx.scale(1, 0.5);                 // vòng tròn bị ép dẹt thành oval 2:1
    const gr = octx.createRadialGradient(0, 0, 0, 0, 0, 126);   // mép mềm: đặc ở giữa, tan dần ra ngoài
    gr.addColorStop(0, 'rgba(42,44,48,1)'); gr.addColorStop(0.5, 'rgba(42,44,48,0.85)'); gr.addColorStop(1, 'rgba(42,44,48,0)');
    octx.fillStyle = gr; octx.beginPath(); octx.arc(0, 0, 126, 0, Math.PI * 2); octx.fill();
    const ovalTex = PIXI.Texture.from(oc);
    this.windLen = w + 8;
    for (let i = 0; i < n; i++) {
      const v = tex[rng.int(tex.length)], width = 150 + rng() * 120;     // bề ngang mây trong thế giới (ô rộng 96)
      const cloud = new PIXI.Sprite(v.cloud); cloud.anchor.set(0.5); cloud.scale.set(width / v.w);
      const shadow = new PIXI.Sprite(ovalTex); shadow.anchor.set(0.5);
      shadow.width = width * 0.68; shadow.height = width * 0.68 * 0.5;   // nhỏ hơn 15% so với trước (0.8)
      this.cloudShadow.addChild(shadow); this.cloudLayer.addChild(cloud);
      this.clouds.push({ cloud, shadow, phase: rng() * this.windLen, speed: 0.22 + rng() * 0.18, lane: rng() * (h + 6) - 3, drift: 0.22 + rng() * 0.1 });
    }
    this.cloudLayer.visible = this.cloudShadow.visible = this.cloudsOn !== false;
    this.updateClouds();
  }

  updateClouds() {
    if (!this.clouds) return;
    const { w, h } = this.state.map, t = performance.now() / 1000, M = 4;
    for (const c of this.clouds) {
      const s = (c.phase + t * c.speed) % this.windLen;
      const tx = s - M, ty = c.lane + c.drift * s;               // tọa độ ô (liên tục), gió thổi theo +x và hơi +y
      const p = tileToWorld(tx, ty);
      // mờ dần theo khoảng cách ra ngoài mép bản đồ
      const out = Math.max(-tx, tx - (w - 1), -ty, ty - (h - 1), 0);
      const k = Math.max(0, 1 - out / 3.2);
      c.cloud.position.set(p.x, p.y - 150);                      // mây bay cao, ít che bản đồ
      c.shadow.position.set(p.x + 30, p.y + 6);                  // bóng oval trên nền
      c.cloud.alpha = 0.75 * k; c.shadow.alpha = 0.28 * k;
      c.cloud.visible = c.shadow.visible = k > 0.01;
    }
  }

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
    if (this.cloudsOn) this.updateClouds();
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
    this.hooks.onCamera?.();
  }

  // Toạ độ màn hình (px, theo cửa sổ) của tâm một ô
  tileScreen(x, y) {
    const c = tileToWorld(x, y), r = this.app.canvas.getBoundingClientRect();
    return { x: r.left + this.world.position.x + c.x * this.zoom, y: r.top + this.world.position.y + c.y * this.zoom };
  }

  focus(x, y, ms = 350) {
    const c = tileToWorld(x, y);
    const a = { ...this.cam };
    return this.tween(ms, (k) => this.setCamera(this.zoom, a.x + (c.x - a.x) * ease(k), a.y + (c.y - a.y) * ease(k)));
  }

  // Chọn đơn vị theo thân sprite (người chơi chạm vào hình lính chứ không phải ô dưới chân)
  pickUnit(sx, sy) {
    const wx = (sx - this.world.position.x) / this.zoom, wy = (sy - this.world.position.y) / this.zoom;
    let best = null, bestD = Infinity;
    for (const us of this.sprites.values()) {
      const hw = Math.max(us.sprite.width / 2, 20) + 4, top = us.sprite.height + 6;
      const dx = wx - us.root.x, dy = wy - us.root.y;
      if (Math.abs(dx) > hw || dy < -top || dy > 12) continue;
      // nhiều quân đứng chồng lên nhau: chọn quân có tâm thân gần điểm chạm nhất
      const cy = -us.sprite.height * 0.5;
      const d = Math.hypot(dx, (dy - cy) * 0.8);
      if (d < bestD) { best = us; bestD = d; }
    }
    if (!best) return null;
    const t = worldToTile(best.root.x, best.root.y - 8);
    return { x: t.x, y: t.y };
  }

  // Chạm vào hình công trình / núi / đồi thì trả về ô của nó (hình cao hơn ô nên ô hình học nằm phía sau hình)
  pickFeature(sx, sy) {
    const wx = (sx - this.world.position.x) / this.zoom, wy = (sy - this.world.position.y) / this.zoom;
    let best = null;
    for (const f of this.features) {
      const sp = f.sprite;
      const w = sp.width, h = sp.height;
      const left = sp.x - w * sp.anchor.x, top = sp.y - h * sp.anchor.y;
      // thu hẹp mép trong suốt: chỉ tính phần thân
      const inX = wx >= left + w * 0.15 && wx <= left + w * 0.85;
      const inY = wy >= top + h * 0.1 && wy <= top + h * 1.0;
      if (!inX || !inY) continue;
      if (!best || f.x + f.y > best.x + best.y) best = f;   // vật nằm phía trước đè lên vật phía sau
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  // Điểm chạm -> ô. Thứ tự ưu tiên:
  //  1. ô dưới điểm chạm nếu nó đang là ô hành động được (đi / đánh / gộp / tách): quân đứng phía trước che ô đó vẫn không cản
  //  2. quân có thân nằm dưới điểm chạm (sprite cao hơn ô)
  //  3. công trình / núi / đồi có hình nằm dưới điểm chạm
  //  4. ô dưới điểm chạm
  pickAt(sx, sy) {
    const tile = this.screenToTile(sx, sy);
    if (tile && this.hooks.isActionable?.(tile)) return tile;
    return this.pickUnit(sx, sy) || this.pickFeature(sx, sy) || tile;
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
    let drag = null, pinch = null, moved = false, lpTimer = 0;
    const clearLp = () => { clearTimeout(lpTimer); lpTimer = 0; };
    const rect = () => el.getBoundingClientRect();
    const pos = (e) => ({ x: e.clientX - rect().left, y: e.clientY - rect().top });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.hooks.onCancel?.(); });
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, pos(e));
      if (ptrs.size === 1) {
        drag = { ...pos(e), cam: { ...this.cam }, id: e.pointerId, btn: e.button }; moved = false;
        // giữ ngón tay ~0.45s trên một ô = xem thông tin địa hình/đơn vị (không có chuột để hover)
        clearLp();
        if (e.pointerType !== 'mouse') {
          lpTimer = setTimeout(() => {
            if (drag && !moved) { moved = true; this.hooks.onLongPress?.(this.pickAt(drag.x, drag.y)); }
          }, 450);
        }
      }
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
        if (!moved && Math.hypot(dx, dy) > 8) { moved = true; clearLp(); }
        if (moved) this.setCamera(this.zoom, drag.cam.x - dx / this.zoom, drag.cam.y - dy / this.zoom);
      } else if (e.pointerType === 'mouse' && !ptrs.size) {
        this.hooks.onHover?.(this.pickAt(p.x, p.y));
      }
    });
    const up = (e) => {
      clearLp();
      const had = ptrs.has(e.pointerId);
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (drag && e.pointerId === drag.id) {
        if (had && !moved && e.type === 'pointerup' && drag.btn === 0) this.hooks.onTap?.(this.pickAt(drag.x, drag.y));
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

  // Âm thanh cho từng sự kiện luật (tiếng bước gắn riêng theo từng ô trong 'move')
  soundFor(ev) {
    const role = ev.attackerRole;
    switch (ev.type) {
      case 'attack': case 'counter':
        this._shooter = role === 'archer';
        this.snd(role === 'archer' ? 'bow_shoot' : role === 'militia' ? 'attack_spear'
          : role === 'cavalry' && ev.preview?.detail?.charge > 1 ? 'attack_charge' : 'attack_melee');
        break;
      case 'damage': this.snd(this._shooter ? 'arrow_hit' : 'hit_flesh'); break;
      case 'die': this.snd('unit_die'); break;
      case 'rout': this.snd('rout'); break;
      case 'heal': this.snd('heal'); break;
      case 'merge': this.snd('merge'); break;
      case 'split': this.snd('split'); break;
      case 'fortify': this.snd('fortify'); break;
      case 'levelup': this.snd('levelup'); break;
      case 'capture': this.snd('capture'); break;
      default: break;
    }
  }

  async playEvents(events) {
    const s = this.state;
    for (const ev of events) {
      this.soundFor(ev);
      switch (ev.type) {
        case 'turn': break;
        case 'move': {
          const us = this.sprites.get(ev.unit);
          if (!us) break;
          const pts = ev.path.map((p) => tileToWorld(p.x, p.y + 0));
          const per = Math.min(130, 700 / Math.max(1, pts.length - 1));
          const u = s.units.find((q) => q.id === ev.unit);
          const walk = u ? this.assets.walk(u.role, u.faction) : null;
          const still = us.sprite.texture;
          let elapsed = 0;                                   // ms đã đi, quyết định frame bước
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            this.snd(u && u.role === 'cavalry' ? 'step_horse' : 'step_foot');
            this.face(us, b.x - a.x);
            const bob = (k) => Math.abs(Math.sin(k * Math.PI)) * 5;
            await this.tween(per, (k) => {
              us.root.position.set(a.x + (b.x - a.x) * k, a.y + 8 + (b.y - a.y) * k);
              us.root.zIndex = us.root.y + 0.1;
              if (walk) {
                const f = Math.floor(((elapsed + k * per) / 1000) * walk.fps) % walk.textures.length;
                us.sprite.texture = walk.textures[f];
                us.body.position.set(0, 0);
              } else us.body.position.set(0, -bob(k));
            });
            elapsed += per;
          }
          if (walk) us.sprite.texture = still;
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
        case 'fortify': {
          const us = this.sprites.get(ev.unit);
          if (us) { this.drawFort(us, 2); this.float(this.t('float.fortify'), us.root.x, us.root.y - 52, 0xd9d9cf, 20); }
          await wait(220 / this.speed);
          break;
        }
        case 'levelup': {
          const us = this.sprites.get(ev.unit);
          if (us) {
            this.drawStars(us, ev.level);
            this.float(this.t('float.levelup', { n: ev.level }), us.root.x, us.root.y - 58, 0xffd54a, 22);
            await wait(260 / this.speed);
          }
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
        case 'reinforce': {
          const us = ev.units.map((id) => s.units.find((u) => u.id === id)).filter(Boolean).map((u) => this.makeUnit(u));
          us.forEach((x) => { x.root.alpha = 0; });
          if (us.length) await this.ensureVisible(s.units.find((u) => u.id === ev.units[0]).x, s.units.find((u) => u.id === ev.units[0]).y);
          await this.tween(350, (k) => { us.forEach((x) => { x.root.alpha = k; }); });
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
