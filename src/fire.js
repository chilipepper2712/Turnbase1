// Lửa rừng (hỏa công): trạng thái thuần, không DOM/Pixi.
//   s.fires = [{ x, y, until }]  ô rừng đang cháy, cháy tới đầu lượt `until` thì tàn thành rừng cháy ('burnt' = đồng bằng)
// Lan: mỗi lượt (đầu lượt người), mỗi đám cháy có FIRE.spread khả năng bén sang ô rừng kề theo chiều gió.
// Mưa: đám cháy nằm dưới mây đang mưa thì tắt ngay, ô đó vẫn là rừng.
// Sát thương do lửa (quân đứng trong ô cháy) nằm ở rules.js vì cần các hàm trừ quân / tháo chạy ở đó.
import { FIRE } from './config.js';
import { makeRng } from './rng.js';
import { WIND_DIRS, cloudCovers } from './weather.js';

export const fireAt = (s, x, y) => !!s.fires && s.fires.some((f) => f.x === x && f.y === y);

// ô (x,y) đang có mưa trên đầu không
export function rainingAt(s, x, y) {
  return !!s.weather && s.weather.clouds.some((c) => c.raining && cloudCovers(c, x, y));
}

export function startFire(s, x, y) {
  if (!s.fires) s.fires = [];
  if (fireAt(s, x, y)) return false;
  s.fires.push({ x, y, until: s.turn + FIRE.burnTurns });
  return true;
}

// Gọi mỗi lần đổi phe, sau thời tiết. Trả { events, ignited: [{x,y}] } (ô vừa bén lửa để rules trừ quân đứng trong đó).
export function stepFire(s) {
  const events = [], ignited = [];
  if (!s.fires || !s.fires.length) return { events, ignited };
  const { w, h } = s.map;
  // 1. mưa dập lửa
  const keep = [];
  for (const f of s.fires) {
    if (rainingAt(s, f.x, f.y)) events.push({ type: 'fireout', x: f.x, y: f.y, rain: true });
    else keep.push(f);
  }
  s.fires = keep;
  if (s.current !== 'human') return { events, ignited };
  // 2. lan theo gió (mỗi lượt một lần), 3. tàn lửa: rừng thành rừng cháy
  const rng = makeRng(((s.map.seed || 1) * 40503 + s.turn * 7717 + 13) >>> 0);
  const wind = s.weather ? s.weather.wind : null;
  if (wind !== null) {
    const [dx, dy] = WIND_DIRS[wind];
    for (const f of [...s.fires]) {
      const x = f.x + dx, y = f.y + dy;
      if (x < 0 || y < 0 || x >= w || y >= h || s.map.tiles[y * w + x] !== 'forest' || fireAt(s, x, y)) continue;
      if (rainingAt(s, x, y) || rng() >= FIRE.spread) continue;
      startFire(s, x, y);
      ignited.push({ x, y });
      events.push({ type: 'fire', x, y, spread: true, from: { x: f.x, y: f.y } });
    }
  }
  const changes = [], left = [];
  for (const f of s.fires) {
    if (s.turn >= f.until) {
      s.map.tiles[f.y * w + f.x] = 'burnt';
      events.push({ type: 'fireout', x: f.x, y: f.y });
      changes.push({ x: f.x, y: f.y, to: 'burnt' });
    } else left.push(f);
  }
  s.fires = left;
  if (changes.length) events.push({ type: 'terrain', changes });
  return { events, ignited };
}
