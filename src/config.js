// Toàn bộ số liệu cân bằng nằm ở đây. Sửa số, không cần đụng logic.

export const CONFIG = {
  map: { w: 16, h: 20 },          // cỡ mặc định (nhỏ). Lưới vuông: w cột (x) × h hàng (y)
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
  routRecoverMargin: 15,          // morale phải vượt ngưỡng rout + số này mới hồi tỉnh
  startMorale: 100,
  mergeXpBlend: 0.5,              // gộp squad: xp lệch về trung bình theo quân số bao nhiêu (1 = trung bình hẳn, 0 = giữ nguyên)
};

// Các mức sĩ khí. routAt (theo phe) là ngưỡng bỏ chạy. Với người chơi chỉ đổi chỉ số, không ép hành động.
//   hăng hái: sĩ khí > eagerAt · vững: ở giữa · dao động: <= routAt + waverMargin · bỏ chạy: <= routAt
// Orc routAt cao nên dải "vững" của Orc hẹp: dễ lên cao hứng, cũng dễ dao động (không kỷ luật).
export const MORALE = {
  eagerAt: 80, waverMargin: 20,
  eager: { atk: 0.05, def: 0 },
  wavering: { atk: -0.08, def: -3 },
  fleeHomeTurns: 2,        // thành nhà (hoặc trại) trong tầm bao nhiêu lượt đi thì chạy về đó
  fleeAllyRadius: 3,       // đồng đội không bỏ chạy trong bán kính này (kể cả phía trước) cũng là chỗ nương tựa
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
  burnt:      { cost: 1, nat: 0,  str: 0 },  // rừng cháy: như đồng bằng
  swamp:      { cost: 3, nat: 0,  str: 0, mod: -10, atk: -10, cavExtra: 1 },  // đầm lầy: bất lợi cho mọi phe; kỵ binh sa lầy, đi chậm hơn nữa
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
  xp: [18, 40, 70],             // mốc lên cấp 1, 2, 3 (cấp tối đa 3). Đo: ~3 squad/ván đạt cấp 1; cấp 3 chỉ đạt qua nhiều màn
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
    routAt: 25,           // morale <= ngưỡng này thì bỏ chạy
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
  // Âm binh: xác chiến binh người và Orc do một necromancer điều khiển. Không có sĩ khí, không bỏ chạy.
  undead: {
    id: 'undead',
    natAffinity: 0.5,
    strAffinity: 0.5,
    natMoveDiscount: 0,
    formation: 0,
    routAt: -1,
    noMorale: true,
    fill: '#7b5aa6',
    fillDark: '#553c78',
  },
};

// Âm binh: chỉ số = chỉ số lúc còn sống của phe gốc (người / Orc), sát thương giảm, chậm hơn 1 ô.
// Mỗi đạo âm binh có đúng một necromancer chỉ huy; necromancer chết thì cả đạo quân tan rã.
export const UNDEAD = {
  atkMul: 0.82,             // giảm 18% sát thương so với lúc sống
  moveLoss: 1,
  origins: ['human', 'orc'],  // squad thứ i lấy gốc origins[i % 2]
  extra: 2,                 // đạo âm binh đông hơn: thêm chừng này squad (xác thì không thiếu)
  // Mộ tử sĩ: quân phe sống bị tiêu diệt để lại mộ. Mộ trong bán kính của necromancer, đủ số lượt chờ
  // và ô trống thì tự trỗi dậy thành âm binh (cùng loại quân, gốc là phe đã chết) với một phần quân số.
  // Âm binh chết là tan hẳn, không để lại mộ. Phe sống "an táng tử sĩ" (mất lượt của squad) để chặn.
  raiseRadius: 12,          // Manhattan, tính từ necromancer: trong vùng này mộ dậy nhanh (raiseDelay)
  raiseDelay: 2,            // mộ đào ở lượt T thì trỗi dậy sớm nhất đầu lượt âm binh của lượt T + 2
  raiseDelayFar: 4,         // ngoài vùng ếm của necromancer: cả bản đồ bị ếm, mộ chậm hơn (T + 4)
  raiseStrength: 0.5,       // phần quân số khi trỗi dậy (của maxStrength)
};
export const FORMATION_MAX = 3;

// Chỉ số theo phe + vai trò. range = [tầm gần nhất, tầm xa nhất].
export const STATS = {
  human: {
    militia:  { atk: 4,   def: 0,  move: 3, range: [1, 1] },
    infantry: { atk: 6,   def: 20, move: 4, range: [1, 1] },
    archer:   { atk: 5,   def: 5,  move: 4, range: [2, 3] },
    cavalry:  { atk: 7,   def: 10, move: 7, range: [1, 1] },
    objective: { atk: 0,  def: 25, move: 0, range: [1, 1] },   // trại trong nhiệm vụ phá trại: đứng yên, không đánh trả
    marine:   { atk: 4,   def: 0,  move: 4, range: [1, 1] },   // thủy binh trên bộ: như dân quân, đi xa hơn 1 ô
    marineboat: { atk: 5, def: 5,  move: 4, range: [2, 3] },   // thủy binh trên thuyền: như cung thủ, chỉ đi trên sông hồ
  },
  orc: {
    militia:  { atk: 4.2, def: 3,  move: 4, range: [1, 1] },
    infantry: { atk: 6.5, def: 20, move: 4, range: [1, 1] },
    archer:   { atk: 5.2, def: 6,  move: 4, range: [2, 3] },
    cavalry:  { atk: 7.4, def: 11, move: 7, range: [1, 1] },
    objective: { atk: 0,  def: 25, move: 0, range: [1, 1] },
    goblin:   { atk: 3.6, def: 4,  move: 5, range: [1, 1] },   // toán goblin trong rừng: yếu, nhanh, ẩn mình
  },
  // âm binh thường lấy chỉ số từ phe gốc (xem UNDEAD); ở đây chỉ có những vai riêng của âm binh
  undead: {
    necromancer: { atk: 3.5, def: 10, move: 4, range: [2, 3] },   // phép thuật tầm xa yếu, thân mỏng
    objective: { atk: 0, def: 25, move: 0, range: [1, 1] },
  },
};

// Hệ số khắc chế: MATCHUP[vai trò tấn công][vai trò phòng thủ]
export const MATCHUP = {
  militia:  { militia: 1.0, infantry: 0.8, archer: 1.1, cavalry: 1.5, objective: 1.0, goblin: 1.1, necromancer: 1.2 }, // giáo chống kỵ
  infantry: { militia: 1.2, infantry: 1.0, archer: 1.2, cavalry: 0.9, objective: 1.0, goblin: 1.1, necromancer: 1.2 },
  archer:   { militia: 1.2, infantry: 1.0, archer: 1.0, cavalry: 0.8, objective: 0.6, goblin: 1.0, necromancer: 1.2 },
  cavalry:  { militia: 1.3, infantry: 0.9, archer: 1.4, cavalry: 1.0, objective: 0.6, goblin: 1.0, necromancer: 1.4 },
  objective: { militia: 1, infantry: 1, archer: 1, cavalry: 1, objective: 1, goblin: 1, necromancer: 1 },
  goblin:   { militia: 1.1, infantry: 0.9, archer: 1.3, cavalry: 0.9, objective: 0.5, goblin: 1.0, necromancer: 1.2 },  // đánh lén cung thủ tốt
  necromancer: { militia: 1.1, infantry: 1.0, archer: 1.0, cavalry: 1.0, objective: 0.5, goblin: 1.0, necromancer: 1.0 },
};

// Giá trị tương đối của một squad (dùng cho AI)
export const UNIT_VALUE = { militia: 1, infantry: 2, archer: 2, cavalry: 2.5, objective: 3, goblin: 1, necromancer: 3, marine: 1.5 };

// Thủy binh (phe người): chặt cây (1 lượt) rồi hạ thủy (1 lượt) thành cung thủ trên sông hồ.
//   Lên bờ thì bỏ thuyền lại ở ô nước sát bờ; đi vào ô có thuyền của phe mình thì xuống thuyền lại.
//   Thuyền không qua gầm cầu; địch không dùng, không phá được thuyền. Bản đồ ít nước thì không có thủy binh.
export const MARINE = {
  minWater: 6,              // bản đồ cần ít nhất chừng này ô nước mới cho thủy binh ra trận
  rosterSlot: 5,            // vị trí trong ROSTER đổi thành thủy binh (dân quân thứ hai): ít như kỵ binh
};

// Toán goblin (thuộc phe Orc): đặt lúc sinh bản đồ trong các cụm rừng lớn, ẩn mình cho tới khi tấn công.
//   Quân người đi vào ô kề chỗ goblin ẩn thì bị chặn lại và bị phục kích (đòn bất ngờ: không bị đánh trả).
//   Squad Orc gần goblin hồi thêm quân mỗi lượt.
//   Goblin không tính vào việc quét sạch quân (là quân phụ).
export const GOBLIN = {
  strength: 5,              // quân số mỗi toán lúc xuất hiện
  minCluster: 4,            // cụm rừng tối thiểu bao nhiêu ô mới có goblin
  maxBands: 4,              // trần số toán mỗi bản đồ (cỡ nhỏ 2, vừa 3, lớn 4)
  minHoldDist: 5,           // không đặt gần thành của bất kỳ phe nào hơn số ô này
  healRadius: 2, heal: 1,   // squad Orc trong bán kính này hồi thêm quân mỗi lượt (không cộng dồn nhiều toán)
  hideRadius: 2,            // cuối lượt Orc: goblin đứng trong rừng và không có quân người trong tầm này thì ẩn lại
};

// Đội hình xuất phát (theo thứ tự các ô spawn do mapgen sinh ra)
// Cỡ bản đồ người chơi chọn. Khung chữ nhật dọc. Quân, làng, tháp, mỏ tăng theo diện tích.
export const MAP_SIZES = {
  small:  { w: 16, h: 20 },
  medium: { w: 22, h: 28 },
  large:  { w: 26, h: 36 },
};
export const BASE_AREA = 16 * 20;
export const mapScale = (w, h) => (w * h) / BASE_AREA;
// Số squad mỗi bên theo diện tích: 7 / 16 / 28
export const armySize = (w, h) => Math.max(7, Math.round(7 * mapScale(w, h)));

// Loại nhiệm vụ. skirmish = giao tranh (chiếm thành hoặc tiêu diệt). Số lượt tính theo "lượt" hiện trên HUD (cả hai phe đã đi).
//   hold:    bên người giữ thành tới hết N lượt; địch đông hơn và có tiếp viện. Ai chiếm được thành đối phương 2 lượt cũng thắng.
//   destroy: trại của MỖI bên (thay thành) là mục tiêu có máu; phá trại địch trước thì thắng. Quân sát trại nhà hồi quân. Không chiếm đóng, không hạn giờ.
//   escort:  không có thành, quân xuất hiện giữa map; đưa tướng tới điểm rút, hoặc hạ tướng địch. Không hạn giờ.
// waves: đợt tiếp viện. at = lượt (tính ở bản nhỏ, co giãn theo số lượt), n = số squad, side = 'attacker' (bên tấn công) hoặc 'defender'.
export const MISSIONS = {
  skirmish: {},
  // flank: đợt tiếp viện của bên tấn công xuất hiện ở mép bản đồ, bên hông thành phòng thủ (có cờ báo trước từ đầu trận)
  // flankFor: phe tấn công nào dùng tiếp viện bọc sườn; phe khác giữ đợt thường (xuất hiện quanh thành nhà, at/n gốc)
  // slowTurns: phe chậm (âm binh −1 ô) cần thêm lượt khi bản đồ dài hơn bản nhỏ: + round((h − 20) × hệ số)
  hold:    { turns: 12, extra: 1, flankMinDist: 5, flankRows: 4, flankFor: ['undead'], slowTurns: { undead: 0.4 },
             waves: [{ at: 5, n: 1, side: 'attacker', flank: { at: 4, n: 2 } }, { at: 9, n: 1, side: 'attacker', flank: { at: 7, n: 2 } }, { at: 7, n: 1, side: 'defender' }] },
  destroy: {},
  escort:  {},
};

export const ROSTER = ['infantry', 'infantry', 'archer', 'archer', 'militia', 'militia', 'cavalry'];

// Thời tiết (mỗi lần đổi phe là một bước). Ngẫu nhiên nhưng gieo theo seed + lượt nên tái lập được.
export const WEATHER = {
  windChange: 0.04,         // xác suất gió xoay 45° mỗi bước
  tilesPerBigCloud: 110,    // mật độ mây đen lớn (bản nhỏ 320 ô ~ 3 đám)
  smallPerBig: 1,           // số mây nhỏ so với mây lớn
  bigRadius: 2.2, smallRadius: 1.2,   // bán kính phủ (ô)
  bigSpeed: 1, smallSpeed: 1.4,       // ô mỗi bước
  margin: 3,                // mây xuất hiện / tan ngoài mép bản đồ bao nhiêu ô
  spawnChance: 0.5,         // thiếu mây thì mỗi bước có chừng này khả năng có đám mới từ mép đầu gió
  rainStart: 0.17, rainStop: 0.45,    // mây lớn bắt đầu / tạnh mưa mỗi bước (~27% số mây lớn đang mưa, mỗi trận ~1 lượt)
  swampChance: 0.15,        // mỗi ô đồng bằng dưới mưa: khả năng thành đầm lầy
  swampTurns: 2,            // đầm lầy do mưa giữ bao nhiêu lượt rồi khô lại
};

// Hỏa công: chỉ cung thủ quân người, đốt ô rừng trong tầm bắn
export const FIRE = {
  burnTurns: 2,     // cháy bao nhiêu lượt rồi tàn thành rừng cháy (= đồng bằng)
  spread: 0.12,     // mỗi lượt, khả năng bén sang ô rừng kề theo chiều gió
  damage: 1,        // quân mất mỗi lượt khi đứng trong ô cháy (và lúc ô vừa bén lửa)
  cooldown: 3,      // cung thủ đã dùng hỏa công phải chờ bao nhiêu lượt mới dùng lại
};

// Sương mù chiến tranh: tầm nhìn (ô, khoảng cách Manhattan)
export const FOG = {
  vision: 3,                // bộ binh, kỵ binh, dân quân...
  archer: 1,                // cung thủ nhìn xa hơn
  terrain: { hill: 1, fort: 1, mountain: 2 },   // đứng trên đồi / tháp canh / núi thấp
  campVision: 2,            // trại (nhiệm vụ phá trại)
  holdVision: 2,            // thành nhà
};
