// Thực thi một action của AI (composite: di chuyển rồi đánh/gộp/đứng yên) lên state.
import { moveUnit, attackUnit, waitUnit, mergeUnits, fortifyUnit, buryGrave, igniteForest } from './rules.js';

export function executeAction(s, a) {
  const u = s.units.find((x) => x.id === a.unit.id);
  if (!u) return [];
  let events = [];
  if (a.fortify) return fortifyUnit(s, u) || waitUnit(s, u);
  if (a.merge) {
    const tgt = s.units.find((x) => x.id === a.merge.id);
    return tgt ? (mergeUnits(s, u, tgt) || waitUnit(s, u)) : waitUnit(s, u);
  }
  if (a.to.x !== u.x || a.to.y !== u.y) {
    const ev = moveUnit(s, u, a.to.x, a.to.y);
    if (!ev) return waitUnit(s, u);
    events = events.concat(ev);
    // bị phục kích giữa đường: kế hoạch cũ không còn đúng, dừng ở đó
    if (!s.units.includes(u)) return events;
    if (u.x !== a.to.x || u.y !== a.to.y) return events.concat(waitUnit(s, u));
  } else {
    u.moved = true;
  }
  if (a.bury) return events.concat(buryGrave(s, u) || waitUnit(s, u));
  if (a.ignite) return events.concat(igniteForest(s, u, a.ignite.x, a.ignite.y) || waitUnit(s, u));
  if (a.target) {
    const t = s.units.find((x) => x.id === a.target.id);
    if (t) return events.concat(attackUnit(s, u, t));
  }
  return events.concat(waitUnit(s, u));
}
