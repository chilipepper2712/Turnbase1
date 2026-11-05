// Vẽ doodle bằng code lên canvas 2D: nét mực đen hơi run, nền giấy.
// Mọi hàm đều deterministic theo seed để cache texture được.
import { makeRng } from '../rng.js';

export const INK = '#1b1b1b';
export const PAPER = '#f6f5f0';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Nét vẽ tay: chia nhỏ đoạn thẳng, lệch ngang ngẫu nhiên rồi làm mượt.
export function inkLine(ctx, pts, { rng, width = 2.2, color = INK, amp = 0.9, close = false, step = 7 } = {}) {
  const r = rng || makeRng(1);
  const src = close ? [...pts, pts[0]] : pts;
  const out = [];
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i], b = src[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / step));
    const nx = len ? -(b[1] - a[1]) / len : 0, ny = len ? (b[0] - a[0]) / len : 0;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const j = (r() - 0.5) * 2 * amp;
      out.push([a[0] + (b[0] - a[0]) * t + nx * j, a[1] + (b[1] - a[1]) * t + ny * j]);
    }
  }
  const last = src[src.length - 1];
  out.push([last[0], last[1]]);
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(out[0][0], out[0][1]);
  for (let i = 1; i < out.length - 1; i++) {
    const mx = (out[i][0] + out[i + 1][0]) / 2, my = (out[i][1] + out[i + 1][1]) / 2;
    ctx.quadraticCurveTo(out[i][0], out[i][1], mx, my);
  }
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
  ctx.restore();
}

function polyFill(ctx, pts, color = PAPER) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function hatch(ctx, rng, x0, y0, x1, y1, n, len = 6, color = INK, width = 1.3) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    inkLine(ctx, [[x, y], [x - len * 0.6, y + len]], { rng, width, color, amp: 0.4, step: 4 });
  }
}

// ---------- Cây thông (như ảnh tham chiếu 1) ----------
export function drawTree(seed, S = 2) {
  const w = 40, h = 60;
  const c = makeCanvas(w * S, h * S);
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const rng = makeRng(seed);
  const lw = 2;
  inkLine(ctx, [[w / 2, h - 2], [w / 2, h - 10]], { rng, width: lw + 0.6 });
  const tiers = [
    { base: h - 8, top: h - 28, half: 17 },
    { base: h - 20, top: h - 41, half: 14 },
    { base: h - 33, top: h - 56, half: 10.5 },
  ];
  for (const t of tiers) {
    const j = () => (rng() - 0.5) * 2;
    const pts = [[w / 2 + j(), t.top + j()], [w / 2 + t.half + j(), t.base + j()], [w / 2 - t.half + j(), t.base + j()]];
    polyFill(ctx, pts);
    inkLine(ctx, pts, { rng, width: lw, close: true, amp: 0.7 });
  }
  return c;
}

// ---------- Đồi ----------
export function drawHill(seed, S = 2) {
  const w = 78, h = 44;
  const c = makeCanvas(w * S, h * S);
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const rng = makeRng(seed);
  const curve = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    curve.push([6 + t * (w - 12), h - 5 - Math.sin(t * Math.PI) * (h - 14) * (0.85 + rng() * 0.25)]);
  }
  polyFill(ctx, [...curve, [w - 6, h - 5], [6, h - 5]]);
  inkLine(ctx, curve, { rng, width: 2.2, amp: 0.8 });
  inkLine(ctx, [[2, h - 5], [w - 2, h - 5]], { rng, width: 1.6, amp: 0.6 });
  hatch(ctx, rng, w * 0.55, h - 14, w - 14, h - 9, 5, 7);
  return c;
}

// ---------- Núi ----------
export function drawMountain(seed, S = 2) {
  const w = 120, h = 104;
  const c = makeCanvas(w * S, h * S);
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const rng = makeRng(seed);
  const j = (a = 3) => (rng() - 0.5) * 2 * a;
  const main = [[6, h - 6], [34 + j(), 26 + j()], [54 + j(), 8 + j(4)], [74 + j(), 34 + j()], [88 + j(), 22 + j()], [w - 6, h - 6]];
  polyFill(ctx, main);
  inkLine(ctx, main, { rng, width: 2.6, amp: 1, close: false });
  inkLine(ctx, [[2, h - 6], [w - 2, h - 6]], { rng, width: 1.8 });
  // sườn tối + gạch bóng
  const ridge = [[54, 8], [52 + j(2), 36], [58 + j(), 58], [48 + j(), 84]];
  inkLine(ctx, ridge, { rng, width: 1.8, amp: 1 });
  for (let i = 0; i < 9; i++) {
    const x = 58 + i * 5.5 + j(1.5), y = 30 + i * 6;
    inkLine(ctx, [[x, y], [x + 7, y + 12 + j(2)]], { rng, width: 1.4, amp: 0.4, step: 4 });
  }
  hatch(ctx, rng, 18, h - 22, 34, h - 12, 4, 8);
  // đỉnh phụ
  inkLine(ctx, [[34, 26], [30 + j(), 50], [38 + j(), 66]], { rng, width: 1.5, amp: 0.8 });
  // tuyết trên đỉnh
  inkLine(ctx, [[46, 22], [50, 18], [54, 24], [58, 17], [62, 24]], { rng, width: 1.4, amp: 0.5 });
  return c;
}

// ---------- Hầm mỏ ----------
export function drawMine(seed, S = 2) {
  const w = 84, h = 60;
  const c = makeCanvas(w * S, h * S);
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const rng = makeRng(seed);
  const curve = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    curve.push([6 + t * (w - 12), h - 6 - Math.sin(t * Math.PI) * (h - 14) * (0.9 + rng() * 0.15)]);
  }
  polyFill(ctx, [...curve, [w - 6, h - 6], [6, h - 6]]);
  inkLine(ctx, curve, { rng, width: 2.4, amp: 0.8 });
  inkLine(ctx, [[2, h - 6], [w - 2, h - 6]], { rng, width: 1.6 });
  // cửa hầm: khung gỗ + bóng tối
  const cx = w / 2, by = h - 6;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(cx - 11, by); ctx.lineTo(cx - 11, by - 17); ctx.quadraticCurveTo(cx, by - 27, cx + 11, by - 17); ctx.lineTo(cx + 11, by);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  inkLine(ctx, [[cx - 14, by], [cx - 14, by - 19], [cx + 14, by - 19], [cx + 14, by]], { rng, width: 2.4, amp: 0.5 });
  inkLine(ctx, [[cx - 16, by - 19], [cx + 16, by - 19]], { rng, width: 2.6, amp: 0.4 });
  // ray xe goòng
  inkLine(ctx, [[cx - 7, by + 1], [cx - 14, by + 4]], { rng, width: 1.4 });
  inkLine(ctx, [[cx + 7, by + 1], [cx + 14, by + 4]], { rng, width: 1.4 });
  // đá nhỏ
  for (let i = 0; i < 3; i++) {
    const x = 12 + rng() * (w - 24), y = by - 4 - rng() * 6;
    inkLine(ctx, [[x, y], [x + 4, y - 3], [x + 8, y]], { rng, width: 1.3, amp: 0.3 });
  }
  return c;
}

// ---------- Nền ô (bake vào chunk) ----------
export const GROUND = {
  plain: '#f5f4ee', field: '#f1f0e6', forest: '#efeee7', hill: '#f0efe8', mountain: '#ecebe4',
  peak: '#ecebe4', swamp: '#e2e7dc', river: '#dfe2e3', bridge: '#dfe2e3', village: '#f2f0e6', mine: '#efeee7', fort: '#f1f0e8', stronghold: '#eeeadf',
};

function diamond(ctx, cx, cy, TW, TH) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - TH / 2); ctx.lineTo(cx + TW / 2, cy); ctx.lineTo(cx, cy + TH / 2); ctx.lineTo(cx - TW / 2, cy);
  ctx.closePath();
}

// Cạnh ô: 0=-y (trên-phải) 1=+x (dưới-phải) 2=+y (dưới-trái) 3=-x (trên-trái)
function edgePoints(cx, cy, TW, TH, side) {
  const T = [cx, cy - TH / 2], R = [cx + TW / 2, cy], B = [cx, cy + TH / 2], L = [cx - TW / 2, cy];
  return { 0: [T, R], 1: [R, B], 2: [B, L], 3: [L, T] }[side];
}

export function drawGroundTile(ctx, cx, cy, tid, ctxInfo) {
  const { TW, TH, neighbors, seed } = ctxInfo;
  const rng = makeRng(seed);
  ctx.save();
  diamond(ctx, cx, cy, TW, TH);
  ctx.fillStyle = GROUND[tid] || GROUND.plain;
  ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); // che khe hở giữa các ô
  ctx.restore();

  // hạt giấy
  ctx.save();
  diamond(ctx, cx, cy, TW, TH); ctx.clip();
  ctx.fillStyle = 'rgba(80,80,70,0.10)';
  for (let i = 0; i < 7; i++) {
    const px = cx + (rng() - 0.5) * TW * 0.8, py = cy + (rng() - 0.5) * TH * 0.8;
    ctx.fillRect(px, py, 1.4, 1.4);
  }
  ctx.restore();

  const e1 = [TW / 2, TH / 2], e2 = [-TW / 2, TH / 2]; // +x, +y
  if (tid === 'field') {
    for (let i = -2; i <= 2; i++) {
      const o = i * 0.17;
      const a = [cx + e2[0] * o - e1[0] * 0.36, cy + e2[1] * o - e1[1] * 0.36];
      const b = [cx + e2[0] * o + e1[0] * 0.36, cy + e2[1] * o + e1[1] * 0.36];
      inkLine(ctx, [a, b], { rng, width: 1.1, color: '#6c6c64', amp: 0.7, step: 5 });
    }
  } else if (tid === 'river' || tid === 'bridge') {
    for (let i = 0; i < 3; i++) {
      const o = (rng() - 0.5) * 0.7, s = (rng() - 0.5) * 0.4;
      const a = [cx + e2[0] * o + e1[0] * (s - 0.16), cy + e2[1] * o + e1[1] * (s - 0.16)];
      const b = [cx + e2[0] * o + e1[0] * (s + 0.16), cy + e2[1] * o + e1[1] * (s + 0.16)];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 3];
      inkLine(ctx, [a, m, b], { rng, width: 1.2, color: '#7b8083', amp: 0.3, step: 5 });
    }
  } else if (tid === 'swamp') {
    // đầm lầy: gợn nước ngắn + bụi lau
    for (let i = 0; i < 4; i++) {
      const px = cx + (rng() - 0.5) * TW * 0.6, py = cy + (rng() - 0.5) * TH * 0.55;
      inkLine(ctx, [[px - 7, py], [px - 2, py - 2], [px + 3, py], [px + 8, py - 1]], { rng, width: 1.1, color: '#6f7b74', amp: 0.3, step: 4 });
    }
    for (let i = 0; i < 3; i++) {
      const px = cx + (rng() - 0.5) * TW * 0.55, py = cy + (rng() - 0.5) * TH * 0.4 + 4;
      for (const dx of [-3, 0, 3]) inkLine(ctx, [[px + dx, py], [px + dx * 1.4, py - 8 - rng() * 3]], { rng, width: 1.2, color: '#4d5a50', amp: 0.2, step: 4 });
    }
  } else if (tid === 'stronghold' || tid === 'village') {
    for (let i = 0; i < 6; i++) {
      const px = cx + (rng() - 0.5) * TW * 0.55, py = cy + (rng() - 0.5) * TH * 0.55;
      ctx.fillStyle = 'rgba(70,70,60,0.35)'; ctx.fillRect(px, py, 1.8, 1.8);
    }
  }

  // bờ sông
  if (tid === 'river') {
    for (let side = 0; side < 4; side++) {
      const nb = neighbors[side];
      if (nb && nb !== 'river' && nb !== 'bridge') {
        const [a, b] = edgePoints(cx, cy, TW, TH, side);
        inkLine(ctx, [a, b], { rng, width: 2.2, amp: 1.1, step: 8 });
      }
    }
  }
  if (tid === 'bridge') {
    // cầu bắc ngang qua sông: sông chạy theo trục x (hai bên ±x là nước) thì cầu chạy theo trục y, ngược lại cầu chạy theo trục x
    const isW = (t) => t === 'river' || t === 'bridge';
    const waterAlongX = neighbors[1] === 'river' || neighbors[3] === 'river';
    const waterAlongY = neighbors[0] === 'river' || neighbors[2] === 'river';
    const alongY = waterAlongX || !waterAlongY;
    const L = alongY ? e2 : e1, Wd = alongY ? e1 : e2;      // L: hướng dọc cầu, Wd: hướng ngang cầu
    const hw = 0.27;
    const P = (t, u) => [cx + L[0] * t + Wd[0] * u, cy + L[1] * t + Wd[1] * u];
    const c1 = P(-0.5, -hw), c2 = P(-0.5, hw), c3 = P(0.5, hw), c4 = P(0.5, -hw);
    polyFill(ctx, [c1, c2, c3, c4], '#f7f6f1');
    inkLine(ctx, [c1, c4], { rng, width: 2.2, amp: 0.7 });
    inkLine(ctx, [c2, c3], { rng, width: 2.2, amp: 0.7 });
    for (let i = -4; i <= 4; i++) {
      const t = i / 8.4;
      inkLine(ctx, [P(t, -hw), P(t, hw)], { rng, width: 1.2, amp: 0.3, step: 6 });
    }
  }
}

// ---------- Fallback đơn vị (khi chưa có sprite thật) ----------
export function drawFallbackUnit(role, S = 2) {
  const w = 70, h = 90;
  const c = makeCanvas(w * S, h * S);
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const rng = makeRng(role.length * 131 + role.charCodeAt(0));
  const body = [[22, 38], [48, 38], [48, 78], [22, 78]];
  polyFill(ctx, body);
  inkLine(ctx, body, { rng, width: 2.6, close: true });
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(35, 26, 9, 0, Math.PI * 2); ctx.fill();
  inkLine(ctx, [[30, 56], [40, 56]], { rng, width: 2 });
  inkLine(ctx, [[35, 50], [35, 64]], { rng, width: 2 });
  if (role === 'archer') inkLine(ctx, [[58, 24], [64, 50], [58, 76]], { rng, width: 2.2 });
  else inkLine(ctx, [[58, 14], [58, 80]], { rng, width: 2.4 });
  return c;
}

export function drawFallbackBuilding(seed, S = 2) {
  const w = 90, h = 70;
  const c = makeCanvas(w * S, h * S);
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  const rng = makeRng(seed);
  const body = [[14, h - 8], [14, 30], [76, 30], [76, h - 8]];
  polyFill(ctx, body);
  inkLine(ctx, body, { rng, width: 2.4, close: true });
  inkLine(ctx, [[8, 32], [45, 8], [82, 32]], { rng, width: 2.4 });
  return c;
}

// ---------- Mây nhìn từ trên xuống ----------
// Trả { cloud, shadow }: hai canvas cùng kích thước, cùng hình bóng. Cloud: trắng đục nhẹ viền mực mảnh;
// shadow: xám nhoè (giả blur bằng nhiều lớp mờ dần, vì ctx.filter không chạy trên mọi trình duyệt).
export function drawCloud(seed, S = 2) {
  const rng = makeRng(seed);
  const W = 240, H = 130;
  const blobs = [];
  const n = 5 + rng.int(3);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const mid = 1 - Math.abs(t - 0.5) * 1.5;
    blobs.push({ x: 28 + t * (W - 56), y: H / 2 + (rng() - 0.5) * 18, r: 16 + mid * 22 + rng() * 8 });
  }
  const mk = () => { const c = makeCanvas(W * S, H * S); const x = c.getContext('2d'); x.scale(S, S); return [c, x]; };
  const [cloud, cx] = mk();
  cx.strokeStyle = 'rgba(40,40,36,0.75)'; cx.lineWidth = 2.2;
  for (const b of blobs) { cx.beginPath(); cx.arc(b.x, b.y, b.r + 1, 0, Math.PI * 2); cx.stroke(); }
  cx.fillStyle = '#ffffff';
  for (const b of blobs) { cx.beginPath(); cx.arc(b.x, b.y, b.r, 0, Math.PI * 2); cx.fill(); }
  // vài nét cong bên trong như ảnh vẽ tay
  cx.strokeStyle = 'rgba(40,40,36,0.45)'; cx.lineWidth = 1.5; cx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const b = blobs[1 + rng.int(blobs.length - 2)];
    cx.beginPath(); cx.arc(b.x + 2, b.y + 2, b.r * 0.55, Math.PI * 0.15, Math.PI * 0.75); cx.stroke();
  }
  const [shadow, sx] = mk();
  for (let k = 7; k >= 0; k--) {
    sx.fillStyle = `rgba(30,32,36,${0.022 + (7 - k) * 0.006})`;
    for (const b of blobs) { sx.beginPath(); sx.arc(b.x, b.y, b.r * 0.92 + k * 2.2, 0, Math.PI * 2); sx.fill(); }
  }
  return { cloud, shadow, w: W, h: H };
}
