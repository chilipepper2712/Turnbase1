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

// Địa hình. nat = phòng thủ thiên nhiên (%), str = phòng thủ công trình (%), mod = cộng/trừ phòng thủ cho mọi phe,
// atk = cộng/trừ sát thương cho quân đứng ở ô đó (thế cao / sa lầy).
export const TERRAIN = {
  plain:      { cost: 1, nat: 0,  str: 0 },
  field:      { cost: 1, nat: 0,  str: 0 },            // đất cày: như đồng bằng
  forest:     { cost: 2, nat: 15, str: 0 },
  hill:       { cost: 2, nat: 20, str: 0, atk: 8, rangeBonus: 1 },
  mountain:   { cost: 3, nat: 30, str: 0, atk: 12, noCavalry: true },   // núi thấp: đi được
  peak:       { cost: Infinity, nat: 0, str: 0 },                       // núi cao: không leo, không vượt, phải đi vòng
  swamp:      { cost: 3, nat: 0,  str: 0, mod: -10, atk: -10, noCavalry: true },  // đầm lầy: bất lợi cho mọi phe
  river:      { cost: Infinity, nat: 0, str: 0 },
  bridge:     { cost: 1, nat: 0,  str: 0 },
  village:    { cost: 1, nat: 0,  str: 15, heal: true },
  mine:       { cost: 1, nat: 0,  str: 20 },            // hầm mỏ: chỉ là địa hình ở bản test
  fort:       { cost: 1, nat: 0,  str: 25 },            // tháp / cứ điểm
  stronghold: { cost: 1, nat: 0,  str: 30 },            // thành
};

// Hạ trại phòng thủ: lượt ra lệnh chỉ chuẩn bị, bắt đầu từ đầu lượt sau của phe đó thì có hiệu lực.
// Mức cố định (không tăng theo thời gian); nhân với hệ số địa hình: ô cộng thủ nhiều thì mạnh hơn, ô trừ thủ thì yếu đi.
export const FORTIFY = { human: 15, orc: 12, scaleMin: 0.5, scaleMax: 1.6 };

// Kinh nghiệm và cấp bậc (có trần). Cấp = số mốc xp đã đạt.
export const LEVEL = {
  xp: [12, 30, 55],             // mốc lên cấp 1, 2, 3 (cấp tối đa 3)
  atkPerLevel: 0.08,            // +8% sát thương mỗi cấp
  defPerLevel: 4,               // +4% phòng thủ mỗi cấp
  perDamage: 1,                 // xp = sát thương gây ra
  kill: 4,                      // thưởng khi hạ một squad
  survive: 1,                   // xp khi bị đánh mà còn sống
};

// Ràng buộc khi sinh map, để không ra map toàn núi / toàn rừng / thành bị nhốt
export const MAPGEN = {
  maxPeakShare: 0.05,           // tỉ lệ núi cao (không đi được) tối đa trên toàn map
  maxRoughShare: 0.28,          // đồi + núi thấp + núi cao tối đa
  forestMin: 0.06, forestMax: 0.24,
  sideDiff: 0.12,               // chênh lệch tỉ lệ rừng / địa hình gồ ghề giữa hai phe tối đa
  minOpenNearHold: 26,          // số ô đi được trong tầm 8 điểm di chuyển quanh thành (chống bị nhốt)
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
    militia:  { atk: 4.2, def: 3,  move: 4, range: [1, 1] },
    infantry: { atk: 6.5, def: 20, move: 4, range: [1, 1] },
    archer:   { atk: 5.2, def: 6,  move: 4, range: [2, 3] },
    cavalry:  { atk: 7.4, def: 11, move: 7, range: [1, 1] },
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
