// Registry asset có fallback:
//   - Đơn vị: assets/units/<faction>_<role>.png  (nếu có thì dùng thẳng, ưu tiên cao nhất)
//             assets/units/<role>.png            (nét đen nền trong suốt) + <role>_fill.png (mask vùng tô màu phe)
//             không có file nào -> vẽ bằng code (fallback).
//   - Công trình: assets/buildings/<tên>.png (+ _fill.png), cùng cách.
// Thả file đúng tên vào thư mục là thay được, không cần sửa code.
import { FACTIONS } from '../config.js';
import { makeCanvas, drawTree, drawHill, drawMountain, drawMine, drawFallbackUnit, drawFallbackBuilding, INK } from './doodle.js';

export const RES = 2; // texture dựng ở độ phân giải gấp đôi, sprite scale 1/RES

// Chiều cao thân mong muốn (đơn vị thế giới). Kỵ binh giữ nguyên cả ngựa lẫn cờ vì to hơn sẽ che hết ô.
const UNIT_HEIGHT = { militia: 62, infantry: 62, archer: 62, cavalry: 70 };
const BODY_FRAC = {
  human: { militia: 0.92, infantry: 0.89, archer: 1.0, cavalry: 1.0 },
  orc:   { militia: 0.92, infantry: 1.0,  archer: 1.0, cavalry: 1.0 },
};

// Chi tiết orc vẽ thêm lên sprite người (toạ độ chuẩn hoá theo ảnh sprite)
const ORC_FEATURES = {
  militia:  { heads: [[0.38, 0.27]], size: 0.2 },
  infantry: { heads: [[0.34, 0.13]], size: 0.2 },
  archer:   { heads: [[0.42, 0.34]], size: 0.2 },
  cavalry:  { heads: [[0.38, 0.2]], size: 0.13, ears: [[0.86, 0.33]] },
};

// Công trình: tên sprite -> chiều rộng hiển thị (px thế giới)
const BUILDING_WIDTH = {
  stronghold: 118, castle_town: 124, fortress: 110, village_a: 78, village_b: 78, cottages: 74, hamlet: 60,
  tower_a: 50, tower_b: 46, tower_c: 48, keep: 100, manor: 76, town: 96, inn: 56, city: 104, domed: 100,
  ruin_a: 70, ruin_b: 66, ruin_c: 66, ruin_d: 70, ruin_e: 58,
  // Kenney Cartography Pack (CC0), nhập bằng tools/import_kenney.py
  // Thành chính nhỏ hơn hẳn để nằm gọn trong ô (ô rộng 96); công trình khác nhỏ lại ~8% so với cây.
  castle: 80, castleTall: 86, castleWide: 90, castleWideLow: 76, gate: 52, wall: 52,
  towerLow: 48, tower: 46, towerTall: 50, towerWatch: 48, watchtower: 52,
  house: 50, houseChimney: 54, houseSmall: 44, houseTall: 46, houseViking: 52, houses: 64,
  church: 58, churchLarge: 68, mill: 52, mine: 68, stable: 60, tent: 54, tipi: 40, well: 32, campfire: 32,
  fence: 48, flag: 30, banner: 30, bush: 28,
  treePine: 28, treePineLarge: 40, treePines: 56, treePinesSmall: 50, treeTall: 28,
  rocks: 64, rocksA: 58, rocksB: 62, rocksMountain: 80, rocksTall: 74,
};

// Bản đóng gói một file nhúng sprite dạng data: URI vào window.__ASSET_DATA__.
// Khi có map này, file không có trong map coi như không tồn tại (không gửi request nào).
function loadImage(url) {
  const emb = globalThis.__ASSET_DATA__;
  if (emb && !emb[url]) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = emb ? emb[url] : url;
  });
}

function tintedCanvas(line, fill, color, outW, outH) {
  const c = makeCanvas(outW, outH);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (fill && color) {
    const t = makeCanvas(outW, outH);
    const tc = t.getContext('2d');
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(fill, 0, 0, outW, outH);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = color;
    tc.fillRect(0, 0, outW, outH);
    ctx.drawImage(t, 0, 0);
  }
  ctx.drawImage(line, 0, 0, outW, outH);
  return c;
}

function drawHorns(ctx, x, y, size, outW) {
  const s = size * outW;
  ctx.save();
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.08); ctx.lineJoin = 'round';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + dir * s * 0.22, y + s * 0.18);
    ctx.quadraticCurveTo(x + dir * s * 0.75, y + s * 0.05, x + dir * s * 0.7, y - s * 0.62);
    ctx.quadraticCurveTo(x + dir * s * 0.42, y - s * 0.12, x + dir * s * 0.05, y + s * 0.2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawEars(ctx, x, y, size, outW) {
  const s = size * outW;
  ctx.save();
  ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, s * 0.06); ctx.lineJoin = 'round';
  for (const dx of [-0.12, 0.12]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * outW * 0.18 - s * 0.16, y);
    ctx.lineTo(x + dx * outW * 0.18, y - s * 0.55);
    ctx.lineTo(x + dx * outW * 0.18 + s * 0.16, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export class Assets {
  constructor() {
    this.cache = new Map();
    this.imgs = new Map();
    this.report = { found: [], fallback: [] };
  }

  async init() {
    const pre = [];
    for (const role of Object.keys(UNIT_HEIGHT)) {
      pre.push(this._img(`assets/units/${role}.png`), this._img(`assets/units/${role}_fill.png`));
      for (const f of Object.keys(FACTIONS)) {
        pre.push(this._img(`assets/units/${f}_${role}.png`), this._img(`assets/units/${f}_${role}_fill.png`));
      }
    }
    for (const n of Object.keys(BUILDING_WIDTH)) {
      pre.push(this._img(`assets/buildings/${n}.png`), this._img(`assets/buildings/${n}_fill.png`));
    }
    await Promise.all(pre);
  }

  async _img(url) {
    if (!this.imgs.has(url)) this.imgs.set(url, await loadImage(url));
    return this.imgs.get(url);
  }

  _tex(canvas) {
    const t = PIXI.Texture.from(canvas);
    t.source.style.scaleMode = 'linear';
    return t;
  }

  // Trả { texture, anchor:[x,y] } – gốc ở chân đơn vị
  unit(role, faction) {
    const k = `u:${role}:${faction}`;
    if (this.cache.has(k)) return this.cache.get(k);
    let res;
    const own = this.imgs.get(`assets/units/${faction}_${role}.png`);
    const ownFill = this.imgs.get(`assets/units/${faction}_${role}_fill.png`);
    const base = this.imgs.get(`assets/units/${role}.png`);
    const baseFill = this.imgs.get(`assets/units/${role}_fill.png`);
    // Chiều cao thân (đầu tới chân) là thứ phải đồng đều giữa các quân; giáo/kiếm nhô cao hơn đầu không được tính.
    // BODY_FRAC = phần thân chiếm trong chiều cao toàn ảnh, nên ảnh có vũ khí dài được phóng to bù lại.
    const H = (UNIT_HEIGHT[role] / (BODY_FRAC[faction]?.[role] ?? 1)) * (faction === 'orc' ? 0.95 : 1.1) * RES;   // Orc nhỏ lại ~12% so với trước (1.08 -> 0.95), người to thêm 10%
    const color = FACTIONS[faction].fill;
    if (own) {
      const W = Math.round(own.width * (H / own.height));
      res = { canvas: tintedCanvas(own, ownFill, color, W, Math.round(H)) };
      this.report.found.push(`${faction}_${role}`);
    } else if (base) {
      const W = Math.round(base.width * (H / base.height)), Hh = Math.round(H);
      const c = tintedCanvas(base, baseFill, color, W, Hh);
      if (faction === 'orc') {
        const ctx = c.getContext('2d');
        const f = ORC_FEATURES[role];
        for (const [hx, hy] of f.heads) drawHorns(ctx, hx * W, hy * Hh, f.size, W);
        for (const [ex, ey] of f.ears || []) drawEars(ctx, ex * W, ey * Hh, 0.12, W);
      }
      res = { canvas: c };
      this.report.found.push(role);
    } else {
      const fb = drawFallbackUnit(role, RES);
      const c = makeCanvas(fb.width, fb.height);
      c.getContext('2d').drawImage(fb, 0, 0);
      res = { canvas: c };
      this.report.fallback.push(role);
    }
    res.texture = this._tex(res.canvas);
    res.anchor = [0.5, 0.97];
    this.cache.set(k, res);
    return res;
  }

  // Có file ảnh cho công trình/đạo cụ này không (để chọn giữa sprite thật và fallback)
  has(name) { return !!this.imgs.get(`assets/buildings/${name}.png`); }

  // tint: màu tô hoặc null (xám nhạt trung tính). anchorY: điểm đặt theo chiều dọc (0.96 = sát chân cho icon đã cắt sát)
  building(name, tint = '#e9e8e2', anchorY = 0.88) {
    const k = `b:${name}:${tint}:${anchorY}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const line = this.imgs.get(`assets/buildings/${name}.png`);
    const fill = this.imgs.get(`assets/buildings/${name}_fill.png`);
    let canvas;
    if (line) {
      const W = Math.round((BUILDING_WIDTH[name] || 80) * RES);
      const H = Math.round(line.height * (W / line.width));
      canvas = tintedCanvas(line, fill, tint, W, H);
    } else {
      canvas = drawFallbackBuilding(name.length, RES);
    }
    const res = { texture: this._tex(canvas), anchor: [0.5, anchorY] };
    this.cache.set(k, res);
    return res;
  }

  deco(kind, variant) {
    const k = `d:${kind}:${variant}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const seed = 1000 + variant * 77;
    const canvas = { tree: drawTree, hill: drawHill, mountain: drawMountain, mine: drawMine }[kind](seed, RES);
    const res = { texture: this._tex(canvas), anchor: [0.5, 0.93] };
    this.cache.set(k, res);
    return res;
  }
}
