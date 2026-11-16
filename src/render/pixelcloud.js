// Mây pixel art sinh bằng code: cụm vòng tròn, đỉnh trắng, đáy xanh nhạt, mép cứng (không viền, không khử răng cưa).
// Bóng đổ là hình bóng phẳng của chính đám mây (ép dẹt theo phối cảnh), cũng cứng cạnh.
import { makeCanvas } from './doodle.js';

const W = 120, H = 56;                 // lưới pixel gốc của một đám mây
const TOP = [255, 255, 255], MID = [232, 240, 249], LOW = [196, 214, 234];

export function makePixelCloud(rng) {
  const base = Math.round(H * 0.74);                    // đáy phẳng
  const n = 5 + rng.int(3);
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const r = 11 + rng() * 11 * (1 - Math.abs(t - 0.5) * 1.1);
    blobs.push({ x: 16 + t * (W - 32) + (rng() - 0.5) * 6, y: base - r * (0.45 + rng() * 0.5), r });
  }
  const mask = new Uint8Array(W * H), top = new Int16Array(W).fill(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y > base) continue;
    for (const b of blobs) {
      const dx = x - b.x, dy = (y - b.y) * 1.05;
      if (dx * dx + dy * dy <= b.r * b.r) { mask[y * W + x] = 1; if (y < top[x]) top[x] = y; break; }
    }
  }
  const cloud = makeCanvas(W, H), shadow = makeCanvas(W, H);
  const cx = cloud.getContext('2d'), sx = shadow.getContext('2d');
  const ci = cx.createImageData(W, H), si = sx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    const k = (y * W + x) * 4;
    const hgt = base - top[x] + 1, rel = (y - top[x]) / hgt;       // 0 ở đỉnh cột, 1 ở đáy
    const c = rel < 0.5 ? TOP : rel < 0.78 ? MID : LOW;
    ci.data[k] = c[0]; ci.data[k + 1] = c[1]; ci.data[k + 2] = c[2]; ci.data[k + 3] = 255;
    si.data[k] = 40; si.data[k + 1] = 58; si.data[k + 2] = 38; si.data[k + 3] = 255;
  }
  cx.putImageData(ci, 0, 0); sx.putImageData(si, 0, 0);
  return { cloud, shadow, w: W, h: H };
}
