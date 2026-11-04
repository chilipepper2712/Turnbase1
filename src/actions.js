// Thực thi một action của AI (composite: di chuyển rồi đánh/gộp/đứng yên) lên state.
import { moveUnit, attackUnit, waitUnit, mergeUnits, unitAt } from './rules.js';

export function executeAction(s, a) {
  const u = s.units.find((x) => x.id === a.unit.id);
  if (!u) return [];
  let events = [];
  if (a.merge) {
    const tgt = s.units.find((x) => x.id === a.merge.id);
    return tgt ? (mergeUnits(s, u, tgt) || waitUnit(s, u)) : waitUnit(s, u);
  }
  if (a.to.x !== u.x || a.to.y !== u.y) {
    const ev = moveUnit(s, u, a.to.x, a.to.y);
    if (!ev) return waitUnit(s, u);
    events = events.concat(ev);
  } else {
    u.moved = true;
  }
  if (a.target) {
    const t = s.units.find((x) => x.id === a.target.id);
    if (t) return events.concat(attackUnit(s, u, t));
  }
  return events.concat(waitUnit(s, u));
}
