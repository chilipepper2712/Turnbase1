// Toàn bộ số liệu cân bằng nằm ở đây. Sửa số, không cần đụng logic.

export const CONFIG = {
  map: { w: 16, h: 20 },          // lưới vuông: w cột (x) × h hàng (y)
  maxStrength: 10,                // số "quân" tối đa của một squad
  captureTurns: 2,                // giữ thành địch bao nhiêu lượt thì thắng
  healVillage: 2,                 // hồi quân/lượt khi đứng trong làng
  healStronghold: 2,              // hồi quân/lượt khi đứng trong thành nhà
  flankBonus: 0.15,               // +15% sát thương mỗi đồng đội khác kề mục tiêu
  flankMax: 2,
  chargeBonus: 0.2,               // kỵ binh đi >= chargeDist ô thì +20%
  chargeDist: 3,
  defCap: 70,                     // giảm sát thương tối đa (%)
  moraleLoss: 1.0,                // mất morale = %quân mất * hệ số này
  moraleKill: 15,
  moraleHit: 5,
  moraleAllyDeath: 8,
  moraleRecoverCalm: 10,          // hồi morale đầu lượt nếu không có địch kề
  moraleRecoverEngaged: 3,
  routRecoverMargin: 15,          // morale phải vượt ngưỡng rout + số này mới tỉnh lại
  startMorale: 100,
};

// Địa hình. nat = phòng thủ thiên nhiên (%), str = phòng thủ công trình (%).
export const TERRAIN = {
  plain:      { cost: 1, nat: 0,  str: 0 },
  field:      { cost: 1, nat: 0,  str: 0 },            // đất cày: như đồng bằng
  forest:     { cost: 2, nat: 15, str: 0 },
  hill:       { cost: 2, nat: 20, str: 0, rangeBonus: 1 },
  mountain:   { cost: 3, nat: 30, str: 0, noCavalry: true },
  river:      { cost: Infinity, nat: 0, str: 0 },
  bridge:     { cost: 1, nat: 0,  str: 0 },
  village:    { cost: 1, nat: 0,  str: 15, heal: true },
  mine:       { cost: 1, nat: 0,  str: 20 },            // hầm mỏ: chỉ là địa hình ở bản test
  fort:       { cost: 1, nat: 0,  str: 25 },            // tháp / cứ điểm
  stronghold: { cost: 1, nat: 0,  str: 30 },            // thành
};

export const FACTIONS = {
  human: {
    id: 'human',
    natAffinity: 0.5,     // hưởng bao nhiêu % bonus địa hình thiên nhiên
    strAffinity: 1.0,     // hưởng bao nhiêu % bonus công trình
    natMoveDiscount: 0,   // giảm chi phí đi trên địa hình thiên nhiên
    formation: 6,         // % phòng thủ mỗi đồng đội kề (tối đa 3)
    routAt: 25,           // morale <= ngưỡng này thì tan vỡ
    fill: '#3a78d8',
    fillDark: '#2a5aa8',
  },
  orc: {
    id: 'orc',
    natAffinity: 1.0,
    strAffinity: 0.5,
    natMoveDiscount: 1,
    formation: 0,
    routAt: 45,
    fill: '#d8402f',
    fillDark: '#a52c20',
  },
};
export const FORMATION_MAX = 3;

// Chỉ số theo phe + vai trò. range = [tầm gần nhất, tầm xa nhất].
export const STATS = {
  human: {
    militia:  { atk: 4,   def: 0,  move: 3, range: [1, 1] },
    infantry: { atk: 6,   def: 20, move: 4, range: [1, 1] },
    archer:   { atk: 5,   def: 5,  move: 4, range: [2, 3] },
    cavalry:  { atk: 7,   def: 10, move: 7, range: [1, 1] },
  },
  orc: {
    militia:  { atk: 5,   def: 5,  move: 4, range: [1, 1] },
    infantry: { atk: 7.5, def: 22, move: 4, range: [1, 1] },
    archer:   { atk: 6,   def: 8,  move: 4, range: [2, 3] },
    cavalry:  { atk: 8.5, def: 12, move: 7, range: [1, 1] },
  },
};

// Hệ số khắc chế: MATCHUP[vai trò tấn công][vai trò phòng thủ]
export const MATCHUP = {
  militia:  { militia: 1.0, infantry: 0.8, archer: 1.1, cavalry: 1.5 }, // giáo chống kỵ
  infantry: { militia: 1.2, infantry: 1.0, archer: 1.2, cavalry: 0.9 },
  archer:   { militia: 1.2, infantry: 1.0, archer: 1.0, cavalry: 0.8 },
  cavalry:  { militia: 1.3, infantry: 0.9, archer: 1.4, cavalry: 1.0 },
};

// Giá trị tương đối của một squad (dùng cho AI)
export const UNIT_VALUE = { militia: 1, infantry: 2, archer: 2, cavalry: 2.5 };

// Đội hình xuất phát (theo thứ tự các ô spawn do mapgen sinh ra)
export const ROSTER = ['infantry', 'infantry', 'archer', 'archer', 'militia', 'militia', 'cavalry'];
