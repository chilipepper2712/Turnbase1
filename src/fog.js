// Sương mù chiến tranh (logic thuần). Mỗi phe chỉ thấy quân địch trong tầm nhìn của quân mình; thành / trại hai phe
// luôn hiện. Quân Orc (trừ goblin, vốn có cơ chế ẩn riêng) đứng trong rừng mà chưa "lộ" thì chỉ thấy bóng đen
// không rõ là quân gì. Lộ ra khi đi, đánh hoặc bị đánh; hết lộ khi bắt đầu lượt mới của chính phe đó.
// Kết quả ghi thẳng lên quân (bên kia nhìn vào), vì mỗi trận chỉ có hai phe:
//   u.fogged = phe địch không thấy u      u.veiled = phe địch thấy có quân ở đó nhưng không biết là gì
// Gọi updateFog(s) sau mỗi thay đổi vị trí / phe (rules.js làm việc này ở cuối mỗi hành động).
import { FOG } from './config.js';

const tid = (s, x, y) => s.map.tiles[y * s.map.w + x];

// Tầm nhìn của một quân tại chỗ đang đứng
export function visionOf(s, u, x = u.x, y = u.y) {
  if (u.static) return FOG.campVision;
  let r = FOG.vision + (u.role === 'archer' ? FOG.archer : 0);
  r += FOG.terrain[tid(s, x, y)] || 0;
  return r;
}

// Mặt nạ ô phe f nhìn thấy (Uint8Array w*h, 1 = thấy)
export function seenMask(s, f) {
  const { w, h } = s.map, m = new Uint8Array(w * h);
  const mark = (cx, cy, r) => {
    for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
      const dy = Math.abs(y - cy);
      for (let x = Math.max(0, cx - (r - dy)); x <= Math.min(w - 1, cx + (r - dy)); x++) m[y * w + x] = 1;
    }
  };
  for (const u of s.units) if (u.faction === f) mark(u.x, u.y, visionOf(s, u));
  const own = s.map.strongholds[f];
  if (own) mark(own.x, own.y, FOG.holdVision);
  // thành hai phe luôn hiện
  for (const k of Object.keys(s.map.strongholds)) { const p = s.map.strongholds[k]; if (p) m[p.y * w + p.x] = 1; }
  return m;
}

export function updateFog(s) {
  if (!s.fog) { for (const u of s.units) { u.fogged = false; u.veiled = false; } return; }
  const masks = {};
  for (const f of s.sides) masks[f] = seenMask(s, f);
  for (const u of s.units) {
    const foe = s.sides[0] === u.faction ? s.sides[1] : s.sides[0];
    const m = masks[foe];
    if (u.static) { u.fogged = false; u.veiled = false; continue; }
    u.fogged = !u.spotted && !m[u.y * s.map.w + u.x];
    u.veiled = !u.fogged && !u.exposed && !u.hidden && u.faction === 'orc' && u.role !== 'goblin' && tid(s, u.x, u.y) === 'forest';
  }
}

// Quân u có lọt vào mắt phe f không (f thấy được ít nhất là bóng)
export const visibleTo = (u, f) => u.faction === f || (!u.hidden && !u.fogged);
// f nhận ra được u là quân gì
export const knownTo = (u, f) => u.faction === f || (visibleTo(u, f) && !u.veiled);
