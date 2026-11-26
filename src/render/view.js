// Lớp hiển thị Pixi: isometric, chunk bake cho nền, sprite có z-sort, camera, animation.
// Render-on-demand: không có gì thay đổi thì không vẽ lại (đỡ nóng máy).
import { CONFIG, FACTIONS } from '../config.js';
import { hash2, makeRng } from '../rng.js';
import { terrainId, levelOf, graveWait, graveInRange } from '../rules.js';
import { RES, TERRAIN_DECO } from './assets.js';
import { drawGroundTile, makeCanvas, drawCloud, INK } from './doodle.js';
import { paintPixelGround } from './pixelground.js';
import { makePixelCloud } from './pixelcloud.js';
import { windVec } from '../weather.js';
// mây đen: tốc độ trôi (ô/giây, mây trắng ~0.2-0.4) và khoảng được trôi vượt trước vị trí luật
const STORM_SPEED = 0.06, STORM_LEAD = 0.9;
import { seenMask } from '../fog.js';
import { WEATHER } from '../config.js';

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
    this.tileStyle = 'doodle';      // 'pixel' = nền phẳng + vật thể pixel art; 'doodle' = nền giấy vẽ tay
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
    this.waterFx = new PIXI.Graphics();          // đốm nước lấp lánh (chỉ nền pixel), nằm trên nền, dưới quân
    this.stormShadow = new PIXI.Container();   // bóng mây đen (thời tiết thật): luôn hiện, không theo nút tắt mây
    this.storm = new PIXI.Container();         // mây đen + vệt mưa
    this.fogLayer = new PIXI.Graphics();       // sương mù chiến tranh: phủ tối các ô phe người chơi không thấy
    this.world.addChild(this.ground, this.waterFx, this.cloudShadow, this.stormShadow, this.hl, this.objects, this.fogLayer, this.fx, this.cloudLayer, this.storm);
    app.stage.addChild(this.world);
    this.zoom = 1;
    this.buildMap();
    this.reconcile();
    this.bindInput();
    this.fit();
    return this;
  }

  // Bắt đầu ván mới trên cùng renderer
  // phe đang ngồi trước màn hình: quân ẩn của phe kia không được vẽ
  get viewer() { return this._viewer || 'human'; }
  set viewer(f) { this._viewer = f; }

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
    this.boatSprites = new Map();
    this.chunkMap = new Map();
    for (let j = 0; j < h; j += CHUNK) {
      for (let i = 0; i < w; i += CHUNK) this.bakeChunk(i, j);
    }
    this.drawBorder();
    this.buildDotBg();
    this.buildWater();
    this.buildClouds();
    // trang trí đối tượng
    this.deco = [];
    this.decoAt = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.placeDecoAt(x, y);
    this.drawGoal();
    this.fireFx = new Map();
    this.syncFires(false);
    this.startAmbient();
  }

  // ---------- Lửa rừng ----------
  // Nền pixel: thay cây của ô bằng sprite cây đang cháy (4 khung, chạy vòng). Nền giấy: giữ cây, vẽ ngọn lửa nét mực lên trên.
  hasFire() { return !!this.fireFx && this.fireFx.size > 0; }

  makeFire(x, y) {
    const c = tileToWorld(x, y), k = y * this.state.map.w + x;
    const fx = { x, y, k, deco: this.decoAt.get(k) || [], root: new PIXI.Container() };
    const pixel = this.tileStyle === 'pixel' && this.assets.pixelDeco('fire', 0);
    if (pixel) {
      for (const sp of fx.deco) sp.visible = false;           // cây thường được thay bằng cây đang cháy
      fx.frames = [0, 1, 2, 3].map((i) => this.assets.pixelDeco('fire', i));
      fx.sprite = new PIXI.Sprite(fx.frames[0].texture);
      fx.sprite.anchor.set(fx.frames[0].anchor[0], fx.frames[0].anchor[1]);
      fx.sprite.scale.set(1 / fx.frames[0].up);
      fx.root.addChild(fx.sprite);
      fx.root.position.set(c.x, c.y + 8);
    } else {
      fx.g = new PIXI.Graphics();
      fx.root.addChild(fx.g);
      fx.root.position.set(c.x, c.y + 10);
      fx.root.scale.set(1.35);
      for (const sp of fx.deco) sp.tint = 0x8a6a58;          // cây bén lửa sạm lại
    }
    fx.root.zIndex = c.y + (fx.sprite ? 9 : 24);           // lửa vẽ tay nằm trước cây trong ô
    fx.seed = (x * 73856093) ^ (y * 19349663);
    this.objects.addChild(fx.root);
    return fx;
  }

  dropFire(fx) {
    for (const sp of fx.deco) if (!sp.destroyed) { sp.visible = true; sp.tint = 0xffffff; }
    fx.root.destroy({ children: true });
  }

  // khớp hiệu ứng lửa với s.fires; fade = cho hiện / tắt dần
  async syncFires(fade = true) {
    const fires = this.state.fires || [], W = this.state.map.w;
    const want = new Set(fires.map((f) => f.y * W + f.x));
    const born = [], gone = [];
    for (const f of fires) {
      const k = f.y * W + f.x;
      if (!this.fireFx.has(k)) { const fx = this.makeFire(f.x, f.y); this.fireFx.set(k, fx); born.push(fx); }
    }
    for (const [k, fx] of this.fireFx) if (!want.has(k)) { gone.push(fx); this.fireFx.delete(k); }
    this.updateFires();
    if (fade && (born.length || gone.length)) {
      for (const fx of born) fx.root.alpha = 0;
      await this.tween(450, (e) => { for (const fx of born) fx.root.alpha = e; for (const fx of gone) fx.root.alpha = 1 - e; this.updateFires(); });
    }
    for (const fx of gone) this.dropFire(fx);
    this.startAmbient();
    this.requestRender();
  }

  updateFires() {
    if (!this.hasFire()) return;
    const t = performance.now();
    for (const fx of this.fireFx.values()) {
      if (fx.sprite) {
        const fr = fx.frames[(Math.floor(t / 140) + (fx.seed & 3)) % 4];
        if (fx.sprite.texture !== fr.texture) fx.sprite.texture = fr.texture;
        continue;
      }
      // ngọn lửa vẽ tay: 3 lưỡi lửa giọt nước, cao thấp theo thời gian
      const g = fx.g.clear();
      const rng = makeRng(fx.seed + Math.floor(t / 120));
      for (const [ox, oy, sz] of [[-14, -2, 1], [10, 2, 0.85], [-2, 6, 1.15]]) {
        const h = (26 + rng() * 12) * sz, wd = 9 * sz, x = ox + (rng() - 0.5) * 3, y = oy;
        const lean = (rng() - 0.5) * 6;
        const flame = (hh, ww) => [x - ww, y, x - ww * 0.7, y - hh * 0.45, x + lean, y - hh, x + ww * 0.7, y - hh * 0.45, x + ww, y, x, y + ww * 0.35];
        g.poly(flame(h, wd), true).fill({ color: 0xf07a22 }).stroke({ width: 1.8, color: 0x1b1b1b, join: 'round' });
        g.poly(flame(h * 0.55, wd * 0.5), true).fill({ color: 0xffd23c });
      }
      g.circle(-6 + rng() * 12, -40 - rng() * 14, 5 + rng() * 4).fill({ color: 0x6a6a6a, alpha: 0.35 });
    }
  }

  // cung thủ bắn tên lửa vào ô rừng
  async fireArrow(aId, x, y) {
    const a = this.sprites.get(aId);
    if (!a) return;
    const c = tileToWorld(x, y);
    this.face(a, c.x - a.root.x);
    const g = new PIXI.Graphics();
    this.fx.addChild(g);
    const ax = a.root.x, ay = a.root.y - 34, bx = c.x, by = c.y - 14;
    const arc = Math.hypot(bx - ax, by - ay) * 0.25;
    await this.tween(380, (k) => {
      const px = ax + (bx - ax) * k, py = ay + (by - ay) * k - Math.sin(k * Math.PI) * arc;
      const k2 = Math.max(0, k - 0.06);
      const x0 = ax + (bx - ax) * k2, y0 = ay + (by - ay) * k2 - Math.sin(k2 * Math.PI) * arc;
      g.clear().moveTo(x0, y0).lineTo(px, py).stroke({ width: 3, color: 0x1b1b1b, cap: 'round' });
      g.circle(px, py, 4).fill({ color: 0xffa030 }).circle(px, py, 2).fill({ color: 0xfff0a0 });
    });
    g.destroy();
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
    const tid = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : terrainId(s, x, y));
    const pixel = this.tileStyle === 'pixel';
    if (pixel) paintPixelGround(ctx, { tid, i0, j0, i1, j1, minX, minY, TW, TH, RES, cw: canvas.width, ch: canvas.height });
    ctx.scale(RES, RES);
    ctx.translate(-minX, -minY);
    for (let y = j0; y < j1; y++) for (let x = i0; x < i1; x++) {
      if (pixel) break;
      const c = tileToWorld(x, y);
      const t = tid(x, y);
      // thứ tự cạnh: 0=-y 1=+x 2=+y 3=-x
      const neighbors = [tid(x, y - 1), tid(x + 1, y), tid(x, y + 1), tid(x - 1, y)];
      drawGroundTile(ctx, c.x, c.y, t, { TW, TH, neighbors, seed: Math.floor(hash2(s.map.seed || 1, x, y) * 1e9) });
    }
    // lưới mờ
    ctx.strokeStyle = pixel ? 'rgba(40,70,30,0.16)' : 'rgba(120,118,105,0.28)'; ctx.lineWidth = 1;
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
    const key = i0 + ',' + j0, old = this.chunkMap && this.chunkMap.get(key);
    if (old && old.parent === this.ground) this.ground.addChildAt(sp, this.ground.getChildIndex(old) + 1);
    else this.ground.addChild(sp);
    if (this.chunkMap) this.chunkMap.set(key, sp);
    return { sp, old };
  }

  // Địa hình đổi giữa trận (mưa thành đầm lầy, đầm lầy khô lại, rừng cháy): vẽ lại các mảng nền liên quan
  // (cả mảng kề vì mép ô hoà vào ô bên cạnh), mảng mới hiện dần đè lên mảng cũ rồi bỏ mảng cũ.
  async retile(changes) {
    const keys = new Set();
    for (const p of changes) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= this.state.map.w || y >= this.state.map.h) continue;
      keys.add(Math.floor(x / CHUNK) * CHUNK + ',' + Math.floor(y / CHUNK) * CHUNK);
    }
    const pairs = [...keys].map((k) => { const [i, j] = k.split(',').map(Number); return this.bakeChunk(i, j); });
    // trang trí của ô đổi: cái cũ mờ đi, cái mới hiện dần
    const W = this.state.map.w, oldDeco = [], newDeco = [];
    for (const p of changes) {
      const k = p.y * W + p.x;
      for (const sp of this.decoAt.get(k) || []) { oldDeco.push(sp); this.features = this.features.filter((f) => f.sprite !== sp); }
      newDeco.push(...this.placeDecoAt(p.x, p.y));
    }
    for (const { sp } of pairs) sp.alpha = 0;
    for (const sp of newDeco) sp.alpha = 0;
    await this.tween(700, (k) => {
      for (const { sp } of pairs) sp.alpha = k;
      for (const sp of newDeco) sp.alpha = k;
      for (const sp of oldDeco) sp.alpha = 1 - k;
    });
    for (const { old } of pairs) if (old) old.destroy({ texture: true, textureSource: true });
    for (const sp of oldDeco) sp.destroy({ children: true });
    this.drawOverlay();
    this.requestRender();
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

  // vật trang trí của một ô (cây, nhà, đá...): nhớ theo ô để vẽ lại riêng ô đó khi địa hình đổi
  placeDecoAt(x, y) {
    const k = y * this.state.map.w + x, list = [];
    this._decoList = list;
    try { this.placeDeco(x, y); } finally { this._decoList = null; }
    this.decoAt.set(k, list);
    return list;
  }

  place(sprite, wx, wy, z, tile) {
    sprite.position.set(wx, wy);
    sprite.zIndex = z ?? wy;
    this.objects.addChild(sprite);
    if (this._decoList) this._decoList.push(sprite);
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
    const bt = this.tileStyle === 'pixel' ? '#d9c8a2' : PAPER;   // công trình: tô cát ấm trên nền pixel, giấy trắng trên nền vẽ tay
    if (this.tileStyle === 'pixel' && this.placePixelDeco(t, x, y, c, rng, uv)) return;
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
    } else if (t === 'burnt') {
      // rừng cháy (nền giấy): cây cụt tô than, nhỏ và thấp
      const n = 1 + rng.int(2);
      for (let i = 0; i < n; i++) {
        const [px, py] = uv((rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5);
        // thân cây cụt cháy đen: nét mực đậm, vài cành gãy
        const g = new PIXI.Graphics(), hgt = 22 + rng() * 14;
        g.poly([-3, 0, -2, -hgt, 0, -hgt - 4, 2, -hgt + 2, 3, 0], true).fill(0x3a3734).stroke({ width: 1.8, color: 0x1b1b1b, join: 'round' });
        for (let b = 0; b < 2; b++) {
          const yb = -hgt * (0.45 + b * 0.25), dir = b % 2 ? 1 : -1;
          g.moveTo(0, yb).lineTo(dir * (6 + rng() * 4), yb - 5 - rng() * 3).stroke({ width: 1.8, color: 0x1b1b1b, cap: 'round' });
        }
        g.ellipse(0, 1, 9, 3).fill({ color: 0x2a2826, alpha: 0.25 });
        this.place(g, px, py + 7);
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
      if (A.has('mine')) this.place(this.mk(A.building('mine', bt, 0.97), 1), c.x, c.y + 12, c.y + 2, { x, y });
      else this.place(this.mk(A.deco('mine', 0), 0.72), c.x, c.y + 12, c.y + 2, { x, y });
    } else if (t === 'village') {
      if (A.has('houses')) {
        const kname = ['houses', 'houseChimney', 'houseViking', 'houseTall', 'houses', 'mill'][rng.int(6)];
        this.place(this.mk(A.building(kname, bt, 0.97), 1), c.x, c.y + 12, c.y + 2, { x, y });
      } else {
        const name = ['village_a', 'village_b', 'cottages'][rng.int(3)];
        this.place(this.mk(A.building(name)), c.x, c.y + 14, c.y + 2, { x, y });
      }
    } else if (t === 'fort') {
      if (A.has('towerWatch')) {
        this.place(this.mk(A.building(['towerWatch', 'tower', 'watchtower'][rng.int(3)], bt, 0.97), 1), c.x, c.y + 12, c.y + 2, { x, y });
      } else {
        this.place(this.mk(A.building(rng() < 0.5 ? 'tower_a' : 'tower_b')), c.x, c.y + 16, c.y + 2, { x, y });
      }
    } else if (t === 'stronghold') {
      const own = this.state.map.strongholds;
      const isHuman = own.human.x === x && own.human.y === y;
      const f = isHuman ? 'human' : this.state.sides[1];
      const kenney = A.has('castle') && A.has('castleTall');
      const pxCastle = this.tileStyle === 'pixel' ? A.pixelDeco('castle', isHuman ? 0 : f === 'undead' ? 2 : 1) : null;
      let sp;
      if (pxCastle) {
        sp = new PIXI.Sprite(pxCastle.texture);
        sp.anchor.set(pxCastle.anchor[0], pxCastle.anchor[1]);
        sp.scale.set(74 / pxCastle.w / pxCastle.up);
      } else sp = kenney
        ? this.mk(A.building(isHuman ? 'castle' : 'castleTall', mixPaper(FACTIONS[f].fill, 0.55), 0.97), 1.0)
        : this.mk(A.building(isHuman ? 'castle_town' : 'stronghold', FACTIONS[f].fill), 1.0);
      this.place(sp, c.x, c.y + (pxCastle ? 12 : kenney ? 14 : 20), c.y + 2, { x, y });
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

  // Vật thể địa hình pixel art (cây thông, bụi cỏ, đá...). Trả true nếu ô này do nhánh pixel lo (công trình thì để code cũ).
  // wpa = đơn vị thế giới cho mỗi pixel gốc: 1 cho cây/đá, ~0.67 cho cỏ nhỏ cho đỡ rối.
  placePixelDeco(t, x, y, c, rng, uv) {
    const A = this.assets;
    const mk = (group, wpa, jit, z, tile, scaleMul = 1, pick) => {
      const res = A.pixelDeco(group, pick ?? rng.int(TERRAIN_DECO[group]));
      if (!res) return;
      const sp = new PIXI.Sprite(res.texture);
      sp.anchor.set(res.anchor[0], res.anchor[1]);
      sp.scale.set((wpa * scaleMul) / res.up);
      const [px, py] = jit ? uv((rng() - 0.5) * jit, (rng() - 0.5) * jit) : [c.x, c.y];
      this.place(sp, px, py + 6, z, tile);
    };
    // công trình pixel art: đặt theo bề rộng mong muốn (đơn vị thế giới); nằm sau quân đứng cùng ô
    const bld = (group, variant, targetW, du, dv, tile) => {
      const res = A.pixelDeco(group, variant);
      if (!res) return;
      const sp = new PIXI.Sprite(res.texture);
      sp.anchor.set(res.anchor[0], res.anchor[1]);
      sp.scale.set(targetW / res.w / res.up);
      const [px, py] = uv(du, dv);
      this.place(sp, px, py + 10, c.y + 2, tile);
    };
    switch (t) {
      case 'plain':
        if (rng() < 0.4) mk('tuft', 0.667, 0.8);
        if (rng() < 0.08) mk('bush', 0.667, 0.8);
        return true;
      case 'field':
        if (rng() < 0.15) mk('tuft', 0.667, 0.8);
        return true;
      case 'burnt': {
        const n = 1 + (rng() < 0.6 ? 1 : 0);
        for (let i = 0; i < n; i++) mk('burnt', 1, 0.6);
        if (rng() < 0.4) mk('tuft', 0.667, 0.8);
        return true;
      }
      case 'forest': {
        const n = 1 + (rng() < 0.67 ? 1 : 0);
        for (let i = 0; i < n; i++) mk('pine', 1, 0.6);
        if (rng() < 0.25) mk('tuft', 0.667, 0.8);
        return true;
      }
      case 'hill':
        // đồi = u đất phủ cỏ nhô lên (bản vẽ nháp của mày, tools/prep_hill.py): một loại duy nhất, nằm giữa ô
        mk('hill', 1.2, 0, c.y + 2, { x, y }, 1, 0);
        return true;
      case 'mountain':
        mk('mound', 1, 0.3, c.y + 2, { x, y });
        if (rng() < 0.6) mk('boulder', 0.667, 0.8);
        return true;
      case 'peak':
        mk('mound', 1, 0.2, undefined, { x, y }, 1.5);
        return true;
      case 'swamp':
        mk('reed', 0.667, 0.8);
        mk('reed', 0.667, 0.8);
        if (rng() < 0.4) mk('shrub', 0.667, 0.8);
        return true;
      case 'river': case 'bridge':
        return true;
      case 'village': {
        const first = [0, 1, 2, 3, 4, 5, 7][rng.int(7)];
        bld('house', first, 49, 0, 0, { x, y });
        if (rng() < 0.6) bld('house', [0, 1, 2, 3, 5, 7][rng.int(6)], 38, 0.3, 0.28);
        if (rng() < 0.4) bld('house', 6, 23, -0.3, 0.3);
        return true;
      }
      case 'fort':
        bld('tower', rng.int(5), 37, 0, 0, { x, y });
        return true;
      case 'mine':
        bld('mine', 0, 58, 0, 0, { x, y });
        return true;
      default:
        return false;
    }
  }

  setTileStyle(style) {
    const st = style === 'pixel' && this.assets.hasPixelDeco() ? 'pixel' : 'doodle';
    if (st === this.tileStyle) return;
    this.tileStyle = st;
    if (!this.app) return;
    this.buildMap();
    this.reconcile();
    this.requestRender();
  }

  setHold(state) {
    if (!this.holdLabel) return;
    for (const f of state.sides) {
      const lab = this.holdLabel[f];
      if (!lab) continue;
      // thành của f bị phe kia chiếm: tiến độ nằm ở capture[phe kia]
      const att = f === state.sides[0] ? state.sides[1] : state.sides[0];
      const p = state.capture[att] || 0;
      lab.text = p > 0 ? `${p}/${CONFIG.captureTurns}` : '';
      lab.style.fill = FACTIONS[att].fill;
    }
  }

  // ---------- Đơn vị ----------
  makeUnit(u) {
    const A = this.assets;
    // trại mục tiêu (nhiệm vụ phá trại) là đơn vị tĩnh: vẽ bằng sprite lều tô màu phe
    const pxCamp = u.static && this.tileStyle === 'pixel' ? A.pixelDeco('camp', u.faction === 'human' ? 0 : u.faction === 'undead' ? 2 : 1) : null;
    const res = pxCamp || (u.static ? A.building('tent', mixPaper(FACTIONS[u.faction].fill, 0.55), 0.97) : A.unit(u.role === 'marine' && u.afloat ? 'marineboat' : u.role, u.faction, u.origin));
    const root = new PIXI.Container();
    // bóng xám nhẹ dưới chân (phe được phân biệt bằng hình quân và huy hiệu số)
    const shadow = new PIXI.Graphics();
    shadow.ellipse(0, 0, 22, 7).fill({ color: 0x000000, alpha: 0.17 });
    const body = new PIXI.Container();
    const sprite = new PIXI.Sprite(res.texture);
    sprite.anchor.set(res.anchor[0], res.anchor[1]);
    if (pxCamp) sprite.scale.set(64 / pxCamp.w / pxCamp.up);
    else sprite.scale.set((u.static ? 1.7 : 1) / RES);          // trại phải nổi hơn công trình nền
    body.addChild(sprite);
    const badge = new PIXI.Container();
    const bg = new PIXI.Graphics();
    bg.circle(0, 0, 11).fill(FACTIONS[u.faction].fill).stroke({ width: 2, color: 0x1b1b1b });
    const txt = new PIXI.Text({ text: String(u.strength), style: { fontFamily: FONT, fontSize: 15, fill: 0xffffff, fontWeight: 'bold' } });
    txt.anchor.set(0.5);
    badge.addChild(bg, txt);
    badge.position.set(24, -8);
    const badgeBg = bg;
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
    root.visible = this.canSee(u);
    this.objects.addChild(root);
    const us = { id: u.id, afloat: !!u.afloat, root, body, sprite, badge, txt, flag, fortG, stars, fort: -1, shown: u.strength, baseTex: res.texture, veil: false, badgeBg, facing: u.static || u.faction === 'human' ? 1 : -1, bx: 0, by: 0 };
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
    us.txt.text = us.veil ? '?' : String(Math.max(0, n));
  }

  face(us, dx) {
    if (!dx) return;
    us.facing = dx > 0 ? 1 : -1;
    us.sprite.scale.x = Math.abs(us.sprite.scale.x) * us.facing;
  }

  // Thuyền của thủy binh nằm lại ở bờ (không phải đơn vị): vẽ theo s.boats
  drawBoats() {
    const boats = this.state.boats || [];
    this.boatSprites ||= new Map();
    const want = new Set(boats.map((b) => b.x + ',' + b.y));
    for (const [k, sp] of this.boatSprites) if (!want.has(k)) { sp.destroy(); this.boatSprites.delete(k); }
    for (const b of boats) {
      const k = b.x + ',' + b.y;
      if (this.boatSprites.has(k)) continue;
      const res = this.assets.unit('boat', b.faction);
      const sp = new PIXI.Sprite(res.texture);
      sp.anchor.set(0.5, 0.8); sp.scale.set(1 / RES);
      const c = tileToWorld(b.x, b.y);
      sp.position.set(c.x, c.y + 6); sp.zIndex = c.y + 5;
      this.objects.addChild(sp);
      this.boatSprites.set(k, sp);
    }
  }

  // Cờ báo điểm tiếp viện bọc sườn của địch (đợt chưa tới): cờ màu phe + lượt sẽ xuất hiện. Đợt tới rồi thì gỡ cờ.
  drawWaveFlags() {
    this.waveFlags ||= new Map();
    const waves = (this.state.mission?.waves || []).filter((w) => w.spot && !w.done);
    const want = new Set(waves.map((w) => `${w.spot.x},${w.spot.y},${w.at}`));
    for (const [k, node] of this.waveFlags) if (!want.has(k)) { node.destroy({ children: true }); this.waveFlags.delete(k); }
    for (const w of waves) {
      const k = `${w.spot.x},${w.spot.y},${w.at}`;
      if (this.waveFlags.has(k)) continue;
      const c = tileToWorld(w.spot.x, w.spot.y), col = parseInt(FACTIONS[w.faction].fill.slice(1), 16);
      const box = new PIXI.Container();
      box.position.set(c.x, c.y); box.zIndex = c.y + 1;
      const g = new PIXI.Graphics();
      g.poly([0, -TH / 2, TW / 2, 0, 0, TH / 2, -TW / 2, 0], true).fill({ color: col, alpha: 0.18 }).stroke({ width: 2.4, color: col, alpha: 0.85, join: 'round' });
      g.moveTo(0, 4).lineTo(0, -40).stroke({ width: 2.6, color: 0x1b1b1b, cap: 'round' });
      g.poly([0, -40, 24, -32, 0, -24], true).fill(col).stroke({ width: 1.8, color: 0x1b1b1b, join: 'round' });
      box.addChild(g);
      const tx = new PIXI.Text({ text: String(w.at), style: { fontFamily: FONT, fontSize: 15, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x1b1b1b, width: 4 } } });
      tx.anchor.set(0.5, 0.5); tx.position.set(8, -32);
      box.addChild(tx);
      this.objects.addChild(box);
      this.waveFlags.set(k, box);
    }
  }

  // Mộ tử sĩ (s.graves): người = bia đá đầu tròn trên ụ đất, Orc = ụ đất cắm ngược thanh đao.
  // Mộ trong tầm necromancer: vòng xanh ma trơi + số lượt còn lại trước khi trỗi dậy.
  drawGraves() {
    this.graveSprites ||= new Map();
    const s = this.state, graves = s.graves || [];
    const sig = (g) => `${g.faction}|${graveWait(s, g)}|${graveInRange(s, g) ? 1 : 0}`;
    const want = new Map(graves.map((g) => [g.x + ',' + g.y, g]));
    for (const [k, gr] of this.graveSprites) {
      const g = want.get(k);
      if (!g || gr.sig !== sig(g)) { gr.node.destroy({ children: true }); this.graveSprites.delete(k); }
    }
    for (const g of graves) {
      const k = g.x + ',' + g.y;
      if (this.graveSprites.has(k)) continue;
      const node = this.makeGrave(g);
      this.objects.addChild(node);
      this.graveSprites.set(k, { node, sig: sig(g) });
    }
  }

  makeGrave(g) {
    const s = this.state, c = tileToWorld(g.x, g.y);
    const box = new PIXI.Container();
    box.position.set(c.x, c.y + 4);
    box.zIndex = c.y + 4;
    const live = graveInRange(s, g);
    const d = new PIXI.Graphics();
    if (live) d.ellipse(0, 2, 30, 14).fill({ color: 0x8be07a, alpha: 0.3 }).stroke({ width: 2.6, color: 0xc8ffb0, alpha: 0.95 });
    const px = this.tileStyle === 'pixel' && this.assets.pixelDeco(g.faction === 'orc' ? 'graveo' : 'graveh', Math.floor(hash2(g.x * 7 + 1, g.y * 13 + 5, 3) * 4), false);   // mộ thấp: không đổ bóng, viền ụ đất hoà vào cỏ
    if (px) {
      // nền pixel: sprite mộ vẽ bằng AI (Seedream) hạ về mật độ pixel của quân
      box.addChild(d);
      const sp = new PIXI.Sprite(px.texture);
      sp.anchor.set(px.anchor[0], px.anchor[1]); sp.scale.set(1 / px.up);
      sp.position.set(0, 8);
      box.addChild(sp);
    } else d.ellipse(0, 2, 20, 8).fill(0x6b4a2a).stroke({ width: 1.6, color: 0x1b1b1b });          // ụ đất
    if (px) { /* đã có sprite */ } else if (g.faction === 'orc') {
      d.poly([-14, 1, -6, -7, 4, -8, 14, 0, 6, 5, -8, 5], true).fill(0x8a8378).stroke({ width: 1.4, color: 0x1b1b1b, join: 'round' });   // đống đá
      // đao cắm ngược: lưỡi rộng, sống thẳng, mũi vát, có khía; chuôi gỗ và chắn tay trên cùng
      d.poly([-1, -2, -1, -38, 11, -38, 11, -26, 8, -23, 11, -20, 11, -2], true).fill(0xb8bcc2).stroke({ width: 1.4, color: 0x1b1b1b, join: 'round' });
      d.moveTo(2, -6).lineTo(2, -34).stroke({ width: 1, color: 0x7d838a });               // sống đao
      d.rect(-4, -42, 18, 4).fill(0x3a2a1a).stroke({ width: 1, color: 0x1b1b1b });         // chắn tay
      d.rect(2, -53, 6, 11).fill(0x6b4a2a).stroke({ width: 1, color: 0x1b1b1b });          // chuôi
    } else {
      d.moveTo(-9, -2).lineTo(-9, -24).arc(0, -24, 9, Math.PI, 0).lineTo(9, -2).closePath()
        .fill(0x9aa0a6).stroke({ width: 1.8, color: 0x1b1b1b, join: 'round' });             // bia đá đầu tròn
      d.moveTo(-4.5, -21).lineTo(4.5, -21).moveTo(-4.5, -16).lineTo(4.5, -16).stroke({ width: 1.4, color: 0x4a4f55 });
    }
    if (!px) box.addChild(d);
    if (s.units.some((n) => n.role === 'necromancer')) {
      // đếm lùi tới lúc thành thây ma: trong vùng ếm chữ xanh ma trơi, ngoài vùng chữ xám (chậm hơn)
      const n = graveWait(s, g);
      const tx = new PIXI.Text({ text: n > 0 ? String(n) : '!', style: { fontFamily: FONT, fontSize: 15, fill: live ? 0xd8ffcf : 0xd0d0c8, fontWeight: 'bold', stroke: { color: 0x1b1b1b, width: 4 } } });
      tx.anchor.set(0.5, 1); tx.position.set(14, -24);
      box.addChild(tx);
    }
    return box;
  }

  // đồng bộ cứng sprite với state
  reconcile() {
    const s = this.state;
    const live = new Set(s.units.map((u) => u.id));
    for (const [id, us] of this.sprites) {
      const u = s.units.find((q) => q.id === id);
      // đã chết, hoặc thủy binh vừa lên bờ / xuống thuyền (đổi hình): vẽ lại
      if (!live.has(id) || (u && !!us.afloat !== !!u.afloat)) { us.root.destroy({ children: true }); this.sprites.delete(id); }
    }
    this.drawBoats();
    this.drawGraves();
    this.drawWaveFlags();
    for (const u of s.units) {
      let us = this.sprites.get(u.id);
      if (!us) us = this.makeUnit(u);
      const c = tileToWorld(u.x, u.y);
      us.root.position.set(c.x, c.y + 8);
      us.root.zIndex = c.y + 8.1;
      us.body.position.set(0, 0);
      this.setShown(us, u.strength);
      us.root.visible = this.canSee(u);                              // quân ẩn / khuất sương: chỉ phe mình thấy
      this.setVeil(us, u.veiled && u.faction !== this.viewer);
      if (us.veil) us.root.zIndex = c.y + 30;                      // bóng trong rừng: nổi lên trên tán cây cùng ô cho dễ thấy
      const mine = u.faction === s.current;
      us.body.alpha = mine && u.acted && u.status === 'ok' && !s.winner && !u.static ? 0.55 : 1;
      us.flag.text = u.status === 'routed' ? this.t('ui.routed') : '';
      this.drawStars(us, levelOf(u.xp || 0));
      this.drawFort(us, u.fort || 0);
    }
    this.setHold(s);
    this.drawFog();
    this.requestRender();
  }

  // ---------- Sương mù chiến tranh ----------
  canSee(u) { return u.faction === this.viewer || (!u.hidden && !u.fogged); }

  // Orc nấp trong rừng: chỉ thấy một bóng đen chung (cùng một dáng cho mọi loại quân), không có số quân, không quân hàm
  setVeil(us, on) {
    if (us.veil === on) return;
    us.veil = on;
    if (on) {
      const sh = this.assets.unit('infantry', 'orc');
      us.sprite.texture = sh.texture; us.sprite.anchor.set(sh.anchor[0], sh.anchor[1]);
      us.sprite.tint = 0x141414; us.sprite.alpha = 0.88;
    } else {
      us.sprite.texture = us.baseTex; us.sprite.tint = 0xffffff; us.sprite.alpha = 1;
    }
    // huy hiệu: dấu "?" nền xám thay số quân, để biết chắc ô đó có quân
    us.stars.visible = !on;
    us.txt.text = on ? '?' : String(us.shown);
    us.badgeBg.tint = on ? 0x6a6a6a : 0xffffff;
  }

  drawFog() {
    const g = this.fogLayer;
    g.clear();
    const s = this.state;
    if (!s.fog) { this.fogMask = null; return; }
    const m = this.fogMask = seenMask(s, this.viewer), { w, h } = s.map;
    const col = this.tileStyle === 'pixel' ? 0x0c1220 : 0x4a463e, alpha = this.tileStyle === 'pixel' ? 0.4 : 0.3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (m[y * w + x]) continue;
      const c = tileToWorld(x, y);
      g.poly([c.x, c.y - TH / 2 - 0.5, c.x + TW / 2 + 0.5, c.y, c.x, c.y + TH / 2 + 0.5, c.x - TW / 2 - 0.5, c.y], true);
    }
    g.fill({ color: col, alpha });
  }
  tileSeen(x, y) { return !this.fogMask || !!this.fogMask[y * this.state.map.w + x]; }

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
    paint(o.raise, 0x8a5ad0, 0.3);                           // vùng triệu hồi của necromancer (màu phe âm binh)
    paint(o.move, 0xf2c200, 0.38);
    paint(o.split, 0x3a78d8, 0.38);
    paint(o.ignite, 0xf07a22, 0.45);                         // ô rừng cung thủ đốt được
    paint(o.merge, 0x3aa86a, 0.42);
    paint(o.attack, 0xd8402f, 0.42);
    for (const p of o.range || []) {
      const c = tileToWorld(p.x, p.y);
      g.ellipse(c.x, c.y, 13, 6.5).fill({ color: 0xd8402f, alpha: 0.88 });      // oval 2:1 nằm trên mặt đất isometric
    }
    if (o.dest) paint([o.dest], 0xf2c200, 0.6);
    if (o.flee) {                                              // đích bỏ chạy: vòng + dấu mũi tên; đỏ nếu là rút khỏi trận
      const c = tileToWorld(o.flee.x, o.flee.y), col = o.flee.exit ? 0xd8402f : 0x3a78d8;
      g.poly(dia(o.flee.x, o.flee.y, 0.8), true).fill({ color: col, alpha: 0.22 }).stroke({ width: 3, color: col });
      g.moveTo(c.x - 9, c.y - 4).lineTo(c.x, c.y + 6).lineTo(c.x + 9, c.y - 4).stroke({ width: 3.2, color: col, cap: 'round', join: 'round' });
    }
    if (o.selected) g.poly(dia(o.selected.x, o.selected.y, 1), true).stroke({ width: 3, color: 0xf2c200 });
    if (o.tut) {                                               // hướng dẫn: vòng sáng + mũi tên chỉ xuống ô cần chạm
      const c = tileToWorld(o.tut.x, o.tut.y);
      g.poly(dia(o.tut.x, o.tut.y, 1.08), true).stroke({ width: 4.5, color: 0x1b1b1b, alpha: 0.9 });
      g.poly(dia(o.tut.x, o.tut.y, 1.08), true).stroke({ width: 2.5, color: 0x3ad0ff });
      const ay = c.y - 74;
      g.poly([c.x - 11, ay, c.x + 11, ay, c.x, ay + 16], true).fill(0x3ad0ff).stroke({ width: 2, color: 0x1b1b1b, join: 'round' });
      g.rect(c.x - 4, ay - 14, 8, 14).fill(0x3ad0ff).stroke({ width: 2, color: 0x1b1b1b });
    }
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
    const any = () => this.idleOn || this.cloudsOn || this.hasWater() || this.hasStorm() || this.hasFire();
    if (!any()) return;
    const tick = () => {
      if (!any()) return;
      if (!document.hidden && this.app && !this.tweens.length) {
        let dirty = false;
        if (this.idleOn) { this.updateIdle(); dirty = true; }
        if (this.cloudsOn) { this.updateClouds(); dirty = true; }
        if (this.hasWater() && this.updateWater()) dirty = true;
        if (this.hasStorm()) { this.driftStorm(); dirty = true; }
        if (this.hasFire()) { this.updateFires(); dirty = true; }
        if (dirty) this.app.render();
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
  // Nền chấm bi phía sau bản đồ: đứng yên theo màn hình (không trôi, không co giãn theo camera)
  buildDotBg() {
    if (this.dotBg) return;
    if (!this._dotTex) {
      const S = 28 * RES, c = makeCanvas(S, S), ctx = c.getContext('2d');
      ctx.fillStyle = 'rgba(74,72,64,0.5)';
      ctx.fillRect(S / 2 - RES, S / 2 - RES, RES * 2, RES * 2);       // chấm 2x2 px, cách nhau 28px
      this._dotTex = PIXI.Texture.from(c);
      this._dotTex.source.style.scaleMode = 'nearest';
    }
    const ts = new PIXI.TilingSprite({ texture: this._dotTex, width: this.app.screen.width, height: this.app.screen.height });
    ts.tileScale.set(1 / RES);
    this.app.stage.addChildAt(ts, 0);
    this.dotBg = ts;
    this.app.renderer.on('resize', () => { ts.width = this.app.screen.width; ts.height = this.app.screen.height; });
  }

  // Đốm nước lấp lánh: mỗi ô sông có vài điểm, mỗi điểm lặp chu kỳ riêng: chấm -> dấu cộng -> chấm -> tắt (bước 0.2 giây, theo lưới 2px của nền)
  buildWater() {
    this.waterFx.clear();
    this.sparkles = [];
    this._wf = -1;
    if (this.tileStyle !== 'pixel') return;
    const s = this.state, { w, h } = s.map;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (terrainId(s, x, y) !== 'river') continue;
      const c = tileToWorld(x, y);
      for (let k = 0; k < 3; k++) {
        const r1 = hash2(77 + k, x, y), r2 = hash2(91 + k, x * 3 + 1, y * 5 + 2), r3 = hash2(53 + k, x + 9, y + 4), r4 = hash2(31 + k, x * 7, y * 11);
        const u = (r1 - 0.5) * 0.62, v = (r2 - 0.5) * 0.62;
        const px = c.x + (u * TW) / 2 - (v * TW) / 2, py = c.y + (u * TH) / 2 + (v * TH) / 2;
        this.sparkles.push({ x: Math.round(px / 2) * 2, y: Math.round(py / 2) * 2, phase: Math.floor(r3 * 14), period: 11 + Math.floor(r4 * 6) });
      }
    }
  }

  hasWater() { return this.tileStyle === 'pixel' && !!this.sparkles && this.sparkles.length > 0; }

  // Trả true nếu khung hình lấp lánh đã đổi (cần vẽ lại)
  updateWater() {
    const f = Math.floor(performance.now() / 200);
    if (f === this._wf) return false;
    this._wf = f;
    const g = this.waterFx;
    g.clear();
    for (const sp of this.sparkles) {
      const q = (f + sp.phase) % sp.period;
      if (q > 2) continue;
      if (q === 1) {
        g.rect(sp.x - 2, sp.y, 2, 2).rect(sp.x + 2, sp.y, 2, 2).rect(sp.x, sp.y - 2, 2, 2).rect(sp.x, sp.y + 2, 2, 2).fill({ color: 0xbfe2f4 });
      }
      g.rect(sp.x, sp.y, 2, 2).fill({ color: 0xf4fbff });
    }
    return true;
  }

  buildClouds() {
    for (const c of [this.cloudShadow, this.cloudLayer]) c.removeChildren().forEach((x) => x.destroy());
    this.clouds = [];
    const { w, h } = this.state.map;
    const rng = makeRng((this.state.map.seed || 1) * 31 + 7);
    const n = Math.max(4, Math.round((w * h) / 70));
    const imgs = this.assets.cloudImgs || [];
    let tex;
    const pixelClouds = this.tileStyle === 'pixel';
    if (pixelClouds) {
      const crng = makeRng((this.state.map.seed || 1) * 13 + 5);
      tex = [0, 1, 2, 3, 4, 5].map(() => {
        const v = makePixelCloud(crng);
        const ct = PIXI.Texture.from(v.cloud), st = PIXI.Texture.from(v.shadow);
        ct.source.style.scaleMode = st.source.style.scaleMode = 'nearest';
        return { cloud: ct, shadow: st, w: v.w, h: v.h };
      });
    } else if (imgs.length) {
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
    this.cloudTex = tex; this.ovalTex = ovalTex; this.pixelClouds = pixelClouds;
    this.windLen = Math.hypot(w, h) + 10;
    for (let i = 0; i < n; i++) {
      const v = tex[rng.int(tex.length)], width = 150 + rng() * 120;     // bề ngang mây trong thế giới (ô rộng 96)
      const cloud = new PIXI.Sprite(v.cloud); cloud.anchor.set(0.5); cloud.scale.set(width / v.w);
      const shadow = new PIXI.Sprite(pixelClouds ? v.shadow : ovalTex); shadow.anchor.set(0.5);
      if (pixelClouds) shadow.scale.set((width / v.w) * 0.8, (width / v.w) * 0.4);   // bóng phẳng, ép dẹt theo phối cảnh
      else { shadow.width = width * 0.68; shadow.height = width * 0.68 * 0.5; }      // nhỏ hơn 15% so với trước (0.8)
      this.cloudShadow.addChild(shadow); this.cloudLayer.addChild(cloud);
      this.clouds.push({ cloud, shadow, phase: rng() * this.windLen, speed: 0.22 + rng() * 0.18, lane: (rng() - 0.5) * this.windLen });
    }
    this.cloudLayer.visible = this.cloudShadow.visible = this.cloudsOn !== false;
    this.updateClouds();
    this.buildStorm();
  }

  // ---------- Thời tiết: mây đen theo trạng thái trận (vị trí thật, che ô thật), mưa ----------
  stormSprite(c) {
    const tex = this.cloudTex, v = tex[c.id % tex.length];
    const r = c.size === 'big' ? WEATHER.bigRadius : WEATHER.smallRadius;
    const ew = 2 * r * TW / Math.SQRT2;                        // bề ngang vùng phủ trên nền isometric
    const width = ew * 1.15;
    const root = new PIXI.Container();
    const shadow = new PIXI.Sprite(this.ovalTex); shadow.anchor.set(0.5);
    shadow.width = ew * 1.05; shadow.height = ew * 0.525;
    const cloud = new PIXI.Container();
    // mây đen: 2-3 cụm mây thường tô xám chì chồng lên nhau cho dày và nặng
    const parts = c.size === 'big' ? [[0, 0, 1], [-0.28, 0.1, 0.7], [0.3, 0.08, 0.72]] : [[0, 0, 1], [0.22, 0.08, 0.6]];
    for (const [ox, oy, k] of parts) {
      const sp = new PIXI.Sprite(v.cloud); sp.anchor.set(0.5);
      sp.scale.set((width * k) / v.w); sp.position.set(ox * width, oy * width * 0.35);
      sp.tint = c.size === 'big' ? 0x5a5e68 : 0x7a7e88;
      cloud.addChild(sp);
    }
    const rain = new PIXI.Graphics();
    this.stormShadow.addChild(shadow); this.storm.addChild(rain, cloud);
    return { id: c.id, shadow, cloud, rain, ew, tx: c.x, ty: c.y, gx: c.x, gy: c.y, fade: 1, raining: c.raining, big: c.size === 'big' };
  }

  buildStorm() {
    for (const c of [this.stormShadow, this.storm]) c.removeChildren().forEach((x) => x.destroy({ children: true }));
    this.storms = new Map();
    const W = this.state.weather;
    if (!W || !this.cloudTex) return;
    for (const c of W.clouds) this.storms.set(c.id, this.stormSprite(c));
    this.placeStorm();
  }

  hasRain() { return !!this.storms && [...this.storms.values()].some((st) => st.raining); }
  hasStorm() { return !!this.storms && this.storms.size > 0; }

  // Mây đen trôi liên tục theo gió, chậm hơn mây trắng. Đi sau đích (vị trí luật) thì đuổi nhanh hơn chút;
  // tới đích rồi vẫn trôi tiếp, vượt lên trước tối đa STORM_LEAD ô rồi mới chờ bước sau.
  driftStorm() {
    if (!this.hasStorm() || !this.state.weather) return;
    const now = performance.now(), dt = Math.min(0.5, ((now - (this._stormT || now)) / 1000));
    this._stormT = now;
    const v = windVec(this.state.weather.wind);
    for (const st of this.storms.values()) {
      const ahead = (st.tx - st.gx) * v.x + (st.ty - st.gy) * v.y;     // đã vượt đích bao nhiêu ô theo chiều gió
      const base = st.big ? STORM_SPEED : STORM_SPEED * 1.4;
      const sp = ahead < -0.3 ? base * (1 + Math.min(6, -ahead * 4)) : ahead < STORM_LEAD ? base : 0;
      // kéo dần về đường gió đi qua đích (khi gió đổi hướng thì không trôi lệch mãi)
      const px = st.gx + v.x * ahead, py = st.gy + v.y * ahead;
      st.tx += v.x * sp * dt + (px - st.tx) * Math.min(1, dt * 0.5);
      st.ty += v.y * sp * dt + (py - st.ty) * Math.min(1, dt * 0.5);
    }
    this.placeStorm();
  }

  // đặt mây đen theo toạ độ ô (liên tục) hiện tại; mây ra ngoài mép thì mờ dần
  placeStorm() {
    if (!this.storms) return;
    const { w, h } = this.state.map, now = performance.now();
    for (const st of this.storms.values()) {
      const p = tileToWorld(st.tx, st.ty);
      const out = Math.max(-st.tx, st.tx - (w - 1), -st.ty, st.ty - (h - 1), 0);
      const k = Math.max(0, 1 - out / 3) * st.fade;
      st.shadow.position.set(p.x, p.y); st.cloud.position.set(p.x, p.y - 120);
      st.shadow.alpha = (st.raining ? 0.55 : 0.4) * k; st.cloud.alpha = 0.5 * k;
      st.rain.clear();
      if (st.raining && k > 0.05) {
        // vệt mưa xiên theo gió, rơi từ đáy mây xuống vùng bóng; vị trí đổi theo thời gian nên trông như đang rơi
        const v = windVec(this.state.weather.wind), slant = (v.x - v.y) * 10;
        const n = Math.round(st.ew / 7), rng = makeRng(st.id * 977 + Math.floor(now / 90));
        for (let i = 0; i < n; i++) {
          const a = rng() * Math.PI * 2, rr = Math.sqrt(rng());
          const gx = p.x + Math.cos(a) * rr * st.ew * 0.5, gy = p.y + Math.sin(a) * rr * st.ew * 0.25;
          const top = p.y - 100, f = rng();
          const y0 = top + (gy - top) * f, y1 = Math.min(gy, y0 + 11);
          const x0 = gx - slant * (1 - f) * 3;
          st.rain.moveTo(x0, y0).lineTo(x0 + slant * 0.2, y1);
        }
        st.rain.stroke({ width: 1, color: this.tileStyle === 'pixel' ? 0xdfe9f4 : 0x5f7f9f, alpha: 0.6 * k });
      }
    }
  }

  // sự kiện 'clouds': mây đen trôi một bước theo gió; mây mới mọc ra thì hiện dần, mây tan thì mờ đi
  async moveStorm(ev) {
    const W = this.state.weather;
    if (!W || !this.cloudTex) return;
    const ids = new Set(W.clouds.map((c) => c.id));
    const born = [];
    for (const c of W.clouds) if (!this.storms.has(c.id)) { const st = this.stormSprite(c); st.fade = 0; this.storms.set(c.id, st); born.push(st); }
    const gone = [...this.storms.values()].filter((st) => !ids.has(st.id));
    // vị trí luật mới chỉ là đích; hình mây tự trôi chậm, liên tục tới đó (driftStorm)
    for (const st of this.storms.values()) {
      const c = W.clouds.find((q) => q.id === st.id);
      if (c) { st.raining = c.raining; st.gx = c.x; st.gy = c.y; } else { const v = windVec(W.wind); st.gx += v.x; st.gy += v.y; }
    }
    await this.tween(600, (k) => {
      const e = k * k * (3 - 2 * k);
      for (const st of born) st.fade = e;
      for (const st of gone) st.fade = 1 - e;
      this.placeStorm();
    });
    for (const st of gone) { st.shadow.destroy(); st.cloud.destroy({ children: true }); st.rain.destroy(); this.storms.delete(st.id); }
    this.startAmbient();
  }

  syncRain() {
    const W = this.state.weather;
    if (!W || !this.storms) return;
    for (const c of W.clouds) { const st = this.storms.get(c.id); if (st) st.raining = c.raining; }
    this.placeStorm(); this.requestRender(); this.startAmbient();
  }

  updateClouds() {
    if (!this.clouds) return;
    const { w, h } = this.state.map, t = performance.now() / 1000;
    for (const c of this.clouds) {
      const s = (c.phase + t * c.speed) % this.windLen;
      // tọa độ ô (liên tục): đi dọc hướng gió của trận (không có thời tiết thì gió thổi theo +x)
      const v = this.state.weather ? windVec(this.state.weather.wind) : { x: 1, y: 0.25 };
      const d = s - this.windLen / 2;
      const tx = (w - 1) / 2 + v.x * d - v.y * c.lane, ty = (h - 1) / 2 + v.y * d + v.x * c.lane;
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
    if (this.hasWater()) this.updateWater();
    if (this.hasFire()) this.updateFires();
    if (this.hasStorm()) this.driftStorm();
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
      case 'escape': this.snd('rout'); break;
      case 'reveal': if (ev.ambush) this.snd('rout'); break;
      case 'ignite': this.snd('bow_shoot'); break;
      case 'bump': this.snd('ui_deny'); break;
      case 'heal': case 'bury': this.snd('heal'); break;
      case 'rise': this.snd('rout'); break;
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
        case 'clouds': await this.moveStorm(ev); break;
        case 'rain': case 'rainstop': this.syncRain(); break;
        case 'terrain': await this.retile(ev.changes || [{ x: ev.x, y: ev.y }]); break;
        case 'ignite': await this.fireArrow(ev.unit, ev.x, ev.y); break;
        case 'fire': case 'fireout': await this.syncFires(); break;   // mưa, khô, chặt cây, cháy rừng
        case 'move': {
          const us = this.sprites.get(ev.unit);
          if (!us) break;
          const mover = s.units.find((q) => q.id === ev.unit);
          const fogWalk = mover && mover.faction !== this.viewer && this.state.fog;
          if (fogWalk && !ev.path.some((p) => this.tileSeen(p.x, p.y))) mover.__fogHide = true;
          if (mover && ((mover.hidden && mover.faction !== this.viewer) || mover.__fogHide)) {     // quân ẩn / đi hoàn toàn trong sương: không vẽ, không lộ
            delete mover.__fogHide;
            us.root.visible = false;
            const end = tileToWorld(ev.path[ev.path.length - 1].x, ev.path[ev.path.length - 1].y);
            us.root.position.set(end.x, end.y + 8); us.root.zIndex = end.y + 8.1;
            break;
          }
          if (fogWalk) this.setVeil(us, false);              // đi là lộ dạng (sự kiện 'unveil' tới sau)
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
            if (fogWalk) us.root.visible = this.tileSeen(ev.path[i - 1].x, ev.path[i - 1].y) || this.tileSeen(ev.path[i].x, ev.path[i].y);
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
          if (mover && mover.faction === this.viewer && this.state.fog) this.drawFog();   // quân mình đi: tầm nhìn đổi
          break;
        }
        case 'unveil': { const us = this.sprites.get(ev.unit); if (us) this.setVeil(us, false); break; }
        case 'spotted': { const us = this.sprites.get(ev.unit); if (us) us.root.visible = true; break; }
        case 'bump': {
          const us = this.sprites.get(ev.by);
          if (us) us.root.visible = true;
          const c = tileToWorld(ev.x, ev.y);
          await this.float(this.t('fog.bump'), c.x, c.y - 56, 0xd8402f, 24);
          break;
        }
        case 'attack': {
          const ranged = ev.attackerRole === 'archer';
          if (ev.fireShot) break;                     // tên lửa đã bay ở sự kiện 'ignite'
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
        case 'reveal': {
          const us = this.sprites.get(ev.unit);
          if (!us) break;
          const c = tileToWorld(ev.x, ev.y);
          us.root.position.set(c.x, c.y + 8); us.root.zIndex = c.y + 8.1;
          const was = us.root.visible;
          us.root.visible = true;
          if (!was) { us.root.alpha = 0; await this.tween(260, (k) => { us.root.alpha = k; }); }
          if (ev.ambush) await this.float(this.t('ui.ambush'), c.x, c.y - 60, 0xd8402f, 24);
          break;
        }
        case 'hide': {
          const us = this.sprites.get(ev.unit);
          const u = s.units.find((q) => q.id === ev.unit);
          if (us && u && u.faction !== this.viewer) { await this.tween(260, (k) => { us.root.alpha = 1 - k; }); us.root.visible = false; us.root.alpha = 1; }
          break;
        }
        case 'escape': {
          const us = this.sprites.get(ev.unit);
          const c = tileToWorld(ev.x, ev.y);
          this.float(this.t(ev.levelBefore > ev.levelAfter ? 'ui.escaped.demoted' : 'ui.escaped'), c.x, c.y - 56, 0xffd54a, 22);
          if (us) { await this.tween(500, (k) => { us.root.alpha = 1 - k; us.root.position.y = c.y + 8 + k * 14; }); us.root.destroy({ children: true }); this.sprites.delete(ev.unit); }
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
        case 'embark': case 'disembark': {
          this.reconcile();
          if (ev.launch) { const c = tileToWorld(ev.x, ev.y); await this.float(this.t('ui.launched'), c.x, c.y - 50, 0x3a78d8, 20); }
          break;
        }
        case 'grave': {
          this.drawGraves();
          const gr = this.graveSprites.get(ev.x + ',' + ev.y);
          if (gr) { gr.node.alpha = 0; await this.tween(260, (k) => { gr.node.alpha = k; }); }
          break;
        }
        case 'bury': {
          const gr = this.graveSprites?.get(ev.x + ',' + ev.y), c = tileToWorld(ev.x, ev.y);
          this.float(this.t('ui.buried'), c.x, c.y - 44, 0xf2e6b0, 20);
          if (gr) { await this.tween(420, (k) => { gr.node.alpha = 1 - k; }); }
          this.drawGraves();
          break;
        }
        case 'rise': {                                // xác trỗi dậy thành âm binh: mộ vỡ, quân nhô lên từ đất
          const u = s.units.find((q) => q.id === ev.unit);
          await this.ensureVisible(ev.x, ev.y);
          this.drawGraves();
          if (u && !this.sprites.has(u.id)) {
            const us = this.makeUnit(u);
            us.root.alpha = 0;
            const c = tileToWorld(ev.x, ev.y);
            this.float(this.t('ui.risen'), c.x, c.y - 56, 0x8be07a, 22);
            await this.tween(520, (k) => { us.root.alpha = k; us.body.position.set(0, 18 * (1 - k)); });
            us.body.position.set(0, 0);
          }
          break;
        }
        case 'chop': {
          const c = tileToWorld(ev.x, ev.y);
          await this.float(this.t('ui.chopped'), c.x, c.y - 40, 0x6b4a2a, 20);
          break;
        }
        case 'collapse': {                           // âm binh đổ sụp khi necromancer chết
          const us = this.sprites.get(ev.unit);
          if (us) {
            this.tween(500, (k) => { us.root.alpha = 1 - k; us.body.scale.y = 1 - k * 0.6; }).then(() => { us.root.destroy({ children: true }); });
            this.sprites.delete(ev.unit);
          }
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
          const hold = s.map.strongholds[ev.faction === s.sides[0] ? s.sides[1] : s.sides[0]];
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
