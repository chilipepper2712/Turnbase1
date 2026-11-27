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
  if (!s.fog) { for (const u of s.units) { u.fogged = false; u.veiled = false; } s.memory = null; return; }
  const masks = {};
  for (const f of s.sides) masks[f] = seenMask(s, f);
  remember(s, masks);
  for (const u of s.units) {
    const foe = s.sides[0] === u.faction ? s.sides[1] : s.sides[0];
    const m = masks[foe];
    if (u.static) { u.fogged = false; u.veiled = false; continue; }
    u.fogged = !u.spotted && !m[u.y * s.map.w + u.x];
    u.veiled = !u.fogged && !u.exposed && !u.hidden && u.faction === 'orc' && u.role !== 'goblin' && tid(s, u.x, u.y) === 'forest';
  }
}

// Trí nhớ của từng phe (để AI chơi công bằng dưới sương mù mà không "quên" ngay quân vừa khuất):
// s.memory[f][id] = bản chụp quân địch lúc f thấy nó lần cuối (vị trí, loại, quân số), kèm lượt thấy (seen).
// Xoá khi quân đó chết, khi f nhìn lại chỗ cũ mà không còn ai, hoặc khi quá FOG.memoryTurns lượt.
function remember(s, masks) {
  s.memory ||= {};
  const w = s.map.w, alive = new Set(s.units.map((u) => u.id));
  for (const f of s.sides) {
    const mem = (s.memory[f] ||= {}), m = masks[f];
    for (const r of Object.values(mem)) r.live = false;
    for (const e of s.units) {
      if (e.faction === f || e.static || e.hidden || !(e.spotted || m[e.y * w + e.x])) continue;
      const { id, faction, role, origin, strength, x, y, status, morale, xp, fort, afloat, vip } = e;
      mem[id] = { id, faction, role, origin, strength, x, y, status, morale, xp, fort, afloat, vip, seen: s.turn, live: true };
    }
    for (const id of Object.keys(mem)) {
      const r = mem[id];
      if (r.live) continue;
      // chết rồi / quá lâu / nhìn lại chỗ cũ mà không còn thấy nó ở đó
      if (!alive.has(r.id) || s.turn - r.seen > FOG.memoryTurns || m[r.y * w + r.x]) delete mem[id];
    }
  }
}

// Quân địch phe f còn nhớ mà hiện không thấy (bóng ma để AI tính đường và mức đe doạ). age = số lượt từ lần thấy cuối.
export function rememberedFoes(s, f) {
  const mem = s.memory && s.memory[f];
  return mem ? Object.values(mem).filter((r) => !r.live).map((r) => ({ ...r, ghost: true, age: s.turn - r.seen })) : [];
}

// Quân u có lọt vào mắt phe f không (f thấy được ít nhất là bóng)
export const visibleTo = (u, f) => u.faction === f || (!u.hidden && !u.fogged);
// f nhận ra được u là quân gì
export const knownTo = (u, f) => u.faction === f || (visibleTo(u, f) && !u.veiled);
