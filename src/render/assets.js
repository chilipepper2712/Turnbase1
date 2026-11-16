// Registry asset có fallback:
//   - Đơn vị: assets/units/<faction>_<role>.png  (nếu có thì dùng thẳng, ưu tiên cao nhất)
//             assets/units/<role>.png            (nét đen nền trong suốt) + <role>_fill.png (mask vùng tô màu phe)
//             không có file nào -> vẽ bằng code (fallback).
//   - Công trình: assets/buildings/<tên>.png (+ _fill.png), cùng cách.
// Thả file đúng tên vào thư mục là thay được, không cần sửa code.
import { FACTIONS } from '../config.js';
import { makeCanvas, drawTree, drawHill, drawMountain, drawMine, drawFallbackUnit, drawFallbackBuilding, INK } from './doodle.js';

// Sprite địa hình pixel art (assets/terrain/<nhóm>_<n>.png, tools/prep_decor.py): số biến thể mỗi nhóm
export const TERRAIN_DECO = { pine: 8, tuft: 6, bush: 4, tiny: 3, boulder: 5, mound: 3, reed: 4, shrub: 3, hill: 1, house: 8, tower: 5, mine: 1, castle: 3, camp: 3 };
// Nhóm công trình: bóng chân là vệt phẳng rộng hoà vào nền (hoặc file <nhóm>_<n>_shadow.png vẽ tay nếu có)
const BUILDING_GROUPS = new Set(['house', 'tower', 'mine', 'castle', 'camp']);
// Chân dung lấy từ character sheet trailer (tools/prep_portraits.py): assets/portraits/<tên>.png
const PORTRAITS = [
  'human_militia', 'human_infantry', 'human_archer', 'human_cavalry', 'human_marine', 'human_marineboat',
  'orc_militia', 'orc_infantry', 'orc_archer', 'orc_cavalry', 'orc_goblin',
  'undead_human_militia', 'undead_human_infantry', 'undead_human_archer', 'undead_human_cavalry',
  'undead_orc_militia', 'undead_orc_infantry', 'undead_orc_archer', 'undead_orc_cavalry', 'undead_necromancer',
  'camp_human', 'camp_orc',
];
export function portraitName(u) {
  if (u.static) return `camp_${u.faction}`;
  if (u.faction === 'undead') return u.role === 'necromancer' ? 'undead_necromancer' : `undead_${u.origin || 'human'}_${u.role}`;
  if (u.role === 'marine') return u.afloat ? 'human_marineboat' : 'human_marine';
  return `${u.faction}_${u.role}`;
}
const PIXEL_UP = 4; // texture dựng gấp 4 lần pixel gốc (nearest), sprite scale = (px thế giới trên 1 pixel gốc) / PIXEL_UP

export const RES = 2; // texture dựng ở độ phân giải gấp đôi, sprite scale 1/RES

// Chiều cao thân mong muốn (đơn vị thế giới). Kỵ binh giữ nguyên cả ngựa lẫn cờ vì to hơn sẽ che hết ô.
const UNIT_HEIGHT = { militia: 62, infantry: 62, archer: 62, cavalry: 70, goblin: 50, necromancer: 68, marine: 62, marineboat: 60, boat: 30 };
// Animation đi bộ: dải frame ngang assets/units/<phe>_<quân>_walk.png (tools/prep_walk.py). frames = số frame,
// scale = chỉnh cỡ so với sprite đứng yên (1 = cùng chiều cao), fps = nhịp bước.
export const WALK = {
};
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
      for (const f of Object.keys(FACTIONS)) if (WALK[`${f}_${role}`]) pre.push(this._img(`assets/units/${f}_${role}_walk.png`));
      for (const f of Object.keys(FACTIONS)) {
        pre.push(this._img(`assets/units/${f}_${role}.png`), this._img(`assets/units/${f}_${role}_fill.png`));
      }
    }
    // âm binh: sprite theo phe gốc (giữ đồng phục lúc còn sống)
    for (const o of ['human', 'orc']) for (const r of Object.keys(UNIT_HEIGHT)) pre.push(this._img(`assets/units/undead_${o}_${r}.png`));
    for (const n of Object.keys(BUILDING_WIDTH)) {
      pre.push(this._img(`assets/buildings/${n}.png`), this._img(`assets/buildings/${n}_fill.png`));
    }
    for (let i = 0; i < 6; i++) pre.push(this._img(`assets/clouds/cloud${i}.png`));
    for (const n of PORTRAITS) pre.push(this._img(`assets/portraits/${n}.png`));
    for (const [g, n] of Object.entries(TERRAIN_DECO)) {
      for (let i = 0; i < n; i++) {
        pre.push(this._img(`assets/terrain/${g}_${i}.png`));
        if (BUILDING_GROUPS.has(g)) pre.push(this._img(`assets/terrain/${g}_${i}_shadow.png`));   // bóng vẽ tay (tuỳ chọn)
      }
    }
    await Promise.all(pre);
    this.cloudImgs = [];
    for (let i = 0; i < 6; i++) { const im = this.imgs.get(`assets/clouds/cloud${i}.png`); if (im) this.cloudImgs.push(im); }
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

  unitHeight(role, faction) {
    return (UNIT_HEIGHT[role] / (BODY_FRAC[faction]?.[role] ?? 1)) * (faction === 'orc' ? 0.95 : 1.1) * RES;
  }

  // Các frame đi bộ { textures, fps } hoặc null nếu quân này chưa có animation
  walk(role, faction) {
    const key = `${faction}_${role}`, cfg = WALK[key];
    if (!cfg) return null;
    const ck = 'w:' + key;
    if (this.cache.has(ck)) return this.cache.get(ck);
    const img = this.imgs.get(`assets/units/${key}_walk.png`);
    let res = null;
    if (img) {
      const fw = img.width / cfg.frames, fh = img.height;
      const H = Math.round(this.unitHeight(role, faction) * (cfg.scale ?? 1)), W = Math.round(fw * H / fh);
      const textures = [];
      for (let i = 0; i < cfg.frames; i++) {
        const c = makeCanvas(W, H);
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, i * fw, 0, fw, fh, 0, 0, W, H);
        textures.push(this._tex(c));
      }
      res = { textures, fps: cfg.fps || 12 };
    }
    this.cache.set(ck, res);
    return res;
  }

  // Trả { texture, anchor:[x,y] } – gốc ở chân đơn vị
  unit(role, faction, origin) {
    const k = `u:${role}:${faction}:${origin || ''}`;
    if (this.cache.has(k)) return this.cache.get(k);
    let res;
    const own = (origin && this.imgs.get(`assets/units/${faction}_${origin}_${role}.png`)) || this.imgs.get(`assets/units/${faction}_${role}.png`);
    const ownFill = this.imgs.get(`assets/units/${faction}_${role}_fill.png`);
    const base = this.imgs.get(`assets/units/${role}.png`);
    const baseFill = this.imgs.get(`assets/units/${role}_fill.png`);
    // Chiều cao thân (đầu tới chân) là thứ phải đồng đều giữa các quân; giáo/kiếm nhô cao hơn đầu không được tính.
    // BODY_FRAC = phần thân chiếm trong chiều cao toàn ảnh, nên ảnh có vũ khí dài được phóng to bù lại.
    const H = this.unitHeight(role, origin || faction);
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

  // Vật thể địa hình pixel art: có đủ file chưa
  hasPixelDeco() { return Object.keys(TERRAIN_DECO).every((g) => !!this.imgs.get(`assets/terrain/${g}_0.png`)); }

  // Sprite pixel art nguyên bản, phóng nearest, kèm bóng đổ phẳng ngay dưới chân (vật thể khỏi "chênh vênh" trên nền).
  // Trả { texture, anchor, up }: đặt sprite.scale = (px thế giới / pixel gốc) / up.
  pixelDeco(group, variant, shadow = true) {
    const k = `p:${group}:${variant}:${shadow}`;
    if (this.cache.has(k)) return this.cache.get(k);
    const img = this.imgs.get(`assets/terrain/${group}_${variant}.png`);
    if (!img) return null;
    const U = PIXEL_UP, w = img.width * U, h = img.height * U;
    const building = BUILDING_GROUPS.has(group);
    const hand = building ? this.imgs.get(`assets/terrain/${group}_${variant}_shadow.png`) : null;
    let sw = w * 0.78, sh = Math.max(U * 2, sw * 0.26);
    let padB = shadow ? Math.ceil(sh * 0.4) : 0;
    let cw = w;
    if (building && shadow && !hand) { sw = w * 1.04; sh = sw * 0.34; padB = Math.ceil(sh * 0.38); cw = Math.ceil(w * 1.06); }
    if (hand && shadow) {                                   // bóng vẽ tay: căn giữa-đáy với sprite, thò xuống dưới 2 pixel
      cw = Math.max(w, hand.width * U); padB = Math.max(0, hand.height * U - U * 4) + U * 2;
    }
    const c = makeCanvas(cw, h + padB);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const ox = Math.round((cw - w) / 2);
    if (shadow) {
      if (hand) {
        ctx.drawImage(hand, Math.round((cw - hand.width * U) / 2), h + U * 2 - hand.height * U, hand.width * U, hand.height * U);
      } else if (building) {
        // vệt bóng dưới chân: elip phẳng theo lưới pixel, mép dither hai lớp cho hoà vào đất
        const cxp = ox + w / 2 + w * 0.03, cyp = h - sh * 0.28;
        const rx = sw / 2 / U, ry = sh / 2 / U;
        for (let gy = -Math.ceil(ry); gy <= Math.ceil(ry); gy++) for (let gx = -Math.ceil(rx); gx <= Math.ceil(rx); gx++) {
          const r = Math.hypot(gx / rx, gy / ry);
          if (r > 1) continue;
          const chk = (gx + gy) & 1;
          let a = 0.30;
          if (r > 0.86) a = chk ? 0.30 : 0;                 // vành ngoài: cách một điểm
          else if (r > 0.70) a = chk ? 0.30 : 0.15;
          if (!a) continue;
          ctx.fillStyle = `rgba(20,45,25,${a})`;
          ctx.fillRect(Math.round(cxp + gx * U), Math.round(cyp + gy * U), U, U);
        }
      } else {
        ctx.fillStyle = 'rgba(20,45,25,0.36)';
        ctx.beginPath();
        ctx.ellipse(w / 2 + w * 0.06, h - sh * 0.15, sw / 2, sh / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.drawImage(img, ox, 0, w, h);
    const t = PIXI.Texture.from(c);
    t.source.style.scaleMode = 'nearest';
    const res = { texture: t, anchor: [(ox + w / 2) / cw, h / (h + padB)], up: U, w: img.width, h: img.height };
    this.cache.set(k, res);
    return res;
  }

  // Ảnh chân dung (data URL) cho khung thông tin: nửa trên của sprite quân, hoặc cả trại với công trình tĩnh
  portrait(u) {
    const art = this.imgs.get(`assets/portraits/${portraitName(u)}.png`);
    if (art) return art.src;                          // tranh trailer
    const key = `pt:${u.static ? 'camp' + u.faction : u.role + ':' + u.faction + ':' + (u.origin || '') + ':' + (u.afloat ? 1 : 0)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let src = null, crop = null;
    if (u.static) {
      src = this.imgs.get(`assets/terrain/camp_${u.faction === 'human' ? 0 : u.faction === 'undead' ? 2 : 1}.png`);
    } else {
      const r = this.unit(u.role === 'marine' && u.afloat ? 'marineboat' : u.role, u.faction, u.origin);
      src = r.canvas;
      const full = u.role === 'cavalry' || u.role === 'marine' && u.afloat;
      if (src && !full) {
        const side = Math.min(src.width, src.height * 0.6);
        crop = [(src.width - side) / 2, 0, side, side];
      }
    }
    let url = '';
    if (src) {
      const S = 96, c = makeCanvas(S, S), ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = !!u.static ? false : true; ctx.imageSmoothingQuality = 'high';
      const [sx, sy, sw, sh] = crop || [0, 0, src.width, src.height];
      const k = Math.min((S - 8) / sw, (S - 8) / sh);
      ctx.drawImage(src, sx, sy, sw, sh, (S - sw * k) / 2, (S - sh * k) / 2, sw * k, sh * k);
      try { url = c.toDataURL('image/png'); } catch { url = ''; }
    }
    this.cache.set(key, url);
    return url;
  }
}
