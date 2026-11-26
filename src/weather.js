// Thời tiết: gió, mây đen, mưa, đầm lầy tạm thời. Logic thuần (không DOM/Pixi), mọi thay đổi trả về sự kiện.
// Ngẫu nhiên nhưng tái lập được: mỗi lần tung dùng RNG gieo từ seed bản đồ + số lượt + phe, nên lưu / tải
// hay chơi lại cùng seed đều ra cùng thời tiết. Không báo trước đường mây: người chơi nhìn mây mà đoán.
//   s.weather = { wind: chỉ số hướng (0..7), clouds: [{ id, x, y, size: 'big'|'small', raining }], wet: [{ x, y, until }], nextId }
import { WEATHER } from './config.js';
import { makeRng } from './rng.js';

// 8 hướng gió theo ô (x sang phải, y xuống dưới). Chỉ số tăng = xoay theo chiều kim đồng hồ 45°.
export const WIND_DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
export const windVec = (w) => { const [dx, dy] = WIND_DIRS[((w % 8) + 8) % 8]; const n = Math.hypot(dx, dy); return { x: dx / n, y: dy / n }; };

const seedOf = (s, salt) => ((s.map.seed || 1) * 2654435761 + s.turn * 97 + (s.current === 'human' ? 1 : 2) * 7919 + salt * 31337) >>> 0;
const radius = (c) => (c.size === 'big' ? WEATHER.bigRadius : WEATHER.smallRadius);
const area = (s) => s.map.w * s.map.h;
const bigTarget = (s) => Math.max(1, Math.round(area(s) / WEATHER.tilesPerBigCloud));

// Ô nằm dưới mây (đo theo tâm ô, hình tròn trên lưới ô)
export function cloudCovers(c, x, y) { const r = radius(c); return (x - c.x) ** 2 + (y - c.y) ** 2 <= r * r; }

// Điểm xuất hiện ở mép phía gió thổi tới (ngoài bản đồ một chút) để mây trôi vào
function upwindSpot(s, rng) {
  const v = windVec(s.weather.wind), { w, h } = s.map, m = WEATHER.margin;
  // chọn mép theo thành phần gió lớn hơn, toạ độ dọc mép ngẫu nhiên
  if (Math.abs(v.x) >= Math.abs(v.y)) return { x: v.x > 0 ? -m : w - 1 + m, y: rng() * h };
  return { x: rng() * w, y: v.y > 0 ? -m : h - 1 + m };
}

function addCloud(s, size, at) {
  const c = { id: s.weather.nextId++, x: at.x, y: at.y, size, raining: false };
  s.weather.clouds.push(c);
  return c;
}

// Khởi tạo đầu trận: gió + vài đám mây rải trên bản đồ
export function initWeather(s) {
  const rng = makeRng(seedOf(s, 1));
  s.weather = { wind: rng.int(8), clouds: [], wet: [], nextId: 1 };
  const { w, h } = s.map;
  for (let i = 0; i < bigTarget(s); i++) addCloud(s, 'big', { x: rng() * w, y: rng() * h });
  for (let i = 0; i < Math.round(bigTarget(s) * WEATHER.smallPerBig); i++) addCloud(s, 'small', { x: rng() * w, y: rng() * h });
  return s.weather;
}

// Mỗi lần đổi phe (đầu lượt của phe mới): gió có thể xoay, mây trôi, mây lớn đổ hoặc tạnh mưa,
// mưa có thể biến đồng bằng thành đầm lầy tạm thời; đầm lầy hết hạn thì khô lại.
export function stepWeather(s) {
  const W = s.weather;
  if (!W) return [];
  const ev = [], rng = makeRng(seedOf(s, 2));
  const changes = [];
  // 1. gió: hiếm khi đổi, đổi thì xoay 45°
  if (rng() < WEATHER.windChange) {
    W.wind = (W.wind + (rng() < 0.5 ? 1 : 7)) % 8;
    ev.push({ type: 'wind', wind: W.wind });
  }
  // 2. mây trôi theo gió (mây nhỏ nhanh hơn), ra khỏi bản đồ thì tan
  const v = windVec(W.wind), { w, h } = s.map, m = WEATHER.margin + 1;
  const moves = [];
  for (const c of W.clouds) {
    const sp = c.size === 'big' ? WEATHER.bigSpeed : WEATHER.smallSpeed;
    const from = { x: c.x, y: c.y };
    c.x += v.x * sp; c.y += v.y * sp;
    moves.push({ id: c.id, from, to: { x: c.x, y: c.y } });
  }
  W.clouds = W.clouds.filter((c) => c.x > -m - 1 && c.y > -m - 1 && c.x < w + m && c.y < h + m);
  // 3. mây mới từ mép đầu gió
  const bigs = W.clouds.filter((c) => c.size === 'big').length;
  if (bigs < bigTarget(s) && rng() < WEATHER.spawnChance) addCloud(s, 'big', upwindSpot(s, rng));
  const smalls = W.clouds.length - bigs;
  if (smalls < Math.round(bigTarget(s) * WEATHER.smallPerBig) && rng() < WEATHER.spawnChance) addCloud(s, 'small', upwindSpot(s, rng));
  if (moves.length) ev.push({ type: 'clouds', moves });
  // 4. đầm lầy hết hạn: khô lại thành đồng bằng (đầu lượt người = đầu một lượt mới)
  if (s.current === 'human') {
    const keep = [];
    for (const p of W.wet) {
      if (s.turn >= p.until) { s.map.tiles[p.y * w + p.x] = 'plain'; changes.push({ x: p.x, y: p.y, to: 'plain', dry: true }); } else keep.push(p);
    }
    W.wet = keep;
  }
  // 5. mưa: chỉ mây lớn; đang mưa thì có thể tạnh, đang khô thì có thể đổ mưa
  for (const c of W.clouds) {
    if (c.size !== 'big') continue;
    const was = c.raining;
    c.raining = was ? rng() >= WEATHER.rainStop : rng() < WEATHER.rainStart;
    if (c.raining !== was) ev.push({ type: c.raining ? 'rain' : 'rainstop', cloud: c.id });
    if (!c.raining) continue;
    const r = Math.ceil(radius(c));
    for (let y = Math.floor(c.y) - r; y <= Math.ceil(c.y) + r; y++) for (let x = Math.floor(c.x) - r; x <= Math.ceil(c.x) + r; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || !cloudCovers(c, x, y)) continue;
      if (s.map.tiles[y * w + x] !== 'plain' || rng() >= WEATHER.swampChance) continue;
      s.map.tiles[y * w + x] = 'swamp';
      W.wet.push({ x, y, until: s.turn + WEATHER.swampTurns });
      changes.push({ x, y, to: 'swamp', wet: true });
    }
  }
  if (changes.length) ev.push({ type: 'terrain', changes });
  return ev;
}

export const isWet = (s, x, y) => !!s.weather && s.weather.wet.some((p) => p.x === x && p.y === y);
