// Nền ô kiểu pixel art: mảng màu phẳng theo địa hình, biến thiên nhẹ theo khối, chuyển tiếp giữa hai loại đất bằng
// dither theo lưới pixel (không đọc lại ô kế bên từ chunk khác: mọi thứ tính từ toạ độ thế giới nên các chunk khớp nhau).
// Vật thể (cây, đá, cỏ...) đặt riêng bằng sprite, xem placeDeco.
import { hash2 } from '../rng.js';

const BLK = 2;          // một "pixel nền" = 2 đơn vị thế giới (cùng cỡ với pixel của sprite quân nhân ~0.6-1.6 lần)
const H = (a, b, c = 0) => hash2(0x51f15e + c * 977, a, b);

export const PIXEL_GROUND = {
  plain: [121, 170, 84], field: [158, 176, 86], forest: [84, 136, 66], hill: [140, 168, 88],
  mountain: [140, 128, 112], peak: [124, 118, 114], swamp: [96, 112, 70], burnt: [92, 88, 70],
  river: [86, 140, 176], bridge: [86, 140, 176],
  village: [176, 160, 120], mine: [140, 128, 112], fort: [150, 142, 124], stronghold: [150, 140, 120],
};
const SHORE_WATER = [48, 92, 124], SHORE_LAND = [206, 192, 146], WAVE = [150, 192, 216];
const isWater = (t) => t === 'river' || t === 'bridge';

// nhiễu giá trị mượt (nội suy hai chiều) để vũng bùn thành mảng liền, không thành ô vuông rời rạc
const vnoise = (x, y, c) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = H(xi, yi, c), b = H(xi + 1, yi, c), c2 = H(xi, yi + 1, c), d = H(xi + 1, yi + 1, c);
  return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
};
const SWAMP_BASE = [96, 112, 70], SWAMP_MUD = [80, 95, 59], SWAMP_LIGHT = [108, 126, 80], SWAMP_FLECK = [128, 150, 100];

// Vẽ nền cả chunk vào ctx (chưa scale). tid(x,y) trả id địa hình hoặc null ngoài bản đồ.
export function paintPixelGround(ctx, o) {
  const { tid, i0, j0, i1, j1, minX, minY, TW, TH, RES, cw, ch } = o;
  const img = ctx.createImageData(cw, ch);
  const d = img.data;
  const cell = BLK * RES;
  const gx0 = Math.floor(minX / BLK), gx1 = Math.ceil((minX + cw / RES) / BLK);
  const gy0 = Math.floor(minY / BLK), gy1 = Math.ceil((minY + ch / RES) / BLK);

  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const wx = (gx + 0.5) * BLK, wy = (gy + 0.5) * BLK;
      const a = wx / (TW / 2), b = wy / (TH / 2);
      const x = (a + b) / 2, y = (b - a) / 2;
      const cx = Math.round(x), cy = Math.round(y);
      if (cx < i0 || cx >= i1 || cy < j0 || cy >= j1) continue;
      const t = tid(cx, cy);
      if (!t) continue;
      const fx = x - cx, fy = y - cy;
      const ax = Math.abs(fx), ay = Math.abs(fy);
      const dist = 0.5 - Math.max(ax, ay);                       // khoảng cách tới cạnh ô gần nhất
      const nt = ax >= ay ? tid(cx + (fx > 0 ? 1 : -1), cy) : tid(cx, cy + (fy > 0 ? 1 : -1));
      let terr = t;
      let col = null;
      let swamp = false, fine = null;

      if (nt && nt !== t) {
        if (isWater(t) !== isWater(nt)) {
          // bờ nước: viền cứng, một dải mảnh hai bên
          if (dist < 0.055) col = isWater(t) ? SHORE_WATER : SHORE_LAND;
        } else {
          const band = 0.2, p = 0.5 * (1 - Math.min(1, dist / band));
          if (dist < band && H(gx, gy, 1) < p) terr = nt;
        }
      }
      if (!col) {
        const base = PIXEL_GROUND[terr] || PIXEL_GROUND.plain;
        const v = (H(Math.floor(gx / 3), Math.floor(gy / 3), 2) - 0.5) * 12;   // biến thiên nhẹ theo khối 3x3
        col = [base[0] + v, base[1] + v, base[2] + v];

        if (terr === 'field' && ax < 0.38 && ay < 0.45) {
          // luống cày chạy dọc trục x của ô
          const s = ((fy + 0.5) * 7) % 1;
          if (s < 0.28) col = [col[0] - 26, col[1] - 20, col[2] - 12];
        } else if (terr === 'burnt') {
          // rừng cháy: đất tro loang lổ, vài đốm than đen và mầm cỏ mới
          const n = H(Math.floor(gx / 2), Math.floor(gy / 2), 8);
          if (n < 0.18) col = [58, 54, 48]; else if (n > 0.9) col = [116, 150, 78];
        } else if (terr === 'swamp') {
          swamp = true;     // vẽ từng điểm 1px bên dưới
        } else if (terr === 'plain') {
          fine = col;       // cỏ đồng bằng: hạt nhuyễn hơn, vẽ từng điểm 1 đơn vị thế giới bên dưới
        } else if (isWater(terr)) {
          if (H(Math.floor(gx / 2), gy, 4) < 0.05) col = WAVE;
        }
        if (t === 'bridge' && terr === 'bridge') {
          const wAlongX = tid(cx + 1, cy) === 'river' || tid(cx - 1, cy) === 'river';
          const wAlongY = tid(cx, cy + 1) === 'river' || tid(cx, cy - 1) === 'river';
          const alongY = wAlongX || !wAlongY;
          const across = Math.abs(alongY ? fx : fy), along = alongY ? fy : fx;
          if (across < 0.27) {
            col = Math.floor((along + 0.5) * 8) % 2 ? [176, 128, 78] : [158, 112, 66];
            if (across > 0.235) col = [88, 56, 36];
          }
        }
      }
      if (swamp) {
        // đầm lầy: tính màu cho từng điểm 1 đơn vị thế giới (mịn gấp đôi nền thường), mảng bùn liền khối + vài đốm tảo
        const sub = RES;
        for (let sy = 0; sy < BLK; sy++) for (let sx = 0; sx < BLK; sx++) {
          const sxw = gx * BLK + sx, syw = gy * BLK + sy;
          const n = 0.65 * vnoise(sxw / 6, syw / 6, 5) + 0.35 * vnoise(sxw / 2.4, syw / 2.4, 6);
          let c3 = n < 0.42 ? SWAMP_MUD : n > 0.66 ? SWAMP_LIGHT : SWAMP_BASE;
          if (H(sxw, syw, 7) < 0.012 && n >= 0.42) c3 = SWAMP_FLECK;
          const ppx = Math.round((sxw - minX) * RES), ppy = Math.round((syw - minY) * RES);
          for (let yy = 0; yy < sub; yy++) {
            const row = ppy + yy;
            if (row < 0 || row >= ch) continue;
            for (let xx = 0; xx < sub; xx++) {
              const colx = ppx + xx;
              if (colx < 0 || colx >= cw) continue;
              const k = (row * cw + colx) * 4;
              d[k] = c3[0]; d[k + 1] = c3[1]; d[k + 2] = c3[2]; d[k + 3] = 255;
            }
          }
        }
        continue;
      }
      if (fine) {
        // đồng bằng: nền theo khối như cũ + hạt cỏ 1 đơn vị (mịn gấp đôi), thỉnh thoảng một chấm sáng / tối
        const sub = RES;
        for (let sy = 0; sy < BLK; sy++) for (let sx = 0; sx < BLK; sx++) {
          const sxw = gx * BLK + sx, syw = gy * BLK + sy;
          const hv = H(sxw, syw, 11), fv = (hv - 0.5) * 9;
          let c3 = [fine[0] + fv, fine[1] + fv, fine[2] + fv * 0.6];
          const sp = H(sxw, syw, 12);
          if (sp < 0.025) c3 = [fine[0] + 22, fine[1] + 24, fine[2] + 8];
          else if (sp > 0.975) c3 = [fine[0] - 22, fine[1] - 18, fine[2] - 10];
          const r = Math.max(0, Math.min(255, c3[0])), g = Math.max(0, Math.min(255, c3[1])), bl = Math.max(0, Math.min(255, c3[2]));
          const ppx = Math.round((sxw - minX) * RES), ppy = Math.round((syw - minY) * RES);
          for (let yy = 0; yy < sub; yy++) {
            const row = ppy + yy;
            if (row < 0 || row >= ch) continue;
            for (let xx = 0; xx < sub; xx++) {
              const colx = ppx + xx;
              if (colx < 0 || colx >= cw) continue;
              const k = (row * cw + colx) * 4;
              d[k] = r; d[k + 1] = g; d[k + 2] = bl; d[k + 3] = 255;
            }
          }
        }
        continue;
      }
      // ghi khối cell x cell
      const px = Math.round((gx * BLK - minX) * RES), py = Math.round((gy * BLK - minY) * RES);
      const r = Math.max(0, Math.min(255, col[0])), g = Math.max(0, Math.min(255, col[1])), bl = Math.max(0, Math.min(255, col[2]));
      for (let yy = 0; yy < cell; yy++) {
        const row = py + yy;
        if (row < 0 || row >= ch) continue;
        for (let xx = 0; xx < cell; xx++) {
          const colx = px + xx;
          if (colx < 0 || colx >= cw) continue;
          const k = (row * cw + colx) * 4;
          d[k] = r; d[k + 1] = g; d[k + 2] = bl; d[k + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
